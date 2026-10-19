const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-export-'));
process.env.TENANTS_JSON = JSON.stringify({
    'BPO-APEX-GLOBAL': {
        name: 'Apex', plan: 'Std', maxAgents: 5,
        towers: { FRAUDES: { agentKey: 'agent-key-fraudes-1' }, VENDAS: { agentKey: 'agent-key-vendas-1' } },
        supervisors: [{ key: 'super-key-todas-1', name: 'Todas', towers: '*' }, { key: 'super-key-fraudes-1', name: 'Fraudes', towers: ['FRAUDES'] }]
    },
    'BPO-NEXUS-CORP': { name: 'Nexus', plan: 'Std', maxAgents: 5, agentKey: 'agent-key-nexus-1', supervisorKey: 'super-key-nexus-1' }
});
const { createRelay } = require('../server');
const { callsToCsv } = require('../export-csv');

test('callsToCsv neutraliza fórmulas, escapa aspas e vírgulas e não leva o operador', () => {
    const csv = callsToCsv([{ interactionId: 'C-1', station: '=HYPERLINK("x")', causaRaiz: 'a,b', operator: 'Fulano', mosMedio: 3.2, perdaPacotesPct: -0, incidentesAudio: ['MIC_MUDO_SISTEMA', 'SEM_AUDIO_ENVIADO'] }]);
    assert.ok(csv.startsWith('﻿interactionId,'));
    assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'), csv);
    assert.ok(csv.includes('"a,b"'));
    assert.ok(csv.includes('MIC_MUDO_SISTEMA|SEM_AUDIO_ENVIADO'));
    assert.ok(!csv.includes('Fulano') && !/operator/i.test(csv));
});

test('/api/calls.csv: exporta só o que o supervisor pode ver e exige chave de supervisor', async () => {
    const relay = createRelay();
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const get = (p, key) => new Promise((resolve) => http.get({ port, path: p, headers: key ? { 'X-Tenant-Key': key } : {} }, res => {
        let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    }));
    const agent = (key, id) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => ws.send(JSON.stringify({ type: 'AUTH', key, agentId: id })));
        setTimeout(() => resolve(ws), 300);
    });
    const summary = (id, operator) => JSON.stringify({ type: 'CALL_AUDIT_SUMMARY', interactionId: id, operator, mosMedio: 3.4, classificacao: 'DEGRADADA', causaRaiz: 'WIFI', durationSeconds: 90, endTime: new Date().toISOString() });
    try {
        const fr = await agent('agent-key-fraudes-1', 'PA-F1');
        const ve = await agent('agent-key-vendas-1', 'PA-V1');
        const nx = await agent('agent-key-nexus-1', 'PA-N1');
        fr.send(summary('CONV-FRAUDE-1', 'Operador Secreto')); ve.send(summary('CONV-VENDAS-1', 'Outro')); nx.send(summary('CONV-NEXUS-1', 'Terceiro'));
        await new Promise(r => setTimeout(r, 400));

        assert.strictEqual((await get('/api/calls.csv')).status, 403, 'sem chave');
        assert.strictEqual((await get('/api/calls.csv', 'agent-key-fraudes-1')).status, 403, 'chave de agente não exporta');

        const all = await get('/api/calls.csv', 'super-key-todas-1');
        assert.strictEqual(all.status, 200);
        assert.match(all.headers['content-type'], /text\/csv/);
        assert.strictEqual(all.headers['cache-control'], 'no-store');
        assert.ok(all.body.includes('CONV-FRAUDE-1') && all.body.includes('CONV-VENDAS-1'));
        assert.ok(!all.body.includes('CONV-NEXUS-1'), 'isolamento entre tenants');
        assert.ok(!all.body.includes('Operador Secreto'), 'sem nome de operador');

        const onlyFr = await get('/api/calls.csv', 'super-key-fraudes-1');
        assert.ok(onlyFr.body.includes('CONV-FRAUDE-1') && !onlyFr.body.includes('CONV-VENDAS-1'), 'supervisor de uma torre só vê a sua');

        const future = await get('/api/calls.csv?from=2999-01-01T00:00:00Z', 'super-key-todas-1');
        assert.ok(!future.body.includes('CONV-FRAUDE-1'), 'filtro from');
        fr.close(); ve.close(); nx.close();
    } finally {
        await relay.shutdown();
    }
});

test('callsToCsv em inglês: cabeçalhos e valores traduzidos; padrão (pt) segue igual', () => {
    const call = { interactionId: 'C-1', classificacao: 'CRÍTICA', causaRaiz: 'INSTABILIDADE_WI_FI', incidentesAudio: ['SEM_AUDIO_ENVIADO'], networkType: 'CABO_ETHERNET', protocolo: 'UDP', caminhoMidia: 'udp-srflx', mosMedio: 3.1 };
    const en = callsToCsv([call], 'en').split('\r\n');
    assert.ok(en[0].includes('mosAvg,mosMin,rttAvgMs,jitterPeakMs,packetLossPct,classification,rootCause,audioIncidents,networkType,protocol,mediaPath'));
    assert.ok(en[1].includes('CRITICAL,WIFI_INSTABILITY,NO_AUDIO_SENT,WIRED_ETHERNET,UDP,udp-srflx'), en[1]);
    assert.ok(!/mosMedio|CRÍTICA|INSTABILIDADE/.test(en.join('\n')));
    const pt = callsToCsv([call]).split('\r\n');
    assert.ok(pt[0].includes('mosMedio,mosMinimo') && pt[1].includes('CRÍTICA,INSTABILIDADE_WI_FI'));
});
