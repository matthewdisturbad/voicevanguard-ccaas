# Exportação de chamadas (CSV) para cruzar com TMA e CSAT

`GET /api/calls.csv` devolve as chamadas auditadas do tenant em CSV, para o cliente cruzar o MOS com TMA, transferências, abandono e CSAT no próprio BI (Power BI, Sheets, Excel) usando `interactionId`, que é o `conversationId` do Genesys (ou o `ContactId` da Amazon Connect). Assim o cliente mede o impacto da qualidade de áudio sem entregar credenciais de analytics ao VoiceVanguard.

```bash
curl -H "X-Tenant-Key: $CHAVE_DE_SUPERVISOR" \
  "https://voicevanguard.trustco.pro/api/calls.csv?from=2026-10-01T00:00:00Z&to=2026-10-31T23:59:59Z" \
  -o chamadas.csv
```

- **Acesso:** só com chave de **supervisor**, no cabeçalho `X-Tenant-Key` (chave em URL vaza em logs). Supervisor de uma torre exporta só a sua; um tenant nunca vê outro. Chave de agente é recusada. Sessões de login Genesys (OAuth) não têm chave e não usam esta rota.
- **Filtros:** `from` e `to` (ISO 8601, opcionais) sobre o fim da chamada.
- **Colunas:** `interactionId, tower, platform, station, startTime, endTime, durationSeconds, mosMedio, mosMinimo, rttMedioMs, jitterPicoMs, perdaPacotesPct, classificacao, causaRaiz, incidentesAudio, networkType`. **O nome do operador não é exportado.**
- **Planilhas:** células que começariam com `=`, `+`, `-` ou `@` recebem um apóstrofo para não virarem fórmula.
- **Limite:** o histórico guardado são as últimas 500 chamadas por tenant (`MAX_HISTORY`); para períodos longos, exporte com frequência (por exemplo, diariamente).
- **Rate limit:** mesmas tentativas inválidas por minuto da validação de chave.
