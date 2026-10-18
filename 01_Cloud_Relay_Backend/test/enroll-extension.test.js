const test = require('node:test');
const assert = require('node:assert');
const { chooseAuth, RENEW_BEFORE_SEC } = require('../../03_Chrome_Edge_Extension/enroll.js');

const NOW = 1_800_000_000;
const cred = { credential: 'vv1.T.-.PA-1.x.y', credentialExp: NOW + 30 * 86400 };

test('credencial válida tem prioridade sobre token e chave da torre', () => {
    assert.deepStrictEqual(chooseAuth({ ...cred, enrollToken: 't', tenantKey: 'k', callActive: false }, NOW), { kind: 'credential', key: cred.credential });
});

test('sem credencial: cadastra com o token; durante chamada adia e cai para a chave da torre', () => {
    assert.deepStrictEqual(chooseAuth({ enrollToken: 't', tenantKey: 'k', callActive: false }, NOW), { kind: 'enroll' });
    assert.deepStrictEqual(chooseAuth({ enrollToken: 't', callActive: true }, NOW), { kind: 'none' });
    assert.deepStrictEqual(chooseAuth({ enrollToken: 't', tenantKey: 'k', callActive: true }, NOW), { kind: 'tower', key: 'k' });
});

test('credencial perto de vencer renova fora de chamada e segue usando-a em chamada', () => {
    const near = { credential: cred.credential, credentialExp: NOW + RENEW_BEFORE_SEC - 10, enrollToken: 't' };
    assert.deepStrictEqual(chooseAuth({ ...near, callActive: false }, NOW), { kind: 'enroll' });
    assert.strictEqual(chooseAuth({ ...near, callActive: true }, NOW).kind, 'credential');
});

test('credencial vencida ou inválida é ignorada; após 3 falhas de cadastro usa a chave da torre', () => {
    assert.strictEqual(chooseAuth({ credential: cred.credential, credentialExp: NOW - 1, tenantKey: 'k' }, NOW).kind, 'tower');
    assert.strictEqual(chooseAuth({ credential: 'abc', credentialExp: NOW + 99999, tenantKey: 'k' }, NOW).kind, 'tower');
    assert.strictEqual(chooseAuth({ enrollToken: 't', tenantKey: 'k', enrollFailures: 3 }, NOW).kind, 'tower');
    assert.strictEqual(chooseAuth({}, NOW).kind, 'none');
});
