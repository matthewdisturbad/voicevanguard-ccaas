const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-demo-'));
process.env.TENANTS_JSON = JSON.stringify({
    'GENESYS-ALLIANCE-EVAL': {
        name: 'Demo', plan: 'Demo', maxAgents: 50, demo: true, demoSize: 12,
        towers: { VENDAS: { agentKey: 'demo-agent-vendas-1' }, SUPORTE: { agentKey: 'demo-agent-suporte-1' } },
        supervisors: [{ key: 'demo-super-key-1', name: 'Demo', towers: '*' }],
        webhook: { url: 'https://example.com/hook', secret: 'segredo-com-16-caracteres' }
    },
    'BPO-NEXUS-CORP': { name: 'Nexus', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-nexus-1', supervisorKey: 'super-key-nexus-1' }
});
const { createRelay } = require('../server');
const { createDemoSimulator } = require('../demo');

test('simulador: gera estações fictícias que mudam, terminam chamadas e variam o MOS', () => {
    let t = 1e12;
    const sim = createDemoSimulator({ towers: ['A', 'B'], size: 30, now: () => t });
    assert.strictEqual(sim.stations.length, 30);
    const hist = sim.seedHistory(20);
    assert.strictEqual(hist.length, 20);
    assert.ok(hist.every(h => /^DEMO-/.test(h.interactionId) && h.mosMedio >= 1 && h.mosMedio <= 4.5));
    let calls = 0, mos = new Set(), active = 0;
    for (let i = 0; i < 300; i++) {
        t += 2000;
        const r = sim.tick();
        calls += r.calls.length;
        for (const x of r.telemetry) { mos.add(x.mosScore); if (x.callActive) active++; assert.ok(/^PA-DEMO-\d{3}$/.test(x.agentId)); }
    }
    assert.ok(calls > 20, 'chamadas terminam e viram histórico');
    assert.ok(mos.size > 20, 'MOS varia');
    assert.ok(active > 0);
});

test('tenant demo: só roda com supervisor conectado, marca INIT_STATE como demo, recusa agente e não dispara webhook', async () => {
    let webhookCalls = 0;
    const relay = createRelay({ webhookSend: async () => { webhookCalls++; return 200; } });
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const connect = (auth) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        const msgs = [];
        ws.on('message', d => msgs.push(JSON.parse(d)));
        ws.on('open', () => ws.send(JSON.stringify(auth)));
        ws.on('close', (code) => { ws.closeCode = code; });
        setTimeout(() => resolve({ ws, msgs }), 400);
    });
    try {
        const agent = await connect({ type: 'AUTH', key: 'demo-agent-vendas-1', agentId: 'PA-X' });
        assert.strictEqual(agent.ws.closeCode, 4001, 'agente recusado no tenant demo');

        assert.strictEqual(relay.tenantRooms.get('GENESYS-ALLIANCE-EVAL')?.agents.size || 0, 0, 'nada roda sem supervisor');
        const sup = await connect({ type: 'AUTH', key: 'demo-super-key-1' });
        const init = sup.msgs.find(m => m.type === 'INIT_STATE');
        assert.ok(init && init.demo === true);
        assert.strictEqual(init.agents.length, 12);
        assert.ok(init.callHistory.length > 0 && init.stations.length === 12);
        assert.ok(init.agents.every(a => /^PA-DEMO-/.test(a.agentId)));

        await new Promise(r => setTimeout(r, 2300));
        assert.ok(sup.msgs.filter(m => m.type === 'TELEMETRY_UPDATE').length >= 12, 'telemetria ao vivo');

        sup.ws.close();
        await new Promise(r => setTimeout(r, 300));
        assert.strictEqual(relay.tenantRooms.get('GENESYS-ALLIANCE-EVAL').agents.size, 0, 'para e limpa sem supervisor');
        assert.strictEqual(webhookCalls, 0);

        const other = await connect({ type: 'AUTH', key: 'super-key-nexus-1' });
        assert.ok(other.msgs.find(m => m.type === 'INIT_STATE').demo === false);
        other.ws.close();
    } finally {
        await relay.shutdown();
    }
});
