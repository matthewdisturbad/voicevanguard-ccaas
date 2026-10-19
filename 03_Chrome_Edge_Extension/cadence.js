/**
 * VoiceVanguard - Cadência de envio da telemetria (lógica pura, sem acesso a APIs do navegador).
 * A extensão continua coletando localmente a cada 2 s; o modo de monitoramento do tenant decide
 * quantas amostras seguem ao relay. Testável com node:test.
 *
 *   realtime  : toda amostra é enviada (padrão)
 *   sampled   : uma amostra por intervalo + envio imediato quando algo muda (alerta, áudio, caminho de mídia)
 *   on_demand : presença em intervalo longo + janela de medição aberta pelo supervisor ("Medir agora")
 */
(function (root) {
    const MODES = ['realtime', 'sampled', 'on_demand'];
    const INTERVAL_MS = { sampled: 10000, on_demand: 30000 };
    const MEASURE = { min: 5, max: 120, def: 30 };

    const normalizeMode = (m) => (MODES.includes(m) ? m : 'realtime');
    const measureSeconds = (s) => {
        const n = Math.floor(Number(s));
        return Number.isFinite(n) ? Math.min(MEASURE.max, Math.max(MEASURE.min, n)) : MEASURE.def;
    };

    // Assinatura do que, se mudar, justifica enviar na hora.
    const signature = (s) => `${s.status || ''}|${s.audioIssue || 'NONE'}|${s.mediaPath || ''}`;

    function createCadence(initialMode) {
        let mode = normalizeMode(initialMode);
        let lastSentAt = 0;
        let lastSig = null;
        let windowUntil = 0;

        return {
            get mode() { return mode; },
            setMode(m) { mode = normalizeMode(m); },
            // Abre a janela de medição (on_demand e sampled aceitam; realtime já envia tudo).
            measure(seconds, nowMs) {
                windowUntil = nowMs + measureSeconds(seconds) * 1000;
                return windowUntil;
            },
            // sample: { status, audioIssue, mediaPath }
            shouldSend(sample, nowMs) {
                const sig = signature(sample);
                let send;
                if (mode === 'realtime') send = true;
                else if (lastSig === null || sig !== lastSig) send = true;
                else if (nowMs < windowUntil) send = true;
                else send = nowMs - lastSentAt >= INTERVAL_MS[mode];
                if (send) { lastSentAt = nowMs; lastSig = sig; }
                return send;
            },
            // Nova chamada: a primeira amostra sempre segue.
            reset() { lastSentAt = 0; lastSig = null; }
        };
    }

    const api = { createCadence, normalizeMode, measureSeconds, MODES, INTERVAL_MS, MEASURE };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.VVCadence = api;
})(typeof self !== 'undefined' ? self : this);
