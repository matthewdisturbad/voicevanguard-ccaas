// Modo de monitoramento (realtime / sampled / on_demand), "Medir agora" e caminho de mídia.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-mon-'));
const base = (n) => ({ name: n, plan: 'Std', maxAgents: 50 });
process.env.TENANTS_JSON = JSON.stringify({
    'BPO-APEX-GLOBAL': {
        ...base('Apex'), monitoringMode: 'on_demand', stunServers: ['stun:stun.example.com:3478'],
        towers: { FRAUDES: { agentKey: 'agent-key-fraudes-1' }, VENDAS: { agentKey: 'agent-key-vendas-1' } },
        supervisors: [{ key: 'super-key-todas-1', name: 'Todas', towers: '*' }, { key: 'super-key-fraudes-1', name: 'Fraudes', towers: ['FRAUDES'] }]
    },
    'BPO-NEXUS-CORP': { ...base('Nexus'), agentKey: 'agent-key-nexus-1', supervisorKey: 'super-key-nexus-1' }
});
const { createRelay, buildKeyIndex } = require('../server');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('configuração inválida de monitoringMode / stunServers é recusada; padrão é realtime', () => {
    const t = { agentKey: 'agent-key-aaaa', supervisorKey: 'super-key-bbbb' };
    assert.strictEqual(buildKeyIndex({ A: t }).meta.get('A').monitoringMode, 'realtime');
    assert.throws(() => buildKeyIndex({ A: { ...t, monitoringMode: 'turbo' } }), /monitoringMode/);
    assert.throws(() => buildKeyIndex({ A: { ...t, stunServers: ['http://evil.example.com'] } }), /stunServers/);
    assert.throws(() => buildKeyIndex({ A: { ...t, stunServers: ['stun:a.com', 'stun:b.com', 'stun:c.com', 'stun:d.com'] } }), /stunServers/);
    assert.deepStrictEqual(buildKeyIndex({ A: { ...t, stunServers: ['stun:stun.example.com'] } }).meta.get('A').stunServers, ['stun:stun.example.com']);
});

test('AUTH_OK/INIT_STATE trazem o modo; Medir agora respeita escopo, taxa e modo; mediaPath é sanitizado', async () => {
    const relay = createRelay();
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const open = (auth) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.msgs = [];
        ws.on('message', d => ws.msgs.push(JSON.parse(d)));
        ws.on('open', () => ws.send(JSON.stringify(auth)));
        setTimeout(() => resolve(ws), 250);
    });
    const opened = [];
    const track = (ws) => { opened.push(ws); return ws; };
    try {
        const a1 = track(await open({ type: 'AUTH', key: 'agent-key-fraudes-1', agentId: 'PA-F1' }));
        const a2 = track(await open({ type: 'AUTH', key: 'agent-key-vendas-1', agentId: 'PA-V1' }));
        const n1 = track(await open({ type: 'AUTH', key: 'agent-key-nexus-1', agentId: 'PA-N1' }));
        const ok = a1.msgs.find(m => m.type === 'AUTH_OK');
        assert.strictEqual(ok.monitoringMode, 'on_demand');
        assert.deepStrictEqual(ok.stunServers, ['stun:stun.example.com:3478']);
        assert.strictEqual(n1.msgs.find(m => m.type === 'AUTH_OK').monitoringMode, 'realtime');
        for (const a of [a1, a2]) { a.measures = []; a.on('message', d => { const m = JSON.parse(d); if (m.type === 'MEASURE_NOW') a.measures.push(m); }); }

        a1.send(JSON.stringify({ type: 'AGENT_TELEMETRY', station: 'PA-F1', mosScore: 4.2, callActive: true, mediaPath: 'tcp-relay', protocol: 'TCP' }));
        a2.send(JSON.stringify({ type: 'AGENT_TELEMETRY', station: 'PA-V1', mosScore: 4.2, mediaPath: '<script>x</script>' }));
        await wait(200);

        const supF = track(await open({ type: 'AUTH', key: 'super-key-fraudes-1' }));
        const init = supF.msgs.find(m => m.type === 'INIT_STATE');
        assert.strictEqual(init.monitoringMode, 'on_demand');
        assert.strictEqual(init.agents[0].mediaPath, 'tcp-relay');

        const supAll = track(await open({ type: 'AUTH', key: 'super-key-todas-1' }));
        assert.strictEqual(supAll.msgs.find(m => m.type === 'INIT_STATE').agents.find(a => a.agentId === 'PA-V1').mediaPath, 'N/D');

        // supervisor de FRAUDES tenta medir as duas estações: só a da sua torre recebe
        supF.send(JSON.stringify({ type: 'SUPERVISOR_MEASURE', seconds: 9999, targets: [{ agentId: 'PA-F1', tower: 'FRAUDES' }, { agentId: 'PA-V1', tower: 'VENDAS' }] }));
        await wait(150);
        const ack = supF.msgs.find(m => m.type === 'MEASURE_ACK');
        assert.deepStrictEqual({ total: ack.total, seconds: ack.seconds }, { total: 1, seconds: 120 });
        assert.strictEqual(a1.measures.length, 1);
        assert.strictEqual(a2.measures.length, 0);

        // segunda ordem logo em seguida é recusada (limite por tenant)
        supAll.send(JSON.stringify({ type: 'SUPERVISOR_MEASURE', targets: [{ agentId: 'PA-V1', tower: 'VENDAS' }] }));
        await wait(100);
        assert.ok(supAll.msgs.some(m => m.type === 'MEASURE_ACK' && m.busy === true));
        assert.strictEqual(a2.measures.length, 0);

        // tenant em tempo real: ordem não tem efeito
        const supN = track(await open({ type: 'AUTH', key: 'super-key-nexus-1' }));
        n1.measures = []; n1.on('message', d => { const m = JSON.parse(d); if (m.type === 'MEASURE_NOW') n1.measures.push(m); });
        supN.send(JSON.stringify({ type: 'SUPERVISOR_MEASURE', targets: [{ agentId: 'PA-N1', tower: null }] }));
        await wait(100);
        assert.ok(supN.msgs.some(m => m.type === 'MEASURE_ACK' && m.mode === 'realtime' && m.total === 0));
        assert.strictEqual(n1.measures.length, 0);
    } finally {
        opened.forEach(w => { try { w.close(); } catch (_) {} });
        await relay.shutdown();
    }
});
