# Roteamento por Torre (Operação)

**Princípio:** a própria operação define quem vai para a sua torre. O agente nunca escolhe a torre; quem decide é a TI do cliente, ao distribuir a extensão.

Exemplo: um banco tem 1.000 agentes em *Golpes e Fraudes* e 1.500 em *Empréstimo*. O supervisor de Fraudes só vê (e só comanda) a torre de Fraudes.

## Como funciona

1. **Tenant** = o cliente (ex.: o banco). Uma contratação, uma cobrança por PA.
2. **Torre** = uma operação dentro do tenant. Cada torre tem uma `agentKey`.
3. **Agente:** a TI instala a extensão por GPO/Intune com `tenantKey` + `operationKey` (a `agentKey` da torre daquela OU). O relay deriva a torre da chave; qualquer campo enviado pelo agente é ignorado.
4. **Supervisor:** recebe uma chave própria com a lista de torres que pode ver (`"*"` = todas, para gerência/TI). Um supervisor pode ver mais de uma torre.
5. **Filtro no envio:** os dados são guardados uma vez por tenant. O relay só entrega a cada supervisor os eventos das torres dele (telemetria, auditoria de chamadas, estado inicial, feedback de comandos e status offline). Vários supervisores na mesma torre recebem o mesmo evento, sem duplicar dados.
6. **Comandos:** o supervisor só consegue comandar PAs das suas torres. Mesmo `agentId` em torres diferentes não colide.
7. **In-Call Lock** e demais regras de segurança não mudam.

Tenants sem `towers` continuam no comportamento legado (tenant inteiro visível, sem chave).

## Configuração

Definida por variável de ambiente no Railway (`TENANTS_CONFIG_JSON`), para não guardar chaves no repositório:

```json
{
  "BPO-ORION-TESTE": {
    "name": "Orion BPO (teste)", "plan": "Enterprise", "maxAgents": 2500, "active": true,
    "towers": {
      "FRAUDES":    { "name": "Torre Fraudes",    "agentKey": "<chave-aleatoria-longa>" },
      "EMPRESTIMO": { "name": "Torre Empréstimo", "agentKey": "<chave-aleatoria-longa>" }
    },
    "supervisors": {
      "<chave-sup-1>": { "name": "Sup Fraudes", "towers": ["FRAUDES"] },
      "<chave-sup-2>": { "name": "Gerência",    "towers": "*" }
    }
  }
}
```

- Gere chaves com 24+ bytes aleatórios (ex.: `openssl rand -hex 24`).
- **Extensão (GPO/Intune, `chrome.storage.managed`):** `tenantKey`, `operationKey` (e opcionalmente `relayServer`).
- **Console do supervisor:** abrir `/app?tenant=<tenantKey>&key=<chave-do-supervisor>`; a chave é guardada só na sessão do navegador.

## Códigos de erro

- `4001`: tenant inválido. `4003`: chave de operação/supervisor inválida ou ausente (tenant com torres).

## Cobrança

Por PA monitorada (única, mesmo que vários supervisores a vejam), com supervisores ilimitados. Torres do mesmo cliente somam no mesmo contrato e na mesma faixa de volume.

## Teste

`cd 01_Cloud_Relay_Backend && npm install && node test_towers_e2e.js` sobe um relay local, cria uma org fictícia com 4 torres (Fraudes, Empréstimo, Cartões, Cobrança), 8 PAs (com `agentId` repetido entre torres) e 3 supervisores, e verifica isolamento de telemetria, auditoria, comandos, estado inicial, feedback, offline, chaves inválidas e o tenant legado.

## Próximo passo (fase 2)

Sincronizar torres automaticamente com filas/grupos/divisões do Genesys Cloud por credencial somente leitura do cliente, em vez de chaves por GPO.
