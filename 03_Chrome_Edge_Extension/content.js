/**
 * VoiceVanguard - Content Script (injeta o hook WebRTC)
 * TrustCo Technologies
 */

// 1. Injeta o script de hook no contexto de execução principal da página
function injectHook() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected_webrtc_hook.js');
    script.charset = 'utf-8'; // o hook tem acentos; não depender do charset da página hospedeira
    script.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

injectHook();

// 2. Escuta mensagens enviadas pelo hook injetado na página
window.addEventListener('message', (event) => {
    // Aceita apenas mensagens do próprio frame, da mesma origem e do hook (protocolo único)
    if (event.source !== window || event.origin !== window.location.origin ||
        !event.data || event.data.source !== 'VOICEVANGUARD_WEBRTC_HOOK') {
        return;
    }

    const data = event.data.payload;
    if (!data || typeof data !== 'object') return;
    // Cada tipo de evento tem seu destino; eventos desconhecidos são descartados
    // (ex.: latência de API não pode marcar "chamada ativa" no background)
    const ACTIONS = {
        AMOSTRA_VOZ_WEBRTC: 'REPORT_TELEMETRY',
        CHAMADA_FINALIZADA: 'REPORT_CALL_SUMMARY',
        LATENCIA_API: 'REPORT_API_LATENCY'
    };
    const action = ACTIONS[data.evento];
    if (!action) return;

    chrome.runtime.sendMessage({
        action: action,
        payload: data
    }).catch(() => {
        // Ignora caso worker esteja dormindo
    });
});
