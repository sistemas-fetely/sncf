// Pacote do Contador v2 — FALTANTES bancários (03/11/2026, Flávio).
// Importação sem original NÃO é faltante quando outra importação COM original, mesma conta e
// mesma fonte, cobre o arquivo: (a) mesmo nome normalizado, ou (b) período contido.
// (c) "linhas duplicadas na com arquivo" não é rastreável: a reimportação conta duplicadas
// mas não grava qual movimento casou — critério ignorado de propósito.
// Puro (sem Deno/npm): testado por vitest em src/lib/contabil/coberturaReimportacao.test.ts.

export type ImportacaoBanco = {
  id: string;
  conta_bancaria_id: string | null;
  fonte_tipo: string | null;
  nome_arquivo: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  created_at?: string | null;
  arquivo_storage_path: string | null;
};

export type Cobertura = { antiga: ImportacaoBanco; com_arquivo: ImportacaoBanco; criterio: "mesmo_nome" | "periodo_contido" };

/** "Extrato (3).XLSX" → "extrato.xlsx"; ignora caixa, acentos e sufixos " (N)". */
export function normalizarNomeArquivo(nome: string | null | undefined): string {
  const s = (nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const m = s.match(/^(.*?)(\.[a-z0-9]{1,5})?$/)!;
  const base = (m[1] ?? "").replace(/(\s*\(\d+\))+\s*$/, "").trim();
  return base + (m[2] ?? "");
}

function contido(a: ImportacaoBanco, b: ImportacaoBanco): boolean {
  if (!a.periodo_inicio || !a.periodo_fim || !b.periodo_inicio || !b.periodo_fim) return false;
  return a.periodo_inicio.slice(0, 10) >= b.periodo_inicio.slice(0, 10) && a.periodo_fim.slice(0, 10) <= b.periodo_fim.slice(0, 10);
}

/** Separa as sem original em cobertas (com par e critério) e faltantes. */
export function separarCobertas(semArquivo: ImportacaoBanco[], comArquivo: ImportacaoBanco[]): { cobertas: Cobertura[]; faltantes: ImportacaoBanco[] } {
  const cobertas: Cobertura[] = []; const faltantes: ImportacaoBanco[] = [];
  for (const a of semArquivo) {
    const mesmas = comArquivo.filter((b) => b.id !== a.id && b.arquivo_storage_path && b.conta_bancaria_id === a.conta_bancaria_id && b.fonte_tipo === a.fonte_tipo);
    const nome = normalizarNomeArquivo(a.nome_arquivo);
    const porNome = nome ? mesmas.find((b) => normalizarNomeArquivo(b.nome_arquivo) === nome) : undefined;
    if (porNome) { cobertas.push({ antiga: a, com_arquivo: porNome, criterio: "mesmo_nome" }); continue; }
    const porPeriodo = mesmas.find((b) => contido(a, b));
    if (porPeriodo) { cobertas.push({ antiga: a, com_arquivo: porPeriodo, criterio: "periodo_contido" }); continue; }
    faltantes.push(a);
  }
  return { cobertas, faltantes };
}

export type TipoFaltante = "bancario" | "mercado_pago" | "xml_entrada" | "nf_cancelada" | "devolucao" | "outros";

/** Tipo do faltante pela pasta (e fonte, para separar Mercado Pago dos bancos). */
export function tipoFaltante(pasta: string, fonteTipo?: string | null): TipoFaltante {
  if (pasta.startsWith("04_bancos")) return (fonteTipo ?? "").startsWith("mp_") ? "mercado_pago" : "bancario";
  if (pasta.startsWith("03_nfs_entrada")) return "xml_entrada";
  if (pasta.startsWith("02_nfs_saida/canceladas")) return "nf_cancelada";
  if (pasta.startsWith("02_nfs_saida/devolucoes")) return "devolucao";
  return "outros";
}

/** Causa do XML de entrada ausente. */
export type TentativaXml = { indisponivel_na_origem: boolean; erro: string | null } | null | undefined;
export function causaXmlEntrada(fonte: string | null | undefined, tentativa?: TentativaXml): string {
  if (fonte !== "qive") return `XML não guardado pelo SNCF (origem ${fonte ?? "desconhecida"})`;
  if (tentativa?.indisponivel_na_origem) return "Qive ainda não capturou o XML";
  if (tentativa?.erro) return `Qive recusou: ${tentativa.erro}`;
  return "XML não guardado pelo SNCF (Qive)";
}
