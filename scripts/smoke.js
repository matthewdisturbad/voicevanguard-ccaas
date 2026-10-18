#!/usr/bin/env node
/**
 * Verificação pós-deploy (somente leitura, sem chaves).
 * Uso: node scripts/smoke.js https://voicevanguard.trustco.pro
 * Sai com código 1 se algum item falhar.
 */
const BASE = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(BASE)) { console.error('Uso: node scripts/smoke.js <url-base>'); process.exit(2); }

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ' — ' + detail : ''}`); };
const get = (path, headers = {}) => fetch(BASE + path, { headers, redirect: 'manual' });

(async () => {
    const h = await get('/api/health');
    const hj = await h.json().catch(() => ({}));
    check('/api/health responde 200 e "online"', h.status === 200 && hj.status === 'online', `HTTP ${h.status}`);
    check('/api/health não expõe métricas por tenant', !('tenants' in hj) && !('calls' in hj) && !('stations' in hj));
    check('/api/health tem tenants registrados', Number(hj.registeredTenants) >= 1, `registeredTenants=${hj.registeredTenants}`);

    const root = await get('/');
    const rootHtml = await root.text();
    check('/ serve a landing comercial', root.status === 200 && /VoiceVanguard/i.test(rootHtml));
    check('/ não tem demo aberta', !/demo-pill|data-demo|password=/i.test(rootHtml));

    const headers = root.headers;
    const csp = headers.get('content-security-policy') || '';
    check('CSP sem unsafe-inline em script-src', /script-src[^;]*'sha256-/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp));
    check('CSP sem unsafe-inline em style-src', /style-src[^;]*'sha256-/.test(csp) && !/style-src[^;]*unsafe-inline/.test(csp));
    check('HSTS ativo', /max-age=\d{6,}/.test(headers.get('strict-transport-security') || ''));
    check('nosniff ativo', headers.get('x-content-type-options') === 'nosniff');

    for (const p of ['/app', '/privacy', '/widget']) {
        const r = await get(p);
        check(`${p} responde 200`, r.status === 200, `HTTP ${r.status}`);
    }

    const bad = await get('/api/validate-tenant', { 'X-Tenant-Key': 'chave-invalida-smoke-test' });
    check('chave inválida é recusada', bad.status === 401 || bad.status === 403, `HTTP ${bad.status}`);
    const none = await get('/api/calls.csv');
    check('CSV sem chave é recusado', none.status === 401 || none.status === 403, `HTTP ${none.status}`);
    const q = await get('/api/calls.csv?key=x');
    check('CSV não aceita chave na URL', q.status === 401 || q.status === 403, `HTTP ${q.status}`);

    const failed = results.filter(r => !r).length;
    console.log(`\n${results.length - failed}/${results.length} verificações OK`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
