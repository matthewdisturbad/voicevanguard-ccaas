# Adendo — fluxos de dados adicionados após as minutas

> **Rascunho técnico para revisão jurídica. Não é parecer.** Descreve o que o software faz hoje, para o jurídico incorporar à Política de Privacidade V2, ao DPA e ao RIPD. Seguimos as diretrizes da LGPD/GDPR; este documento não afirma certificação.

| Fluxo | Dados envolvidos | Destino | Controles no código |
|---|---|---|---|
| **Webhook de alerta** (eventos CALL_CRITICAL, AUDIO_INCIDENT, MOS_DEGRADED) | Tenant, torre, estação, ID da chamada, MOS, RTT, jitter, perda, horário. **Sem nome do operador, sem áudio, sem texto.** | URL https escolhida pelo cliente (suboperador do próprio cliente) | Assinatura HMAC-SHA256 com timestamp; bloqueio de destinos internos (SSRF); 3 reentregas; fila só em memória (alertas se perdem em reinício) |
| **Exportação CSV** (`GET /api/calls.csv`) | Resumo de chamadas: estação, torre, plataforma, MOS, métricas de rede, horários. **Sem coluna de operador.** | Quem tem chave de supervisor do tenant | Chave só em cabeçalho; escopo por torre; neutralização de fórmulas; últimas 5.000 chamadas (padrão; configurável) |
| **Latência até a região Genesys** (pré-check) | Tempo de resposta (ms) de 5 requisições HTTPS à API pública da região do tenant, feitas pelo navegador do operador, sem cookies/credenciais | API pública da Genesys (a partir do navegador) | `credentials:'omit'`; região validada por regex; não lê conteúdo de conversas |
| **Credencial por estação** | ID da estação, tenant, torre, validade; segredo derivado por HMAC | Armazenada no navegador do operador (extensão) e lista de estações cadastradas em `DATA_DIR/enrolled_stations.json` | Expira (padrão 90 dias), revogável por lista/época; limite de estações por tenant |
| **Leitura de causa por frota** | Agregação em memória no navegador do supervisor, a partir da telemetria já recebida | Nenhum envio externo | Exige ≥5 estações em chamada |

## Pontos para a decisão do jurídico
1. Webhook e CSV tornam o cliente (controlador) destinatário de dados de estação; confirmar que o DPA cobre o repasse e que o cliente responde pelo destino do webhook.
2. A estação (hostname/ID) pode identificar indiretamente o operador quando há alocação fixa; tratar como dado pessoal no RIPD.
3. A medição de latência faz o navegador do operador contatar a Genesys; incluir no Aviso de Ciência do Agente.
4. Retenção: histórico em JSON no volume (últimas 5.000 chamadas (padrão; configurável)) e cadastro de estações; definir prazo e rotina de descarte.
5. Região de hospedagem Railway e suboperadores: continua **[A COMPLETAR]** nas minutas, pois depende de confirmação do dono.
