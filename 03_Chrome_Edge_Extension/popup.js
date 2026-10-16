/**
 * VoiceDoctor CCaaS - Popup Script (White-Label)
 * Autor: David Paiva
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
