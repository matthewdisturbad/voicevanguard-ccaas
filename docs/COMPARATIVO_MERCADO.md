# Comparativo de mercado — observabilidade de chamadas no desktop do agente

Fonte: documentação pública e páginas dos próprios fornecedores (out/2026). Não houve teste nem engenharia reversa dos produtos de terceiros; os pontos abaixo são o que cada fornecedor afirma. Validar antes de usar em material externo.

| Solução | Como funciona | Quando mede | Foco |
|---|---|---|---|
| Genesys Cloud WebRTC Diagnostics (nativo) | Agente roda um teste manual (conexão, estação WebRTC, qualidade estimada, MOS); exige login e voicemail configurado | Sob demanda | Diagnóstico pontual do telefone |
| Amazon Connect Endpoint Test Utility (nativo) | Mede a latência entre a instância e o navegador do agente | Sob demanda | Rede até a instância |
| NetBeez | Agente instalado no notebook do teletrabalhador; separa Wi-Fi, provedor, VPN e DNS | Contínuo | Rede do trabalhador remoto |
| Splunk App for Amazon Connect | Perda, latência e jitter por endpoint, com indício de microfone | Contínuo | Visibilidade para Amazon Connect |
| Nectar, ThousandEyes, Cyara | Monitoração de rede e voz ou testes sintéticos de contact center | Contínuo ou sintético | Plataforma ampla, não a chamada real do agente |
| **VoiceVanguard** | Extensão lê `getStats()` da chamada real; relay agrega por tenant e torre | Contínuo, por chamada | Saúde técnica da estação, áudio mudo ou unidirecional, remediação segura pós-chamada |

## Referências públicas usadas
- Genesys: perda de pacotes abaixo de 1% e RTT médio abaixo de 150 ms (ajuda do WebRTC Diagnostics). O console mostra, no painel da estação, se RTT e perda estão dentro dessa referência.
- Amazon Connect: latência média até 300 ms; Ethernet cabeada quando possível.

## Onde o VoiceVanguard se diferencia
- Passivo: mede a chamada real, sem pedir que o agente rode teste.
- Sem áudio, texto ou conteúdo de conversa.
- Funciona em Genesys Cloud, Amazon Connect e NICE CXone com a mesma extensão.
- In-Call Lock: remediação só depois da chamada.

## O que aprendemos e o que foi decidido
| Ideia | Origem | Decisão |
|---|---|---|
| Mostrar se a métrica está dentro do recomendado | Documentação Genesys e Amazon | **Feito** (RTT e perda no painel da estação; jitter fica sem referência por falta de fonte pública) |
| Separar VPN e DNS como causas | NetBeez | Roadmap, depende do que o navegador consegue medir |
| Teste por região de mídia | Genesys WebRTC Diagnostics | Roadmap |
