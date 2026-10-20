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

`HISTORY_MAX` (padrão 5000, faixa 500–50000) define o histórico de chamadas por tenant; cada gravação reescreve o arquivo JSON inteiro no volume, então valores altos custam disco e I/O.


## Tenant de demonstração

Para demonstrar o produto sem dados reais, marque um tenant com `"demo": true` no `TENANTS_JSON` (opcional `"demoSize"`, 5 a 500, padrão 36; use os nomes fictícios do projeto, ex.: `GENESYS-ALLIANCE-EVAL`):

```json
"GENESYS-ALLIANCE-EVAL": { "name": "Demonstração", "plan": "Demo", "maxAgents": 600, "demo": true, "demoSize": 60,
  "towers": { "VENDAS": { "agentKey": "<aleatória>" }, "SUPORTE": { "agentKey": "<aleatória>" } },
  "supervisors": [{ "key": "<chave de supervisor da demo>", "name": "Demo", "towers": "*" }] }
```

- **O acesso continua exigindo chave de supervisor.** A chave é entregue em privado a quem vai ver a demo e pode ser trocada a qualquer momento; não há demo aberta nem chave no código.
- O servidor gera as estações (`PA-DEMO-001`...), com operadores genéricos, e as faz variar a cada 2 s: chamadas começam e terminam (viram histórico e CSV), MOS oscila, e de tempos em tempos aparecem Wi-Fi ruim em grupo (aciona a leitura de causa por frota), estação isolada, áudio mudo e estações offline. O botão de limpeza de cache responde de forma simulada, respeitando o In-Call Lock.
- O console mostra a faixa "DEMONSTRAÇÃO: todos os dados abaixo são fictícios e simulados".
- A simulação **só roda enquanto houver supervisor conectado** no tenant demo e limpa tudo ao fechar, para não gastar CPU nem tráfego de saída no Railway. Referência medida: 500 estações custam ~2 ms de CPU por quadro e ~100 MB de memória; o tráfego é de cerca de 100 KB/s por console aberto (~200 MB em 30 minutos).
- Nada é gravado em disco; o tenant demo não aceita agentes reais e não dispara webhook.


## Limpeza de cache em lote

Na aba de monitoramento, o botão "Limpar cache das N estações da lista" atua sobre a lista filtrada (sem estações offline), com confirmação. Regras aplicadas no servidor:

- só estações que o supervisor enxerga (escopo de torre); até 100 por pedido;
- **In-Call Lock** por estação: quem está em chamada fica na fila e executa no pós-atendimento, então as limpezas se espalham sozinhas conforme as chamadas terminam;
- execução em levas de 10 estações a cada 5 s, e só um lote por vez por tenant (o segundo pedido recebe "ocupado");
- cada lote entra no log de auditoria (`lote=<id> alvos=<n>`), sem nome de operador;
- o console mostra um resumo vivo: limpas, na fila do pós-atendimento, com falha, aguardando e sem conexão.

Não há agendamento automático: só um supervisor aciona.

## Modo de monitoramento e "Medir agora"

Por tenant, em `TENANTS_JSON`: `"monitoringMode": "realtime" | "sampled" | "on_demand"` (padrão `realtime`; valor inválido impede o relay de subir).

| Modo | O que a estação envia ao relay | Quando usar |
|---|---|---|
| `realtime` | toda amostra (a cada ~2 s) | operações pequenas/médias |
| `sampled` | 1 amostra a cada ~10 s, e na hora se mudar status, problema de áudio ou caminho de mídia | frotas grandes, menos tráfego |
| `on_demand` | presença a cada ~30 s (e mudanças relevantes); tempo real só durante a janela "Medir agora" (padrão 30 s, 5–120 s) | frotas muito grandes |

A coleta local continua a cada 2 s; só o envio é reduzido. O resumo da chamada é sempre enviado. O botão **Medir agora** (console) envia `SUPERVISOR_MEASURE` às estações da lista filtrada (até 500, somente as que o supervisor enxerga); é somente leitura (não tem In-Call Lock) e limitado a uma ordem a cada 10 s por tenant. O tenant demo é sempre `realtime`.

