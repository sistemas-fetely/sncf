// deno-lint-ignore-file no-explicit-any require-await
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
const servir = Deno.serve;
(Deno as any).serve = () => {};
const { inventario, pdfManifesto } = await import("./index.ts");
(Deno as any).serve = servir;

function clientesInventario(erroUpload = false) {
  const uploads: string[] = [];
  const client: any = { from: (tabela: string) => {
    const q: any = {};
    const data = tabela === "contabil_fechamento" ? { id: "fech", status: "fechado" } : tabela === "vw_recebivel_b2b" ? [{ id: "t", cliente: "Cliente", parceiro_id: "p", data_compra: "2026-10-01", data_vencimento: "2026-10-30", data_recebimento: "2026-11-05", valor: 120.25 }] : [];
    for (const m of ["select", "eq", "gte", "lte", "lt", "neq", "not", "or", "order", "in", "limit", "single", "range"]) q[m] = () => q;
    q.then = (resolve: any, reject: any) => Promise.resolve({ data, error: null, count: 0 }).then(resolve, reject);
    return q;
  }, rpc: () => { const q: any = { range: () => q, then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) }; return q; }, storage: { from: () => ({ upload: async (path: string) => { uploads.push(path); return { error: erroUpload && path.endsWith("clientes_em_aberto.xlsx") ? { message: "armazenamento negado" } : null }; } }) } };
  return { client, uploads };
}
const rem = { competencia: "2026-10-01", periodo_inicio: "2026-10-01", periodo_fim: "2026-10-31", versao: 7, natureza: "definitiva", progresso: { planilha_path: "pacotes/2026-10/v7/planilha.xlsx" } };
Deno.test("inventário simulado inclui relatório uma vez e manifesto só com totais sem uploads", async () => {
  const { client, uploads } = clientesInventario();
  const r = await inventario({ admin: client, userDb: client }, rem, true);
  assertEquals(uploads, []);
  assertEquals(r.entradas.filter(e => e.zip.includes("Clientes_em_Aberto")), [{ zip: "01_relatorios/Clientes_em_Aberto_10-2026.xlsx", path: "pacotes/2026-10/v7/clientes_em_aberto.xlsx" }]);
  assertEquals(r.manifesto.pastas["01_relatorios"].arquivos, 5);
  assertEquals(r.manifesto.clientes_em_aberto, { posicao: "2026-10-31", qtd: 1, total: 120.25, qtd_vencidos: 1, total_vencido: 120.25, clientes: 1, recebidos_depois: 1 });
  assertEquals((await pdfManifesto({ ...r.manifesto, partes: 1, gerado_em: "2026-11-16" })).length > 0, true);
});
Deno.test("inventário real grava relatório no caminho versionado e propaga erro de upload", async () => {
  const { client, uploads } = clientesInventario();
  await inventario({ admin: client, userDb: client }, rem);
  assertEquals(uploads.filter(p => p.endsWith("clientes_em_aberto.xlsx")), ["pacotes/2026-10/v7/clientes_em_aberto.xlsx"]);
  const ruim = clientesInventario(true);
  await assertRejects(() => inventario({ admin: ruim.client, userDb: ruim.client }, rem), Error, "Falha ao gravar Clientes em aberto: armazenamento negado");
});