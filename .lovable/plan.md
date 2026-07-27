
# Diagnóstico — Importador de fretes de transportadora

Investigação read-only. Nada foi alterado. Respostas ponto a ponto.

## 1. Arquivos do fluxo

- **UI (dialog)**: `src/components/logistica/ImportarFretesDialog.tsx` — drag-and-drop, aceita `.xlsx,.xls,.csv`.
- **Hook + parser + persistência**: `src/hooks/logistica/useImportarFretesTransportadora.ts` — leitura CSV/XLSX, normalização, upsert em `transp_fretes`.
- **Botão que abre o dialog**: `src/components/logistica/AbaTransportadora.tsx` (via prop `transportadoraId`/`transportadoraNome`).
- **Sem edge function.** Persistência é `supabase.from("transp_fretes").upsert(...)` direto no cliente, mais uma chamada `rpc("fn_transicionar_entregues")` no fim.
- Helpers compartilhados existem em `src/hooks/logistica/_parse.ts`, mas **este hook não os usa** — tem cópias locais (`num`, `int`, `str`, `parseDataBR`, `limparExcelText`). Os helpers de `_parse.ts` foram criados para o importador Braspress/rastreio (`useImportarBraspress.ts`), não para este.

## 2. Como o formato é detectado

**Só por extensão do arquivo**, depois que o usuário já escolheu a transportadora. Não há sniffing de conteúdo, não há seletor de layout.

```ts
// useImportarFretesTransportadora.ts:141-142
const nome = arquivo.name.toLowerCase();
const rows = nome.endsWith(".csv") ? await lerCsvIcaro(arquivo) : await lerXlsx(arquivo);
```

`.csv` → assume layout Ícaro (windows-1252, `;`). Qualquer outra extensão cai no ramo XLSX. **O nome "Braspress" no dialog é só rótulo** — o parser aqui é um só e é o layout da Ícaro; o importador da Braspress é outro (`ImportarBraspressDialog` + `useImportarBraspress`).

## 3. Mapeamento de colunas

**Por nome de cabeçalho**, com match exato (case-sensitive, incluindo acentos e o `°`/`º` correto). Definido em `COLUNAS_ESPERADAS` (linhas 7-18) e aplicado na construção de cada linha (linhas 184-230):

```ts
export const COLUNAS_ESPERADAS = [
  "Data Frete", "Tipo Frete", "N° Minuta", "N° CT-e", "Série", "Emissão CT-e",
  "Notas Fiscais", "N° Referência", "Doc. Ant.", "Nº DI/DTA", "Nº HAwb", "Nº MAwb",
  ...
  "Prazo Entrega", "Última ocorrência", "Data última ocorrência",
];
...
const linhas = preview.rawRows.map((r) => ({
  ...
  minuta: str(r["N° Minuta"]),
  cte_numero: str(r["N° CT-e"]),
  cte_serie: str(r["Série"]),
  cte_emissao: parseDataBR(r["Emissão CT-e"]),
  nf_numero: limparExcelText(r["Notas Fiscais"]),
  ...
  ocorrencia_texto: str(r["Última ocorrência"]),
  ocorrencia_data: parseDataBR(r["Data última ocorrência"]),
}));
```

Observação crítica: `"N° Minuta"` e `"N° CT-e"` usam **`°` (masculino ordinal U+00B0)**, enquanto `"Nº DI/DTA"`, `"Nº HAwb"`, `"Nº MAwb"` usam **`º` (numero U+00BA)**. Se o arquivo trouxer o glifo diferente do esperado, a coluna cai como "faltante" e o header é rejeitado.

## 4. Leitura do CSV

- Biblioteca: parser CSV próprio (`parseCsvLine`, linhas 94-112) — não usa PapaParse.
- Separador **fixo em `;`** — não detecta `,`.
- Encoding **fixo em `windows-1252`** via `TextDecoder("windows-1252")` (linha 117). Não há detecção de BOM UTF-8/UTF-16.
- Split de linhas: `texto.split(/\r?\n/)` — **não trata `\r` sozinho** (mesmo padrão que quebrou os parsers SafraPay antes).
- Aspas duplas suportadas, incluindo `""` escape.

