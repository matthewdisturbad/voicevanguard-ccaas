# Roteamento por Torre (Operação)

**Princípio:** a própria operação define quem vai para a sua torre. O agente nunca escolhe a torre; quem decide é a TI do cliente ao distribuir a extensão.

Exemplo: um banco tem 1.000 agentes em *Golpes e Fraudes* e 1.500 em *Empréstimo*. O supervisor de Fraudes só vê (e só comanda) a torre de Fraudes.

## Como funciona

1. **Tenant** = o cliente (ex.: o banco): uma contratação e uma cobrança por PA, qualquer que seja o número de torres.
2. **Torre** = uma operação dentro do tenant. Cada torre tem a sua `agentKey`.
3. **Agente:** a TI instala a extensão por GPO/Intune com a `agentKey` da torre daquela OU. O relay deriva a torre da chave; nada que o agente envie escolhe a torre.
4. **Supervisor:** recebe uma chave própria com a lista de torres que pode ver (`"*"` = todas, para gerência/TI). Um supervisor pode ver mais de uma torre.
5. **Filtro no envio:** os dados são guardados uma vez por tenant. O relay entrega a cada supervisor só os eventos das torres dele (telemetria, auditoria de chamadas, estado inicial, saúde da estação, feedback de comandos e status offline). Vários supervisores na mesma torre recebem o mesmo evento, sem duplicar dados.
6. **Comandos:** o supervisor só alcança PAs das suas torres; o mesmo `agentId` em torres diferentes não colide.
7. **In-Call Lock no servidor:** se a PA está em chamada ativa, o comando é enfileirado, o supervisor é avisado e o comando é liberado quando a chamada termina (a extensão mantém o próprio lock).

Tenants sem `towers` seguem o modelo simples (`agentKey`/`supervisorKey` valem para todo o tenant).

## Configuração (`TENANTS_JSON` no Railway)

```json
{
  "BPO-APEX-GLOBAL": {
    "name": "Apex Global (teste)", "plan": "Enterprise", "maxAgents": 2500, "active": true,
    "towers": {
      "FRAUDES":    { "agentKey": "<chave-aleatoria-longa>" },
      "EMPRESTIMO": { "agentKey": "<chave-aleatoria-longa>" }
    },
    "supervisors": [
      { "key": "<chave-sup-1>", "name": "Sup Fraudes", "towers": ["FRAUDES"] },
      { "key": "<chave-sup-2>", "name": "Gerência",    "towers": "*" }
    ]
  }
}
```

- Gere chaves com `openssl rand -hex 24`. Chaves duplicadas, curtas (<8) ou torres inexistentes impedem o relay de subir.
- `maxAgents` vale para o tenant inteiro (todas as torres somadas).
- **Extensão (GPO/Intune):** cada OU recebe a `agentKey` da sua torre.
- **Console do supervisor:** o supervisor entra com a chave dele (nenhuma chave vai na URL).

## Cobrança

Por PA monitorada (única, mesmo que vários supervisores a vejam), supervisores ilimitados. Torres do mesmo cliente somam no mesmo contrato e na mesma faixa de volume.

## Teste

`cd 01_Cloud_Relay_Backend && npm test` inclui `test/towers.test.js`: org fictícia com 4 torres (Fraudes, Empréstimo, Cartões, Cobrança), PAs com `agentId` repetido entre torres e 3 supervisores. Verifica isolamento de telemetria, auditoria, comandos, estado inicial, offline, In-Call Lock no servidor, chaves inválidas, papéis, duplicidade e configuração inválida.

## Fase 2

Sincronizar torres com filas/grupos/divisões do Genesys Cloud por credencial somente leitura do cliente, em vez de chaves por GPO.
