const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-station-'));
const SECRET = 'segredo-estacao-0123456789';
const PREV = 'segredo-anterior-0123456789';
process.env.TENANTS_JSON = JSON.stringify({
    'BPO-APEX-GLOBAL': {
        name: 'Apex Global', plan: 'Std', maxAgents: 5,
        towers: { FRAUDES: { agentKey: 'agent-key-fraudes-1', stationSecret: SECRET, stationSecretPrev: PREV, epoch: 2, revoked: ['PA-REVOGADA'] } },
        supervisors: [{ key: 'super-key-apex-2', name: 'Sup', towers: '*' }]
    },
    'BPO-NEXUS-CORP': { name: 'Nexus', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-nexus-1', supervisorKey: 'super-key-nexus-1' }
});
const { createRelay, buildKeyIndex } = require('../server');
const { mintStationCredential, verifyStationCredential } = require('../station-credential');

const NOW = Math.floor(Date.now() / 1000);
const exp = NOW + 3600;
const mint = (o = {}) => mintStationCredential({ secret: SECRET, tenantId: 'BPO-APEX-GLOBAL', tower: 'FRAUDES', stationId: 'PA-AAAA1111', exp, epoch: 2, ...o });
const scopes = () => buildKeyIndex(JSON.parse(process.env.TENANTS_JSON)).stations;

test('credencial válida é aceita; tenant, torre e estação saem da assinatura', () => {
    const v = verifyStationCredential(mint(), scopes(), NOW);
    assert.deepStrictEqual({ t: v.tenantId, w: v.tower, s: v.stationId }, { t: 'BPO-APEX-GLOBAL', w: 'FRAUDES', s: 'PA-AAAA1111' });
});

test('rejeita expirada, adulterada, epoch errado, segredo errado, outra torre e revogada', () => {
    const sc = scopes();
    assert.strictEqual(verifyStationCredential(mint({ exp: NOW - 1 }), sc, NOW), null, 'expirada');
    const parts = mint().split('.');
    assert.strictEqual(verifyStationCredential([...parts.slice(0, 3), 'PA-OUTRA', ...parts.slice(4)].join('.'), sc, NOW), null, 'estação trocada');
    assert.strictEqual(verifyStationCredential([...parts.slice(0, 1), 'BPO-NEXUS-CORP', ...parts.slice(2)].join('.'), sc, NOW), null, 'tenant trocado');
    assert.strictEqual(verifyStationCredential(mint({ epoch: 1 }), sc, NOW), null, 'epoch antigo');
    assert.strictEqual(verifyStationCredential(mint({ secret: 'outro-segredo-0123456789' }), sc, NOW), null, 'segredo errado');
    assert.strictEqual(verifyStationCredential(mint({ tower: 'OUTRA' }), sc, NOW), null, 'torre sem escopo');
    assert.strictEqual(verifyStationCredential(mint({ stationId: 'PA-REVOGADA' }), sc, NOW), null, 'revogada');
    assert.strictEqual(verifyStationCredential('vv1.lixo', sc, NOW), null);
    assert.strictEqual(verifyStationCredential(undefined, sc, NOW), null);
});

test('stationSecretPrev continua valendo durante a rotação', () => {
    assert.ok(verifyStationCredential(mint({ secret: PREV }), scopes(), NOW));
});

test('configuração inválida falha na subida', () => {
    const base = (t) => ({ T1: { agentKey: 'aaaaaaaa1', supervisorKey: 'bbbbbbbb1', ...t } });
    assert.throws(() => buildKeyIndex(base({ stationSecret: 'curto' })), /stationSecret/);
    assert.throws(() => buildKeyIndex(base({ stationSecret: 'aaaaaaaa1' })), /stationSecret/);
    assert.throws(() => buildKeyIndex(base({ stationSecret: SECRET, epoch: 0 })), /epoch/);
    assert.throws(() => buildKeyIndex(base({ stationSecret: SECRET, revoked: ['a b'] })), /revoked/);
    assert.throws(() => buildKeyIndex(base({ epoch: 3 })), /exigem stationSecret/);
    assert.throws(() => buildKeyIndex(base({ allowTowerKey: false })), /exige stationSecret/);
});

test('allowTowerKey:false remove a chave compartilhada, mas a credencial individual segue valendo', () => {
    const cfg = { T1: { agentKey: 'agent-key-t1-aaa', supervisorKey: 'super-key-t1-bbb', stationSecret: SECRET, allowTowerKey: false } };
    const { index, stations } = buildKeyIndex(cfg);
    const crypto = require('node:crypto');
    assert.ok(!index.has(crypto.createHash('sha256').update('agent-key-t1-aaa').digest('hex')));
    assert.ok(verifyStationCredential(mintStationCredential({ secret: SECRET, tenantId: 'T1', stationId: 'PA-1', exp }), stations, NOW));
});

test('relay: autentica com a credencial, força o id da estação e mantém a chave antiga da torre', async () => {
    const relay = createRelay();
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const open = (key, agentId) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        const out = { msgs: [], code: null, ws };
        ws.on('message', m => out.msgs.push(JSON.parse(m)));
        ws.on('close', c => { out.code = c; });
        ws.on('error', () => {});
        ws.on('open', () => ws.send(JSON.stringify({ type: 'AUTH', key, agentId })));
        setTimeout(() => resolve(out), 400);
    });
    try {
        const ok = await open(mint(), 'PA-FORJADA');
        assert.strictEqual(ok.code, null);
        assert.strictEqual(ok.msgs.find(m => m.type === 'AUTH_OK').agentId, 'PA-AAAA1111', 'id vem da credencial, não do cliente');
        const dup = await open(mint(), 'x');
        assert.strictEqual(dup.code, 4009, 'mesma estação não conecta duas vezes');
        const bad = await open(mint({ stationId: 'PA-REVOGADA' }));
        assert.strictEqual(bad.code, 4001);
        const old = await open('agent-key-fraudes-1', 'PA-LEGADO1');
        assert.strictEqual(old.code, null, 'chave compartilhada da torre segue aceita na migração');
        ok.ws.close(); old.ws.close();
    } finally {
        await relay.shutdown();
    }
});

