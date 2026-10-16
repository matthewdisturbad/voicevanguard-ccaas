# VoiceVanguard CCaaS — Enterprise WebRTC Observability & Voice Quality Sentinel

[![Production URL](https://img.shields.io/badge/Production-voicevanguard.trustco.pro-0284c7?style=flat-square)](https://voicevanguard.trustco.pro)
[![Corporate Site](https://img.shields.io/badge/Corporate-trustco.pro-0f172a?style=flat-square)](https://trustco.pro)
[![Status](https://img.shields.io/badge/Status-Production%20Active-emerald?style=flat-square)](https://voicevanguard.trustco.pro)
[![Compliance](https://img.shields.io/badge/Compliance-LGPD%20%7C%20GDPR%20%7C%20PCI--DSS-blue?style=flat-square)](https://voicevanguard.trustco.pro)
[![Standards](https://img.shields.io/badge/Audio%20Standard-ITU--T%20G.107%20MOS-purple?style=flat-square)](https://www.itu.int/rec/T-REC-G.107)

VoiceVanguard CCaaS (by **TrustCo Technologies**) is an enterprise-grade WebRTC telemetry, objective voice quality observability (ITU-T G.107 MOS), and last-mile agent station diagnostic platform purpose-built for mission-critical Cloud Contact Centers (**Amazon Connect** & **Genesys Cloud CX**).

---

## 🏛️ Architecture & Project Structure

```
VoiceDoctor-CCaaS/
├── 01_Cloud_Relay_Backend/              # Cloud Relay Hub & WebSocket Telemetry Gateway (Node.js)
│   ├── server.js                        # Multi-tenant router, tenant isolation, session persistence
│   ├── package.json                     # Lightweight production dependencies (Node.js + ws)
│   ├── public/
│   │   ├── index.html                   # High-end bilingual product landing page (Route: /)
│   │   └── app.html                     # Gated enterprise supervisor console (Route: /app, /login)
│   └── data_store/                      # Audit trails and station history logs
│
├── 02_Web_Supervisor_Dashboard/         # Web Supervisor Console source & standalone template
│   └── index.html                       # Real-time command center, live call charts, remote actions
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
    ├── amazon_connect_integration_spec.json         # Streams API, CCP Hook & SaaS contract specs
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
   - Computes live subjective voice perception score between `1.00` (unintelligible) and `4.50` (crystal clear).
   - Dynamically accounts for packet loss non-linear penalties and jitter buffer distortion.

3. **Last-Mile Wi-Fi vs. Ethernet Diagnostics:**
   - Detects agent physical network interface (Ethernet, 5GHz Wi-Fi, 2.4GHz congested Wi-Fi, 4G/5G mobile hotspot).
   - Proves whether call degradation originates from residential interference or true corporate cloud infrastructure.

4. **Safe In-Call Protection Lock (Remediation):**
   - Supervisors can remotely trigger browser telephony cache cleanup.
   - Client agent enforces a strict guard: if `isCallActive === true`, the action is blocked and enqueued for post-call wrap-up, preventing live call drops.

5. **Strict Enterprise Security & Compliance:**
   - **Zero Audio Capture:** Only network metadata is processed; no voice payloads are ever recorded or stored.
   - **Built to follow LGPD and GDPR guidelines (privacy by design; not a certification):** No cardholder or sensitive customer data traverses the telemetry channel.
   - **Encrypted Transport:** Exclusively TLS 1.3 / WSS on standard port 443.
   - **Multi-Tenant Logical Isolation:** Socket connections without valid tenant authorization are terminated immediately (Code `4001 Unauthorized`).

---

## 🔑 Valid Evaluation Tenant Keys

When accessing the gated supervisor console at `https://voicevanguard.trustco.pro/app`:
- `GENESYS-ALLIANCE-EVAL`
- `BPO-APEX-GLOBAL`
- `BPO-NEXUS-CORP`
- `BPO-STELLAR-CX`

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
