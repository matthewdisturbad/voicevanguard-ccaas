/**
 * VoiceVanguard CCaaS - Background Service Worker (Manifest V3)
 * Conexão direta com Cloud Relay WebSocket Multi-Tenant via TenantKey.
 * Suporte a GPO Corporativo (Managed Policy) e Pareamento Dinâmico.
 * TrustCo Technologies
 */

let RELAY_SERVER = "wss://voicevanguard.trustco.pro"; // Custom domain principal
importScripts('precheck.js'); // VVPrecheck.summarizeProbe
importScripts('enroll.js'); // VVEnroll.chooseAuth

let enrollToken = ""; // token de cadastro da torre (GPO/Intune); troca por credencial individual
let stationCredential = "";
let stationCredentialExp = 0;
let enrollFailures = 0;
let genesysRegion = ""; // região Genesys do tenant, informada pelo relay no AUTH_OK (validada antes do uso)
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
chrome.storage.local.get(['tenantKey', 'enrollToken', 'stationCredential', 'stationCredentialExp', 'agentStationId', 'operatorName', 'isCallActive', 'lastTelemetryAt', 'isManaged'], (res) => {
    // O In-Call Lock sobrevive à reinicialização do service worker (MV3 encerra o worker por ociosidade)
    if (res.isCallActive === true) { isCallActive = true; lastTelemetryAt = Number(res.lastTelemetryAt) || Date.now(); }
    if (res.isManaged === true) isManaged = true;
    if (!tenantKey && res.tenantKey) tenantKey = res.tenantKey;
    if (!enrollToken && res.enrollToken) enrollToken = res.enrollToken;
    if (typeof res.stationCredential === 'string') { stationCredential = res.stationCredential; stationCredentialExp = Number(res.stationCredentialExp) || 0; }
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
    chrome.storage.managed.get(['tenantKey', 'enrollToken', 'relayServer', 'operatorName'], (managedConfig) => {
        if (chrome.runtime.lastError) return; // sem política instalada
        if (managedConfig && (managedConfig.tenantKey || managedConfig.enrollToken)) {
            if (managedConfig.tenantKey) tenantKey = managedConfig.tenantKey;
            if (managedConfig.enrollToken && managedConfig.enrollToken !== enrollToken) {
                enrollToken = managedConfig.enrollToken;
                enrollFailures = 0; // token novo: nova chance de cadastro
            }
            isManaged = true;
            chrome.storage.local.set({ tenantKey, enrollToken, isManaged: true });
            // A chave só pode ser enviada por canal cifrado
            if (typeof managedConfig.relayServer === 'string' && /^wss:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(managedConfig.relayServer)) {
                RELAY_SERVER = managedConfig.relayServer;
            }
            if (typeof managedConfig.operatorName === 'string' && managedConfig.operatorName.length <= 64) {
                operatorName = managedConfig.operatorName;
                chrome.storage.local.set({ operatorName });
            }
            reconnectAttempts = 0;
            // Não derruba a telemetria no meio de uma chamada: a nova política vale na próxima conexão.
            if (ws && !callIsActive()) { try { ws.close(); } catch (_) {} }
            connectToCloudRelay();
        }
    });
}

function connectToCloudRelay() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const auth = VVEnroll.chooseAuth({ credential: stationCredential, credentialExp: stationCredentialExp, enrollToken, tenantKey, callActive: callIsActive(), enrollFailures }, Math.floor(Date.now() / 1000));
    if (auth.kind === 'none') {
        // Cadastro adiado por chamada ativa (In-Call Lock): tenta de novo depois; sem nenhuma chave configurada não há o que conectar.
        if (enrollToken && callIsActive() && enrollFailures < VVEnroll.MAX_ENROLL_FAILURES) scheduleReconnect();
        return;
    }

    const url = RELAY_SERVER;
    try {
        ws = new WebSocket(url);

        ws.onopen = () => {
            reconnectAttempts = 0;
            if (auth.kind === 'enroll') ws.send(JSON.stringify({ type: 'ENROLL', enrollToken, stationId: agentStationId }));
            else ws.send(JSON.stringify({ type: 'AUTH', key: auth.key, agentId: agentStationId }));
            console.log(`[VoiceVanguard] Conectado ao Cloud Relay | ID: ${agentStationId}`);
            if (auth.kind !== 'enroll') chrome.storage.local.set({ relayConnected: true });
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'AUTH_OK') {
                    genesysRegion = VVPrecheck.isGenesysRegion(msg.genesysRegion) ? msg.genesysRegion : "";
                    return;
                }

                // Cadastro concluído: guarda a credencial individual; a reconexão (já agendada pelo onclose) passa a usá-la.
                if (msg.type === 'ENROLL_OK' && typeof msg.credential === 'string' && msg.credential.startsWith('vv1.')) {
                    stationCredential = msg.credential;
                    stationCredentialExp = Number(msg.exp) || 0;
                    enrollFailures = 0;
                    chrome.storage.local.set({ stationCredential, stationCredentialExp });
                    return;
                }

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
            if (auth.kind === 'enroll' && ev && ev.code === 1000 && stationCredential) { reconnectAttempts = 0; scheduleReconnect(); return; }
            if (ev && ev.code === 4001) {
                // Credencial recusada (revogada, epoch trocado ou segredo rotacionado): descarta e tenta cadastrar de novo, no máximo MAX_ENROLL_FAILURES vezes.
                if (auth.kind === 'credential') {
                    stationCredential = ''; stationCredentialExp = 0;
                    chrome.storage.local.remove(['stationCredential', 'stationCredentialExp']);
                    if (enrollToken) { enrollFailures++; scheduleReconnect(); }
                } else if (auth.kind === 'enroll') {
                    enrollFailures++; // esgotadas as tentativas, chooseAuth cai para a chave da torre, se houver
                    scheduleReconnect();
                }
                return; // chave recusada: não insistir em loop
            }
            if (auth.kind === 'enroll' && ev && ev.code === 4003) { enrollFailures++; } // teto de estações da torre
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
            result: { success: false, inCall: true, code: 'IN_CALL_QUEUED', message: 'Operador em chamada ativa. Ação agendada para o pós-chamada.' }
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
            result: { success: true, code: 'CACHE_CLEARED', timestamp: now, origin: origin }
        });

        return { success: true };
    } catch (e) {
        sendWsMessage({ type: 'COMMAND_RESULT', result: { success: false, code: 'CLEAR_FAILED', timestamp: new Date().toISOString(), origin: origin } });
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

// Latência até a API da região Genesys do cliente (pré-check). Só mede tempo: sem cookies, sem credenciais, resposta ignorada.
async function runRegionProbe() {
    if (!genesysRegion) return null;
    const COUNT = 5, TIMEOUT_MS = 3000;
    const url = `https://api.${genesysRegion}/api/v2/organizations/me`;
    const rtts = [];
    for (let i = 0; i <= COUNT; i++) { // a primeira serve só para abrir a conexão TLS e não entra na estatística
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        const t0 = performance.now();
        try {
            await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
            if (i > 0) rtts.push(performance.now() - t0);
        } catch (_) { /* sem resposta */ }
        clearTimeout(timer);
    }
    const s = self.VVPrecheck.summarizeProbe(rtts, COUNT);
    return s.error ? s : { rttMs: s.rttMs, region: genesysRegion };
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

    } else if (message.action === 'RUN_REGION_PROBE' && fromExtensionPage) {
        runRegionProbe().then(sendResponse);
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
