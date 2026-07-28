
Investigação apenas — nenhuma correção proposta. Inventário completo abaixo.

## Arquivos que referenciam `status_caixa` ou `estagio` de `vw_despesas_v2`

Ignorei `src/integrations/supabase/types.ts` (auto-gerado) e a migration baseline (definição da view). Ficam 3 arquivos de aplicação:

### 1. `src/pages/administrativo/Despesas.tsx`
Fonte: `vw_despesas_v2` (linhas 147, 151).

- **Tipagem**
  - L56: `status_caixa: string | null;`
  - L60: `estagio: string | null;`

- **Mapa de rótulo/cor hardcoded (`ESTAGIO_META`)** — L82–L98 (declaração em L82, uso em L128):
  - L84: `completa` → label `"completa"`
  - L87: `aguardando_pagamento` → label `"aguardando_pagamento"`
  - L91: `sem_documento` → label `"sem_documento"`
  - L95: `a_classificar` → label `"a_classificar"`

- **Opções de filtro do Select de estágio** — L102–L105:
  - L102 `completa` / L103 `aguardando_pagamento` / L104 `sem_documento` / L105 `a_classificar`

- **Filtro por estágio** — L143 (state), L224 (`r.estagio !== estagio`), L397 (Select).

- **KPIs / comparações com literais**
  - L244: `r.status_caixa === "pago"` (contagem "pagas")
  - L245: `r.estagio === "a_classificar"` (contagem "a classificar")

- **Renderização de badge** — L126–L129, L491 (`<BadgeEstagio estagio={r.estagio} />`).

- **Observação:** nenhuma comparação com literal `'a_pagar'` neste arquivo (o KPI de pagas usa `status_caixa === "pago"` apenas).

### 2. `src/pages/administrativo/CaixaBanco.tsx`
Fonte: `vw_despesas_v2` (linhas 181, 185; `.select` inclui `status_caixa, estagio` em L190).

- **Tipagem**
  - L65: `status_caixa: string | null;`
  - L66: `estagio: string | null;`

- **Mapa de rótulo/cor hardcoded (`ESTAGIO_META`)** — L116–L132 (uso em L164):
  - L118: `completa` → label `"completa"`
  - L121: `aguardando_pagamento`
  - L125: `sem_documento`
  - L129: `a_classificar`
  - Constante auxiliar `A_CLASSIFICAR = "__a_classificar__"` em L89 (sentinel de filtro).

- **Comparações com literais de `estagio`**
  - L386: `l.estagio === "sem_documento" || l.estagio === "a_classificar"` (agrupamento/filtro).

- **Renderização de badge** — L162–L165, L714 (`<BadgeEstagio estagio={l.estagio} />`).

- **Observação:** nenhuma comparação com `status_caixa === "pago"` nem `"a_pagar"` neste arquivo — o campo é lido/selecionado, mas não filtrado por literal.

### 3. `src/pages/administrativo/CaixaBanco/utils.ts`
Não usa a view — trata `status_caixa` de outra origem (lançamentos de caixa, domínio interno `"em_aberto" | "pago" | "conciliado"`), NÃO o `status_caixa` de `vw_despesas_v2`.

- L17: tipo local `status_caixa: "em_aberto" | "pago" | "conciliado";`
- L52: `l.status_caixa === "conciliado"`
- L53: `l.status_caixa === "pago"`

Registrado por completude, mas é homônimo — semântica distinta da view.

## Respostas diretas às perguntas

1. **`status_caixa` comparado com `'pago'` / `'a_pagar'`:**
   - `'pago'`: apenas em `Despesas.tsx:244` (KPI "pagas"). Em `CaixaBanco/utils.ts:53` também, porém em domínio diferente (não é a view).
   - `'a_pagar'`: nenhuma ocorrência no repositório.

2. **`estagio` comparado com literais:**
   - `'a_classificar'`: `Despesas.tsx:245`, `CaixaBanco.tsx:386`.
   - `'sem_documento'`: `CaixaBanco.tsx:386`.
   - `'aguardando_pagamento'`: nenhuma comparação `===`; aparece apenas como chave em `ESTAGIO_META` (Despesas L87, CaixaBanco L121) e como valor de filtro (Despesas L103).
   - `'completa'`: nenhuma comparação `===`; aparece apenas como chave em `ESTAGIO_META` (Despesas L84, CaixaBanco L118) e valor de filtro (Despesas L102).

3. **Mapas de rótulo/cor hardcoded:**
   - `ESTAGIO_META` em `src/pages/administrativo/Despesas.tsx:82` (usado L128).
   - `ESTAGIO_META` em `src/pages/administrativo/CaixaBanco.tsx:116` (usado L164).
   - Os dois mapas são independentes (duplicados), cobrindo as mesmas 4 chaves: `completa`, `aguardando_pagamento`, `sem_documento`, `a_classificar`. Não há mapa hardcoded para valores de `status_caixa`.

Nada a alterar — aguardando instrução.
