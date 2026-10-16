# Auditoria de Certificação Enterprise (Genesys AppFoundry / AWS FTR / NICE DEVone) — Outubro de 2026

Três revisões independentes (Ciclo 1 — Claude Code) seguidas de uma auditoria sênior/principal de certificação de ponta a ponta (Ciclo 2 — Argon), com testes de intrusão locais, validação de protocolo WebRTC e suíte E2E em Chromium real.

## Corrigido no Ciclo 1 (Base PR #21)
- **Crítico (DoS pré-autenticação):** um frame acima de 64 KB em conexão com chave inválida derrubava o processo Node.js (`RangeError: Max payload size exceeded` em socket órfão). Corrigido anexando handler de erro ao `ws` antes de `ws.close(4001)`, com teste automatizado dedicando ataque real ao servidor.
- **Proteção de Produção:** o relay recusa chaves de demonstração não apenas com `NODE_ENV=production`, mas também ao detectar variáveis de ambiente do Railway (`RAILWAY_ENVIRONMENT`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`).
- **Rate Limit por IP:** corrigido para usar o último IP de `X-Forwarded-For` quando `TRUST_PROXY=1` (evitando spoofing pelo cabeçalho inicial).
- **Limites por Conexão e Sala:** teto de 40 msg/s por agente e 20 msg/s por supervisor (encerra com `1008`); limite de estações por sala.
- **Superfície de API e Cache:** `/api/health` público sem contagem de agentes/supervisores; `Cache-Control: no-store` nas respostas de `/api/*`; `/api/validate-tenant` aceita chave exclusivamente via cabeçalho `X-Tenant-Key`.
- **In-Call Lock Server-Side:** comandos de limpeza para agentes recém-conectados (`callActive === null`) ou em chamada (`callActive === true`) ficam retidos em fila no servidor até confirmação de ociosidade.
- **Extensão MV3 & GPO:** `chrome.storage.managed` conecta automaticamente ao receber política; adicionado `managed_schema.json`; `relayServer` restrito a `wss://` (exceto localhost); reconexão com backoff exponencial + jitter; `all_frames: true` para suportar CCP/softphone em iframes; removida permissão `alarms` não utilizada.
- **Transparência de Marketplace e Privacidade:** removidas alegações absolutas ("100% LGPD/GDPR/PCI-DSS", "Zero Call Drops", "85%", banda Wi-Fi 2,4/5 GHz não exposta pela Web API). Política de privacidade (`/privacy`) detalha exatamente todos os campos coletados e retidos.

---

## Corrigido no Ciclo 2 (Revisão Principal Argon — Nível Certificador)
- **Autenticação WebSocket por First-Message (`AUTH`) — Eliminação de CWE-598:**
  - Extensão (`background.js`), Console de Supervisão (`public/app.html`), Widget de Interação (`public/widget.html`) e simuladores não enviam mais `?key=` na URL do WebSocket.
  - O handshake ocorre na primeira mensagem JSON (`{ type: 'AUTH', key, agentId }`) com timeout estrito de 5 segundos (`4001 Authentication timeout`) e confirmação `{ type: 'AUTH_OK', agentId }`. O `?key=` é recusado em produção por padrão (ver Ciclo 3).
- **Content Security Policy (CSP) Estrita com Hashes SHA-256 (Sem `'unsafe-inline'` em `script-src`):**
  - `server.js` calcula dinamicamente no boot os hashes SHA-256 (normalizados para LF e brutos) de todos os blocos `<script>` de `public/*.html` e remove `'unsafe-inline'` de `script-src`.
  - Removidos atributos inline `onfocus`/`onblur` em `public/index.html` em favor de seletor CSS `:focus`, garantindo zero violações de CSP no navegador.
- **Cálculo de Perda de Pacotes por Intervalo (Delta de 2s) em vez de Média Acumulada:**
  - *Falha detectada:* `injected_webrtc_hook.js` dividia `packetsLost` acumulado desde o segundo zero da chamada por `packetsReceived + packetsLost` totais. Em chamadas longas (ex.: 20 min), um pico severo de 25% de perda nos últimos 10 segundos era diluído para ~0,2%, mascarando o incidente e inflando o MOS.
  - *Correção:* implementada `computeIntervalLoss` usando os deltas das amostras de 2 segundos (somados numa janela de 3 amostras, ver Ciclo 3) para o cálculo do MOS instantâneo, preservando os contadores cumulativos apenas no sumário de fim de chamada.
- **Correção de Bug de Regex na Captura de `contactId` do Amazon Connect:**
  - A expressão `/\/contact(s)?\/([a-f0-9-]{36}|\d{8,20})/i` fazia com que `match[1]` retornasse `'s'` em URLs `/contacts/...`, descartando o UUID real em `match[2]`. Corrigida para grupo não-capturante `/\/contacts?\/([a-f0-9-]{36}|\d{8,20})/i`.
- **Proteção de In-Call Lock em Múltiplas `RTCPeerConnection` (`activeVoiceSessions` / `stillInCall`):**
  - Em ambientes Genesys Cloud / Amazon Connect que abrem conexões WebRTC secundárias de teste ou mídia unidirecional, o fechamento da conexão secundária disparava `REPORT_CALL_SUMMARY` e liberava prematuramente o `In-Call Lock` enquanto a chamada principal seguia ativa. Agora `activeVoiceSessions` rastreia sessões com tráfego de voz ativo e informa `stillInCall` ao `background.js` e ao `server.js`.
- **Fusão Multi-Frame de `API_LATENCY` no Servidor:**
  - Com `all_frames: true`, o hook roda no topo e no iframe do softphone. Antes, cada `API_LATENCY` sobrescrevia `cur.apiLatency` inteiro, apagando a telemetria do outro frame. Agora `updateStation` faz merge por host com janela de 60 segundos.
- **Proteção contra Exaustão de Memória no Rate Limiter (`isRateLimited`):**
  - `isRateLimited(ip)` criava um array vazio no `Map` `authFailures` para cada IP legítimo que se conectava com sucesso. Corrigido para não alocar entradas em IPs limpos, além de aplicar teto rígido (`AUTH_MAX_IPS = 5000`) e respeitar `maxAgents * AGENT_RECORD_FACTOR` em `room.stations` mesmo para estações que nunca enviaram telemetria.
- **Suporte Real ao NICE CXone (MCH / Agent):**
  - Adicionados domínios `https://*.niceincontact.com/*` e `https://*.nice-incontact.com/*` ao `manifest.json` (`host_permissions`, `content_scripts`, `web_accessible_resources`), detecção `NICE_CXONE` e padrões de host em `injected_webrtc_hook.js`, e `frame-ancestors` no CSP do `server.js`.
- **Manifesto Genesys AppFoundry Oficial + Interaction Widget Real (`/widget`) + Ícones PNG 128/512:**
  - Corrigidos os tokens de interpolação de URL em `genesys_client_app_manifest.json` para os tokens oficiais do Genesys Cloud (`{{pcLangTag}}`, `{{pcEnvironment}}`, `{{pcConversationId}}`).
  - Gerados os ícones oficiais `public/assets/icon-128.png` (128x128) e `public/assets/icon-512.png` (512x512) exigidos pelo AppFoundry.
  - Construído o Interaction Widget completo e bilíngue em `public/widget.html`, correlacionando `conversationId` em tempo real com telemetria ativa ou histórico auditado da chamada. Na versão final (Ciclo 3) o widget usa credencial própria somente leitura e não envia comandos.
- **Correções no Popup da Extensão (`popup.html` / `popup.js`):**
  - Corrigida exibição do ID da chamada no histórico local (`c.callId || c.interactionId`), que antes mostrava sempre `"s/ ID"`.
  - Corrigido travamento permanente do botão de limpeza quando a aba do softphone era fechada no meio de uma chamada (verifica se `lastTelemetry` tem menos de 15s).
  - Corrigido contraste de `.btn:disabled` no modo escuro e removidos estilos hardcoded.
- **Documentação e Higiene de Repositório:**
  - Criado `CHROMEWEBSTORE.md` (justificativa de permissões MV3, Single Purpose, Data Disclosure).
  - Atualizados `SECURITY_ONE_PAGER.md` e `CLAUDE.md` (refletindo interceptação nativa WebRTC e First-Message Auth).
  - Adicionado `TENANTS_JSON*` ao `.gitignore` para impedir commit acidental de chaves locais.

---

## Ciclo 3 — ressalvas da revisão cruzada (Claude Code)
- **Widget sem credencial de supervisor:** o painel da chamada é visto pelo agente, então o widget não pode pedir a chave de supervisor. Novo papel `widget`: configurado em `TENANTS_JSON` com `widgetKey`, autentica por `AUTH` com `conversationId`, recebe só telemetria e auditoria dessa conversa, não lê estações, torres nem outras chamadas, e qualquer comando que envie é ignorado. A chave vai no fragmento da URL (`#wk=...`, que não chega ao servidor nem a logs de proxy) e é removida do endereço ao carregar. O botão de limpeza saiu do widget. O parâmetro de ambiente agora aceita `env` (usado no manifesto) e `environment`.
- **Chave na URL do WebSocket:** `?key=` passa a ser recusado quando `NODE_ENV=production`, a menos que `ALLOW_URL_KEY=1` (para extensões antigas durante a transição). `DISABLE_URL_KEY=1` desliga em qualquer ambiente.
- **Perda de pacotes:** a janela agora soma as últimas 3 amostras (cerca de 6 s) em vez de usar uma única amostra de 2 s, para que 1 pacote perdido numa amostra pequena não gere pico falso; um pico real decai gradualmente. A primeira amostra só define a linha de base e reinício de contadores é ignorado.
- **CSP:** `connect-src` passou de `'self' ws: wss:` para `'self'` (o console, o widget e a extensão falam com o mesmo host). `style-src` ainda permite `'unsafe-inline'` por causa de estilos dinâmicos; é o próximo candidato.
- **Testes:** 57 unitários e 23 verificações no e2e (inclui widget com chave própria, sem campo de chave de supervisor e sem a chave no endereço).

## Validações Externas / Administrativas (Dependem do Operador / Jurídico)
1. **Chave de Agente Compartilhada por Torre (`agentKey`):** documentado no `SECURITY_ONE_PAGER.md` como modelo de chave por torre (provisionada via GPO/Intune); caso um cliente exija identidade individual criptográfica por estação, planejar mTLS ou token OAuth por agente em roadmap futuro.
2. **Validação em Domínio Windows Real (GPO / Intune) e Revisão Jurídica:** testar aplicação do `managed_schema.json` via AD/Intune corporativo e validar os termos de retenção e minutas contratuais (`04_ Kit_Comercial_Juridico_BPO`) com advogado especializado.
3. **Confirmar o que está no ar:** o deploy foi feito por `railway up` a partir de uma pasta local; confirmar que corresponde à `main` e rodar `curl -I https://voicevanguard.trustco.pro` e `/api/health`. Depois que todas as extensões estiverem atualizadas, remover `ALLOW_URL_KEY` (se existir) e definir `DISABLE_URL_KEY=1`.
4. **Evidências de Produção para Submissão AWS FTR / AppFoundry:** anexar relatório SSL Labs (nota A+) de `voicevanguard.trustco.pro` e capturas de tela da interface no pacote de submissão.

