# Implantação da extensão por política gerenciada (GPO / Intune)

A extensão lê a configuração de `chrome.storage.managed`, definida em `03_Chrome_Edge_Extension/managed_schema.json`. A operação (TI do cliente) instala a chave de **agente da torre** em cada grupo de máquinas; o agente não vê, não escolhe e não altera a chave (o popup só mostra "Configurada" e, com política ativa, o código ignora `SET_TENANT_KEY`).

| Campo | Obrigatório | Descrição |
|---|---|---|
| `enrollToken` | recomendado | Token de cadastro da torre: cada estação o troca, no primeiro uso, por uma credencial individual. Não abre telemetria. Ver "Credencial individual por estação" |
| `tenantKey` | sim, se não houver `enrollToken` | Chave de agente da torre (ou do tenant, em contas sem torres). Mantida por compatibilidade |
| `relayServer` | não | `wss://` do relay. Padrão: `wss://voicevanguard.trustco.pro`. Valores que não começam com `wss://` são ignorados |
| `operatorName` | não | Nome ou matrícula exibida ao supervisor. Vazio = só o identificador da estação |

## Chrome (Windows, GPO) e Edge
1. Publique a extensão (loja ou lista privada) e force a instalação com `ExtensionInstallForcelist`.
2. Aplique a política de extensão (`3rdparty\extensions\<ID>\policy`) com os campos acima. No Edge o caminho é `HKLM\Software\Policies\Microsoft\Edge\3rdparty\extensions\<ID>\policy`.
3. Uma política por grupo de máquinas (OU) = uma torre.

## Intune
Use a configuração de extensão do navegador (JSON com os mesmos campos) atribuída ao grupo de dispositivos da torre.

## Validação
Abra `chrome://policy` (ou `edge://policy`) na estação, confirme a política da extensão, e veja a estação aparecer no console do supervisor da torre.

**Aviso:** o fluxo foi testado em ambiente de desenvolvimento com o schema carregando; a validação com GPO/Intune reais ainda precisa ser feita no primeiro cliente piloto.

## Widget de interação (Genesys)
O widget aparece no painel da chamada do **agente**, por isso nunca usa a chave de supervisor. Defina um `widgetKey` no tenant em `TENANTS_JSON` (chave própria, distinta das demais). Ao instalar a integração na organização Genesys do cliente, o administrador acrescenta ao final da URL do widget `#wk=<widgetKey>` (depois de `&env={{pcEnvironment}}`). O trecho depois de `#` não é enviado ao servidor e o widget o remove do endereço ao carregar. Com essa chave o widget só lê a telemetria e a auditoria da conversa aberta; não lista estações nem executa comandos.

## Login do supervisor com Genesys Cloud (opcional, desligado por padrão)

Sem a seção `genesys` no tenant, nada muda: o console continua usando a chave de supervisor. Para ativar, no `TENANTS_JSON` do tenant:

```json
"genesys": {
  "orgId": "<UUID da organização Genesys>",
  "region": "mypurecloud.com",
  "clientId": "<OAuth Client ID (Implicit Grant) criado na organização>",
  "supervisorRoles": ["VoiceVanguard Supervisor"],
  "towers": "*"
}
```

- No Genesys, crie um OAuth Client do tipo *Token Implicit Grant (Browser)* com redirect URI `https://voicevanguard.trustco.pro/dashboard` e um papel (ex.: "VoiceVanguard Supervisor") atribuído aos supervisores.
- URL do Client App: `https://voicevanguard.trustco.pro/dashboard?lang={{pcLangTag}}&env={{pcEnvironment}}&tenant=<ID-do-tenant>`. O login é automático dentro do Genesys; não há botão na tela de acesso.
- O servidor valida o token em `api.<região>/api/v2/users/me`, exige a mesma organização e um dos `supervisorRoles`; a sessão expira em 12 h.

## Credencial individual por estação (opcional)

Com a chave compartilhada, vazar uma estação compromete a torre inteira. Com o cadastro, cada estação passa a ter uma credencial própria, revogável sozinha. Sem `stationSecret` no tenant nada muda.

No `TENANTS_JSON`, por torre (ou no tenant, se não houver torres):

