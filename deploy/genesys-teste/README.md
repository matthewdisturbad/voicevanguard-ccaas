# Pacote de teste na org Genesys Cloud

Sobe o VoiceVanguard (relay + extensão + console) e valida as três funções de saúde da estação numa **org de testes** Genesys Cloud. Nada aqui usa credenciais reais; todos os segredos são gerados por você e colados direto no Railway.

> **Base de código:** este pacote parte da branch do PR #10 (`fix/avaliacao-seguranca-producao`), que já inclui o PR #15. A `main` ainda não tem as funções de áudio, pré-check e latência, nem a autenticação por chaves separadas. Faça o teste a partir desta base.

## O que precisa de OAuth?

**Nada, hoje.** A extensão roda no navegador do operador, intercepta o WebRTC da própria página do agent desktop (`*.pure.cloud`, `*.mypurecloud.*`) e lê `getStats()`. Ela não chama a API do Genesys e não usa token OAuth. O relay também não.

O que você precisa na org de testes é de **usuários com acesso a telefonia WebRTC**. Detalhes em [PERMISSOES.md](PERMISSOES.md), incluindo o que seria necessário se o app virar *Client App* embutido no Genesys.

## Visão geral

```
Navegador do operador (Chrome/Edge)           Railway (serviço de TESTE)
 agent desktop Genesys  --getStats()-->  extensão  --WSS?key=agentKey-->  relay  <--WSS--  console /app (supervisor)
```

## Checklist

### A. Antes de começar (você)
- [ ] Org de testes Genesys Cloud com **pelo menos 2 usuários** de teste (um operador e um segundo para ligar) e uma **estação WebRTC** ou telefone WebRTC atribuído. Anote a **região** (ex.: `mypurecloud.com`, `sae1.pure.cloud`).
- [ ] Chrome ou Edge no computador do operador, com microfone e fones.
- [ ] Conta Railway e um **projeto separado do de produção** (sugestão: `voicevanguard-teste`).
- [ ] Node 20+ e `jq`, `openssl` na sua máquina (para gerar chaves).

### B. Subir o relay de teste (Railway)
- [ ] Crie um serviço novo apontando para este repositório, **branch `fix/avaliacao-seguranca-producao`** (ou `main`, depois que o PR #10 for mergeado), com *Root Directory* `01_Cloud_Relay_Backend` (start: `npm start`). Não use a branch `main` nem o serviço de produção `01_Cloud_Relay_Backend`.
- [ ] Gere as duas chaves (diferentes entre si):
  ```bash
  openssl rand -hex 24   # agentKey
  openssl rand -hex 24   # supervisorKey
  ```
- [ ] Copie `tenants.example.json` para um arquivo **fora do repositório**, preencha as chaves e gere a linha única: `jq -c . tenants.json`.
- [ ] No painel do Railway, em *Variables*, cole as variáveis de `railway.env.example` (`NODE_ENV`, `TENANTS_JSON`, `TRUST_PROXY=1`, `DATA_DIR=/data`).
- [ ] Adicione um **Volume** montado em `/data`. Mantenha **1 réplica** (o estado das salas é em memória).
- [ ] Em *Settings > Networking*, gere um domínio público. Anote a URL.
- [ ] Rode `SUPERVISOR_KEY=<sua supervisorKey> ./smoke-relay.sh https://<dominio>`. Esperado: health `online`, raiz serve HTML, chave errada `valid:false`, chave de supervisor `valid:true`.
- [ ] Sem `TENANTS_JSON` o relay recusa iniciar em produção. Se o deploy falhar, veja o log do Railway.

### C. Instalar a extensão de teste
O endereço do relay está fixo no `background.js` e a extensão não tem campo para a chave (ver "Limitações"). Por isso:
- [ ] `./build-test-extension.sh wss://<dominio-do-relay-de-teste>` gera `dist/extensao-teste/` apontando para o relay de teste. O código-fonte não é alterado.
- [ ] Chrome/Edge: `chrome://extensions` (ou `edge://extensions`) > **Modo do desenvolvedor** > **Carregar sem compactação** > escolha `dist/extensao-teste`.
- [ ] Clique em **service worker** (na página da extensão) para abrir o console dela e rode, com a **agentKey** (não a de supervisor):
  ```js
  chrome.storage.local.set({ tenantKey: 'COLE-A-AGENT-KEY', operatorName: 'Operador Teste' }, () => chrome.runtime.reload())
  ```
- [ ] Abra o popup da extensão: "Licença" deve mostrar *Configurada*.
- [ ] Abra o console `https://<dominio>/app`, entre com a **supervisorKey** e confirme que a estação aparece (aba de monitoramento). Se a chave for recusada: código 4001 = chave errada; 4009 = ID de estação duplicado; 4003 = limite de agentes.

### D. Preparar o Genesys
- [ ] Faça login no agent desktop (`https://apps.<região>`) com o usuário operador, **na mesma janela do navegador** que tem a extensão. Abas anônimas não carregam a extensão por padrão.
- [ ] Defina a estação/telefone WebRTC e confirme que o Genesys mostra o microfone/alto-falante corretos.
- [ ] (Opcional) Se a org usa Embedded Client App, não configure nada agora: os endpoints `/dashboard` e `/widget` do manifesto ainda **não existem** no servidor.

### E. Validar
Execute [ROTEIRO_VALIDACAO.md](ROTEIRO_VALIDACAO.md) e preencha a tabela de resultados.

### F. Encerrar o teste
- [ ] Remova a extensão de teste dos navegadores e apague o serviço/volume de teste no Railway (o histórico contém ID de estação, nome do operador e IDs de conversa, que são dados pessoais).
- [ ] Revogue/rotacione as chaves geradas.

## Limitações conhecidas (a decidir)
1. **A extensão não tem campo para informar a chave.** `SET_TENANT_KEY` existe no `background.js`, mas nada no popup envia. A configuração só entra por `chrome.storage.managed` (GPO/Intune) ou, no teste, pelo console do service worker como acima.
2. **A política gerenciada provavelmente não funciona**: o `manifest.json` não declara `storage.managed_schema`, e o Chrome só entrega políticas a extensões que declaram esse esquema. Antes de piloto com GPO/Intune, adicione o esquema (`tenantKey`, `relayServer`) e teste.
3. **Endereço do relay fixo** no código (`build-test-extension.sh` contorna só para o teste).
4. `/dashboard` e `/widget` do manifesto Genesys não existem; o app embutido ainda não é testável.
5. A sonda do pré-check mede o caminho até o **relay**, não até o Genesys.
6. Não houve teste prévio com Genesys real: tudo foi validado só com e2e simulado (`e2e/run.js`).
