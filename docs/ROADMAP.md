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
- **Impacto em TMA/CSAT:** cruzar MOS com TMA, transferências, abandono e CSAT pelas APIs de analytics do Genesys e da Amazon. Depende de credenciais e permissões do cliente.
- **Camadas de causa para teletrabalho (VPN e DNS):** além de Wi-Fi, indicar se o problema parece vir de VPN ou de resolução de nomes. O navegador só enxerga latência e perda até o relay, então seria inferência; avaliar o que a extensão consegue medir sem coletar mais dados pessoais.
- **Teste por região de mídia (implementado como aproximação pela API da região; ver `docs/PRECHECK.md`; a mídia real não é medida):** pré-check que mede a latência até a região de mídia do Genesys do cliente, além do relay. Exige conhecer a região por tenant.
- **Runbook guiado e ranking de headsets:** exigiria ler nomes de dispositivos (hoje deliberadamente não lidos); avaliar impacto de privacidade antes.
- **Tempo de indisponibilidade técnica em R$:** depende de integração de presença do CCaaS.

## Restrições que valem para tudo
- Posicionamento: **saúde técnica da estação**, não vigilância do operador. Sem captura de tela, produtividade ou conteúdo.
- Anonimizar o operador por padrão em análises agregadas; definir retenção e base legal; mostrar ao operador o que é coletado.
- O navegador não expõe sinal de Wi-Fi (RSSI/SSID): qualquer afirmação sobre Wi-Fi é inferência.
