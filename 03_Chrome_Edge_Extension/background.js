/**
 * VoiceVanguard CCaaS - Background Service Worker (Manifest V3)
 * Conexão direta com Cloud Relay WebSocket Multi-Tenant via TenantKey.
 * Suporte a GPO Corporativo (Managed Policy) e Pareamento Dinâmico.
 * Autor: David Paiva
 */

let RELAY_SERVER = "wss://voicevanguard.trustco.pro"; // Custom domain principal
let FALLBACK_RELAY_SERVER = "wss://voicevanguard-cloud-production.up.railway.app"; // Railway fallback imediato
importScripts('precheck.js'); // VVPrecheck.summarizeProbe

let tenantKey = ""; // chave de AGENTE do tenant (definida por GPO/Intune ou pelo popup); sem valor padrão
let agentStationId = null;
let operatorName = "Operador";
let ws = null;
let reconnectTimer = null;
let isCallActive = false;
let lastTelemetryAt = 0;
const CALL_STALE_MS = 15000; // sem telemetria por 15s => chamada considerada encerrada
let pendingCacheClear = false;

// Inicializa Identificadores
chrome.storage.local.get(['tenantKey', 'agentStationId', 'operatorName'], (res) => {
    if (res.tenantKey) tenantKey = res.tenantKey;
    if (res.agentStationId) agentStationId = res.agentStationId;
    else {
        agentStationId = `PA-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        chrome.storage.local.set({ agentStationId });
    }
    if (res.operatorName) operatorName = res.operatorName;
    connectToCloudRelay();
});

// Suporte a GPO / Active Directory (Políticas Corporativas do Windows / Chrome Managed Storage)
if (chrome.storage.managed) {
    chrome.storage.managed.get(['tenantKey', 'relayServer'], (managedConfig) => {
        if (managedConfig && managedConfig.tenantKey) {
            tenantKey = managedConfig.tenantKey;
            chrome.storage.local.set({ tenantKey, isManaged: true });
            if (managedConfig.relayServer) RELAY_SERVER = managedConfig.relayServer;
            if (ws) ws.close();
        }
    });
}

function connectToCloudRelay() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    if (!tenantKey) return; // sem chave configurada não há o que conectar

    const url = `${RELAY_SERVER}?key=${encodeURIComponent(tenantKey)}&agentId=${encodeURIComponent(agentStationId)}`;
    try {
        ws = new WebSocket(url);

        ws.onopen = () => {
            console.log(`[VoiceVanguard] Conectado ao Cloud Relay | ID: ${agentStationId}`);
            chrome.storage.local.set({ relayConnected: true });
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                // Resposta da sonda de rede do pré-check
                if (msg.type === 'PONG') {
                    const waiter = pongWaiters.get(msg.n);
                    if (waiter) waiter();
                    return;
                }

                // Trata comandos remotos disparados pelo supervisor
                if (msg.type === 'EXECUTE_COMMAND') {
                    if (msg.command === 'SAFE_CACHE_CLEAR') {
                        executeSafeCacheClear('remote_supervisor');
                    }
                }
            } catch (e) { }
        };

        ws.onclose = (ev) => {
            chrome.storage.local.set({ relayConnected: false });
            if (ev && ev.code === 4001) return; // chave recusada: não insistir em loop
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connectToCloudRelay, 5000);
        };

        ws.onerror = () => {
            ws.close();
        };
    } catch (err) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectToCloudRelay, 5000);
    }
}

// Rotina de Limpeza Segura de Cache (Preserva Cookies e Sessão do Genesys)
async function executeSafeCacheClear(origin = 'manual') {
    if (callIsActive()) {
        pendingCacheClear = true;
        sendWsMessage({
            type: 'COMMAND_RESULT',
            result: { success: false, inCall: true, message: 'Operador em chamada ativa. Ação agendada para o pós-chamada.' }
        });
        return { success: false, inCall: true };
    }

    try {
        await chrome.browsingData.removeCache({ since: 0 });
        pendingCacheClear = false;
        const now = new Date().toISOString();
        chrome.storage.local.set({ lastCacheCleared: now });

        sendWsMessage({
            type: 'COMMAND_RESULT',
            result: { success: true, timestamp: now, origin: origin }
        });

        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// In-Call Lock: a flag expira sem telemetria recente, evitando bloqueio eterno se a aba fechar no meio da chamada
function callIsActive() {
    if (isCallActive && Date.now() - lastTelemetryAt > CALL_STALE_MS) {
        isCallActive = false;
        chrome.storage.local.set({ isCallActive: false });
        if (pendingCacheClear) setTimeout(() => executeSafeCacheClear('post_call'), 500);
    }
    return isCallActive;
}

// Sonda de rede até o relay (pré-check de turno): 20 pings espaçados em 250 ms, timeout de 2 s cada
const pongWaiters = new Map();
let pingSeq = 0;
async function runNetProbe() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'relay_desconectado' };
    const COUNT = 20, INTERVAL_MS = 250, TIMEOUT_MS = 2000;
    const tasks = [];
    for (let i = 0; i < COUNT; i++) {
        tasks.push(new Promise((resolve) => {
            const n = ++pingSeq;
            const t0 = performance.now();
            const timer = setTimeout(() => { pongWaiters.delete(n); resolve(null); }, TIMEOUT_MS);
            pongWaiters.set(n, () => { clearTimeout(timer); pongWaiters.delete(n); resolve(performance.now() - t0); });
            sendWsMessage({ type: 'PING', n });
        }));
        await new Promise(r => setTimeout(r, INTERVAL_MS));
    }
    const rtts = (await Promise.all(tasks)).filter(x => x !== null);
    return self.VVPrecheck.summarizeProbe(rtts, COUNT);
}

function sendWsMessage(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

// Receptor de Mensagens dos Content Scripts (Hook WebRTC)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Só aceita mensagens da própria extensão (content scripts ou páginas da extensão)
    if (sender.id !== chrome.runtime.id) return;
    const fromExtensionPage = !!sender.url && sender.url.startsWith(chrome.runtime.getURL(''));

    if (message.action === 'REPORT_TELEMETRY' && message.payload) {
        isCallActive = true;
        lastTelemetryAt = Date.now();
        chrome.storage.local.set({ lastMetric: message.payload, isCallActive: true });

        // Extrai Região / Domínio e Plataforma detectada
        const detectedPlatform = message.payload.platform || "VoIP WebRTC";
        let detectedHost = "WebRTC";
        if (sender.tab && sender.tab.url) {
            try {
                detectedHost = new URL(sender.tab.url).hostname;
            } catch (e) { }
        }

        sendWsMessage({
            type: 'AGENT_TELEMETRY',
            operator: operatorName,
            station: agentStationId,
            platform: detectedPlatform,
            platformCode: message.payload.platformCode || "WEBRTC",
            genesysOrg: detectedPlatform, // título da aba pode conter dado do cliente final: nunca enviar
            region: detectedHost,
            status: (message.payload.perdaPct > 2 || message.payload.jitterMs > 30 || message.payload.mosScore < 3.4 ||
                     (message.payload.audioIssue && message.payload.audioIssue !== 'NONE')) ? "ALERTA" : "OK",
            audioIssue: message.payload.audioIssue || 'NONE',
            mosScore: String(message.payload.mosScore), // sem valor padrão: MOS ausente não pode virar "ótimo"

            rttMs: message.payload.rttMs || 0,
            jitterMs: message.payload.jitterMs || 0,
            lossPct: message.payload.perdaPct || 0,
            networkType: message.payload.networkType || "ETHERNET",
            cpuStress: message.payload.cpuStress || "NORMAL",
            protocol: message.payload.protocolo ? message.payload.protocolo.toUpperCase() : "UDP",
            callActive: true,
            currentCallId: message.payload.callId || ""
        });

    } else if (message.action === 'REPORT_CALL_SUMMARY' && message.payload) {
        isCallActive = false;
        chrome.storage.local.set({ isCallActive: false });

        // Salva histórico local
        chrome.storage.local.get(['callHistory'], (res) => {
            let hist = res.callHistory || [];
            hist.unshift(message.payload);
            if (hist.length > 50) hist = hist.slice(0, 50);
            chrome.storage.local.set({ callHistory: hist });
        });

        // Despacha auditoria consolidada para a Nuvem
        sendWsMessage({
            type: 'CALL_AUDIT_SUMMARY',
            interactionId: message.payload.callId,
            platform: message.payload.platform || "VoIP WebRTC",
            platformCode: message.payload.platformCode || "WEBRTC",
            operator: operatorName,
            station: agentStationId,
            startTime: message.payload.startTime,
            endTime: message.payload.endTime,
            durationSeconds: message.payload.durationSeconds,
            mosMedio: message.payload.mosMedio,
            mosMinimo: message.payload.mosMinimo,
            jitterPicoMs: message.payload.jitterPicoMs,
            rttMedioMs: message.payload.rttMedioMs,
            perdaPacotesPct: message.payload.perdaPacotesPct,
            protocolo: message.payload.protocolo,
            classificacao: message.payload.classificacao,
            networkType: message.payload.networkType || "ETHERNET",
            cpuStress: message.payload.cpuStress || "NORMAL",
            causaRaiz: message.payload.causaRaiz || "REDE_HOMOLOGADA",
            incidentesAudio: Array.isArray(message.payload.incidentesAudio) ? message.payload.incidentesAudio : [],
            trocasDispositivo: message.payload.trocasDispositivo || 0
        });

        // Se havia limpeza de cache bloqueada durante a conversa, executa agora
        if (pendingCacheClear) {
            setTimeout(() => executeSafeCacheClear('post_call'), 1500);
        }

    } else if (message.action === 'REPORT_API_LATENCY' && message.payload && Array.isArray(message.payload.hosts)) {
        // Latência de API não altera o estado de chamada
        sendWsMessage({
            type: 'API_LATENCY',
            operator: operatorName,
            station: agentStationId,
            janelaSeg: message.payload.janelaSeg,
            hosts: message.payload.hosts
        });

    } else if (message.action === 'RUN_NET_PROBE' && fromExtensionPage) {
        runNetProbe().then(sendResponse);
        return true;

    } else if (message.action === 'SUBMIT_PRECHECK' && fromExtensionPage && message.result) {
        const r = message.result;
        chrome.storage.local.set({ lastPrecheck: { status: r.status, checkedAt: new Date().toISOString() } });
        sendWsMessage({
            type: 'SHIFT_PRECHECK',
            operator: operatorName,
            station: agentStationId,
            status: r.status,
            itens: r.itens,
            rttMs: r.net && r.net.rttMs,
            jitterMs: r.net && r.net.jitterMs,
            lossPct: r.net && r.net.lossPct
        });
        sendResponse({ sent: !!(ws && ws.readyState === WebSocket.OPEN) });

    } else if (message.action === 'EXECUTE_SAFE_CACHE_CLEAR' && fromExtensionPage) {
        executeSafeCacheClear('popup_operator').then(sendResponse);
        return true;
    } else if (message.action === 'SET_TENANT_KEY' && fromExtensionPage && typeof message.tenantKey === 'string' && message.tenantKey.length <= 256) {
        tenantKey = message.tenantKey;
        chrome.storage.local.set({ tenantKey: message.tenantKey });
        if (ws) ws.close();
        sendResponse({ success: true });
    }
});
