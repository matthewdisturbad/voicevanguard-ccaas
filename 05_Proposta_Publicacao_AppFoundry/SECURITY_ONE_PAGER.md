# VoiceVanguard CCaaS — Security One-Pager (rascunho)

| Tema | Estado atual (verificável no repo) | Pendente antes da submissão |
|---|---|---|
| Áudio | Nunca capturado; só `getStats()` RTP | — |
| Isolamento de tenants | Salas por Tenant Key no relay | Teste automatizado de isolamento |
| In-Call Lock | Remediação só em wrap-up | — |
| Transporte | HTTPS/WSS terminado no Railway | Comprovar versão TLS (ex.: relatório SSL Labs) antes de afirmar "TLS 1.3" |
| Brute force de chaves | Rate limit de falhas por IP no console e no WebSocket | — |
| Embed | `/dashboard` e `/widget` só podem ser enquadrados por domínios Genesys; demais páginas `DENY` | — |
| Privacidade | `/privacy` (rascunho) | Revisão jurídica |
| Conformidade | Texto ajustado: "segue as diretrizes da LGPD/GDPR" (privacy by design), sem alegar certificação | Revisão jurídica do texto; não usar "certificado"/"100% compliant" |

## Mapeamento de tenants (Genesys)
O administrador do cliente cria a Client App Integration no Genesys (Admin > Integrations) com a URL do console; o supervisor entra com a chave que a TrustCo emitiu (a chave nunca fica na URL e nunca é derivada do ID público da org). Para operações separadas dentro de um cliente, ver `docs/ROTEAMENTO_POR_TORRE.md`.
