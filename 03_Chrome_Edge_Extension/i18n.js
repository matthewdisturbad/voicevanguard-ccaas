/**
 * VoiceVanguard CCaaS - Camada de textos (PT-BR / EN) do popup da extensão.
 * Script comum (sem módulos ES), carregado antes de popup.js. Sem recursos externos.
 * Idioma salvo em chrome.storage.local ('vv_lang'); padrão pelo idioma da interface do navegador.
 * Regra: os dicionários pt e en têm exatamente as mesmas chaves (uma por linha).
 */
(function (root) {
    const STORAGE_KEY = 'vv_lang';

    const pt = {
        'lang.group': 'Idioma',
        'lang.pt': 'Mudar para português',
        'lang.en': 'Mudar para inglês',
        'state.idle': 'Em Espera',
        'state.active': 'Chamada Ativa',
        'state.degraded': 'Áudio Degradado',
        'lbl.callId': 'ID da chamada',
        'lbl.mos': 'Voz (MOS)',
        'lbl.rtt': 'Latência (RTT)',
        'lbl.jitter': 'Jitter',
        'lbl.loss': 'Perda de pacotes',
        'lbl.proto': 'Protocolo de mídia',
        'val.ready': 'Pronto',
        'history.title': 'Chamadas recentes',
        'history.empty': 'Nenhuma chamada finalizada neste turno.',
        'history.mos': 'MOS: ',
        'history.na': 'N/D',
        'history.dur': ' ({min}m {sec}s)',
        'pre.title': 'Pré-check de turno',
        'pre.btn': 'Verificar estação antes do turno',
        'pre.hint': 'Testa rede, microfone e equipamento (cerca de 5 s).',
        'pre.measuring': 'Medindo a rede até o servidor (cerca de 5 s)...',
        'pre.failed': 'Não foi possível concluir o pré-check.',
        'pre.unavailable': 'Indisponível durante chamada ativa.',
        'pre.status.PRONTA': 'Estação pronta para o turno',
        'pre.status.ATENCAO': 'Atenção: revise os itens abaixo',
        'pre.status.NAO_PRONTA': 'Estação não está pronta',
        'pre.name.relay': 'Servidor VoiceVanguard',
        'pre.name.rede': 'Rede',
        'pre.name.rede_rtt': 'Latência',
        'pre.name.rede_jitter': 'Jitter',
        'pre.name.rede_perda': 'Perda de pacotes',
        'pre.name.microfone': 'Microfone',
        'pre.name.saida_audio': 'Saída de áudio',
        'pre.name.conexao': 'Tipo de conexão',
        'pre.name.hardware': 'Equipamento',
        'pre.tip.relay.falha': 'A estação não está conectada ao VoiceVanguard. Verifique a chave de licença com o suporte.',
        'pre.tip.rede.falha': 'Não foi possível medir a rede até o servidor. Verifique a conexão e tente novamente.',
        'pre.tip.rede_rtt.atencao': 'Latência alta até o servidor. Prefira cabo de rede ou aproxime-se do roteador; evite VPN desnecessária.',
        'pre.tip.rede_rtt.falha': 'Latência alta até o servidor. Prefira cabo de rede ou aproxime-se do roteador; evite VPN desnecessária.',
        'pre.tip.rede_jitter.atencao': 'Rede instável. Feche downloads/streaming no mesmo roteador e, se estiver em Wi-Fi 2,4 GHz, troque para 5 GHz.',
        'pre.tip.rede_jitter.falha': 'Rede instável. Feche downloads/streaming no mesmo roteador e, se estiver em Wi-Fi 2,4 GHz, troque para 5 GHz.',
        'pre.tip.rede_perda.atencao': 'Há perda de pacotes. Reinicie o roteador ou use conexão por cabo antes de iniciar o turno.',
        'pre.tip.rede_perda.falha': 'Há perda de pacotes. Reinicie o roteador ou use conexão por cabo antes de iniciar o turno.',
        'pre.tip.microfone.falha': 'Nenhum microfone encontrado. Conecte o headset e libere o acesso ao microfone no navegador.',
        'pre.tip.saida_audio.atencao': 'Nenhuma saída de áudio encontrada. Verifique o headset ou o dispositivo de saída do sistema.',
        'pre.tip.conexao.atencao': 'O navegador classifica a conexão como lenta. Prefira rede fixa ou Wi-Fi mais estável.',
        'pre.tip.hardware.atencao': 'Equipamento abaixo do recomendado (4 núcleos e 4 GB). Feche aplicativos e abas desnecessários durante o atendimento.',
        'pre.val.conectado': 'conectado',
        'pre.val.desconectado': 'desconectado',
        'pre.val.sem_medicao': 'sem medição',
        'pre.val.detectado': 'detectado',
        'pre.val.nao_detectado': 'não detectado',
        'pre.val.detectada': 'detectada',
        'pre.val.nao_detectada': 'não detectada',
        'pre.val.nucleos': 'núcleos',
        'clear.btn': 'Limpeza segura de cache (preserva login)',
        'clear.working': 'Limpando cache...',
        'clear.queuedBtn': 'Em chamada: agendada para o pós-chamada',
        'clear.queuedMsg': 'Ação agendada para o fim da chamada.',
        'clear.doneBtn': 'Cache limpo com sucesso',
        'clear.doneMsg': 'Cache estático limpo com sucesso. Sessão preservada.',
        'clear.error': 'Falha ao limpar cache.',
        'clear.locked': 'Indisponível durante chamada ativa.',
        'clear.last': 'Última limpeza segura: hoje às {time}',
        'license': 'Licença:',
        'license.set': 'Configurada',
        'license.unset': 'Não configurada'
    };

    const en = {
        'lang.group': 'Language',
        'lang.pt': 'Switch to Portuguese',
        'lang.en': 'Switch to English',
        'state.idle': 'Standby',
        'state.active': 'Call Active',
        'state.degraded': 'Degraded Audio',
        'lbl.callId': 'Call ID',
        'lbl.mos': 'Voice (MOS)',
        'lbl.rtt': 'Latency (RTT)',
        'lbl.jitter': 'Jitter',
        'lbl.loss': 'Packet loss',
        'lbl.proto': 'Media protocol',
        'val.ready': 'Ready',
        'history.title': 'Recent calls',
        'history.empty': 'No calls finished in this shift.',
        'history.mos': 'MOS: ',
        'history.na': 'N/A',
        'history.dur': ' ({min}m {sec}s)',
        'pre.title': 'Shift pre-check',
        'pre.btn': 'Check workstation before shift',
        'pre.hint': 'Tests network, microphone and equipment (about 5 s).',
        'pre.measuring': 'Measuring the network to the server (about 5 s)...',
        'pre.failed': 'Could not complete the pre-check.',
        'pre.unavailable': 'Unavailable during an active call.',
        'pre.status.PRONTA': 'Workstation ready for the shift',
        'pre.status.ATENCAO': 'Attention: review the items below',
        'pre.status.NAO_PRONTA': 'Workstation is not ready',
        'pre.name.relay': 'VoiceVanguard server',
        'pre.name.rede': 'Network',
        'pre.name.rede_rtt': 'Latency',
        'pre.name.rede_jitter': 'Jitter',
        'pre.name.rede_perda': 'Packet loss',
        'pre.name.microfone': 'Microphone',
        'pre.name.saida_audio': 'Audio output',
        'pre.name.conexao': 'Connection type',
        'pre.name.hardware': 'Hardware',
        'pre.tip.relay.falha': 'This workstation is not connected to VoiceVanguard. Check the license key with support.',
        'pre.tip.rede.falha': 'Could not measure the network to the server. Check your connection and try again.',
        'pre.tip.rede_rtt.atencao': 'High latency to the server. Prefer a network cable or move closer to the router; avoid unnecessary VPN.',
        'pre.tip.rede_rtt.falha': 'High latency to the server. Prefer a network cable or move closer to the router; avoid unnecessary VPN.',
        'pre.tip.rede_jitter.atencao': 'Unstable network. Close downloads/streaming on the same router and, if on 2.4 GHz Wi-Fi, switch to 5 GHz.',
        'pre.tip.rede_jitter.falha': 'Unstable network. Close downloads/streaming on the same router and, if on 2.4 GHz Wi-Fi, switch to 5 GHz.',
        'pre.tip.rede_perda.atencao': 'There is packet loss. Restart the router or use a wired connection before starting your shift.',
        'pre.tip.rede_perda.falha': 'There is packet loss. Restart the router or use a wired connection before starting your shift.',
        'pre.tip.microfone.falha': 'No microphone found. Plug in your headset and allow microphone access in the browser.',
        'pre.tip.saida_audio.atencao': 'No audio output found. Check your headset or the system output device.',
        'pre.tip.conexao.atencao': 'The browser rates the connection as slow. Prefer a wired network or a more stable Wi-Fi.',
        'pre.tip.hardware.atencao': 'Hardware below the recommended level (4 cores and 4 GB). Close unnecessary apps and tabs during service.',
        'pre.val.conectado': 'connected',
        'pre.val.desconectado': 'disconnected',
        'pre.val.sem_medicao': 'no measurement',
        'pre.val.detectado': 'detected',
        'pre.val.nao_detectado': 'not detected',
        'pre.val.detectada': 'detected',
        'pre.val.nao_detectada': 'not detected',
        'pre.val.nucleos': 'cores',
        'clear.btn': 'Safe cache cleanup (keeps login)',
        'clear.working': 'Clearing cache...',
        'clear.queuedBtn': 'On a call: scheduled for after the call',
        'clear.queuedMsg': 'Action scheduled for the end of the call.',
        'clear.doneBtn': 'Cache cleared successfully',
        'clear.doneMsg': 'Static cache cleared successfully. Session preserved.',
        'clear.error': 'Failed to clear cache.',
        'clear.locked': 'Unavailable during an active call.',
        'clear.last': 'Last safe cleanup: today at {time}',
        'license': 'License:',
        'license.set': 'Configured',
        'license.unset': 'Not configured'
    };

    const DICTS = { pt, en };
    let current = 'pt';

    function detectDefault() {
        try {
            const ui = (root.chrome && chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || '';
            return String(ui).toLowerCase().startsWith('pt') ? 'pt' : 'en';
        } catch (e) { return 'en'; }
    }

    function getLang() { return current; }

    function t(key, params) {
        let s = (DICTS[current] && DICTS[current][key]);
        if (s === undefined) s = pt[key];
        if (s === undefined) return key;
        if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
        return s;
    }

    function applyI18n(scope) {
        const base = scope || root.document;
        if (!base) return;
        base.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
        base.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.getAttribute('data-i18n-title')); });
        base.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
        if (root.document && root.document.documentElement) root.document.documentElement.lang = current === 'pt' ? 'pt-BR' : 'en';
    }

    // Carrega o idioma salvo (ou o padrão do navegador). Resolve sempre, mesmo sem storage.
    function initLang() {
        return new Promise(resolve => {
            const fallback = detectDefault();
            try {
                chrome.storage.local.get(STORAGE_KEY, res => {
                    const v = res && res[STORAGE_KEY];
                    current = (v === 'pt' || v === 'en') ? v : fallback;
                    resolve(current);
                });
            } catch (e) { current = fallback; resolve(current); }
        });
    }

    function setLang(lang) {
        if (lang !== 'pt' && lang !== 'en') return;
        current = lang;
        try { chrome.storage.local.set({ [STORAGE_KEY]: lang }); } catch (e) { }
    }

    root.VVI18n = { t, applyI18n, getLang, setLang, initLang, dicts: DICTS };
})(typeof self !== 'undefined' ? self : this);
