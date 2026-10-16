/**
 * Teste end-to-end de roteamento por torre (operação).
 * Cria uma org fictícia com 4 torres, sobe o relay, conecta agentes e supervisores reais
 * via WebSocket e verifica o isolamento. Uso: node test_towers_e2e.js
 */
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = require('assert');

const PORT = 9393;
const TENANT = 'BPO-ORION-TESTE';
const TOWERS = ['FRAUDES', 'EMPRESTIMO', 'CARTOES', 'COBRANCA'];
const agentKey = t => `agent-key-${t}`;
const SUPS = {
    'sup-fraudes': { name: 'Sup Fraudes', towers: ['FRAUDES'] },
    'sup-fraudes-cartoes': { name: 'Sup Fraudes+Cartões', towers: ['FRAUDES', 'CARTOES'] },
    'sup-geral': { name: 'Gerência Geral', towers: '*' }
};
const config = {
    [TENANT]: {
        name: 'Orion BPO (teste)', plan: 'Enterprise', maxAgents: 100, active: true,
        towers: Object.fromEntries(TOWERS.map(t => [t, { name: `Torre ${t}`, agentKey: agentKey(t) }])),
        supervisors: SUPS
    }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
function connect(params) {
    return new Promise(resolve => {
        const ws = new WebSocket(`ws://localhost:${PORT}?${new URLSearchParams(params)}`);
        ws.inbox = [];
        ws.on('message', m => ws.inbox.push(JSON.parse(m)));
        ws.on('open', () => resolve(ws));
        ws.on('close', code => { ws.closedWith = code; if (!ws.opened) resolve(ws); });
        ws.on('error', () => {});
        ws.opened = false; ws.on('open', () => { ws.opened = true; });
    });
}
const agent = (tower, id, key = agentKey(tower)) => connect({ tenant: TENANT, type: 'agent', agentId: id, key });
const sup = key => connect({ tenant: TENANT, type: 'supervisor', key });
const telemetry = (ws, id) => ws.send(JSON.stringify({ type: 'AGENT_TELEMETRY', operator: id, mosScore: '4.2' }));
const seen = (ws, type) => ws.inbox.filter(m => m.type === type);
const ids = (ws, type) => seen(ws, type).map(m => `${m.payload.tower}:${m.payload.agentId}`).sort();

(async () => {
    const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, TENANTS_CONFIG_JSON: JSON.stringify(config) }, stdio: 'ignore' });
    await sleep(1200);
    let failed = 0;
    const check = (name, fn) => { try { fn(); console.log(`  ok   ${name}`); } catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); } };
    try {
        // Supervisores conectam primeiro
        const sFraudes = await sup('sup-fraudes');
        const sFC = await sup('sup-fraudes-cartoes');
        const sGeral = await sup('sup-geral');

        // Agentes: PA-001 existe em TODAS as torres (mesmo id) para provar que não há colisão
        const agents = {};
        for (const t of TOWERS) {
            agents[t] = [await agent(t, 'PA-001'), await agent(t, 'PA-002')];
        }
        await sleep(200);
        for (const t of TOWERS) { telemetry(agents[t][0], 'PA-001'); telemetry(agents[t][1], 'PA-002'); }
        await sleep(300);

        console.log('Isolamento de telemetria');
        check('sup-fraudes vê só FRAUDES', () => assert.deepStrictEqual(ids(sFraudes, 'TELEMETRY_UPDATE'), ['FRAUDES:PA-001', 'FRAUDES:PA-002']));
        check('sup-fraudes+cartões vê FRAUDES e CARTOES', () => assert.deepStrictEqual(ids(sFC, 'TELEMETRY_UPDATE'),
            ['CARTOES:PA-001', 'CARTOES:PA-002', 'FRAUDES:PA-001', 'FRAUDES:PA-002']));
        check('supervisor geral vê as 4 torres (8 PAs)', () => assert.strictEqual(ids(sGeral, 'TELEMETRY_UPDATE').length, 8));

        console.log('Supervisor que entra depois (INIT_STATE)');
        const sLate = await sup('sup-fraudes');
        await sleep(200);
        check('INIT_STATE filtrado só com FRAUDES', () => {
            const init = seen(sLate, 'INIT_STATE')[0];
            assert.deepStrictEqual(init.agents.map(a => `${a.tower}:${a.agentId}`).sort(), ['FRAUDES:PA-001', 'FRAUDES:PA-002']);
            assert.deepStrictEqual(init.towers, ['FRAUDES']);
        });

        console.log('Auditoria de chamadas');
        agents.EMPRESTIMO[0].send(JSON.stringify({ type: 'CALL_AUDIT_SUMMARY', interactionId: 'CALL-EMP-1', durationSeconds: 60 }));
        agents.FRAUDES[0].send(JSON.stringify({ type: 'CALL_AUDIT_SUMMARY', interactionId: 'CALL-FRA-1', durationSeconds: 60 }));
        await sleep(300);
        const calls = ws => seen(ws, 'NEW_CALL_AUDIT').map(m => m.payload.interactionId).sort();
        check('sup-fraudes recebe só CALL-FRA-1', () => assert.deepStrictEqual(calls(sFraudes), ['CALL-FRA-1']));
        check('supervisor geral recebe as duas', () => assert.deepStrictEqual(calls(sGeral), ['CALL-EMP-1', 'CALL-FRA-1']));
        check('sup-fraudes+cartões não recebe CALL-EMP-1', () => assert.ok(!calls(sFC).includes('CALL-EMP-1')));

        console.log('Comandos de remediação');
        sFraudes.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND', targetAgentId: 'PA-001', command: 'SAFE_CACHE_CLEAR' }));
        await sleep(300);
        const cmds = ws => seen(ws, 'EXECUTE_COMMAND').length;
        check('PA-001 de FRAUDES recebeu o comando', () => assert.strictEqual(cmds(agents.FRAUDES[0]), 1));
        check('PA-001 de EMPRESTIMO (mesmo id) NÃO recebeu', () => assert.strictEqual(cmds(agents.EMPRESTIMO[0]), 0));
        check('PA-001 de CARTOES NÃO recebeu', () => assert.strictEqual(cmds(agents.CARTOES[0]), 0));
        agents.FRAUDES[0].send(JSON.stringify({ type: 'COMMAND_RESULT', result: { success: true } }));
        await sleep(200);
        check('feedback chega ao sup-fraudes e ao geral, não ao sup que não vê a torre', () => {
            assert.strictEqual(seen(sFraudes, 'AGENT_COMMAND_FEEDBACK').length, 1);
            assert.strictEqual(seen(sGeral, 'AGENT_COMMAND_FEEDBACK').length, 1);
        });
        sFraudes.send(JSON.stringify({ type: 'SUPERVISOR_COMMAND', targetAgentId: 'PA-002', command: 'SAFE_CACHE_CLEAR' }));
        await sleep(200);
        check('sup-fraudes não comanda PA de outra torre (só a de FRAUDES recebe)', () => {
            assert.strictEqual(cmds(agents.FRAUDES[1]), 1);
            assert.strictEqual(cmds(agents.COBRANCA[1]), 0);
        });

        console.log('Autenticação');
        const badAgent = await agent('FRAUDES', 'PA-X', 'chave-errada');
        const noKeyAgent = await connect({ tenant: TENANT, type: 'agent', agentId: 'PA-Y' });
        const badSup = await sup('chave-errada');
        const agentAsSup = await sup(agentKey('FRAUDES'));
        await sleep(300);
        check('agente com chave errada: 4003', () => assert.strictEqual(badAgent.closedWith, 4003));
        check('agente sem chave: 4003', () => assert.strictEqual(noKeyAgent.closedWith, 4003));
        check('supervisor com chave errada: 4003', () => assert.strictEqual(badSup.closedWith, 4003));
        check('chave de agente não vira supervisor: 4003', () => assert.strictEqual(agentAsSup.closedWith, 4003));

        console.log('Agente offline');
        agents.CARTOES[0].close();
        await sleep(300);
        check('OFFLINE de CARTOES chega a sup-fraudes+cartões, não a sup-fraudes', () => {
            const off = ws => seen(ws, 'TELEMETRY_UPDATE').filter(m => m.payload.status === 'OFFLINE').length;
            assert.strictEqual(off(sFC), 1);
            assert.strictEqual(off(sFraudes), 0);
        });

        console.log('Tenant legado (sem torres)');
        const legacyA = await connect({ tenant: 'GENESYS-ALLIANCE-EVAL', type: 'agent', agentId: 'PA-L1' });
        const legacyS = await connect({ tenant: 'GENESYS-ALLIANCE-EVAL', type: 'supervisor' });
        legacyA.send(JSON.stringify({ type: 'AGENT_TELEMETRY', operator: 'L1' }));
        await sleep(300);
        check('tenant legado continua funcionando sem chave', () => assert.strictEqual(seen(legacyS, 'TELEMETRY_UPDATE').length, 1));
    } finally {
        srv.kill();
    }
    console.log(failed ? `\n${failed} verificação(ões) falharam` : '\nTodas as verificações passaram');
    process.exit(failed ? 1 : 0);
})();
