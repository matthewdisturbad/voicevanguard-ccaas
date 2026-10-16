# VoiceVanguard CCaaS &bull; Proposta Oficial de Submissão e Parceria
## Genesys AppFoundry &bull; Technology Partner Program (ISV)

---

### 1. Resumo Executivo da Solução (Listing Profile)

* **Nome Comercial do Produto:** VoiceVanguard CCaaS &bull; Universal WebRTC QoE & Agent Health Monitor
* **Categoria Principal no AppFoundry:** Voice & Media Observability / Agent Assist & Productivity / Workforce Optimization (WFO)
* **Público-Alvo:** Contact Centers Enterprise, BPOs (Business Process Outsourcers), Operações em Home Office / Híbridas e Equipes de Sustentação N2/N3.
* **Modelo de Integração:** Genesys Cloud Client App Integration (Iframe nativo no Supervisor) + Chromium Extension (Manifest V3 corporativo) + Cloud Multi-Tenant Hub.
* **Proposta de Valor em Uma Linha (Tagline):**
  > *"Reduza em até 80% falsos chamados de suporte e identifique instantaneamente a causa raiz de áudio robótico, Wi-Fi residencial, concorrência de abas e falhas de microfone antes que virem queixas de clientes."*

---

### 2. O Problema de Negócio (The Customer Pain Point)

1. **A "Guerra das Falsas Culpas":** Operadores remotos sofrem com voz metálica, delay e quedas de chamadas e abrem chamados queixando-se da plataforma Genesys Cloud. No entanto, mais de 75% dos problemas decorrem de fatores locais:
   * Uso indevido de Wi-Fi doméstico com perda de pacotes e jitter elevado.
   * Concorrência de abas abertas da Genesys no mesmo navegador.
   * Fones USB genéricos, travamento de driver de áudio ou microfone mutado no Windows.
2. **Falta de Correlação por Chamada:** Quando o cliente final reclama de um atendimento ruim, os gestores levam horas cruzando logs para descobrir qual era a qualidade exata de rede daquela ligação específica.
3. **Custo Operacional de Sustentação:** Cada falso chamado N1/N2 custa em média de R$ 25 a R$ 50 em horas técnicas, sobrecarregando a equipe de TI da contratante.

---

### 3. A Solução Técnica e Diferenciais Competitivos

* **Auditoria de Interação por ConversationId:** A extensão intercepta chamadas silenciosamente e correlaciona as métricas de rede (`RTCPeerConnection`) diretamente ao identificador unívoco da ligação Genesys (`ConversationId`), gravando início, término e duração.
* **Métrica Científica de Qualidade de Voz (ITU-T G.107 MOS):** Cálculo em tempo real do Score MOS (Mean Opinion Score de 1.0 a 4.5) baseado em Latência Efetiva, Pico de Jitter e Taxa de Perda de Pacotes, classificando em *Excelente*, *Boa*, *Degradada* ou *Crítica*.
* **Trava Operacional Anti-Queda (Call-in-Progress Lock):** Permite limpeza cirúrgica de cache estático sem deslogar o operador e com bloqueio inteligente que impede execuções durante chamadas ativas.
* **Zero-Touch Enterprise Deployment:** Compatível com implantação corporativa silenciosa via Microsoft Intune / Active Directory GPO (`chrome.storage.managed`).

---

### 4. Modelo de Comercialização & Precificação (AppFoundry Pricing)

O produto adota o modelo de cobrança recorrente faturado diretamente na conta Genesys do cliente (**Genesys Cloud Invoicing Integration**):

| Plano | Faixa de Posições (PAs) | Preço Mensal por Usuário (PUPM) | Faturamento Estimado (Exemplo) |
| :--- | :--- | :--- | :--- |
| **Starter / Team** | Até 250 PAs | **$6,50 USD** (~R$ 35,00) / PA / mês | ~$1.625 USD / mês |
| **Professional** | 251 a 1.500 PAs | **$5,00 USD** (~R$ 27,00) / PA / mês | ~$5.000 USD / mês (1.000 PAs) |
| **Enterprise / BPO** | Acima de 1.500 PAs | **$4,00 USD** (~R$ 22,00) / PA / mês | ~$20.000 USD / mês (5.000 PAs) |

* **Período de Teste Gratuito (Free Trial):** 14 dias para até 25 PAs da organização.
* **Divisão de Receita (Take-Rate):** Genesys retém entre 15% e 20%; ISV (VoiceVanguard) recebe entre 80% e 85% líquido.

---

### 5. Arquitetura de Segurança, Privacidade e LGPD / GDPR

* **Zero Escuta de Áudio:** O software **NÃO grava nem trafega áudio** das ligações. Ele extrai exclusivamente métricas estatísticas e numéricas de rede e performance do navegador.
* **Isolamento Multi-Tenant:** Cada cliente possui um identificador criptográfico (`TenantKey`) isolado; dados de uma BPO nunca são acessíveis por outra.
* **Tráfego Criptografado:** 100% das comunicações trafegam via HTTPS / WSS (WebSockets com TLS 1.3 na porta 443).
* **Conformidade de Cookies:** A limpeza cirúrgica de cache preserva tokens de sessão e autenticação do Genesys Cloud.

---

### 6. Roteiro de Homologação e Submissão no AppFoundry

```
Etapa 1: Cadastro no Genesys Technology Partner Program (TPP)
        • Criar conta de parceiro em: partners.genesys.com
        • Assinatura do Technology Partner Agreement (ISV).

Etapa 2: Acesso à Organização Sandbox da Genesys
        • A Genesys disponibiliza um ambiente de testes Genesys Cloud dedicado.
        • Validação da extensão e do aplicativo Iframe embedded.

Etapa 3: Submissão de Documentação Técnica e Segurança
        • Preenchimento do Questionário de Segurança da Informação da Genesys (SecOps).
        • Envio da Política de Privacidade e Guia do Usuário.

Etapa 4: Publicação Oficial (Listing Go-Live)
        • Aprovação comercial e publicação no catálogo oficial do AppFoundry.
        • Disponibilização para faturamento direto na fatura Genesys dos clientes.
```
