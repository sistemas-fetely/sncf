import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const COLUNAS_OBRIGATORIAS = [
  "Name", "Email", "Financial Status", "Paid at", "Fulfillment Status", "Fulfilled at",
  "Currency", "Subtotal", "Shipping", "Total", "Discount Amount", "Shipping Method",
  "Created at", "Lineitem quantity", "Lineitem name", "Lineitem price", "Lineitem sku",
  "Shipping City", "Shipping Zip", "Shipping Province", "Payment Method",
  "Refunded Amount", "Id",
];

export type Etapa = "carregar" | "processar" | "concluido";

export interface ResultadoImport {
  total_linhas: number;
  total_pedidos: number;
  total_itens: number;
}

function parseShopifyDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  // "2026-06-11 21:44:21 -0300" → "2026-06-11T21:44:21-03:00"
  let v = trimmed.replace(" ", "T");
  // remove space before offset
  v = v.replace(/\s+([+-]\d{4})$/, "$1");
  // insert ":" in offset
  v = v.replace(/([+-])(\d{2})(\d{2})$/, "$1$2:$3");
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function numOr0(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function intOr0(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? 0 : n;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normalizarPagamento(raw: string | null): string | null {
  if (!raw) return null;
  const temPix = /pix/i.test(raw);
  const temCartoes = /cart[oõ]es|cartao|cartão/i.test(raw);
  const temCheckoutPro = /checkout pro/i.test(raw);
  if (temPix && !temCartoes) return "pix";
  if (temCartoes && !temPix) return "cartao";
  if ((temPix && temCartoes) || temCheckoutPro) return "misto";
  return null;
}

export async function parseCsvPreview(arquivo: File): Promise<{
  arquivo: File;
  totalLinhas: number;
  headerOk: boolean;
  colunasFaltantes: string[];
  rawRows: Record<string, string>[];
}> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(arquivo, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = new Set(result.meta.fields ?? []);
        const colunasFaltantes = COLUNAS_OBRIGATORIAS.filter((c) => !headers.has(c));
        resolve({
          arquivo,
          totalLinhas: result.data.length,
          headerOk: colunasFaltantes.length === 0,
          colunasFaltantes,
          rawRows: result.data,
        });
      },
      error: (err) => reject(err),
    });
  });
}

