#!/usr/bin/env node
/**
 * Validador de configuração de produção (lê o ambiente atual; nunca imprime segredos).
 * Uso: TENANTS_JSON=... DATA_DIR=... node scripts/check-config.js
 * Sai com 1 se houver ERRO; AVISO não falha.
 */
const fs = require('fs');
const out = [];
const add = (lvl, msg) => out.push([lvl, msg]);
const env = process.env;

let tenants = null;
if (!env.TENANTS_JSON) add('ERRO', 'TENANTS_JSON ausente (em produção o relay recusa subir sem ele).');
else {
    try { tenants = JSON.parse(env.TENANTS_JSON); } catch (e) { add('ERRO', 'TENANTS_JSON não é JSON válido.'); }
}
const weak = (k) => typeof k !== 'string' || k.length < 8;
const short = (k) => typeof k === 'string' && k.length < 24;
if (tenants && typeof tenants === 'object') {
    const ids = Object.keys(tenants);
    if (!ids.length) add('ERRO', 'TENANTS_JSON sem nenhum tenant.');
    const seen = new Map();
    for (const id of ids) {
        const t = tenants[id] || {};
        if (/^(demo|dev|test)/i.test(id)) add('AVISO', `Tenant "${id}" parece de teste.`);
        const keys = [t.supervisorKey, t.agentKey, ...Object.values(t.towers || {}).flatMap(w => [w.supervisorKey, w.agentKey])].filter(Boolean);
        if (!keys.length) add('AVISO', `Tenant "${id}" sem chaves visíveis (formato diferente?).`);
        for (const k of keys) {
            if (weak(k)) add('ERRO', `Tenant "${id}" tem chave com menos de 8 caracteres (o relay recusa).`);
            else if (short(k)) add('AVISO', `Tenant "${id}" tem chave curta (<24); prefira 32+ caracteres aleatórios.`);
            if (seen.has(k)) add('ERRO', `Tenant "${id}" repete chave de "${seen.get(k)}".`); else seen.set(k, id);
        }
        if (t.supervisorKey && t.supervisorKey === t.agentKey) add('ERRO', `Tenant "${id}" usa a mesma chave para agente e supervisor.`);
        if (t.stationSecret && weak(t.stationSecret)) add('ERRO', `Tenant "${id}" stationSecret fraco.`);
        if (!t.stationSecret) add('AVISO', `Tenant "${id}" sem stationSecret: credenciais por estação desativadas (só chave compartilhada).`);
        if (!t.genesys) add('AVISO', `Tenant "${id}" sem genesys.region: o item de latência até o Genesys no pré-check fica desativado.`);
        if (t.tier !== undefined && !['pilot', 'production'].includes(t.tier)) add('ERRO', `Tenant "${id}" tier inválido (pilot ou production; o relay recusa subir).`);
        if (t.expiresAt !== undefined && !Number.isFinite(Date.parse(t.expiresAt))) add('ERRO', `Tenant "${id}" expiresAt não é uma data ISO válida (o relay recusa subir).`);
        if (t.tier === 'pilot' && t.expiresAt === undefined) add('ERRO', `Tenant "${id}" é de piloto e exige expiresAt (o relay recusa subir).`);
        if (t.expiresAt !== undefined && Date.parse(t.expiresAt) < Date.now()) add('AVISO', `Tenant "${id}" já expirou em ${t.expiresAt}; as conexões dele são recusadas.`);
        if (t.tier === 'pilot' && Number.isFinite(t.maxAgents) && t.maxAgents > 25) add('AVISO', `Tenant "${id}" de piloto: maxAgents ${t.maxAgents} será reduzido para 25.`);
        if (t.monitoringMode !== undefined && !['realtime', 'sampled', 'on_demand'].includes(t.monitoringMode)) add('ERRO', `Tenant "${id}" monitoringMode inválido (realtime, sampled ou on_demand; o relay recusa subir).`);
        if (t.demo === true) add('AVISO', `Tenant "${id}" é de demonstração (demo: true): dados fictícios; confirme que é intencional neste ambiente.`);
        if (t.stunServers !== undefined && (!Array.isArray(t.stunServers) || t.stunServers.length > 3 || !t.stunServers.every(u => /^stun:[A-Za-z0-9.-]+(:\d{1,5})?$/.test(String(u))))) add('ERRO', `Tenant "${id}" stunServers inválido (até 3 URLs stun:host[:porta]; o relay recusa subir).`);
        if (t.webhook && (!t.webhook.url || !String(t.webhook.url).startsWith('https://'))) add('ERRO', `Tenant "${id}" webhook deve usar https.`);
    }
}

if (env.TRUST_PROXY !== '1') add('AVISO', 'TRUST_PROXY não é 1: atrás do Railway o limite por IP enxerga o IP do proxy.');
if (env.ALLOW_URL_KEY === '1') add('AVISO', 'ALLOW_URL_KEY=1: chave em URL aceita (só durante migração; remova depois).');
if (env.NODE_ENV !== 'production') add('AVISO', 'NODE_ENV não é production.');
if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    let u = null;
    try { u = new URL(env.OTEL_EXPORTER_OTLP_ENDPOINT); } catch (e) { /* tratado abaixo */ }
    if (!u || !(u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))) add('ERRO', 'OTEL_EXPORTER_OTLP_ENDPOINT inválido (use https): o relay desativa as métricas.');
    if (!env.OTEL_EXPORTER_OTLP_HEADERS) add('AVISO', 'OTEL_EXPORTER_OTLP_ENDPOINT sem OTEL_EXPORTER_OTLP_HEADERS: o Grafana Cloud exige Authorization.');
} else if (env.OTEL_EXPORTER_OTLP_HEADERS) add('AVISO', 'OTEL_EXPORTER_OTLP_HEADERS definido sem OTEL_EXPORTER_OTLP_ENDPOINT: nada é enviado.');
if (env.OTEL_METRIC_EXPORT_INTERVAL && !(Number(env.OTEL_METRIC_EXPORT_INTERVAL) >= 10000 && Number(env.OTEL_METRIC_EXPORT_INTERVAL) <= 600000)) add('AVISO', 'OTEL_METRIC_EXPORT_INTERVAL fora de 10000–600000 ms: o relay ajusta o valor.');
if (env.CORS_ORIGIN === '*') add('AVISO', 'CORS_ORIGIN=* é amplo demais.');

if (!env.DATA_DIR) add('AVISO', 'DATA_DIR ausente: histórico e estações cadastradas somem a cada deploy (sem Volume).');
else {
    try {
        fs.mkdirSync(env.DATA_DIR, { recursive: true });
        const f = `${env.DATA_DIR}/.vv-write-test`;
        fs.writeFileSync(f, 'ok'); fs.unlinkSync(f);
    } catch (e) { add('ERRO', `DATA_DIR sem permissão de escrita (${e.code || e.message}).`); }
}
add('INFO', 'Mantenha 1 réplica (salas e fila de webhook são em memória) e confirme que o Volume está montado em DATA_DIR.');

for (const [l, m] of out) console.log(`${l.padEnd(5)} ${m}`);
const errors = out.filter(([l]) => l === 'ERRO').length;
console.log(errors ? `\n${errors} erro(s).` : '\nSem erros bloqueantes.');
process.exit(errors ? 1 : 0);
