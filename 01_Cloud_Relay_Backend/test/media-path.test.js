// Caminho de mídia (protocolo + tipo do candidato) e cadência de envio da extensão.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../03_Chrome_Edge_Extension/injected_webrtc_hook.js'), 'utf8');
const m = src.match(/function classifyMediaPath\(stats\) \{[\s\S]*?\r?\n    \}\r?\n/);
assert.ok(m, 'classifyMediaPath não encontrada no hook');
const classifyMediaPath = new Function(`${m[0]}; return classifyMediaPath;`)();
const { createCadence, normalizeMode, measureSeconds } = require('../../03_Chrome_Edge_Extension/cadence.js');

const report = (...rows) => new Map(rows.map(r => [r.id, r]));

test('par selecionado via transport: UDP direto por NAT', () => {
    const s = report(
        { id: 't', type: 'transport', selectedCandidatePairId: 'p2' },
        { id: 'p1', type: 'candidate-pair', localCandidateId: 'l1', state: 'failed' },
        { id: 'p2', type: 'candidate-pair', localCandidateId: 'l2', state: 'succeeded' },
        { id: 'l1', type: 'local-candidate', protocol: 'tcp', candidateType: 'host' },
        { id: 'l2', type: 'local-candidate', protocol: 'udp', candidateType: 'srflx', address: '203.0.113.9' }
    );
    // Candidato TCP não usado NÃO pode marcar a chamada como TCP (limitação da detecção antiga)
    assert.deepStrictEqual(classifyMediaPath(s), { protocol: 'udp', type: 'srflx', rttMs: null });
});

test('sem transport: usa o par nomeado/succeeded; TCP direto é detectado', () => {
    const s = report(
        { id: 'p', type: 'candidate-pair', localCandidateId: 'l', nominated: true, state: 'succeeded' },
        { id: 'l', type: 'local-candidate', protocol: 'tcp', candidateType: 'host' }
    );
    assert.deepStrictEqual(classifyMediaPath(s), { protocol: 'tcp', type: 'host', rttMs: null });
});

test('TURN sobre TCP/TLS conta como TCP; TURN sobre UDP segue UDP', () => {
    const mk = (relayProtocol) => report(
        { id: 't', type: 'transport', selectedCandidatePairId: 'p' },
        { id: 'p', type: 'candidate-pair', localCandidateId: 'l' },
        { id: 'l', type: 'local-candidate', protocol: 'udp', candidateType: 'relay', relayProtocol }
    );
    assert.deepStrictEqual(classifyMediaPath(mk('tls')), { protocol: 'tcp', type: 'relay', rttMs: null });
    assert.deepStrictEqual(classifyMediaPath(mk('udp')), { protocol: 'udp', type: 'relay', rttMs: null });
});

test('sem par selecionado devolve null; tipo desconhecido vira unknown', () => {
    assert.strictEqual(classifyMediaPath(report({ id: 'x', type: 'inbound-rtp' })), null);
    const s = report(
        { id: 't', type: 'transport', selectedCandidatePairId: 'p' },
        { id: 'p', type: 'candidate-pair', localCandidateId: 'l' },
        { id: 'l', type: 'local-candidate', protocol: 'udp', candidateType: 'qualquer' }
    );
    assert.deepStrictEqual(classifyMediaPath(s), { protocol: 'udp', type: 'unknown', rttMs: null });
});

test('o resultado nunca carrega endereços IP', () => {
    const s = report(
        { id: 't', type: 'transport', selectedCandidatePairId: 'p' },
        { id: 'p', type: 'candidate-pair', localCandidateId: 'l' },
        { id: 'l', type: 'local-candidate', protocol: 'udp', candidateType: 'host', address: '10.0.0.5', ip: '10.0.0.5', port: 5000 }
    );
    assert.deepStrictEqual(Object.keys(classifyMediaPath(s)).sort(), ['protocol', 'rttMs', 'type']);
});

const S = (o = {}) => ({ status: 'OK', audioIssue: 'NONE', mediaPath: 'udp-srflx', ...o });

test('cadência realtime: toda amostra segue; modo inválido cai em realtime', () => {
    const c = createCadence('lixo');
    assert.strictEqual(c.mode, 'realtime');
    assert.ok([0, 2000, 4000].every(t => c.shouldSend(S(), t)));
});

test('cadência sampled: 1ª amostra segue, depois só a cada 10 s ou quando algo muda', () => {
    const c = createCadence('sampled');
    assert.ok(c.shouldSend(S(), 1000));
    assert.ok(!c.shouldSend(S(), 3000));
    assert.ok(!c.shouldSend(S(), 9000));
    assert.ok(c.shouldSend(S(), 11000));
    assert.ok(c.shouldSend(S({ status: 'ALERTA' }), 12000));
    assert.ok(c.shouldSend(S({ status: 'ALERTA', audioIssue: 'SEM_AUDIO_RECEBIDO' }), 14000));
    assert.ok(c.shouldSend(S({ status: 'ALERTA', audioIssue: 'SEM_AUDIO_RECEBIDO', mediaPath: 'tcp-relay' }), 16000));
});

test('cadência on_demand: presença a cada 30 s; janela "Medir agora" libera tudo e expira', () => {
    const c = createCadence('on_demand');
    assert.ok(c.shouldSend(S(), 0));
    assert.ok(!c.shouldSend(S(), 10000));
    c.measure(10, 12000); // janela até 22000
    assert.ok(c.shouldSend(S(), 14000));
    assert.ok(c.shouldSend(S(), 16000));
    assert.ok(!c.shouldSend(S(), 23000));
    assert.ok(c.shouldSend(S(), 46000));
});

test('reset (nova chamada) faz a 1ª amostra seguir; limites da janela de medição', () => {
    const c = createCadence('on_demand');
    c.shouldSend(S(), 0);
    c.reset();
    assert.ok(c.shouldSend(S(), 1000));
    assert.strictEqual(measureSeconds(1), 5);
    assert.strictEqual(measureSeconds(9999), 120);
    assert.strictEqual(measureSeconds('x'), 30);
    assert.strictEqual(normalizeMode('sampled'), 'sampled');
});

test('RTT vem do par selecionado, não de outro par "succeeded" que não carrega a mídia', () => {
    const s = report(
        { id: 't', type: 'transport', selectedCandidatePairId: 'p2' },
        { id: 'p1', type: 'candidate-pair', localCandidateId: 'l1', state: 'succeeded', currentRoundTripTime: 0.250 },
        { id: 'p2', type: 'candidate-pair', localCandidateId: 'l2', state: 'succeeded', currentRoundTripTime: 0.040 },
        { id: 'l1', type: 'local-candidate', protocol: 'udp', candidateType: 'relay' },
        { id: 'l2', type: 'local-candidate', protocol: 'udp', candidateType: 'host' }
    );
    assert.strictEqual(classifyMediaPath(s).rttMs, 40);
    const avg = report(
        { id: 'p', type: 'candidate-pair', localCandidateId: 'l', nominated: true, state: 'succeeded', totalRoundTripTime: 0.6, responsesReceived: 10 },
        { id: 'l', type: 'local-candidate', protocol: 'udp', candidateType: 'srflx' }
    );
    assert.strictEqual(classifyMediaPath(avg).rttMs, 60);
});