export function useImportarCsvShopify() {
  const qc = useQueryClient();
  const [processando, setProcessando] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("carregar");
  const [progresso, setProgresso] = useState<string>("");
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);

  function reset() {
    setProcessando(false);
    setEtapa("carregar");
    setProgresso("");
    setResultado(null);
  }

  async function importar(rawRows: Record<string, string>[]) {
    setProcessando(true);
    setEtapa("processar");
    setResultado(null);

    // 5a — Criar registro de importação
    setProgresso("Registrando importação…");
    const { data: importacao, error: errImp } = await supabase
      .from("shopify_importacoes")
      .insert({ status: "processando", total_linhas: rawRows.length })
      .select("id")
      .single();

    if (errImp || !importacao) {
      setProcessando(false);
      const msg = errImp?.message ?? "Falha ao criar registro de importação";
      toast.error(msg);
      throw new Error(msg);
    }

    const importacao_id = importacao.id;

    async function falhar(msg: string): Promise<never> {
      await supabase
        .from("shopify_importacoes")
        .update({ status: "erro", mensagem_erro: msg })
        .eq("id", importacao_id);
      setProcessando(false);
      toast.error(msg);
      throw new Error(msg);
    }

    try {
      // Agrupar por Name
      setProgresso("Agrupando linhas por pedido…");
      const grupos = new Map<string, Record<string, string>[]>();
      for (const linha of rawRows) {
        const name = (linha["Name"] ?? "").trim();
        if (!name) continue;
        if (!grupos.has(name)) grupos.set(name, []);
        grupos.get(name)!.push(linha);
      }

      const pedidos: Array<Record<string, unknown>> = [];
      const itens: Array<Record<string, unknown>> = [];

      for (const [, linhas] of grupos) {
        const primeira = linhas[0];
        const shopify_id = str(primeira["Id"]);
        if (!shopify_id) continue;

        const paymentRaw = str(primeira["Payment Method"]);

        pedidos.push({
          shopify_id,
          order_name: str(primeira["Name"]) ?? "",
          financial_status: (str(primeira["Financial Status"]) ?? "pending").toLowerCase(),
          fulfillment_status: (str(primeira["Fulfillment Status"]) ?? "unfulfilled").toLowerCase(),
          created_at_shopify: parseShopifyDate(primeira["Created at"]) ?? new Date().toISOString(),
          paid_at: parseShopifyDate(primeira["Paid at"]),
          fulfilled_at: parseShopifyDate(primeira["Fulfilled at"]),
          cancelled_at: parseShopifyDate(primeira["Cancelled at"]),
          total: numOr0(primeira["Total"]),
          subtotal: numOr0(primeira["Subtotal"]),
          shipping_cost: numOr0(primeira["Shipping"]),
          discount_amount: numOr0(primeira["Discount Amount"]),
          refunded_amount: numOr0(primeira["Refunded Amount"]),
          payment_method_raw: paymentRaw,
          payment_method: normalizarPagamento(paymentRaw),
          shipping_method: str(primeira["Shipping Method"]),
          shipping_city: str(primeira["Shipping City"]),
          shipping_province: str(primeira["Shipping Province"]),
          shipping_zip: str(primeira["Shipping Zip"]),
          importacao_id,
          updated_at: new Date().toISOString(),
        });

        for (const linha of linhas) {
          const skuOrName = str(linha["Lineitem sku"]) ?? str(linha["Lineitem name"]);
          if (!skuOrName) continue;
          itens.push({
            pedido_id: shopify_id,
            sku: str(linha["Lineitem sku"]),
            product_name: str(linha["Lineitem name"]),
            quantity: intOr0(linha["Lineitem quantity"]),
            unit_price: numOr0(linha["Lineitem price"]),
            fulfillment_status: str(linha["Lineitem fulfillment status"]),
          });
        }
      }

      // 5b — UPSERT pedidos em chunks de 50
      setProgresso(`Gravando ${pedidos.length} pedidos…`);
      const CHUNK = 50;
      const idsPedidos: string[] = pedidos.map((p) => p.shopify_id as string);

      for (let i = 0; i < pedidos.length; i += CHUNK) {
        const chunk = pedidos.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("shopify_pedidos")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(chunk as any, { onConflict: "shopify_id", ignoreDuplicates: false });
        if (error) await falhar(`Erro ao gravar pedidos: ${error.message}`);
      }

      // Deletar itens existentes para os pedidos atualizados
      setProgresso("Limpando itens antigos…");
      for (let i = 0; i < idsPedidos.length; i += CHUNK) {
        const chunkIds = idsPedidos.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("shopify_itens")
          .delete()
          .in("pedido_id", chunkIds);
        if (error) await falhar(`Erro ao limpar itens: ${error.message}`);
      }

      // Inserir itens em chunks
      setProgresso(`Gravando ${itens.length} itens…`);
      for (let i = 0; i < itens.length; i += CHUNK) {
        const chunk = itens.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("shopify_itens")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(chunk as any);
        if (error) await falhar(`Erro ao gravar itens: ${error.message}`);
      }

      // 5c — Concluir
      const { error: errFinal } = await supabase
        .from("shopify_importacoes")
        .update({
          status: "concluida",
          total_linhas: rawRows.length,
          total_pedidos: pedidos.length,
          total_itens: itens.length,
        })
        .eq("id", importacao_id);
      if (errFinal) await falhar(`Erro ao finalizar importação: ${errFinal.message}`);

      const res = {
        total_linhas: rawRows.length,
        total_pedidos: pedidos.length,
        total_itens: itens.length,
      };
      setResultado(res);
      setEtapa("concluido");
      setProcessando(false);
      qc.invalidateQueries({ queryKey: ["shopify_pedidos"] });
      toast.success(`${res.total_pedidos} pedidos importados · ${res.total_itens} itens`);
      return res;
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (e as any)?.message ?? String(e);
      await supabase
        .from("shopify_importacoes")
        .update({ status: "erro", mensagem_erro: msg })
        .eq("id", importacao_id);
      setProcessando(false);
      throw e;
    }
  }

  return { processando, etapa, progresso, resultado, importar, reset };
}
