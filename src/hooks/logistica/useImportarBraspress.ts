// Destino no repo: src/hooks/logistica/useImportarBraspress.ts
// Importador BRASPRESS — UM arquivo "export_minhas_encomendas_*.xlsx" (aba CONHECIMENTO) alimenta DUAS tabelas:
//   • transp_fretes         (direct upsert)  — só linhas COM NUM CONHECIMENTO (cte_numero é NOT NULL)
//   • transp_rastreio_nf    (RPC)            — TODAS as linhas com NF
// Regras travadas: série ausente -> 'U' (nunca descartar rastreio); eh_devolucao fica false por ora
// (Braspress usa texto livre sem código; mapear termos de devolução depois).
// Obs: recomenda-se aplicar o guard do RPC (SNCF_rastreio_rpc_codigo_guard.sql) para não gravar
// texto livre em ocorrencia_codigo; sem ele, Braspress ainda importa (código fica com o texto).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { str, num, intVal, padCnpj, cleanNf, parseDataBR, acharLinhaHeader } from "./_parse";

const COLUNAS_CHAVE = ["NOTA FISCAL", "NUM CONHECIMENTO", "STATUS", "ULTIMA OCORRÊNCIA", "VALOR TOTAL FRETE"];
const SERIE_PADRAO = "U"; // Braspress não traz série

export type PreviewBraspress = {
  arquivo: File;
  totalLinhas: number;
  comCte: number; // irão para transp_fretes
  semCte: number; // só rastreio
  headerOk: boolean;
  colunasFaltantes: string[];
  header: string[];
  rows: any[][];
};

function idxDe(header: string[], nome: string): number {
  const alvo = nome.trim().toUpperCase();
  return header.findIndex((h) => (h ?? "").trim().toUpperCase() === alvo);
}

export async function lerPreviewBraspress(arquivo: File): Promise<PreviewBraspress> {
  const buffer = await arquivo.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
  const hIdx = acharLinhaHeader(matrix, ["NOTA FISCAL", "NUM CONHECIMENTO"]);
  if (hIdx < 0) {
    return { arquivo, totalLinhas: 0, comCte: 0, semCte: 0, headerOk: false, colunasFaltantes: COLUNAS_CHAVE, header: [], rows: [] };
  }
  const header = (matrix[hIdx] || []).map((c) => (c == null ? "" : String(c).trim()));
  const presentes = new Set(header.map((h) => h.toUpperCase()));
  const colunasFaltantes = COLUNAS_CHAVE.filter((c) => !presentes.has(c.toUpperCase()));
  const rows = matrix.slice(hIdx + 1).filter((r) => Array.isArray(r) && r.some((v) => v !== null && v !== ""));
  const iCte = idxDe(header, "NUM CONHECIMENTO");
  const comCte = rows.filter((r) => str(iCte >= 0 ? r[iCte] : null)).length;
  return {
    arquivo,
    totalLinhas: rows.length,
    comCte,
    semCte: rows.length - comCte,
    headerOk: colunasFaltantes.length === 0,
    colunasFaltantes,
    header,
    rows,
  };
}

