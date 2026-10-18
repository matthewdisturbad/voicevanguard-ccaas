/**
 * VoiceVanguard CCaaS - Popup Script (White-Label)
 * TrustCo Technologies
 * Textos em PT-BR/EN via i18n.js (VVI18n). Dados externos sempre via textContent.
 */

const { t, applyI18n, getLang, setLang, initLang } = VVI18n;

// Estado de interface (preservado ao trocar de idioma)
const ui = {
    callActiveNow: false,
    precheck: { mode: 'hint', result: null },   // hint | measuring | unavailable | failed | result
    cache: { mode: 'idle', lastCleared: null }  // idle | working | queued | done | error | locked | last
};

const $ = (id) => document.getElementById(id);

function locale() { return getLang() === 'pt' ? 'pt-BR' : 'en-US'; }

function renderBadge(key, cls) {
    const b = $('badgeState');
    b.textContent = t(key);
    b.className = 'status-badge ' + cls;
}

function renderMetrics(res) {
    const m = res.lastMetric;
    const card = $('callCard');
    const freshMetric = !!(m && m.timestamp && (Date.now() - new Date(m.timestamp).getTime()) < 15000);
    ui.callActiveNow = !!(res.isCallActive && freshMetric);

    if (freshMetric) {
        renderBadge('state.active', 'badge-ok');
        $('valCallId').textContent = m.callId ? (m.callId.length > 16 ? m.callId.slice(0, 8) + '...' + m.callId.slice(-4) : m.callId) : "WebRTC";
        $('valMos').textContent = `${m.mosScore || "4.40"} / 4.50`;
        $('valRtt').textContent = `${m.rttMs || 0} ms`;
        $('valJitter').textContent = `${m.jitterMs || 0} ms`;
        $('valLoss').textContent = `${m.perdaPct || 0} %`;
        $('valProto').textContent = m.protocolo ? m.protocolo.toUpperCase() : "UDP";
        if (m.perdaPct > 2 || m.jitterMs > 30 || (m.audioIssue && m.audioIssue !== 'NONE')) {
            renderBadge('state.degraded', 'badge-warn');
            card.style.borderLeftColor = "var(--warn)";
        } else {
            card.style.borderLeftColor = "var(--ok)";
        }
    } else {
        renderBadge('state.idle', 'badge-idle');
        $('valMos').textContent = t('val.ready');
        $('valRtt').textContent = t('val.ready');
    }
}

function renderHistory(history) {
    const el = $('historyList');
    el.textContent = '';
    if (history.length === 0) {
        el.textContent = t('history.empty');
        return;
    }
    history.slice(0, 10).forEach(c => {
        const dur = Number(c.durationSeconds) || 0;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border);';
        const left = document.createElement('div');
        const id = document.createElement('b');
        id.textContent = String(c.callId || c.interactionId || 'CALL').slice(0, 8);
        const span = document.createElement('span');
        span.style.color = 'var(--text-3)';
        span.textContent = t('history.dur', { min: Math.floor(dur / 60), sec: dur % 60 });
        left.append(id, span);
        const right = document.createElement('div');
        right.append(t('history.mos'));
        const mos = document.createElement('b');
        mos.textContent = String(c.mosMedio ?? t('history.na'));
        right.append(mos);
        row.append(left, right);
        el.append(row);
    });
}

function renderCache() {
    const btn = $('btnClearCache');
    const fb = $('cacheFeedback');
    const c = ui.cache;
    btn.style.background = '';
    fb.style.color = '';
    btn.textContent = t('clear.btn');
    btn.disabled = false;
    fb.textContent = '';
    switch (c.mode) {
        case 'working':
            btn.disabled = true; btn.textContent = t('clear.working'); break;
        case 'queued':
            btn.disabled = true; btn.textContent = t('clear.queuedBtn');
            fb.textContent = t('clear.queuedMsg'); fb.style.color = 'var(--crit)'; break;
        case 'done':
            btn.disabled = true; btn.textContent = t('clear.doneBtn'); btn.style.background = 'var(--ok)';
            fb.textContent = t('clear.doneMsg'); fb.style.color = 'var(--ok)'; break;
        case 'error':
            fb.textContent = t('clear.error'); fb.style.color = 'var(--crit)'; break;
        default:
            if (ui.callActiveNow) {
                btn.disabled = true;
                fb.textContent = t('clear.locked'); fb.style.color = 'var(--crit)';
            } else if (c.lastCleared) {
                const dt = new Date(c.lastCleared).toLocaleTimeString(locale());
                fb.textContent = t('clear.last', { time: dt });
            }
    }
}

function renderPrecheckArea() {
    const btn = $('btnPrecheck');
    const el = $('precheckResult');
    const p = ui.precheck;
    btn.disabled = ui.callActiveNow || p.mode === 'measuring';
    if (p.mode === 'result' && p.result) { renderPrecheck(el, p.result); return; }
    el.className = 'feedback';
    el.textContent = '';
    const msg = { hint: 'pre.hint', measuring: 'pre.measuring', failed: 'pre.failed', unavailable: 'pre.unavailable' }[p.mode] || 'pre.hint';
    el.textContent = t(msg);
}

function renderLangSwitch() {
    document.querySelectorAll('.lang-btn').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()));
    });
}

