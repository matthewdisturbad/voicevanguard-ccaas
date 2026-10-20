# Contrato de Tratamento de Dados Pessoais (DPA) — VoiceVanguard CCaaS

> **MINUTA para revisão do jurídico. Não é parecer jurídico.**

Campos entre [COLCHETES] devem ser completados. Este texto descreve o que o código do produto faz hoje; não promete certificações nem conformidade plena.

---

## Partes

- **CONTROLADOR:** [RAZÃO SOCIAL DO CLIENTE], CNPJ [CNPJ], endereço [ENDEREÇO], representada por [REPRESENTANTE LEGAL] ("**Cliente**").
- **OPERADORA:** TrustCo Technologies, CNPJ [CNPJ DA TRUSTCO], endereço [ENDEREÇO DA TRUSTCO], Brasília/DF, representada por [REPRESENTANTE LEGAL DA TRUSTCO] ("**TrustCo**").

Vinculado ao contrato principal nº [Nº DO CONTRATO], de [DATA] ("**Contrato Principal**"). Em caso de conflito sobre proteção de dados, vale este DPA.

## 1. Objeto

Regular o tratamento de dados pessoais pela TrustCo, em nome do Cliente, na prestação do serviço **VoiceVanguard CCaaS** (observabilidade de qualidade de voz WebRTC e saúde de estações de atendimento), nos termos da Lei nº 13.709/2018 (LGPD).

## 2. Papéis

O Cliente é **controlador**; a TrustCo é **operadora** e trata dados somente conforme as instruções documentadas do Cliente (este DPA, o Contrato Principal e a configuração do serviço). Se a TrustCo passar a tratar dados para finalidade própria, será controladora para aquela finalidade [A VALIDAR PELO JURÍDICO, ex.: métricas agregadas anonimizadas do produto].

## 3. Finalidade

Medir e diagnosticar a qualidade técnica de chamadas de voz, isolar causas (rede doméstica, estação, plataforma), verificar a prontidão da estação no início do turno e, se o Cliente acionar, executar limpeza de cache do navegador após a chamada. Base legal do Cliente: [A VALIDAR PELO CLIENTE]. Finalidade adicional: [COMPLETAR, SE HOUVER].

## 4. Categorias de dados e de titulares

**Titulares:** operadores/agentes do Cliente (empregados, terceirizados ou prestadores) e supervisores com acesso ao console. Não se pretende tratar dados dos clientes finais atendidos.

**Dados tratados (conforme o código atual):**

| Categoria | Dados |
|---|---|
| Identificação | Nome do operador (campo configurável; padrão "Operador"), identificador da estação/agentId, torre (operação), nome do supervisor (configurado pelo Cliente) |
| Chamada | ID da conversa/contato (ConversationId/ContactId), início, fim, duração, plataforma |
| Qualidade | Jitter, RTT, perda de pacotes, MOS estimado (aproximação baseada na ITU-T G.107), protocolo, classificação e causa provável |
| Equipamento e rede | Tipo de rede (cabo, Wi-Fi etc.), faixa de estresse de CPU, núcleos e memória aproximada (pré-check) |
| Incidentes de áudio | Códigos (sem áudio recebido/enviado, microfone desconectado/mudo), contagem de trocas de dispositivo |
| Pré-check e APIs | Resultado e medições do pré-check; latência de APIs agregada **por hostname** (sem URL, caminho, query, cabeçalhos ou corpo) |
| Metadados | Hostname da página de atendimento, data/hora de recebimento, IP de origem em memória para limitação de tentativas de acesso e em registros de operação do provedor [A CONFIRMAR COM O PROVEDOR] |

**Não tratados:** áudio, transcrição, conteúdo de conversas, dados de cartão, dados de clientes finais. Dados sensíveis (LGPD art. 5º, II) não são objeto deste tratamento; o Cliente deve evitar inseri-los em campos livres como nome do operador.

## 5. Instruções do Cliente

A TrustCo tratará dados apenas conforme este DPA e instruções escritas do Cliente, e avisará se considerar que uma instrução viola a lei. O Cliente é responsável por: definir quem recebe as chaves de agente e de supervisor; informar os agentes (transparência); manter base legal, política interna e eventuais obrigações trabalhistas; e não inserir dados indevidos nos campos configuráveis.

## 6. Confidencialidade

A TrustCo manterá sigilo e limitará o acesso a pessoas autorizadas que precisem dos dados para prestar o serviço, vinculadas a dever de confidencialidade [COMPLETAR: instrumento, ex.: termo de confidencialidade]. A obrigação subsiste por [PRAZO] após o fim do contrato.

## 7. Medidas de segurança

Medidas **existentes hoje** no serviço:

- **Autenticação por chave por tenant**, com chaves de **agente** e de **supervisor** distintas; o papel é definido pelo servidor a partir da chave, não pelo cliente. Chaves são guardadas por variável de ambiente (nunca no código) e comparadas por hash.
- **Torres (operações):** a chave de agente da torre define a que operação a estação pertence; cada supervisor só recebe eventos e comanda estações das torres liberadas para ele.
- **Isolamento entre clientes (tenants):** eventos e histórico são separados por tenant e entregues somente a supervisores do mesmo tenant.
- **Limitação de tentativas** de autenticação por IP, limite de tamanho de mensagem (64 KB), limite de agentes por plano, limite de pings do pré-check, validação e truncamento de todos os campos recebidos, e escape de dados na interface do console.
- **Cabeçalhos de segurança HTTP** (CSP, HSTS, X-Frame-Options, entre outros).
- **TLS (HTTPS/WSS)** terminado no proxy do provedor de hospedagem (Railway); o tráfego entre o proxy e a aplicação segue a rede interna do provedor [A CONFIRMAR].
- **Comandos remotos limitados** a uma lista fechada (limpeza de cache) e **In-Call Lock**: o comando é adiado enquanto há chamada ativa.
- **Persistência** do histórico em volume dedicado, com gravação atômica.
- **Minimização:** nenhum áudio ou conteúdo; latência de API só por hostname.

