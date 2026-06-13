# Roadmap Fetely — SNCF
**Documento Vivo · 19/05/2026**
**Fonte única de verdade para melhorias, features novas e bugs mapeados fora de sprint.**

---

## Como usar

- **Engenheiro (Claude):** ao identificar melhoria ou gap durante qualquer sessão, registra aqui na hora — memória fresca, processo quente.
- **Arquiteto (Flavio):** revisa e prioriza. Move itens entre filas. Decide o que entra no próximo sprint.
- **Regra:** nenhum item entra em implementação sem passar por este arquivo primeiro. Nenhum item identificado fica só na memória — registra aqui.

---

## Legenda

**Tipo:** `melhoria` · `feature` · `bug` · `debt`
**Prioridade:** `🔴 alta` · `🟡 média` · `🟢 baixa`
**Domínio:** `financeiro` · `stage-nf` · `people` · `ged` · `contratos` · `infra`

---

## ✅ Entregue nesta sessão

| # | Título | Data | Notas |
|---|---|---|---|
| FOP→SNCF | Campo `meta.observacoesCliente` (obs visível ao cliente no PDF/email do FOP) agora transmitido, gravado em `pedidos.observacao_cliente` e exibido no `PedidoDetalhe`. `observacao_pedido` (obs interna Fetély) também passou a ser exibido — existia no banco desde 03/06 mas nunca tinha sido renderizado. RPC `receber_pedido_externo` recriada com 36º param. Backfill 1/1. | 12/06/2026 | — |
| B-57 (parcial) | "Observação do pedido acionável → tarefa/alerta" — os dois campos agora aparecem read-only no detalhe. A parte de "tornar acionável (tarefa/alerta)" continua em aberto no backlog. | 12/06/2026 | Movido para Concluído parcial. |

---

## 🔴 Fila — Próximo Sprint

*(itens aprovados pelo Arquiteto para implementar em breve)*

| # | Título | Tipo | Domínio | Notas |
|---|---|---|---|---|
| R-01 | Soluço de navegação — reload em toda troca de página | `bug` | `infra` | Sintoma: `<a href>` ou `window.location` em vez de `<Link>`/`navigate()`. Identificado 19/05. |
| R-02 | `vw_contas_pagar_consolidado` exporta `conta_id` como alias em vez de `plano_contas_id` | `debt` | `financeiro` | View precisa ser recriada com `plano_contas_id` direto + frontend ajustado. §3.2 incompleto na view. |

---

## 🟡 Backlog — Mapeado, Aguardando Priorização

| # | Título | Tipo | Domínio | Notas |
|---|---|---|---|---|
| B-01 | Classificação de NFs Vinculadas sem categoria | `melhoria` | `stage-nf` | NFs que foram vinculadas antes de serem classificadas ficam com `plano_contas_id` NULL. Adicionar atalho "Classificar com IA" na pill Vinculadas filtrando por sem categoria + propagar via `fn_nf_propagar_para_tudo`. R: operador financeiro (processo separado do importador). |
| B-02 | Hierarquia de verdade: NF sobrepõe Parceiro na classificação | `melhoria` | `stage-nf` · `financeiro` | NF é prova fiscal = fonte mais confiável. Classificação da NF deve sobrepor classificação do Parceiro. `fn_nf_propagar_para_tudo` já sobrescreve (não preenche só se vazio) — validar comportamento completo. `fn_detectar_inconsistencia_categoria` detecta mas não sobrepõe — revisar se deve sobrepor automaticamente. |
| B-03 | VINC-1 — Tela "Vinculações" | `feature` | `financeiro` | Visão única de todos docs vinculados em qualquer CPR. Registrado na Arquitetura v31. |
| B-04 | GED-1 — GED não mostra docs do Stage NF | `bug` | `ged` | Falta ponte `ged_documento_id` entre Stage NF e GED. Registrado na Arquitetura v31. |
| B-05 | STG-2 — Trigger fantasma em recibos | `bug` | `stage-nf` | Recibos aparecem com `status='vinculada'` automaticamente no import. Registrado na Arquitetura v31. |
| B-06 | Aplicar Doutrina #105 "Salvar e fechar" | `debt` | `financeiro` | `NovaContaPagarSheet`, `NovoContratoDialog`, `ParceiroFormSheet` — botão "Salvar e fechar" faltando. |
| B-07 | Gestão à Vista — conteúdo a implementar | `feature` | `financeiro` | Rota linkada na Arquitetura v31, conteúdo ainda não implementado. |
| B-08 | Pagamento de fatura de cartão — tela dedicada | `feature` | `financeiro` | Registrado na Arquitetura v31. |
| B-09 | Redesign Parceiros — visualização hierárquica de grupos | `feature` | `financeiro` | Registrado na Arquitetura v31. |
| B-10 | Renovação automática de contrato | `feature` | `contratos` | Registrado na Arquitetura v31. |
| B-11 | People Fetely — refeito pós-feira | `feature` | `people` | Aguarda conclusão do módulo financeiro. |
| B-12 | Folha CLT como porta de entrada CPR | `feature` | `people` · `financeiro` | Integração folha → Contas a Pagar. |
| B-13 | Bling B2B | `feature` | `infra` | Integração Bling com módulo comercial B2B. |

---

## ✅ Concluído (referência)

| # | Título | Entregue |
|---|---|---|
| C-01 | §3.2 — Padronização `plano_contas_id` em 10 tabelas | 18/05/2026 |
| C-02 | ENV-1 — Envio agrupado de parcelas por contrato | 18/05/2026 |
| C-03 | STG-1 — Pill "Vinculadas" no Stage NF | 18/05/2026 |
| C-04 | MIG-1 — CPR-LI (herança de classificação no contrato) | 18/05/2026 |
| C-05 | Fix vestígios §3.2/§3.5 — 20+ funções e arquivos frontend | 19/05/2026 |

---

*Atualizar a cada sessão. Itens identificados no meio de sprint entram aqui, não direto no código.*
*Última atualização: 12/06/2026*
