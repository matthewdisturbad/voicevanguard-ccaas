/**
 * VoiceVanguard CCaaS - Popup Script (White-Label)
 * TrustCo Technologies
 */

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['lastMetric', 'callHistory', 'tenantKey', 'agentStationId', 'isCallActive', 'lastCacheCleared'], (res) => {
        document.getElementById('lblTenant').textContent = res.tenantKey ? 'Configurada' : 'Não configurada';
        document.getElementById('lblStation').textContent = res.agentStationId || 'PA-LIVE';

        const m = res.lastMetric;
        const badgeState = document.getElementById('badgeState');
        const card = document.getElementById('callCard');

        if (m && (new Date() - new Date(m.timestamp)) < 15000) {
            badgeState.textContent = "Chamada Ativa";
            badgeState.className = "status-badge badge-ok";

            document.getElementById('valCallId').textContent = m.callId ? (m.callId.length > 16 ? m.callId.slice(0, 8) + '...' + m.callId.slice(-4) : m.callId) : "WebRTC";
            document.getElementById('valMos').textContent = `${m.mosScore || "4.40"} / 4.50`;
            document.getElementById('valRtt').textContent = `${m.rttMs || 0} ms`;
            document.getElementById('valJitter').textContent = `${m.jitterMs || 0} ms`;
            document.getElementById('valLoss').textContent = `${m.perdaPct || 0} %`;
            document.getElementById('valProto').textContent = m.protocolo ? m.protocolo.toUpperCase() : "UDP";

            if (m.perdaPct > 2 || m.jitterMs > 30) {
                badgeState.textContent = "Áudio Degradado";
                badgeState.className = "status-badge badge-warn";
                card.style.borderLeftColor = "#eab308";
            } else {
                card.style.borderLeftColor = "#16a34a";
            }
        }

        // Histórico de Chamadas
        const history = res.callHistory || [];
        const histListEl = document.getElementById('historyList');
        if (history.length > 0) {
            histListEl.textContent = '';
            history.slice(0, 10).forEach(c => {
                const dur = Number(c.durationSeconds) || 0;
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f1f5f9;';
                const left = document.createElement('div');
                const id = document.createElement('b');
                id.textContent = String(c.interactionId || 'CALL').slice(0, 8);
                const span = document.createElement('span');
                span.style.color = '#64748b';
                span.textContent = ` (${Math.floor(dur / 60)}m ${dur % 60}s)`;
                left.append(id, span);
                const right = document.createElement('div');
                right.append('MOS: ');
                const mos = document.createElement('b');
                mos.textContent = String(c.mosMedio ?? 'N/D');
                right.append(mos);
                row.append(left, right);
                histListEl.append(row);
            });
        }

        // Pré-check de turno
        const btnPre = document.getElementById('btnPrecheck');
        const preEl = document.getElementById('precheckResult');
        if (res.isCallActive) {
            btnPre.disabled = true;
            preEl.textContent = 'Indisponível durante chamada ativa.';
        }
        btnPre.addEventListener('click', async () => {
            btnPre.disabled = true;
            preEl.className = 'feedback';
            preEl.textContent = 'Medindo a rede até o servidor (cerca de 5 s)...';
            try {
                const net = await chrome.runtime.sendMessage({ action: 'RUN_NET_PROBE' });
                const devices = { audioInputs: 0, audioOutputs: 0 };
                try {
                    // Apenas a contagem por tipo; nomes/IDs de dispositivo nunca são lidos
                    (await navigator.mediaDevices.enumerateDevices()).forEach(d => {
                        if (d.kind === 'audioinput') devices.audioInputs++;
                        if (d.kind === 'audiooutput') devices.audioOutputs++;
                    });
                } catch (e) { }
                const stored = await chrome.storage.local.get('relayConnected');
                const result = VVPrecheck.evaluatePrecheck({
                    relayConnected: !!stored.relayConnected,
                    net: net || { error: 'sem_resposta' },
                    devices,
                    connection: navigator.connection ? { effectiveType: navigator.connection.effectiveType } : null,
                    hw: { cores: navigator.hardwareConcurrency, memoryGb: navigator.deviceMemory }
                });
                result.net = net && !net.error ? net : null;
                renderPrecheck(preEl, result);
                chrome.runtime.sendMessage({ action: 'SUBMIT_PRECHECK', result });
            } catch (e) {
                preEl.textContent = 'Não foi possível concluir o pré-check.';
            } finally {
                btnPre.disabled = !!res.isCallActive;
            }
        });

        // Trava Operacional Anti-Queda de Chamada
        const btnClear = document.getElementById('btnClearCache');
        const feedbackEl = document.getElementById('cacheFeedback');

        if (res.isCallActive) {
            btnClear.disabled = true;
            btnClear.style.background = "#94a3b8";
            btnClear.style.cursor = "not-allowed";
            feedbackEl.textContent = "🛑 Indisponível durante chamada ativa.";
            feedbackEl.style.color = "#dc2626";
        } else if (res.lastCacheCleared) {
            const dt = new Date(res.lastCacheCleared).toLocaleTimeString('pt-BR');
            feedbackEl.textContent = `Última limpeza segura: hoje às ${dt}`;
        }

        btnClear.addEventListener('click', async () => {
            btnClear.disabled = true;
            btnClear.textContent = "⏳ Limpando cache...";

            try {
                // A limpeza passa pelo background, que aplica o In-Call Lock
                const result = await chrome.runtime.sendMessage({ action: 'EXECUTE_SAFE_CACHE_CLEAR' });
                if (result && result.inCall) {
                    btnClear.textContent = "🛑 Em chamada: agendada para o pós-chamada";
                    feedbackEl.textContent = "Ação agendada para o fim da chamada.";
                    feedbackEl.style.color = "#dc2626";
                    return;
                }
                if (!result || !result.success) throw new Error('falha');

                btnClear.textContent = "✅ Cache Limpo!";
                btnClear.style.background = "#16a34a";
                feedbackEl.textContent = "Cache estático limpo com sucesso! Sessão preservada.";
                feedbackEl.style.color = "#16a34a";

                setTimeout(() => {
                    btnClear.disabled = false;
                    btnClear.textContent = "🧹 Limpeza Segura de Cache (Preserva Login)";
                    btnClear.style.background = "#0284c7";
                }, 3000);
            } catch (err) {
                btnClear.disabled = false;
                feedbackEl.textContent = "Falha ao limpar cache.";
                feedbackEl.style.color = "#dc2626";
            }
        });
    });
});

