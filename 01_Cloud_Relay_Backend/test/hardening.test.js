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
    'T-H': { name: 'Tenant H', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-H-123', supervisorKey: 'super-key-H-123', widgetKey: 'widget-key-H-123' }
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

test('autenticação WebSocket por primeira mensagem (AUTH) funciona sem chave na URL', async () => {
    const supMsgs = [];
    const sup = new WebSocket(`ws://localhost:${port}`, { headers: { 'X-Forwarded-For': '203.0.113.10' } });
    sup.on('message', m => supMsgs.push(JSON.parse(m)));
    await new Promise(r => sup.on('open', r));
    sup.send(JSON.stringify({ type: 'AUTH', key: 'super-key-H-123' }));
    await wait(150);
    assert.ok(supMsgs.some(m => m.type === 'INIT_STATE'), 'supervisor autenticado via mensagem AUTH deve receber INIT_STATE');

    const agMsgs = [];
    const ag = new WebSocket(`ws://localhost:${port}`, { headers: { 'X-Forwarded-For': '203.0.113.11' } });
    ag.on('message', m => agMsgs.push(JSON.parse(m)));
    await new Promise(r => ag.on('open', r));
    ag.send(JSON.stringify({ type: 'AUTH', key: 'agent-key-H-123', agentId: 'PA-FIRST-MSG' }));
    ag.send(JSON.stringify({ type: 'AGENT_TELEMETRY', mosScore: '4.35', callActive: true }));
    await wait(200);
    assert.ok(agMsgs.some(m => m.type === 'AUTH_OK' && m.agentId === 'PA-FIRST-MSG'));
    assert.ok(supMsgs.some(m => m.type === 'TELEMETRY_UPDATE' && m.payload.agentId === 'PA-FIRST-MSG'));

    // Mensagem sem AUTH em socket não autenticado é recusada com 4001
    const bad = new WebSocket(`ws://localhost:${port}`, { headers: { 'X-Forwarded-For': '203.0.113.12' } });
    const badClosed = new Promise(r => bad.on('close', c => r(c)));
    await new Promise(r => bad.on('open', r));
    bad.send(JSON.stringify({ type: 'AGENT_TELEMETRY', mosScore: '4.4' }));
    assert.strictEqual(await badClosed, 4001);

    sup.close();
    ag.close();
});

test('CSP usa hashes SHA-256 em script-src sem unsafe-inline', async () => {
    const r = await get('/');
    const csp = r.headers['content-security-policy'] || '';
    const scriptDirective = csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src'));
    assert.ok(scriptDirective, 'deve conter diretiva script-src');
    assert.ok(!scriptDirective.includes("'unsafe-inline'"), `script-src não deve conter unsafe-inline: ${scriptDirective}`);
    assert.ok(scriptDirective.includes("'sha256-"), `script-src deve conter hashes sha256: ${scriptDirective}`);
});

test('CSP: style-src por hash, sem unsafe-inline, e nenhum atributo style="" nas páginas', async () => {
    const r = await get('/');
    const csp = r.headers['content-security-policy'] || '';
    const styleDirective = csp.split(';').map(s => s.trim()).find(s => s.startsWith('style-src'));
    assert.ok(styleDirective, 'deve conter diretiva style-src');
    assert.ok(!styleDirective.includes("'unsafe-inline'"), `style-src não deve conter unsafe-inline: ${styleDirective}`);
    assert.ok(styleDirective.includes("'sha256-"), `style-src deve conter hashes sha256: ${styleDirective}`);
    const dir = path.join(__dirname, '..', 'public');
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.ok(!/\sstyle=["'`]/.test(html), `${f} usa atributo style="" (bloqueado pela CSP); use classes`);
    }
});

test('API_LATENCY de múltiplos frames na mesma PA mescla hosts na janela ativa', async () => {
    const supMsgs = [];
    const sup = new WebSocket(`ws://localhost:${port}`, { headers: { 'X-Forwarded-For': '203.0.113.20' } });
    sup.on('message', m => supMsgs.push(JSON.parse(m)));
    await new Promise(r => sup.on('open', r));
    sup.send(JSON.stringify({ type: 'AUTH', key: 'super-key-H-123' }));

    const ag = new WebSocket(`ws://localhost:${port}`, { headers: { 'X-Forwarded-For': '203.0.113.21' } });
    await new Promise(r => ag.on('open', r));
    ag.send(JSON.stringify({ type: 'AUTH', key: 'agent-key-H-123', agentId: 'PA-MULTIFRAME' }));
    ag.send(JSON.stringify({
        type: 'API_LATENCY', janelaSeg: 30,
        hosts: [{ host: 'api.mypurecloud.com', count: 5, avgMs: 90, p95Ms: 140, maxMs: 180, errors: 0 }]
    }));
    ag.send(JSON.stringify({
        type: 'API_LATENCY', janelaSeg: 30,
        hosts: [{ host: 'apps.mypurecloud.com', count: 3, avgMs: 60, p95Ms: 110, maxMs: 120, errors: 0 }]
    }));
    await wait(200);
    const updates = supMsgs.filter(m => m.type === 'STATION_HEALTH_UPDATE' && m.payload.agentId === 'PA-MULTIFRAME');
    const last = updates[updates.length - 1];
    assert.ok(last);
    const hostNames = last.payload.api.hosts.map(h => h.host).sort();
    assert.deepStrictEqual(hostNames, ['api.mypurecloud.com', 'apps.mypurecloud.com']);
    sup.close();
    ag.close();
});

// --- Widget: credencial própria, somente leitura e restrita a uma conversa ---
const authed = (msg) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const msgs = [];
    const closed = new Promise(r => ws.on('close', code => r(code)));
    ws.on('error', () => {});
    ws.on('message', m => msgs.push(JSON.parse(m)));
    ws.on('open', () => { ws.send(JSON.stringify(msg)); resolve({ ws, msgs, closed }); });
});

