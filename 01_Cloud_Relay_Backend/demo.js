/**
 * Simulador do tenant de demonstração (`"demo": true` em TENANTS_JSON).
 * Gera estações FICTÍCIAS (sem nenhum dado real) e as faz variar em tempo real: chamadas que começam e terminam,
 * MOS oscilando, Wi-Fi ruim em grupo, áudio mudo e estações offline. Só roda no tenant marcado como demo;
 * o acesso continua exigindo chave de supervisor. Nada é gravado em disco.
 */

const PLATFORMS = [
    { platform: 'Genesys Cloud', platformCode: 'GENESYS', region: 'sae1.pure.cloud', org: 'GENESYS-ALLIANCE-EVAL', weight: 0.6 },
    { platform: 'Amazon Connect', platformCode: 'AWS_CONNECT', region: 'us-east-1.awsapps.com', org: 'BPO-NEXUS-CORP', weight: 0.25 },
    { platform: 'NICE CXone', platformCode: 'NICE_CXONE', region: 'na1.niceincontact.com', org: 'BPO-STELLAR-CX', weight: 0.15 }
];
const NETWORKS = [['CABO_ETHERNET', 0.6], ['REDE_ESTAVEL', 0.2], ['WI_FI_PROVAVEL', 0.2]];
const WIFI = 'WI_FI_PROVAVEL';

// Mesma aproximação do E-model usada pela extensão (injected_webrtc_hook.js).
function calculateMos(rtt, jitter, lossPct) {
    const lat = rtt + jitter * 2 + 10;
    let r = 93.2 - (lat < 160 ? lat / 40 : (lat - 120) / 10) - lossPct * 2.5;
    r = Math.max(0, Math.min(100, r));
    const mos = 1 + 0.035 * r + r * (100 - r) * (r - 60) * 0.000007;
    return Math.round(Math.max(1, Math.min(4.5, mos)) * 100) / 100;
}

function classify(mos) {
    return mos >= 4.0 ? 'EXCELENTE' : mos >= 3.6 ? 'BOA' : mos >= 3.0 ? 'DEGRADADA' : 'CRÍTICA';
}

