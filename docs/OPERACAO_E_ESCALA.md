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


## Verificações automatizadas (antes e depois do deploy)

```bash
# Configuração de produção (lê o ambiente; não imprime segredos)
TENANTS_JSON=... DATA_DIR=... TRUST_PROXY=1 NODE_ENV=production node scripts/check-config.js

# Pós-deploy: 15 checagens somente leitura (saúde, landing, CSP/HSTS, recusa de chave inválida)
node scripts/smoke.js https://voicevanguard.trustco.pro

# Carga local: N agentes + 1 supervisor
node scripts/loadtest.js 300 20 2000
```

### Linha de base de carga (máquina de desenvolvimento, relay local, 1 processo)

| Agentes | Telemetria | Perda | Entrega agente→supervisor p95 | Memória (pico) |
|---|---|---|---|---|
| 300 | a cada 2 s, 20 s | 0% | 12 ms | n/d |
| 800 | a cada 2 s, 20 s | 0% | 26 ms | ~83 MB |

Sem rede real (loopback): serve como piso, não como promessa. Repetir contra o ambiente de produção com `scripts/loadtest.js <agentes> <s> <ms> wss://...` antes de ampliar além do piloto.

## Qualidade do MOS (aproximação)

O MOS da extensão é uma aproximação do E-model (ITU-T G.107), não uma medição validada contra chamadas reais. Ele trata o RTT inteiro como atraso; a referência G.711 usa atraso de mão única (~RTT/2). Efeito: perto do ideal os valores coincidem; com latência alta nossa nota é **mais pessimista**.

| RTT / jitter / perda | Nossa R / MOS | Referência G.711 R / MOS |
|---|---|---|
| 20 ms / 2 / 0% | 92.4 / 4.39 | 92.6 / 4.40 |
| 50 / 5 / 0% | 91.5 / 4.37 | 92.1 / 4.39 |
| 150 / 10 / 1% | 84.7 / 4.19 | 87.0 / 4.26 |
| 300 / 20 / 1% | 67.7 / 3.49 | 82.3 / 4.11 |
| 300 / 20 / 5% | 57.7 / 2.98 | 70.1 / 3.60 |
| 600 / 40 / 5% | 23.7 / 1.37 | 44.7 / 2.30 |

`test/mos.test.js` trava os valores atuais (limites, monotonicidade, pontos de referência). Antes de usar o MOS como indicador contratual, validar contra chamadas reais (ex.: comparação com o MOS estimado da própria plataforma) e só então decidir se o modelo muda.
