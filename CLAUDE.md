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
│   ├── server.js              # Servidor HTTP (módulo http nativo) + WebSocket (ws)
│   │                          # Rotas HTTP:
│   │                          #   GET / -> Serve public/index.html (Landing comercial)
│   │                          #   GET /app, /login -> Serve public/app.html (Console restrito)
│   │                          #   GET /api/health -> Status e conexões ativas
│   │                          #   GET /api/validate-tenant -> Valida chave de SUPERVISOR (header X-Tenant-Key)
│   │                          # WebSocket:
│   │                          #   Autentica a chave na conexão (?key=...; 4001 se inválida).
│   │                          #   O papel (agente/supervisor) é derivado da chave, nunca do cliente
│   │                          #   Pub/Sub de telemetria por sala de tenant
│   │                          #   Rate limit, maxPayload, heartbeat, persistência atômica
│   │
│   └── public/
│       ├── index.html         # Landing page institucional com toggle PT-BR / EN
│       └── app.html           # Console operacional do supervisor (gráficos Chart.js, telemetria)
│
├── 03_Chrome_Edge_Extension/  # Extensão Manifest V3 para os navegadores dos operadores
│   ├── manifest.json          # Permissões restritas a Genesys Cloud e Amazon Connect (sem <all_urls>)
│   ├── background.js          # Service worker que conecta ao Cloud Relay via WSS
│   ├── injected_webrtc_hook.js# Intercepta RTCPeerConnection, extrai ContactId/ConversationId e calcula MOS (aproximação G.107)
│   └── popup.html / popup.js  # Diagnóstico local e botão de limpeza com In-Call Lock
│
├── 05_Proposta_Publicacao_AppFoundry/     # Materiais Genesys Ascend / AppFoundry
└── 06_Proposta_Publicacao_Amazon_Connect/ # Materiais AWS APN / Amazon Connect Ready
```

---

## 🔒 Princípios Inegociáveis de Segurança & LGPD

1. **Zero Gravação de Áudio:** O VoiceVanguard NUNCA captura, armazena ou transmite áudio ou texto de conversas. Ele apenas lê estatísticas de pacotes RTP (`getStats()`).
2. **Nenhuma Demo Pública Aberta:** A raiz `/` do domínio `voicevanguard.trustco.pro` DEVE ser sempre a landing page comercial. O console de monitoramento `/app` NUNCA deve conter "demo pills" clicáveis ou senhas pré-preenchidas. O acesso aos DADOS exige chave de supervisor válida (validada no WebSocket); chaves nunca vão em URL, README ou código.
3. **In-Call Lock:** Comandos de remediação remota (limpeza de cache de telefonia) NUNCA podem ser executados durante uma chamada ativa (`isCallActive === true`). O comando deve ser enfileirado para a fase de encerramento (*wrap-up*).
4. **Isolamento de Tenants:** Supervisores de um tenant nunca podem ter acesso a eventos de outro tenant.
5. **Segredos:** tenants/chaves vêm de `TENANTS_JSON` (env). Chaves de agente e de supervisor são distintas. Todo dado vindo de agente é não confiável: escape na UI (`esc()`), sanitização no servidor.
6. **Nomes Fictícios para Demonstração:** Em materiais e testes, use apenas nomes fictícios: `BPO-APEX-GLOBAL`, `BPO-NEXUS-CORP`, `BPO-STELLAR-CX`, `GENESYS-ALLIANCE-EVAL`. NUNCA use nomes de empresas reais (ex: Almaviva, Teleperformance, Atento).

---

## 🛠️ Comandos e Execução Local

```bash
# Entrar no backend
cd 01_Cloud_Relay_Backend

# Instalar dependências
npm install

# Rodar os testes automatizados
npm test

# Rodar backend localmente (Porta 9090; sem TENANTS_JSON usa tenants fictícios de dev)
node server.js

# Simuladores manuais (precisam do servidor rodando; AGENT_KEY opcional)
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
  * IDs de marketplace/APN informados pelo dono: `prod-2xqzdscmymoma` e `soln-5mzgflbmd2cym` (**não verificados** neste repositório; confirmar antes de citar publicamente).
* **Genesys Cloud CX:**
  * Integração via Client App Manifest (`genesys_client_app_manifest.json`).
  * Correlação por `ConversationId`.
  * Status da candidatura ao *Genesys Ascend Partner Program*: confirmar (a documentação do repositório diverge).
