# CLAUDE.md — Sistema Nervoso Central Fetely (SNCF)
> Leia este arquivo inteiro antes de qualquer ação. É o briefing do projeto.

---

## Quem é a Fetely

Marca brasileira de celebração e lifestyle. Vende artigos para festa e mesa (velas numéricas Lumier + utensílios Célébrée). Filosofia: **democratizar o luxo nas celebrações**. Tese criativa: **70% Dopamina / 30% Luxo**.

**Filtro universal:** *"Isso tornaria um momento mais especial?"* — vale para produto, código, tela, e-mail.

**Frase síntese:** *"Gesto não se delega pro ChatGPT."*

---

## O Sistema — SNCF

**SNCF = Sistema Nervoso Central Fetely.** Também chamado de "Uauuu" internamente.

- **Stack:** React + TypeScript + Vite + Tailwind + Shadcn/UI + Supabase + React Query
- **Repositório:** github.com/sistemas-fetely/people-fetely-29d8a45f
- **Produção:** https://people-fetely.lovable.app
- **Ferramenta dev principal:** Lovable Pro 3
- **IA do sistema:** Gemini 2.5 Flash (Fala Fetely)
- **Supabase:** gerenciado via Lovable — não aparece no dashboard direto

**Arquitetura:** 1 Portal + 7 Sistemas (People Fetely, Financeiro Fetely, Administrativo Fetely, TI Fetely, Produto Fetely, Gestão à Vista, ADM SNCF).

---

## Pessoas

- **Flávio** (Loopa Loopa) — dono/builder, Super Admin, direção técnica e estratégica
- **Joseph Emile Soued** — administrador societário
- **Isabella Vieira** — colaboradora / usuária de teste

---

## Regras de Ouro — NUNCA violar

1. **GitHub é verdade.** Memória é hipótese até provar no código. Sempre `git pull` + leitura real antes de afirmar qualquer coisa sobre o código.
2. **Fechar antes de abrir.** Não empilhar pendências novas em cima de antigas.
3. **Banco protege estado. RPC protege UX.** Nunca ao contrário.
4. **Dimensão via tabela, nunca hardcode.** área, cargo, unidade, sistema etc. vêm de tabelas. Se tabela não existe → STOP e cria primeiro.
5. **Todo módulo nasce com Mapa de Fluxos antes da 1ª linha de código.**
6. **Sem feature órfã.** Toda feature com R humano identificável gera/atualiza processo em Processos Fetely + enriquece Fala Fetely.
7. **CLT e PJ = mesmo tratamento.** Diferença só na base legal.
8. **Sistema sugere. Humano decide.** Nunca ação automática em decisão com risco.
9. **Simples primeiro.** Algoritmo simples antes de sofisticar.
10. **Nenhuma sessão fecha sem atualizar a Arquitetura de Sistemas.**

---

## Doutrinas Técnicas Permanentes

- **Hook de cargos:** `useCargos(filtroTipo?)` — nunca `useParametros("cargo")`
- **Tipos centralizados** em `src/types/index.ts`
- **Validação:** React Hook Form + Zod (tempo real)
- **Permissões:** `PermissionGate` + `ProtectedRoute` via `permModule` + `permAction`
- **Permissão central:** `usuario_pode(user_id, slug, acao)` → boolean. Super admin sempre TRUE.
- **Edge Functions:** usar `supabase.functions.invoke()` — nunca fetch direto
- **Edge Functions auth:** usar `getUser(token)` não `getClaims()` (ES256)
- **IA no sistema:** só `google/gemini-2.5-flash` confirmado funcionando
- **Idempotency keys** com `Date.now()` em e-mails
- **Supabase calls legacy:** usar `(supabase as any)` quando necessário
- **TypeScript:** sempre validar `npx tsc --noEmit` antes de enviar ao Lovable

---

## Divisão Claude Code × Lovable

| Claude Code faz | Lovable faz |
|---|---|
| SQL, migrations, triggers, RPCs | Telas grandes (>300 linhas) |
| Hooks/contracts críticos | Componentes auxiliares |
| Arquivos fundação (<150 linhas) | Refactoring de UI |
| Validação pós-publicação | Bulk edits de UI |
| Documentação de DB | |

