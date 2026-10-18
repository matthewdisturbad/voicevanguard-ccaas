/**
 * Causa por frota: compara, no mesmo instante, as estações em chamada para separar
 * problema isolado de estação, de um grupo (rede/região/plataforma) ou amplo (plataforma, região ou relay).
 * Lógica pura, sem dados pessoais: só contagens e ids de estação já visíveis ao supervisor.
 */
(function (root) {
    const MIN_SAMPLE = 5;          // abaixo disso não há como comparar
    const DEGRADED_MOS = 3.6;      // abaixo de 3.6 (ITU-T G.107) parte dos usuários fica insatisfeita
    const MIN_GROUP = 3;
    const DIMENSIONS = ['networkType', 'region', 'platformCode'];
    const UNKNOWN = new Set(['', 'N/D', 'auto', 'Global', undefined, null]);

    const isDegraded = (a) => Number(a.mosScore) < DEGRADED_MOS;

    function analyze(agents) {
        const live = agents.filter(a => a && a.status !== 'OFFLINE' && a.callActive === true && Number.isFinite(Number(a.mosScore)));
        const total = live.length;
        const bad = live.filter(isDegraded);
        const out = { state: 'insufficient', total, degraded: bad.length, group: null, stations: [] };
        if (total < MIN_SAMPLE) return out;
        if (bad.length === 0) return { ...out, state: 'healthy' };
        const ratio = bad.length / total;
        if (bad.length <= 2 && ratio <= 0.25) return { ...out, state: 'isolated', stations: bad.slice(0, 5).map(a => a.station || a.agentId) };

        let best = null;
        for (const dim of DIMENSIONS) {
            const groups = new Map();
            for (const a of live) {
                if (UNKNOWN.has(a[dim])) continue;
                const g = groups.get(a[dim]) || { n: 0, bad: 0 };
                g.n++; if (isDegraded(a)) g.bad++;
                groups.set(a[dim], g);
            }
            for (const [key, g] of groups) {
                const outN = total - g.n;
                const outBad = bad.length - g.bad;
                if (g.n < MIN_GROUP || g.bad / g.n < 0.6 || g.bad < 0.6 * bad.length) continue;
                if (outN >= 2 && outBad / outN > 0.25) continue;
                if (!best || g.bad > best.degraded) best = { dimension: dim, key: String(key), total: g.n, degraded: g.bad };
            }
        }
        if (best && best.total < total) return { ...out, state: 'group', group: best };
        if (ratio >= 0.6) return { ...out, state: 'widespread' };
        return { ...out, state: 'partial' };
    }

    const api = { analyze, MIN_SAMPLE, DEGRADED_MOS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.VVFleet = api;
})(typeof self !== 'undefined' ? self : this);
