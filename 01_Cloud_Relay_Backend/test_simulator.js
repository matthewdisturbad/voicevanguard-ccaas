const WebSocket = require('ws');
const AGENT_KEY = process.env.AGENT_KEY || 'dev-agent-BPO-APEX-GLOBAL'; // chave de agente do tenant fictício de desenvolvimento
const ws = new WebSocket('ws://localhost:9090');

ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'AUTH', key: AGENT_KEY, agentId: 'PA-SP-TEST01' }));
    console.log('[SIMULADOR] Conectado ao Relay com sucesso!');
    ws.send(JSON.stringify({
        type: 'AGENT_TELEMETRY',
        operator: 'Carlos Silva',
        station: 'PA-SP-TEST01',
        genesysOrg: 'BPO-APEX-GLOBAL SP',
        region: 'sae1.pure.cloud',
        status: 'OK',
        mosScore: '4.41',
        rttMs: 12,
        jitterMs: 1.8,
        lossPct: 0.0,
        protocol: 'UDP',
        callActive: true,
        currentCallId: 'conv-9842a-11bc-99fe'
    }));

    setTimeout(() => {
        const end = new Date();
        const start = new Date(end.getTime() - 125000);
        ws.send(JSON.stringify({
            type: 'CALL_AUDIT_SUMMARY',
            interactionId: 'conv-9842a-11bc-99fe',
            operator: 'Carlos Silva',
            station: 'PA-SP-TEST01',
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            durationSeconds: 125,
            mosMedio: 4.41,
            mosMinimo: 4.38,
            jitterPicoMs: 2.1,
            rttMedioMs: 13.0,
            perdaPacotesPct: 0.0,
            protocolo: 'UDP',
            classificacao: 'EXCELENTE'
        }));
        console.log('[SIMULADOR] Chamada de auditoria transmitida!');
        setTimeout(() => process.exit(0), 1000);
    }, 500);
});
