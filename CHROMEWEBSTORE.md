# Chrome Web Store & Microsoft Edge Add-ons — Submission Guide

This document contains the exact disclosures, permission justifications, privacy declarations, and reviewer instructions required by the **Chrome Web Store Developer Dashboard** and **Microsoft Partner Center (Edge Add-ons)** for **VoiceVanguard CCaaS**.

---

## 1. Single Purpose Description

**English:**
> VoiceVanguard CCaaS monitors WebRTC voice call quality (approximated ITU-T G.107 MOS, latency, jitter, packet loss, and audio flow health) and workstation readiness on enterprise contact center platforms (Genesys Cloud CX, Amazon Connect, and NICE CXone), transmitting numeric telemetry to the customer's supervisor console without capturing or recording any audio.

**Português (PT-BR):**
> O VoiceVanguard CCaaS monitora a qualidade de chamadas de voz WebRTC (MOS aproximado ITU-T G.107, latência, jitter, perda de pacotes e saúde do fluxo de áudio) e a prontidão da estação de trabalho em plataformas corporativas de contact center (Genesys Cloud CX, Amazon Connect e NICE CXone), enviando telemetria numérica ao console de supervisão do cliente sem capturar ou gravar áudio.

---

## 2. Permission Justifications

### `storage`
> **Justification:** Required to read enterprise policy configuration (`chrome.storage.managed`) deployed by corporate IT via Windows GPO or Microsoft Intune (such as `tenantKey`, `relayServer`, and `operatorName`), and to persist local operational state (`chrome.storage.local`) including the workstation identifier (`agentStationId`), active-call lock status (`isCallActive`) across Manifest V3 service worker restarts, and the last 50 call quality summaries displayed in the agent popup.

### `browsingData`
> **Justification:** Required exclusively to execute the post-call static cache cleanup (`chrome.browsingData.removeCache`) when explicitly requested by the agent in the popup or remotely queued by an authorized supervisor. An In-Call Lock guarantees this operation never runs during an active voice call, and cookies/authentication sessions are never cleared.

### `host_permissions` & `content_scripts`
- `https://*.pure.cloud/*`
- `https://*.mypurecloud.com/*`
- `https://*.mypurecloud.com.au/*`
- `https://*.mypurecloud.ie/*`
- `https://*.mypurecloud.de/*`
- `https://*.mypurecloud.jp/*`
- `https://*.my.connect.aws/*`
- `https://*.awsapps.com/connect/*`
- `https://*.niceincontact.com/*`
- `https://*.nice-incontact.com/*`

> **Justification:** Required to inject the WebRTC quality observer (`content.js` and `injected_webrtc_hook.js`) into the agent desktop of supported CCaaS platforms (Genesys Cloud CX, Amazon Connect, and NICE CXone), including embedded softphone iframes (`all_frames: true`). The script reads standard W3C `RTCPeerConnection.getStats()` counters (`rtt`, `jitter`, `packetsLost`, `packetsReceived`, `packetsSent`), media track state (`readyState`, `muted`, `enabled`), and aggregated `PerformanceObserver` API response times per hostname. It never accesses `MediaStream` audio buffers, `MediaRecorder`, or `AudioContext`.

---

## 3. Data Usage & Privacy Disclosures (Dashboard Questionnaire)

- **Remote Code:** **No.** All JavaScript (`background.js`, `content.js`, `injected_webrtc_hook.js`, `precheck.js`, `popup.js`) is packaged locally inside the extension bundle.
- **Audio / Video / Screen Capture:** **No.** The extension never records, intercepts, or transmits audio, video, or screen content.
- **Data Collected & Transmitted to the Customer's Relay (`wss://voicevanguard.trustco.pro`):**
  1. **Workstation & Operator Identifiers:** `agentStationId` (e.g., `PA-XXXX`), `operatorName` (when configured by corporate IT), and the CCaaS `conversationId` / `contactId` for call correlation.
  2. **Numeric WebRTC Telemetry:** `rttMs`, `jitterMs`, interval and peak `lossPct`, estimated `mosScore`, transport protocol (`UDP`/`TCP`), audio incident code (`NONE`, `MIC_DESCONECTADO`, `MIC_MUDO_SISTEMA`, `SEM_AUDIO_RECEBIDO`, `SEM_AUDIO_ENVIADO`), and `devicechange` counter (device names are never read).
  3. **Workstation Health & Pre-Check:** Network probe RTT/jitter/loss to the relay, count of audio input/output devices (counts only), browser connection hint (`navigator.connection`), CPU core count (`navigator.hardwareConcurrency`), approximate RAM (`navigator.deviceMemory`), JS heap pressure indicator, and CCaaS API latency aggregated by hostname (never full URLs, query parameters, or payloads).
- **Privacy Policy URL:** `https://voicevanguard.trustco.pro/privacy`

---

## 4. Enterprise Deployment (GPO / Intune Managed Policy)

The extension includes `managed_schema.json` supporting `chrome.storage.managed`:
```json
{
  "tenantKey": "<agent-or-tower-secret-key>",
  "relayServer": "wss://voicevanguard.trustco.pro",
  "operatorName": "PA-1042"
}
```
On connection, the background service worker authenticates over TLS (`wss://`) using a First-Message `AUTH` frame (`{ "type": "AUTH", "key": "...", "agentId": "..." }`) so credentials are never exposed in URL query strings or proxy logs.
