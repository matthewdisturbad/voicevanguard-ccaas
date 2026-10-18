/**
 * Exportação das chamadas auditadas em CSV, para cruzar o MOS com TMA/CSAT/abandono no BI do cliente
 * usando interactionId (= conversationId do Genesys / ContactId da Amazon). Sem nome de operador.
 */

const COLUMNS = [
    'interactionId', 'tower', 'platform', 'station', 'startTime', 'endTime', 'durationSeconds',
    'mosMedio', 'mosMinimo', 'rttMedioMs', 'jitterPicoMs', 'perdaPacotesPct',
    'classificacao', 'causaRaiz', 'incidentesAudio', 'networkType'
];

// Células que começam com = + - @ ou controle viram fórmula no Excel/Sheets: neutralizadas com apóstrofo.
function cell(v) {
    if (v === null || v === undefined) return '';
    let s = Array.isArray(v) ? v.join('|') : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function callsToCsv(calls) {
    const lines = [COLUMNS.join(',')];
    for (const c of calls) lines.push(COLUMNS.map(k => cell(c[k])).join(','));
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
