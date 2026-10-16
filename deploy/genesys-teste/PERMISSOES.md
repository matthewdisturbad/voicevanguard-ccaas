# Permissões e OAuth na org Genesys

## Resumo
| Necessidade | Hoje | Observação |
|---|---|---|
| OAuth client (Implicit, Code ou Client Credentials) | **Não** | Extensão e relay não chamam a API do Genesys. |
| Papel do usuário operador | **Sim** | Precisa usar o agent desktop com chamadas de voz WebRTC. |
| Integração Client App no Admin | **Não, por enquanto** | Os endpoints `/dashboard` e `/widget` do manifesto não existem. |
| Permissão no Chrome/Edge | **Sim** | Carregar extensão sem compactação (Modo do desenvolvedor). |

## 1. Usuário operador (teste da extensão)
No Genesys Cloud, em **Admin > Pessoas e permissões**, o usuário de teste precisa de um papel que permita:
- Entrar no agent desktop / Genesys Cloud (papel básico de usuário, por exemplo *Employee*).
- Fazer e receber chamadas de voz pelo navegador (telefonia WebRTC e uma estação/telefone atribuído).
- Estar numa fila (*Queue*) com chamadas, ou receber chamadas diretas, para gerar tráfego.

Os nomes exatos de papéis e permissões variam por org e mudam com o tempo: **confirme no Admin da sua org** em vez de copiar daqui. O teste não exige permissões administrativas para o operador.

Para o supervisor do VoiceVanguard, não há usuário Genesys: ele entra em `https://<dominio>/app` com a **supervisorKey** do relay.

## 2. Se o app virar Client App embutido (futuro)
O `05_Proposta_Publicacao_AppFoundry/genesys_client_app_manifest.json` declara as permissões `analytics:conversationDetail:view`, `telephony:plugin:all` e `user:profile:view`. Para cadastrar uma integração de teste na org:
1. Quem cadastra precisa de permissão de administrar integrações (Admin > Integrações). Confirme o papel no Admin.
2. Admin > Integrações > **+ Integração** > aplicativo cliente personalizado (*Custom Client Application*), tipo standalone/iframe.
3. URL da aplicação: `https://<dominio>/dashboard?tenant={{pcOrganization.id}}&lang={{pcLangTag}}&env={{pcEnvironment}}` (**rota ainda inexistente**).
4. Atribua a integração a um grupo de teste e ative.

Antes disso é preciso implementar `/dashboard` e `/widget` no relay e decidir se `analytics:conversationDetail:view` é realmente necessário. Hoje o produto não consulta essa API; peça só o que for usado.

## 3. Se um dia houver leitura da API do Genesys
Crie um **OAuth Client** na org de testes (Admin > Integrações > OAuth) com o papel de menor privilégio possível, e guarde `client_id` e `client_secret` **apenas em variáveis do Railway**, nunca no repositório. Hoje não é necessário.
