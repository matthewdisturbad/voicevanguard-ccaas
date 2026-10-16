/**
 * VoiceVanguard CCaaS - Multi-Tenant Cloud Relay & Telemetry Hub
 * Roteamento em tempo real de telemetria, qualidade WebRTC e auditoria de chamadas.
 * Arquitetura SaaS Agnóstica (White-Label) para Genesys Cloud CX.
 * Autor: David Paiva • TrustCo Technologies
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 9090;

// Base de Dados de Tenants Enterprise
// Chaves de licença e isolamento multi-empresa
const TENANTS_DB = {
    "GENESYS-ALLIANCE-EVAL": {
        name: "Genesys AppFoundry Alliance Evaluation",
        maxAgents: 250,
        plan: "Enterprise Partner",
        active: true
    },
    "BPO-APEX-GLOBAL": {
        name: "Apex BPO Solutions",
        maxAgents: 500,
        plan: "Enterprise",
        active: true
    },
    "BPO-NEXUS-CORP": {
        name: "Nexus Contact Center",
        maxAgents: 1000,
        plan: "Enterprise",
        active: true
    },
    "BPO-STELLAR-CX": {
        name: "Stellar Customer Experience",
        maxAgents: 750,
        plan: "Enterprise",
        active: true
    }
};

// Configuração adicional de tenants via variável de ambiente (evita chaves no repositório).
// Formato: { "TENANT-ID": { name, plan, maxAgents, active, towers: {...}, supervisors: {...} } }
if (process.env.TENANTS_CONFIG_JSON) {
    try {
        Object.assign(TENANTS_DB, JSON.parse(process.env.TENANTS_CONFIG_JSON));
    } catch (e) {
        console.error('[Config] TENANTS_CONFIG_JSON inválido:', e.message);
    }
}

// Torres (operações). A própria operação define quem vai para a sua torre:
// cada torre tem uma agentKey instalada via GPO/Intune nas PAs daquela operação,
// e supervisores recebem uma chave própria com a lista de torres que podem ver ('*' = todas).
// Tenants sem `towers` mantêm o comportamento legado (tenant inteiro visível).
function safeEqual(a, b) {
    const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function resolveCredential(tenantMeta, clientType, key) {
    if (!tenantMeta.towers) return { ok: true, tower: null, towers: '*' };
    if (!key) return { ok: false };
    if (clientType === 'supervisor') {
        for (const [supKey, sup] of Object.entries(tenantMeta.supervisors || {})) {
            if (safeEqual(supKey, key)) {
                const towers = sup.towers === '*' ? '*' : (sup.towers || []).filter(t => tenantMeta.towers[t]);
                return { ok: true, towers, supervisorName: sup.name || 'Supervisor' };
            }
        }
        return { ok: false };
    }
    for (const [towerId, tower] of Object.entries(tenantMeta.towers)) {
        if (tower.agentKey && safeEqual(tower.agentKey, key)) return { ok: true, tower: towerId, towers: [towerId] };
    }
    return { ok: false };
}

function canSee(ws, tower) {
    return ws.towers === '*' || ws.towers.includes(tower);
}

function sendToSupervisors(room, tower, message) {
    room.supervisors.forEach(sup => {
        if (sup.readyState === WebSocket.OPEN && canSee(sup, tower)) sup.send(message);
    });
}

// Armazenamento em memória por Tenant
// tenantKey -> { supervisors: Set(ws), agents: Map(agentId, data), callHistory: Array(calls) }
const tenantRooms = new Map();
const DATA_DIR = path.join(__dirname, 'data_store');
if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

function loadTenantHistory(tenantKey) {
    try {
        const filePath = path.join(DATA_DIR, `${tenantKey}_history.json`);
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn(`[DataStore] Erro ao carregar histórico de ${tenantKey}:`, e.message);
    }
    return [];
}

function saveTenantHistory(tenantKey, history) {
    try {
        const filePath = path.join(DATA_DIR, `${tenantKey}_history.json`);
        fs.writeFileSync(filePath, JSON.stringify(history.slice(0, 500), null, 2), 'utf8');
    } catch (e) {
        console.error(`[DataStore] Erro ao salvar histórico de ${tenantKey}:`, e.message);
    }
}

// Chave interna do agente na sala: isola PAs de torres diferentes com o mesmo agentId
function agentKeyOf(ws) {
    return `${ws.tower || ''}|${ws.agentId}`;
}

function getOrCreateTenantRoom(tenantKey) {
    if (!tenantRooms.has(tenantKey)) {
        tenantRooms.set(tenantKey, {
            supervisors: new Set(),
            agents: new Map(),
            callHistory: loadTenantHistory(tenantKey)
        });
    }
    return tenantRooms.get(tenantKey);
}

// Rate limit simples em memória: máx. 30 validações por IP por minuto (escritórios de BPO compartilham IP)
const VALIDATE_LIMIT = 30;
const VALIDATE_WINDOW_MS = 60 * 1000;
const validateHits = new Map();
function isRateLimited(ip) {
    const now = Date.now();
    const hits = (validateHits.get(ip) || []).filter(t => now - t < VALIDATE_WINDOW_MS);
    hits.push(now);
    validateHits.set(ip, hits);
    return hits.length > VALIDATE_LIMIT;
}
setInterval(() => {
    const now = Date.now();
    for (const [ip, hits] of validateHits) {
        if (!hits.some(t => now - t < VALIDATE_WINDOW_MS)) validateHits.delete(ip);
    }
}, VALIDATE_WINDOW_MS).unref();

// Servidor HTTP (Serve Landing Page, Supervisor App e APIs REST)
const server = http.createServer((req, res) => {
    // Configura CORS total para endpoints
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-Key');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // Endpoint de Status / Health Check
    if (url.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: "online",
            version: "1.0.0",
            service: "VoiceVanguard CCaaS Multi-Tenant Cloud Relay",
            activeTenants: tenantRooms.size,
            registeredTenants: Object.keys(TENANTS_DB).length,
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // Validação de Licença / Tenant (com limite de tentativas por IP)
    if (url.pathname === '/api/validate-tenant') {
        // Último valor de X-Forwarded-For (anexado pelo proxy); o primeiro pode ser forjado pelo cliente
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').pop().trim();
        if (isRateLimited(ip)) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
            res.end(JSON.stringify({ valid: false, error: "Muitas tentativas. Aguarde 1 minuto." }));
            return;
        }
        const key = url.searchParams.get('key');
        const tenant = TENANTS_DB[key];
        if (tenant && tenant.active) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: true, tenant: tenant.name, plan: tenant.plan }));
        } else {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false, error: "Chave de Tenant inválida ou não autorizada." }));
        }
        return;
    }

    // Roteamento HTTP:
    // '/' ou '/index.html' -> Landing Page (public/index.html)
    // '/app', '/app.html' ou '/login' -> Console Supervisor Enterprise (public/app.html)
    let targetFileName = 'index.html';
    // '/dashboard' (Genesys Client App) -> Console; '/widget' -> Interaction Widget; '/privacy' -> Política de Privacidade
    if (url.pathname === '/app' || url.pathname === '/app.html' || url.pathname === '/login' || url.pathname === '/dashboard') {
        targetFileName = 'app.html';
    } else if (url.pathname === '/widget') {
        targetFileName = 'widget.html';
    } else if (url.pathname === '/privacy') {
        targetFileName = 'privacy.html';
    } else if (url.pathname === '/' || url.pathname === '/index.html') {
        targetFileName = 'index.html';
    } else {
        targetFileName = url.pathname.replace(/^\/+/, '');
    }

    const dashboardDir = path.join(__dirname, 'public');
    const filePath = path.join(dashboardDir, targetFileName);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };
        res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'text/plain',
            // Permite embed apenas dentro do Genesys Cloud (Client App iframe)
            'Content-Security-Policy': "frame-ancestors 'self' https://*.pure.cloud https://*.mypurecloud.com https://*.mypurecloud.ie https://*.mypurecloud.de https://*.mypurecloud.jp https://*.mypurecloud.com.au"
        });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('VoiceVanguard CCaaS Relay: Resource not found');
});

// Servidor WebSocket (WSS / WS)
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tenantKey = url.searchParams.get('tenant');
    const clientType = url.searchParams.get('type') || 'agent'; // 'agent' ou 'supervisor'
    const agentId = url.searchParams.get('agentId') || `PA-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Validação Estrita de Licença: Chaves inválidas ou ausentes são rejeitadas com 4001
    const tenantMeta = tenantKey ? TENANTS_DB[tenantKey] : null;
    if (!tenantMeta || !tenantMeta.active) {
        ws.send(JSON.stringify({ type: 'AUTH_ERROR', message: 'Licença inválida ou não autorizada.' }));
        ws.close(4001, 'Invalid Tenant');
        console.warn(`[!] Conexão rejeitada com código 4001 (Tenant inválido ou ausente: ${tenantKey})`);
        return;
    }

    const cred = resolveCredential(tenantMeta, clientType, url.searchParams.get('key'));
    if (!cred.ok) {
        ws.send(JSON.stringify({ type: 'AUTH_ERROR', message: 'Chave de operação inválida ou ausente.' }));
        ws.close(4003, 'Invalid Operation Key');
        console.warn(`[!] Conexão rejeitada com código 4003 (chave inválida | Tenant: ${tenantKey} | ${clientType})`);
        return;
    }

    const room = getOrCreateTenantRoom(tenantKey);
    ws.tenantKey = tenantKey;
    ws.tower = cred.tower;       // torre do agente (null em tenants legados)
    ws.towers = cred.towers;     // torres visíveis ao supervisor ('*' = todas)
    ws.clientType = clientType;
    ws.agentId = agentId;

    if (clientType === 'supervisor') {
        room.supervisors.add(ws);
        console.log(`[+] Supervisor conectado | Tenant: ${tenantKey} (${tenantMeta.name})`);

        // Envia estado atual de todas as PAs e histórico de chamadas ao supervisor recém-conectado
        ws.send(JSON.stringify({
            type: 'INIT_STATE',
            tenant: tenantMeta.name,
            agents: Array.from(room.agents.values()).filter(a => canSee(ws, a.tower)),
            callHistory: room.callHistory.filter(c => canSee(ws, c.tower)).slice(0, 50),
            towers: ws.towers === '*' ? Object.keys(tenantMeta.towers || {}) : ws.towers
        }));
    } else {
        console.log(`[+] Agente PA conectado | ID: ${agentId} | Tenant: ${tenantKey}`);
    }

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);

            // 1. Telemetria Contínua da PA (WebRTC, Navegador, Máquina)
            if (data.type === 'AGENT_TELEMETRY') {
                const telemetryRecord = {
                    agentId: ws.agentId,
                    platform: data.platform || "VoIP WebRTC",
                    platformCode: data.platformCode || "WEBRTC",
                    operator: data.operator || "Operador",
                    station: data.station || ws.agentId,
                    genesysOrg: data.genesysOrg || "Global",
                    region: data.region || "auto",
                    status: data.status || "OK",
                    mosScore: data.mosScore || "4.40",
                    rttMs: data.rttMs || 0,
                    jitterMs: data.jitterMs || 0,
                    lossPct: data.lossPct || 0,
                    protocol: data.protocol || "UDP",
                    networkType: data.networkType || "ETHERNET",
                    cpuStress: data.cpuStress || "NORMAL",
                    callActive: data.callActive || false,
                    currentCallId: data.currentCallId || "",
                    tower: ws.tower,
                    lastSeen: new Date().toISOString()
                };

                room.agents.set(agentKeyOf(ws), telemetryRecord);

                // Broadcast imediato para todos os supervisores do mesmo Tenant
                const broadcastMsg = JSON.stringify({ type: 'TELEMETRY_UPDATE', payload: telemetryRecord });
                sendToSupervisors(room, ws.tower, broadcastMsg);
            }

            // 2. Resumo de Chamada Finalizada (Auditoria com MOS ITU-T G.107)
            if (data.type === 'CALL_AUDIT_SUMMARY') {
                const callRecord = {
                    interactionId: data.interactionId || "CALL-UUID",
                    platform: data.platform || "VoIP WebRTC",
                    platformCode: data.platformCode || "WEBRTC",
                    agentId: ws.agentId,
                    operator: data.operator || "Operador",
                    station: data.station || ws.agentId,
                    startTime: data.startTime,
                    endTime: data.endTime,
                    durationSeconds: data.durationSeconds || 0,
                    mosMedio: data.mosMedio || 4.4,
                    mosMinimo: data.mosMinimo || 4.4,
                    jitterPicoMs: data.jitterPicoMs || 0,
                    rttMedioMs: data.rttMedioMs || 0,
                    perdaPacotesPct: data.perdaPacotesPct || 0,
                    protocolo: data.protocolo || "UDP",
                    classificacao: data.classificacao || "EXCELENTE",
                    tower: ws.tower,
                    receivedAt: new Date().toISOString()
                };

                room.callHistory.unshift(callRecord);
                if (room.callHistory.length > 500) room.callHistory.pop();
                saveTenantHistory(tenantKey, room.callHistory);

                const callMsg = JSON.stringify({ type: 'NEW_CALL_AUDIT', payload: callRecord });
                sendToSupervisors(room, ws.tower, callMsg);
            }

            // 3. Comando Injetado pelo Supervisor (Ex: Limpeza Segura de Cache Remota)
            if (data.type === 'SUPERVISOR_COMMAND' && clientType === 'supervisor') {
                const targetAgentId = data.targetAgentId;
                const commandType = data.command; // 'SAFE_CACHE_CLEAR'

                // Envia comando para a PA específica
                for (const client of wss.clients) {
                    if (client.tenantKey === tenantKey && client.clientType === 'agent' && client.agentId === targetAgentId && canSee(ws, client.tower)) {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'EXECUTE_COMMAND',
                                command: commandType,
                                origin: 'supervisor_remote'
                            }));
                        }
                    }
                }
            }

            // 4. Feedback do Agente (Ex: Cache limpo com êxito ou bloqueado por chamada)
            if (data.type === 'COMMAND_RESULT') {
                const resMsg = JSON.stringify({ type: 'AGENT_COMMAND_FEEDBACK', agentId: ws.agentId, result: data.result });
                sendToSupervisors(room, ws.tower, resMsg);
            }

        } catch (err) {
            console.error("Erro ao processar mensagem WebSocket:", err);
        }
    });

    ws.on('close', () => {
        if (clientType === 'supervisor') {
            room.supervisors.delete(ws);
            console.log(`[-] Supervisor desconectado | Tenant: ${tenantKey}`);
        } else {
            // Marca o agente como OFFLINE após desconexão
            const ag = room.agents.get(agentKeyOf(ws));
            if (ag) {
                ag.status = 'OFFLINE';
                ag.lastSeen = new Date().toISOString();
                const offlineMsg = JSON.stringify({ type: 'TELEMETRY_UPDATE', payload: ag });
                sendToSupervisors(room, ws.tower, offlineMsg);
            }
            console.log(`[-] Agente PA desconectado | ID: ${ws.agentId}`);
        }
    });
});

server.listen(PORT, () => {
    console.log("===============================================================");
    console.log(`🚀 VoiceVanguard CCaaS Cloud Relay ativo na porta ${PORT}`);
    console.log(`🌐 Landing Page: http://localhost:${PORT}`);
    console.log(`🔒 Supervisor Console: http://localhost:${PORT}/app`);
    console.log(`📡 WebSocket URL: ws://localhost:${PORT}?tenant=GENESYS-ALLIANCE-EVAL`);
    console.log("===============================================================");
});
