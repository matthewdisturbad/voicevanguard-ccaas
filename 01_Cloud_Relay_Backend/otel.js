/**
 * Métricas de saúde do relay via OTLP/HTTP (JSON), sem dependências.
 * Opt-in: sem OTEL_EXPORTER_OTLP_ENDPOINT nada é coletado nem enviado.
 *
 *   OTEL_EXPORTER_OTLP_ENDPOINT   ex.: https://otlp-gateway-prod-sa-east-0.grafana.net/otlp (acrescenta /v1/metrics)
 *   OTEL_EXPORTER_OTLP_HEADERS    "Authorization=Basic xxx" (chave=valor separados por vírgula; nunca é logado)
 *   OTEL_METRIC_EXPORT_INTERVAL   ms, 10000–600000 (padrão 60000)
 *   OTEL_SERVICE_NAME             padrão voicevanguard-relay
 *
 * Privacidade: só rótulos de baixa cardinalidade (tenant, papel, status). Nunca agentId, operador, chave ou IP.
 */
const SCOPE = 'voicevanguard.relay';

function parseHeaders(str) {
    const out = {};
    if (typeof str !== 'string') return out;
    for (const part of str.split(',')) {
        const i = part.indexOf('=');
        if (i <= 0) continue;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (/^[A-Za-z0-9-]{1,64}$/.test(k) && v && !/[\r\n]/.test(v)) out[k] = decodeURIComponent(v);
    }
    return out;
}

// Endereço de envio: https obrigatório (http só para localhost, útil em coletor local).
function metricsUrl(endpoint) {
    let u;
    try { u = new URL(endpoint); } catch (_) { return null; }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
    u.pathname = u.pathname.replace(/\/+$/, '') + '/v1/metrics';
    return u.toString();
}

const attrs = (o) => Object.entries(o || {}).map(([key, value]) => ({ key, value: { stringValue: String(value) } }));
const point = (p, tsNano, startNano) => ({
    attributes: attrs(p.attrs), timeUnixNano: tsNano, ...(startNano ? { startTimeUnixNano: startNano } : {}),
    asDouble: Number.isFinite(p.value) ? p.value : 0
});

/**
 * snapshot: { gauges: [{name, unit, description, points:[{value, attrs}]}], sums: [...mesmo formato, cumulativos] }
 */
function buildPayload(snapshot, { serviceName, startMs, nowMs }) {
    const ts = String(BigInt(nowMs) * 1000000n);
    const start = String(BigInt(startMs) * 1000000n);
    const metrics = [];
    for (const g of snapshot.gauges || []) {
        metrics.push({ name: g.name, unit: g.unit || '', description: g.description || '', gauge: { dataPoints: g.points.map(p => point(p, ts)) } });
    }
    for (const s of snapshot.sums || []) {
        metrics.push({ name: s.name, unit: s.unit || '', description: s.description || '',
            sum: { aggregationTemporality: 2, isMonotonic: true, dataPoints: s.points.map(p => point(p, ts, start)) } });
    }
    return { resourceMetrics: [{
        resource: { attributes: attrs({ 'service.name': serviceName }) },
        scopeMetrics: [{ scope: { name: SCOPE }, metrics }]
    }] };
}

function createMetricsExporter({ env = process.env, collect, fetchImpl = globalThis.fetch, log = () => {}, now = Date.now } = {}) {
    const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!endpoint) return null;
    const url = metricsUrl(endpoint);
    if (!url) { log('OTEL_EXPORTER_OTLP_ENDPOINT inválido (use https); métricas desativadas'); return null; }
    const headers = { 'Content-Type': 'application/json', ...parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS) };
    const serviceName = String(env.OTEL_SERVICE_NAME || 'voicevanguard-relay').slice(0, 64);
    const interval = Math.min(600000, Math.max(10000, Math.floor(Number(env.OTEL_METRIC_EXPORT_INTERVAL)) || 60000));
    const startMs = now();
    let timer = null;
    let failing = false;
    const stats = { exported: 0, failed: 0 };

    async function exportOnce() {
        try {
            const body = JSON.stringify(buildPayload(collect(), { serviceName, startMs, nowMs: now() }));
            const res = await fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            stats.exported++;
            if (failing) { failing = false; log('exportação de métricas restabelecida'); }
        } catch (e) {
            stats.failed++;
            if (!failing) { failing = true; log(`falha ao exportar métricas (${e.message}); nova tentativa no próximo ciclo`); } // não loga cabeçalhos
        }
    }

    return {
        url, interval, stats, exportOnce,
        start() { if (!timer) { timer = setInterval(exportOnce, interval); timer.unref(); } },
        stop() { if (timer) { clearInterval(timer); timer = null; } }
    };
}

module.exports = { createMetricsExporter, buildPayload, parseHeaders, metricsUrl };
