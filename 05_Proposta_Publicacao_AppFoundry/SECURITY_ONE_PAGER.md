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
| Conformidade | — | Não afirmar LGPD/GDPR/PCI-DSS "compliant" sem parecer; usar "privacy by design" |
