const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-hard-'));
process.env.TRUST_PROXY = '1';
process.env.TENANTS_JSON = JSON.stringify({
    'T-H': { name: 'Tenant H', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-H-123', supervisorKey: 'super-key-H-123' }
});
const { createRelay, loadTenants } = require('../server');

let relay, port;
test.before(async () => {
    relay = createRelay();
    await new Promise(r => relay.server.listen(0, r));
    port = relay.server.address().port;
});
test.after(async () => { await relay.shutdown(); });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const get = (p, headers = {}) => new Promise((resolve) => {
    http.get({ port, path: p, headers }, res => {
        let body = ''; res.on('data', d => body += d); res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
});
const open = (query, headers = {}) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}?${query}`, { headers });
    const closed = new Promise(r => ws.on('close', code => r(code)));
    ws.on('error', () => {});
    ws.on('open', () => resolve({ ws, closed }));
    ws.on('close', () => resolve({ ws, closed }));
});

test('frame gigante em socket com chave inválida não derruba o processo', async () => {
    // Processo real: um erro não tratado só é fatal fora do test runner.
    const { spawn } = require('node:child_process');
    {
        const childPort = 20000 + (process.pid % 20000);
        const c2 = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
            env: { ...process.env, PORT: String(childPort), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'vv-child-')) },
            stdio: 'ignore'
        });
        try {
            let up = false;
            for (let i = 0; i < 40 && !up; i++) {
                await wait(150);
                up = await new Promise(r => http.get({ port: childPort, path: '/api/health' }, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)));
            }
            assert.ok(up, 'servidor filho não subiu');
            const ws = new WebSocket(`ws://localhost:${childPort}?key=invalida-xxxx`);
            ws.on('error', () => {});
            ws.on('open', () => { try { ws.send(Buffer.alloc(200 * 1024, 97)); } catch (_) {} });
            await wait(800);
            assert.strictEqual(c2.exitCode, null, 'o processo caiu com frame gigante em socket não autenticado');
            const alive = await new Promise(r => http.get({ port: childPort, path: '/api/health' }, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)));
            assert.ok(alive);
        } finally { c2.kill(); }
    }
});

test('health público não expõe contagem de conexões por tenant', async () => {
    const h = JSON.parse((await get('/api/health')).body);
    assert.strictEqual(h.activeConnections, undefined);
    assert.strictEqual(h.activeTenants, undefined);
    assert.strictEqual(h.version, undefined);
});

test('API responde com Cache-Control: no-store', async () => {
    const r = await get('/api/validate-tenant', { 'X-Tenant-Key': 'super-key-H-123' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers['cache-control'], 'no-store');
});

test('inundação de mensagens fecha a conexão com 1008', async () => {
    const c = await open('key=agent-key-H-123&agentId=PA-FLOOD');
    for (let i = 0; i < 200; i++) c.ws.send(JSON.stringify({ type: 'AGENT_TELEMETRY', mosScore: '4.2' }));
    assert.strictEqual(await c.closed, 1008);
});

test('X-Forwarded-For forjado não escapa do rate limit por IP (usa o último item)', async () => {
    let limited = 0;
    for (let i = 0; i < 30; i++) {
        const r = await get('/api/validate-tenant', { 'X-Tenant-Key': 'chave-errada-' + i, 'X-Forwarded-For': `10.9.${i}.1, 198.51.100.77` });
        if (r.status === 429) limited++;
    }
    assert.ok(limited > 0, 'o limite deveria ser aplicado ao IP real (último item do XFF)');
});

test('sem TENANTS_JSON, plataforma gerenciada não sobe com tenants de desenvolvimento', () => {
    assert.throws(() => loadTenants({ RAILWAY_ENVIRONMENT: 'production' }), /obrigatório/);
    assert.throws(() => loadTenants({ NODE_ENV: 'production' }), /obrigatório/);
    assert.ok(Object.keys(loadTenants({})).length > 0);
});

test('TENANTS_JSON malformado ou não-objeto falha sem vazar conteúdo', () => {
    assert.throws(() => loadTenants({ TENANTS_JSON: '{"a": "segredo-xyz' }), (e) => !/segredo-xyz/.test(e.message));
    assert.throws(() => loadTenants({ TENANTS_JSON: 'null' }), /objeto/);
});
