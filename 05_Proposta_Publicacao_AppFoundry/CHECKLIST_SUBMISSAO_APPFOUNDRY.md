# Checklist Oficial de Submissão & Homologação &bull; Genesys AppFoundry

Utilize esta lista de verificação passo a passo para submeter a solução ao programa de parceiros da Genesys (Technology Partner Program).

---

## 📋 1. Requisitos Cadastrais e Corporativos
- [ ] **Empresa / CNPJ constituído:** Para faturamento internacional e assinatura do contrato de Technology Partner.
- [ ] **Conta no Portal de Parceiros da Genesys:** Registro formal em [partners.genesys.com](https://partners.genesys.com) como *Technology Partner (ISV)*.
- [ ] **Domínio Próprio & E-mail Corporativo:** Exemplo: `seusaas.com` e `contato@seusaas.com` (a Genesys não aceita Gmail/Hotmail para parceiros ISV).

---

## 🔒 2. Requisitos de Segurança & Compliance (SecOps)
- [ ] **Política de Privacidade Publicada:** URL pública detalhando que o app não grava dados de áudio nem coleta informações sensíveis de cartões/clientes (apenas telemetria de rede e navegador).
- [ ] **Comunicação Criptografada (TLS 1.3):** 100% dos endpoints em produção com certificado SSL válido (HTTPS e WSS).
- [ ] **Multi-Tenant Data Isolation:** Garantia arquitetural de que dados de um cliente (`TenantKey`) não vazam para outro.

---

## 🎨 3. Materiais de Marketing e Assets Visuais para o Listing
- [ ] **Ícone do Produto:** Resoluções `128x128px` e `512x512px` em formato PNG com fundo transparente.
- [ ] **Banner / Hero Image:** Imagem de destaque em alta resolução (`1920x1080px` ou `1200x630px`) demonstrando o Dashboard do Supervisor e o WebRTC Monitor.
- [ ] **Screenshots da Aplicação (mínimo 3):**
  1. *Live Monitor de PAs:* Mostrando o semáforo de qualidade de voz e o status de chamada.
  2. *Auditoria de Chamadas:* Mostrando o cálculo de MOS ITU-T G.107 correlacionado ao `ConversationId`.
  3. *Popup do Agente:* Mostrando a interface limpa e a Limpeza Segura de Cache.
- [ ] **Vídeo Demo Curto (2 a 3 minutos):** Demonstração gravada no Loom ou YouTube (Não Listado) mostrando a instalação e os dados subindo em tempo real.

---

## ⚙️ 4. Requisitos Técnicos de Integração Genesys
- [ ] **Genesys Cloud Client App Integration (App Embedded):** O Dashboard web funcionando como iframe dentro do próprio Genesys Cloud do Supervisor (via *Admin -> Integrations -> Client App*).
- [ ] **Compatibilidade Multi-Região:** Testado e aprovado nas regiões principais:
  - `sae1.pure.cloud` (São Paulo)
  - `us-east-1 (mypurecloud.com)` (América do Norte)
  - `eu-west-1 (mypurecloud.ie)` (Europa)
- [ ] **Instalação Corporativa Zero-Touch:** Documentação orientando o cliente sobre como injetar a `TenantKey` via Intune / GPO.

---

## 💰 5. Precificação e Contrato Comercial
- [ ] **Modalidade no AppFoundry:** Escolher entre:
  - **Premium App (Recomendado):** A Genesys cobra o cliente final na fatura mensal do Genesys Cloud e repassa a sua parte líquida (80% a 85%).
  - **Standard App (BYOL - Bring Your Own License):** O cliente contrata e paga direto no seu site/Stripe, usando o AppFoundry apenas como vitrine.
- [ ] **Preço Base Definido:** \$5,00 USD / PA / mês com período de testes de 14 dias.
