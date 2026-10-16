# Teste end-to-end (extensão + relay + console)

Sobe um relay local, carrega a extensão num Chromium real, simula uma chamada WebRTC em uma página
com domínio Genesys (interceptada por rota) e confere: login do supervisor, telemetria, In-Call Lock,
auditoria ao fim da chamada, correlação do ID, persistência e popup.

```bash
npm i --no-save playwright          # fora do package.json do relay
CHROMIUM_PATH=/caminho/do/chromium node e2e/run.js   # CHROMIUM_PATH opcional
```

Screenshots em `$E2E_OUT` (padrão: pasta temporária). Não roda no CI por exigir navegador com extensão.