```json
"towers": { "FRAUDES": {
  "agentKey": "<chave compartilhada atual>",
  "stationSecret": "<16+ caracteres, distinto de todas as chaves; openssl rand -hex 24>",
  "enrollToken": "<16+ caracteres, distinto; é o valor que vai na política>",
  "maxStations": 100,
  "credentialDays": 90,
  "epoch": 1,
  "revoked": ["PA-XXXX"],
  "stationSecretPrev": "<segredo antigo, só durante a rotação>",
  "allowTowerKey": true
} }
```

Como funciona: a política entrega o `enrollToken`; a extensão envia `ENROLL` ao relay, recebe uma credencial assinada (`vv1....`, validade `credentialDays`) e passa a usar só ela. O relay confere a assinatura; tenant, torre e id da estação saem da credencial, nunca do cliente. Cadastro e renovação (7 dias antes de vencer) só acontecem fora de chamada.

- **Migrar:** instale a extensão nova, coloque `stationSecret` e `enrollToken` no tenant, troque a política de `tenantKey` para `enrollToken` e acompanhe nos logs do relay as conexões `via: estação` x `via: torre`. Quando todas forem `estação`, defina `allowTowerKey: false`.
- **Revogar uma estação:** inclua o id em `revoked` e reinicie/redeploye o relay (a lista vem do env); ela perde o acesso na próxima conexão.
- **Revogar a torre toda / rotacionar:** aumente `epoch`, ou troque `stationSecret` (mantendo o antigo em `stationSecretPrev` por uma janela). As extensões se recadastram sozinhas pelo `enrollToken` (até 3 tentativas).
- **Token vazado:** troque o `enrollToken`; `maxStations` limita quantas estações novas ele consegue criar (o contador fica em `DATA_DIR/enrolled_stations.json`, então use Volume).
- **Limites conhecidos:** revogação e expiração valem na conexão (não derrubam socket já aberto); a credencial fica no `chrome.storage.local` do perfil do navegador, legível por quem tem acesso ao perfil, como a política de hoje; o fluxo com GPO/Intune reais ainda não foi validado em cliente piloto.

## Identificação da estação (hostname)

Sem configuração extra, cada navegador gera um ID aleatório (`PA-XXXX`). Para o supervisor ver o nome real da máquina (ex.: `PA-SP-0142`), grave o valor `stationId` na mesma política da extensão (campo opcional em `managed_schema.json`; letras, números, `.`, `-`, `_`, até 48).

- Script pronto: `deploy/Set-VoiceVanguardStation.ps1 -ChromeExtensionId <ID> [-EdgeExtensionId <ID>]`. Rode como SYSTEM (script de plataforma do Intune) ou como administrador (script de inicialização da GPO), porque escreve em `HKLM`. Ele grava só o `stationId` e preserva o restante da política.
- O valor estático da ADMX não expande `%COMPUTERNAME%`; por isso o script.
- Se o ID mudar, a credencial emitida para o ID antigo é descartada e a estação se cadastra de novo. O ID antigo continua contando no limite `maxStations` do tenant até o cadastro ser limpo; ajuste o limite ou limpe `enrolled_stations.json` no piloto.
- Privacidade: o nome do computador pode identificar o operador indiretamente (ver `docs/juridico/ADENDO_NOVOS_FLUXOS_DE_DADOS.md`). O script não foi testado em Windows real; valide no piloto.

## Pareamento manual (sem GPO/Intune)

Em estação sem política (piloto rápido, home office/BYOD), o popup da extensão mostra "Ativar esta estação" enquanto não houver chave, token nem credencial. O operador escolhe "Token de cadastro" (recomendado) ou "Chave do agente" e cola o código fornecido pela operação. O campo desaparece depois de configurado e não aparece em estações gerenciadas.

## Cisco Webex Contact Center (em validação)

A extensão passa a incluir `desktop.wxcc-us1.cisco.com`, `desktop.wxcc-eu1.cisco.com` e `desktop.wxcc-sg1.cisco.com` nas permissões. Atualizar a extensão com permissões novas pode exigir aprovação no navegador (em instalação forçada por GPO/Intune costuma ser automática; confirme no piloto). Outras regiões do Webex só entram depois de confirmadas na documentação do cliente. **Ainda não foi testado em um tenant Webex real**: antes de prometer a um cliente, validar no piloto a detecção da plataforma, a métrica de chamada e o ID da interação.
