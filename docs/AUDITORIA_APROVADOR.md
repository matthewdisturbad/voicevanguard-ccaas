# Auditoria como aprovador (Genesys, Amazon, NICE) — outubro de 2026

Três revisões independentes (backend/segurança, extensão/manifestos/materiais, site/console/privacidade), com ataques reais ao relay local. Este arquivo registra o que foi corrigido e o que continua aberto.

## Corrigido neste ciclo
- **Crítico:** um frame acima de 64 KB em conexão com chave inválida derrubava o processo (erro de socket sem tratamento). Corrigido, com teste que sobe o servidor real e falha sem a correção. Também há `uncaughtException` com log.
- Relay sobe com tenants de desenvolvimento se `NODE_ENV` for esquecido: agora também recusa quando detecta Railway.
- Rate limit por IP usava o primeiro item do `X-Forwarded-For` (forjável): agora usa o último.
- Limite de 40 msg/s por agente e 20 msg/s por supervisor (fecha com 1008); teto de registros de agentes por sala.
- `/api/health` público sem métricas de conexões; `Cache-Control: no-store` nas APIs; `/api/validate-tenant` só aceita a chave por cabeçalho; `TENANTS_JSON` malformado não vaza conteúdo.
- In-Call Lock no servidor: agente sem estado conhecido ou recém-reconectado tem o comando enfileirado até a próxima telemetria.
- Log `[AUDIT]` agora traz supervisor, torre, alvo e horário; `classificacao` validada por enum.
- Extensão: política gerenciada aplica a chave e conecta (antes só conectava se já houvesse conexão); `managed_schema.json`; `relayServer` só `wss://`; recuo exponencial com jitter; In-Call Lock restaurado após reinício do service worker; `all_frames`; permissão `alarms` removida; `*.awsapps.com` restrito a `/connect/*`; descrição com menos de 132 caracteres; nomes pessoais removidos do código.
- Textos: removidos "100% LGPD/GDPR/PCI-DSS", "85%", "authoritative", "Zero Call Drops", "Sovereign", bibliotecas Amazon que o código não usa, banda Wi-Fi (2,4/5/6 GHz) que o navegador não informa e "uma vez por segundo" (são 2 s). "Wi-Fi/cabo" virou indício, e sem dado do navegador o tipo de rede é "N/D" (antes aparecia "Ethernet" inventado).
- Política de privacidade pública reescrita com tudo o que é coletado; aba "BI e causa raiz" virou "Fatores locais" com indicadores calculados.

## Aberto (decisão ou validação sua)
1. **Genesys:** conferir contra a documentação oficial o formato do manifesto de Client App, as variáveis `{{pc...}}` e o sandbox; o widget de interação é um esboço e a lista de PNG 512 do checklist não existe.
2. **Chave na URL do WebSocket** (`?key=`): o relay e a extensão ainda usam; trocar exige mudar o protocolo (primeira mensagem de autenticação). Recomendo fazer antes de escalar.
3. **CSP** ainda permite `unsafe-inline` e `ws:/wss:` genérico; mover scripts para arquivos exige mexer em `index.html` e `app.html`.
4. Chave de agente compartilhada por torre: um agente pode se passar por outro dentro da mesma torre (limite do modelo; documentar ao cliente).
5. Validar GPO/Intune com política real, jurídico revisando a política de privacidade e as minutas, e prazo de retenção do histórico em dias.
6. **NICE CXone:** a extensão não cobre esse produto (nenhuma regra de host); só prometer após implementar.
7. Fórmula de MOS é aproximação; evitar "E-model" até implementar codec e atraso corretamente.
8. `CLAUDE.md` diz que a integração Amazon usa a Streams API, mas o código não usa; ajustar o texto lá.
