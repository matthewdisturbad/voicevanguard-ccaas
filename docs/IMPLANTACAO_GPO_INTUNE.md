# Implantação da extensão por política gerenciada (GPO / Intune)

A extensão lê a configuração de `chrome.storage.managed`, definida em `03_Chrome_Edge_Extension/managed_schema.json`. A operação (TI do cliente) instala a chave de **agente da torre** em cada grupo de máquinas; o agente não vê, não escolhe e não altera a chave (o popup só mostra "Configurada" e, com política ativa, o código ignora `SET_TENANT_KEY`).

| Campo | Obrigatório | Descrição |
|---|---|---|
| `tenantKey` | sim | Chave de agente da torre (ou do tenant, em contas sem torres) |
| `relayServer` | não | `wss://` do relay. Padrão: `wss://voicevanguard.trustco.pro`. Valores que não começam com `wss://` são ignorados |
| `operatorName` | não | Nome ou matrícula exibida ao supervisor. Vazio = só o identificador da estação |

## Chrome (Windows, GPO) e Edge
1. Publique a extensão (loja ou lista privada) e force a instalação com `ExtensionInstallForcelist`.
2. Aplique a política de extensão (`3rdparty\extensions\<ID>\policy`) com os campos acima. No Edge o caminho é `HKLM\Software\Policies\Microsoft\Edge\3rdparty\extensions\<ID>\policy`.
3. Uma política por grupo de máquinas (OU) = uma torre.

## Intune
Use a configuração de extensão do navegador (JSON com os mesmos campos) atribuída ao grupo de dispositivos da torre.

## Validação
Abra `chrome://policy` (ou `edge://policy`) na estação, confirme a política da extensão, e veja a estação aparecer no console do supervisor da torre.

**Aviso:** o fluxo foi testado em ambiente de desenvolvimento com o schema carregando; a validação com GPO/Intune reais ainda precisa ser feita no primeiro cliente piloto.
