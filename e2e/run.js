const path = require('path'); const os = require('os'); const fs = require('fs');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const REPO = path.resolve(__dirname, '..');
const EXT = path.join(REPO, '03_Chrome_Edge_Extension');
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'vv-e2e-shots'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 9292;
const TENANTS = { 'E2E-TENANT': { name: 'E2E Tenant', plan: 'Test', maxAgents: 5, agentKey: 'e2e-agent-key-0001', supervisorKey: 'e2e-super-key-0001', widgetKey: 'e2e-widget-key-0001' } };
const results = [];
const check = (name, ok, extra='') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-e2e-'));
  const relay = spawn('node', ['server.js'], { cwd: path.join(REPO, '01_Cloud_Relay_Backend'),
    env: { ...process.env, PORT, DATA_DIR: dataDir, TENANTS_JSON: JSON.stringify(TENANTS) }, stdio: 'pipe' });
  relay.stdout.on('data', d => process.stdout.write('[relay] ' + d));
  relay.stderr.on('data', d => process.stdout.write('[relay!] ' + d));
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

    // Genesys Interaction Widget (/widget) correlacionando conversationId
    const widget = await ctx.newPage();
    await widget.goto(`http://localhost:${PORT}/widget?conversationId=3f2b8c1e-5d4a-4b7e-9c10-2a6d8e9f0b11&lang=pt-BR#wk=e2e-widget-key-0001`);
    await widget.waitForFunction(() => /AUDITADA|EM CHAMADA/.test(document.getElementById('connBadge').textContent), null, { timeout: 8000 })
      .then(() => check('Interaction Widget (/widget) correlaciona a conversa em tempo real com chave própria', true), () => check('Interaction Widget (/widget) correlaciona a conversa em tempo real com chave própria', false));
    check('widget não oferece botão de comando nem campo de chave de supervisor', await widget.evaluate(() => !document.getElementById('btnRemediate') && !document.getElementById('inputKey')));
    check('widget remove a chave do endereço da página', await widget.evaluate(() => !location.hash));
  } catch (e) {
    console.log('ERRO E2E:', e.message); check('execução sem exceção', false, e.message);
  } finally {
    await ctx.close(); relay.kill();
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
    process.exit(failed ? 1 : 0);
  }
})();
