# Roteiro de validação (org de testes Genesys)

Pré-requisito: [README.md](README.md) seções A a D concluídas. Mantenha aberto o console `https://<dominio>/app` (supervisor) e o agent desktop do operador. Dois usuários: **Operador** (com a extensão) e **Chamador** (outro usuário, telefone ou número de teste).

Preencha a coluna *Resultado* (OK / Falhou / N/A) e anote evidências (print do console, log do service worker).

## 0. Base
| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 0.1 | Popup da extensão | Licença "Configurada"; ID de estação `PA-XXXX` | |
| 0.2 | Console `/app` com supervisorKey | Estação do operador listada | |
| 0.3 | Entrar no console com a **agentKey** | Recusado | |
| 0.4 | Chamador liga para o Operador; atender | Estado de chamada ativa; ID da conversa igual ao do Genesys (`/conversations/<uuid>`) | |
| 0.5 | Durante a chamada, MOS/RTT/jitter/perda | Valores plausíveis e atualizando; **não** o MOS fixo 4.40 sem dados | |
| 0.6 | Desligar | Chamada aparece na auditoria com MOS médio/mínimo | |
| 0.7 | Em chamada, clicar "Limpar cache" no popup | Bloqueado (In-Call Lock); executa só após a chamada | |

## 1. Áudio mudo e unidirecional
Códigos esperados: `SEM_AUDIO_RECEBIDO`, `SEM_AUDIO_ENVIADO`, `MIC_DESCONECTADO`, `MIC_MUDO_SISTEMA` (ver `docs/PRECHECK.md`). Cada cenário com chamada ativa e áudio fluindo antes.

| # | Cenário | Como provocar | Esperado em até ~6–10 s | Resultado |
|---|---|---|---|---|
| 1.1 | Mute intencional | Botão de mute do Genesys | **Nenhum incidente** | |
| 1.2 | Hold | Colocar em espera | **Nenhum incidente** de envio | |
| 1.3 | Mic desconectado | Desplugar o headset USB (ou desativar o dispositivo) | `MIC_DESCONECTADO`; telemetria `ALERTA` | |
| 1.4 | Mic mudo no sistema | Mute de hardware/SO no headset | `MIC_MUDO_SISTEMA` | |
| 1.5 | Sem áudio enviado | Chamada em que o operador fala e o chamador não ouve (ex.: saída de mic errada no Genesys) | `SEM_AUDIO_ENVIADO` | |
| 1.6 | Sem áudio recebido | Chamador mudo e sem ruído (ou bloquear mídia na rede de teste) | `SEM_AUDIO_RECEBIDO` | |
| 1.7 | Classificação final | Encerrar chamadas 1.3–1.6 | Auditoria `CRÍTICA`, causa `FALHA_AUDIO_ESTACAO` | |
| 1.8 | Recuperação | Reconectar o headset | Incidente some da telemetria | |

Nota: o e2e simulado só cobre áudio parado; `MIC_*` e `SEM_AUDIO_ENVIADO` só têm teste unitário. Estes cenários são a primeira validação real deles.

## 2. Pré-check de turno
Limiares em `03_Chrome_Edge_Extension/precheck.js` (`LIMITS`).

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 2.1 | Sem chamada, "Verificar estação antes do turno" | Conclui em ~5 s; veredito `PRONTA`; resultado na aba **Saúde da estação** do console | |
| 2.2 | Botão durante chamada ativa | Indisponível | |
| 2.3 | Sem headset | `NAO_PRONTA` ou item de microfone com falha e orientação | |
| 2.4 | Sem saída de áudio | `ATENCAO` | |
| 2.5 | Rede degradada (Wi-Fi fraco, ou limitador de rede: ≥150 ms / ≥1% de perda) | `ATENCAO` (≥300 ms ou ≥5% perda: `NAO_PRONTA`) | |
| 2.6 | Relay fora do ar (pare o serviço) | `NAO_PRONTA` por conexão com o relay | |
| 2.7 | Privacidade | Payload só tem status e números, sem nomes de dispositivo | |

Lembrete: a sonda mede até o **relay**. Para comparar, faça o teste com o relay na mesma região do operador.

## 3. Latência das APIs do agent desktop
| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 3.1 | Navegar no agent desktop por ~2 min (abrir filas, histórico, mudar status) | Aba **Saúde da estação** mostra hosts `*.pure.cloud` / `*.mypurecloud.*` com contagem, média, p95, máximo, erros por janela de 30 s | |
| 3.2 | Latência não marca chamada ativa | Estação **sem** chamada continua "ociosa" enquanto os dados chegam | |
| 3.3 | Privacidade | Em DevTools > rede do WebSocket (ou log do relay) só há hostname; **nenhuma** URL, caminho, query, ID | |
| 3.4 | Degradar a rede (throttling do DevTools) | p95/máximo sobem no console | |
| 3.5 | Erros HTTP | Contagem de erros pode ficar subestimada em chamadas cross-origin (limitação documentada) | |

## 4. Segurança e LGPD (amostra)
| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 4.1 | `/` | Landing comercial, não o console | |
| 4.2 | `/app` sem chave | Tela de login; nenhuma "demo pill" | |
| 4.3 | Duas orgs/tenants (se tiver um segundo no `TENANTS_JSON`) | Supervisor de um não vê estações do outro | |
| 4.4 | Nenhuma captura de áudio | Sem gravação nem upload de mídia (somente estatísticas) | |

## 5. Encerramento
Anote versão (commit) testada, região Genesys, navegador/versão, headset, rede. Registre falhas como issues no repositório; critério sugerido de aprovação: 0.x e 1.x–3.x todos OK, ou falhas explicadas.
