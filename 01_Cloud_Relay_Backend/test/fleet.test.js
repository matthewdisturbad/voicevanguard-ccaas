const test = require('node:test');
const assert = require('node:assert');
const { analyze } = require('../public/fleet.js');

let n = 0;
const st = (o = {}) => ({ station: `PA-${++n}`, status: 'OK', callActive: true, mosScore: '4.1', networkType: 'ETHERNET', region: 'sa-east-1', platformCode: 'GENESYS', ...o });
const many = (k, o) => Array.from({ length: k }, () => st(o));

test('poucas estações em chamada: não conclui nada', () => {
    assert.strictEqual(analyze(many(4, { mosScore: '2.0' })).state, 'insufficient');
    assert.strictEqual(analyze([...many(4), st({ callActive: false })]).state, 'insufficient');
    assert.strictEqual(analyze([...many(4), st({ status: 'OFFLINE' })]).total, 4);
});

test('ninguém degradado: saudável', () => {
    assert.strictEqual(analyze(many(8)).state, 'healthy');
});

test('uma estação ruim entre muitas boas: problema isolado da estação', () => {
    const r = analyze([...many(8), st({ mosScore: '2.2', station: 'PA-RUIM' })]);
    assert.strictEqual(r.state, 'isolated');
    assert.deepStrictEqual(r.stations, ['PA-RUIM']);
});

test('as ruins concentradas em uma rede: aponta o grupo', () => {
    const r = analyze([...many(6), ...many(4, { mosScore: '2.5', networkType: 'WIFI' }), ...many(1, { networkType: 'WIFI' })]);
    assert.strictEqual(r.state, 'group');
    assert.deepStrictEqual({ d: r.group.dimension, k: r.group.key, n: r.group.total, b: r.group.degraded }, { d: 'networkType', k: 'WIFI', n: 5, b: 4 });
});

test('quase todas ruins sem grupo em comum: problema amplo (plataforma, região ou relay)', () => {
    assert.strictEqual(analyze([...many(8, { mosScore: '2.4' }), ...many(1)]).state, 'widespread');
});

test('degradação média sem padrão: parcial; valores desconhecidos não formam grupo', () => {
    const mixed = [...many(3, { mosScore: '2.5', networkType: 'N/D' }), ...many(5, { networkType: 'N/D' })];
    assert.strictEqual(analyze(mixed).state, 'partial');
});

test('MOS fora do número é ignorado', () => {
    assert.strictEqual(analyze([...many(5), st({ mosScore: 'abc' })]).total, 5);
});
