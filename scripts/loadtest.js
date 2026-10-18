#!/usr/bin/env node
/**
 * Teste de carga do relay (N agentes simulados + 1 supervisor).
 * Uso: node scripts/loadtest.js [agentes=200] [segundos=20] [intervaloMs=2000] [url=ws://localhost:9090]
 * Chaves: AGENT_KEY / SUPERVISOR_KEY (padrão: tenant fictício de dev). Requer maxAgents >= agentes.
 * Mede: tempo de autenticação, telemetrias enviadas x recebidas pelo supervisor e latência
 * de entrega (agente -> supervisor, via campo `station` único com carimbo de tempo).
 */
const WebSocket = require('../01_Cloud_Relay_Backend/node_modules/ws');
const N = Number(process.argv[2] || 200);
const SECS = Number(process.argv[3] || 20);
const EVERY = Number(process.argv[4] || 2000);
const URL = process.argv[5] || 'ws://localhost:9090';
const AGENT_KEY = process.env.AGENT_KEY || 'dev-agent-BPO-APEX-GLOBAL';
const SUP_KEY = process.env.SUPERVISOR_KEY || 'dev-supervisor-BPO-APEX-GLOBAL';

const lat = [];
let sent = 0, recv = 0, authFail = 0, closed = 0;
const authMs = [];

function pct(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

const sup = new WebSocket(URL);
sup.on('open', () => sup.send(JSON.stringify({ type: 'AUTH', key: SUP_KEY })));
sup.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    if (m.type === 'AUTH_OK' || m.type === 'INIT_STATE') { if (!sup.ready) { sup.ready = true; startAgents(); } return; }
    if (m.type === 'TELEMETRY_UPDATE' && m.payload && /^LT\d+@\d+$/.test(m.payload.station)) {
        recv++; lat.push(Date.now() - Number(m.payload.station.split('@')[1]));
    }
});
sup.on('error', (e) => { console.error('Supervisor:', e.message); process.exit(1); });

function startAgents() {
    const agents = [];
    for (let i = 0; i < N; i++) {
        const t0 = Date.now();
        const ws = new WebSocket(URL);
        ws.on('open', () => ws.send(JSON.stringify({ type: 'AUTH', key: AGENT_KEY, agentId: `LT${i}` })));
        ws.on('message', (raw) => {
            let m; try { m = JSON.parse(raw); } catch (_) { return; }
            if (m.type === 'AUTH_OK') { ws.ready = true; authMs.push(Date.now() - t0); }
            if (m.type === 'AUTH_ERROR') authFail++;
        });
        ws.on('close', () => { if (!ws.done) closed++; });
        ws.on('error', () => { authFail++; });
        agents.push(ws);
    }
    const timer = setInterval(() => {
        for (let i = 0; i < agents.length; i++) {
            const ws = agents[i];
            if (!ws.ready || ws.readyState !== 1) continue;
            ws.send(JSON.stringify({
                type: 'AGENT_TELEMETRY', platform: 'Genesys Cloud', platformCode: 'GENESYS', station: `LT${i}@${Date.now()}`,
                mosScore: (3.5 + Math.random()).toFixed(2), rttMs: 40, jitterMs: 3, lossPct: 0, callActive: true, currentCallId: `c${i}`
            }));
            sent++;
        }
    }, EVERY);
    setTimeout(() => {
        clearInterval(timer);
        setTimeout(() => {
            const loss = sent ? ((sent - recv) / sent * 100).toFixed(2) : 'n/d';
            console.log(JSON.stringify({
                agentes: N, duracaoS: SECS, intervaloMs: EVERY, autenticados: authMs.length, falhasAuth: authFail, desconexoes: closed,
                authP50Ms: pct(authMs, 0.5), authP95Ms: pct(authMs, 0.95),
                telemetriasEnviadas: sent, recebidasSupervisor: recv, perdaPct: loss,
                entregaP50Ms: pct(lat, 0.5), entregaP95Ms: pct(lat, 0.95), entregaMaxMs: lat.length ? Math.max(...lat) : NaN
            }, null, 2));
            agents.forEach(a => { a.done = true; a.close(); }); sup.close();
            setTimeout(() => process.exit(0), 300);
        }, 1500);
    }, SECS * 1000);
}