## Tenants de piloto e de produção

Os tenants continuam criados à mão em `TENANTS_JSON`. Dois campos novos os diferenciam:

- `"tier": "pilot" | "production"` (padrão `production`).
- `"expiresAt": "2026-11-03T23:59:59-03:00"` (data ISO). **Obrigatório no piloto**; opcional em produção (fim do contrato).

O piloto tem tetos para não consumir a infraestrutura de um contrato: no máximo **25 estações** (`maxAgents` maior é reduzido a 25) e **500 chamadas** de histórico. Um valor inválido de `tier` ou `expiresAt`, ou um piloto sem `expiresAt`, impede o relay de subir (`scripts/check-config.js` avisa antes).

Depois de `expiresAt`, o relay recusa novas conexões (código `4010`, "Licença expirada") e encerra as já abertas na próxima batida do heartbeat; `/api/validate-tenant` devolve `403 LICENSE_EXPIRED`. A extensão mostra "Expirada" no popup e o console mostra a mensagem com o e-mail de suporte. Para converter o piloto em produção, troque `tier` para `production`, ajuste `maxAgents` e `expiresAt` (ou remova) e atualize `TENANTS_JSON`. O console e o popup mostram "Piloto até <data>" enquanto o piloto está válido.

## Caminho de mídia e teste de UDP

- **Caminho de mídia:** a extensão lê o par de candidatos ICE selecionado em `getStats()` e envia só protocolo e tipo (`udp-srflx`, `udp-relay`, `tcp-relay` etc.). Endereços IP e portas nunca são lidos. Mídia em TCP durante a chamada gera ALERTA e a causa "Mídia caiu para TCP (UDP possivelmente bloqueado)".
- **Teste de UDP 3478 (opcional):** com `"stunServers": ["stun:host[:porta]"]` (até 3) no tenant, o pré-check do popup coleta candidatos ICE e informa se há resposta UDP de saída. Sem `stunServers`, o item não aparece. O teste **não prova** a faixa ampla de mídia (por exemplo UDP 16384–65535 no Genesys Cloud); só indica bloqueio provável. Confirme as portas na documentação vigente de cada plataforma antes de passá-las à TI do cliente.

## Métricas de saúde do relay (OpenTelemetry / OTLP)

Opt-in: sem `OTEL_EXPORTER_OTLP_ENDPOINT` o relay não coleta nem envia nada. Implementação em `otel.js`, sem dependências (OTLP/HTTP em JSON). O destino é qualquer receptor OTLP; o planejado é o Grafana Cloud.

| Variável (Railway) | Exemplo |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `https://otlp-gateway-<zona>.grafana.net/otlp` (https obrigatório; `/v1/metrics` é acrescentado) |
| `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Basic <base64 de instanceId:token>` (segredo; nunca logado) |
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000` (ms, 10000–600000) |
| `OTEL_SERVICE_NAME` | `voicevanguard-relay` |

No Grafana Cloud: *Connections → OpenTelemetry (OTLP)* mostra o endpoint, o instance ID e permite gerar o token (escopo de escrita de métricas).

Métricas: `vvg.ws.connections` (tenant, papel), `vvg.stations` (tenant, status; conta as estações com telemetria de voz), `vvg.calls.active`, `vvg.call_history.size`, `vvg.webhook.pending`, `nodejs.eventloop.delay.p99`, `process.memory.rss`/`heap_used`, `process.uptime`, e contadores `vvg.auth.failures`, `vvg.limit.rejects`, `vvg.ratelimit.closed`, `vvg.messages.received` (papel). Rótulos só de baixa cardinalidade: nunca agentId, operador, chave ou IP (o plano gratuito comporta 10 mil séries).

Alertas sugeridos: sem dados do serviço por 5 min (relay fora), `vvg.ws.connections{role="agent"}` caindo mais de 30% em 5 min, `nodejs.eventloop.delay.p99` acima de 200 ms, `vvg.webhook.pending` acima de 40, pico de `vvg.auth.failures`. Complemente com um monitor externo de uptime em `/api/health`, que continua pendente.
