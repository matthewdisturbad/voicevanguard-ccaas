# Webhook de alertas (saída)

Envia um `POST` JSON assinado ao sistema do cliente (Power Automate, Zapier, n8n, Teams/Slack via automação, ITSM) quando uma chamada termina **crítica** ou com **incidente de áudio**. É opcional e por tenant.

## Configuração (`TENANTS_JSON`)

```json
"BPO-APEX-GLOBAL": {
  "...": "...",
  "webhook": {
    "url": "https://alertas.exemplo.com/voicevanguard",
    "secret": "<16+ caracteres aleatórios>",
    "events": ["CALL_CRITICAL", "AUDIO_INCIDENT", "MOS_DEGRADED"],
    "mosThreshold": 3.0
  }
}
```

- `url`: obrigatoriamente `https`, sem usuário/senha. O servidor resolve o DNS e **recusa destinos internos** (loopback, redes privadas, link-local/metadata) fixando o IP validado na conexão (proteção contra SSRF). Redirecionamentos não são seguidos.
- `secret`: usado para assinar; gere com `openssl rand -hex 24`. Nunca vai em código ou README.
- `events` (opcional): padrão são os três eventos.
- `mosThreshold` (opcional, 1 a 4.5, padrão 3.0): limite do alerta durante a chamada.
- Configuração inválida impede a subida do servidor (falha rápida).

## Eventos

| Evento | Quando |
|---|---|
| `CALL_CRITICAL` | resumo da chamada com classificação `CRÍTICA` |
| `AUDIO_INCIDENT` | resumo da chamada com ao menos um incidente de áudio (mudo/unidirecional) |
| `MOS_DEGRADED` | **durante** a chamada: MOS abaixo de `mosThreshold` em 3 amostras seguidas de telemetria; um alerta por chamada (uma amostra boa zera a contagem) |

Corpo dos eventos de fim de chamada (JSON): `event`, `delivery`, `tenant`, `tower`, `station`, `platform`, `interactionId`, `endTime`, `mosMedio`, `mosMinimo`, `rttMedioMs`, `perdaPacotesPct`, `classificacao`, `causaRaiz`, `incidentesAudio`.
`MOS_DEGRADED` leva `event`, `delivery`, `tenant`, `tower`, `station`, `platform`, `interactionId`, `mosAtual`, `limiteMos`, `rttMs`, `perdaPacotesPct`, `jitterMs` e `networkType`.
**O nome do operador não é enviado** (só a estação), em linha com o posicionamento de saúde técnica da estação.

## Verificação da assinatura

Cabeçalhos: `X-VoiceVanguard-Event`, `X-VoiceVanguard-Delivery` (id único, igual nas retentativas, use para deduplicar), `X-VoiceVanguard-Timestamp` (segundos) e `X-VoiceVanguard-Signature: sha256=<hex>`.

```js
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
// compare com crypto.timingSafeEqual e rejeite timestamps com mais de 5 minutos
```

## Entrega

Em segundo plano (não atrasa o relay). Resposta 2xx = entregue; 5xx/429/erro de rede = até 3 retentativas (1 s, 5 s, 20 s); outros 4xx = descartado. Timeout de 5 s. A fila é só em memória (limite de 200 entregas pendentes): um reinício do servidor perde alertas ainda não entregues.
