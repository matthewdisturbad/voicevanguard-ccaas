# Checklist de RIPD/DPIA e Pontos de Atenção Trabalhistas — VoiceVanguard CCaaS

> **MINUTA para revisão do jurídico. Não é parecer jurídico.**

Este checklist ajuda o **cliente (controlador)** a preparar o Relatório de Impacto à Proteção de Dados (RIPD/DPIA) e a conversar com o jurídico trabalhista. Ele **não afirma** que o uso da ferramenta é permitido ou proibido; isso depende do caso concreto, da política interna, de convenções coletivas e da avaliação de advogado(a). Campos entre [COLCHETES] são do cliente.

---

## Parte A. Fatos do tratamento (para descrever no RIPD)

Marque quando verificado pelo cliente.

- [ ] **Quem trata:** cliente (controlador) e TrustCo Technologies (operadora); suboperador Railway (hospedagem). Outros suboperadores: [VERIFICAR].
- [ ] **Titulares:** operadores/agentes e supervisores. Quantidade estimada: [Nº].
- [ ] **Dados tratados:** nome do operador, estação/agentId, torre, ID da chamada, início/fim/duração, jitter, RTT, perda, MOS estimado, tipo de rede, faixa de CPU/memória, incidentes de áudio (códigos), trocas de dispositivo, resultado do pré-check, latência de API por hostname, hostname da página.
- [ ] **Não tratados (confirmar na configuração do cliente):** áudio, transcrição, conteúdo de conversas, dados de cartão, URL/caminho de APIs, nomes de dispositivos.
- [ ] **Fluxo:** extensão no navegador (instalada via GPO/Intune com chave da torre) → servidor do VoiceVanguard (Railway) → console do supervisor.
- [ ] **Retenção atual:** 500 chamadas mais recentes por cliente; estações inativas removidas após 24 h; 50 chamadas locais no navegador. Prazo desejado pelo cliente: [PRAZO].
- [ ] **Acesso:** supervisores por chave, restritos às torres liberadas. Lista de quem tem chave: [LISTA]. Processo de revogação/rotação: [PROCESSO].
- [ ] **Controles técnicos reais:** chaves distintas agente/supervisor, isolamento por tenant e torre, limitação de tentativas, validação de entrada, TLS no proxy, In-Call Lock.
- [ ] **Limitações a registrar como risco:** histórico **sem criptografia em repouso pela aplicação**; sem trilha de auditoria detalhada de acessos; instância única; exclusão por titular feita manualmente.

## Parte B. Roteiro do RIPD/DPIA

- [ ] Descrição do tratamento e do contexto (home office, call center, BPO).
- [ ] **Finalidade específica** e legítima; registrar o que o cliente **não** fará com os dados.
- [ ] **Base legal** escolhida e justificativa: [A VALIDAR PELO JURÍDICO]. Avaliar se consentimento é adequado em relação de emprego (frequentemente discutido como frágil; validar).
- [ ] **Necessidade e proporcionalidade:** o mesmo objetivo poderia ser atingido com menos dados (ex.: sem nome do operador, só estação)? Registrar a decisão.
- [ ] **Minimização:** avaliar pseudonimizar o campo "nome do operador" (usar matrícula ou código) [DECISÃO].
- [ ] Teste de legítimo interesse (LIA), se essa for a base: [DOCUMENTO].
- [ ] **Riscos** aos titulares (ex.: uso indevido para vigilância; exposição por acesso excessivo de supervisores; vazamento de chaves; histórico sem criptografia em repouso), com probabilidade, impacto e medida de mitigação.
- [ ] **Medidas de mitigação** adotadas: [LISTA] (ex.: perfis de supervisor por torre, rotação de chaves, aviso aos agentes, prazo de retenção, política de uso).
- [ ] **Transparência:** entrega do Aviso de Ciência aos agentes (`AVISO_DE_CIENCIA_AGENTE.md`) e registro de ciência.
- [ ] **Direitos dos titulares:** canal e prazo; encarregado: [DPO].
- [ ] **Operador e suboperadores:** DPA assinado; verificação da lista de suboperadores e da região de hospedagem.
- [ ] **Transferência internacional:** verificar e documentar mecanismo: [COMPLETAR].
- [ ] **Incidentes:** plano e responsável; prazos de comunicação ao operador, à ANPD e aos titulares.
- [ ] **Revisão periódica** do RIPD: [PERIODICIDADE] e a cada mudança relevante (novas funções, novos dados).
- [ ] Parecer do encarregado e aprovação: [NOME/DATA].

