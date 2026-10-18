// Trava o comportamento da aproximação de MOS da extensão (injected_webrtc_hook.js).
// A função é extraída do código-fonte real para o teste não divergir de uma cópia.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../03_Chrome_Edge_Extension/injected_webrtc_hook.js'), 'utf8');
const m = src.match(/function calculateMos\(rtt, jitter, lossPct\) \{[\s\S]*?\r?\n    \}\r?\n/);
assert.ok(m, 'calculateMos não encontrada no hook');
const calculateMos = new Function(`${m[0]}; return calculateMos;`)();

test('rede excelente fica próxima do teto G.711 (~4.4)', () => {
    const v = calculateMos(20, 2, 0);
    assert.ok(v >= 4.3 && v <= 4.5, `obtido ${v}`);
});

test('valores de referência (golden) não mudam sem revisão', () => {
    assert.strictEqual(calculateMos(50, 5, 0), 4.37);
    assert.strictEqual(calculateMos(150, 10, 1), 4.19);
    assert.strictEqual(calculateMos(100, 10, 3), 4.11);
    assert.strictEqual(calculateMos(300, 20, 5), 2.98);
});

test('limites: sempre entre 1 e 4.5, mesmo com entradas extremas', () => {
    for (const [r, j, l] of [[0, 0, 0], [5000, 2000, 100], [1e6, 1e6, 100], [0, 0, 100]]) {
        const v = calculateMos(r, j, l);
        assert.ok(v >= 1 && v <= 4.5, `fora da faixa: ${v}`);
    }
});

test('monotonicidade: mais RTT, jitter ou perda nunca melhora o MOS', () => {
    for (const base of [[20, 2, 0], [100, 10, 1], [250, 30, 3]]) {
        const [r, j, l] = base;
        const v = calculateMos(r, j, l);
        assert.ok(calculateMos(r + 50, j, l) <= v, 'RTT');
        assert.ok(calculateMos(r, j + 10, l) <= v, 'jitter');
        assert.ok(calculateMos(r, j, l + 1) <= v, 'perda');
    }
});

test('perda de pacotes derruba a nota de forma relevante', () => {
    assert.ok(calculateMos(50, 5, 5) < calculateMos(50, 5, 0) - 0.3);
});
