# Proposta: credencial individual por estação (planejamento)

> **Nada aqui está implementado.** Não citar em material comercial antes de existir e estar testado. Itens marcados [INF] são inferência e [NÃO VERIFICADO] depende de documentação Microsoft/Google que não foi consultada.

## Problema
Cada torre usa uma única `agentKey` compartilhada por todas as extensões (`server.js`, `buildKeyIndex`). Se uma estação vaza a chave, a torre inteira fica exposta e revogar exige reemitir a chave para todos. O `agentId` também é escolhido pelo cliente.

## Desenho recomendado: enrollment token de torre trocado por credencial individual
1. A política GPO/Intune continua entregando **um valor por torre** (hoje `tenantKey`; passaria a ser `enrollToken`). Ele só serve para se registrar e **não abre telemetria**.
2. No primeiro uso a extensão envia `ENROLL {enrollToken, stationId}`; o relay devolve uma credencial individual, guardada em `chrome.storage.local`. Depois só ela vai no `AUTH`.
3. A credencial é sem estado e assinada: `vv1.<tenant>.<tower>.<stationId>.<exp>.<HMAC-SHA256>`, com `stationSecret` novo por torre (distinto da `agentKey`). O servidor recalcula o HMAC (`timingSafeEqual`); tenant, torre e papel saem da credencial, nunca do cliente.
4. Revogação sem banco: lista `revoked` por torre (env ou `DATA_DIR`) e `epoch` por torre dentro do HMAC; trocar `stationSecret`/`epoch` invalida a torre toda (com `stationSecretPrev` para rotação suave).
5. Compatibilidade: a `agentKey` da torre segue aceita; a credencial `vv1.` é um segundo caminho no `AUTH`, reconhecido pelo prefixo. Depois da migração, `allowTowerKey:false` por torre desliga a chave antiga.

## Por que não chave por estação via MDM
- GPO é política por OU; valor por máquina exige GPP com item-level targeting ou script de logon [INF].
- Se `{{DeviceName}}` e similares do Intune valem em política de extensão é incerto [NÃO VERIFICADO], e ainda assim o segredo por máquina daria trabalho por máquina.

## Cuidados
- Teto de emissões por torre (reaproveitar `AGENT_RECORD_FACTOR`) e rate limit no `ENROLL` (reaproveitar `recordFailure`); sem isso um token vazado cria estações sem limite.
- `stationId` repetido com credencial diferente precisa de política definida (substituir ou rejeitar).
- Renovação e novo registro só com `isCallActive === false` (In-Call Lock); hoje `background.js` fecha o WebSocket quando a política muda, mesmo em chamada, e isso deve ser corrigido antes da rotação.
- A credencial no `storage.local` é legível por quem tem o perfil do navegador: não é cofre (não pior que o registro de política de hoje) [INF]. Opcional na etapa 5: par ECDSA não exportável para prova de posse.
- Nunca em URL, README ou código; a extensão não escolhe papel, torre ou tenant.

## Plano (um PR cada, com Issue antes)
| # | Entrega | Esforço |
|---|---|---|
| 1 | Servidor: validador `vv1.`, `stationSecret` e `revoked` em `buildKeyIndex`, com testes de HMAC, expiração e revogação | 1 dia |
| 2 | Servidor: `ENROLL` antes do `AUTH`, com teto por torre e rate limit | 1 dia |
| 3 | Extensão: `enrollToken`, troca no primeiro uso, armazenamento, fallback para `tenantKey`, correção do fechamento em chamada | 1 a 1,5 dia |
| 4 | Docs e schema (`managed_schema.json`, `IMPLANTACAO_GPO_INTUNE.md`) e piloto com GPO/Intune reais | 0,5 dia + piloto |
| 5 | Telemetria de adoção, `allowTowerKey:false`, opcional ECDSA | 1 a 2 dias |

Total estimado: 5 a 6 dias de desenvolvimento, fora o piloto. O fluxo com GPO/Intune reais nunca foi validado neste repositório.
