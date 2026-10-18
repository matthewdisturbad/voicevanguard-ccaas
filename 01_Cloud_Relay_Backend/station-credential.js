/**
 * Credencial individual por estação, assinada (HMAC-SHA256) e sem estado no servidor:
 *   vv1.<tenant>.<torre|->.<stationId>.<exp>.<assinatura>
 * Tenant, torre e papel saem da credencial verificada, nunca do cliente. A assinatura cobre também o
 * `epoch` configurado na torre, então trocar o epoch (ou o segredo) invalida todas as credenciais dela.
 */

const crypto = require('crypto');

const PREFIX = 'vv1';
const ID = /^[A-Za-z0-9_-]{1,64}$/; // tenant e torre (o servidor aplica limites próprios)
const STATION_ID = /^[A-Za-z0-9_-]{1,32}$/;
const SECRET_MIN = 16;

function signature(secret, tenantId, tower, stationId, exp, epoch) {
    return crypto.createHmac('sha256', secret)
        .update(`${PREFIX}|${tenantId}|${tower || '-'}|${stationId}|${exp}|${epoch}`)
        .digest('base64url');
}

function mintStationCredential({ secret, tenantId, tower = null, stationId, exp, epoch = 1 }) {
    if (typeof secret !== 'string' || secret.length < SECRET_MIN) throw new Error('secret inválido');
    if (!ID.test(tenantId) || (tower !== null && !ID.test(tower)) || !STATION_ID.test(stationId)) throw new Error('identificador inválido');
    if (!Number.isInteger(exp) || exp <= 0) throw new Error('exp inválido');
    return [PREFIX, tenantId, tower || '-', stationId, exp, signature(secret, tenantId, tower, stationId, exp, epoch)].join('.');
}

function looksLikeStationCredential(key) {
    return typeof key === 'string' && key.startsWith(PREFIX + '.');
}

// scopes: Map(`${tenantId}|${torre|-}`) -> { secrets: [atual, anterior?], epoch, revoked:Set }
function verifyStationCredential(credential, scopes, nowSec = Math.floor(Date.now() / 1000)) {
    const parts = typeof credential === 'string' ? credential.split('.') : [];
    if (parts.length !== 6 || parts[0] !== PREFIX) return null;
    const [, tenantId, towerRaw, stationId, expRaw, sig] = parts;
    if (!ID.test(tenantId) || !STATION_ID.test(stationId) || !/^\d{1,12}$/.test(expRaw) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
    const tower = towerRaw === '-' ? null : towerRaw;
    if (tower !== null && !ID.test(tower)) return null;
    const exp = Number(expRaw);
    if (exp <= nowSec) return null;
    const scope = scopes.get(`${tenantId}|${tower || '-'}`);
    if (!scope || scope.revoked.has(stationId)) return null;
    const given = Buffer.from(sig);
    for (const secret of scope.secrets) {
        const expected = Buffer.from(signature(secret, tenantId, tower, stationId, exp, scope.epoch));
        if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return { tenantId, tower, stationId, exp };
    }
    return null;
}

// Lê os campos de uma torre (ou do tenant sem torres) e devolve o escopo de verificação, ou null se não houver stationSecret.
function parseStationScope(label, cfg, agentKey) {
    if (cfg.stationSecret === undefined) {
        if (cfg.stationSecretPrev !== undefined || cfg.epoch !== undefined || cfg.revoked !== undefined) {
            throw new Error(`${label}: epoch/revoked/stationSecretPrev exigem stationSecret`);
        }
        return null;
    }
    const ok = (s) => typeof s === 'string' && s.length >= SECRET_MIN;
    if (!ok(cfg.stationSecret) || cfg.stationSecret === agentKey) throw new Error(`${label}: stationSecret precisa de 16+ caracteres e ser distinto da agentKey`);
    const secrets = [cfg.stationSecret];
    if (cfg.stationSecretPrev !== undefined) {
        if (!ok(cfg.stationSecretPrev) || cfg.stationSecretPrev === cfg.stationSecret) throw new Error(`${label}: stationSecretPrev inválido`);
        secrets.push(cfg.stationSecretPrev);
    }
    const epoch = cfg.epoch === undefined ? 1 : cfg.epoch;
    if (!Number.isInteger(epoch) || epoch < 1) throw new Error(`${label}: epoch deve ser inteiro >= 1`);
    const revoked = cfg.revoked === undefined ? [] : cfg.revoked;
    if (!Array.isArray(revoked) || revoked.some(id => typeof id !== 'string' || !STATION_ID.test(id))) throw new Error(`${label}: revoked deve ser uma lista de ids de estação`);
    const scope = { secrets, epoch, revoked: new Set(revoked), enroll: null };
    // Cadastro automático: token de torre que só serve para trocar por credencial individual (não abre telemetria).
    if (cfg.enrollToken !== undefined) {
        if (!ok(cfg.enrollToken) || cfg.enrollToken === agentKey || secrets.includes(cfg.enrollToken)) throw new Error(`${label}: enrollToken precisa de 16+ caracteres e ser distinto da agentKey e do stationSecret`);
        const maxStations = cfg.maxStations === undefined ? 100 : cfg.maxStations;
        const days = cfg.credentialDays === undefined ? 90 : cfg.credentialDays;
        if (!Number.isInteger(maxStations) || maxStations < 1 || maxStations > 100000) throw new Error(`${label}: maxStations deve ser inteiro entre 1 e 100000`);
        if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error(`${label}: credentialDays deve ser inteiro entre 1 e 365`);
        scope.enroll = { token: cfg.enrollToken, maxStations, days };
    } else if (cfg.maxStations !== undefined || cfg.credentialDays !== undefined) {
        throw new Error(`${label}: maxStations/credentialDays exigem enrollToken`);
    }
    return scope;
}

module.exports = { STATION_ID, mintStationCredential, verifyStationCredential, looksLikeStationCredential, parseStationScope };
