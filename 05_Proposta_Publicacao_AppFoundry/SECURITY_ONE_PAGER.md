# VoiceVanguard CCaaS — Enterprise Security & Architecture One-Pager

**Vendor:** TrustCo Technologies (`https://www.trustco.pro`)  
**Product:** VoiceVanguard CCaaS (`https://voicevanguard.trustco.pro`)  
**Supported Platforms:** Genesys Cloud CX, Amazon Connect, NICE CXone  

---

## 1. Architectural Overview & Zero-Audio Guarantee

VoiceVanguard CCaaS provides real-time workstation and WebRTC voice quality observability without entering the media path:

1. **Zero Media Interception:** The browser extension (`Manifest V3`) reads only numeric counters from the standard W3C `RTCPeerConnection.getStats()` API (`roundTripTime`, `jitter`, `packetsLost`, `packetsReceived`, `packetsSent`) and media track state flags (`readyState`, `muted`, `enabled`). It never invokes `MediaRecorder`, `AudioContext`, or `RTCRtpScriptTransform`, and never accesses RTP audio payloads.
2. **Data Minimization:**
   - **Device Privacy:** Only the count of audio inputs/outputs and the count of `devicechange` events are read; hardware device labels are never transmitted.
   - **API Latency Privacy:** `PerformanceObserver` measures CCaaS API response times (`p95`, error count) aggregated strictly by **hostname** in 30-second windows. Full URLs, paths, query strings, and tokens are never transmitted to the relay.
   - **Conversation Correlation:** The `conversationId` / `contactId` is extracted locally in the browser strictly for supervisor correlation; full request URLs and payloads are discarded locally.

---

## 2. Security Controls Matrix (Verifiable in Repository)

| Control Domain | Implementation (Verifiable in Code) | Verification Reference |
|---|---|---|
| **Authentication (REST & WebSocket)** | Separate cryptographic keys per role (`agentKey` vs. `supervisorKey`) and per operation tower. Keys are indexed in memory exclusively by **SHA-256** digest (`buildKeyIndex`). WebSocket clients authenticate via **First-Message `AUTH`** frame (`{ type: 'AUTH', key, agentId }`) and REST validation uses `X-Tenant-Key` header — secrets are never transmitted in URL query strings (eliminating CWE-598 proxy/log exposure). | `01_Cloud_Relay_Backend/server.js`, `test/hardening.test.js` |
| **Multi-Tenant & Per-Tower Isolation** | Each tenant has an isolated room (`tenantRooms`). Supervisors receive only events and station health records matching their authorized towers (`canSee(ws, tower)`). Cross-tenant and cross-tower isolation is verified by automated tests. | `01_Cloud_Relay_Backend/test/relay.test.js`, `test/towers.test.js` |
| **Content Security Policy (CSP) & Clickjacking** | Strict CSP with SHA-256 script hashes (`script-src 'self' 'sha256-...'` — no `'unsafe-inline'`), `base-uri 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Strict-Transport-Security`. Default `frame-ancestors 'none'` (`X-Frame-Options: DENY`); `/dashboard` and `/widget` restrict `frame-ancestors` to `'self'`, Genesys Cloud regional domains, and NICE CXone domains. | `01_Cloud_Relay_Backend/server.js`, `test/hardening.test.js` |
| **DoS, Rate Limiting & Memory Bounds** | `maxPayload: 64 KB` with early socket error handler; per-socket message rate limiting (`40 msg/s` agent, `20 msg/s` supervisor, `5 msg/s` unauthenticated); 5-second authentication timeout; IP rate limiting using the rightmost `X-Forwarded-For` hop when `TRUST_PROXY=1` (capped at 5,000 IPs); bounded `room.agents` and `room.stations` maps (`maxAgents * 4`). | `01_Cloud_Relay_Backend/server.js`, `test/hardening.test.js` |
| **Fail-Closed Production Startup** | If `NODE_ENV=production` or Railway environment variables (`RAILWAY_ENVIRONMENT`, `RAILWAY_PROJECT_ID`) are present without `TENANTS_JSON`, the relay refuses to start rather than falling back to development credentials. | `01_Cloud_Relay_Backend/server.js`, `test/hardening.test.js` |
| **In-Call Lock (Safe Remediation)** | Remote and local cache cleanup (`SAFE_CACHE_CLEAR`) is whitelisted (`COMMAND_WHITELIST`) and blocked by a dual client-side and server-side **In-Call Lock** whenever any voice session is active, queuing execution until post-call wrap-up and preserving cookies/SSO sessions. | `01_Cloud_Relay_Backend/server.js`, `03_Chrome_Edge_Extension/background.js` |
| **Enterprise Policy (GPO / Intune)** | Supports `chrome.storage.managed` (`managed_schema.json`). When `tenantKey` is provisioned via corporate policy, runtime overrides via `SET_TENANT_KEY` are locked (`isManaged = true`) and `relayServer` is restricted to `wss://`. | `03_Chrome_Edge_Extension/background.js`, `managed_schema.json` |

---

## 3. Compliance & Legal Posture

- **Privacy by Design (LGPD / GDPR Guidelines):** VoiceVanguard CCaaS is engineered to minimize personal data processing. Because workstation identifiers (`agentStationId`), operator names/IDs (when configured by the customer), and `conversationId`s constitute personal/pseudonymous employee data, the customer organization acts as the **Data Controller** and TrustCo Technologies acts as the **Data Processor**.
- **Public Privacy Notice:** Published at `https://voicevanguard.trustco.pro/privacy` with full inventory of collected fields and retention rules (up to 500 audited calls per tenant on server; up to 50 calls locally in browser storage).

---

## 4. Genesys Cloud / Amazon Connect / NICE CXone Integration Mapping

- **Genesys Cloud CX:** Installed as a Client Application (`/dashboard?lang={{pcLangTag}}&environment={{pcEnvironment}}`) and/or Interaction Widget (`/widget?lang={{pcLangTag}}&environment={{pcEnvironment}}&conversationId={{pcConversationId}}`).
- **Amazon Connect & NICE CXone:** The MV3 extension automatically detects Amazon Connect (`*.my.connect.aws`, `*.awsapps.com/connect/*`) and NICE CXone (`*.niceincontact.com`, `*.nice-incontact.com`), correlating Contact IDs with real-time WebRTC voice telemetry.
