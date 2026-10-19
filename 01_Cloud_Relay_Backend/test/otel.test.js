// Métricas de saúde via OTLP/HTTP JSON: opt-in, https, sem rótulos sensíveis.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const { createMetricsExporter, buildPayload, parseHeaders, metricsUrl } = require('../otel');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-otel-'));
process.env.TENANTS_JSON = JSON.stringify({ 'BPO-APEX-GLOBAL': { name: 'Apex', plan: 'Std', maxAgents: 10, agentKey: 'agent-key-apex-1', supervisorKey: 'super-key-apex-1' } });
const { createRelay } = require('../server');

test('sem endpoint nada é criado; endpoint http remoto ou inválido é recusado', () => {
    assert.strictEqual(createMetricsExporter({ env: {}, collect: () => ({}) }), null);
    const warns = [];
    assert.strictEqual(createMetricsExporter({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://metrics.example.com' }, collect: () => ({}), log: m => warns.push(m) }), null);
    assert.strictEqual(createMetricsExporter({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'lixo' }, collect: () => ({}) }), null);
    assert.strictEqual(warns.length, 1);
});

test('URL, cabeçalhos e intervalo seguem a convenção OTEL_*', () => {
    assert.strictEqual(metricsUrl('https://otlp-gateway-prod-sa-east-0.grafana.net/otlp/'), 'https://otlp-gateway-prod-sa-east-0.grafana.net/otlp/v1/metrics');
    assert.strictEqual(metricsUrl('http://localhost:4318'), 'http://localhost:4318/v1/metrics');
    assert.deepStrictEqual(parseHeaders('Authorization=Basic%20abc==, x-a=1, ruim, =v'), { Authorization: 'Basic abc==', 'x-a': '1' });
    const e = createMetricsExporter({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://x.example.com', OTEL_METRIC_EXPORT_INTERVAL: '5' }, collect: () => ({}) });
    assert.strictEqual(e.interval, 10000);
});

test('payload OTLP: gauge e soma monotônica cumulativa com atributos', () => {
    const p = buildPayload({
        gauges: [{ name: 'vvg.stations', unit: '{station}', points: [{ value: 3, attrs: { tenant: 'T', status: 'OK' } }] }],
        sums: [{ name: 'vvg.auth.failures', points: [{ value: 7, attrs: {} }] }]
    }, { serviceName: 'svc', startMs: 1000, nowMs: 2000 });
    const m = p.resourceMetrics[0].scopeMetrics[0].metrics;
    assert.deepStrictEqual(p.resourceMetrics[0].resource.attributes[0], { key: 'service.name', value: { stringValue: 'svc' } });
    assert.strictEqual(m[0].gauge.dataPoints[0].asDouble, 3);
    assert.strictEqual(m[0].gauge.dataPoints[0].timeUnixNano, '2000000000');
    assert.deepStrictEqual(m[1].sum, { aggregationTemporality: 2, isMonotonic: true, dataPoints: [{ attributes: [], timeUnixNano: '2000000000', startTimeUnixNano: '1000000000', asDouble: 7 }] });
});

test('exportação envia com cabeçalho de autenticação e falha sem derrubar nem logar o segredo', async () => {
    const calls = []; const logs = [];
    let ok = true;
    const e = createMetricsExporter({
        env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://x.example.com/otlp', OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic SEGREDO' },
        collect: () => ({ gauges: [], sums: [] }), log: m => logs.push(m),
        fetchImpl: async (url, opt) => { calls.push({ url, opt }); if (!ok) throw new Error('rede'); return { ok: true, status: 200 }; }
    });
    await e.exportOnce();
    assert.strictEqual(calls[0].url, 'https://x.example.com/otlp/v1/metrics');
    assert.strictEqual(calls[0].opt.headers.Authorization, 'Basic SEGREDO');
    ok = false;
    await e.exportOnce(); await e.exportOnce();
    assert.deepStrictEqual(e.stats, { exported: 1, failed: 2 });
    assert.strictEqual(logs.length, 1);
    assert.ok(!logs.join(' ').includes('SEGREDO'));
});

test('relay: coleta de saúde conta conexões, estações e recusas sem rótulos sensíveis', async () => {
    const relay = createRelay({ env: {} });
    await new Promise(r => relay.server.listen(0, r));
    const port = relay.server.address().port;
    const open = (auth) => new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => ws.send(JSON.stringify(auth)));
        setTimeout(() => resolve(ws), 250);
    });
    const socks = [];
    try {
        const a = await open({ type: 'AUTH', key: 'agent-key-apex-1', agentId: 'PA-SECRETO-1' }); socks.push(a);
        a.send(JSON.stringify({ type: 'AGENT_TELEMETRY', station: 'PA-SECRETO-1', mosScore: 4.2, callActive: true }));
        socks.push(await open({ type: 'AUTH', key: 'super-key-apex-1' }));
        const bad = await open({ type: 'AUTH', key: 'chave-errada-xxxx' }); socks.push(bad);
        await new Promise(r => setTimeout(r, 200));
        const h = relay.collectHealth();
        const g = (n) => h.gauges.find(x => x.name === n).points;
        const s = (n) => h.sums.find(x => x.name === n).points;
        assert.deepStrictEqual(g('vvg.ws.connections').map(p => [p.attrs.role, p.value]).sort(), [['agent', 1], ['supervisor', 1]]);
        assert.strictEqual(g('vvg.stations').find(p => p.attrs.status === 'OK').value, 1);
        assert.strictEqual(g('vvg.calls.active')[0].value, 1);
        assert.strictEqual(s('vvg.auth.failures')[0].value, 1);
        assert.ok(s('vvg.messages.received').find(p => p.attrs.role === 'agent').value >= 1);
        assert.ok(!JSON.stringify(h).includes('PA-SECRETO-1'));
        assert.ok(!JSON.stringify(h).includes('agent-key'));
    } finally {
        socks.forEach(w => { try { w.close(); } catch (_) {} });
        await relay.shutdown();
    }
});
