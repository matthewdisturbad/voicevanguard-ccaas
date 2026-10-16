// Roteamento por torre (operação): org fictícia com 4 torres, PAs com agentId repetido entre torres e 3 supervisores.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

const TOWERS = ['FRAUDES', 'EMPRESTIMO', 'CARTOES', 'COBRANCA'];
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-towers-'));
process.env.TENANTS_JSON = JSON.stringify({
    'BPO-APEX-GLOBAL': {
        name: 'Apex Global (teste)', plan: 'Enterprise', maxAgents: 100,
        towers: Object.fromEntries(TOWERS.map(t => [t, { agentKey: `agent-key-${t}` }])),
        supervisors: [
            { key: 'sup-key-fraudes', name: 'Sup Fraudes', towers: ['FRAUDES'] },
            { key: 'sup-key-fraudes-cartoes', name: 'Sup Fraudes+Cartões', towers: ['FRAUDES', 'CARTOES'] },
            { key: 'sup-key-geral', name: 'Gerência', towers: '*' }
        ]
    },
    'LEGADO': { name: 'Legado', agentKey: 'legacy-agent-key', supervisorKey: 'legacy-super-key' }
});
const { createRelay } = require('../server');

let relay, port;
test.before(async () => {
    relay = createRelay();
    await new Promise(r => relay.server.listen(0, r));
    port = relay.server.address().port;
});
test.after(async () => { await relay.shutdown(); });

const wait = ms => new Promise(r => setTimeout(r, ms));
const connect = query => new Promise(resolve => {
    const ws = new WebSocket(`ws://localhost:${port}?${query}`);
    const c = { ws, msgs: [], code: null };
    ws.on('message', m => c.msgs.push(JSON.parse(m)));
    ws.on('open', () => resolve(c));
    ws.on('error', () => {});
    ws.on('close', code => { c.code = code; resolve(c); });
});
const sup = key => connect(`key=${key}`);
const agent = (tower, id) => connect(`key=agent-key-${tower}&agentId=${id}`);
const of = (c, type) => c.msgs.filter(m => m.type === type);
const seen = c => of(c, 'TELEMETRY_UPDATE').map(m => `${m.payload.tower}:${m.payload.agentId}`).sort();
const telemetry = (a, extra = {}) => a.ws.send(JSON.stringify({ type: 'AGENT_TELEMETRY', mosScore: '4.2', ...extra }));

test('isolamento de telemetria, auditoria, comandos e offline por torre', async () => {
    const sFraudes = await sup('sup-key-fraudes');
    const sFC = await sup('sup-key-fraudes-cartoes');
    const sGeral = await sup('sup-key-geral');
    const agents = {};
    for (const t of TOWERS) agents[t] = [await agent(t, 'PA-001'), await agent(t, 'PA-002')];
    for (const t of TOWERS) agents[t].forEach(a => telemetry(a));
    await wait(300);

    assert.deepStrictEqual(seen(sFraudes), ['FRAUDES:PA-001', 'FRAUDES:PA-002']);
    assert.deepStrictEqual(seen(sFC), ['CARTOES:PA-001', 'CARTOES:PA-002', 'FRAUDES:PA-001', 'FRAUDES:PA-002']);
    assert.strictEqual(seen(sGeral).length, 8);

    // supervisor que entra depois recebe estado inicial filtrado
    const late = await sup('sup-key-fraudes');
    await wait(150);
    const init = of(late, 'INIT_STATE')[0];
    assert.deepStrictEqual(init.agents.map(a => a.tower).sort(), ['FRAUDES', 'FRAUDES']);
    assert.deepStrictEqual(init.towers, ['FRAUDES']);

    // auditoria de chamadas
    const audit = id => ({ type: 'CALL_AUDIT_SUMMARY', interactionId: id, mosMedio: 4.1, durationSeconds: 30 });
    agents.EMPRESTIMO[0].ws.send(JSON.stringify(audit('CALL-EMP')));
    agents.FRAUDES[0].ws.send(JSON.stringify(audit('CALL-FRA')));
    await wait(250);
    const calls = c => of(c, 'NEW_CALL_AUDIT').map(m => m.payload.interactionId).sort();
    assert.deepStrictEqual(calls(sFraudes), ['CALL-FRA']);
    assert.deepStrictEqual(calls(sGeral), ['CALL-EMP', 'CALL-FRA']);
    assert.ok(!calls(sFC).includes('CALL-EMP'));

    // comando: só a PA da torre do supervisor recebe, mesmo com agentId repetido
    sFraudes.ws.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND', targetAgentId: 'PA-001', command: 'SAFE_CACHE_CLEAR' }));
    await wait(250);
    const cmds = a => of(a, 'EXECUTE_COMMAND').length;
    assert.strictEqual(cmds(agents.FRAUDES[0]), 1);
    assert.strictEqual(cmds(agents.EMPRESTIMO[0]), 0);
    assert.strictEqual(cmds(agents.CARTOES[0]), 0);

    // offline
    agents.CARTOES[0].ws.close();
    await wait(250);
    const off = c => of(c, 'TELEMETRY_UPDATE').filter(m => m.payload.status === 'OFFLINE').length;
    assert.strictEqual(off(sFC), 1);
    assert.strictEqual(off(sFraudes), 0);

    for (const c of [sFraudes, sFC, sGeral, late, ...Object.values(agents).flat()]) c.ws.close();
});

