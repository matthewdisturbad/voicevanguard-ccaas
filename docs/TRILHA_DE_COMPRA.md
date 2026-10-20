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
| 4 | Qualificação e proposta | Comercial define faixa (≤250 / ≤1.500 / acima), piso mensal. **Piloto decidido:** 14 dias, gratuito, até 25 estações e 500 chamadas de histórico, sem cartão; vence sozinho | Faixas em memória do projeto; proposta manual |
| 5 | Contrato e pagamento | Contrato direto em R$ (nota fiscal, Pix ou boleto), com DPA e política de privacidade | Minutas em `docs/juridico/` (revisão jurídica pendente) |
| 6 | Provisionamento | Criar o tenant em `TENANTS_JSON` (`tier`, `expiresAt`, chaves, torres, `monitoringMode`, `stunServers`, webhook) e atualizar o serviço. Decisão: continua manual por enquanto | Manual; `tier`/`expiresAt` e tetos do piloto implementados (`docs/OPERACAO_E_ESCALA.md`) |
| 7 | Implantação | GPO/Intune força a extensão e injeta a chave via `managed_schema.json`; ou chave digitada no popup para pilotos pequenos | Sim (`docs/IMPLANTACAO_GPO_INTUNE.md`); teste real com Intune pendente |
| 8 | Operação e medição | Fatura por PAs ativos no mês | Não: o relay não conta PAs por mês |
| 9 | Renovação ou cancelamento | Renova a chave ou remove o tenant; descarte dos dados conforme a política de retenção | Manual |

## Lacunas de produto (em ordem de prioridade)

1. ~~**Validade do tenant.**~~ **Implementado:** `tier` (`pilot`/`production`) e `expiresAt` em `TENANTS_JSON`; vencido, o relay recusa (código 4010) e a extensão e o console mostram "licença expirada".
2. **Contagem de PAs ativos por mês.** Base de faturamento. Proposta: contar estações distintas por tenant/mês no relay, sem nome de operador (mantém a privacidade) e exportar junto do CSV ou por endpoint de supervisor.
3. **Estado "sem licença" na extensão.** "Licença expirada" já aparece no popup; falta a mensagem de quem nunca teve chave, com o caminho para solicitar piloto.
4. **Provisionamento sem editar variável de ambiente.** Hoje escala mal. Exige o armazenamento persistente (Redis/Postgres) que foi adiado de propósito; só vale quando houver volume de clientes.
5. **Página de preços e formulário de piloto** na landing, no lugar do e-mail direto (opcional no começo).

## Decisões que dependem do Davdi

- Cobrança (recomendação, a confirmar com o contador e a Stripe): no Brasil, contrato com NFS-e e boleto/Pix (cartão via Stripe Brasil, se aprovada para o CNPJ); no exterior, Stripe em dólar com fatura e assinatura; PayPal só como opção secundária.
- Piloto: 14 dias, gratuito, com limite de estações?
- Cliente vindo do Marketplace Amazon ou Genesys AppFoundry segue a regra daquele canal; confirmar com o Partner Manager antes de prometer.
- Quem recebe as chaves do tenant e por qual canal seguro (nunca por e-mail em texto aberto).

## Próximo passo sugerido

Implementar a contagem de estações ativas por mês (base da fatura) e a mensagem para quem nunca teve licença.