```ts
async function lerCsvIcaro(arquivo: File): Promise<RawRow[]> {
  const buffer = await arquivo.arrayBuffer();
  const texto = new TextDecoder("windows-1252").decode(buffer);
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  ...
  const headers = parseCsvLine(linhas[0]).map((h) => h.trim());
  ...
}
```

XLSX é lido via `XLSX.read(buffer, { type: "array", cellDates: true })` + `sheet_to_json({ defval: null, raw: true })` (linhas 133-138). Sempre a primeira aba.

## 5. Validação de rejeição

Uma só, comparando o conjunto de headers da **primeira linha** com `COLUNAS_ESPERADAS`. Qualquer coluna esperada ausente marca `headerOk = false`:

```ts
// lerPreview, linhas 143-151
const headersPresentes = new Set(Object.keys(rows[0] ?? {}).map((h) => h.trim()));
const colunasFaltantes = COLUNAS_ESPERADAS.filter((c) => !headersPresentes.has(c));
return { ..., headerOk: colunasFaltantes.length === 0, colunasFaltantes, rawRows: rows };
```

Mensagem no `importar()` (linha 168):
```ts
toast.error("Header inválido — colunas faltantes: " + preview.colunasFaltantes.join(", "));
```

Não há validação de contagem total de colunas, nem de coluna extra. Há também um filtro pós-normalização que **descarta silenciosamente** linhas sem `cte_numero` + `cte_serie` (linha 233); só aparece como contagem no toast final ("N descartada(s) por falta de CT-e/Série").

## 6. Conversões

- **Números BR** (`4.648,04`, `396,29`): função `num` (linhas 34-47) — se tem `,` e `.` remove pontos e troca vírgula por ponto; se só tem vírgula troca por ponto; senão `parseFloat`.
- **Datas `dd/MM/yyyy HH:mm`**: `parseDataBR` (linhas 67-90) — regex `^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$`, monta `new Date(ano, mes-1, dia, hh, mm, ss)` no fuso local e retorna `toISOString()` (UTC). Aceita `Date` do Excel (via `cellDates: true`). **Efeito colateral**: datas locais viram UTC, então uma emissão `01/07/2026 00:00` no BRT é gravada como `2026-07-01T03:00:00Z`.
- **`="45"` envenenado pelo Excel**: só a coluna `"Notas Fiscais"` é limpa por `limparExcelText` (linhas 59-63), que remove `="` no início e `"` no fim:
  ```ts
  return s.replace(/^="?/, "").replace(/"?$/, "").trim() || null;
  ```
  Todas as outras colunas passam por `str()` puro — se vier `="3048066"` em minuta ou CT-e, entra no banco com as aspas e o `=`.

## 7. `TRT` e colunas extras

- **`TRT` não é tratado.** Não aparece em `COLUNAS_ESPERADAS` nem no mapeamento. Se estiver no arquivo, é ignorado.
- **Colunas extras em geral**: silenciosamente ignoradas. `sheet_to_json` / `parseCsvLine` populam `rawRows` com todas as colunas do header, mas o `.map` do `importar()` só lê os nomes fixos. Não há aviso ao usuário, não há erro.
- O caminho inverso (coluna esperada com nome ligeiramente diferente — `°` vs `º`, espaço em branco extra, capitalização) **quebra o header check** e bloqueia o import inteiro.

## Achados colaterais (não solicitados, mas visíveis)

- CSV: bug potencial de `\r` isolado no `split(/\r?\n/)` — mesmo padrão dos parsers SafraPay já corrigidos.
- Layout hardcoded para Ícaro: qualquer CSV de outra transportadora com header diferente cai direto em "header inválido".
- Filtro `cte_numero && cte_serie` descarta linhas de crédito/débito/reversão que não têm CT-e.

Investigação concluída. Aguardo definição do próximo passo para propor mudanças.