test('In-Call Lock no servidor: comando durante chamada é enfileirado e liberado ao fim', async () => {
    const s = await sup('sup-key-fraudes');
    const a = await agent('FRAUDES', 'PA-LOCK');
    telemetry(a, { callActive: true });
    await wait(150);
    s.ws.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND', targetAgentId: 'PA-LOCK', command: 'SAFE_CACHE_CLEAR' }));
    await wait(200);
    assert.strictEqual(of(a, 'EXECUTE_COMMAND').length, 0, 'não pode executar durante a chamada');
    assert.ok(of(s, 'AGENT_COMMAND_FEEDBACK').some(m => m.result.inCall === true));
    telemetry(a, { callActive: false });
    await wait(200);
    assert.strictEqual(of(a, 'EXECUTE_COMMAND').length, 1, 'libera no pós-chamada');
    s.ws.close(); a.ws.close();
});

test('chaves inválidas e papéis', async () => {
    const bad = await connect('key=chave-errada-123');
    await wait(150);
    assert.strictEqual(bad.code, 4001);
    // chave de agente com type=supervisor não vira supervisor
    const a = await connect('key=agent-key-FRAUDES&type=supervisor&agentId=PA-X');
    await wait(100);
    assert.ok(!of(a, 'INIT_STATE').length);
    a.ws.close();
});

test('mesmo agentId na mesma torre é recusado (4009), em torres diferentes é permitido', async () => {
    const a1 = await agent('FRAUDES', 'PA-DUP');
    const a2 = await agent('FRAUDES', 'PA-DUP');
    const a3 = await agent('CARTOES', 'PA-DUP');
    await wait(100);
    assert.strictEqual(a2.code, 4009);
    assert.strictEqual(a3.code, null);
    a1.ws.close(); a3.ws.close();
});

test('tenant sem torres continua funcionando (supervisor vê todo o tenant)', async () => {
    const s = await connect('key=legacy-super-key');
    const a = await connect('key=legacy-agent-key&agentId=PA-L1');
    telemetry(a);
    await wait(200);
    assert.strictEqual(of(s, 'TELEMETRY_UPDATE').length, 1);
    s.ws.close(); a.ws.close();
});

test('configuração inválida de torres é rejeitada na inicialização', () => {
    const { buildKeyIndex } = require('../server');
    assert.throws(() => buildKeyIndex({ X: { towers: { A: { agentKey: 'curta' } }, supervisors: [{ key: 'supervisor-key-1', towers: '*' }] } }));
    assert.throws(() => buildKeyIndex({ X: { towers: { A: { agentKey: 'agent-key-AAA' } }, supervisors: [{ key: 'supervisor-key-1', towers: ['INEXISTENTE'] }] } }));
    assert.throws(() => buildKeyIndex({ X: { towers: { A: { agentKey: 'same-key-12345' } }, supervisors: [{ key: 'same-key-12345', towers: '*' }] } }));
});
