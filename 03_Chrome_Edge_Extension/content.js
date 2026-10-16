/**
 * Genesys Cloud WebRTC Monitor - Content Script (CEF)
 * Autor: David Paiva - Engenharia de Sustentação
 */

// 1. Injeta o script de hook no contexto de execução principal da página
function injectHook() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected_webrtc_hook.js');
    script.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

injectHook();

// 2. Escuta mensagens enviadas pelo hook injetado na página
window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'GENESYS_WEBRTC_METRIC') {
        return;
    }

    const data = event.data.data;
    const action = data.evento === 'CHAMADA_FINALIZADA' ? 'REPORT_CALL_SUMMARY' : 'REPORT_TELEMETRY';

    chrome.runtime.sendMessage({
        action: action,
        payload: data
    }).catch(() => {
        // Ignora caso worker esteja dormindo
    });
});
