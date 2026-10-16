/**
 * VoiceVanguard CCaaS - Background Service Worker (Manifest V3)
 * Conexão direta com Cloud Relay WebSocket Multi-Tenant via TenantKey.
 * Suporte a GPO Corporativo (Managed Policy) e Pareamento Dinâmico.
 * TrustCo Technologies
 */

let RELAY_SERVER = "wss://voicevanguard.trustco.pro"; // Custom domain principal
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
let reconnectAttempts = 0;
let isManaged = false;

// Reconexão com recuo exponencial e jitter (evita rajada simultânea de milhares de PAs após uma queda do relay)
function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    const base = Math.min(60000, 5000 * Math.pow(2, Math.min(reconnectAttempts, 4)));
    reconnectAttempts++;
    reconnectTimer = setTimeout(connectToCloudRelay, base * (0.5 + Math.random() * 0.5));
}

// Inicializa Identificadores
chrome.storage.local.get(['tenantKey', 'agentStationId', 'operatorName', 'isCallActive', 'lastTelemetryAt', 'isManaged'], (res) => {
    // O In-Call Lock sobrevive à reinicialização do service worker (MV3 encerra o worker por ociosidade)
    if (res.isCallActive === true) { isCallActive = true; lastTelemetryAt = Number(res.lastTelemetryAt) || Date.now(); }
    if (res.isManaged === true) isManaged = true;
    if (!tenantKey && res.tenantKey) tenantKey = res.tenantKey;
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
    chrome.storage.managed.get(['tenantKey', 'relayServer', 'operatorName'], (managedConfig) => {
        if (chrome.runtime.lastError) return; // sem política instalada
        if (managedConfig && managedConfig.tenantKey) {
            tenantKey = managedConfig.tenantKey;
            isManaged = true;
            chrome.storage.local.set({ tenantKey, isManaged: true });
            // A chave só pode ser enviada por canal cifrado
            if (typeof managedConfig.relayServer === 'string' && /^wss:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(managedConfig.relayServer)) {
                RELAY_SERVER = managedConfig.relayServer;
            }
            if (typeof managedConfig.operatorName === 'string' && managedConfig.operatorName.length <= 64) {
                operatorName = managedConfig.operatorName;
                chrome.storage.local.set({ operatorName });
            }
            reconnectAttempts = 0;
            if (ws) { try { ws.close(); } catch (_) {} }
            connectToCloudRelay();
        }
    });
}

function connectToCloudRelay() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    if (!tenantKey) return; // sem chave configurada não há o que conectar

    const url = RELAY_SERVER;
    try {
        ws = new WebSocket(url);

        ws.onopen = () => {
            reconnectAttempts = 0;
            ws.send(JSON.stringify({ type: 'AUTH', key: tenantKey, agentId: agentStationId }));
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
            scheduleReconnect();
        };

        ws.onerror = () => {
            ws.close();
        };
    } catch (err) {
        scheduleReconnect();
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
        chrome.storage.local.set({ lastMetric: message.payload, isCallActive: true, lastTelemetryAt });

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
            networkType: message.payload.networkType || "N/D",
            cpuStress: message.payload.cpuStress || "NORMAL",
            protocol: message.payload.protocolo ? message.payload.protocolo.toUpperCase() : "UDP",
            callActive: true,
            currentCallId: message.payload.callId || ""
        });

    } else if (message.action === 'REPORT_CALL_SUMMARY' && message.payload) {
        const stillInCall = message.payload.stillInCall === true;
        if (!stillInCall) {
            isCallActive = false;
            chrome.storage.local.set({ isCallActive: false });
        }

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
            networkType: message.payload.networkType || "N/D",
            cpuStress: message.payload.cpuStress || "NORMAL",
            causaRaiz: message.payload.causaRaiz || "REDE_HOMOLOGADA",
            incidentesAudio: Array.isArray(message.payload.incidentesAudio) ? message.payload.incidentesAudio : [],
            trocasDispositivo: message.payload.trocasDispositivo || 0,
            stillInCall
        });

        // Se havia limpeza de cache bloqueada durante a conversa, executa agora
        if (!stillInCall && pendingCacheClear) {
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
    } else if (message.action === 'SET_TENANT_KEY' && fromExtensionPage && typeof message.tenantKey === 'string' && message.tenantKey.length <= 256 && !isManaged) {
        tenantKey = message.tenantKey;
        chrome.storage.local.set({ tenantKey: message.tenantKey });
        if (ws) ws.close();
        sendResponse({ success: true });
    }
});
