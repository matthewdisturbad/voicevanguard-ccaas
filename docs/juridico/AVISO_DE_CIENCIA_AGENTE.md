# Aviso de Ciência e Transparência ao Agente — VoiceVanguard CCaaS

> **MINUTA para revisão do jurídico. Não é parecer jurídico.**

Campos entre [COLCHETES] devem ser completados pelo cliente (empregador/contratante) antes do uso.

---

## 1. Para que serve este aviso

O [NOME DO CLIENTE], CNPJ [CNPJ DO CLIENTE] ("**Empresa**"), usa a ferramenta **VoiceVanguard CCaaS**, fornecida pela TrustCo Technologies ("**TrustCo**"), para acompanhar a **qualidade técnica** das chamadas de voz e o estado da sua estação de trabalho (principalmente em home office). Este aviso explica, em linguagem simples, o que é coletado, para quê, quem vê e por quanto tempo.

## 2. Finalidade (para que usamos)

Finalidade técnica e operacional: identificar se um problema de voz (chiado, corte, áudio mudo, atraso) vem da rede (por exemplo, Wi-Fi residencial), da estação ou da plataforma de atendimento, e orientar a correção. Também permite verificar se a estação está pronta no início do turno e, quando autorizado pela Empresa, limpar o cache do navegador **depois** da chamada.

Finalidades adicionais definidas pela Empresa: [COMPLETAR, SE HOUVER; caso contrário "nenhuma"].

Base legal indicada pela Empresa (LGPD, art. 7º): [A VALIDAR COM O JURÍDICO DO CLIENTE, ex.: execução de contrato / legítimo interesse].

## 3. O que é coletado

A extensão do navegador, instalada pela TI da Empresa, só atua nas páginas do Genesys Cloud e do Amazon Connect e coleta:

| Dado | Exemplo / observação |
|---|---|
| Nome do operador | Conforme configurado na extensão; se não houver, aparece "Operador" |
| Identificação da estação / agente (agentId) | Código da estação (ex.: PA-XXXX) |
| Identificador da chamada (ConversationId / ContactId) | Código técnico da conversa, sem o conteúdo dela |
| Qualidade da chamada | Jitter, atraso (RTT), perda de pacotes, nota MOS estimada, protocolo, início, fim e duração |
| Tipo de rede | Cabo, Wi-Fi, 4G/5G etc., conforme informado pelo navegador |
| Estado do equipamento | Nível de carga (CPU/memória) em faixas e quantidade de núcleos/memória aproximada, no pré-check |
| Incidentes de áudio | Códigos como "sem áudio recebido", "sem áudio enviado", "microfone desconectado", "microfone mudo no sistema", e a quantidade de trocas de dispositivo |
| Pré-check de turno | Resultado (pronta / atenção / não pronta) e medições de latência, jitter e perda até o servidor do VoiceVanguard |
| Latência das APIs da plataforma de atendimento | Somente por **nome de domínio** (hostname): quantidade, média, p95, máximo e erros |
| Domínio da página de atendimento | Nome do domínio (hostname) da aba |
| Data e hora | Momento em que cada registro foi recebido |

## 4. O que NÃO é coletado

- **Nenhum áudio**: a ferramenta não grava, não escuta e não transmite a voz.
- **Nenhum conteúdo de conversa**: sem transcrição, texto de chat ou dados informados pelo cliente atendido.
- Sem dados de cartão ou dados pessoais dos clientes atendidos.
- Sem endereços completos (URL), caminhos, parâmetros, cabeçalhos ou corpo das requisições de API; apenas o nome do domínio.
- Sem nome ou modelo de microfone/fones (apenas se existe ou não um dispositivo e o estado dele).
- Sem título de aba, histórico de navegação, teclas digitadas, tela ou câmera.
- Sem monitoramento fora das páginas do Genesys Cloud / Amazon Connect.

## 5. Quem acessa

- **Supervisores e gestores da Empresa** autorizados, por meio de console protegido por chave. Cada supervisor só vê as operações ("torres") que a Empresa liberou para ele. [COMPLETAR: cargos/áreas autorizados].
- **TrustCo**, como operadora, apenas para prestar, manter e dar suporte ao serviço, conforme instruções da Empresa.
- **Suboperador de infraestrutura**: Railway (hospedagem). [COMPLETAR outros, se houver].
- Dados não são vendidos nem usados para publicidade.

## 6. Por quanto tempo

- Histórico de chamadas: guardado até as **500 chamadas mais recentes por cliente**; as mais antigas são substituídas automaticamente.
- Estado em tempo real da estação (telemetria, pré-check, latência de API): mantido em memória; estações sem atividade por **24 horas** são removidas.
- Não há exclusão automática por prazo fixo além disso. Prazo contratual diferente: [COMPLETAR, SE HOUVER].
- Cópia local na extensão: as últimas 50 chamadas ficam no navegador do próprio agente.

## 7. Uso para fins disciplinares

[CAMPO A COMPLETAR PELO CLIENTE. Informar, conforme a política interna da Empresa, se os dados do VoiceVanguard podem ou não ser usados em avaliação de desempenho ou medidas disciplinares, em quais condições e com qual garantia de contraditório. Sugestão de redação a validar: "Os dados do VoiceVanguard têm finalidade técnica e não são usados para fins disciplinares, salvo se previsto na Política [NOME DA POLÍTICA INTERNA], item [Nº], com ciência prévia do trabalhador."]

## 8. Seus direitos (LGPD, art. 18)

Você pode pedir à Empresa: confirmação de que há tratamento; acesso aos dados; correção; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei; portabilidade; informação sobre com quem os dados são compartilhados; informação sobre a possibilidade de não consentir e suas consequências; e revisão de decisões tomadas exclusivamente de forma automatizada. Os limites e prazos de atendimento serão os previstos em lei.

## 9. Canal do encarregado (DPO)

[NOME DO ENCARREGADO PELO TRATAMENTO DE DADOS DO CLIENTE] — [E-MAIL] — [TELEFONE/ENDEREÇO]

Contato da TrustCo (operadora): contato@trustco.pro. Reclamações também podem ser dirigidas à Autoridade Nacional de Proteção de Dados (ANPD).

## 10. Ciência do agente

Declaro que li este aviso e fui informado(a) sobre quais dados são coletados, a finalidade, quem acessa e por quanto tempo são mantidos. Estou ciente de que **este documento é um aviso de transparência** e [A DEFINIR COM O JURÍDICO: indicar se a assinatura representa apenas ciência ou também consentimento; o consentimento pode não ser a base legal adequada em relação de emprego].

Nome: [NOME DO AGENTE]  
Matrícula / ID: [MATRÍCULA]  
Torre / operação: [TORRE]  
Local e data: [LOCAL], [DATA]  
Assinatura: ______________________________

Versão do aviso: [VERSÃO] — Data: [DATA]