function createDemoSimulator({ towers = [], size = 36, rand = Math.random, now = Date.now } = {}) {
    const pick = (list) => { let x = rand(), acc = 0; for (const [v, w] of list) { acc += w; if (x <= acc) return v; } return list[list.length - 1][0]; };
    const platformOf = () => { let x = rand(), acc = 0; for (const p of PLATFORMS) { acc += p.weight; if (x <= acc) return p; } return PLATFORMS[0]; };
    const between = (a, b) => a + rand() * (b - a);
    const towerIds = towers.length ? towers : [null];
    let callSeq = 0;
    let scenario = null; // { kind, until, ids:Set }
    let cooldownUntil = 0;

    const stations = [];
    for (let i = 0; i < size; i++) {
        const p = platformOf();
        stations.push({
            agentId: `PA-DEMO-${String(i + 1).padStart(3, '0')}`,
            tower: towerIds[i % towerIds.length],
            operator: `Operador ${String(i + 1).padStart(2, '0')}`,
            ...p,
            networkType: pick(NETWORKS),
            base: { rtt: between(18, 55), jitter: between(1, 5), loss: 0 },
            inCall: false, callId: '', callStart: 0, callEnd: 0, samples: [],
            offlineUntil: 0, audioIssue: 'NONE', cpuStress: 'NORMAL'
        });
    }

    function metrics(s) {
        let { rtt, jitter, loss } = s.base;
        const bad = scenario && scenario.ids.has(s.agentId) ? scenario.kind : null;
        rtt += between(-4, 6); jitter += between(-0.8, 1.2); loss = Math.max(0, loss + between(-0.1, 0.2));
        if (bad === 'wifi') { rtt += between(70, 160); jitter += between(14, 38); loss += between(2, 7); }
        if (bad === 'isolated') { rtt += between(120, 260); jitter += between(25, 60); loss += between(4, 9); }
        return { rtt: Math.max(1, Math.round(rtt)), jitter: Math.max(0, Math.round(jitter * 10) / 10), loss: Math.round(loss * 10) / 10 };
    }

    function telemetryOf(s, t) {
        if (s.offlineUntil > t) {
            return { agentId: s.agentId, tower: s.tower, platform: s.platform, platformCode: s.platformCode, operator: s.operator, station: s.agentId,
                genesysOrg: s.org, region: s.region, audioIssue: 'NONE', status: 'OFFLINE', mosScore: '4.40', rttMs: 0, jitterMs: 0, lossPct: 0,
                protocol: 'UDP', networkType: s.networkType, cpuStress: 'NORMAL', callActive: false, currentCallId: '', lastSeen: new Date(t).toISOString() };
        }
        const m = metrics(s);
        const mos = calculateMos(m.rtt, m.jitter, m.loss);
        if (s.inCall) s.samples.push({ ...m, mos });
        const issue = s.inCall ? s.audioIssue : 'NONE';
        return {
            agentId: s.agentId, tower: s.tower, platform: s.platform, platformCode: s.platformCode, operator: s.operator, station: s.agentId,
            genesysOrg: s.org, region: s.region, audioIssue: issue,
            status: issue !== 'NONE' || (s.inCall && mos < 3.0) ? 'ALERTA' : 'OK',
            mosScore: mos.toFixed(2), rttMs: m.rtt, jitterMs: m.jitter, lossPct: m.loss, protocol: 'UDP',
            networkType: s.networkType, cpuStress: s.cpuStress, callActive: s.inCall, currentCallId: s.inCall ? s.callId : '',
            lastSeen: new Date(t).toISOString()
        };
    }

    function summaryOf(s, t, id) {
        const n = s.samples.length || 1;
        const sum = (k) => s.samples.reduce((a, x) => a + x[k], 0);
        const mosMedio = s.samples.length ? Math.round((sum('mos') / n) * 100) / 100 : 4.3;
        const mosMinimo = s.samples.length ? Math.min(...s.samples.map(x => x.mos)) : mosMedio;
        const jitterPico = s.samples.length ? Math.max(...s.samples.map(x => x.jitter)) : 2;
        const lossAvg = Math.round((sum('loss') / n) * 10) / 10;
        const cls = classify(mosMedio);
        const audio = s.audioIssue !== 'NONE';
        const cause = audio ? 'FALHA_AUDIO_ESTACAO'
            : cls === 'EXCELENTE' || cls === 'BOA' ? 'REDE_HOMOLOGADA'
            : s.networkType === WIFI ? 'INSTABILIDADE_WI_FI' : jitterPico > 30 ? 'JITTER_INTERMITENTE' : 'CONGESTIONAMENTO_ROTA';
        return {
            interactionId: id, tower: s.tower, platform: s.platform, platformCode: s.platformCode, agentId: s.agentId, operator: s.operator, station: s.agentId,
            startTime: new Date(s.callStart).toISOString(), endTime: new Date(t).toISOString(),
            durationSeconds: Math.max(1, Math.round((t - s.callStart) / 1000)), mosMedio, mosMinimo,
            jitterPicoMs: jitterPico, rttMedioMs: Math.round(sum('rtt') / n), perdaPacotesPct: lossAvg, protocolo: 'UDP',
            classificacao: cls, networkType: s.networkType, cpuStress: s.cpuStress, causaRaiz: cause,
            incidentesAudio: audio ? [s.audioIssue] : [], trocasDispositivo: audio ? 1 : 0, receivedAt: new Date(t).toISOString()
        };
    }

    function startCall(s, t, durationMs) {
        s.inCall = true; s.callId = `DEMO-${String(++callSeq).padStart(6, '0')}`; s.callStart = t; s.callEnd = t + durationMs; s.samples = [];
        s.audioIssue = 'NONE';
        s.cpuStress = rand() < 0.06 ? 'ALTO_CONSUMO_RAM' : 'NORMAL';
    }

    function updateScenario(t) {
        if (scenario && t < scenario.until) return;
        if (scenario) { scenario = null; cooldownUntil = t + between(15000, 40000); }
        if (t < cooldownUntil || rand() > 0.5) return; // intervalos tranquilos também acontecem
        const live = stations.filter(s => s.inCall && s.offlineUntil <= t);
        if (live.length < 8) return;
        const r = rand();
        const kind = r < 0.5 ? 'wifi' : r < 0.8 ? 'isolated' : 'audio';
        let ids = [];
        if (kind === 'wifi') {
            const wifi = stations.filter(s => s.networkType === WIFI);
            ids = wifi.slice(0, Math.max(5, Math.min(wifi.length, 8))).map(s => s.agentId);
            if (ids.length < 5) { for (const s of live) { if (ids.length >= 6) break; s.networkType = WIFI; ids.push(s.agentId); } }
        } else {
            ids = [live[Math.floor(rand() * live.length)].agentId];
        }
        if (kind === 'audio') stations.find(s => s.agentId === ids[0]).audioIssue = rand() < 0.5 ? 'MIC_MUDO_SISTEMA' : 'SEM_AUDIO_ENVIADO';
        scenario = { kind, until: t + between(30000, 60000), ids: new Set(ids) };
    }

    return {
        stations,
        // Histórico inicial para o console não abrir vazio.
        seedHistory(count = 60) {
            const t0 = now();
            const out = [];
            for (let i = 0; i < count; i++) {
                const s = stations[Math.floor(rand() * stations.length)];
                const dur = between(60000, 420000);
                const end = t0 - (i + 1) * between(20000, 70000);
                s.callStart = end - dur; s.samples = []; s.audioIssue = 'NONE';
                const bad = rand() < 0.22;
                for (let k = 0; k < 12; k++) {
                    const rtt = bad ? between(110, 280) : between(20, 60), jitter = bad ? between(15, 45) : between(1, 6), loss = bad ? between(1, 6) : between(0, 0.4);
                    s.samples.push({ rtt, jitter, loss, mos: calculateMos(rtt, jitter, loss) });
                }
                if (rand() < 0.05) s.audioIssue = 'SEM_AUDIO_RECEBIDO';
                out.push(summaryOf(s, end, `DEMO-H${String(i + 1).padStart(5, '0')}`));
                s.audioIssue = 'NONE'; s.samples = [];
            }
            return out;
        },
        // Estado de saúde das estações (pré-check e latência de API) para a aba de estações.
        stationHealth() {
            const t = new Date(now()).toISOString();
            return stations.map(s => {
                const wifi = s.networkType === WIFI;
                const item = (id, status, valor) => ({ id, status, valor, orientacao: '' });
                return {
                    agentId: s.agentId, tower: s.tower, station: s.agentId, operator: s.operator, lastSeen: t,
                    precheck: {
                        status: wifi ? 'ATENCAO' : 'PRONTA',
                        itens: [item('rede_rtt', wifi ? 'atencao' : 'ok', `${Math.round(wifi ? between(90, 140) : between(20, 50))} ms`), item('microfone', 'ok', 'OK'), item('saida_audio', 'ok', 'OK'), item('relay', 'ok', 'Conectado')],
                        rttMs: Math.round(s.base.rtt), jitterMs: Math.round(s.base.jitter), lossPct: 0, checkedAt: t
                    },
                    api: { hosts: [{ host: s.region, count: Math.round(between(20, 120)), avgMs: Math.round(between(60, 180)), p95Ms: Math.round(between(150, 420)), maxMs: Math.round(between(300, 900)), errors: 0 }], janelaSeg: 30, updatedAt: t }
                };
            });
        },
        // Avança a simulação e devolve o que mudou.
        tick() {
            const t = now();
            updateScenario(t);
            const telemetry = [], calls = [];
            const inCallNow = stations.filter(s => s.inCall).length;
            for (const s of stations) {
                if (s.offlineUntil > t) { telemetry.push(telemetryOf(s, t)); continue; }
                if (s.inCall && t >= s.callEnd) { calls.push(summaryOf(s, t, s.callId)); s.inCall = false; s.samples = []; s.audioIssue = 'NONE'; s.cpuStress = 'NORMAL'; }
                else if (!s.inCall && inCallNow < stations.length * 0.8 && rand() < 0.18) startCall(s, t, between(45000, 240000));
                else if (!s.inCall && rand() < 0.004) s.offlineUntil = t + between(20000, 60000);
                telemetry.push(telemetryOf(s, t));
            }
            return { telemetry, calls };
        }
    };
}

module.exports = { createDemoSimulator, calculateMos };
