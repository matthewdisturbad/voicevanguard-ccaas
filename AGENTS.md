# Diretrizes para Agentes de IA — VoiceVanguard CCaaS

Este repositório contém o código-fonte, arquitetura e propostas de publicação da plataforma **VoiceVanguard CCaaS** (TrustCo Technologies).

## 🤖 Regras de Operação para Agentes

1. **Leitura Prévia:** Antes de propor alterações na landing page ou no console, consulte `CLAUDE.md` e `README.md`.
2. **Preservação de Bilíngue:** Qualquer alteração na landing page (`01_Cloud_Relay_Backend/public/index.html`) deve manter a paridade exata entre os dicionários de idiomas (`pt` e `en`).
3. **HTML vs Entities:** Nunca insira entidades literais como `&rarr;` ou `&darr;` em strings renderizadas via `.textContent`. Use caracteres Unicode literais (`→`, `↓`) ou `innerHTML` / `data-i18n-html`.
4. **Segurança de Rotas:**
   - `/` deve sempre servir a landing page comercial.
   - `/app` deve sempre exigir validação de `tenantKey` via `/api/validate-tenant`.
5. **Papéis e chaves:** nunca derive o papel (agente/supervisor) de parâmetro enviado pelo cliente; nunca coloque chaves em código, README ou URL. Escape toda saída de dados de agente no console.
6. **Encoding no Windows:** Sempre garanta codificação UTF-8 sem BOM em arquivos de texto editados no ambiente Windows.
