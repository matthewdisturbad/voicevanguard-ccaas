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
* **Propósito:** Observabilidade de chamadas WebRTC em tempo real, cálculo objetivo de MOS (aproximação ITU-T G.107), isolamento de problemas de Wi-Fi residencial em home office e remediação segura pós-chamada para **Genesys Cloud CX**, **Amazon Connect** e **NICE CXone**.

---

## 🏛️ Arquitetura dos Módulos

```
├── 01_Cloud_Relay_Backend/
│   ├── demo.js                # Simulador do tenant de demonstração (dados fictícios; só com `demo: true`)
│   ├── otel.js                # Métricas de saúde do relay via OTLP/HTTP (opt-in por OTEL_EXPORTER_OTLP_ENDPOINT, sem dependências)
│   ├── station-credential.js  # Credencial individual por estação (HMAC) e cadastro; webhook.js = alertas de saída
│   ├── server.js              # Servidor HTTP (módulo http nativo) + WebSocket (ws)
│   │                          # Rotas HTTP:
│   │                          #   GET / -> Serve public/index.html (Landing comercial)
│   │                          #   GET /app, /login, /dashboard -> Serve public/app.html (Console restrito)
│   │                          #   GET /widget -> Serve public/widget.html (Genesys Interaction Widget; credencial `widgetKey` somente leitura, restrita a uma conversa)
│   │                          #   GET /privacy -> Serve public/privacy.html (Política de privacidade)
│   │                          #   GET /api/health -> Status público (sem expor métricas internas por tenant)
│   │                          #   GET /api/validate-tenant -> Valida chave de SUPERVISOR (header X-Tenant-Key)
│   │                          # WebSocket:
│   │                          #   Autenticação por primeira mensagem ({ type: 'AUTH', key, agentId }) com timeout de 5s
│   │                          #   (o fallback ?key=... fica desativado em produção, salvo ALLOW_URL_KEY=1 durante a migração; DISABLE_URL_KEY=1 desliga sempre).
│   │                          #   O papel (agente/supervisor) e a torre são derivados da chave (SHA-256), nunca do cliente.
│   │                          #   Pub/Sub de telemetria por sala de tenant e torre.
│   │                          #   CSP com hashes SHA-256 em script-src e style-src (sem unsafe-inline), rate limit, maxPayload, heartbeat.
│   │
│   └── public/
│       ├── index.html         # Landing page institucional com toggle PT-BR / EN
│       ├── app.html           # Console operacional do supervisor
│       ├── widget.html        # Interaction Widget em tempo real correlacionado por conversationId
│       ├── privacy.html       # Política de privacidade pública (inventário completo de dados)
│       └── assets/            # Ícones oficiais SVG, 128x128 PNG e 512x512 PNG
│
├── 03_Chrome_Edge_Extension/  # Extensão Manifest V3 para os navegadores dos operadores
│   ├── manifest.json          # Permissões restritas a Genesys Cloud, Amazon Connect e NICE CXone (sem <all_urls>)
│   ├── managed_schema.json    # Schema para implantação corporativa via GPO / Microsoft Intune
│   ├── background.js          # Service worker que conecta ao Cloud Relay via WSS (First-Message AUTH)
│   ├── injected_webrtc_hook.js# Intercepta RTCPeerConnection, extrai ContactId/ConversationId e calcula MOS (aproximação G.107) com perda de pacotes por intervalo
│   ├── precheck.js            # Lógica pura do pré-check de turno (testada com node:test)
│   └── popup.html / popup.js  # Diagnóstico local e botão de limpeza com In-Call Lock
│
├── 05_Proposta_Publicacao_AppFoundry/     # Materiais Genesys Ascend / AppFoundry
└── 06_Proposta_Publicacao_Amazon_Connect/ # Materiais AWS APN / Amazon Connect Ready
```

---

## 🔒 Princípios Inegociáveis de Segurança & LGPD

