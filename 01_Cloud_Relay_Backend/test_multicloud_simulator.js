const WebSocket = require('ws');
const AGENT_KEY = process.env.AGENT_KEY || 'dev-agent-BPO-APEX-GLOBAL'; // chave de agente do tenant fictício de desenvolvimento
const ws = new WebSocket('ws://localhost:9090');

ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'AUTH', key: AGENT_KEY, agentId: 'PA-MULTI-CLOUD-01' }));
    console.log('[SIMULADOR UNIVERSAL] Conectado ao Cloud Relay!');

    // 1. Simula Agente no Amazon Connect
    ws.send(JSON.stringify({
        type: 'AGENT_TELEMETRY',
        platform: 'Amazon Connect',
        platformCode: 'AWS_CONNECT',
        operator: 'Mariana Lima',
        station: 'PA-MULTI-CLOUD-01',
        genesysOrg: 'Amazon Connect CCP',
        region: 'us-east-1.awsapps.com',
        status: 'OK',
        mosScore: '4.43',
        rttMs: 14,
        jitterMs: 1.2,
        lossPct: 0.0,
        protocol: 'UDP',
        callActive: true,
        currentCallId: 'aws-contact-7762-uuid'
    }));

    // 2. Simula Agente no NICE CXone
    const ws2 = new WebSocket('ws://localhost:9090');
    ws2.on('open', () => {
        ws2.send(JSON.stringify({ type: 'AUTH', key: AGENT_KEY, agentId: 'PA-NICE-02' }));
        ws2.send(JSON.stringify({
            type: 'AGENT_TELEMETRY',
            platform: 'NICE CXone',
            platformCode: 'NICE_CXONE',
            operator: 'Rodrigo Santos',
            station: 'PA-NICE-02',
            genesysOrg: 'NICE CXone MAX',
            region: 'na1.nice-incontact.com',
            status: 'ALERTA',
            mosScore: '3.70',
            rttMs: 85,
            jitterMs: 34.0,
            lossPct: 2.2,
            protocol: 'UDP',
            callActive: true,
            currentCallId: '49102938471'
        }));

        const end = new Date();
        const start = new Date(end.getTime() - 145000);
        // Simula Chamada Finalizada no Cisco Webex
        ws.send(JSON.stringify({
            type: 'CALL_AUDIT_SUMMARY',
            platform: 'Cisco Webex CC',
            platformCode: 'CISCO_WEBEX',
            interactionId: 'cisco-call-99128',
            operator: 'Mariana Lima',
            station: 'PA-MULTI-CLOUD-01',
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            durationSeconds: 145,
            mosMedio: 4.38,
            mosMinimo: 4.25,
            jitterPicoMs: 4.1,
            rttMedioMs: 18.0,
            perdaPacotesPct: 0.0,
            protocolo: 'UDP',
            classificacao: 'EXCELENTE'
        }));

        console.log('[SIMULADOR UNIVERSAL] Multi-Cloud PAs e Chamada transmitidas com sucesso!');
        setTimeout(() => process.exit(0), 1000);
    });
});
