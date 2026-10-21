# Roadmap — apenas planejamento

> **Nada neste documento está implementado.** Não deve aparecer em material comercial, proposta ou landing até existir e estar testado.

## Integração com ITSM e canais de alerta
Princípio: começar pelo mais barato e só construir conectores nativos sob demanda contratada.

| Etapa | O que é | Esforço estimado | Gatilho |
|---|---|---|---|
| 1. Webhook genérico de saída (**implementado**, ver `docs/WEBHOOK_ALERTAS.md`; inclui alerta de MOS em chamada ativa) | `POST` JSON assinado (HMAC) quando o MOS cai, uma chamada é `CRÍTICA` ou há incidente de áudio; com retentativas e fila simples | 1 a 3 dias | Algum cliente pedir alertas |
| 2. Ponte por automação do cliente | Documentar como ligar o webhook a Power Automate, Zapier, n8n, Teams e Slack | 1 dia (docs) | Após a etapa 1 |
| 3. Conector ServiceNow / Jira | OAuth, mapeamento de campos por cliente, tabelas/fluxos customizados, deduplicação, suporte contínuo | semanas por ferramenta | Cliente pagante exigir em contrato e financiar |

Por que não começar pelos conectores: o custo está em manter e dar suporte a cada instalação (campos e fluxos mudam por cliente), não em chamar a API.

## Outras funções candidatas
- **Causa raiz por frota (estação × operadora × plataforma) — implementada no console como leitura "isolado x grupo x amplo" por rede/região/plataforma (`public/fleet.js`); falta o recorte por operadora de internet (dado que não coletamos) e histórico:** comparar, no mesmo instante, agentes de operadoras e sites diferentes; se só um piora é a estação, se todos pioram é a plataforma ou a região. Gera evidência para contestar SLA. Exige agregação anonimizada e volume mínimo de agentes.
- **Impacto em TMA/CSAT (parcial: `GET /api/calls.csv` entrega o MOS por `interactionId` para o cliente cruzar no BI, ver `docs/EXPORTACAO_CHAMADAS.md`; a integração direta com as APIs de analytics segue pendente e depende de credenciais do cliente):** cruzar MOS com TMA, transferências, abandono e CSAT pelas APIs de analytics do Genesys e da Amazon. Depende de credenciais e permissões do cliente.
- **Camadas de causa para teletrabalho (VPN e DNS) — não implementado de propósito:** o navegador não expõe se há VPN nem o tempo de resolução de DNS; qualquer rótulo "VPN" ou "DNS" seria palpite. O que existe hoje e é medido: o pré-check compara a latência até o relay com a latência até a região do Genesys (`docs/PRECHECK.md`); se a segunda é bem pior e a primeira está boa, o caminho até o Genesys é o suspeito (VPN, proxy ou roteamento do provedor), e a orientação do item já cita VPN. Antes de rotular, seria preciso medir com cliente piloto. Descrição original: além de Wi-Fi, indicar se o problema parece vir de VPN ou de resolução de nomes. O navegador só enxerga latência e perda até o relay, então seria inferência; avaliar o que a extensão consegue medir sem coletar mais dados pessoais.
- **Teste por região de mídia (implementado como aproximação pela API da região; ver `docs/PRECHECK.md`; a mídia real não é medida):** pré-check que mede a latência até a região de mídia do Genesys do cliente, além do relay. Exige conhecer a região por tenant.
- **Runbook guiado e ranking de headsets:** exigiria ler nomes de dispositivos (hoje deliberadamente não lidos); avaliar impacto de privacidade antes.
- **Tempo de indisponibilidade técnica em R$:** depende de integração de presença do CCaaS.

## Infraestrutura, Disponibilidade e Migração de Nuvem (Railway → AWS)

Princípio: manter custo e complexidade mínimos durante a fase de validação/lojas, migrando para infraestrutura enterprise dedicada assim que houver contrato comercial pagante com exigência de SLA.

| Fase | Provedor / Região | Topologia | Latência Brasil | SLA / Resiliência | Gatilho de Adoção |
|---|---|---|---|---|---|
| **1. Validação & Pilotos (Atual)** | **Railway** (EUA / SFO) | 1 réplica, volume em disco, SQLite/JSON local | ~130–180 ms | Best-effort (nó único, sem multi-AZ) | **Em produção hoje**; atende homologações nas lojas e testes com clientes. |
| **2. Produção Enterprise** | **AWS** (São Paulo — `sa-east-1`) | ECS Fargate Multi-AZ (2+ réplicas) + ALB + Redis (ElastiCache) + Postgres (RDS) | **10–25 ms** | **99,99%** (tolerância a queda de datacenter físico) | Primeiro contrato comercial de BPO (>250 PAs) ou exigência de SLA/compliance em contrato. |

### Racional da escolha por AWS sobre outras opções:
1. **Latência de rede no Brasil:** agentes em home office e operações de EPS/Caixa no Brasil ficam a 10–25 ms do servidor em São Paulo (`sa-east-1`), contra 150 ms+ em servidores nos EUA. Latência local baixa é essencial para não distorcer as métricas de RTT e MOS da chamada.
2. **Redundância física Multi-AZ:** o Application Load Balancer (ALB) da AWS distribui as conexões WebSockets entre containers em zonas de disponibilidade fisicamente separadas. Se um datacenter sofrer pane, o outro assume imediatamente.
3. **Alinhamento com AWS Marketplace e FTR:** o produto já possui aprovação no catálogo do AWS Marketplace e opera com Amazon Connect; hospedar nativamente na AWS viabiliza certificação AWS FTR (*Foundational Technical Review*), faturamento integrado e segurança via AWS PrivateLink/VPC Peering.
4. **Por que não Supabase como hospedeiro:** o Supabase é um BaaS (banco Postgres + Edge Functions serverless efêmeras). Ele não suporta processos contínuos de longa duração com conexões WebSocket abertas 24/7 com milhares de agentes transmitindo telemetria em tempo real. Pode no máximo atuar como banco de dados externo, mas não como servidor da aplicação.

## Restrições que valem para tudo
- Posicionamento: **saúde técnica da estação**, não vigilância do operador. Sem captura de tela, produtividade ou conteúdo.
- Anonimizar o operador por padrão em análises agregadas; definir retenção e base legal; mostrar ao operador o que é coletado.
- O navegador não expõe sinal de Wi-Fi (RSSI/SSID): qualquer afirmação sobre Wi-Fi é inferência.