test('cadastro: troca o enrollToken por credencial individual, respeita o teto e não abre telemetria', async () => {
    const cfg = { T1: { agentKey: 'agent-key-t1-aaa', supervisorKey: 'super-key-t1-bbb', stationSecret: SECRET, enrollToken: 'enroll-token-t1-0123456789', maxStations: 2, credentialDays: 30 } };
    const prevTenants = process.env.TENANTS_JSON;
    process.env.TENANTS_JSON = JSON.stringify(cfg);
    const relay = createRelay();
    process.env.TENANTS_JSON = prevTenants;
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const talk = (msg) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        const out = { msgs: [], code: null };
        ws.on('message', m => out.msgs.push(JSON.parse(m)));
        ws.on('close', c => { out.code = c; resolve(out); });
        ws.on('error', () => {});
        ws.on('open', () => ws.send(JSON.stringify(msg)));
        setTimeout(() => { ws.close(); }, 800);
    });
    try {
        const a = await talk({ type: 'ENROLL', enrollToken: 'enroll-token-t1-0123456789', stationId: 'PA-E1' });
        const ok = a.msgs.find(m => m.type === 'ENROLL_OK');
        assert.ok(ok, 'esperava ENROLL_OK');
        const v = verifyStationCredential(ok.credential, buildKeyIndex(cfg).stations);
        assert.deepStrictEqual({ t: v.tenantId, s: v.stationId }, { t: 'T1', s: 'PA-E1' });
        assert.ok(ok.exp - Math.floor(Date.now() / 1000) <= 30 * 86400 + 5);
        await talk({ type: 'ENROLL', enrollToken: 'enroll-token-t1-0123456789', stationId: 'PA-E2' });
        const again = await talk({ type: 'ENROLL', enrollToken: 'enroll-token-t1-0123456789', stationId: 'PA-E1' });
        assert.ok(again.msgs.find(m => m.type === 'ENROLL_OK'), 'recadastrar a mesma estação não consome o teto');
        const over = await talk({ type: 'ENROLL', enrollToken: 'enroll-token-t1-0123456789', stationId: 'PA-E3' });
        assert.strictEqual(over.code, 4003, 'teto de estações');
        const bad = await talk({ type: 'ENROLL', enrollToken: 'token-errado-0123456789', stationId: 'PA-E4' });
        assert.strictEqual(bad.code, 4001);
        const asKey = await talk({ type: 'AUTH', key: 'enroll-token-t1-0123456789', agentId: 'PA-X' });
        assert.strictEqual(asKey.code, 4001, 'o token de cadastro não autentica telemetria');
    } finally {
        await relay.shutdown();
    }
});

test('configuração do cadastro: token distinto, limites válidos', () => {
    const base = (t) => ({ T1: { agentKey: 'aaaaaaaa1', supervisorKey: 'bbbbbbbb1', stationSecret: SECRET, ...t } });
    assert.throws(() => buildKeyIndex(base({ enrollToken: 'curto' })), /enrollToken/);
    assert.throws(() => buildKeyIndex(base({ enrollToken: SECRET })), /enrollToken/);
    assert.throws(() => buildKeyIndex(base({ enrollToken: 'enroll-token-0123456789', credentialDays: 900 })), /credentialDays/);
    assert.throws(() => buildKeyIndex(base({ maxStations: 5 })), /exigem enrollToken/);
});

test('AUTH_OK informa a região Genesys do tenant ao agente (para a sonda do pré-check)', async () => {
    const cfg = { T1: { agentKey: 'agent-key-t1-aaa', supervisorKey: 'super-key-t1-bbb', genesys: { orgId: '11111111-1111-1111-1111-111111111111', region: 'sae1.pure.cloud', supervisorRoles: ['Sup'] } },
                  T2: { agentKey: 'agent-key-t2-aaa', supervisorKey: 'super-key-t2-bbb' } };
    const prev = process.env.TENANTS_JSON;
    process.env.TENANTS_JSON = JSON.stringify(cfg);
    const relay = createRelay();
    process.env.TENANTS_JSON = prev;
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const authOk = (key) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('message', m => { const d = JSON.parse(m); if (d.type === 'AUTH_OK') { ws.close(); resolve(d); } });
        ws.on('open', () => ws.send(JSON.stringify({ type: 'AUTH', key, agentId: 'PA-R1' })));
        setTimeout(() => { ws.close(); resolve(null); }, 800);
    });
    try {
        assert.strictEqual((await authOk('agent-key-t1-aaa')).genesysRegion, 'sae1.pure.cloud');
        assert.strictEqual((await authOk('agent-key-t2-aaa')).genesysRegion, null);
    } finally {
        await relay.shutdown();
    }
});
