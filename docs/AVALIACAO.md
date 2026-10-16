# Avaliação do VoiceVanguard CCaaS

Data: 2026-10-16 · Escopo: arquitetura, segurança, qualidade, produto e prontidão para produção.
Método: revisão estática do código por cinco avaliações independentes; afirmações-chave reconferidas por execução (testes de path traversal contra o servidor local e leitura do protocolo `postMessage`).

## Veredito

MVP promissor, **não pronto para produção multi-tenant** no estado avaliado. As correções de segurança e robustez estão na branch `fix/avaliacao-seguranca-producao` (issues #2–#9). Itens que dependem do dono do produto estão em "Pendências".

## Achados e status

| # | Achado | Severidade | Status | Issue |
|---|---|---|---|---|
| 1 | Chaves de tenant fixas no código e no README público; papel autodeclarado; sem rate limit | Crítico | Corrigido no código (chaves via `TENANTS_JSON`, papéis por chave, rate limit). **Rotacionar em produção** | #2 |
| 2 | XSS armazenado no console (`innerHTML` com dados de agente, `onclick` inline) | Crítico | Corrigido (`esc()`, delegação de eventos, sanitização no servidor, CSP) | #3 |
| 3 | Telemetria da extensão não chegava ao background (protocolo `postMessage` incompatível) | Crítico (funcional) | Corrigido, com checagem de origem | #4 |
| 4 | Extensão com `<all_urls>` e content script em todo site | Alto | Restrito a Genesys Cloud / Amazon Connect | #5 |
| 5 | Tenant `DEMO-FREE-2026` inexistente no servidor; dashboard 02 duplicado com demo pills | Alto | Removidos | #6 |
| 6 | Sem `maxPayload`, limites, heartbeat, shutdown; persistência síncrona e não atômica; MOS "ótimo" falso quando ausente | Alto | Corrigido | #7 |
| 7 | In-Call Lock com flag que podia ficar presa; popup ignorava o lock | Médio | Flag expira sem telemetria; popup passa pelo background | #7 |
| 8 | Sem testes/CI; simuladores não eram testes | Médio | 9 testes `node:test` + workflow de CI + checagem de paridade i18n | #8 |
| 9 | Alegações de compliance, "Production Active", IDs de marketplace, preços divergentes | Alto (credibilidade) | Docs ajustadas; decisões pendentes abaixo | #9 |

Falso positivo descartado: path traversal em arquivos estáticos **não se reproduziu** (cinco variantes retornaram 404; `new URL()` normaliza o caminho). Mesmo assim foi adicionada checagem explícita de prefixo e teste automatizado.

## Pendências (ação do dono)

1. **Rotacionar todas as chaves** que já estiveram no repositório e configurar `TENANTS_JSON` no Railway (`agentKey` ≠ `supervisorKey`, `openssl rand -hex 24`). Reemitir `agentKey` às extensões via GPO/Intune.
2. Montar um **Volume** no Railway e definir `DATA_DIR`; definir `TRUST_PROXY=1`. Considerar Postgres/Redis antes de escalar horizontalmente (o estado de salas é em memória: manter 1 réplica).
3. **Reescrever o histórico git** (ou aceitar a exposição) para as chaves antigas; elas devem ser tratadas como comprometidas.
4. Política de privacidade, DPA e DPIA (operador, estação, agentId e callId são dados pessoais). Só voltar a citar LGPD/GDPR/PCI-DSS após avaliação formal.
5. Confirmar IDs do AWS Marketplace/APN e o status da candidatura Genesys; unificar as três tabelas de preço; citar fonte dos percentuais (75%/85%/80%) ou removê-los; refazer o comparativo com concorrentes reais.
6. Remover caminho local e e-mails pessoais do guia AWS; unificar o nome antigo "VoiceDoctor".
7. Publicar a extensão via GitHub Releases/Chrome Web Store (os `.zip` saíram do git). Os endpoints do manifesto Genesys (`/dashboard`, `/widget`) ainda não existem no servidor.
8. Cálculo de MOS é uma **aproximação baseada em G.107** (usa RTT, perda cumulativa); documentar assim ou implementar o E-model completo por codec, com testes.

## Pontos positivos

- Escopo enxuto e legível (≈3 mil linhas), uma única dependência de runtime (`ws`).
- Alegação de "zero áudio" coerente com o código: o hook usa apenas `getStats()`.
- Paridade de tradução pt/en da landing correta (89 chaves) e agora verificada em CI.
