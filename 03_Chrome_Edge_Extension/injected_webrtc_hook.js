/**
 * VoiceDoctor CCaaS - Universal WebRTC Interceptor & Call Quality Engine
 * Compatibilidade Universal com qualquer plataforma de voz em nuvem:
 * - Genesys Cloud
 * - Amazon Connect
 * - Cisco Webex Contact Center
 * - Twilio Flex / WebRTC Voice SDK
 * - Five9
 * - Talkdesk
 * - Zendesk Talk
 * - Microsoft Teams / Zoom Phone Web
 * 
 * Autor: David Paiva
 */

(function() {
    const OriginalRTCPeerConnection = window.RTCPeerConnection;
    if (!OriginalRTCPeerConnection) return;

    // Detecta automaticamente em qual plataforma o operador está trabalhando
    function detectPlatform() {
        const host = window.location.hostname.toLowerCase();
        const href = window.location.href.toLowerCase();

        if (host.includes('pure.cloud') || host.includes('mypurecloud')) return { name: 'Genesys Cloud', code: 'GENESYS' };
        if (host.includes('awsapps.com') || host.includes('amazonconnect') || host.includes('connect.')) return { name: 'Amazon Connect', code: 'AWS_CONNECT' };
        if (host.includes('ciscocc') || host.includes('webex.com')) return { name: 'Cisco Webex CC', code: 'CISCO_WEBEX' };
        if (host.includes('twilio') || host.includes('flex.')) return { name: 'Twilio Flex', code: 'TWILIO' };
        if (host.includes('five9')) return { name: 'Five9', code: 'FIVE9' };
        if (host.includes('talkdesk')) return { name: 'Talkdesk', code: 'TALKDESK' };
        if (host.includes('zendesk')) return { name: 'Zendesk Talk', code: 'ZENDESK' };
        if (host.includes('teams.microsoft.com')) return { name: 'Microsoft Teams', code: 'MS_TEAMS' };
        if (host.includes('zoom.us')) return { name: 'Zoom Phone', code: 'ZOOM' };

        return { name: 'VoIP WebRTC Genérico (' + host + ')', code: 'GENERIC_WEBRTC' };
    }

    const currentPlatform = detectPlatform();

    // Troca/remoção de dispositivos de áudio (apenas contador; nomes de dispositivo nunca são lidos)
    let deviceChangeCount = 0;
    try {
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', () => { deviceChangeCount++; });
        }
    } catch (e) { }

    // <audio-flow> (trecho extraído e testado em 01_Cloud_Relay_Backend/test/audio-flow.test.js)
    // Diagnóstico de fluxo de áudio. Mute intencional do operador (track.enabled=false) NÃO é incidente.
    // Retorna: NONE | MIC_DESCONECTADO | MIC_MUDO_SISTEMA | SEM_AUDIO_RECEBIDO | SEM_AUDIO_ENVIADO
    const AUDIO_STALL_SAMPLES = 3; // 3 amostras de 2 s sem variação de pacotes
    function detectAudioIssue(pc, st, inPackets, outPackets, hasIn, hasOut) {
        if (hasIn) {
            st.zeroIn = (st.prevIn !== null && inPackets === st.prevIn) ? st.zeroIn + 1 : 0;
            st.prevIn = inPackets;
        }
        if (hasOut) {
            st.zeroOut = (st.prevOut !== null && outPackets === st.prevOut) ? st.zeroOut + 1 : 0;
            st.prevOut = outPackets;
        }
        let track = null;
        try {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
            track = sender ? sender.track : null;
        } catch (e) { }

        if (track && track.readyState === 'ended') return 'MIC_DESCONECTADO';
        if (track && track.muted) return 'MIC_MUDO_SISTEMA';
        if (st.zeroIn >= AUDIO_STALL_SAMPLES) return 'SEM_AUDIO_RECEBIDO';
        if (track && track.enabled && st.zeroOut >= AUDIO_STALL_SAMPLES) return 'SEM_AUDIO_ENVIADO';
        return 'NONE';
    }
    // </audio-flow>
    let lastDetectedConversationId = null;

    // Diagnóstico de Rede (Wi-Fi vs Ethernet) e Estresse do Navegador
    function getNetworkEnvironment() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        let type = 'ETHERNET'; // Default seguro
        let downlink = 10;
        let rtt = 20;

        if (conn) {
            downlink = conn.downlink || 10;
            rtt = conn.rtt || 20;
            if (conn.type === 'wifi' || conn.effectiveType === '2g' || conn.effectiveType === '3g' || (conn.rtt > 80 && conn.downlink < 15)) {
                type = 'WI_FI_OR_CELLULAR';
            } else if (conn.type === 'ethernet') {
                type = 'CABO_ETHERNET';
            } else {
                type = conn.rtt > 70 ? 'WI_FI_PROVAVEL' : 'REDE_ESTAVEL';
            }
        }
        return { type, downlink, rtt };
    }

    // Detecção de Estresse de Memória / CPU do Navegador
    function getSystemStress() {
        let memStress = "NORMAL";
        if (performance && performance.memory) {
            const usedMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
            const limitMB = Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024));
            if (usedMB > 450 || (usedMB / limitMB) > 0.7) memStress = "ALTO_CONSUMO_RAM";
        }
        return { memStress, cores: navigator.hardwareConcurrency || 4 };
    }

    // 1. Interceptor de API Fetch Universal
    // Captura IDs de contato/chamada independente da sintaxe de cada fornecedor
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
            if (url) {
                // Genesys Cloud: /conversations/(calls/)?[UUID]
                let match = url.match(/\/conversations\/(calls\/)?([a-f0-9-]{36})/i);
                if (match) lastDetectedConversationId = match[2];

                // Amazon Connect: /contact/[UUID] ou contactId=[UUID]
                if (!match) {
                    match = url.match(/\/contact(s)?\/([a-f0-9-]{36})/i) || url.match(/contactId=([a-f0-9-]{36})/i);
                    if (match) lastDetectedConversationId = match[1] || match[2];
                }

                // Twilio Flex / Voice: CallSid CA[a-f0-9]{32}
                if (!match) {
                    match = url.match(/(CA[a-f0-9]{32})/i);
                    if (match) lastDetectedConversationId = match[1];
                }

                // UUID Genérico em qualquer endpoint REST de telefonia
                if (!match && (url.includes('call') || url.includes('voice') || url.includes('interaction'))) {
                    match = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
                    if (match) lastDetectedConversationId = match[1];
                }
            }
        } catch (e) { }
        return originalFetch.apply(this, args);
    };

    // 2. Extração de ID da Interação no DOM ou URL
    function findConversationId() {
        if (lastDetectedConversationId) return lastDetectedConversationId;

        try {
            // Procura UUID na barra de endereços
            const urlMatch = window.location.href.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
            if (urlMatch && urlMatch[1]) return urlMatch[1];

            // Procura atributos HTML comumente usados por CRMs e softphones
            const selectors = [
                '[data-interaction-id]', '[data-conversation-id]', '[data-call-id]',
                '[data-contact-id]', '[data-call-sid]', '[id*="conversation"]', '[class*="interaction"]'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const val = el.getAttribute('data-interaction-id') || 
                                el.getAttribute('data-conversation-id') || 
                                el.getAttribute('data-call-id') || 
                                el.getAttribute('data-contact-id') ||
                                el.getAttribute('data-call-sid');
                    if (val) return val;
                }
            }
        } catch (e) { }

        // Fallback: ID temporal com prefixo da plataforma
        return `${currentPlatform.code}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 1000)}`;
    }

    // 3. Fórmula Padrão Internacional de Qualidade de Voz: ITU-T G.107 (E-model MOS)
    function calculateMos(rtt, jitter, lossPct) {
        const effectiveLatency = rtt + (jitter * 2) + 10;
        let r = 93.2;
        if (effectiveLatency < 160) {
            r -= (effectiveLatency / 40);
        } else {
            r -= ((effectiveLatency - 120) / 10);
        }
        r -= (lossPct * 2.5);
        if (r < 0) r = 0;
        if (r > 100) r = 100;
        let mos = 1 + (0.035 * r) + (r * (100 - r) * (r - 60) * 0.000007);
        if (mos < 1.0) mos = 1.0;
        if (mos > 4.5) mos = 4.5;
        return Math.round(mos * 100) / 100;
    }

    // 4. Hook Universal em RTCPeerConnection (O Core do WebRTC de todas as plataformas)
    window.RTCPeerConnection = function(...args) {
        const pc = new OriginalRTCPeerConnection(...args);
        setupMonitoring(pc);
        return pc;
    };
    window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;

    function setupMonitoring(pc) {
        let statsInterval = null;
        let activeCall = null;
        const audioState = { prevIn: null, prevOut: null, zeroIn: 0, zeroOut: 0 };

        function startCallSession() {
            if (activeCall) return;
            const now = new Date();
            activeCall = {
                callId: findConversationId(),
                platform: currentPlatform.name,
                platformCode: currentPlatform.code,
                startTime: now.toISOString(),
                startTimestamp: now.getTime(),
                sampleCount: 0,
                jitterSum: 0,
                maxJitter: 0,
                rttSum: 0,
                maxRtt: 0,
                maxLossPct: 0,
                lossSum: 0,
                mosSum: 0,
                minMos: 4.5,
                protocol: 'udp',
                packetsLostTotal: 0,
                audioIncidents: {},
                deviceChangesAtStart: deviceChangeCount
            };
        }

        function endCallSession() {
            if (!activeCall) return;

            const now = new Date();
            const durationSec = Math.round((now.getTime() - activeCall.startTimestamp) / 1000);

            if (durationSec >= 3 && activeCall.sampleCount > 0) {
                const avgJitter = Math.round((activeCall.jitterSum / activeCall.sampleCount) * 10) / 10;
                const avgRtt = Math.round(activeCall.rttSum / activeCall.sampleCount);
                const avgLoss = Math.round((activeCall.lossSum / activeCall.sampleCount) * 10) / 10;
                const avgMos = Math.round((activeCall.mosSum / activeCall.sampleCount) * 100) / 100;

                let classification = "EXCELENTE";
                let rootCause = "REDE_HOMOLOGADA";
                if (activeCall.minMos < 3.6 || activeCall.maxLossPct > 2.0 || activeCall.maxJitter > 45) {
                    classification = "CRÍTICA";
                    rootCause = (activeCall.netType && activeCall.netType.includes('WI_FI')) ? "INSTABILIDADE_WI_FI" : "CONGESTIONAMENTO_ROTA";
                } else if (activeCall.minMos < 4.0 || activeCall.maxJitter > 30 || avgLoss > 1.0) {
                    classification = "DEGRADADA";
                    rootCause = (activeCall.cpuStress === 'ALTO_CONSUMO_RAM') ? "SOBRECARGA_CPU_OPERADOR" : "JITTER_INTERMITENTE";
                } else if (avgMos < 4.2) {
                    classification = "BOA";
                }

                const audioIncidents = Object.keys(activeCall.audioIncidents);
                if (audioIncidents.length > 0) {
                    classification = "CRÍTICA";
                    rootCause = "FALHA_AUDIO_ESTACAO";
                }

                const summary = {
                    evento: 'CHAMADA_FINALIZADA',
                    callId: activeCall.callId,
                    platform: activeCall.platform,
                    platformCode: activeCall.platformCode,
                    startTime: activeCall.startTime,
                    endTime: now.toISOString(),
                    durationSeconds: durationSec,
                    mosMedio: avgMos,
                    mosMinimo: activeCall.minMos,
                    jitterMedioMs: avgJitter,
                    jitterPicoMs: activeCall.maxJitter,
                    rttMedioMs: avgRtt,
                    rttPicoMs: activeCall.maxRtt,
                    perdaPacotesTotal: activeCall.packetsLostTotal,
                    perdaPacotesPct: activeCall.maxLossPct,
                    protocolo: activeCall.protocol.toUpperCase(),
                    classificacao: classification,
                    networkType: activeCall.netType || "ETHERNET",
                    cpuStress: activeCall.cpuStress || "NORMAL",
                    causaRaiz: rootCause,
                    incidentesAudio: audioIncidents,
                    trocasDispositivo: deviceChangeCount - activeCall.deviceChangesAtStart,
                    timestamp: now.toISOString()
                };

                reportMetric(summary);
            }

            activeCall = null;
            if (statsInterval) {
                clearInterval(statsInterval);
                statsInterval = null;
            }
        }

        // pc.close() chamado pela aplicação NÃO dispara connectionstatechange (spec W3C):
        // sem este wrapper o resumo da chamada nunca seria enviado ao encerrar normalmente.
        const originalClose = pc.close.bind(pc);
        pc.close = function() {
            endCallSession();
            return originalClose();
        };

        pc.addEventListener('connectionstatechange', () => {
            const state = pc.connectionState;
            if (state === 'connected') {
                startCallSession();
                if (!statsInterval) statsInterval = setInterval(collectStats, 2000);
            } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                endCallSession();
            }
        });

        pc.addEventListener('iceconnectionstatechange', () => {
            const state = pc.iceConnectionState;
            if (state === 'connected' || state === 'completed') {
                startCallSession();
                if (!statsInterval) statsInterval = setInterval(collectStats, 2000);
            } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                endCallSession();
            }
        });

        async function collectStats() {
            try {
                if (!pc || pc.connectionState === 'closed') return;
                const stats = await pc.getStats();

                let rtt = 0;
                let jitter = 0;
                let lossPct = 0;
                let protocol = 'udp';
                let hasInboundAudio = false;
                let hasOutboundAudio = false;
                let inPackets = 0;
                let outPackets = 0;

                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
                        if (report.currentRoundTripTime !== undefined) rtt = Math.round(report.currentRoundTripTime * 1000);
                        else if (report.totalRoundTripTime && report.responsesReceived) rtt = Math.round((report.totalRoundTripTime / report.responsesReceived) * 1000);
                    }

                    if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
                        hasInboundAudio = true;
                        inPackets = report.packetsReceived || 0;
                        if (report.jitter !== undefined) jitter = Math.round(report.jitter * 10000) / 10;
                        const lost = report.packetsLost || 0;
                        const received = report.packetsReceived || 0;
                        const total = lost + received;
                        if (total > 0) lossPct = Math.round((lost / total) * 1000) / 10;

                        if (activeCall) {
                            activeCall.packetsLostTotal = lost;
                            if (lossPct > activeCall.maxLossPct) activeCall.maxLossPct = lossPct;
                        }
                    }

                    if (report.type === 'outbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
                        hasOutboundAudio = true;
                        outPackets = report.packetsSent || 0;
                    }

                    if (report.type === 'local-candidate') {
                        if (report.protocol && report.protocol.toLowerCase() === 'tcp') protocol = 'tcp';
                    }
                });

                if (!hasInboundAudio && !hasOutboundAudio) return;

                const audioIssue = detectAudioIssue(pc, audioState, inPackets, outPackets, hasInboundAudio, hasOutboundAudio);
                if (audioIssue !== 'NONE' && activeCall) {
                    activeCall.audioIncidents[audioIssue] = (activeCall.audioIncidents[audioIssue] || 0) + 1;
                }
                // Sem inbound-rtp não há amostra de MOS válida (evita "MOS ótimo" falso); o incidente já foi contabilizado acima
                if (!hasInboundAudio) return;

                const netInfo = getNetworkEnvironment();
                const stressInfo = getSystemStress();
                const mos = calculateMos(rtt, jitter, lossPct);

                if (activeCall) {
                    activeCall.sampleCount++;
                    activeCall.jitterSum += jitter;
                    if (jitter > activeCall.maxJitter) activeCall.maxJitter = jitter;
                    activeCall.rttSum += rtt;
                    if (rtt > activeCall.maxRtt) activeCall.maxRtt = rtt;
                    activeCall.lossSum += lossPct;
                    activeCall.mosSum += mos;
                    if (mos < activeCall.minMos) activeCall.minMos = mos;
                    activeCall.protocol = protocol;
                    activeCall.netType = netInfo.type;
                    activeCall.cpuStress = stressInfo.memStress;
                }

                reportMetric({
                    evento: 'AMOSTRA_VOZ_WEBRTC',
                    callId: activeCall ? activeCall.callId : findConversationId(),
                    platform: currentPlatform.name,
                    platformCode: currentPlatform.code,
                    rttMs: rtt,
                    jitterMs: jitter,
                    perdaPct: lossPct,
                    mosScore: mos,
                    audioIssue: audioIssue,
                    protocolo: protocol,
                    networkType: netInfo.type,
                    downlinkMbps: netInfo.downlink,
                    cpuStress: stressInfo.memStress,
                    timestamp: new Date().toISOString()
                });

            } catch (err) { }
        }
    }

    function reportMetric(payload) {
        window.postMessage({
            source: 'VOICEVANGUARD_WEBRTC_HOOK',
            payload: payload
        }, window.location.origin);
    }

    // 5. Latência e erros das APIs do agent desktop (Resource Timing)
    // Agregado por janela e por HOSTNAME. URL, caminho, query string e IDs nunca são lidos nem enviados.
    const API_WINDOW_MS = 30000;
    const API_HOST_PATTERN = /(^|\.)(pure\.cloud|mypurecloud\.[a-z.]+|connect\.aws|awsapps\.com)$/i;
    const MAX_SAMPLES_PER_HOST = 500;
    let apiWindow = new Map(); // host -> { durations: number[], errors: number }

    function isCcaasApiHost(host) {
        return host === window.location.hostname || API_HOST_PATTERN.test(host);
    }

    function percentile95(sorted) {
        return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
    }

    function flushApiWindow() {
        if (apiWindow.size === 0) return;
        const hosts = [];
        apiWindow.forEach((rec, host) => {
            const d = rec.durations.slice().sort((a, b) => a - b);
            if (d.length === 0) return;
            hosts.push({
                host: host.slice(0, 100),
                count: d.length,
                avgMs: Math.round(d.reduce((x, y) => x + y, 0) / d.length),
                p95Ms: Math.round(percentile95(d)),
                maxMs: Math.round(d[d.length - 1]),
                errors: rec.errors
            });
        });
        apiWindow = new Map();
        if (hosts.length === 0) return;
        hosts.sort((a, b) => b.count - a.count);
        reportMetric({
            evento: 'LATENCIA_API',
            janelaSeg: API_WINDOW_MS / 1000,
            hosts: hosts.slice(0, 5),
            timestamp: new Date().toISOString()
        });
    }

    try {
        if (window.PerformanceObserver) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.initiatorType !== 'fetch' && entry.initiatorType !== 'xmlhttprequest') continue;
                    let host;
                    try { host = new URL(entry.name).hostname; } catch (e) { continue; }
                    if (!isCcaasApiHost(host)) continue;
                    let rec = apiWindow.get(host);
                    if (!rec) { rec = { durations: [], errors: 0 }; apiWindow.set(host, rec); }
                    if (rec.durations.length < MAX_SAMPLES_PER_HOST) rec.durations.push(entry.duration);
                    // responseStatus só é exposto para mesma origem ou com Timing-Allow-Origin
                    if (entry.responseStatus >= 400) rec.errors++;
                }
            });
            observer.observe({ type: 'resource', buffered: false });
            setInterval(flushApiWindow, API_WINDOW_MS);
        }
    } catch (e) { }

    console.log(`[VoiceVanguard] Universal WebRTC Hook ativo para: ${currentPlatform.name}`);
})();