1. **Zero Gravação de Áudio:** O VoiceVanguard NUNCA captura, armazena ou transmite áudio ou texto de conversas. Ele apenas lê estatísticas de pacotes RTP (`getStats()`).
2. **Nenhuma Demo Pública Aberta:** A raiz `/` do domínio `voicevanguard.trustco.pro` DEVE ser sempre a landing page comercial. O console de monitoramento `/app` NUNCA deve conter "demo pills" clicáveis ou senhas pré-preenchidas. O acesso aos DADOS exige chave de supervisor válida (validada no WebSocket via primeira mensagem `AUTH`); chaves nunca vão em URL, README ou código.
3. **In-Call Lock:** Comandos de remediação remota (limpeza de cache de telefonia) NUNCA podem ser executados durante uma chamada ativa (`isCallActive === true`). O comando deve ser enfileirado para a fase de encerramento (*wrap-up*).
4. **Isolamento de Tenants:** Supervisores de um tenant nunca podem ter acesso a eventos de outro tenant.
5. **Segredos:** tenants/chaves vêm de `TENANTS_JSON` (env). Chaves de agente e de supervisor são distintas. Todo dado vindo de agente é não confiável: escape na UI (`esc()`), sanitização no servidor.
6. **Nomes Fictícios para Demonstração:** Em materiais e testes, use apenas nomes fictícios: `BPO-APEX-GLOBAL`, `BPO-NEXUS-CORP`, `BPO-STELLAR-CX`, `GENESYS-ALLIANCE-EVAL`. NUNCA use nomes de empresas reais (ex: Almaviva, Teleperformance, Atento).

---

## 📚 Documentação complementar

* `docs/WEBHOOK_ALERTAS.md` · `docs/EXPORTACAO_CHAMADAS.md` · `docs/IMPLANTACAO_GPO_INTUNE.md` · `docs/OPERACAO_E_ESCALA.md` — alertas de saída, exportação CSV, implantação e limites de escala
* `docs/AUDITORIA_APROVADOR.md` — registro consolidado das auditorias de segurança e certificação · `docs/AVALIACAO.md` — avaliação e pendências do dono · `docs/PRECHECK.md` — funções de saúde da estação (limiares, privacidade) · `CHROMEWEBSTORE.md` — guia de submissão Chrome Web Store / Edge Add-ons · `docs/ROADMAP.md` — **planejamento apenas**, nada implementado; não citar em material comercial.

## 🛠️ Comandos e Execução Local

```bash
# Entrar no backend
cd 01_Cloud_Relay_Backend

# Instalar dependências
npm install

# Rodar os testes automatizados (129 testes unitários)
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
4. **Deploy no Railway:** segundo o dono, o deploy é **manual** (`railway up` ou o workflow *Deploy (manual)*); um merge em `main` não publica sozinho. Confirme no painel do Railway se há deploy automático ligado ao GitHub antes de assumir qualquer um dos dois. Detalhes em `docs/OPERACAO_E_ESCALA.md`.

---

## 📑 Integração com Clouds

* **Amazon Connect:**
  * Integração via interceptação nativa de `RTCPeerConnection.getStats()` e `fetch` no CCP (`*.my.connect.aws` e `*.awsapps.com/connect/*`), sem dependência da biblioteca *Amazon Connect Streams API*.
  * Correlação por `ContactId`.
  * IDs de marketplace/APN informados pelo dono: `prod-2xqzdscmymoma` e `soln-5mzgflbmd2cym` (**não verificados** neste repositório; confirmar antes de citar publicamente).
* **Genesys Cloud CX:**
  * Integração via Client App e Interaction Widget (`genesys_client_app_manifest.json` com interpolação oficial `{{pcLangTag}}`, `{{pcEnvironment}}`, `{{pcConversationId}}` e ícones PNG 128x128 e 512x512).
  * Correlação por `ConversationId`.
* **NICE CXone:**
  * Suporte nativo na extensão (`*.niceincontact.com`, `*.nice-incontact.com`) com detecção automática de plataforma (`NICE_CXONE`), correlação de `contactId` e agregação de latência de API por hostname.
* **Cisco Webex Contact Center (em validação):**
  * Domínios do Desktop `desktop.wxcc-{us1,eu1,sg1}.cisco.com` no manifest e detecção `CISCO_WEBEX`. Outras regiões entram só depois de confirmadas (a extensão não aceita curinga no meio do host). **Não testado em tenant Webex real**; a correlação por ID de interação ainda usa os mecanismos genéricos (URL/atributos) e cai em ID temporal.