## Parte C. Pontos de atenção na relação de trabalho

Itens para levar a advogado(a) trabalhista. Nenhum deles é conclusão jurídica.

1. **Transparência e ciência prévia:** o trabalhador foi informado, de forma clara e antes do início, do que é coletado e para quê? Há registro da ciência? [EVIDÊNCIA]
2. **Finalidade técnica x controle de desempenho:** a política deixa claro se os dados servem só para diagnóstico técnico ou também para avaliação/disciplina? Se houver uso disciplinar, isso está previsto na política interna e é comunicado? [DEFINIR COM O JURÍDICO]
3. **Delimitação ao ambiente e horário de trabalho:** a extensão atua apenas nas páginas do Genesys Cloud/Amazon Connect, mas confirmar se há risco de coleta fora do expediente (ex.: navegador/estação deixados abertos, uso pessoal do mesmo perfil de navegador ou do mesmo computador). Avaliar orientação para separar uso pessoal e profissional e a quem pertence o equipamento (corporativo ou do trabalhador em home office).
4. **Home office:** verificar contrato/aditivo de teletrabalho, regras sobre equipamento e internet do trabalhador, e se o tipo de rede e o estado do equipamento coletados são compatíveis com o que foi acordado.
5. **Política interna:** existe política de uso de ferramentas de monitoramento/privacidade? Precisa ser criada ou atualizada, e deve prever acesso, retenção, canal de dúvidas e consequências. [POLÍTICA / VERSÃO]
6. **Dados do nome do operador:** avaliar se a identificação nominal é necessária ou se um código basta.
7. **Acesso por supervisores:** quem pode ver o quê (torres); evitar acesso amplo sem necessidade; registrar quem recebe chaves.
8. **Negociação coletiva e representação:** verificar com advogado(a) trabalhista se acordo ou convenção coletiva, sindicato, CIPA ou comissão de representantes têm algo a prever, exigir consulta/informação ou se convém comunicá-los. [A VERIFICAR]
9. **Grupos específicos:** pessoas com deficiência, gestantes, estagiários, terceirizados/BPO: verificar se há regras adicionais e quem é o empregador de cada grupo (cliente final ou BPO).
10. **Cadeia contratual BPO:** quando o cliente é um BPO e atende contratantes finais, definir quem é controlador de qual dado e se o contratante final precisa ser informado ou autorizar. [A VERIFICAR]
11. **Uso de resultados:** definir se o pré-check "não pronta" pode gerar consequência ao trabalhador e qual (ex.: apenas orientação técnica) [DEFINIR].
12. **Decisões automatizadas:** os indicadores (alerta, classificação, MOS) são apoio técnico; evitar decisões sobre o trabalhador baseadas somente neles, sem revisão humana [VALIDAR].
13. **Registro e prova:** se os dados forem usados em disputa, avaliar integridade, contexto e limites de precisão (MOS é estimativa baseada em G.107, não medição de áudio).

## Parte D. Aprovação interna

| Item | Responsável | Data | Situação |
|---|---|---|---|
| RIPD concluído | [NOME] | [DATA] | [ ] |
| Parecer do encarregado | [DPO] | [DATA] | [ ] |
| Revisão trabalhista | [ADVOGADO(A)] | [DATA] | [ ] |
| DPA assinado | [NOME] | [DATA] | [ ] |
| Aviso entregue aos agentes | [RH/TI] | [DATA] | [ ] |
| Política interna atualizada | [NOME] | [DATA] | [ ] |
