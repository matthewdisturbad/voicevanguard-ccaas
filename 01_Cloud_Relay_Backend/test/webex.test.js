// Suporte ao Cisco Webex Contact Center Desktop: manifest coerente e detecção da plataforma.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ext = path.join(__dirname, '../../03_Chrome_Edge_Extension');
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
const hook = fs.readFileSync(path.join(ext, 'injected_webrtc_hook.js'), 'utf8');

const WXCC = ['us1', 'eu1', 'sg1'].map(r => `https://desktop.wxcc-${r}.cisco.com/*`);

test('manifest: hosts do Webex nas três listas e sem curinga amplo em cisco.com', () => {
    const lists = [manifest.host_permissions, manifest.content_scripts[0].matches, manifest.web_accessible_resources[0].matches];
    for (const l of lists) {
        for (const h of WXCC) assert.ok(l.includes(h), `faltando ${h}`);
        assert.ok(!l.some(h => /\*\.cisco\.com|\*\.webex\.com|<all_urls>/.test(h)), 'curinga amplo demais');
    }
    // padrões de match válidos: sem curinga no meio do rótulo do host
    for (const h of [...lists[0], ...lists[1], ...lists[2]]) assert.match(h, /^https:\/\/(\*\.)?[a-z0-9.-]+\/(connect\/)?\*$/);
});

test('detectPlatform reconhece o Desktop do Webex CC', () => {
    const m = hook.match(/function detectPlatform\(hostname\) \{[\s\S]*?\r?\n    \}\r?\n/);
    assert.ok(m, 'detectPlatform não encontrada');
    const detect = new Function(`const window = { location: { hostname: '' } }; ${m[0]}; return detectPlatform;`)();
    assert.strictEqual(detect('desktop.wxcc-us1.cisco.com').code, 'CISCO_WEBEX');
    assert.strictEqual(detect('desktop.wxcc-sg1.cisco.com').code, 'CISCO_WEBEX');
    assert.strictEqual(detect('apps.mypurecloud.com').code, 'GENESYS');
});

test('latência de API: host do Webex entra no agregado, host aleatório de cisco.com não', () => {
    const m = hook.match(/const API_HOST_PATTERN = (\/.*\/i);/);
    assert.ok(m);
    const re = new Function(`return ${m[1]}`)();
    assert.ok(re.test('desktop.wxcc-us1.cisco.com') && re.test('api.wxcc-eu1.cisco.com'));
    assert.ok(!re.test('www.cisco.com') && !re.test('evil-wxcc-us1.cisco.com.attacker.com'));
});
