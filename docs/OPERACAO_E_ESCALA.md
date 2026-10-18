# Operação e escala

## Como o deploy funciona hoje
Segundo o dono, o deploy no Railway é **manual** (`railway up`); um merge na `main` não publica sozinho. Há agora o workflow **Deploy (manual)** (`.github/workflows/deploy.yml`): em Actions > Deploy (manual), digite `PUBLICAR`. Ele roda os testes e a checagem de i18n e só então publica. Ele precisa do secret `RAILWAY_TOKEN` (token de projeto) e **ainda não foi exercitado contra o Railway real**; sem o secret falha com mensagem clara e não publica nada. Confirme no painel do Railway se existe também um deploy automático ligado ao GitHub, para não publicar duas vezes.

## Limites atuais (uma réplica)
| Estado | Onde fica | Efeito com 2+ réplicas |
|---|---|---|
| Salas, estações e agentes online | memória | cada réplica vê só as suas conexões; supervisor e agente em réplicas diferentes não se enxergam |
| Histórico de chamadas | `DATA_DIR/<tenant>_history.json` | duas réplicas sobrescrevem o mesmo arquivo |
| Estações cadastradas (`enrolled_stations.json`) | `DATA_DIR` | contagem divergente entre réplicas |
| Fila de webhooks | memória | alertas pendentes se perdem em reinício; sem duplicidade entre réplicas, mas sem ordem global |
| Rate limit de autenticação | memória | limite por réplica |

Por isso: **mantenha 1 réplica**, monte um Volume em `DATA_DIR` e defina `TRUST_PROXY=1`.

## Quando fizer sentido escalar (e o que construir)
Só quando houver carga ou exigência de disponibilidade que uma réplica não atenda. Ordem sugerida, cada passo em PR próprio e com a chave antiga/formatos atuais preservados:
1. **Redis (pub/sub e presença):** salas distribuídas entre réplicas; o `broadcast` publica no canal do tenant e cada réplica entrega aos seus sockets.
2. **Postgres (ou SQLite no Volume, para um nó só):** histórico de chamadas, estações cadastradas e fila de webhooks duráveis, no lugar dos arquivos JSON.
3. **Rate limit compartilhado** (Redis) e **sessão de leader** para tarefas únicas.
Estimativa: 1 a 2 semanas, mais testes de carga. Não foi implementado: precisa de infraestrutura (Redis/Postgres) provisionada pelo dono.
