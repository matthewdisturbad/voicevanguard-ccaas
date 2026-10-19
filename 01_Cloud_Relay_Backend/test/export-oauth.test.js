const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-export-oauth-'));
process.env.TENANTS_JSON = JSON.stringify({
    'BPO-APEX-GLOBAL': {
        name: 'Apex', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-apex-1', supervisorKey: 'super-key-apex-1',
        genesys: { orgId: '11111111-1111-1111-1111-111111111111', region: 'mypurecloud.com', clientId: 'client-apex', supervisorRoles: ['VoiceVanguard Supervisor'] }
    }
});
const { createRelay } = require('../server');

const ME = {
    'tok-supervisor-0000000001': { name: 'Sup', organization: { id: '11111111-1111-1111-1111-111111111111' }, authorization: { roles: [{ name: 'VoiceVanguard Supervisor' }] } },
    'tok-agent-without-role-001': { name: 'Ag', organization: { id: '11111111-1111-1111-1111-111111111111' }, authorization: { roles: [{ name: 'Agent' }] } }
};

test('/api/calls.csv aceita token OAuth de supervisor do Genesys e recusa o que não for', async () => {
    const relay = createRelay({ genesysFetch: async (token) => { if (!ME[token]) throw new Error('HTTP 401'); return ME[token]; } });
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const get = (headers) => new Promise((resolve) => http.get({ port, path: '/api/calls.csv', headers }, res => {
        let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }));
    try {
        const ag = new WebSocket(`ws://localhost:${port}`);
        ag.on('open', () => ag.send(JSON.stringify({ type: 'AUTH', key: 'agent-key-apex-1', agentId: 'PA-1' })));
        await new Promise(r => setTimeout(r, 300));
        ag.send(JSON.stringify({ type: 'CALL_AUDIT_SUMMARY', interactionId: 'CONV-OAUTH-1', mosMedio: 4.1, classificacao: 'BOA', endTime: new Date().toISOString() }));
        await new Promise(r => setTimeout(r, 300));

        const ok = await get({ Authorization: 'Bearer tok-supervisor-0000000001', 'X-Genesys-Region': 'mypurecloud.com' });
        assert.strictEqual(ok.status, 200);
        assert.ok(ok.body.includes('CONV-OAUTH-1'));
        assert.strictEqual((await get({ Authorization: 'Bearer tok-agent-without-role-001', 'X-Genesys-Region': 'mypurecloud.com' })).status, 403, 'sem papel de supervisor');
        assert.strictEqual((await get({ Authorization: 'Bearer tok-desconhecido-0000000001', 'X-Genesys-Region': 'mypurecloud.com' })).status, 403, 'token inválido');
        assert.strictEqual((await get({ Authorization: 'Bearer tok-supervisor-0000000001', 'X-Genesys-Region': 'evil.com' })).status, 403, 'região fora da lista');
        assert.strictEqual((await get({ Authorization: 'Bearer tok-supervisor-0000000001' })).status, 403, 'sem região');
        ag.close();
    } finally {
        await relay.shutdown();
    }
});
