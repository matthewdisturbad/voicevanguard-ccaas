/**
 * VoiceVanguard CCaaS - Multi-Tenant Cloud Relay & Telemetry Hub
 * Roteamento em tempo real de telemetria, qualidade WebRTC e auditoria de chamadas.
 * Autor: David Paiva • TrustCo Technologies
 *
 * Configuração por variáveis de ambiente:
 *   PORT          Porta HTTP/WS (padrão 9090)
 *   TENANTS_JSON  Tenants e chaves (obrigatório em NODE_ENV=production). Formato:
 *                 {"TENANT-ID":{"name":"..","plan":"..","maxAgents":100,"active":true,
 *                               "agentKey":"<segredo>","supervisorKey":"<segredo>"}}
 *                 Torres (operações) opcionais dentro do tenant — ver docs/ROTEAMENTO_POR_TORRE.md:
 *                   "towers":{"FRAUDES":{"agentKey":"<segredo>"}},
 *                   "supervisors":[{"key":"<segredo>","name":"..","towers":["FRAUDES"]|"*"}]
 *   DATA_DIR      Diretório do histórico (padrão ./data_store; use um Volume em produção)
 *   TRUST_PROXY   "1" para usar X-Forwarded-For no rate limit (atrás do proxy do Railway)
 *   CORS_ORIGIN   Origem permitida para a API REST (padrão: nenhuma, same-origin)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 9090;
const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_HISTORY = 500;
const HEARTBEAT_MS = 30000;
const OFFLINE_TTL_MS = 24 * 60 * 60 * 1000;
const AUTH_WINDOW_MS = 60000;
const AUTH_MAX_FAILURES = 20;
const COMMAND_WHITELIST = new Set(['SAFE_CACHE_CLEAR']);
const CALL_CLASSES = new Set(['EXCELENTE', 'BOA', 'DEGRADADA', 'CRÍTICA']);
const AUDIO_ISSUES = new Set(['NONE', 'MIC_DESCONECTADO', 'MIC_MUDO_SISTEMA', 'SEM_AUDIO_RECEBIDO', 'SEM_AUDIO_ENVIADO']);
const PRECHECK_STATUS = new Set(['PRONTA', 'ATENCAO', 'NAO_PRONTA']);
const ITEM_STATUS = new Set(['ok', 'atencao', 'falha']);
const RECONNECT_GRACE_MS = 15000;
const MSG_WINDOW_MS = 1000;
const MSG_MAX_AGENT = 40;
const MSG_MAX_SUPERVISOR = 20;
const AGENT_RECORD_FACTOR = 4;
const PING_MAX_PER_WINDOW = 40;
const PING_WINDOW_MS = 10000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const TOWER_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

// ---------------------------------------------------------------------------
// Tenants e chaves (agente e supervisor possuem credenciais distintas)
// ---------------------------------------------------------------------------

// Somente desenvolvimento local. Nomes fictícios; NUNCA usados em produção.
function devTenants() {
    const base = [
        ['GENESYS-ALLIANCE-EVAL', 'Genesys AppFoundry Alliance Evaluation', 250, 'Enterprise Partner'],
        ['BPO-APEX-GLOBAL', 'Apex BPO Solutions', 500, 'Enterprise'],
        ['BPO-NEXUS-CORP', 'Nexus Contact Center', 1000, 'Enterprise'],
        ['BPO-STELLAR-CX', 'Stellar Customer Experience', 750, 'Enterprise']
    ];
    const out = {};
    for (const [id, name, maxAgents, plan] of base) {
        out[id] = { name, maxAgents, plan, active: true, agentKey: `dev-agent-${id}`, supervisorKey: `dev-supervisor-${id}` };
    }
    return out;
}

function loadTenants(env = process.env) {
    if (env.TENANTS_JSON) {
        let parsed;
        try { parsed = JSON.parse(env.TENANTS_JSON); } catch (e) { throw new Error('TENANTS_JSON inválido (JSON malformado).'); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('TENANTS_JSON deve ser um objeto JSON.');
        return parsed;
    }
    // Falha fechada: tenants de dev (chaves públicas no repositório) não sobem em produção
    // nem em plataforma gerenciada, mesmo que NODE_ENV tenha sido esquecido.
    if (env.NODE_ENV === 'production' || env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) {
        throw new Error('TENANTS_JSON é obrigatório em produção.');
    }
    console.warn('[Config] TENANTS_JSON ausente: usando tenants fictícios de DESENVOLVIMENTO.');
    return devTenants();
}

function sha256(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// hash(chave) -> { tenantId, role, tower, towers }. Lookup por hash em Map evita __proto__ e comparações diretas.
// Torre (operação): a própria operação define quem vai para a sua torre — a agentKey da torre
// (instalada via GPO/Intune nas PAs daquela OU) determina a torre; o agente nunca a escolhe.
// Tenants sem `towers` mantêm o modelo simples (agentKey/supervisorKey = todo o tenant).
function validKey(k) { return typeof k === 'string' && k.length >= 8; }

function buildKeyIndex(tenants) {
    const index = new Map();
    const meta = new Map();
    const addKey = (tenantId, key, entry) => {
        const h = sha256(key);
        if (index.has(h)) throw new Error(`Tenant ${tenantId}: chave duplicada na configuração.`);
        index.set(h, { tenantId, ...entry });
    };
    for (const [tenantId, t] of Object.entries(tenants)) {
        if (!TENANT_ID_PATTERN.test(tenantId) || !t || t.active === false) continue;
        const towerIds = t.towers && typeof t.towers === 'object' ? Object.keys(t.towers) : [];
        for (const id of towerIds) {
            if (!TOWER_ID_PATTERN.test(id)) throw new Error(`Tenant ${tenantId}: id de torre inválido: ${id}`);
            if (!t.towers[id] || !validKey(t.towers[id].agentKey)) throw new Error(`Tenant ${tenantId}/${id}: agentKey da torre deve ter ao menos 8 caracteres.`);
        }
        const hasLegacy = t.agentKey !== undefined || t.supervisorKey !== undefined || towerIds.length === 0;
        if (hasLegacy && (!validKey(t.agentKey) || !validKey(t.supervisorKey) || t.agentKey === t.supervisorKey)) {
            throw new Error(`Tenant ${tenantId}: agentKey e supervisorKey devem ser distintas e ter ao menos 8 caracteres.`);
        }
        const sups = Array.isArray(t.supervisors) ? t.supervisors : [];
        if (towerIds.length && !hasLegacy && sups.length === 0) {
            throw new Error(`Tenant ${tenantId}: defina ao menos um supervisor para as torres.`);
        }
        meta.set(tenantId, {
            name: String(t.name || tenantId),
            plan: String(t.plan || 'Standard'),
            maxAgents: Number.isFinite(t.maxAgents) && t.maxAgents > 0 ? t.maxAgents : 100,
            towers: towerIds
        });
        if (hasLegacy) {
            addKey(tenantId, t.agentKey, { role: 'agent', tower: null, towers: '*' });
            addKey(tenantId, t.supervisorKey, { role: 'supervisor', tower: null, towers: '*', supervisorName: 'Supervisor' });
        }
        for (const id of towerIds) addKey(tenantId, t.towers[id].agentKey, { role: 'agent', tower: id, towers: [id] });
        for (const sup of sups) {
            if (!sup || !validKey(sup.key)) throw new Error(`Tenant ${tenantId}: chave de supervisor deve ter ao menos 8 caracteres.`);
            const towers = sup.towers === '*' ? '*' : (Array.isArray(sup.towers) ? sup.towers : []);
            if (towers !== '*') {
                for (const id of towers) if (!towerIds.includes(id)) throw new Error(`Tenant ${tenantId}: supervisor referencia torre inexistente: ${id}`);
            }
            addKey(tenantId, sup.key, { role: 'supervisor', tower: null, towers, supervisorName: String(sup.name || 'Supervisor') });
        }
    }
    return { index, meta };
}

function canSee(ws, tower) {
    return ws.towers === '*' || ws.towers.includes(tower);
}

// ---------------------------------------------------------------------------
// Rate limit simples (falhas de autenticação por IP)
// ---------------------------------------------------------------------------

const authFailures = new Map(); // ip -> [timestamps]
const AUTH_MAX_IPS = 5000;
const AUTH_TIMEOUT_MS = 5000;

function clientIp(req) {
    if (process.env.TRUST_PROXY === '1') {
        const fwd = req.headers['x-forwarded-for'];
        // O proxy da plataforma acrescenta o IP real ao FINAL da lista; os itens anteriores são controlados pelo cliente.
        if (fwd) {
            const parts = String(fwd).split(',').map(x => x.trim()).filter(Boolean);
            if (parts.length) return parts[parts.length - 1];
        }
    }
    return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
    const prev = authFailures.get(ip);
    if (!prev) return false;
    const now = Date.now();
    const list = prev.filter(t => now - t < AUTH_WINDOW_MS);
    if (list.length === 0) {
        authFailures.delete(ip);
        return false;
    }
    authFailures.set(ip, list);
    return list.length >= AUTH_MAX_FAILURES;
}

function recordFailure(ip) {
    const now = Date.now();
    const list = (authFailures.get(ip) || []).filter(t => now - t < AUTH_WINDOW_MS);
    if (!authFailures.has(ip) && authFailures.size >= AUTH_MAX_IPS) {
        const oldestIp = authFailures.keys().next().value;
        if (oldestIp !== undefined) authFailures.delete(oldestIp);
    }
    list.push(now);
    authFailures.set(ip, list);
}

// ---------------------------------------------------------------------------
// Sanitização de entrada (dados controlados por agente nunca são confiáveis)
// ---------------------------------------------------------------------------

function str(v, max, fallback = '') {
    if (typeof v !== 'string' && typeof v !== 'number') return fallback;
    return String(v).slice(0, max);
}

function num(v, min, max, fallback = null) {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function oneOf(v, allowed, fallback) {
    return typeof v === 'string' && allowed.has(v) ? v : fallback;
}

function sanitizePrecheck(data) {
    const itens = Array.isArray(data.itens) ? data.itens.slice(0, 12).map(i => ({
        id: str(i && i.id, 32),
        status: oneOf(i && i.status, ITEM_STATUS, 'atencao'),
        valor: str(i && i.valor, 40),
        orientacao: str(i && i.orientacao, 200)
    })) : [];
    return {
        status: oneOf(data.status, PRECHECK_STATUS, 'ATENCAO'),
        itens,
        rttMs: num(data.rttMs, 0, 60000),
        jitterMs: num(data.jitterMs, 0, 60000),
        lossPct: num(data.lossPct, 0, 100),
        checkedAt: new Date().toISOString()
    };
}

// Latência de API por hostname (nunca URL/caminho/IDs). Limita hosts e valores.
function sanitizeApiLatency(data) {
    const hosts = Array.isArray(data.hosts) ? data.hosts.slice(0, 5).map(h => ({
        host: str(h && h.host, 100).replace(/[^A-Za-z0-9.-]/g, ''),
        count: num(h && h.count, 0, 1e6, 0),
        avgMs: num(h && h.avgMs, 0, 600000, 0),
        p95Ms: num(h && h.p95Ms, 0, 600000, 0),
        maxMs: num(h && h.maxMs, 0, 600000, 0),
        errors: num(h && h.errors, 0, 1e6, 0)
    })).filter(h => h.host) : [];
    return { hosts, janelaSeg: num(data.janelaSeg, 1, 3600, 30), updatedAt: new Date().toISOString() };
}

function isoOrNull(v) {
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------
// Persistência (assíncrona, atômica e com debounce)
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data_store');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { console.warn('[DataStore] Não foi possível criar', DATA_DIR, e.message); }

const pendingSaves = new Map(); // tenantId -> timer
const SAVE_DEBOUNCE_MS = 1000;

function historyFile(tenantId) {
    return path.join(DATA_DIR, `${tenantId}_history.json`);
}

function loadTenantHistory(tenantId) {
    const filePath = historyFile(tenantId);
    if (!fs.existsSync(filePath)) return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(parsed)) return parsed;
        throw new Error('formato inesperado');
    } catch (e) {
        // Preserva o arquivo suspeito em vez de sobrescrevê-lo na próxima gravação.
        const backup = `${filePath}.corrupt-${Date.now()}`;
        try { fs.renameSync(filePath, backup); } catch (_) {}
        console.error(`[DataStore] Histórico de ${tenantId} ilegível (${e.message}); preservado em ${path.basename(backup)}`);
        return [];
    }
}

async function writeHistoryNow(tenantId, history) {
    const filePath = historyFile(tenantId);
    const tmp = `${filePath}.${process.pid}.tmp`;
    try {
        await fs.promises.writeFile(tmp, JSON.stringify(history.slice(0, MAX_HISTORY)), 'utf8');
        await fs.promises.rename(tmp, filePath);
    } catch (e) {
        console.error(`[DataStore] Erro ao salvar histórico de ${tenantId}:`, e.message);
    }
}

function saveTenantHistory(tenantId, history) {
    if (pendingSaves.has(tenantId)) return;
    const timer = setTimeout(() => {
        pendingSaves.delete(tenantId);
        writeHistoryNow(tenantId, history);
    }, SAVE_DEBOUNCE_MS);
    timer.unref();
    pendingSaves.set(tenantId, timer);
}

async function flushAllSaves(rooms) {
    for (const [tenantId, timer] of pendingSaves) {
        clearTimeout(timer);
        pendingSaves.delete(tenantId);
        const room = rooms.get(tenantId);
        if (room) await writeHistoryNow(tenantId, room.callHistory);
    }
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const GENESYS_FRAME_ANCESTORS = "'self' https://*.pure.cloud https://*.mypurecloud.com https://*.mypurecloud.ie https://*.mypurecloud.de https://*.mypurecloud.jp https://*.mypurecloud.com.au https://*.niceincontact.com https://*.nice-incontact.com";

function computeScriptSrcDirective(pubDir) {
    const hashes = new Set();
    try {
        const files = fs.readdirSync(pubDir).filter(f => f.endsWith('.html'));
        for (const f of files) {
            const html = fs.readFileSync(path.join(pubDir, f), 'utf8');
            const re = /<script>([\s\S]*?)<\/script>/gi;
            let m;
            while ((m = re.exec(html)) !== null) {
                const raw = m[1];
                const lf = raw.replace(/\r\n/g, '\n');
                hashes.add(`'sha256-${crypto.createHash('sha256').update(lf, 'utf8').digest('base64')}'`);
                hashes.add(`'sha256-${crypto.createHash('sha256').update(raw, 'utf8').digest('base64')}'`);
            }
        }
    } catch (_) {}
    return hashes.size > 0 ? `script-src 'self' ${Array.from(hashes).join(' ')}` : "script-src 'self'";
}

const SCRIPT_SRC_DIRECTIVE = computeScriptSrcDirective(path.join(__dirname, 'public'));

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': [
        "default-src 'self'",
        SCRIPT_SRC_DIRECTIVE,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "base-uri 'none'"
    ].join('; ')
};

function createRelay() {
    const tenants = loadTenants();
    const { index: keyIndex, meta: tenantMeta } = buildKeyIndex(tenants);
    if (keyIndex.size === 0) throw new Error('Nenhum tenant ativo configurado.');

    // tenantId -> { supervisors: Set(ws), agents: Map(agentId, data), callHistory: [] }
    const tenantRooms = new Map();

    function getRoom(tenantId) {
        if (!tenantRooms.has(tenantId)) {
            tenantRooms.set(tenantId, {
                supervisors: new Set(),
                agents: new Map(),
                stations: new Map(), // agentId -> { station, operator, precheck, api, lastSeen }
                callHistory: loadTenantHistory(tenantId)
            });
        }
        return tenantRooms.get(tenantId);
    }

    // Registro de saúde da estação (pré-check e latência de API), separado da telemetria de voz
    function updateStation(room, meta, tower, agentId, base, patch) {
        const key = akey(tower, agentId);
        if (!room.stations.has(key) && room.stations.size >= meta.maxAgents * AGENT_RECORD_FACTOR) {
            const oldestKey = room.stations.keys().next().value;
            if (oldestKey !== undefined) room.stations.delete(oldestKey);
        }
        const prev = room.stations.get(key) || { agentId, precheck: null, api: null };
        let mergedPatch = { ...patch };
        if (patch.api && prev.api && Array.isArray(prev.api.hosts) && prev.api.updatedAt &&
            (Date.now() - new Date(prev.api.updatedAt).getTime() < 60000)) {
            const byHost = new Map();
            for (const h of prev.api.hosts) if (h && h.host) byHost.set(h.host, h);
            for (const h of patch.api.hosts) if (h && h.host) byHost.set(h.host, h);
            mergedPatch.api = {
                ...patch.api,
                hosts: Array.from(byHost.values()).slice(0, 5)
            };
        }
        const rec = {
            ...prev,
            tower,
            station: str(base.station, 64, prev.station || agentId),
            operator: str(base.operator, 64, prev.operator || 'Operador'),
            ...mergedPatch,
            lastSeen: new Date().toISOString()
        };
        room.stations.set(key, rec);
        return rec;
    }

    // Libera comandos enfileirados pelo In-Call Lock quando a chamada termina
    function flushPending(room, agentWs) {
        if (!agentWs.pendingCommands || agentWs.readyState !== WebSocket.OPEN) return;
        for (const command of agentWs.pendingCommands) {
            agentWs.send(JSON.stringify({ type: 'EXECUTE_COMMAND', command, origin: 'supervisor_remote_queued' }));
        }
        agentWs.pendingCommands.clear();
    }

    function lookupKey(key) {
        if (typeof key !== 'string' || key.length === 0 || key.length > 256) return null;
        return keyIndex.get(sha256(key)) || null;
    }

    // Entrega apenas aos supervisores que enxergam a torre do evento (dados guardados uma vez por tenant)
    function broadcast(room, obj, tower = null) {
        const msg = JSON.stringify(obj);
        for (const sup of room.supervisors) {
            if (sup.readyState === WebSocket.OPEN && canSee(sup, tower)) sup.send(msg);
        }
    }

    // Chave interna: PAs de torres diferentes podem repetir o agentId sem colidir
    const akey = (tower, agentId) => `${tower || ''}|${agentId}`;

    function sendJson(res, status, body, extraHeaders = {}) {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders });
        res.end(JSON.stringify(body));
    }

    const publicDir = path.join(__dirname, 'public');

    const server = http.createServer((req, res) => {
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
        if (process.env.CORS_ORIGIN) {
            res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN);
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-Key');
        }

        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }

        let url;
        try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); res.end(); return; }

        if (url.pathname === '/api/health') {
            sendJson(res, 200, {
                status: 'online',
                service: 'VoiceVanguard CCaaS Cloud Relay',
                registeredTenants: tenantMeta.size,
                timestamp: new Date().toISOString()
            });
            return;
        }

        // Validação da chave de supervisor (usada pelo console antes de abrir o WebSocket)
        if (url.pathname === '/api/validate-tenant') {
            const ip = clientIp(req);
            if (isRateLimited(ip)) {
                sendJson(res, 429, { valid: false, error: 'Muitas tentativas. Aguarde um minuto.' }, { 'Retry-After': '60' });
                return;
            }
            const key = req.headers['x-tenant-key']; // só por cabeçalho: chave em URL vaza em logs
            const found = lookupKey(key);
            if (found && found.role === 'supervisor') {
                const meta = tenantMeta.get(found.tenantId);
                sendJson(res, 200, { valid: true, tenant: meta.name, plan: meta.plan });
            } else {
                recordFailure(ip);
                sendJson(res, 403, { valid: false, error: 'Chave inválida ou não autorizada.' });
            }
            return;
        }

        // Roteamento estático: '/' -> landing; '/app', '/login' -> console (o acesso aos dados é validado no WebSocket)
        let target;
        if (url.pathname === '/app' || url.pathname === '/app.html' || url.pathname === '/login' || url.pathname === '/dashboard') target = 'app.html';
        else if (url.pathname === '/widget') target = 'widget.html';
        else if (url.pathname === '/privacy') target = 'privacy.html';
        else if (url.pathname === '/' || url.pathname === '/index.html') target = 'index.html';
        else target = url.pathname.replace(/^\/+/, '');

        // Páginas embutidas no Genesys Cloud / NICE CXone podem ser enquadradas apenas por domínios autorizados
        if (url.pathname === '/dashboard' || url.pathname === '/widget') {
            res.removeHeader('X-Frame-Options');
            res.setHeader('Content-Security-Policy', SECURITY_HEADERS['Content-Security-Policy'].replace("frame-ancestors 'none'", `frame-ancestors ${GENESYS_FRAME_ANCESTORS}`));
        }

        const filePath = path.resolve(publicDir, target);
        if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('VoiceVanguard CCaaS Relay: Resource not found');
            return;
        }

        fs.stat(filePath, (err, st) => {
            if (err || !st.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('VoiceVanguard CCaaS Relay: Resource not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
            if (req.method === 'HEAD') { res.end(); return; }
            const stream = fs.createReadStream(filePath);
            stream.on('error', () => res.destroy());
            stream.pipe(res);
        });
    });

    const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD_BYTES });

    function reject(ws, code, reason, message) {
        try { ws.send(JSON.stringify({ type: 'AUTH_ERROR', message })); } catch (_) {}
        ws.close(code, reason);
    }

    wss.on('connection', (ws, req) => {
        // Primeiro de tudo: sem listener, um frame acima de maxPayload em socket ainda não autenticado
        // gera 'error' não tratado e derruba o processo inteiro.
        ws.on('error', () => {});
        let url;
        try { url = new URL(req.url, 'http://localhost'); } catch (e) { ws.close(1008, 'Bad URL'); return; }

        const ip = clientIp(req);
        if (isRateLimited(ip)) { reject(ws, 4029, 'Rate Limited', 'Muitas tentativas.'); return; }

        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.authenticated = false;

        let authTimer = null;

        function completeAuth(rawKey, rawAgentId, viaMessage = false) {
            if (authTimer) { clearTimeout(authTimer); authTimer = null; }
            // O papel vem da chave apresentada, nunca de parâmetro declarado pelo cliente.
            const found = lookupKey(rawKey);
            if (!found) {
                recordFailure(ip);
                reject(ws, 4001, 'Invalid Key', 'Chave inválida ou não autorizada.');
                console.warn('[!] Conexão rejeitada (4001): chave inválida ou ausente');
                return false;
            }

            const { tenantId, role: clientType, tower, towers } = found;
            const meta = tenantMeta.get(tenantId);
            const room = getRoom(tenantId);

            let agentId = null;
            if (clientType === 'agent') {
                const requested = typeof rawAgentId === 'string' ? rawAgentId : url.searchParams.get('agentId');
                agentId = requested && ID_PATTERN.test(requested)
                    ? requested
                    : `PA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

                for (const c of wss.clients) {
                    if (c !== ws && c.readyState === WebSocket.OPEN && c.authenticated && c.tenantId === tenantId && c.clientType === 'agent' && c.tower === tower && c.agentId === agentId) {
                        reject(ws, 4009, 'Duplicate Agent', 'agentId já conectado neste tenant.');
                        return false;
                    }
                }
                let connectedAgents = 0;
                for (const c of wss.clients) {
                    if (c !== ws && c.readyState === WebSocket.OPEN && c.authenticated && c.tenantId === tenantId && c.clientType === 'agent') connectedAgents++;
                }
                if (connectedAgents >= meta.maxAgents) {
                    reject(ws, 4003, 'Agent Limit', 'Limite de agentes do plano atingido.');
                    return false;
                }
            }

            ws.authenticated = true;
            ws.tenantId = tenantId;
            ws.clientType = clientType;
            ws.tower = tower;
            ws.towers = towers;
            ws.supervisorName = found.supervisorName;
            ws.agentId = agentId;

            if (clientType === 'supervisor') {
                room.supervisors.add(ws);
                console.log(`[+] Supervisor conectado | Tenant: ${tenantId}`);
                ws.send(JSON.stringify({
                    type: 'INIT_STATE',
                    tenant: meta.name,
                    agents: Array.from(room.agents.values()).filter(a => canSee(ws, a.tower)),
                    stations: Array.from(room.stations.values()).filter(a => canSee(ws, a.tower)),
                    callHistory: room.callHistory.filter(c => canSee(ws, c.tower)).slice(0, 50),
                    towers: towers === '*' ? meta.towers : towers
                }));
            } else {
                const prev = room.agents.get(akey(tower, agentId));
                if (prev) prev.reconnectedAt = Date.now(); // até a próxima telemetria, o estado de chamada é desconhecido
                console.log(`[+] Agente conectado | ID: ${agentId} | Tenant: ${tenantId}`);
                if (viaMessage) {
                    ws.send(JSON.stringify({ type: 'AUTH_OK', agentId }));
                }
            }
            return true;
        }

        if (url.searchParams.has('key')) {
            if (process.env.DISABLE_URL_KEY === '1') {
                recordFailure(ip);
                reject(ws, 4001, 'URL Key Disabled', 'Autenticação por URL desativada; envie mensagem AUTH.');
                return;
            }
            if (!completeAuth(url.searchParams.get('key'), url.searchParams.get('agentId'), false)) {
                return;
            }
        } else {
            authTimer = setTimeout(() => {
                authTimer = null;
                if (!ws.authenticated) {
                    recordFailure(ip);
                    reject(ws, 4001, 'Auth Timeout', 'Chave inválida ou não autorizada.');
                }
            }, AUTH_TIMEOUT_MS);
            authTimer.unref();
        }

        ws.on('message', (raw) => {
            // Teto de mensagens por conexão: impede que um cliente com chave válida sature o relay e os supervisores.
            const nowMs = Date.now();
            if (!ws.msgWindowStart || nowMs - ws.msgWindowStart >= MSG_WINDOW_MS) { ws.msgWindowStart = nowMs; ws.msgCount = 0; }
            ws.msgCount++;
            const maxMsg = ws.authenticated ? (ws.clientType === 'agent' ? MSG_MAX_AGENT : MSG_MAX_SUPERVISOR) : 5;
            if (ws.msgCount > maxMsg) {
                ws.close(1008, 'Rate Limited');
                return;
            }
            let data;
            try { data = JSON.parse(raw); } catch (e) {
                if (!ws.authenticated) {
                    if (authTimer) { clearTimeout(authTimer); authTimer = null; }
                    recordFailure(ip);
                    reject(ws, 4001, 'Invalid Key', 'Chave inválida ou não autorizada.');
                }
                return;
            }
            if (!data || typeof data !== 'object') return;

            if (!ws.authenticated) {
                if (data.type !== 'AUTH') {
                    if (authTimer) { clearTimeout(authTimer); authTimer = null; }
                    recordFailure(ip);
                    reject(ws, 4001, 'Invalid Key', 'Chave inválida ou não autorizada.');
                    return;
                }
                completeAuth(data.key, data.agentId, true);
                return;
            }

            const { tenantId, clientType, tower, agentId } = ws;
            const meta = tenantMeta.get(tenantId);
            const room = getRoom(tenantId);

            try {
                if (clientType === 'agent' && data.type === 'AGENT_TELEMETRY') {
                    const mos = num(data.mosScore, 1, 4.5);
                    if (mos === null) return; // sem MOS válido não há telemetria a registrar
                    const record = {
                        agentId,
                        tower,
                        platform: str(data.platform, 64, 'VoIP WebRTC'),
                        platformCode: str(data.platformCode, 32, 'WEBRTC'),
                        operator: str(data.operator, 64, 'Operador'),
                        station: str(data.station, 64, agentId),
                        genesysOrg: str(data.genesysOrg, 128, 'Global'),
                        region: str(data.region, 128, 'auto'),
                        audioIssue: oneOf(data.audioIssue, AUDIO_ISSUES, 'NONE'),
                        status: (data.status === 'ALERTA' || (typeof data.audioIssue === 'string' && AUDIO_ISSUES.has(data.audioIssue) && data.audioIssue !== 'NONE')) ? 'ALERTA' : 'OK',
                        mosScore: mos.toFixed(2),
                        rttMs: num(data.rttMs, 0, 60000, 0),
                        jitterMs: num(data.jitterMs, 0, 60000, 0),
                        lossPct: num(data.lossPct, 0, 100, 0),
                        protocol: str(data.protocol, 16, 'UDP'),
                        networkType: str(data.networkType, 32, 'N/D'),
                        cpuStress: str(data.cpuStress, 32, 'NORMAL'),
                        callActive: data.callActive === true,
                        currentCallId: str(data.currentCallId, 128, ''),
                        lastSeen: new Date().toISOString()
                    };
                    // Teto de identidades por sala: libera um registro OFFLINE antigo ou ignora a telemetria excedente.
                    if (!room.agents.has(akey(tower, agentId)) && room.agents.size >= meta.maxAgents * AGENT_RECORD_FACTOR) {
                        let freed = false;
                        for (const [id, ag] of room.agents) { if (ag.status === 'OFFLINE') { room.agents.delete(id); freed = true; break; } }
                        if (!freed) return;
                    }
                    room.agents.set(akey(tower, agentId), record);
                    broadcast(room, { type: 'TELEMETRY_UPDATE', payload: record }, tower);
                    if (!record.callActive) flushPending(room, ws);
                    return;
                }

                if (clientType === 'agent' && data.type === 'CALL_AUDIT_SUMMARY') {
                    const mosMedio = num(data.mosMedio, 1, 4.5);
                    if (mosMedio === null) return;
                    const record = {
                        interactionId: str(data.interactionId, 128, 'CALL-UUID'),
                        tower,
                        platform: str(data.platform, 64, 'VoIP WebRTC'),
                        platformCode: str(data.platformCode, 32, 'WEBRTC'),
                        agentId,
                        operator: str(data.operator, 64, 'Operador'),
                        station: str(data.station, 64, agentId),
                        startTime: isoOrNull(data.startTime),
                        endTime: isoOrNull(data.endTime),
                        durationSeconds: num(data.durationSeconds, 0, 86400, 0),
                        mosMedio,
                        mosMinimo: num(data.mosMinimo, 1, 4.5, mosMedio),
                        jitterPicoMs: num(data.jitterPicoMs, 0, 60000, 0),
                        rttMedioMs: num(data.rttMedioMs, 0, 60000, 0),
                        perdaPacotesPct: num(data.perdaPacotesPct, 0, 100, 0),
                        protocolo: str(data.protocolo, 16, 'UDP'),
                        classificacao: oneOf(data.classificacao, CALL_CLASSES, 'N/D'),
                        networkType: str(data.networkType, 32, 'N/D'),
                        cpuStress: str(data.cpuStress, 32, 'NORMAL'),
                        causaRaiz: str(data.causaRaiz, 64, 'N/D'),
                        incidentesAudio: Array.isArray(data.incidentesAudio)
                            ? data.incidentesAudio.filter(c => typeof c === 'string' && AUDIO_ISSUES.has(c) && c !== 'NONE').slice(0, 4)
                            : [],
                        trocasDispositivo: num(data.trocasDispositivo, 0, 1000, 0),
                        receivedAt: new Date().toISOString()
                    };
                    room.callHistory.unshift(record);
                    if (room.callHistory.length > MAX_HISTORY) room.callHistory.pop();
                    saveTenantHistory(tenantId, room.callHistory);
                    broadcast(room, { type: 'NEW_CALL_AUDIT', payload: record }, tower);
                    const cur = room.agents.get(akey(tower, agentId));
                    if (cur && data.stillInCall !== true) cur.callActive = false;
                    if (data.stillInCall !== true) flushPending(room, ws);
                    return;
                }

                if (clientType === 'agent' && data.type === 'PING') {
                    // Sonda de rede do pré-check, com limite por conexão
                    const now = Date.now();
                    ws.pingTimes = (ws.pingTimes || []).filter(t => now - t < PING_WINDOW_MS);
                    if (ws.pingTimes.length >= PING_MAX_PER_WINDOW) return;
                    ws.pingTimes.push(now);
                    ws.send(JSON.stringify({ type: 'PONG', n: num(data.n, 0, 1e9, 0) }));
                    return;
                }

                if (clientType === 'agent' && data.type === 'SHIFT_PRECHECK') {
                    const rec = updateStation(room, meta, tower, agentId, data, { precheck: sanitizePrecheck(data) });
                    broadcast(room, { type: 'STATION_HEALTH_UPDATE', payload: rec }, tower);
                    return;
                }

                if (clientType === 'agent' && data.type === 'API_LATENCY') {
                    const rec = updateStation(room, meta, tower, agentId, data, { api: sanitizeApiLatency(data) });
                    broadcast(room, { type: 'STATION_HEALTH_UPDATE', payload: rec }, tower);
                    return;
                }

                if (clientType === 'supervisor' && data.type === 'SUPERVISOR_COMMAND') {
                    const target = data.targetAgentId;
                    if (typeof target !== 'string' || !ID_PATTERN.test(target)) return;
                    if (!COMMAND_WHITELIST.has(data.command)) return;
                    for (const client of wss.clients) {
                        if (client.authenticated && client.tenantId === tenantId && client.clientType === 'agent' && canSee(ws, client.tower) &&
                            client.agentId === target && client.readyState === WebSocket.OPEN) {
                            const state = room.agents.get(akey(client.tower, target));
                            // Sem estado fresco (agente sem telemetria ou reconectado há pouco) tratamos como possível chamada em curso.
                            const stale = !state || (state.reconnectedAt && Date.now() - state.reconnectedAt < RECONNECT_GRACE_MS);
                            if (stale || state.callActive) {
                                // In-Call Lock no servidor: enfileira para o wrap-up e avisa os supervisores da torre
                                client.pendingCommands = client.pendingCommands || new Set();
                                client.pendingCommands.add(data.command);
                                broadcast(room, { type: 'AGENT_COMMAND_FEEDBACK', agentId: target, tower: client.tower,
                                    result: { success: false, inCall: true, message: 'Agente em chamada ativa. Comando enfileirado para o pós-chamada.', timestamp: new Date().toISOString(), origin: 'server_in_call_lock' } }, client.tower);
                            } else {
                                client.send(JSON.stringify({ type: 'EXECUTE_COMMAND', command: data.command, origin: 'supervisor_remote' }));
                            }
                        }
                    }
                    console.log(`[AUDIT] ${new Date().toISOString()} tenant=${tenantId} supervisor=${JSON.stringify(ws.supervisorName)} torre=${tower || '*'} comando=${data.command} alvo=${target}`);
                    return;
                }

                if (clientType === 'agent' && data.type === 'COMMAND_RESULT') {
                    const r = data.result && typeof data.result === 'object' ? data.result : {};
                    broadcast(room, {
                        type: 'AGENT_COMMAND_FEEDBACK',
                        agentId,
                        tower,
                        result: {
                            success: r.success === true,
                            inCall: r.inCall === true,
                            message: str(r.message, 200, ''),
                            timestamp: isoOrNull(r.timestamp),
                            origin: str(r.origin, 32, '')
                        }
                    }, tower);
                }
            } catch (err) {
                console.error('Erro ao processar mensagem WebSocket:', err.message);
            }
        });

        ws.on('close', () => {
            if (authTimer) { clearTimeout(authTimer); authTimer = null; }
            if (!ws.authenticated) return;
            const { tenantId, clientType, tower, agentId } = ws;
            const room = getRoom(tenantId);
            if (clientType === 'supervisor') {
                room.supervisors.delete(ws);
                console.log(`[-] Supervisor desconectado | Tenant: ${tenantId}`);
            } else {
                const ag = room.agents.get(akey(tower, agentId));
                // Só marca OFFLINE se não houver outra conexão viva com o mesmo agentId na mesma torre
                const stillConnected = Array.from(wss.clients).some(c => c !== ws && c.authenticated && c.tenantId === tenantId && c.tower === tower && c.agentId === agentId && c.readyState === WebSocket.OPEN);
                if (ag && !stillConnected) {
                    ag.status = 'OFFLINE';
                    ag.callActive = false;
                    ag.lastSeen = new Date().toISOString();
                    broadcast(room, { type: 'TELEMETRY_UPDATE', payload: ag }, tower);
                }
                console.log(`[-] Agente desconectado | ID: ${agentId}`);
            }
        });

        ws.on('error', () => {});
    });

    // Heartbeat: encerra conexões mortas; limpa agentes offline antigos e contadores de rate limit
    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) {
            if (!ws.isAlive) { ws.terminate(); continue; }
            ws.isAlive = false;
            try { ws.ping(); } catch (_) {}
        }
        const now = Date.now();
        for (const room of tenantRooms.values()) {
            for (const [id, ag] of room.agents) {
                if (ag.status === 'OFFLINE' && now - new Date(ag.lastSeen).getTime() > OFFLINE_TTL_MS) room.agents.delete(id);
            }
        }
        for (const room of tenantRooms.values()) {
            for (const [id, st] of room.stations) {
                if (now - new Date(st.lastSeen).getTime() > OFFLINE_TTL_MS) room.stations.delete(id);
            }
        }
        for (const [ip, list] of authFailures) {
            const fresh = list.filter(t => now - t < AUTH_WINDOW_MS);
            if (fresh.length) authFailures.set(ip, fresh); else authFailures.delete(ip);
        }
    }, HEARTBEAT_MS);
    heartbeat.unref();

    async function shutdown() {
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.close(1001, 'Server shutting down');
        await flushAllSaves(tenantRooms);
        await new Promise(resolve => server.close(resolve));
    }

    return { server, wss, tenantRooms, shutdown };
}

if (require.main === module) {
    const relay = createRelay();
    relay.server.listen(PORT, () => {
        console.log('===============================================================');
        console.log(`VoiceVanguard CCaaS Cloud Relay ativo na porta ${PORT}`);
        console.log(`Landing Page: http://localhost:${PORT}`);
        console.log(`Supervisor Console: http://localhost:${PORT}/app`);
        console.log('===============================================================');
    });
    let stopping = false;
    const stop = () => {
        if (stopping) return;
        stopping = true;
        console.log('Encerrando (SIGTERM/SIGINT)...');
        const force = setTimeout(() => process.exit(1), 10000);
        force.unref();
        relay.shutdown().then(() => process.exit(0));
    };
    // Defesa em profundidade: loga e mantém o serviço de pé diante de erro inesperado em um socket.
    process.on('uncaughtException', (err) => { console.error('[!] uncaughtException:', err && err.message); });
    process.on('unhandledRejection', (err) => { console.error('[!] unhandledRejection:', err && err.message); });
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
}

module.exports = { createRelay, loadTenants, buildKeyIndex };