**Limitações que o Cliente deve conhecer (transparência):**

- Os **arquivos de histórico de chamadas não são criptografados em repouso pela aplicação** (arquivos JSON no volume). A proteção depende do provedor de hospedagem [A CONFIRMAR O QUE O PROVEDOR OFERECE PARA VOLUMES].
- Não há, no código atual, trilha de auditoria de acessos de supervisores ao console além de registros simples de operação; não há exclusão ou exportação individual automatizada por titular (feita manualmente sob solicitação).
- O estado em tempo real fica em memória de uma única instância; não há alta disponibilidade ou backup automático garantido pelo produto [A CONFIRMAR].
- Não há alegação de certificação (ISO 27001, SOC 2 ou similar) nem de conformidade plena. Avaliações formais estão [PENDENTES / COMPLETAR].

## 8. Suboperadores

Autorização [GERAL / ESPECÍFICA — A DEFINIR]. Suboperadores atuais:

| Suboperador | Função | Localização | Observação |
|---|---|---|---|
| Railway | Hospedagem da aplicação e do volume | [COMPLETAR: região do projeto] | Confirmado no projeto |
| [DOMÍNIO/DNS/CDN, SE HOUVER] | [FUNÇÃO] | [LOCAL] | [VERIFICAR] |
| [OUTROS] | [FUNÇÃO] | [LOCAL] | [VERIFICAR] |

A TrustCo informará o Cliente sobre inclusão ou troca com [PRAZO] dias de antecedência; o Cliente poderá se opor por motivo razoável. A TrustCo responde pelos suboperadores nos limites do Contrato Principal.

## 9. Transferência internacional

[A COMPLETAR APÓS VERIFICAR A REGIÃO DE HOSPEDAGEM DO RAILWAY E DOS DEMAIS SUBOPERADORES]. Se houver transferência para fora do Brasil, aplicar-se-á o mecanismo do art. 33 da LGPD e a regulamentação da ANPD: [COMPLETAR, ex.: cláusulas-padrão contratuais / outro].

## 10. Incidentes de segurança

A TrustCo notificará o Cliente em até [PRAZO, ex.: 48 horas] após tomar ciência de incidente que afete dados pessoais, informando, quando disponível: natureza do incidente, dados e titulares envolvidos, medidas adotadas e riscos. Contato do Cliente: [E-MAIL/TELEFONE]. Contato da TrustCo: contato@trustco.pro. A comunicação à ANPD e aos titulares cabe ao Cliente (controlador), com apoio da TrustCo.

## 11. Direitos dos titulares

A TrustCo auxiliará o Cliente, em prazo razoável [PRAZO], a atender solicitações de titulares (acesso, correção, eliminação etc.), e encaminhará ao Cliente as que receber diretamente. O Cliente designa como encarregado: [NOME E CONTATO DO DPO].

## 12. Auditoria

O Cliente pode solicitar informações para comprovar o cumprimento deste DPA e, mediante aviso prévio de [PRAZO] dias, auditoria razoável (preferencialmente documental e por questionário), em horário comercial, sob confidencialidade e com custos de [A DEFINIR]. Fica excluído acesso a dados de outros clientes.

## 13. Retenção, devolução e eliminação

- **Retenção atual:** histórico de chamadas limitado às **5.000 chamadas mais recentes por cliente (padrão; configurável de 500 a 50.000)**; estado em tempo real de estações removido após **24 horas** sem atividade. Registros operacionais do provedor seguem as políticas dele [CONFIRMAR].
- Ao término do contrato, em até [PRAZO] dias a TrustCo, à escolha do Cliente, **devolverá** os dados em formato [FORMATO] e/ou **eliminará** os dados e confirmará por escrito, salvo guarda exigida por lei. Cópias em backups do provedor serão eliminadas conforme o ciclo dele [CONFIRMAR].
- Prazo de retenção diferente do atual, se o Cliente quiser: [COMPLETAR].

## 14. Responsabilidades

Cada parte responde pelos danos que causar nos termos da LGPD (arts. 42 a 45) e do Contrato Principal. A TrustCo responde por descumprimento das obrigações da LGPD ou das instruções lícitas do Cliente; o Cliente responde pela legalidade das instruções, pela base legal e pela transparência perante os titulares. Limitação de responsabilidade: [A DEFINIR PELO JURÍDICO, conforme o Contrato Principal].

## 15. Vigência e foro

Vigora enquanto a TrustCo tratar dados pessoais do Cliente. Foro: [FORO/COMARCA].

---

Local e data: [LOCAL], [DATA]

Pelo Cliente: ______________________ [NOME / CARGO]  
Pela TrustCo Technologies: ______________________ [NOME / CARGO]  
Testemunhas: [NOME 1] / [NOME 2]
