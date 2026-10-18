/**
 * VoiceVanguard - Pré-check de turno (lógica pura, sem acesso a APIs do navegador).
 * Recebe medições e devolve o veredito por item e geral. Testável com node:test.
 */
(function (root) {
    // Limiares documentados em docs/PRECHECK.md
    const LIMITS = {
        rttMs: { atencao: 150, falha: 300 },
        jitterMs: { atencao: 30, falha: 60 },
        lossPct: { atencao: 1, falha: 5 },
        minCores: 4,
        minMemoryGb: 4
    };

    function byThreshold(value, lim) {
        if (value >= lim.falha) return 'falha';
        if (value >= lim.atencao) return 'atencao';
        return 'ok';
    }

    function item(id, status, valor, orientacao) {
        return { id, status, valor: String(valor).slice(0, 40), orientacao: status === 'ok' ? '' : orientacao };
    }

    /**
     * input: {
     *   relayConnected: boolean,
     *   net: { rttMs, jitterMs, lossPct } | { error: string },
     *   region: null | { rttMs } | { error: string }   (latência até a API da região Genesys do cliente; null = não configurada),
     *   devices: { audioInputs: number, audioOutputs: number },
     *   connection: { effectiveType?: string } | null,
     *   hw: { cores?: number, memoryGb?: number }
     * }
     */
    function evaluatePrecheck(input) {
        const items = [];
        const net = input.net || {};

        items.push(input.relayConnected
            ? item('relay', 'ok', 'conectado', '')
            : item('relay', 'falha', 'desconectado', 'A estação não está conectada ao VoiceVanguard. Verifique a chave de licença com o suporte.'));

        if (net.error || typeof net.rttMs !== 'number') {
            items.push(item('rede', 'falha', 'sem medição', 'Não foi possível medir a rede até o servidor. Verifique a conexão e tente novamente.'));
        } else {
            items.push(item('rede_rtt', byThreshold(net.rttMs, LIMITS.rttMs), `${net.rttMs} ms`,
                'Latência alta até o servidor. Prefira cabo de rede ou aproxime-se do roteador; evite VPN desnecessária.'));
            items.push(item('rede_jitter', byThreshold(net.jitterMs, LIMITS.jitterMs), `${net.jitterMs} ms`,
                'Rede instável. Feche downloads/streaming no mesmo roteador e, se estiver em Wi-Fi 2,4 GHz, troque para 5 GHz.'));
            items.push(item('rede_perda', byThreshold(net.lossPct, LIMITS.lossPct), `${net.lossPct}%`,
                'Há perda de pacotes. Reinicie o roteador ou use conexão por cabo antes de iniciar o turno.'));
        }

        // Latência até a região Genesys do cliente (aproximação pela API da região, não pela mídia). Opcional.
        if (input.region) {
            const rg = input.region;
            if (rg.error || typeof rg.rttMs !== 'number') {
                items.push(item('regiao_rtt', 'atencao', 'sem medição', 'Não foi possível medir a latência até a região do Genesys. Verifique a conexão e tente novamente.'));
            } else {
                items.push(item('regiao_rtt', byThreshold(rg.rttMs, LIMITS.rttMs), `${rg.rttMs} ms`,
                    'Latência alta até a região do Genesys Cloud. Prefira cabo de rede, evite VPN desnecessária e confirme o caminho de rede até a região da organização.'));
            }
        }

        const dev = input.devices || { audioInputs: 0, audioOutputs: 0 };
        items.push(dev.audioInputs > 0
            ? item('microfone', 'ok', 'detectado', '')
            : item('microfone', 'falha', 'não detectado', 'Nenhum microfone encontrado. Conecte o headset e libere o acesso ao microfone no navegador.'));
        items.push(dev.audioOutputs > 0
            ? item('saida_audio', 'ok', 'detectada', '')
            : item('saida_audio', 'atencao', 'não detectada', 'Nenhuma saída de áudio encontrada. Verifique o headset ou o dispositivo de saída do sistema.'));

        const eff = input.connection && input.connection.effectiveType;
        if (eff) {
            items.push(item('conexao', eff === '4g' ? 'ok' : 'atencao', eff,
                'O navegador classifica a conexão como lenta. Prefira rede fixa ou Wi-Fi mais estável.'));
        }

        const hw = input.hw || {};
        const cores = typeof hw.cores === 'number' ? hw.cores : null;
        const mem = typeof hw.memoryGb === 'number' ? hw.memoryGb : null;
        const hwLow = (cores !== null && cores < LIMITS.minCores) || (mem !== null && mem < LIMITS.minMemoryGb);
        items.push(item('hardware', hwLow ? 'atencao' : 'ok',
            `${cores ?? '?'} núcleos / ${mem ?? '?'} GB`,
            'Equipamento abaixo do recomendado (4 núcleos e 4 GB). Feche aplicativos e abas desnecessários durante o atendimento.'));

        const status = items.some(i => i.status === 'falha') ? 'NAO_PRONTA'
            : items.some(i => i.status === 'atencao') ? 'ATENCAO' : 'PRONTA';
        return { status, itens: items };
    }

    // Estatística da sonda de rede: amostras de RTT (ms) por ping respondido; `sent` = pings enviados
    function summarizeProbe(rtts, sent) {
        if (!sent || rtts.length === 0) return { error: 'sem_resposta' };
        const sorted = rtts.slice().sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        let jitterSum = 0;
        for (let i = 1; i < rtts.length; i++) jitterSum += Math.abs(rtts[i] - rtts[i - 1]);
        const jitter = rtts.length > 1 ? jitterSum / (rtts.length - 1) : 0;
        return {
            rttMs: Math.round(median),
            jitterMs: Math.round(jitter * 10) / 10,
            lossPct: Math.round(((sent - rtts.length) / sent) * 1000) / 10
        };
    }

    // Regiões Genesys Cloud aceitas para a sonda (as mesmas de host_permissions no manifest).
    const REGION_PATTERN = /^(mypurecloud\.(com|ie|de|jp|com\.au)|[a-z0-9]{3,6}\.pure\.cloud)$/;
    const isGenesysRegion = (r) => typeof r === 'string' && REGION_PATTERN.test(r);

    const api = { evaluatePrecheck, summarizeProbe, isGenesysRegion, LIMITS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.VVPrecheck = api;
})(typeof self !== 'undefined' ? self : this);