**SQL/RLS acoplado = Claude Code. UI only = Lovable.**

---

## Protocolo de Trabalho (Mochileiro)

**Antes de qualquer código:**
1. `git pull` no clone local
2. Ler o arquivo a modificar com grep/view
3. Ver estado real — NUNCA chutar
4. NUNCA dizer "não tenho acesso" sem testar primeiro

**Entrega de código:**
- Via arquivo com caminho exato
- NUNCA pedir "localize a linha X"
- NUNCA misturar SQL com TypeScript sem deixar claro qual roda onde
- SQL Editor do Lovable (Cloud → SQL Editor) para fixes rápidos de DB

**Comunicação:**
- Recomendação explícita — nunca A/B/C neutro
- Pergunta que muda o prompt → para e pergunta antes de codar
- Fechamento de decisão: resumo coeso/simples/claro
- Perguntas em lista numerada simples

---

## Dimensões Visíveis vs Silenciosas

**Visível** (vive em /parametros, Admin pode adicionar sem trocar código):
formas_pagamento, centros_custo, canais_venda, plano_contas

**Silenciosa** (CHECK/enum, lista fechada, muda só com código):
tipo_pessoa, tipo_controle, pix_tipo, status de workflow

**Teste:** "Admin pode adicionar opção SEM trocar código?" Sim = visível. Não = silenciosa.

---

## Arquitetura Financeira (Doutrina Fluxo Despesa)

- **Portal único:** toda despesa entra por Contas a Pagar — nunca entrada direta em movimentações
- **Workflow:** rascunho → aprovado → aguardando_pagamento → pago → conciliado
- **Trigger AFTER UPDATE** em "pago" chama `gerar_movimentacao_de_conta()`
- **`movimentacao_bancaria_id`** = flag de idempotência (não gera duplicata)
- **Origens aceitas:** manual, cartao, fatura_cartao, csv_qive, xml_nfe, pdf_nfe, nf_pj_interno, api_bling, csv, recorrente, ofx_avulso

---

## Estado Atual (HEAD: 7f0bbdff — 04/05/2026)

**Último delta (v10):**
- Função `recalcular_status_nf_stage()` — idempotente, recalcula status do stage
- Trigger `trg_cpr_recalc_stage_status` em contas_pagar_receber
- Status `parcial` em nfs_stage (badge azul "Parcial M/N")
- Removido update manual de status nos componentes front (trigger assume)

**Pendências urgentes:**
- Testar Bateria Delta v10 (5 cenários mapeados na Arquitetura Seção 19)
- Sprint 1.2 — Tela de Regras de categorização
- Sprint 4 — Compromissos Universais (boleto parcelado + recorrentes)
- Dialog "É a mesma compra?" para score==2 (5 decisões pendentes do Flávio)
- Sprint C2 — Gerenciador de Usuários

---

## Menu — Onde cada módulo mora

| Quem reclama se sumir | Mora em |
|---|---|
| Todo colaborador | Portal |
| Só RH | People Fetely |
| Só Financeiro | Financeiro Fetely |
| Só Administrativo | Administrativo Fetely |
| Só TI | TI Fetely |
| Quem precisa de KPI | Gestão à Vista |
| Ninguém operacional (só config) | ADM SNCF |

---

## Anti-padrões — NUNCA fazer

- ❌ Afirmar que algo existe no código sem verificar no repo
- ❌ Hardcode de valores de negócio em arrays/enums no código
- ❌ Criar tabela nova sem checar se já existe
- ❌ DROP de coluna/tabela sem listar o que depende dela
- ❌ Dois campos apontando pro mesmo dado (string + FK paralelas)
- ❌ Ação automática irreversível sem confirmação humana
- ❌ Feature nova sem atualizar Processos Fetely + Fala Fetely
- ❌ Módulo novo sem Mapa de Fluxos primeiro
- ❌ `google/gemini-3-flash-preview` — não existe, causa falha silenciosa

---

*SNCF · Fetely · Documento vivo — atualizar a cada sprint*