test('widget só recebe a conversa que abriu e não executa comandos', async () => {
    const widget = await authed({ type: 'AUTH', key: 'widget-key-H-123', conversationId: 'conv-AAAA-1111' });
    const agentA = await authed({ type: 'AUTH', key: 'agent-key-H-123', agentId: 'PA-WA' });
    const agentB = await authed({ type: 'AUTH', key: 'agent-key-H-123', agentId: 'PA-WB' });
    await wait(150);
    agentA.ws.send(JSON.stringify({ type: 'AGENT_TELEMETRY', mosScore: '4.1', currentCallId: 'conv-AAAA-1111', callActive: true }));
    agentB.ws.send(JSON.stringify({ type: 'AGENT_TELEMETRY', mosScore: '3.0', currentCallId: 'conv-BBBB-2222', callActive: true }));
    await wait(250);
    const updates = widget.msgs.filter(m => m.type === 'TELEMETRY_UPDATE');
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].payload.agentId, 'PA-WA');
    // comando de supervisor enviado pelo widget é ignorado
    widget.ws.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND', targetAgentId: 'PA-WA', command: 'SAFE_CACHE_CLEAR' }));
    await wait(200);
    assert.strictEqual(agentA.msgs.filter(m => m.type === 'EXECUTE_COMMAND').length, 0);
    [widget, agentA, agentB].forEach(c => c.ws.close());
});

test('widget sem conversationId válido é recusado com 4001', async () => {
    const w = await authed({ type: 'AUTH', key: 'widget-key-H-123' });
    assert.strictEqual(await w.closed, 4001);
});

test('chave de widget não vale como chave de supervisor no validate-tenant', async () => {
    const r = await get('/api/validate-tenant', { 'X-Tenant-Key': 'widget-key-H-123' });
    assert.strictEqual(r.status, 403);
});

test('em produção a chave na URL é recusada, a menos que ALLOW_URL_KEY=1', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        const c = await open('key=agent-key-H-123&agentId=PA-URL');
        assert.strictEqual(await c.closed, 4001);
        process.env.ALLOW_URL_KEY = '1';
        const d = await open('key=agent-key-H-123&agentId=PA-URL2');
        await wait(150);
        assert.strictEqual(d.ws.readyState, WebSocket.OPEN);
        d.ws.close();
    } finally {
        delete process.env.ALLOW_URL_KEY;
        if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
    }
});