export function useImportarBraspress(transportadoraId: string | null) {
  const qc = useQueryClient();
  const [processando, setProcessando] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [resultado, setResultado] = useState<{ fretes: number; rastreios: number; semCte: number } | null>(null);

  async function importar(preview: PreviewBraspress) {
    if (!transportadoraId) {
      toast.error("Selecione a Braspress antes de importar.");
      return;
    }
    if (!preview.headerOk) {
      toast.error("Header inválido — colunas faltantes: " + preview.colunasFaltantes.join(", "));
      return;
    }

    setProcessando(true);
    setResultado(null);

    const sb: any = supabase;
    const h = preview.header;
    const c = {
      nf: idxDe(h, "NOTA FISCAL"),
      cte: idxDe(h, "NUM CONHECIMENTO"),
      cnpjDest: idxDe(h, "CNPJ DESTINATÁRIO"),
      remetente: idxDe(h, "REMETENTE"),
      destinatario: idxDe(h, "DESTINATARIO"),
      dtEmissao: idxDe(h, "DATA EMISSÃO"),
      previsao: idxDe(h, "PREVISÃO DE ENTREGA"),
      status: idxDe(h, "STATUS"),
      ultOcorr: idxDe(h, "ULTIMA OCORRÊNCIA"),
      dtOcorr: idxDe(h, "DATA OCORRÊNCIA"),
      cidadeOrig: idxDe(h, "CIDADE ORIGEM"),
      ufOrig: idxDe(h, "UF ORIGEM"),
      cidadeDest: idxDe(h, "CIDADE DESTINO"),
      ufDest: idxDe(h, "UF DESTINO"),
      valorFrete: idxDe(h, "VALOR TOTAL FRETE"),
      peso: idxDe(h, "PESO"),
      volume: idxDe(h, "VOLUME"),
      valorMerc: idxDe(h, "VALOR MERCADORIA"),
    };
    const at = (r: any[], i: number) => (i >= 0 ? r[i] : null);

    setEtapa("Identificando usuário…");
    const { data: userRes } = await sb.auth.getUser();
    const uid = userRes?.user?.id ?? null;
    const agora = new Date().toISOString();

    setEtapa("Carregando de-para de ocorrências…");
    const { data: deparaRows, error: deparaErr } = await sb
      .from("transp_ocorrencia_depara")
      .select("texto_padrao, codigo")
      .eq("transportadora_id", transportadoraId)
      .eq("ativo", true);
    if (deparaErr) {
      setProcessando(false);
      toast.error("Erro ao carregar de-para de ocorrências: " + deparaErr.message);
      throw deparaErr;
    }
    const depara = new Map<string, string>();
    for (const d of (deparaRows ?? []) as { texto_padrao: string; codigo: string }[]) {
      depara.set(String(d.texto_padrao ?? "").toUpperCase().trim(), String(d.codigo ?? "").trim());
    }
    function resolverOcorrencia(ultOcorr: unknown, status: unknown): string {
      const t1 = String(ultOcorr ?? "").toUpperCase().trim();
      const t2 = String(status ?? "").toUpperCase().trim();
      if (t1 && depara.has(t1)) return `${depara.get(t1)} - ${t1}`;
      if (t2 && depara.has(t2)) return `${depara.get(t2)} - ${t2}`;
      return t1 || t2 || "";
    }

    setEtapa("Normalizando linhas…");


    // RASTREIO (todas as linhas com NF)
    const rastreios = preview.rows
      .map((r) => ({
        nf_numero: cleanNf(at(r, c.nf)),
        nf_serie: SERIE_PADRAO,
        cte_numero: str(at(r, c.cte)),
        chave_nfe: null,
        destinatario: str(at(r, c.destinatario)),
        cnpj_destinatario: padCnpj(at(r, c.cnpjDest)),
        cep_destino: null,
        cidade_destino: str(at(r, c.cidadeDest)),
        uf_destino: str(at(r, c.ufDest)),
        status: str(at(r, c.status)),
        ocorrencia_ativa: resolverOcorrencia(at(r, c.ultOcorr), at(r, c.status)),
        ocorrencia_data: parseDataBR(at(r, c.dtOcorr)),
        data_entrega: null, // Braspress não traz data de entrega dedicada (regra futura)
        previsao_entrega: parseDataBR(at(r, c.previsao)),
        recebedor: null,
        valor_nf: num(at(r, c.valorMerc)),
        valor_cte: num(at(r, c.valorFrete)),
        centro_custo: null,
        natureza_mercadoria: null,
      }))
      .filter((x) => x.nf_numero);

    // FRETE (só linhas COM cte_numero — NOT NULL na transp_fretes)
    const fretes = preview.rows
      .map((r) => {
        const cte = str(at(r, c.cte));
        if (!cte) return null;
        const peso = num(at(r, c.peso));
        return {
          transportadora_id: transportadoraId,
          cte_numero: cte,
          cte_serie: SERIE_PADRAO,
          nf_numero: cleanNf(at(r, c.nf)),
          data_frete: parseDataBR(at(r, c.dtEmissao)),
          cte_emissao: parseDataBR(at(r, c.dtEmissao)),
          destinatario: str(at(r, c.destinatario)),
          destinatario_cidade: str(at(r, c.cidadeDest)),
          destinatario_uf: str(at(r, c.ufDest)),
          remetente: str(at(r, c.remetente)),
          remetente_cidade: str(at(r, c.cidadeOrig)),
          remetente_uf: str(at(r, c.ufOrig)),
          valor_nf: num(at(r, c.valorMerc)),
          frete_total: num(at(r, c.valorFrete)),
          peso_real: peso,
          peso_taxado: peso,
          volumes: intVal(at(r, c.volume)),
          ocorrencia_texto: resolverOcorrencia(at(r, c.ultOcorr), at(r, c.status)), // NÃO escrever ocorrencia_codigo (GENERATED)
          ocorrencia_data: parseDataBR(at(r, c.dtOcorr)),
          prazo_entrega: parseDataBR(at(r, c.previsao)),
          rastreio_codigo: cte,
          // canal: NÃO setado -> default 'b2b' (CHECK b2b/b2c). Braspress = B2B por padrão.
          importado_arquivo: preview.arquivo.name,
          importado_por: uid,
          importado_em: agora,
          atualizado_em: agora,
        };
      })
      .filter(Boolean) as any[];

    const semCte = preview.rows.length - fretes.length;

    if (rastreios.length === 0) {
      setProcessando(false);
      toast.error("Nenhuma linha com NF válida para importar.");
      return;
    }

    // GUARD-COUNT (antes) nas duas tabelas
    setEtapa("Contagem inicial…");
    const [{ count: frAntes }, { count: rsAntes }] = await Promise.all([
      sb.from("transp_fretes").select("*", { count: "exact", head: true }).eq("transportadora_id", transportadoraId),
      sb.from("transp_rastreio_nf").select("*", { count: "exact", head: true }).eq("transportadora_id", transportadoraId),
    ]);

    // 1) FRETE — upsert direto (só se houver linhas com CTe)
    if (fretes.length > 0) {
      const CHUNK = 300;
      for (let i = 0; i < fretes.length; i += CHUNK) {
        const lote = fretes.slice(i, i + CHUNK);
        setEtapa(`Gravando fretes ${Math.min(i + CHUNK, fretes.length)}/${fretes.length}…`);
        const { error } = await sb
          .from("transp_fretes")
          .upsert(lote, { onConflict: "transportadora_id,cte_numero,cte_serie" });
        if (error) {
          setProcessando(false);
          toast.error("Erro ao gravar fretes Braspress: " + error.message);
          throw error;
        }
      }
    }

    // 2) RASTREIO — via RPC
    setEtapa(`Gravando rastreio ${rastreios.length}…`);
    const { data: rpcData, error: rpcErr } = await sb.rpc("fn_importar_rastreio_nf", {
      p_transportadora_id: transportadoraId,
      p_arquivo: preview.arquivo.name,
      p_nfs: rastreios,
    });
    if (rpcErr) {
      setProcessando(false);
      toast.error("Erro ao gravar rastreio Braspress: " + rpcErr.message);
      throw rpcErr;
    }

    // GUARD-COUNT (depois)
    const [{ count: frDepois }, { count: rsDepois }] = await Promise.all([
      sb.from("transp_fretes").select("*", { count: "exact", head: true }).eq("transportadora_id", transportadoraId),
      sb.from("transp_rastreio_nf").select("*", { count: "exact", head: true }).eq("transportadora_id", transportadoraId),
    ]);

    // Best-effort: avança pedidos entregues (não fatal)
    setEtapa("Verificando entregas…");
    try {
      const { data: ent } = await sb.rpc("fn_transicionar_entregues");
      const entregues = ent?.entregues ?? 0;
      if (entregues > 0) toast.success(`${entregues} pedido(s) marcado(s) como Entregue`);
    } catch { /* silencioso */ }

    const rastreiosProc = Number(rpcData?.nfs_processadas ?? rastreios.length);
    const fretesNovos = (frDepois ?? 0) - (frAntes ?? 0);
    const rsNovos = (rsDepois ?? 0) - (rsAntes ?? 0);

    setEtapa("");
    setProcessando(false);
    setResultado({ fretes: fretes.length, rastreios: rastreiosProc, semCte });

    toast.success(
      `Braspress importada — ${fretes.length} frete(s) (${fretesNovos} novo(s)) · ` +
        `${rastreiosProc} rastreio(s) (${rsNovos} novo(s))` +
        (semCte > 0 ? ` · ${semCte} sem CT-e → só rastreio` : "")
    );

    qc.invalidateQueries({ queryKey: ["logistica", "fretes", transportadoraId] });
    qc.invalidateQueries({ queryKey: ["logistica", "rastreio", transportadoraId] });
  }

  return { processando, etapa, resultado, importar, reset: () => setResultado(null) };
}