function renderPrecheck(container, result) {
    const labels = { PRONTA: 'Estação pronta para o turno', ATENCAO: 'Atenção: revise os itens abaixo', NAO_PRONTA: 'Estação não está pronta' };
    const cls = { PRONTA: 'pc-ok', ATENCAO: 'pc-atencao', NAO_PRONTA: 'pc-falha' };
    const names = {
        relay: 'Servidor VoiceVanguard', rede: 'Rede', rede_rtt: 'Latência', rede_jitter: 'Jitter', rede_perda: 'Perda de pacotes',
        microfone: 'Microfone', saida_audio: 'Saída de áudio', conexao: 'Tipo de conexão', hardware: 'Equipamento'
    };
    container.className = '';
    container.textContent = '';
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:600; margin-bottom:6px;';
    head.className = cls[result.status] || '';
    head.textContent = labels[result.status] || result.status;
    container.append(head);
    result.itens.forEach(i => {
        const row = document.createElement('div');
        row.className = 'pc-item';
        const l = document.createElement('span');
        l.className = 'label';
        l.textContent = names[i.id] || i.id;
        const v = document.createElement('span');
        v.className = 'val pc-' + i.status;
        v.textContent = i.valor;
        row.append(l, v);
        container.append(row);
        if (i.orientacao) {
            const tip = document.createElement('div');
            tip.className = 'pc-tip';
            tip.textContent = i.orientacao;
            container.append(tip);
        }
    });
}
