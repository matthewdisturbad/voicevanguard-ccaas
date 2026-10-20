// Tenants de piloto e produção: validade (expiresAt), teto de estações e de histórico.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-lic-'));
const future = new Date(Date.now() + 7 * 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();
const keys = (n) => ({ agentKey: `agent-key-${n}-1`, supervisorKey: `super-key-${n}-1` });
process.env.TENANTS_JSON = JSON.stringify({
    'BPO-APEX-GLOBAL': { name: 'Apex', tier: 'pilot', expiresAt: future, maxAgents: 500, ...keys('apex') },
    'BPO-NEXUS-CORP': { name: 'Nexus', tier: 'pilot', expiresAt: past, ...keys('nexus') },
    'BPO-STELLAR-CX': { name: 'Stellar', ...keys('stellar') }
});
const { createRelay, buildKeyIndex } = require('../server');

const base = { agentKey: 'agent-key-aaaa', supervisorKey: 'super-key-bbbb' };

test('piloto exige expiresAt; datas e tier inválidos são recusados', () => {
    assert.throws(() => buildKeyIndex({ A: { ...base, tier: 'pilot' } }), /exige expiresAt/);
    assert.throws(() => buildKeyIndex({ A: { ...base, tier: 'pilot', expiresAt: 'amanhã' } }), /expiresAt/);
    assert.throws(() => buildKeyIndex({ A: { ...base, tier: 'trial' } }), /tier/);
    assert.strictEqual(buildKeyIndex({ A: base }).meta.get('A').tier, 'production');
});

test('piloto limita estações e histórico; produção mantém os padrões', () => {
    const pilot = buildKeyIndex({ A: { ...base, tier: 'pilot', expiresAt: future, maxAgents: 500 } }).meta.get('A');
    assert.strictEqual(pilot.maxAgents, 25);
    assert.strictEqual(pilot.historyMax, 500);
    assert.strictEqual(buildKeyIndex({ A: { ...base, tier: 'pilot', expiresAt: future } }).meta.get('A').maxAgents, 25);
    assert.strictEqual(buildKeyIndex({ A: { ...base, tier: 'pilot', expiresAt: future, maxAgents: 10 } }).meta.get('A').maxAgents, 10);
    const prod = buildKeyIndex({ A: { ...base, maxAgents: 300 } }).meta.get('A');
    assert.strictEqual(prod.maxAgents, 300);
    assert.ok(prod.historyMax >= 500);
});

function connect(port, key) {
    return new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const out = { msgs: [], code: null };
        ws.on('open', () => ws.send(JSON.stringify({ type: 'AUTH', key })));
        ws.on('message', (d) => { try { out.msgs.push(JSON.parse(d)); } catch (_) {} });
        ws.on('close', (code) => { out.code = code; resolve(out); });
        setTimeout(() => { if (out.code === null) { out.ws = ws; resolve(out); } }, 600);
    });
}

test('tenant expirado é recusado com 4010; piloto válido informa tier e validade', async () => {
    const relay = createRelay();
    await new Promise(r => relay.server.listen(0, '127.0.0.1', r));
    const port = relay.server.address().port;
    try {
        const expiredAgent = await connect(port, 'agent-key-nexus-1');
        assert.strictEqual(expiredAgent.code, 4010);
        const expiredSup = await connect(port, 'super-key-nexus-1');
        assert.strictEqual(expiredSup.code, 4010);

        const sup = await connect(port, 'super-key-apex-1');
        const init = sup.msgs.find(m => m.type === 'INIT_STATE');
        assert.strictEqual(init.tier, 'pilot');
        assert.strictEqual(init.expiresAt, future);
        if (sup.ws) sup.ws.close();

        const agent = await connect(port, 'agent-key-apex-1');
        const ok = agent.msgs.find(m => m.type === 'AUTH_OK');
        assert.strictEqual(ok.tier, 'pilot');
        if (agent.ws) agent.ws.close();

        const prod = await connect(port, 'super-key-stellar-1');
        assert.strictEqual(prod.msgs.find(m => m.type === 'INIT_STATE').tier, 'production');
        if (prod.ws) prod.ws.close();
    } finally {
        await relay.shutdown();
    }
});

test('/api/validate-tenant devolve 403 LICENSE_EXPIRED para tenant vencido', async () => {
    const relay = createRelay();
    await new Promise(r => relay.server.listen(0, '127.0.0.1', r));
    const port = relay.server.address().port;
    try {
        const r = await fetch(`http://127.0.0.1:${port}/api/validate-tenant`, { headers: { 'X-Tenant-Key': 'super-key-nexus-1' } });
        assert.strictEqual(r.status, 403);
        assert.strictEqual((await r.json()).code, 'LICENSE_EXPIRED');
        const ok = await fetch(`http://127.0.0.1:${port}/api/validate-tenant`, { headers: { 'X-Tenant-Key': 'super-key-apex-1' } });
        assert.strictEqual(ok.status, 200);
    } finally {
        await relay.shutdown();
    }
});
