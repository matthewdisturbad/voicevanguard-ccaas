const path = require('path'); const os = require('os'); const fs = require('fs');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const REPO = path.resolve(__dirname, '..');
const EXT = path.join(REPO, '03_Chrome_Edge_Extension');
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vv-e2e-shots'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 9292;
const TENANTS = { 'E2E-TENANT': { name: 'E2E Tenant', plan: 'Test', maxAgents: 5, agentKey: 'e2e-agent-key-0001', supervisorKey: 'e2e-super-key-0001', stationSecret: 'e2e-station-secret-0123456789', enrollToken: 'e2e-enroll-token-0123456789', widgetKey: 'e2e-widget-key-0001',
  genesys: { orgId: '11111111-1111-1111-1111-111111111111', region: 'mypurecloud.com', clientId: 'e2e-client-id', supervisorRoles: ['VoiceVanguard Supervisor'] } } };
const results = [];
const check = (name, ok, extra='') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-e2e-'));
  const startRelay = () => {
    const r = spawn('node', ['server.js'], { cwd: path.join(REPO, '01_Cloud_Relay_Backend'),
      env: { ...process.env, PORT, DATA_DIR: dataDir, TENANTS_JSON: JSON.stringify(TENANTS) }, stdio: 'pipe' });
    r.stdout.on('data', d => process.stdout.write('[relay] ' + d));
    r.stderr.on('data', d => process.stdout.write('[relay!] ' + d));
    return r;
  };
  let relay = startRelay();
  await sleep(1500);

  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'vv-prof-')), {
    executablePath: process.env.CHROMIUM_PATH || undefined, headless: false,
    args: ['--lang=pt-BR', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new', '--no-sandbox',
           '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--allow-loopback-in-peer-connection'],
    locale: 'pt-BR', viewport: { width: 1440, height: 900 }
  });
  try {
    let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    check('extensão carregada (service worker ativo)', !!sw);

    // Console do supervisor
    const sup = await ctx.newPage();
    const supFrames = []; // tudo o que o relay entrega ao console, para provar que dados do cliente final não saem da estação
    sup.on('websocket', w => w.on('framereceived', f => supFrames.push(String(f.payload))));
    await sup.goto(`http://localhost:${PORT}/app`);
    await sup.fill('#inputTenantKey', 'e2e-agent-key-0001');
    await sup.click('#btnSubmitLogin');
    await sleep(800);
    check('console recusa chave de AGENTE', await sup.locator('#authOverlay').isVisible());
    await sup.fill('#inputTenantKey', 'e2e-super-key-0001');
    await sup.click('#btnSubmitLogin');
    await sup.waitForSelector('#authOverlay', { state: 'hidden', timeout: 8000 });
    check('console aceita chave de supervisor e conecta', true);
    await sup.waitForFunction(() => /ao vivo/i.test(document.getElementById('connStatus').textContent), null, { timeout: 8000 });

    // Configura a extensão para o relay local
    await sw.evaluate(([key]) => { RELAY_SERVER = 'ws://localhost:9292'; tenantKey = key; chrome.storage.local.set({ tenantKey: key }); connectToCloudRelay(); }, ['e2e-agent-key-0001']);
    await sleep(1200);

    // Página CCaaS simulada (domínio Genesys) com chamada WebRTC em loopback
    await ctx.route('https://acme.mypurecloud.com/**', route => {
      const u = route.request().url();
      if (u.includes('/api/v2/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Genesys Cloud (simulado)</title><body>
<script>
window.startCall = async () => {
  await fetch('/api/v2/conversations/calls/3f2b8c1e-5d4a-4b7e-9c10-2a6d8e9f0b11');
  const pc1 = new RTCPeerConnection(), pc2 = new RTCPeerConnection();
  window.__pcs = [pc1, pc2];
  pc1.onicecandidate = e => e.candidate && pc2.addIceCandidate(e.candidate);
  pc2.onicecandidate = e => e.candidate && pc1.addIceCandidate(e.candidate);
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  s.getTracks().forEach(t => pc1.addTrack(t, s));
  pc2.addTransceiver('audio', { direction: 'sendrecv' });
  const o = await pc1.createOffer(); await pc1.setLocalDescription(o); await pc2.setRemoteDescription(o);
  const a = await pc2.createAnswer(); await pc2.setLocalDescription(a); await pc1.setRemoteDescription(a);
};
window.apiCalls = async () => { for (let i = 0; i < 5; i++) await fetch('/api/v2/users/me?i=' + i); };
window.endCall = () => { (window.__pcs||[]).forEach(p => p.close()); };
</script>` });
    });
    const agentPage = await ctx.newPage();
    agentPage.on('console', m => { if (/VoiceDoctor|VoiceVanguard/.test(m.text())) console.log('[page]', m.text()); });
    await agentPage.goto('https://acme.mypurecloud.com/');
    const TAB_SECRET = 'TITULO-CLIENTE-FINAL-9137';
    await agentPage.evaluate((t) => { document.title = t; }, TAB_SECRET);
    await agentPage.evaluate(() => startCall());
    await agentPage.evaluate(() => apiCalls());
    const pageLoadedAt = Date.now();

    // Telemetria aparece no console
    await sup.bringToFront();
    await sup.waitForFunction(() => document.querySelectorAll('#agentsTableBody [data-open-agent]').length > 0, null, { timeout: 20000 })
      .then(() => check('telemetria da extensão chega ao console do supervisor', true), () => check('telemetria da extensão chega ao console do supervisor', false));
    await sup.screenshot({ path: path.join(OUT, 'console-em-chamada.png') });
    const rowText = await sup.locator('#agentsTableBody').innerText();
    check('plataforma Genesys detectada', /Genesys/.test(rowText), JSON.stringify(rowText.slice(0, 120)));
    check('chamada ativa exibida', /em chamada/i.test(rowText));

    // In-Call Lock: comando durante a chamada deve ser adiado
    await sup.locator('[data-open-agent]').first().click();   // limpeza agora vive no painel de detalhes
    await sup.locator('#agentPanel [data-clear-agent]').click();
    await sup.locator('#agentPanel [data-confirm-clear]').click();
    const fb = await sup.waitForFunction(() => { const e = document.querySelector('#agentPanel [data-cmd-state]'); return e && /pós-chamada/.test(e.textContent) ? e.textContent : null; }, null, { timeout: 6000 })
      .then(h => h.jsonValue(), () => 'TIMEOUT');
    check('In-Call Lock: limpeza adiada durante chamada ativa', /adiada|agendada|chamada/i.test(fb), JSON.stringify(fb));
    await sup.click('#btnClosePanel');

    // Áudio parado no meio da chamada (o sender deixa de enviar; o hook vê o inbound parar)
    await agentPage.evaluate(() => window.__pcs[0].getSenders()[0].replaceTrack(null));
    await sup.waitForFunction(() => /sem áudio recebido/i.test(document.getElementById('agentsTableBody').innerText), null, { timeout: 25000 })
      .then(() => check('incidente "Sem áudio recebido" aparece no console', true), () => check('incidente "Sem áudio recebido" aparece no console', false));
    await sup.screenshot({ path: path.join(OUT, 'console-sem-audio.png') });

    // Encerra a chamada -> auditoria
    await sleep(1500);
    await agentPage.evaluate(() => endCall());
    await sup.click('#tabCallsBtn');
    await sup.waitForFunction(() => document.querySelectorAll('#callsTableBody tr code').length > 0, null, { timeout: 15000 })
      .then(() => check('auditoria da chamada finalizada aparece no console', true), () => check('auditoria da chamada finalizada aparece no console', false));
    await sup.screenshot({ path: path.join(OUT, 'console-auditoria.png') });
    const callsText = await sup.locator('#callsTableBody').innerText();
    check('chamada com incidente de áudio é CRÍTICA e lista o incidente', /CRÍTICA/.test(callsText) && /Áudio:.*Sem áudio recebido/i.test(callsText), JSON.stringify(callsText.slice(0, 160)));
    check('ID da conversa Genesys correlacionado', /3f2b8c1e/.test(callsText), JSON.stringify(callsText.slice(0, 100)));
    const hist = fs.readdirSync(dataDir).filter(f => f.endsWith('_history.json'));
    await sleep(1500);
    check('histórico persistido em DATA_DIR', fs.readdirSync(dataDir).some(f => f === 'E2E-TENANT_history.json'));

    await sleep(2500);
    const cleared = await sw.evaluate(() => new Promise(r => chrome.storage.local.get('lastCacheCleared', x => r(x.lastCacheCleared || null))));
    check('limpeza agendada executou no pós-chamada', !!cleared, String(cleared));

    // Popup da extensão
    const extId = new URL(sw.url()).host;
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 380, height: 560 });
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await sleep(500);
    await popup.screenshot({ path: path.join(OUT, 'popup.png') });

    // Pré-check de turno pelo popup (fora de chamada)
    await popup.click('#btnPrecheck');
    await popup.waitForSelector('#precheckResult .pc-item', { timeout: 20000 })
      .then(() => check('pré-check concluído no popup', true), () => check('pré-check concluído no popup', false));
    const preText = await popup.locator('#precheckResult').innerText();
    check('pré-check mede a rede até o relay', /Latência/.test(preText) && /ms/.test(preText), JSON.stringify(preText.slice(0, 120)));
    check('pré-check inclui a latência até a região Genesys do tenant', /Latência até o Genesys/.test(preText), JSON.stringify(preText.slice(0, 200)));
    await popup.screenshot({ path: path.join(OUT, 'popup-precheck.png') });

    // Saúde da estação no console: pré-check + latência de API (janela de 30 s do hook)
    await sup.bringToFront();
    await sup.click('#tabHealthBtn');
    await sup.waitForFunction(() => /Pronta|Atenção|Não pronta/.test(document.getElementById('healthTableBody').innerText), null, { timeout: 10000 })
      .then(() => check('pré-check aparece na aba Saúde da estação', true), () => check('pré-check aparece na aba Saúde da estação', false));
    const remaining = Math.max(0, 40000 - (Date.now() - pageLoadedAt));
    await sup.waitForFunction(() => /mypurecloud\.com/.test(document.getElementById('healthTableBody').innerText), null, { timeout: remaining + 5000 })
      .then(() => check('latência das APIs do CCaaS aparece por hostname', true), () => check('latência das APIs do CCaaS aparece por hostname', false));
    const healthText = await sup.locator('#healthTableBody').innerText();
    check('latência não expõe caminho nem query', !/\/api\/v2|\?i=/.test(healthText), JSON.stringify(healthText.slice(0, 160)));
    await sup.screenshot({ path: path.join(OUT, 'console-saude.png') });
    check('popup não exibe a chave (apenas "Configurada")', (await popup.locator('#lblTenant').innerText()) === 'Configurada');
    const popupHist = await popup.locator('#historyList').innerText();
    check('popup exibe o ID real da chamada no histórico', /3f2b8c1e/.test(popupHist), JSON.stringify(popupHist));


    // Inglês: console, popup e widget (troca ao vivo sem perder a conexão)
    const isPt = (t) => /[ãõçé]|Chave|Entrar|Ao vivo/.test(t);
    await sup.evaluate(() => document.querySelector('.lang-btn[data-lang="en"]').click());
    await sleep(400);
    const enConn = await sup.locator('#connStatus').innerText();
    check('console em inglês mantém a conexão ao vivo', /live/i.test(enConn), JSON.stringify(enConn));
    const enTabs = await sup.locator('.tab-btn').allInnerTexts();
    check('abas do console em inglês', !enTabs.some(isPt), JSON.stringify(enTabs));
    await sup.evaluate(() => document.querySelector('.lang-btn[data-lang="pt"]').click());
    await popup.evaluate(() => document.getElementById('btnLangEn').click());
    await sleep(300);
    const enPopup = await popup.locator('body').innerText();
    check('popup da extensão em inglês', /Language|Shift pre-check|Pre-check/i.test(enPopup) && !/Verificar|Idioma/.test(enPopup), JSON.stringify(enPopup.slice(0, 120)));
    await popup.evaluate(() => document.getElementById('btnLangPt').click());
    const wEn = await ctx.newPage();
    await wEn.goto(`http://localhost:${PORT}/widget?conversationId=3f2b8c1e-5d4a-4b7e-9c10-2a6d8e9f0b11&lang=en#wk=e2e-widget-key-0001`);
    await sleep(600);
    check('widget em inglês via ?lang=en', /Conversation|Interaction/i.test(await wEn.locator('body').innerText()));

    // Login Genesys (cliente): redireciona ao Genesys, volta com token, o servidor recusa (API real inacessível) e o console mostra erro sem vazar o token
    const g = await ctx.newPage();
    let authorizeUrl = null;
    await g.route('https://login.mypurecloud.com/**', (route) => {
      authorizeUrl = new URL(route.request().url());
      const back = `${authorizeUrl.searchParams.get('redirect_uri')}#access_token=tok-e2e-0000000000000001&token_type=bearer&state=${authorizeUrl.searchParams.get('state')}`;
      route.fulfill({ status: 302, headers: { Location: back } });
    });
    await g.goto(`http://localhost:${PORT}/dashboard?tenant=E2E-TENANT&lang=en`);
    await g.waitForFunction(() => document.getElementById('authErrorBox') && getComputedStyle(document.getElementById('authErrorBox')).display !== 'none', null, { timeout: 15000 })
      .then(() => check('login Genesys: redireciona, volta com token e a recusa do servidor é exibida', true), () => check('login Genesys: redireciona, volta com token e a recusa do servidor é exibida', false));
    check('login Genesys usa o clientId e o redirect do tenant', !!authorizeUrl && authorizeUrl.searchParams.get('client_id') === 'e2e-client-id' && authorizeUrl.searchParams.get('response_type') === 'token');
    // Sessão OAuth expirada (4002): o console entra de novo pelo Genesys, sem cair na tela de chave
    const exp = await ctx.newPage();
    let reauthUrl = null;
    await exp.route('https://login.mypurecloud.com/**', (route) => { reauthUrl = route.request().url(); route.fulfill({ status: 200, contentType: 'text/html', body: 'login' }); });
    await exp.addInitScript(() => {
      if (!sessionStorage.getItem('e2e_seeded')) { // só na primeira carga; o reload após o 4002 não pode recriar a sessão
        sessionStorage.setItem('e2e_seeded', '1');
        sessionStorage.setItem('vv_oauth_token', 'tok-e2e-0000000000000001');
        sessionStorage.setItem('vv_oauth_region', 'mypurecloud.com');
        sessionStorage.setItem('vv_tenant_name', 'E2E Tenant');
      }
      window.WebSocket = class { constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); setTimeout(() => { this.readyState = 3; this.onclose && this.onclose({ code: 4002 }); }, 50); }, 20); } send() {} close() {} };
    });
    await exp.goto(`http://localhost:${PORT}/dashboard?tenant=E2E-TENANT&lang=en`).catch(() => {});
    await exp.waitForFunction(() => location.hostname === 'login.mypurecloud.com', null, { timeout: 15000 }).catch(() => {});
    check('sessão OAuth expirada (4002) reentra pelo Genesys sem passar pela tela de chave', !!reauthUrl && /client_id=e2e-client-id/.test(reauthUrl), String(reauthUrl).slice(0, 80));
    check('login Genesys não deixa o token no endereço', await g.evaluate(() => !location.hash && !/access_token/.test(location.href)));
    // Privacidade: o título da aba (pode ter dado do cliente final) nunca chega ao relay nem ao supervisor
    check('título da aba do agente não chega ao console do supervisor', supFrames.length > 0 && !supFrames.some(f => f.includes(TAB_SECRET)), `${supFrames.length} mensagens`);

    // Genesys Interaction Widget (/widget) correlacionando conversationId
    const widget = await ctx.newPage();
    await widget.goto(`http://localhost:${PORT}/widget?conversationId=3f2b8c1e-5d4a-4b7e-9c10-2a6d8e9f0b11&lang=pt-BR#wk=e2e-widget-key-0001`);
    await widget.waitForFunction(() => /AUDITADA|EM CHAMADA/.test(document.getElementById('connBadge').textContent), null, { timeout: 8000 })
      .then(() => check('Interaction Widget (/widget) correlaciona a conversa em tempo real com chave própria', true), () => check('Interaction Widget (/widget) correlaciona a conversa em tempo real com chave própria', false));
    check('widget não oferece botão de comando nem campo de chave de supervisor', await widget.evaluate(() => !document.getElementById('btnRemediate') && !document.getElementById('inputKey')));
    check('widget remove a chave do endereço da página', await widget.evaluate(() => !location.hash));

    // Resiliência: o relay reinicia (deploy) e console e extensão reconectam sozinhos
    relay.kill('SIGTERM');
    await sleep(1500);
    await sup.waitForFunction(() => /offline|down|reconect|retry|Reconnect|Waiting|Aguard|Tentando|Desconect/i.test(document.getElementById('connStatus').textContent), null, { timeout: 15000 })
      .then(() => check('console percebe a queda do relay', true), () => check('console percebe a queda do relay', false));
    relay = startRelay();
    await sleep(1500);
    await sup.waitForFunction(() => /^(Live|Ao vivo)/i.test(document.getElementById('connStatus').textContent.trim()), null, { timeout: 60000 })
      .then(() => check('console reconecta sozinho depois que o relay volta', true), () => check('console reconecta sozinho depois que o relay volta', false));
    await agentPage.evaluate(() => startCall());
    await sup.waitForFunction(() => document.querySelectorAll('#agentsTableBody [data-open-agent]').length > 0, null, { timeout: 60000 })
      .then(() => check('extensão reconecta sozinha e a telemetria volta ao console', true), () => check('extensão reconecta sozinha e a telemetria volta ao console', false));
    await agentPage.evaluate(() => endCall());

    check('console mostra a leitura de causa por frota (pouca amostra: não conclui)', await sup.evaluate(() => /Causa por frota.*ao menos 5/.test(document.getElementById('fleetLine').textContent)));

    // Cadastro individual: o token da torre vira credencial por estação e a extensão conecta sem a chave compartilhada
    await sw.evaluate(() => { tenantKey = ''; enrollToken = 'e2e-enroll-token-0123456789'; stationCredential = ''; stationCredentialExp = 0; enrollFailures = 0;
      chrome.storage.local.set({ tenantKey: '' }); chrome.storage.local.remove(['stationCredential', 'stationCredentialExp']); reconnectAttempts = 0; if (ws) ws.close(); connectToCloudRelay(); });
    let cred = '';
    for (let i = 0; i < 80 && !cred; i++) { await sleep(500); cred = await sw.evaluate(() => stationCredential); }
    check('extensão troca o token de cadastro por uma credencial individual (vv1)', /^vv1\./.test(cred), cred.slice(0, 24));
    check('credencial individual não carrega a chave compartilhada nem o token', !cred.includes('e2e-agent-key-0001') && !cred.includes('e2e-enroll-token'));
    const stationId = await sw.evaluate(() => agentStationId);
    await sleep(8000);
    supFrames.length = 0;
    await agentPage.evaluate(() => startCall());
    let seen = false;
    for (let i = 0; i < 30 && !seen; i++) { await sleep(500); seen = supFrames.some(f => f.includes('"' + stationId + '"') && f.includes('TELEMETRY_UPDATE')); }
    check('telemetria chega ao console usando só a credencial individual (id da estação vem da assinatura)', seen);
    await agentPage.evaluate(() => endCall());

    // Segurança: dado vindo do agente é não confiável; nada pode virar HTML ou script no console do supervisor
    const WS = require(path.join(REPO, '01_Cloud_Relay_Backend', 'node_modules', 'ws'));
    const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
    await sup.bringToFront();
    await sup.evaluate(() => document.querySelector('.tab-btn[data-tab="live"]').click());
    const bad = new WS(`ws://localhost:${PORT}`);
    await new Promise((res, rej) => { bad.on('open', res); bad.on('error', rej); });
    bad.send(JSON.stringify({ type: 'AUTH', key: 'e2e-agent-key-0001', agentId: 'PA-XSS01' }));
    await sleep(300);
    bad.send(JSON.stringify({ type: 'AGENT_TELEMETRY', operator: evil, station: evil, platform: evil, platformCode: 'WEBRTC', genesysOrg: evil, region: evil,
      status: 'ALERTA', audioIssue: evil, mosScore: '2.1', rttMs: 400, jitterMs: 80, lossPct: 9, networkType: evil, cpuStress: evil, protocol: evil, callActive: false, currentCallId: evil }));
    bad.send(JSON.stringify({ type: 'CALL_AUDIT_SUMMARY', interactionId: evil, platform: evil, platformCode: 'WEBRTC', operator: evil, station: evil, startTime: evil, endTime: evil,
      durationSeconds: 5, mosMedio: 2.1, mosMinimo: 1.5, jitterPicoMs: 80, rttMedioMs: 400, perdaPacotesPct: 9, protocolo: evil, classificacao: evil, networkType: evil, cpuStress: evil,
      causaRaiz: evil, incidentesAudio: [evil], trocasDispositivo: 1, stillInCall: false }));
    await sleep(1200);
    await sup.evaluate(() => document.querySelector('.tab-btn[data-tab="calls"]').click());
    await sleep(300);
    await sup.evaluate(() => document.querySelector('.tab-btn[data-tab="live"]').click());
    check('dados hostis do agente não executam script no console', await sup.evaluate(() => window.__xss === undefined));
    check('dados hostis do agente chegam ao console como texto literal, sem virar elementos', await sup.evaluate(() => /<img src=x/.test(document.getElementById('agentsTableBody').innerText) && !document.querySelector('#agentsTableBody img[src="x"], #callsTableBody img[src="x"], #agentsTableBody script')));
    bad.close();

    // Páginas públicas e console: sem violação de CSP nem erro de script, em PT e EN
    const sweep = async (url, label) => {
      const pg = await ctx.newPage();
      const problems = [];
      pg.on('pageerror', e => problems.push('pageerror: ' + e.message));
      pg.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push('csp: ' + m.text().slice(0, 120)); });
      await pg.goto(url, { waitUntil: 'load' });
      await sleep(500);
      check(`sem violação de CSP nem erro de script: ${label}`, problems.length === 0, problems.join(' | '));
      await pg.close();
    };
    await sweep(`http://localhost:${PORT}/`, 'landing PT');
    await sweep(`http://localhost:${PORT}/?lang=en`, 'landing EN');
    await sweep(`http://localhost:${PORT}/app?lang=en`, 'login do console EN');
    await sweep(`http://localhost:${PORT}/privacy`, 'privacidade');

    // Landing: o seletor de idioma troca o texto e o idioma da página
    const land = await ctx.newPage();
    await land.goto(`http://localhost:${PORT}/`);
    await land.evaluate(() => localStorage.removeItem('vv_lang'));
    await land.reload();
    const ptText = await land.locator('body').innerText();
    await land.evaluate(() => document.querySelector('.lang-btn[data-lang="en"]').click());
    await sleep(300);
    const enText = await land.locator('body').innerText();
    check('landing troca para inglês pelo seletor', ptText !== enText && await land.evaluate(() => document.documentElement.lang.startsWith('en')));
    await land.close();

    // Celular: nenhuma aba do console rola na horizontal
    await sup.setViewportSize({ width: 390, height: 844 });
    await sleep(300);
    const overflow = [];
    for (const tab of ['live', 'calls', 'health', 'bi']) {
      await sup.evaluate((t) => document.querySelector(`.tab-btn[data-tab="${t}"]`).click(), tab);
      await sleep(250);
      const wide = await sup.evaluate(() => {
        if (document.documentElement.scrollWidth <= window.innerWidth + 1) return null;
        const out = [];
        for (const el of document.querySelectorAll('body *:not(th):not(.tab-btn)')) { const r = el.getBoundingClientRect(); if (r.right > window.innerWidth + 1 && r.width > 0) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}:${Math.round(r.right)}`); }
        return out.slice(0, 4).join(' ');
      });
      if (wide !== null) overflow.push(`${tab}[${wide}]`);
    }
    check('console sem rolagem horizontal a 390 px nas quatro abas', overflow.length === 0, overflow.join(','));
    await sup.setViewportSize({ width: 1440, height: 900 });

  } catch (e) {
    console.log('ERRO E2E:', e.message); check('execução sem exceção', false, e.message);
  } finally {
    await ctx.close(); relay.kill();
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
    process.exit(failed ? 1 : 0);
  }
})();
