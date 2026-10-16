/**
 * VoiceDoctor CCaaS - Background Service Worker (Manifest V3)
 * Conexão direta com Cloud Relay WebSocket Multi-Tenant via TenantKey.
 * Suporte a GPO Corporativo (Managed Policy) e Pareamento Dinâmico.
 * Autor: David Paiva
 */

let RELAY_SERVER = "wss://voicevanguard.trustco.pro"; // Custom domain principal
let FALLBACK_RELAY_SERVER = "wss://voicevanguard-cloud-production.up.railway.app"; // Railway fallback imediato
let tenantKey = "DEMO-FREE-2026";
let operationKey = null; // chave da torre (operação), distribuída por GPO/Intune; o agente não escolhe
let agentStationId = null;
let operatorName = "Operador";
let ws = null;
let reconnectTimer = null;
let isCallActive = false;
let pendingCacheClear = false;

// Inicializa Identificadores
chrome.storage.local.get(['tenantKey', 'operationKey', 'agentStationId', 'operatorName'], (res) => {
    if (res.tenantKey) tenantKey = res.tenantKey;
    if (res.operationKey) operationKey = res.operationKey;
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
    chrome.storage.managed.get(['tenantKey', 'operationKey', 'relayServer'], (managedConfig) => {
        if (managedConfig && managedConfig.tenantKey) {
            tenantKey = managedConfig.tenantKey;
            if (managedConfig.operationKey) { operationKey = managedConfig.operationKey; chrome.storage.local.set({ operationKey }); }
            chrome.storage.local.set({ tenantKey, isManaged: true });
            if (managedConfig.relayServer) RELAY_SERVER = managedConfig.relayServer;
            if (ws) ws.close();
        }
    });
}

function connectToCloudRelay() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    const url = `${RELAY_SERVER}?tenant=${encodeURIComponent(tenantKey)}&type=agent&agentId=${encodeURIComponent(agentStationId)}` + (operationKey ? `&key=${encodeURIComponent(operationKey)}` : '');
    try {
        ws = new WebSocket(url);

        ws.onopen = () => {
            console.log(`[VoiceDoctor] Conectado ao Cloud Relay | Tenant: ${tenantKey} | ID: ${agentStationId}`);
            chrome.storage.local.set({ relayConnected: true });
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                // Trata comandos remotos disparados pelo supervisor
                if (msg.type === 'EXECUTE_COMMAND') {
                    if (msg.command === 'SAFE_CACHE_CLEAR') {
                        executeSafeCacheClear('remote_supervisor');
                    }
                }
            } catch (e) { }
        };

        ws.onclose = () => {
            chrome.storage.local.set({ relayConnected: false });
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
    if (isCallActive) {
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

function sendWsMessage(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

// Receptor de Mensagens dos Content Scripts (Hook WebRTC)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'REPORT_TELEMETRY' && message.payload) {
        isCallActive = true;
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
            genesysOrg: sender.tab ? sender.tab.title : detectedPlatform,
            region: detectedHost,
            status: (message.payload.perdaPct > 2 || message.payload.jitterMs > 30 || message.payload.mosScore < 3.4) ? "ALERTA" : "OK",
            mosScore: String(message.payload.mosScore || "4.40"),
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
            causaRaiz: message.payload.causaRaiz || "REDE_HOMOLOGADA"
        });

        // Se havia limpeza de cache bloqueada durante a conversa, executa agora
        if (pendingCacheClear) {
            setTimeout(() => executeSafeCacheClear('post_call'), 1500);
        }

    } else if (message.action === 'EXECUTE_SAFE_CACHE_CLEAR') {
        executeSafeCacheClear('popup_operator').then(sendResponse);
        return true;
    } else if (message.action === 'SET_TENANT_KEY') {
        tenantKey = message.tenantKey;
        chrome.storage.local.set({ tenantKey: message.tenantKey });
        if (ws) ws.close();
        sendResponse({ success: true });
    }
});
