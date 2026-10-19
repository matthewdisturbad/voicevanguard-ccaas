const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-batch-'));
process.env.TENANTS_JSON = JSON.stringify({
    'BPO-APEX-GLOBAL': {
        name: 'Apex', plan: 'Std', maxAgents: 50,
        towers: { FRAUDES: { agentKey: 'agent-key-fraudes-1' }, VENDAS: { agentKey: 'agent-key-vendas-1' } },
        supervisors: [{ key: 'super-key-todas-1', name: 'Todas', towers: '*' }, { key: 'super-key-fraudes-1', name: 'Fraudes', towers: ['FRAUDES'] }]
    }
});
const { createRelay } = require('../server');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('limpeza em lote: respeita escopo da torre, In-Call Lock, levas e uma leva por vez', async () => {
    const relay = createRelay({ batchWaveMs: 150 });
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const open = (auth) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.msgs = [];
        ws.on('message', d => ws.msgs.push(JSON.parse(d)));
        ws.on('open', () => ws.send(JSON.stringify(auth)));
        setTimeout(() => resolve(ws), 250);
    });
    const telemetry = (ws, id, inCall) => ws.send(JSON.stringify({ type: 'AGENT_TELEMETRY', station: id, mosScore: 4.2, callActive: inCall, currentCallId: inCall ? 'C-' + id : '' }));
    const agents = [];
    try {
        // 12 estações em FRAUDES (a 12ª em chamada) e 1 em VENDAS
        for (let i = 0; i < 12; i++) {
            const a = await open({ type: 'AUTH', key: 'agent-key-fraudes-1', agentId: `PA-F${i}` });
            a.cmds = [];
            a.on('message', d => { const m = JSON.parse(d); if (m.type === 'EXECUTE_COMMAND') a.cmds.push(m); });
            agents.push(a);
        }
        const v = await open({ type: 'AUTH', key: 'agent-key-vendas-1', agentId: 'PA-V0' });
        v.cmds = []; v.on('message', d => { const m = JSON.parse(d); if (m.type === 'EXECUTE_COMMAND') v.cmds.push(m); });
        agents.forEach((a, i) => telemetry(a, `PA-F${i}`, i === 11));
        telemetry(v, 'PA-V0', false);
        await wait(250);

        const supF = await open({ type: 'AUTH', key: 'super-key-fraudes-1' });
        const targets = [...Array.from({ length: 12 }, (_, i) => ({ agentId: `PA-F${i}`, tower: 'FRAUDES' })), { agentId: 'PA-V0', tower: 'VENDAS' }, { agentId: 'PA-F0', tower: 'FRAUDES' }];
        supF.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND_BATCH', command: 'SAFE_CACHE_CLEAR', targets }));
        await wait(80);
        const ack = supF.msgs.find(m => m.type === 'BATCH_ACK');
        assert.ok(ack && ack.total === 12 && ack.waves === 2, JSON.stringify(ack));

        // segunda solicitação enquanto a primeira roda é recusada
        supF.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND_BATCH', command: 'SAFE_CACHE_CLEAR', targets: [{ agentId: 'PA-F1', tower: 'FRAUDES' }] }));
        await wait(30);
        assert.ok(supF.msgs.some(m => m.type === 'BATCH_ACK' && m.busy === true));

        // primeira leva: 10 estações; a segunda leva ainda não rodou
        const sentNow = agents.slice(0, 10).filter(a => a.cmds.length === 1).length;
        assert.strictEqual(sentNow, 10);
        assert.strictEqual(agents[10].cmds.length, 0, 'segunda leva só depois do intervalo');

        await wait(250);
        assert.strictEqual(agents[10].cmds.length, 1);
        assert.strictEqual(agents[11].cmds.length, 0, 'em chamada: não executa');
        assert.strictEqual(v.cmds.length, 0, 'torre fora do escopo do supervisor');
        const queued = supF.msgs.filter(m => m.type === 'AGENT_COMMAND_FEEDBACK' && m.result.code === 'IN_CALL_QUEUED');
        assert.strictEqual(queued.length, 1);
        const done = supF.msgs.find(m => m.type === 'BATCH_DONE');
        assert.ok(done && done.delivered === 12 && done.absent === 0, JSON.stringify(done));

        // terminou a chamada: o comando enfileirado é liberado no pós-atendimento
        telemetry(agents[11], 'PA-F11', false);
        await wait(200);
        assert.strictEqual(agents[11].cmds.length, 1);

        // nova leva liberada depois de terminar
        supF.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND_BATCH', command: 'SAFE_CACHE_CLEAR', targets: [{ agentId: 'PA-F1', tower: 'FRAUDES' }] }));
        await wait(100);
        assert.ok(supF.msgs.filter(m => m.type === 'BATCH_ACK' && !m.busy).length === 2);

        // comando fora da lista branca é ignorado
        const before = supF.msgs.length;
        supF.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND_BATCH', command: 'RM_RF', targets }));
        await wait(100);
        assert.strictEqual(supF.msgs.length, before);
        for (const w of [supF, v, ...agents]) w.close();
    } finally {
        await relay.shutdown();
    }
});
