# Política de Privacidade — VoiceVanguard CCaaS (versão 2)

> **MINUTA para revisão do jurídico. Não é parecer jurídico.**

Proposta de texto para a página `/privacy`. Substitui o rascunho atual (`01_Cloud_Relay_Backend/public/privacy.html`), que não foi alterado. Campos entre [COLCHETES] devem ser completados ou validados antes de publicar.

---

**Versão:** 2 (minuta) — **Vigência:** [DATA] — **Última atualização:** [DATA]

## 1. Quem somos e nossos papéis

O VoiceVanguard CCaaS é um serviço da **TrustCo Technologies**, CNPJ [CNPJ], [ENDEREÇO], Brasília/DF.

- **Cliente (empresa que contrata o VoiceVanguard):** atua como **controlador** dos dados dos seus operadores/agentes e decide para que e como os dados são usados.
- **TrustCo:** atua como **operadora**, tratando os dados em nome e conforme as instruções do Cliente, nos termos do contrato de tratamento de dados (DPA).
- A TrustCo atua como **controladora** apenas para dados que trata por conta própria, como contatos comerciais e do site [A VALIDAR PELO JURÍDICO].

Se você é operador(a) ou agente, o responsável pelo tratamento dos seus dados é a empresa que o(a) contratou e instalou a extensão. Para exercer direitos, procure primeiro o encarregado dela.

## 2. O que coletamos

Por meio da extensão de navegador (instalada pelo Cliente) em páginas do Genesys Cloud e do Amazon Connect:

- **Identificação:** nome do operador (se configurado), identificador da estação/agente, torre (operação) a que pertence.
- **Chamada:** identificador da conversa/contato, início, fim e duração.
- **Qualidade técnica:** jitter, atraso (RTT), perda de pacotes, nota MOS estimada, protocolo.
- **Equipamento e rede:** tipo de rede (cabo, Wi-Fi etc.), faixa de uso de CPU, quantidade de núcleos e memória aproximada.
- **Incidentes de áudio:** códigos (sem áudio recebido ou enviado, microfone desconectado ou mudo no sistema) e contagem de trocas de dispositivo.
- **Pré-check de turno:** resultado e medições até o nosso servidor.
- **Latência das APIs da plataforma de atendimento:** somente por nome de domínio (hostname), em estatísticas (quantidade, média, p95, máximo, erros).
- **Dados técnicos de acesso ao console:** chave de acesso (armazenada de forma protegida no servidor por hash), endereço IP e data/hora, usados para segurança e limitação de tentativas.

Mais dados podem passar por nossos fornecedores de infraestrutura (por exemplo, registros de acesso da hospedagem) [A CONFIRMAR].

## 3. O que NÃO coletamos

- **Áudio:** nunca gravamos, ouvimos nem transmitimos a voz.
- Transcrições ou conteúdo de conversas e de chats.
- Dados de cartão de pagamento ou dados pessoais dos clientes atendidos.
- URLs completas, caminhos, parâmetros, cabeçalhos ou corpo de requisições de API.
- Nome ou modelo de microfone e fones; título de abas; histórico de navegação; tela; teclado; câmera.

## 4. Para que usamos (finalidades)

- Medir e diagnosticar a qualidade técnica das chamadas e identificar se o problema vem da rede, da estação ou da plataforma.
- Verificar a prontidão da estação no início do turno.
- Exibir os dados ao supervisor autorizado pelo Cliente, no console.
- Executar, quando solicitado pelo Cliente, a limpeza de cache do navegador após a chamada (nunca durante).
- Garantir segurança, prevenir abuso e manter o serviço.

Não usamos os dados para publicidade nem os vendemos. O uso dos dados pelo Cliente em avaliação ou medidas disciplinares depende da política interna dele e está fora do controle da TrustCo.

## 5. Bases legais

As bases legais (LGPD, art. 7º) são definidas pelo controlador. Sugestão **a validar pelo jurídico**:

