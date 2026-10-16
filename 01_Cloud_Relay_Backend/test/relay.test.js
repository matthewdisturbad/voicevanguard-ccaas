const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-test-'));
process.env.TENANTS_JSON = JSON.stringify({
    'T-A': { name: 'Tenant A', plan: 'Std', maxAgents: 1, agentKey: 'agent-key-A-123', supervisorKey: 'super-key-A-123' },
    'T-B': { name: 'Tenant B', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-B-123', supervisorKey: 'super-key-B-123' }
});
const { createRelay } = require('../server');

let relay, port;
test.before(async () => {
    relay = createRelay();
    await new Promise(r => relay.server.listen(0, r));
    port = relay.server.address().port;
});
test.after(async () => { await relay.shutdown(); });

const connect = (query) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}?${query}`);
    const msgs = [];
    ws.on('message', m => msgs.push(JSON.parse(m)));
    ws.on('open', () => resolve({ ws, msgs, closed: new Promise(r => ws.on("close", c => r({ code: c }))) }));
    ws.on('error', () => {});
    ws.on('close', c => resolve({ ws, msgs, code: c }));
});
const get = (p, headers = {}) => new Promise((resolve) => {
    http.get({ port, path: p, headers }, res => {
        let body = ''; res.on('data', d => body += d); res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
});
const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('chave inválida é rejeitada com 4001', async () => {
    const c = await connect('key=nope');
    assert.strictEqual(c.code ?? (await c.closed).code, 4001);
});

test('type=supervisor autodeclarado com chave de agente NÃO concede acesso de supervisor', async () => {
    const a = await connect('key=agent-key-A-123&type=supervisor&agentId=PA1');
    await wait(100);
    assert.ok(!a.msgs.some(m => m.type === 'INIT_STATE'));
    a.ws.close();
});

test('supervisor recebe telemetria do próprio tenant e não de outro', async () => {
    const supA = await connect('key=super-key-A-123');
    const supB = await connect('key=super-key-B-123');
    const agentA = await connect('key=agent-key-A-123&agentId=PA-A1');
    agentA.ws.send(JSON.stringify({ type: 'AGENT_TELEMETRY', mosScore: '4.2', operator: '<img src=x onerror=1>' }));
    await wait(200);
    assert.ok(supA.msgs.some(m => m.type === 'TELEMETRY_UPDATE' && m.payload.agentId === 'PA-A1'));
    assert.ok(!supB.msgs.some(m => m.type === 'TELEMETRY_UPDATE'));
    [supA, supB, agentA].forEach(c => c.ws.close());
});

test('telemetria sem MOS válido é descartada (sem MOS "ótimo" falso)', async () => {
    const sup = await connect('key=super-key-B-123');
    const ag = await connect('key=agent-key-B-123&agentId=PA-B1');
    ag.ws.send(JSON.stringify({ type: 'AGENT_TELEMETRY' }));
    await wait(150);
    assert.ok(!sup.msgs.some(m => m.type === 'TELEMETRY_UPDATE'));
    sup.ws.close(); ag.ws.close();
});

test('limite maxAgents e agentId duplicado', async () => {
    const a1 = await connect('key=agent-key-A-123&agentId=PA-X1');
    const a2 = await connect('key=agent-key-A-123&agentId=PA-X2');
    assert.strictEqual(a2.code ?? (await a2.closed).code, 4003);
    a1.ws.close();
    await wait(100);
    const b1 = await connect('key=agent-key-B-123&agentId=PA-D');
    const b2 = await connect('key=agent-key-B-123&agentId=PA-D');
    assert.strictEqual(b2.code ?? (await b2.closed).code, 4009);
    b1.ws.close();
});

test('comando só do supervisor, só whitelist, entregue só ao agente do mesmo tenant', async () => {
    const sup = await connect('key=super-key-B-123');
    const ag = await connect('key=agent-key-B-123&agentId=PA-C1');
    sup.ws.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND', targetAgentId: 'PA-C1', command: 'FORMAT_DISK' }));
    sup.ws.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND', targetAgentId: 'PA-C1', command: 'SAFE_CACHE_CLEAR' }));
    ag.ws.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND', targetAgentId: 'PA-C1', command: 'SAFE_CACHE_CLEAR' }));
    await wait(200);
    const cmds = ag.msgs.filter(m => m.type === 'EXECUTE_COMMAND');
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].command, 'SAFE_CACHE_CLEAR');
    sup.ws.close(); ag.ws.close();
});

test('mensagem acima de maxPayload derruba a conexão', async () => {
    const ag = await connect('key=agent-key-B-123&agentId=PA-BIG');
    ag.ws.send('x'.repeat(100 * 1024));
    const c = await ag.closed;
    assert.strictEqual(c.code, 1009);
});

test('validate-tenant aceita só chave de supervisor', async () => {
    assert.strictEqual((await get('/api/validate-tenant?key=super-key-A-123')).status, 200);
    assert.strictEqual((await get('/api/validate-tenant?key=agent-key-A-123')).status, 403);
    assert.strictEqual((await get('/api/validate-tenant?key=__proto__')).status, 403);
});

test('servidor estático não escapa de public/ e envia headers de segurança', async () => {
    for (const p of ['/../server.js', '/%2e%2e/server.js', '/..%2fserver.js', '/public/../server.js']) {
        const r = await get(p);
        assert.strictEqual(r.status, 404, p);
    }
    const root = await get('/');
    assert.strictEqual(root.status, 200);
    assert.strictEqual(root.headers['x-content-type-options'], 'nosniff');
    assert.ok(root.headers['content-security-policy']);
});
