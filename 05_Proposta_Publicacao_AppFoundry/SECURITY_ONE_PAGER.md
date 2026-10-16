# VoiceVanguard CCaaS — Security One-Pager (rascunho)

| Tema | Estado atual (verificável no repo) | Pendente antes da submissão |
|---|---|---|
| Áudio | Nunca capturado; só `getStats()` RTP | — |
| Isolamento de tenants | Salas por Tenant Key no relay | Teste automatizado de isolamento |
| In-Call Lock | Remediação só em wrap-up | — |
| Transporte | HTTPS/WSS terminado no Railway | Comprovar versão TLS (ex.: relatório SSL Labs) antes de afirmar "TLS 1.3" |
| Brute force de Tenant Key | Rate limit 10/min/IP em `/api/validate-tenant` | Limitar também a conexão WebSocket |
| Embed | CSP `frame-ancestors` restrito a domínios Genesys | — |
| Privacidade | `/privacy` (rascunho) | Revisão jurídica |
| Conformidade | Texto ajustado: "segue as diretrizes da LGPD/GDPR" (privacy by design), sem alegar certificação | Revisão jurídica do texto; não usar "certificado"/"100% compliant" |

## Mapeamento de tenants (Genesys)
O administrador do cliente cria a Client App Integration no Genesys (Admin > Integrations) e cola a URL com a Tenant Key emitida pela TrustCo (`?tenant=<TenantKey>`). O app valida a chave em `/api/validate-tenant`; o `org` do Genesys é informativo. A Tenant Key nunca é derivada do ID público da org.
