# Trilha de compra e ativação (Chrome Web Store / Edge Add-ons)

**Status: planejamento.** Nada abaixo, além do que está marcado como "existe hoje", está implementado. Não citar em material comercial.

## Premissa que muda o desenho

A Chrome Web Store e o Edge Add-ons são **canais de distribuição**, não de cobrança: confirmar na documentação atual de cada loja, mas, até onde sabemos, nenhuma das duas oferece cobrança nativa de extensões. Então a loja entrega a extensão de graça e **a compra acontece fora dela**, no contrato direto da TrustCo (em reais, conforme a decisão de preço já tomada). A extensão sozinha não tem valor sem uma chave de tenant, que é o que o cliente compra.

## A trilha, passo a passo

| # | Etapa | O que acontece | Existe hoje? |
|---|-------|----------------|--------------|
| 1 | Descoberta | Cliente acha a extensão na loja; a descrição e a ficha apontam para `voicevanguard.trustco.pro` | Texto em `CHROMEWEBSTORE.md`; publicação pendente |
| 2 | Instalação sem licença | Extensão instalada sem chave. O pré-check local funciona; o popup mostra "Sem licença: solicitar piloto" com link para a landing | Pré-check sim; mensagem de "sem licença" a verificar/criar |
| 3 | Solicitação | Landing: "Solicitar piloto" abre e-mail para `contato@trustco.pro`; link "Suporte" no rodapé | Sim (por e-mail) |
| 4 | Qualificação e proposta | Comercial define faixa (≤250 / ≤1.500 / acima), piso mensal e prazo do piloto (14 dias) | Faixas em memória do projeto; proposta manual |
| 5 | Contrato e pagamento | Contrato direto em R$ (nota fiscal, Pix ou boleto), com DPA e política de privacidade | Minutas em `docs/juridico/` (revisão jurídica pendente) |
| 6 | Provisionamento | Criar o tenant em `TENANTS_JSON` (chave de supervisor, chave de agente, torres, `monitoringMode`, `stunServers`, webhook) e reiniciar/atualizar o serviço | Manual; sem tela nem API |
| 7 | Implantação | GPO/Intune força a extensão e injeta a chave via `managed_schema.json`; ou chave digitada no popup para pilotos pequenos | Sim (`docs/IMPLANTACAO_GPO_INTUNE.md`); teste real com Intune pendente |
| 8 | Operação e medição | Fatura por PAs ativos no mês | Não: o relay não conta PAs por mês |
| 9 | Renovação ou cancelamento | Renova a chave ou remove o tenant; descarte dos dados conforme a política de retenção | Manual |

## Lacunas de produto (em ordem de prioridade)

1. **Validade do tenant.** Não existe campo de expiração (`expiresAt`) em `TENANTS_JSON`. Sem ele, o piloto de 14 dias e a inadimplência dependem de alguém lembrar de remover a chave. Proposta: campo opcional `expiresAt`; vencido, o AUTH devolve um erro claro e a extensão mostra "licença expirada".
2. **Contagem de PAs ativos por mês.** Base de faturamento. Proposta: contar estações distintas por tenant/mês no relay, sem nome de operador (mantém a privacidade) e exportar junto do CSV ou por endpoint de supervisor.
3. **Estado "sem licença" na extensão.** Mensagem clara no popup (PT/EN) com o caminho para solicitar piloto, em vez de um erro de conexão.
4. **Provisionamento sem editar variável de ambiente.** Hoje escala mal. Exige o armazenamento persistente (Redis/Postgres) que foi adiado de propósito; só vale quando houver volume de clientes.
5. **Página de preços e formulário de piloto** na landing, no lugar do e-mail direto (opcional no começo).

## Decisões que dependem do Davdi

- Quem emite a cobrança e como: nota fiscal por boleto/Pix, ou um gateway (ex.: Stripe/Pagar.me) para cartão. Eu não escolho gateway sem sua aprovação.
- Piloto: 14 dias, gratuito, com limite de estações?
- Cliente vindo do Marketplace Amazon ou Genesys AppFoundry segue a regra daquele canal; confirmar com o Partner Manager antes de prometer.
- Quem recebe as chaves do tenant e por qual canal seguro (nunca por e-mail em texto aberto).

## Próximo passo sugerido

Implementar as lacunas 1 a 3 (validade do tenant, contagem de PAs e mensagem "sem licença"). São pequenas, testáveis e não dependem de nenhuma decisão comercial além da duração do piloto.
