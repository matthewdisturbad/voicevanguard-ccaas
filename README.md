# VoiceVanguard CCaaS — Enterprise WebRTC Observability & Voice Quality Sentinel

[![Production URL](https://img.shields.io/badge/Production-voicevanguard.trustco.pro-0284c7?style=flat-square)](https://voicevanguard.trustco.pro)
[![Corporate Site](https://img.shields.io/badge/Corporate-trustco.pro-0f172a?style=flat-square)](https://trustco.pro)
[![Status](https://img.shields.io/badge/Status-Beta-amber?style=flat-square)](https://voicevanguard.trustco.pro)
[![Privacy](https://img.shields.io/badge/Privacy-Zero%20Audio%20Capture-blue?style=flat-square)](https://voicevanguard.trustco.pro)
[![Standards](https://img.shields.io/badge/Audio%20Standard-ITU--T%20G.107%20MOS-purple?style=flat-square)](https://www.itu.int/rec/T-REC-G.107)

VoiceVanguard CCaaS (by **TrustCo Technologies**) is an enterprise-grade WebRTC telemetry, objective voice quality observability (ITU-T G.107 MOS), and last-mile agent station diagnostic platform purpose-built for mission-critical Cloud Contact Centers (**Amazon Connect** & **Genesys Cloud CX**).

---

## 🏛️ Architecture & Project Structure

```
VoiceVanguard-CCaaS/
├── 01_Cloud_Relay_Backend/              # Cloud Relay Hub & WebSocket Telemetry Gateway (Node.js)
│   ├── server.js                        # Multi-tenant router, tenant isolation, session persistence
│   ├── package.json                     # Lightweight production dependencies (Node.js + ws)
│   ├── public/
│   │   ├── index.html                   # High-end bilingual product landing page (Route: /)
│   │   └── app.html                     # Gated enterprise supervisor console (Route: /app, /login)
│   └── data_store/                      # Audit trails and station history logs
│
├── 03_Chrome_Edge_Extension/            # Enterprise Browser Extension (Manifest V3)
│   ├── manifest.json                    # Permissions for Amazon Connect & Genesys Cloud (*.aws, *.pure.cloud)
│   ├── background.js                    # Direct WebSocket uplink to Cloud Relay via TenantKey / Intune GPO
│   ├── injected_webrtc_hook.js          # Injected RTCPeerConnection interceptor & ContactId extractor
│   ├── content.js                       # Bridge between host page and background service worker
│   ├── popup.html & popup.js            # Agent station diagnostic card with Safe In-Call Lock
│   └── icon*.png                        # Neutral enterprise brand icons
│
├── 04_Desktop_Master_Console/           # Dedicated Windows desktop supervisor shell
│
├── 05_Proposta_Publicacao_AppFoundry/   # Genesys Cloud CX Partnership & AppFoundry artifacts
│   ├── VoiceVanguard_Executive_Pitch_TrustCo.html  # Executive One-Pager (printable PDF format)
│   ├── genesys_client_app_manifest.json            # Genesys Cloud Client Application manifest
│   ├── CHECKLIST_SUBMISSAO_APPFOUNDRY.md           # Submission checklist & security declarations
│   └── PROPOSTA_GENESYS_APPFOUNDRY.md              # Technical and commercial proposal
│
└── 06_Proposta_Publicacao_Amazon_Connect/ # AWS Partner Network & Amazon Connect Ready artifacts
    ├── VoiceVanguard_Amazon_Connect_Ready_Pitch.html # AWS Pitch One-Pager (Squid Ink & Gold)
    ├── amazon_connect_integration_spec.json         # CCP WebRTC hook & SaaS contract specs
    └── GUIA_CADASTRO_AWS_PARTNER_NETWORK.md         # APN Onboarding & FTR playbook
```

---

## 🌐 Live Production Endpoints

| Resource | URL | Description |
| :--- | :--- | :--- |
| **Product Landing Page** | [voicevanguard.trustco.pro](https://voicevanguard.trustco.pro) | Public bilingual (PT-BR / EN) showcase & enterprise specs |
| **Gated Supervisor Console** | [voicevanguard.trustco.pro/app](https://voicevanguard.trustco.pro/app) | Tenant-authenticated operations dashboard (no public pills) |
| **REST Health Check** | [voicevanguard.trustco.pro/api/health](https://voicevanguard.trustco.pro/api/health) | Uptime, WebSocket connection count & tenant stats |
| **Corporate Website** | [trustco.pro](https://www.trustco.pro) | Official TrustCo Technologies corporate portal |

---

## ⚡ Core Technical Capabilities

1. **Real-Time WebRTC Telemetry (1-Second Polling):**
   - Intercepts W3C `RTCPeerConnection.getStats()` on active softphone sessions.
   - Extracts Round-Trip Time (RTT latency), outbound/inbound jitter, packet loss percentage, audio bitrate, and concealment events.

2. **Mathematical ITU-T G.107 MOS Computation (E-Model):**
   - Computes a live voice perception score (approximation based on ITU-T G.107, computed in the browser extension) between `1.00` (unintelligible) and `4.50` (crystal clear).
   - Dynamically accounts for packet loss non-linear penalties and jitter buffer distortion.

3. **Last-Mile Wi-Fi vs. Ethernet Diagnostics:**
   - Infers a likely connection type (stable network, likely Wi-Fi/cellular) from browser network hints; it does not measure Wi-Fi band or signal.
   - Proves whether call degradation originates from residential interference or true corporate cloud infrastructure.

4. **Station health (see `docs/PRECHECK.md`):**
   - One-way / muted audio detection (no inbound or outbound packets, microphone ended or system-muted); intentional operator mute is not an incident.
   - Shift pre-check from the extension popup: network probe to the relay, microphone/output presence, connection type and hardware, with a PRONTA / ATENCAO / NAO_PRONTA verdict.
   - Latency and error rate of the agent desktop's API calls, aggregated per hostname (no URLs, paths or IDs are collected).

5. **Safe In-Call Protection Lock (Remediation):**
   - Supervisors can remotely trigger browser telephony cache cleanup.
   - Client agent enforces a strict guard: if `isCallActive === true`, the action is blocked and enqueued for post-call wrap-up, preventing live call drops.

6. **Security & privacy by design:**
   - **Zero Audio Capture:** Only network metadata is processed; no voice payloads are ever recorded or stored.
   - **Privacy by design:** only network statistics and station identifiers (operator, station, agent ID, call ID) are processed; no cardholder data is collected by design. This is a design goal, **not a certification** — formal LGPD/GDPR/PCI-DSS assessments, DPA and privacy policy are pending (see the Compliance roadmap below).
   - **Encrypted transport:** WSS/HTTPS is provided by the hosting proxy (TLS termination at Railway).
   - **Multi-Tenant Logical Isolation:** each tenant has separate *agent* and *supervisor* keys; connections without a valid key are terminated (Code `4001`).

---

## 🔑 Tenant Configuration (secrets are never committed)

Tenants and keys come from the `TENANTS_JSON` environment variable (**required** when `NODE_ENV=production`):

```json
{"TENANT-ID": {"name": "Acme BPO", "plan": "Enterprise", "maxAgents": 500, "active": true,
               "agentKey": "<random >=32 chars>", "supervisorKey": "<another random >=32 chars>"}}
```

- `agentKey` goes into the browser extension (GPO/Intune managed policy); `supervisorKey` is used to sign into `/app`.
- Generate keys with `openssl rand -hex 24`. Never publish them in this repository.
- Other variables: `PORT`, `DATA_DIR` (mount a persistent volume), `TRUST_PROXY=1` (behind Railway), `CORS_ORIGIN`.
- Without `TENANTS_JSON` and outside production, the relay starts with **fictitious development tenants** (`dev-agent-<TENANT>` / `dev-supervisor-<TENANT>`).

> ⚠️ Keys that were previously published in this repository's history must be considered compromised and rotated in production.

## 🗺️ Compliance & Product Roadmap (pending, owner action)

Planned (not implemented) integrations and features: see `docs/ROADMAP.md`.

- Publish privacy policy and DPA; run a DPIA (operator/station/agent/call identifiers are personal data under LGPD/GDPR).
- Verify marketplace identifiers and submission status before citing them publicly.
- Reconcile pricing tables across pitch, proposal and manifests.
- `04_Desktop_Master_Console` is a placeholder (no code yet).

---

## 🛠️ Local Development & Quickstart

```bash
# Clone the repository
git clone https://github.com/matthewdisturbad/voicevanguard-ccaas.git
cd voicevanguard-ccaas/01_Cloud_Relay_Backend

# Install dependencies
npm install

# Start the Cloud Relay Hub locally (Port 9090 or env PORT)
node server.js
```

### Running the Multi-Cloud Call Simulator:
```bash
node test_multicloud_simulator.js
```

---

## 🏢 Corporate Ownership & Contact

**TrustCo Technologies**  
Brasília, Distrito Federal • Brasil 🇧🇷  
Website: [https://trustco.pro](https://www.trustco.pro)  
Commercial & Partnerships: [contato@trustco.pro](mailto:contato@trustco.pro)
