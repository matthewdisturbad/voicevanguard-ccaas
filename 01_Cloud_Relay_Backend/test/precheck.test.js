const test = require('node:test');
const assert = require('node:assert');
const { evaluatePrecheck, summarizeProbe } = require('../../03_Chrome_Edge_Extension/precheck.js');

const good = {
    relayConnected: true,
    net: { rttMs: 40, jitterMs: 3, lossPct: 0 },
    devices: { audioInputs: 1, audioOutputs: 1 },
    connection: { effectiveType: '4g' },
    hw: { cores: 8, memoryGb: 8 }
};
const status = (over) => evaluatePrecheck({ ...good, ...over }).status;
const itemOf = (r, id) => r.itens.find(i => i.id === id);

test('estação saudável fica PRONTA', () => assert.strictEqual(status({}), 'PRONTA'));
test('sem microfone é NAO_PRONTA', () => assert.strictEqual(status({ devices: { audioInputs: 0, audioOutputs: 1 } }), 'NAO_PRONTA'));
test('sem saída de áudio é ATENCAO', () => assert.strictEqual(status({ devices: { audioInputs: 1, audioOutputs: 0 } }), 'ATENCAO'));
test('relay desconectado é NAO_PRONTA', () => assert.strictEqual(status({ relayConnected: false }), 'NAO_PRONTA'));
test('RTT, jitter e perda respeitam os limiares', () => {
    assert.strictEqual(status({ net: { rttMs: 150, jitterMs: 3, lossPct: 0 } }), 'ATENCAO');
    assert.strictEqual(status({ net: { rttMs: 300, jitterMs: 3, lossPct: 0 } }), 'NAO_PRONTA');
    assert.strictEqual(status({ net: { rttMs: 40, jitterMs: 30, lossPct: 0 } }), 'ATENCAO');
    assert.strictEqual(status({ net: { rttMs: 40, jitterMs: 3, lossPct: 5 } }), 'NAO_PRONTA');
});
test('falha na medição de rede é NAO_PRONTA com orientação', () => {
    const r = evaluatePrecheck({ ...good, net: { error: 'sem_resposta' } });
    assert.strictEqual(r.status, 'NAO_PRONTA');
    assert.ok(itemOf(r, 'rede').orientacao.length > 0);
});
test('hardware abaixo do mínimo é ATENCAO; valores desconhecidos não penalizam', () => {
    assert.strictEqual(status({ hw: { cores: 2, memoryGb: 8 } }), 'ATENCAO');
    assert.strictEqual(status({ hw: {} }), 'PRONTA');
});
test('item ok não traz orientação', () => assert.strictEqual(itemOf(evaluatePrecheck(good), 'rede_rtt').orientacao, ''));

test('summarizeProbe: mediana, jitter e perda', () => {
    const r = summarizeProbe([40, 50, 40, 50], 5);
    assert.strictEqual(r.rttMs, 50);
    assert.strictEqual(r.jitterMs, 10);
    assert.strictEqual(r.lossPct, 20);
});
test('summarizeProbe sem respostas devolve erro', () => assert.deepStrictEqual(summarizeProbe([], 20), { error: 'sem_resposta' }));

test('latência até a região Genesys entra no veredito quando medida', () => {
    const base = { relayConnected: true, net: { rttMs: 40, jitterMs: 3, lossPct: 0 }, devices: { audioInputs: 1, audioOutputs: 1 }, connection: { effectiveType: '4g' }, hw: { cores: 8, memoryGb: 8 } };
    const find = (r) => r.itens.find(i => i.id === 'regiao_rtt');
    assert.strictEqual(find(evaluatePrecheck(base)), undefined, 'sem região configurada, nada muda');
    assert.strictEqual(find(evaluatePrecheck({ ...base, region: { rttMs: 80 } })).status, 'ok');
    assert.strictEqual(find(evaluatePrecheck({ ...base, region: { rttMs: 180 } })).status, 'atencao');
    assert.strictEqual(evaluatePrecheck({ ...base, region: { rttMs: 400 } }).status, 'NAO_PRONTA');
    assert.strictEqual(find(evaluatePrecheck({ ...base, region: { error: 'sem_resposta' } })).status, 'atencao');
});

test('só regiões Genesys conhecidas são aceitas para a sonda', () => {
    const { isGenesysRegion } = require('../../03_Chrome_Edge_Extension/precheck.js');
    for (const ok of ['mypurecloud.com', 'mypurecloud.com.au', 'sae1.pure.cloud', 'usw2.pure.cloud']) assert.ok(isGenesysRegion(ok), ok);
    for (const bad of ['evil.com', 'mypurecloud.com.evil.com', 'api.mypurecloud.com/x', '', null, undefined, 'x.pure.cloud.evil.io']) assert.ok(!isGenesysRegion(bad), String(bad));
});

test('UDP 3478: opcional, só aparece quando o tenant configurou STUN', () => {
    const base = { relayConnected: true, net: { rttMs: 40, jitterMs: 3, lossPct: 0 }, devices: { audioInputs: 1, audioOutputs: 1 }, hw: { cores: 8, memoryGb: 16 } };
    const find = (r) => r.itens.find(i => i.id === 'udp_3478');
    assert.strictEqual(find(evaluatePrecheck(base)), undefined);
    assert.strictEqual(find(evaluatePrecheck({ ...base, udp: { srflx: true } })).status, 'ok');
    const blocked = evaluatePrecheck({ ...base, udp: { srflx: false } });
    assert.strictEqual(find(blocked).status, 'atencao');
    assert.strictEqual(blocked.status, 'ATENCAO');
    assert.strictEqual(find(evaluatePrecheck({ ...base, udp: { error: 'falha' } })).status, 'atencao');
});

test('validStunServers aceita só stun:host[:porta], no máximo 3', () => {
    const { validStunServers } = require('../../03_Chrome_Edge_Extension/precheck.js');
    assert.deepStrictEqual(validStunServers(['stun:stun.example.com:3478', 'stun:a.b-c.com', 'turn:x.com', 'stun:x.com:99999', 'stun:', 'stun:a b.com', 42, 'stun:bad_host.com']), ['stun:stun.example.com:3478', 'stun:a.b-c.com']);
    assert.strictEqual(validStunServers(['stun:a.com', 'stun:b.com', 'stun:c.com', 'stun:d.com']).length, 3);
    assert.deepStrictEqual(validStunServers('stun:a.com'), []);
});
