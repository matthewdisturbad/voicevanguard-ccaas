const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-webhook-'));
const SECRET = 'segredo-webhook-0123456789';
process.env.TENANTS_JSON = JSON.stringify({
    'BPO-APEX-GLOBAL': {
        name: 'Apex Global', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-apex-1', supervisorKey: 'super-key-apex-1',
        webhook: { url: 'https://alertas.example.com/hook', secret: SECRET, events: ['CALL_CRITICAL', 'AUDIO_INCIDENT'] }
    },
    'BPO-NEXUS-CORP': { name: 'Nexus', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-nexus-1', supervisorKey: 'super-key-nexus-1' }
});
const { createRelay, buildKeyIndex } = require('../server');
const { validateWebhookConfig, isPrivateAddress, sign, createWebhookDispatcher } = require('../webhook');

test('validateWebhookConfig exige https, segredo longo e eventos conhecidos', () => {
    const ok = validateWebhookConfig('T', { url: 'https://x.example.com/h', secret: SECRET });
    assert.ok(ok.events.has('CALL_CRITICAL') && ok.events.has('AUDIO_INCIDENT'));
    assert.strictEqual(validateWebhookConfig('T', undefined), null);
    assert.throws(() => validateWebhookConfig('T', { url: 'http://x.example.com', secret: SECRET }), /https/);
    assert.throws(() => validateWebhookConfig('T', { url: 'https://u:p@x.example.com', secret: SECRET }), /credenciais/);
    assert.throws(() => validateWebhookConfig('T', { url: 'https://x.example.com', secret: 'curto' }), /secret/);
    assert.throws(() => validateWebhookConfig('T', { url: 'https://x.example.com', secret: SECRET, events: ['OUTRO'] }), /events/);
    assert.throws(() => buildKeyIndex({ T1: { agentKey: 'aaaaaaaa1', supervisorKey: 'bbbbbbbb1', webhook: { url: 'nope', secret: SECRET } } }), /url/);
});

test('isPrivateAddress bloqueia loopback, redes privadas, link-local e metadata', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.3.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
        assert.ok(isPrivateAddress(ip), ip);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
});

test('dispatcher assina com HMAC, tenta de novo em 5xx e para em 4xx', async () => {
    const sent = [];
    let n = 0;
    const d = createWebhookDispatcher({ delays: [1, 1, 1], send: async (url, headers, body) => { sent.push({ url, headers, body }); return ++n < 3 ? 503 : 200; } });
    const cfg = validateWebhookConfig('T', { url: 'https://x.example.com/h', secret: SECRET });
    assert.strictEqual(await d.emit(cfg, 'CALL_CRITICAL', { mosMedio: 1.8 }), true);
    assert.strictEqual(sent.length, 3);
    const last = sent[2];
    assert.strictEqual(last.headers['X-VoiceVanguard-Signature'], sign(SECRET, last.headers['X-VoiceVanguard-Timestamp'], last.body));
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${last.headers['X-VoiceVanguard-Timestamp']}.${last.body}`).digest('hex');
    assert.strictEqual(last.headers['X-VoiceVanguard-Signature'], expected);
    assert.strictEqual(JSON.parse(last.body).event, 'CALL_CRITICAL');
    assert.strictEqual(new Set(sent.map(s => s.headers['X-VoiceVanguard-Delivery'])).size, 1, 'mesma entrega em todas as tentativas');

    sent.length = 0;
    const d4 = createWebhookDispatcher({ delays: [1, 1], send: async (u, h, b) => { sent.push(b); return 400; } });
    assert.strictEqual(await d4.emit(cfg, 'CALL_CRITICAL', {}), false);
    assert.strictEqual(sent.length, 1, '4xx não repete');

    const filtered = validateWebhookConfig('T', { url: 'https://x.example.com/h', secret: SECRET, events: ['AUDIO_INCIDENT'] });
    assert.strictEqual(d4.emit(filtered, 'CALL_CRITICAL', {}), null, 'evento fora da lista é ignorado');
});

test('relay envia alerta de chamada crítica sem o nome do operador e só para o tenant configurado', async () => {
    const sent = [];
    const relay = createRelay({ webhookSend: async (url, headers, body) => { sent.push({ url, headers, body: JSON.parse(body) }); return 200; } });
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const connect = (key, agentId) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => ws.send(JSON.stringify({ type: 'AUTH', key, agentId })));
        setTimeout(() => resolve(ws), 300);
    });
    const summary = (id) => JSON.stringify({ type: 'CALL_AUDIT_SUMMARY', interactionId: id, operator: 'Fulano de Tal', mosMedio: 1.7, classificacao: 'CRÍTICA', causaRaiz: 'WIFI', incidentesAudio: ['SEM_AUDIO_ENVIADO'], durationSeconds: 60 });
    const apex = await connect('agent-key-apex-1', 'PA-1');
    const nexus = await connect('agent-key-nexus-1', 'PB-1');
    try {
    apex.send(summary('CALL-A'));
    nexus.send(summary('CALL-B'));
    await new Promise(r => setTimeout(r, 400));
    const events = sent.map(s => s.body.event).sort();
    assert.deepStrictEqual(events, ['AUDIO_INCIDENT', 'CALL_CRITICAL']);
    assert.ok(sent.every(s => s.body.tenant === 'BPO-APEX-GLOBAL' && s.body.interactionId === 'CALL-A'), 'só o tenant com webhook alerta');
    assert.ok(!JSON.stringify(sent).includes('Fulano'), 'operador não vai no alerta');
    assert.ok(sent[0].headers['X-VoiceVanguard-Signature'].startsWith('sha256='));
    } finally {
        apex.close(); nexus.close();
        await relay.shutdown();
    }
});
