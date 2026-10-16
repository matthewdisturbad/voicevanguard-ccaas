const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Extrai o trecho <audio-flow> do hook (que roda como script de página) e o avalia isoladamente
const src = fs.readFileSync(path.join(__dirname, '../../03_Chrome_Edge_Extension/injected_webrtc_hook.js'), 'utf8');
const m = src.match(/\/\/ <audio-flow>[\s\S]*?\n([\s\S]*?)\/\/ <\/audio-flow>/);
assert.ok(m, 'marcadores <audio-flow> não encontrados no hook');
const { detectAudioIssue, computeIntervalLoss } = new Function(`${m[1]}\nreturn { detectAudioIssue, computeIntervalLoss };`)();

const newState = () => ({ prevIn: null, prevOut: null, zeroIn: 0, zeroOut: 0, prevLost: null, prevRecv: null });
const pcWith = (track) => ({ getSenders: () => (track ? [{ track }] : []) });
const mic = (over = {}) => ({ kind: 'audio', readyState: 'live', muted: false, enabled: true, ...over });

// Alimenta N amostras com contadores de pacotes (in/out) e devolve o último veredito
function feed(pc, st, samples) {
    let out;
    for (const [i, o] of samples) out = detectAudioIssue(pc, st, i, o, true, true);
    return out;
}

test('fluxo normal nos dois sentidos é NONE', () => {
    assert.strictEqual(feed(pcWith(mic()), newState(), [[10, 10], [20, 20], [30, 30], [40, 40], [50, 50]]), 'NONE');
});

test('pacotes recebidos parados por 3 amostras = SEM_AUDIO_RECEBIDO (não antes)', () => {
    const st = newState(), pc = pcWith(mic());
    assert.strictEqual(feed(pc, st, [[10, 10], [10, 20], [10, 30]]), 'NONE');   // 2 amostras paradas
    assert.strictEqual(feed(pc, st, [[10, 40]]), 'SEM_AUDIO_RECEBIDO');          // 3ª amostra parada
});

test('recupera ao voltar a receber pacotes', () => {
    const st = newState(), pc = pcWith(mic());
    feed(pc, st, [[10, 10], [10, 20], [10, 30], [10, 40]]);
    assert.strictEqual(feed(pc, st, [[11, 50]]), 'NONE');
});

test('pacotes enviados parados com microfone ativo = SEM_AUDIO_ENVIADO', () => {
    const st = newState(), pc = pcWith(mic());
    assert.strictEqual(feed(pc, st, [[10, 10], [20, 10], [30, 10], [40, 10]]), 'SEM_AUDIO_ENVIADO');
});

test('mute intencional do operador (enabled=false) NÃO é incidente', () => {
    const st = newState(), pc = pcWith(mic({ enabled: false }));
    assert.strictEqual(feed(pc, st, [[10, 10], [20, 10], [30, 10], [40, 10]]), 'NONE');
});

test('microfone desconectado (track ended) tem prioridade', () => {
    const st = newState();
    assert.strictEqual(feed(pcWith(mic({ readyState: 'ended' })), st, [[10, 10], [10, 10], [10, 10], [10, 10]]), 'MIC_DESCONECTADO');
});

test('microfone mudo no sistema (track.muted)', () => {
    assert.strictEqual(feed(pcWith(mic({ muted: true })), newState(), [[10, 10], [20, 20]]), 'MIC_MUDO_SISTEMA');
});

test('sem trilha de áudio local (replaceTrack(null)/espera) não gera incidente de envio', () => {
    const st = newState();
    assert.strictEqual(feed(pcWith(null), st, [[10, 10], [20, 10], [30, 10], [40, 10]]), 'NONE');
});

test('getSenders lançando erro não derruba a detecção', () => {
    const pc = { getSenders: () => { throw new Error('x'); } };
    assert.strictEqual(feed(pc, newState(), [[1, 1], [2, 2]]), 'NONE');
});

test('computeIntervalLoss detecta pico súbito de 50% mesmo após 50.000 pacotes sem perda e o suaviza em ~6 s', () => {
    const st = newState();
    assert.strictEqual(computeIntervalLoss(st, 0, 50000), 0); // linha de base
    // Intervalo seguinte: 50 perdidos e 50 recebidos (50% no intervalo de 2 s)
    assert.strictEqual(computeIntervalLoss(st, 50, 50050), 50);
    // Volta ao normal: o pico decai pela janela de 3 amostras (50/200, depois 50/300), não some de repente
    assert.strictEqual(computeIntervalLoss(st, 50, 50150), 25);
    assert.strictEqual(computeIntervalLoss(st, 50, 50250), 16.7);
    assert.strictEqual(computeIntervalLoss(st, 50, 50350), 0); // o pico saiu da janela
});

test('computeIntervalLoss: reinício de contadores não gera pico falso', () => {
    const st = newState();
    computeIntervalLoss(st, 0, 1000);
    computeIntervalLoss(st, 0, 1100);
    // contadores zerados (nova conexão): delta ignorado, sem perda inventada
    assert.strictEqual(computeIntervalLoss(st, 0, 5), 0);
});
