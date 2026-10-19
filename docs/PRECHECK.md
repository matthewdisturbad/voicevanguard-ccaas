# Funções de saúde da estação

Três funções usam apenas dados que o navegador do operador já expõe. Nenhuma captura áudio.

## 1. Áudio mudo e unidirecional
O hook compara a variação de pacotes (`inbound-rtp` / `outbound-rtp`) a cada 2 s e o estado da trilha do microfone.

| Código | Quando |
|---|---|
| `SEM_AUDIO_RECEBIDO` | pacotes recebidos sem variação por 3 amostras seguidas (~6 s) |
| `SEM_AUDIO_ENVIADO` | pacotes enviados sem variação por 3 amostras, com microfone ativo |
| `MIC_DESCONECTADO` | trilha do microfone em estado `ended` |
| `MIC_MUDO_SISTEMA` | trilha com `muted` (mudo no sistema/hardware) |

- **Mute intencional do operador (`track.enabled = false`) não é incidente.**
- Trilha ausente (`replaceTrack(null)`, espera/hold) não gera incidente de envio.
- Incidente marca a telemetria como `ALERTA`; chamadas com incidente são classificadas `CRÍTICA` (causa `FALHA_AUDIO_ESTACAO`).
- Coleta: contadores e estados. **Não** lê nomes de dispositivos nem conteúdo de áudio. Troca de dispositivo é apenas contada.

## 2. Pré-check de turno
Botão no popup da extensão (indisponível durante chamada). Mede e avalia:

| Item | Atenção | Falha |
|---|---|---|
| Latência (mediana de 20 pings ao relay) | ≥ 150 ms | ≥ 300 ms |
| Jitter (variação média entre pings) | ≥ 30 ms | ≥ 60 ms |
| Perda (pings sem resposta em 2 s) | ≥ 1 % | ≥ 5 % |
| Microfone detectado | — | nenhum |
| Saída de áudio detectada | nenhuma | — |
| Conexão (`navigator.connection`) | diferente de `4g` | — |
| Equipamento | < 4 núcleos ou < 4 GB | — |
| Conexão com o relay | — | desconectado |

Veredito: `PRONTA`, `ATENCAO` ou `NAO_PRONTA`, com orientação por item. O resultado é enviado ao relay e aparece em **Saúde da estação** no console. Limiares em `03_Chrome_Edge_Extension/precheck.js` (`LIMITS`). Os de latência e perda seguem as referências públicas da Genesys (RTT abaixo de 150 ms, perda abaixo de 1%) e da Amazon (latência média até 300 ms); ver `docs/COMPARATIVO_MERCADO.md`.

### UDP de saída (opcional)

Quando o tenant define `stunServers`, o pré-check abre uma conexão ICE de teste (~3 s) contra o STUN e verifica se algum candidato `srflx` é obtido. Sem resposta, o item `udp_3478` fica em **atenção** (nunca "falha", pois pode ser só o STUN). Nenhum IP, áudio ou dado de chamada é lido ou enviado; só o veredito. Não valida a faixa de mídia.

### Latência até a região Genesys (opcional)
Se o tenant tem a seção `genesys` (região da organização), o relay informa essa região no `AUTH_OK`. O pré-check mede então 5 requisições HTTPS à API pública da região (`https://api.<região>/`), com os mesmos limiares de RTT (atenção 150 ms, falha 300 ms; referência pública do Genesys: menos de 150 ms), e mostra o item "Latência até o Genesys". É uma **aproximação**: mede o caminho até a API da região, não o caminho de mídia (TURN/edge) da chamada. A requisição não leva cookies nem credenciais, a resposta é descartada e só o tempo é usado. A região é validada contra a lista de regiões Genesys conhecidas (as mesmas de `host_permissions`). Sem a seção `genesys`, o item não aparece. Leitura combinada: relay bom e região ruim sugerem problema no caminho até o Genesys (VPN, proxy, roteamento do provedor); os dois ruins sugerem a rede local. É inferência, não medição de VPN.

Limitações: a sonda do relay mede até o relay, não até o servidor do CCaaS; sem permissão de microfone o navegador informa apenas a presença do tipo de dispositivo; `deviceMemory` é aproximado e limitado a 8 GB.

## 3. Latência das APIs do agent desktop
`PerformanceObserver` (resource timing) na página do CCaaS, em janelas de 30 s, **por hostname**: quantidade, média, p95, máximo e erros.

- Domínios considerados: o da própria página e `*.pure.cloud`, `*.mypurecloud.*`, `*.connect.aws`, `*.awsapps.com`.
- **Nunca** são lidos nem enviados: URL completa, caminho, query string, cabeçalhos, corpo ou IDs.
- `erros` conta respostas HTTP ≥ 400; o navegador só expõe o status de requisições de mesma origem ou com `Timing-Allow-Origin`, portanto em chamadas cross-origin o número de erros pode ser subestimado.

## Privacidade (resumo)
Dados novos enviados ao relay: códigos de incidente de áudio, contagem de trocas de dispositivo, resultado do pré-check (status e valores numéricos) e agregados de latência por hostname, associados ao ID da estação e ao nome do operador já usados na telemetria. Isso continua sendo dado pessoal sob LGPD/GDPR; a política de privacidade e o DPA seguem pendentes (ver `docs/AVALIACAO.md`).
