# Guia Oficial & Prático: Cadastro no AWS Partner Network (APN) & Amazon Connect Ready

> **Plataforma:** Amazon Web Services (AWS)  
> **Produto:** VoiceVanguard CCaaS  
> **Fabricante:** TrustCo Technologies ([trustco.pro](https://trustco.pro))  
> **Status:** Pronto para submissão imediata (Self-Service)

---

## 1. Visão Geral da Oportunidade AWS
Ao cadastrar o **VoiceVanguard** no ecossistema da AWS:
1. **AWS Marketplace:** Clientes corporativos do Amazon Connect (como bancos, fintechs e grandes varejistas) compram seu software debitando diretamente do orçamento anual que já possuem com a AWS (*AWS Enterprise Discount Program - EDP*).
2. **Selo Amazon Connect Ready:** Você passa a figurar na página oficial da AWS como solução homologada, e os próprios arquitetos de soluções e gerentes de contas da AWS recomendam seu produto em projetos de migração.
3. **Sem Exclusividade:** A AWS não exige exclusividade; você pode ser parceiro da Genesys e da AWS simultaneamente.

---

## 2. Passo a Passo de Cadastro no AWS Partner Central

### Passo 1: Acesso ao Portal de Parceiros da AWS
Acesse o portal oficial do **AWS Partner Central**:
👉 **[https://partnercentral.awspartner.com](https://partnercentral.awspartner.com)**  
*(ou via [aws.amazon.com/partners](https://aws.amazon.com/partners))*

* Clique em **"Join the AWS Partner Network"** (ou *"Cadastre-se"*).
* Use uma conta AWS ou crie um login vinculado ao seu e-mail corporativo:  
  `david@trustco.pro` (ou `contato@trustco.pro`). **Nunca use Gmail ou e-mail pessoal.**

---

### Passo 2: Seleção da Trilha de Parceiro (Partner Path)
A AWS divide parceiros em duas trilhas principais:
* ❌ *Services Path:* Para consultorias que prestam serviços de TI / integração.
* ✅ **SOFTWARE PATH (ISV - Independent Software Vendor):** **SELECIONE ESTA TRILHA.**  
  Esta é a trilha para empresas que desenvolvem softwares próprios e vendem licenças/assinaturas.

---

### Passo 3: Dados Cadastrais da Empresa (Company Profile)
Preencha as informações da **TrustCo Technologies**:
* **Company Legal Name:** `TrustCo Technologies` (ou Razão Social do seu CNPJ)
* **Company Website:** `https://trustco.pro`
* **Headquarters Address:** Brasília, Distrito Federal — Brasil 🇧🇷
* **Primary Contact:** David Paiva
* **Primary Contact Email:** `contato@trustco.pro` / `partnerships@trustco.pro`
* **Industry Sector:** Telecommunications / Software / Contact Center

---

### Passo 4: Cadastro da Solução (VoiceVanguard CCaaS)
No painel do *Partner Central*, vá na aba **"Offerings"** &rarr; **"Add a Software Solution"**:
* **Solution Name:** `VoiceVanguard CCaaS — WebRTC Sentinel`
* **Solution URL:** `https://voicevanguard.trustco.pro`
* **One-Line Tagline:**  
  *Real-Time WebRTC voice quality observability (ITU-T G.107 MOS) and safe remote browser cache remediation purpose-built for Amazon Connect CCP.*
* **Primary AWS Service Target:** `Amazon Connect`
* **Applicable Categories:** Contact Center & Customer Engagement, Observability & APM, Security & Compliance.

---

### Passo 5: O Selo "Amazon Connect Ready" (AWS Service Ready Program)
Depois de cadastrado no Software Path, você submete a solução para o programa de validação técnica **Amazon Connect Ready**:
* **O que a AWS audita:**
  1. O software roda com o **Amazon Connect Contact Control Panel (CCP)** via browser? *(Sim, via extensão Chromium e API getStats).*
  2. O software vincula a chamada ao identificador oficial da AWS (`ContactId`)? *(Sim).*
  3. O software respeita a privacidade de dados (não grava áudio sem autorização)? *(Sim, Zero Voice Recording / 100% LGPD/GDPR).*
* **Entregável Técnico:** Você anexa o documento:  
  `VoiceVanguard_Amazon_Connect_Ready_Pitch.pdf` (gerado a partir de `VoiceVanguard_Amazon_Connect_Ready_Pitch.html`).

---

### Passo 6: Publicação no AWS Marketplace (SaaS Contracts)
* Acesse o **AWS Marketplace Management Portal** (`aws.amazon.com/marketplace/management`).
* Crie uma oferta do tipo **SaaS - Contracts**:
  * **Modelo de Cobrança:** Per User Per Month (PUPM) ou Assinatura Anual por Posição de Atendimento (PA).
  * **Valores sugeridos:** $4.00 a $6.50 USD / agente / mês.
  * **Free Trial:** 14 a 30 dias para até 25 PAs de teste.

---

## 3. Resumo dos Documentos Criados na sua Máquina

Pasta: 📂 **`06_Proposta_Publicacao_Amazon_Connect/`** (neste repositório)

| Arquivo | Função |
| :--- | :--- |
| **`VoiceVanguard_Amazon_Connect_Ready_Pitch.html`** | One-Pager em inglês nos padrões da AWS. Abra no navegador e dê `Ctrl + P` para salvar como PDF executivo. |
| **`amazon_connect_integration_spec.json`** | Especificação técnica de integração com CCP, Streams API e SaaS Contracts. |
| **`GUIA_CADASTRO_AWS_PARTNER_NETWORK.md`** | Este guia completo com o passo a passo de telas e campos. |
