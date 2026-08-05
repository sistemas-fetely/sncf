import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

type Params = { de: string; ate: string };

function nomeArquivo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `pedidos-comercial_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v);
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? null : d;
}

export async function exportarPedidosComercial({ de, ate }: Params): Promise<number> {
  // a) leitura
  const { data, error } = await supabase
    .from("vw_pedidos_export_comercial")
    .select(
      "pedido, data_pedido, razao_social, apelido, valor, estagio, estagio_ordem, tag, pagamento, nf, transportadora, transportadora_origem, previsao_entrega, vendedor",
    )
    .gte("data_pedido", de)
    .lte("data_pedido", ate)
    .order("estagio_ordem", { ascending: true })
    .order("data_pedido", { ascending: false });

  if (error) throw new Error(`Falha ao consultar pedidos: ${error.message}${error.details ? ` — ${error.details}` : ""}`);
  const linhas = data ?? [];

  // b) planilha
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pedidos");
  ws.columns = [
    { header: "Pedido", key: "pedido", width: 14 },
    { header: "Data", key: "data_pedido", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Razão Social", key: "razao_social", width: 38 },
    { header: "Apelido", key: "apelido", width: 22 },
    { header: "Valor", key: "valor", width: 16, style: { numFmt: "R$ #,##0.00" } },
    { header: "Estágio", key: "estagio", width: 20 },
    { header: "Tag", key: "tag", width: 18 },
    { header: "Pagamento", key: "pagamento", width: 20 },
    { header: "NF", key: "nf", width: 14 },
    { header: "Transportadora", key: "transportadora", width: 24 },
    { header: "Embarque", key: "transportadora_origem", width: 14 },
    { header: "Previsão de Entrega", key: "previsao_entrega", width: 18, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Vendedor", key: "vendedor", width: 22 },
  ];

  for (const r of linhas as Record<string, unknown>[]) {
    ws.addRow({
      pedido: r.pedido ?? "",
      data_pedido: toDate(r.data_pedido),
      razao_social: r.razao_social ?? "",
      apelido: r.apelido ?? "",
      valor: r.valor == null ? null : Number(r.valor),
      estagio: r.estagio ?? "",
      tag: r.tag ?? "",
      pagamento: r.pagamento ?? "",
      nf: r.nf ?? "",
      transportadora: r.transportadora ?? "",
      transportadora_origem: r.transportadora_origem ?? "",
      previsao_entrega: toDate(r.previsao_entrega),
      vendedor: r.vendedor ?? "",
    });
  }

  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  ws.columns.forEach((col) => {
    let max = String(col.header ?? "").length;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const len = v instanceof Date ? 10 : String(v ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(Math.max(max + 2, 10), 50);
  });

  const arquivo = nomeArquivo();

  // c) log obrigatório antes do download
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Falha ao identificar usuário: ${authError.message}`);
  const userId = authData?.user?.id;
  if (!userId) throw new Error("Sessão não autenticada — exportação bloqueada.");

  const { error: logError } = await supabase.from("export_log").insert({
    recurso: "pedidos_comercial",
    filtro: { de, ate },
    linhas: linhas.length,
    arquivo_nome: arquivo,
    exportado_por: userId,
  } as never);
  if (logError)
    throw new Error(
      `Falha ao registrar o log da exportação: ${logError.message}${logError.details ? ` — ${logError.details}` : ""}${logError.hint ? ` (${logError.hint})` : ""}`,
    );

  // d) download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return linhas.length;
}
