/**
 * Webhook de alerta de saída (por tenant), assinado com HMAC-SHA256.
 * Configuração em TENANTS_JSON: "webhook": {"url":"https://...","secret":"<>=16 chars>","events":["CALL_CRITICAL","AUDIO_INCIDENT"]}
 * O payload NÃO leva o nome do operador (apenas estação, torre e métricas).
 */

const crypto = require('crypto');
const dns = require('dns');
const net = require('net');
const https = require('https');

const WEBHOOK_EVENTS = new Set(['CALL_CRITICAL', 'AUDIO_INCIDENT', 'MOS_DEGRADED']);
const DEFAULT_MOS_THRESHOLD = 3.0;
const SEND_TIMEOUT_MS = 5000;
const MAX_PENDING = 200;
const RETRY_DELAYS_MS = [1000, 5000, 20000];

function validateWebhookConfig(tenantId, cfg) {
    if (cfg === undefined) return null;
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error(`Tenant ${tenantId}: webhook inválido`);
    let u;
    try { u = new URL(cfg.url); } catch (_) { throw new Error(`Tenant ${tenantId}: webhook.url inválida`); }
    if (u.protocol !== 'https:') throw new Error(`Tenant ${tenantId}: webhook.url deve usar https`);
    if (u.username || u.password) throw new Error(`Tenant ${tenantId}: webhook.url não pode ter credenciais`);
    if (typeof cfg.secret !== 'string' || cfg.secret.length < 16) throw new Error(`Tenant ${tenantId}: webhook.secret precisa de 16+ caracteres`);
    let events = [...WEBHOOK_EVENTS];
    if (cfg.events !== undefined) {
        if (!Array.isArray(cfg.events) || cfg.events.length === 0 || cfg.events.some(e => !WEBHOOK_EVENTS.has(e))) {
            throw new Error(`Tenant ${tenantId}: webhook.events deve listar ${[...WEBHOOK_EVENTS].join(', ')}`);
        }
        events = [...new Set(cfg.events)];
    }
    let mosThreshold = DEFAULT_MOS_THRESHOLD;
    if (cfg.mosThreshold !== undefined) {
        if (typeof cfg.mosThreshold !== 'number' || !(cfg.mosThreshold >= 1 && cfg.mosThreshold <= 4.5)) throw new Error(`Tenant ${tenantId}: webhook.mosThreshold deve ficar entre 1 e 4.5`);
        mosThreshold = cfg.mosThreshold;
    }
    return { url: u.toString(), secret: cfg.secret, events: new Set(events), mosThreshold };
}

function isPrivateAddress(ip) {
    if (net.isIPv6(ip)) {
        const l = ip.toLowerCase();
        if (l === '::1' || l === '::') return true;
        if (l.startsWith('::ffff:')) return isPrivateAddress(l.slice(7));
        return /^f[cd]/.test(l) || /^fe[89ab]/.test(l);
    }
    if (!net.isIPv4(ip)) return true;
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168) || a >= 224;
}

function sign(secret, timestamp, body) {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// Resolve o DNS, recusa endereços internos (SSRF) e fixa o IP validado na conexão.
function defaultSend(url, headers, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        dns.lookup(u.hostname, { all: true }, (err, addrs) => {
            if (err) return reject(err);
            if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) return reject(new Error('destino interno bloqueado'));
            const pinned = addrs[0];
            const req = https.request({
                hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
                lookup: (_h, _o, cb) => cb(null, pinned.address, pinned.family),
                timeout: SEND_TIMEOUT_MS
            }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
            req.on('timeout', () => req.destroy(new Error('timeout')));
            req.on('error', reject);
            req.end(body);
        });
    });
}

function createWebhookDispatcher({ send = defaultSend, delays = RETRY_DELAYS_MS, log = () => {} } = {}) {
    let pending = 0;
    let closed = false;
    const timers = new Set();
    const sleep = (ms) => new Promise(r => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.add(t); });

    async function deliver(cfg, event, payload) {
        const delivery = crypto.randomUUID();
        const body = JSON.stringify({ event, delivery, ...payload });
        for (let attempt = 0; attempt <= delays.length && !closed; attempt++) {
            const ts = Math.floor(Date.now() / 1000);
            const headers = {
                'X-VoiceVanguard-Event': event,
                'X-VoiceVanguard-Delivery': delivery,
                'X-VoiceVanguard-Timestamp': String(ts),
                'X-VoiceVanguard-Signature': sign(cfg.secret, ts, body)
            };
            try {
                const status = await send(cfg.url, headers, body);
                if (status >= 200 && status < 300) return true;
                if (status >= 400 && status < 500 && status !== 429) { log(`recusado (HTTP ${status})`); return false; }
                log(`tentativa ${attempt + 1} falhou (HTTP ${status})`);
            } catch (e) {
                log(`tentativa ${attempt + 1} falhou (${e.message})`);
            }
            if (attempt < delays.length) await sleep(delays[attempt]);
        }
        return false;
    }

    return {
        // Não bloqueia o relay: a entrega roda em segundo plano, com fila limitada.
        emit(cfg, event, payload) {
            if (closed || !cfg || !cfg.events.has(event)) return null;
            if (pending >= MAX_PENDING) { log('fila cheia; alerta descartado'); return null; }
            pending++;
            return deliver(cfg, event, payload).catch(() => false).finally(() => { pending--; });
        },
        pendingCount() { return pending; },
        close() { closed = true; for (const t of timers) clearTimeout(t); timers.clear(); }
    };
}

module.exports = { validateWebhookConfig, isPrivateAddress, sign, createWebhookDispatcher, WEBHOOK_EVENTS };
