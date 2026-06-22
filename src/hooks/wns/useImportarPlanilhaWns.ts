import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const COLUNAS_ESPERADAS = [
  "PREFATURAMENTO_XPM","EVENTO_XPM","DATA_PRE","PREFATURAMENTO","PEDIDOWNS","NOTA_NUMERO",
  "N_PEDIDO_CLIENTE","TIPOSPEDIDOS","FILIAL","CLIENTE","NOME","TIPO_EMPRESA","CPF_CNPJ",
  "CIDADE","ESTADO","NUMERO","FRETE_PEDIDO","FRETE_PRE","PRODUTO","SKU","BARRA",
  "QUANTIDADE","PRECO","TOTAL",
];


export type PreviewArquivo = {
  arquivo: File;
  totalLinhas: number;
  headerOk: boolean;
  colunasFaltantes: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawRows: any[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (s === "") return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  let normalizado: string;
  if (temVirgula && temPonto) {
    // formato BR completo: "1.234,56" → ponto = milhar, vírgula = decimal
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    // só vírgula: "1234,56" → vírgula = decimal
    normalizado = s.replace(",", ".");
  } else {
    // só ponto ou só dígitos: "5.700" → ponto = decimal. NUNCA remover.
    normalizado = s;
  }
  const n = parseFloat(normalizado);
  return isNaN(n) ? null : n;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function int(v: any): number | null { const n = num(v); return n == null ? null : Math.trunc(n); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function str(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDataPre(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extrairCodigo(v: any): { codigo: number | null; raw: string | null } {
  const raw = str(v);
  if (!raw) return { codigo: null, raw: null };
  const m = raw.match(/^\s*(\d+)/);
  return { codigo: m ? parseInt(m[1], 10) : null, raw };
}

export async function lerPreview(arquivo: File): Promise<PreviewArquivo> {
  const buffer = await arquivo.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  const headersPresentes = new Set(Object.keys(rows[0] ?? {}).map((h) => h.trim().toUpperCase()));
  const colunasFaltantes = COLUNAS_ESPERADAS.filter((c) => !headersPresentes.has(c));
  return {
    arquivo,
    totalLinhas: rows.length,
    headerOk: colunasFaltantes.length === 0,
    colunasFaltantes,
    rawRows: rows,
  };
}

export function useImportarPlanilhaWns() {
  const qc = useQueryClient();
  const [processando, setProcessando] = useState(false);
  const [etapa, setEtapa] = useState<string>("");
  const [resultado, setResultado] = useState<{
    total_linhas: number;
    pedidos_consolidados: number;
    skus_consolidados: number;
  } | null>(null);

  async function importar(preview: PreviewArquivo) {
    if (!preview.headerOk) {
      toast.error("Header inválido — colunas faltantes: " + preview.colunasFaltantes.join(", "));
      return;
    }
    setProcessando(true);
    setResultado(null);
    setEtapa("Criando log de importação…");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;

    const { data: imp, error: errImp } = await sb
      .from("wns_importacoes")
      .insert({
        arquivo_nome: preview.arquivo.name,
        total_linhas: preview.totalLinhas,
        status: "processando",
      })
      .select("id")
      .single();

    if (errImp || !imp) {
      setProcessando(false);
      toast.error("Erro ao criar importação: " + (errImp?.message ?? "desconhecido"));
      return;
    }
    const importacaoId = imp.id as string;

    async function marcarErro(msg: string) {
      await sb
        .from("wns_importacoes")
        .update({ status: "erro", erro_detalhe: msg, concluida_em: new Date().toISOString() })
        .eq("id", importacaoId);
    }

    setEtapa("Carregando dimensões…");
    const [fasesRes, tiposRes] = await Promise.all([
      sb.from("wns_fases_xpm").select("wns_id"),
      sb.from("wns_tipos_pedido").select("codigo"),
    ]);
    if (fasesRes.error || tiposRes.error) {
      const msg = fasesRes.error?.message ?? tiposRes.error?.message ?? "erro ao ler dimensões";
      await marcarErro(msg);
      setProcessando(false);
      toast.error("Erro ao carregar dimensões: " + msg);
      return;
    }
    const fasesValidas = new Set<number>((fasesRes.data ?? []).map((f: { wns_id: number }) => f.wns_id));
    const tiposValidos = new Set<number>((tiposRes.data ?? []).map((t: { codigo: number }) => t.codigo));

    // Normalizar
    const linhas = preview.rawRows.map((r) => {
      const evento = extrairCodigo(r.EVENTO_XPM);
      const tipo = extrairCodigo(r.TIPOSPEDIDOS);
      return {
        pedidowns: int(r.PEDIDOWNS),
        prefaturamento_xpm: int(r.PREFATURAMENTO_XPM) ?? -1,
        evento_wns_id: evento.codigo != null && fasesValidas.has(evento.codigo) ? evento.codigo : null,
        evento_xpm_raw: evento.raw,
        data_pre: parseDataPre(r.DATA_PRE),
        prefaturamento: int(r.PREFATURAMENTO),
        nota_numero: int(r.NOTA_NUMERO),
        n_pedido_cliente: str(r.N_PEDIDO_CLIENTE),
        tipo_pedido_codigo: tipo.codigo != null && tiposValidos.has(tipo.codigo) ? tipo.codigo : null,
        tipo_pedido_raw: tipo.raw,
        filial: int(r.FILIAL),
        cliente_wns_id: int(r.CLIENTE),
        cliente_nome: str(r.NOME),
        tipo_empresa: int(r.TIPO_EMPRESA),
        cpf_cnpj: str(r.CPF_CNPJ),
        cidade: str(r.CIDADE),
        estado: str(r.ESTADO),
        numero: str(r.NUMERO),
        frete_pedido: num(r.FRETE_PEDIDO),
        frete_pre: num(r.FRETE_PRE),
        produto_id: int(r.PRODUTO),
        sku: str(r.SKU) ?? str(r.PRODUTO) ?? "",
        barra: str(r.BARRA),
        quantidade: int(r.QUANTIDADE) ?? 0,
        preco: num(r.PRECO),
        total: num(r.TOTAL),
        importacao_id: importacaoId,
      };
    });

    const CHUNK = 500;
    for (let i = 0; i < linhas.length; i += CHUNK) {
      const lote = linhas.slice(i, i + CHUNK);
      setEtapa(`Enviando linhas ${Math.min(i + CHUNK, linhas.length)}/${linhas.length}…`);
      const { error } = await sb
        .from("wns_linhas")
        .upsert(lote, { onConflict: "pedidowns,prefaturamento_xpm,sku" });
      if (error) {
        await marcarErro(error.message);
        setProcessando(false);
        toast.error("Erro ao gravar linhas: " + error.message);
        return;
      }
    }

    setEtapa("Consolidando pedidos…");
    const { data: rpcData, error: errRpc } = await sb.rpc("fn_wns_consolidar");
    if (errRpc) {
      await marcarErro(errRpc.message);
      setProcessando(false);
      toast.error("Erro ao consolidar: " + errRpc.message);
      return;
    }

    const pedidos_consolidados = Number(rpcData?.pedidos_consolidados ?? 0);
    const skus_consolidados = Number(rpcData?.skus_consolidados ?? 0);

    setEtapa("Vinculando NFs aos pedidos…");
    const { error: errVinc } = await sb.rpc("fn_wns_vincular_pedidos");
    if (errVinc) {
      toast.warning("Importação concluída, mas o vínculo automático de NFs falhou: " + errVinc.message);
    }

    setEtapa("Avançando estágios WNS…");
    const { data: transData, error: transErr } = await sb.rpc("fn_transicionar_expedidos");
    if (!transErr && transData) {
      const avancados = transData.avancados ?? 0;
      const alertados = transData.alertados ?? 0;
      if (avancados > 0) toast.success(`${avancados} pedido(s) avançaram para Em Transporte`);
      if (alertados > 0) toast.warning(`${alertados} pedido(s) com alerta logístico — verifique a Gestão de Pedidos`);
    }


    const { error: errFim } = await sb
      .from("wns_importacoes")
      .update({
        status: "concluida",
        total_linhas: linhas.length,
        linhas_novas: linhas.length,
        concluida_em: new Date().toISOString(),
      })
      .eq("id", importacaoId);

    if (errFim) {
      setProcessando(false);
      toast.error("Erro ao finalizar log: " + errFim.message);
      return;
    }

    setResultado({ total_linhas: linhas.length, pedidos_consolidados, skus_consolidados });
    setEtapa("");
    setProcessando(false);
    toast.success(
      `Importação concluída — ${linhas.length} linhas processadas, ${pedidos_consolidados} pedidos consolidados`
    );
    qc.invalidateQueries({ queryKey: ["wns-pedidos"] });
    qc.invalidateQueries({ queryKey: ["wns-linhas-pedido"] });
    qc.invalidateQueries({ queryKey: ["wns-skus"] });
  }

  return { processando, etapa, resultado, importar, reset: () => setResultado(null) };
}
