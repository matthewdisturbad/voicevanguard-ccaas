# VoiceVanguard CCaaS — Guia e Instruções Técnicas para o Claude

Este documento fornece contexto arquitetural, convenções de código e diretrizes operacionais para o **Claude** (Claude Code, Claude.ai e assistentes) trabalhando no repositório **VoiceVanguard CCaaS**.

---

## 🧭 Visão Geral do Produto

* **Nome do Produto:** VoiceVanguard CCaaS (antigo VoiceDoctor)
* **Empresa Proprietária:** TrustCo Technologies (Brasília, DF • Brasil)
* **Websites Oficiais:**
  * Landing Page do Produto: `https://voicevanguard.trustco.pro` (bilingue PT-BR/EN, aberta ao público)
  * Console do Supervisor: `https://voicevanguard.trustco.pro/app` (protegida por chave de tenant)
  * Portal Corporativo: `https://www.trustco.pro`
* **Hospedagem em Produção:** Railway (Projeto `voicevanguard-cloud`, serviço `01_Cloud_Relay_Backend`)
* **Propósito:** Observabilidade de chamadas WebRTC em tempo real, cálculo objetivo de MOS (ITU-T G.107), isolamento de problemas de Wi-Fi residencial em home office e remediação segura pós-chamada para **Amazon Connect** e **Genesys Cloud CX**.

---

## 🏛️ Arquitetura dos Módulos

```
├── 01_Cloud_Relay_Backend/
│   ├── server.js              # Servidor HTTP Express + WebSocket (ws)
│   │                          # Rotas HTTP:
│   │                          #   GET / -> Serve public/index.html (Landing comercial)
│   │                          #   GET /app, /login -> Serve public/app.html (Console restrito)
│   │                          #   GET /api/health -> Status e conexões ativas
│   │                          #   GET /api/validate-tenant -> Valida chave do tenant
│   │                          # WebSocket:
│   │                          #   Autentica tenantKey na conexão (4001 se inválido)
│   │                          #   Pub/Sub de telemetria por sala de tenant
│   │                          #   Motor ITU-T G.107 MOS embutido
│   │
│   └── public/
│       ├── index.html         # Landing page institucional com toggle PT-BR / EN
│       └── app.html           # Console operacional do supervisor (gráficos Chart.js, telemetria)
│
├── 02_Web_Supervisor_Dashboard/ # Fonte standalone do painel do supervisor
│
├── 03_Chrome_Edge_Extension/  # Extensão Manifest V3 para os navegadores dos operadores
│   ├── manifest.json          # Permissões de host (*.pure.cloud, *.aws, *.amazon.com)
│   ├── background.js          # Service worker que conecta ao Cloud Relay via WSS
│   ├── injected_webrtc_hook.js# Intercepta RTCPeerConnection e extrai ContactId / ConversationId
│   └── popup.html / popup.js  # Diagnóstico local e botão de limpeza com In-Call Lock
│
├── 05_Proposta_Publicacao_AppFoundry/     # Materiais Genesys Ascend / AppFoundry
└── 06_Proposta_Publicacao_Amazon_Connect/ # Materiais AWS APN / Amazon Connect Ready
```

---

## 🔒 Princípios Inegociáveis de Segurança & LGPD

1. **Zero Gravação de Áudio:** O VoiceVanguard NUNCA captura, armazena ou transmite áudio ou texto de conversas. Ele apenas lê estatísticas de pacotes RTP (`getStats()`).
2. **Nenhuma Demo Pública Aberta:** A raiz `/` do domínio `voicevanguard.trustco.pro` DEVE ser sempre a landing page comercial. O console de monitoramento `/app` NUNCA deve conter "demo pills" clicáveis ou senhas pré-preenchidas. O acesso exige autenticação de Tenant Key válida.
3. **In-Call Lock:** Comandos de remediação remota (limpeza de cache de telefonia) NUNCA podem ser executados durante uma chamada ativa (`isCallActive === true`). O comando deve ser enfileirado para a fase de encerramento (*wrap-up*).
4. **Isolamento de Tenants:** Supervisores de um tenant nunca podem ter acesso a eventos de outro tenant.
5. **Nomes Fictícios para Demonstração:** Em materiais e testes, use apenas nomes fictícios: `BPO-APEX-GLOBAL`, `BPO-NEXUS-CORP`, `BPO-STELLAR-CX`, `GENESYS-ALLIANCE-EVAL`. NUNCA use nomes de empresas reais (ex: Almaviva, Teleperformance, Atento).

---

## 🛠️ Comandos e Execução Local

```bash
# Entrar no backend
cd 01_Cloud_Relay_Backend

# Instalar dependências
npm install

# Rodar backend localmente (Porta 9090)
node server.js

# Rodar simulador de chamadas multicloud
node test_multicloud_simulator.js
```

---

## 🚀 Fluxo de Trabalho (Git, Issues e Branches)

1. **Abra uma Issue antes de começar o trabalho.** Descreva o objetivo e contexto da mudança.
2. **Crie uma branch de trabalho**, nunca commite direto em `main` (ex.: `feat/novo-recurso`, `fix/correcao-webrtc`).
3. **Abra um Pull Request** referenciando a Issue (`Closes #ID`).
4. **Deploy no Railway:** O deploy da branch `main` é automático no Railway. Qualquer merge em `main` vai direto para produção em `https://voicevanguard.trustco.pro`.

---

## 📑 Integração com Clouds

* **Amazon Connect:**
  * Integração via *Amazon Connect Streams API* e interceptação de WebRTC no CCP.
  * Correlação por `ContactId`.
  * Cadastrado no AWS Marketplace sob ID `prod-2xqzdscmymoma` e solução APN `soln-5mzgflbmd2cym`.
* **Genesys Cloud CX:**
  * Integração via Client App Manifest (`genesys_client_app_manifest.json`).
  * Correlação por `ConversationId`.
  * Candidatura submetida ao *Genesys Ascend Partner Program*.
