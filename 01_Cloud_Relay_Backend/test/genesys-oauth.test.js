const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-oauth-'));
process.env.TENANTS_JSON = JSON.stringify({
    'BPO-APEX-GLOBAL': {
        name: 'Apex Global', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-apex-1', supervisorKey: 'super-key-apex-1',
        genesys: { orgId: '11111111-1111-1111-1111-111111111111', region: 'mypurecloud.com', clientId: 'client-apex', supervisorRoles: ['VoiceVanguard Supervisor'] }
    },
    'BPO-NEXUS-CORP': { name: 'Nexus', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-nexus-1', supervisorKey: 'super-key-nexus-1' }
});
const { createRelay, buildKeyIndex } = require('../server');

const ME = {
    'tok-supervisor-0000000001': { name: 'Sup Teste', organization: { id: '11111111-1111-1111-1111-111111111111' }, authorization: { roles: [{ name: 'VoiceVanguard Supervisor' }] } },
    'tok-agent-without-role-001': { name: 'Agente', organization: { id: '11111111-1111-1111-1111-111111111111' }, authorization: { roles: [{ name: 'Agent' }] } },
    'tok-other-org-0000000001': { name: 'Outro', organization: { id: '22222222-2222-2222-2222-222222222222' }, authorization: { roles: [{ name: 'VoiceVanguard Supervisor' }] } }
};
const calls = [];
let relay, port;
test.before(async () => {
    relay = createRelay({ genesysFetch: async (token, region) => { calls.push(region); if (!ME[token]) throw new Error('HTTP 401'); return ME[token]; } });
    await new Promise(r => relay.server.listen(0, r));
    port = relay.server.address().port;
});
test.after(async () => { await relay.shutdown(); });

const auth = (oauth) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const out = { msgs: [], code: null };
    ws.on('message', m => out.msgs.push(JSON.parse(m)));
    ws.on('error', () => {});
    ws.on('open', () => ws.send(JSON.stringify({ type: 'AUTH', oauth })));
    ws.on('close', c => { out.code = c; resolve(out); });
    setTimeout(() => { out.ws = ws; resolve(out); }, 600);
});
const get = (p) => new Promise((resolve) => http.get({ port, path: p }, res => {
    let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b }));
}));

test('supervisor com token Genesys válido entra no tenant da sua organização', async () => {
    const r = await auth({ token: 'tok-supervisor-0000000001', region: 'mypurecloud.com' });
    const init = r.msgs.find(m => m.type === 'INIT_STATE');
    assert.ok(init, 'esperava INIT_STATE');
    assert.strictEqual(init.tenant, 'Apex Global');
    r.ws && r.ws.close();
});

test('token sem papel de supervisor, de outra organização ou inválido é recusado', async () => {
    for (const token of ['tok-agent-without-role-001', 'tok-other-org-0000000001', 'tok-desconhecido-00000001']) {
        const r = await auth({ token, region: 'mypurecloud.com' });
        assert.strictEqual(r.code, 4001, token);
        assert.ok(!r.msgs.some(m => m.type === 'INIT_STATE'));
    }
});

test('região fora da lista ou token malformado nem chega a chamar o Genesys', async () => {
    const before = calls.length;
    for (const oauth of [{ token: 'tok-supervisor-0000000001', region: 'evil.example.com' }, { token: 'curto', region: 'mypurecloud.com' }, 'texto', {}]) {
        const r = await auth(oauth);
        assert.strictEqual(r.code, 4001);
    }
    assert.strictEqual(calls.length, before);
});

test('/api/auth-config só expõe clientId e região de tenants com Genesys configurado', async () => {
    const ok = await get('/api/auth-config?tenant=BPO-APEX-GLOBAL');
    assert.strictEqual(ok.status, 200);
    assert.deepStrictEqual(JSON.parse(ok.body), { provider: 'genesys', region: 'mypurecloud.com', clientId: 'client-apex', tenant: 'Apex Global' });
    assert.strictEqual((await get('/api/auth-config?tenant=BPO-NEXUS-CORP')).status, 404);
    assert.strictEqual((await get('/api/auth-config?tenant=NAO-EXISTE')).status, 404);
});

test('configuração Genesys inválida ou duplicada falha na subida', () => {
    const base = { agentKey: 'agent-key-aaaa-1', supervisorKey: 'super-key-aaaa-1' };
    const g = { orgId: '11111111-1111-1111-1111-111111111111', region: 'mypurecloud.com', supervisorRoles: ['X'] };
    assert.throws(() => buildKeyIndex({ A: { ...base, genesys: { ...g, region: 'evil.com' } } }));
    assert.throws(() => buildKeyIndex({ A: { ...base, genesys: { ...g, supervisorRoles: [] } } }));
    assert.throws(() => buildKeyIndex({ A: { ...base, genesys: g }, B: { agentKey: 'agent-key-bbbb-1', supervisorKey: 'super-key-bbbb-1', genesys: g } }));
});