| Tratamento | Base legal sugerida |
|---|---|
| Telemetria dos operadores (pelo Cliente) | [A VALIDAR: execução de contrato / legítimo interesse do Cliente] |
| Dados de acesso e segurança do console | [A VALIDAR: legítimo interesse / prevenção à fraude e segurança] |
| Contatos comerciais e do site (TrustCo como controladora) | [A VALIDAR: execução de procedimentos preliminares de contrato / legítimo interesse] |

## 6. Quem tem acesso

- Supervisores e gestores do Cliente autorizados, limitados às torres que o Cliente liberar.
- Equipe da TrustCo, apenas para operar, manter e dar suporte, sob dever de confidencialidade.
- Suboperadores: **Railway** (hospedagem). [OUTROS SUBOPERADORES: A VERIFICAR E LISTAR]
- Autoridades, quando exigido por lei.

Cada Cliente é isolado: supervisores de um Cliente não acessam dados de outro.

## 7. Transferência internacional

[A COMPLETAR após verificar a região de hospedagem e dos demais suboperadores. Se houver transferência para fora do Brasil, informar país(es) e o mecanismo adotado.]

## 8. Por quanto tempo guardamos

- **Histórico de chamadas:** as **5.000 chamadas mais recentes por Cliente (padrão; configurável de 500 a 50.000)**; as mais antigas são substituídas automaticamente.
- **Estado em tempo real das estações** (telemetria, pré-check, latência de API): removido após **24 horas** sem atividade.
- **Navegador do operador:** a extensão guarda localmente as últimas 50 chamadas e configurações.
- Dados são eliminados ou devolvidos ao Cliente ao fim do contrato, conforme o DPA [PRAZO].
- Prazo adicional ou diferente definido pelo Cliente: [COMPLETAR].

## 9. Segurança

Adotamos, entre outras, as seguintes medidas:

- Acesso por chaves distintas para agentes e supervisores, com o papel definido pelo servidor.
- Isolamento por cliente e por torre (operação).
- Limitação de tentativas de acesso, validação dos dados recebidos e escape dos dados no console.
- Comunicação por HTTPS/WSS (TLS), terminado no proxy do provedor de hospedagem.
- Cabeçalhos de segurança HTTP.
- Comandos remotos restritos a uma lista fechada e adiados durante chamadas ativas.

Limitações: os arquivos de histórico **não são criptografados em repouso pela aplicação**; a proteção do armazenamento depende do provedor de hospedagem. Nenhuma medida elimina todo risco. Esta política **não** representa certificação ou conformidade plena com qualquer norma; avaliações formais estão [PENDENTES / COMPLETAR].

## 10. Seus direitos

Nos termos do art. 18 da LGPD, o titular pode solicitar: confirmação do tratamento; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos; portabilidade; informação sobre compartilhamento; informação sobre a possibilidade de não consentir e suas consequências; revogação do consentimento, quando aplicável; e revisão de decisões automatizadas.

**Como exercer:** se você é operador(a), contate o encarregado do seu empregador/contratante [CONTATO DO DPO DO CLIENTE]. Também pode escrever para **contato@trustco.pro**; encaminharemos ao controlador quando a TrustCo for apenas operadora. Você pode ainda peticionar à Autoridade Nacional de Proteção de Dados (ANPD).

## 11. Encarregado (DPO) da TrustCo

[NOME DO ENCARREGADO DA TRUSTCO] — contato@trustco.pro

## 12. Cookies e site

O console e a landing page [USAM / NÃO USAM — A CONFIRMAR] cookies; fontes de terceiros podem ser carregadas (Google Fonts) [A CONFIRMAR]. Detalhes: [COMPLETAR].

## 13. Crianças e adolescentes

O serviço é destinado a profissionais; não trata intencionalmente dados de crianças. Adolescentes (aprendizes/estagiários) devem ser tratados conforme orientação do Cliente [A VALIDAR].

## 14. Alterações

Esta política pode ser atualizada. A versão vigente e a data estarão nesta página; mudanças relevantes serão comunicadas aos Clientes.

## 15. Contato

TrustCo Technologies — contato@trustco.pro — [ENDEREÇO]