function render() {
    chrome.storage.local.get(['lastMetric', 'callHistory', 'tenantKey', 'enrollToken', 'stationCredential', 'agentStationId', 'isCallActive', 'lastCacheCleared'], (res) => {
        applyI18n();
        renderLangSwitch();
        $('lblTenant').textContent = (res.tenantKey || res.enrollToken || res.stationCredential) ? t('license.set') : t('license.unset');
        $('lblStation').textContent = res.agentStationId || 'PA-LIVE';

        const m = res.lastMetric;
        const fresh = !!(m && m.timestamp && (Date.now() - new Date(m.timestamp).getTime()) < 15000);
        if (res.isCallActive && !fresh) chrome.storage.local.set({ isCallActive: false });

        renderMetrics(res);
        renderHistory(res.callHistory || []);
        ui.cache.lastCleared = res.lastCacheCleared || null;
        if (ui.callActiveNow && ui.precheck.mode === 'hint') ui.precheck.mode = 'unavailable';
        else if (!ui.callActiveNow && ui.precheck.mode === 'unavailable') ui.precheck.mode = 'hint';
        renderPrecheckArea();
        renderCache();
    });
}

async function runPrecheck() {
    const btnPre = $('btnPrecheck');
    btnPre.disabled = true;
    ui.precheck = { mode: 'measuring', result: null };
    renderPrecheckArea();
    try {
        const net = await chrome.runtime.sendMessage({ action: 'RUN_NET_PROBE' });
        const region = await chrome.runtime.sendMessage({ action: 'RUN_REGION_PROBE' }).catch(() => ({ error: 'falha' }));
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
            region,
            devices,
            connection: navigator.connection ? { effectiveType: navigator.connection.effectiveType } : null,
            hw: { cores: navigator.hardwareConcurrency, memoryGb: navigator.deviceMemory }
        });
        result.net = net && !net.error ? net : null;
        ui.precheck = { mode: 'result', result };
        // O servidor recebe o resultado em português (formato inalterado)
        chrome.runtime.sendMessage({ action: 'SUBMIT_PRECHECK', result });
    } catch (e) {
        ui.precheck = { mode: 'failed', result: null };
    }
    renderPrecheckArea();
}

async function clearCache() {
    ui.cache.mode = 'working';
    renderCache();
    try {
        // A limpeza passa pelo background, que aplica o In-Call Lock
        const result = await chrome.runtime.sendMessage({ action: 'EXECUTE_SAFE_CACHE_CLEAR' });
        if (result && result.inCall) {
            ui.cache.mode = 'queued';
            renderCache();
            return;
        }
        if (!result || !result.success) throw new Error('falha');
        ui.cache.mode = 'done';
        renderCache();
        setTimeout(() => {
            if (ui.cache.mode === 'done') { ui.cache.mode = 'idle'; renderCache(); }
        }, 3000);
    } catch (err) {
        ui.cache.mode = 'error';
        renderCache();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await initLang();
    document.querySelectorAll('.lang-btn').forEach(b => {
        b.addEventListener('click', () => {
            setLang(b.dataset.lang);
            render();
        });
    });
    $('btnPrecheck').addEventListener('click', runPrecheck);
    $('btnClearCache').addEventListener('click', clearCache);
    render();
});

// Palavras conhecidas de `valor` (geradas em português por precheck.js) -> chaves do dicionário
const PRE_VALUE_WORDS = [
    ['não detectado', 'pre.val.nao_detectado'], ['não detectada', 'pre.val.nao_detectada'],
    ['desconectado', 'pre.val.desconectado'], ['sem medição', 'pre.val.sem_medicao'],
    ['conectado', 'pre.val.conectado'], ['detectado', 'pre.val.detectado'],
    ['detectada', 'pre.val.detectada'], ['núcleos', 'pre.val.nucleos']
];

function localizePrecheckValue(valor) {
    let s = String(valor);
    for (const [word, key] of PRE_VALUE_WORDS) {
        if (s === word) return t(key);
        if (word === 'núcleos' && s.includes(word)) s = s.replace(word, t(key));
    }
    return s;
}

function localizePrecheckTip(i) {
    if (!i.orientacao) return '';
    const key = `pre.tip.${i.id}.${i.status}`;
    const loc = t(key);
    // Chave desconhecida (t devolve a própria chave): mantém o texto recebido
    return loc === key ? i.orientacao : loc;
}

function renderPrecheck(container, result) {
    const cls = { PRONTA: 'pc-ok', ATENCAO: 'pc-atencao', NAO_PRONTA: 'pc-falha' };
    container.className = '';
    container.textContent = '';
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:600; margin-bottom:6px;';
    head.className = cls[result.status] || '';
    const statusKey = 'pre.status.' + result.status;
    const statusTxt = t(statusKey);
    head.textContent = statusTxt === statusKey ? result.status : statusTxt;
    container.append(head);
    result.itens.forEach(i => {
        const row = document.createElement('div');
        row.className = 'pc-item';
        const l = document.createElement('span');
        l.className = 'label';
        const nameKey = 'pre.name.' + i.id;
        const nameTxt = t(nameKey);
        l.textContent = nameTxt === nameKey ? i.id : nameTxt;
        const v = document.createElement('span');
        v.className = 'val pc-' + i.status;
        v.textContent = localizePrecheckValue(i.valor);
        row.append(l, v);
        container.append(row);
        const tipTxt = localizePrecheckTip(i);
        if (tipTxt) {
            const tip = document.createElement('div');
            tip.className = 'pc-tip';
            tip.textContent = tipTxt;
            container.append(tip);
        }
    });
}
