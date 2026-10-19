/**
 * Exportação das chamadas auditadas em CSV, para cruzar o MOS com TMA/CSAT/abandono no BI do cliente
 * usando interactionId (= conversationId do Genesys / ContactId da Amazon). Sem nome de operador.
 */

// Chaves internas (campos da chamada) e cabeçalhos por idioma. O padrão (pt) mantém os nomes históricos para não
// quebrar integrações existentes; `?lang=en` traz cabeçalhos e valores em inglês.
const COLUMNS = [
    'interactionId', 'tower', 'platform', 'station', 'startTime', 'endTime', 'durationSeconds',
    'mosMedio', 'mosMinimo', 'rttMedioMs', 'jitterPicoMs', 'perdaPacotesPct',
    'classificacao', 'causaRaiz', 'incidentesAudio', 'networkType', 'protocolo', 'caminhoMidia'
];
const HEADERS_EN = {
    interactionId: 'interactionId', tower: 'tower', platform: 'platform', station: 'station', startTime: 'startTime', endTime: 'endTime',
    durationSeconds: 'durationSeconds', mosMedio: 'mosAvg', mosMinimo: 'mosMin', rttMedioMs: 'rttAvgMs', jitterPicoMs: 'jitterPeakMs',
    perdaPacotesPct: 'packetLossPct', classificacao: 'classification', causaRaiz: 'rootCause', incidentesAudio: 'audioIncidents',
    networkType: 'networkType', protocolo: 'protocol', caminhoMidia: 'mediaPath'
};
// Valores em português gerados pela extensão/relay -> inglês (códigos desconhecidos passam sem tradução).
const VALUES_EN = {
    classificacao: { 'EXCELENTE': 'EXCELLENT', 'BOA': 'GOOD', 'DEGRADADA': 'DEGRADED', 'CRÍTICA': 'CRITICAL', 'N/D': 'N/A' },
    causaRaiz: {
        REDE_HOMOLOGADA: 'NETWORK_WITHIN_EXPECTED_RANGE', INSTABILIDADE_WI_FI: 'WIFI_INSTABILITY', CONGESTIONAMENTO_ROTA: 'ROUTE_CONGESTION',
        SOBRECARGA_CPU_OPERADOR: 'OPERATOR_CPU_OVERLOAD', JITTER_INTERMITENTE: 'INTERMITTENT_JITTER', FALHA_AUDIO_ESTACAO: 'STATION_AUDIO_FAILURE',
        MIDIA_TCP_FALLBACK: 'MEDIA_TCP_FALLBACK', 'N/D': 'N/A'
    },
    incidentesAudio: {
        SEM_AUDIO_RECEBIDO: 'NO_AUDIO_RECEIVED', SEM_AUDIO_ENVIADO: 'NO_AUDIO_SENT', MIC_DESCONECTADO: 'MIC_DISCONNECTED', MIC_MUDO_SISTEMA: 'MIC_MUTED_IN_SYSTEM'
    },
    networkType: { CABO_ETHERNET: 'WIRED_ETHERNET', WI_FI_PROVAVEL: 'WIFI_LIKELY', REDE_ESTAVEL: 'STABLE_NETWORK', 'N/D': 'N/A' },
    caminhoMidia: { 'N/D': 'N/A' }
};
function localize(key, v, lang) {
    if (lang !== 'en') return v;
    const map = VALUES_EN[key];
    if (!map) return v;
    return Array.isArray(v) ? v.map(x => map[x] || x) : (map[v] || v);
}

// Células que começam com = + - @ ou controle viram fórmula no Excel/Sheets: neutralizadas com apóstrofo.
function cell(v) {
    if (v === null || v === undefined) return '';
    let s = Array.isArray(v) ? v.join('|') : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function callsToCsv(calls, lang = 'pt') {
    const lines = [COLUMNS.map(k => (lang === 'en' ? HEADERS_EN[k] : k)).join(',')];
    for (const c of calls) lines.push(COLUMNS.map(k => cell(localize(k, c[k], lang))).join(','));
    return '﻿' + lines.join('\r\n') + '\r\n';
}

function filterCalls(calls, { from, to, canSee }) {
    const f = from ? Date.parse(from) : NaN;
    const t = to ? Date.parse(to) : NaN;
    return calls.filter(c => {
        if (canSee && !canSee(c.tower)) return false;
        const at = Date.parse(c.endTime || c.receivedAt);
        if (!Number.isNaN(f) && !(at >= f)) return false;
        if (!Number.isNaN(t) && !(at <= t)) return false;
        return true;
    });
}

module.exports = { COLUMNS, callsToCsv, filterCalls };
