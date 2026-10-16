/**
 * VoiceDoctor CCaaS - Popup Script (White-Label)
 * Autor: David Paiva
 */

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['lastMetric', 'callHistory', 'tenantKey', 'agentStationId', 'isCallActive', 'lastCacheCleared'], (res) => {
        document.getElementById('lblTenant').textContent = (res.tenantKey || 'DEMO').split('-')[0];
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
            histListEl.innerHTML = history.slice(0, 10).map(c => {
                const durMin = Math.floor(c.durationSeconds / 60);
                const durSec = c.durationSeconds % 60;
                return `
                    <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f1f5f9;">
                        <div>
                            <b>${(c.interactionId || 'CALL').slice(0, 8)}</b>
                            <span style="color:#64748b;">(${durMin}m ${durSec}s)</span>
                        </div>
                        <div>MOS: <b>${c.mosMedio}</b></div>
                    </div>
                `;
            }).join('');
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
                if (chrome.browsingData && chrome.browsingData.removeCache) {
                    await new Promise((resolve) => chrome.browsingData.removeCache({ since: 0 }, resolve));
                    const now = new Date().toISOString();
                    chrome.storage.local.set({ lastCacheCleared: now });
                }

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
