import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { ProdutoMiniatura, useImagensProduto } from "@/components/venda-direta/ProdutoMiniatura";

/** Abre a impressão rápida do pedido de Venda Direta em nova aba. */
export function abrirImpressaoVD(pedidoId: string) {
  window.open(`/pedidos/venda-direta/${pedidoId}/imprimir`, "_blank", "noopener");
}

const MODAL: Record<string, string> = { sedex: "SEDEX", pac: "PAC", frete_fetely: "Frete Fetély", retirada: "Retirada no Site SP" };
const cpfMascarado = (cpf: string | null | undefined) => {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "—";
};
const fone = (t: string | null | undefined) => {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || "—";
};

interface Item { sku: string; quantidade: number; descricao?: string | null; valor_unitario?: number | null; cod_cadastro?: string | null }

export default function ImpressaoPedidoVD() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["venda-direta-impressao", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: p, error } = await (supabase as any).from("pedidos")
        .select("id, id_externo, data_pedido, parceiro_id, forma_solicitada, valor_bruto, valor_frete, valor_liquido, endereco_entrega, observacao_pedido, itens_json")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      if (!p) throw new Error("Pedido não encontrado.");
      const [gQ, cQ] = await Promise.all([
        supabase.from("vw_venda_direta_gestao" as never).select("*").eq("id", id as string).maybeSingle(),
        p.parceiro_id
          ? supabase.from("parceiros_comerciais").select("razao_social, cpf, telefone").eq("id", p.parceiro_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (gQ.error) throw gQ.error;
      if (cQ.error) throw cQ.error;
      const itens: Item[] = Array.isArray(p.itens_json) ? p.itens_json : [];
      const skus = itens.map((i) => i.sku);
      const nomes = new Map<string, { nome: string | null; cod: string | null }>();
      if (skus.length) {
        const { data: prods, error: e2 } = await (supabase as any).from("sncf_produtos").select("sku, nome_completo, cod_cadastro").in("sku", skus);
        if (e2) throw e2;
        for (const r of prods ?? []) nomes.set(r.sku, { nome: r.nome_completo, cod: r.cod_cadastro });
      }
      return { p, g: (gQ.data ?? {}) as any, c: (cQ.data ?? null) as any, itens, nomes };
    },
  });
  const img = useImagensProduto((q.data?.itens ?? []).map((i) => i.sku));
  const imprimiu = useRef(false);
  useEffect(() => {
    if (!q.data || imprimiu.current || img.isLoading) return;
    imprimiu.current = true;
    const t = window.setTimeout(() => window.print(), 600); // dá tempo para as miniaturas
    return () => window.clearTimeout(t);
  }, [q.data, img.isLoading]);

  if (q.isLoading) return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando pedido…</div>;
  if (q.isError || !q.data) return <p className="p-8 text-sm text-destructive">{rawMessage(q.error)}</p>;

  const { p, g, c, itens, nomes } = q.data;
  const ee = (p.endereco_entrega ?? {}) as any;
  const modal: string = ee.modal ?? "retirada";
  const valorItens = itens.reduce((s, i) => s + Number(i.valor_unitario ?? 0) * Number(i.quantidade ?? 0), 0) || Number(p.valor_bruto ?? 0);
  const frete = Number(p.valor_frete ?? 0);
  const total = Number(p.valor_liquido ?? 0);
  const desconto = Math.max(valorItens + frete - total, 0);
  const pago = !!g.pagamento_confirmado_em;
  const meioCod = g.pagamento ?? p.forma_solicitada;
  const meio = meioCod === "pix" ? "PIX" : meioCod === "cartao_maquininha" ? "Cartão maquininha" : "Cartão";
  const data = p.data_pedido ? new Date(p.data_pedido).toLocaleDateString("pt-BR") : "—";
  const mapaImg = img.data;

  return (
    <div className="impressao-vd mx-auto max-w-[210mm] bg-background p-8 text-sm text-foreground">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          .impressao-vd, .impressao-vd * { visibility: visible !important; }
          .impressao-vd { position: absolute; left: 0; top: 0; width: 100%; max-width: none; padding: 0; }
          .impressao-vd tr { break-inside: avoid; }
          .nao-imprimir { display: none !important; }
        }
      `}</style>
      <header className="flex items-end justify-between border-b pb-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight">Fetély</p>
          <p className="text-base font-medium">Pedido {p.id_externo ?? "—"}</p>
        </div>
        <div className="text-right">
          <p>{data}</p>
          <button type="button" className="nao-imprimir mt-1 text-xs text-primary underline" onClick={() => window.print()}>Imprimir de novo</button>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Cliente</h2>
          <p className="font-medium">{c?.razao_social ?? g.cliente_nome ?? "—"}</p>
          <p>CPF {cpfMascarado(c?.cpf)}</p>
          <p>{fone(c?.telefone ?? g.cliente_telefone)}</p>
        </div>
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Entrega</h2>
          {modal === "retirada" ? <p className="font-medium">Retirada no Site SP</p> : (
            <>
              <p className="font-medium">{MODAL[modal] ?? modal}</p>
              <p>{[ee.logradouro, ee.numero].filter(Boolean).join(", ")}{ee.complemento ? ` — ${ee.complemento}` : ""}</p>
              <p>{[ee.bairro, ee.cidade, ee.uf].filter(Boolean).join(" · ")}{ee.cep ? ` · CEP ${ee.cep}` : ""}</p>
            </>
          )}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Itens</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1 pr-2" />
              <th className="py-1 pr-2">Código</th>
              <th className="py-1 pr-2">SKU</th>
              <th className="py-1 pr-2">Descrição</th>
              <th className="py-1 pr-2 text-right">Qtd</th>
              <th className="py-1 pr-2 text-right">Unitário</th>
              <th className="py-1 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const n = nomes.get(i.sku);
              const un = Number(i.valor_unitario ?? 0);
              return (
                <tr key={i.sku} className="border-b align-middle">
                  <td className="py-1.5 pr-2"><ProdutoMiniatura img={mapaImg?.get(i.sku)} tamanho={36} /></td>
                  <td className="py-1.5 pr-2 tabular-nums font-medium">{n?.cod ?? i.sku}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{i.sku}</td>
                  <td className="py-1.5 pr-2">{n?.nome ?? i.descricao ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{i.quantidade}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatBRL(un)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatBRL(un * Number(i.quantidade ?? 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Pagamento</h2>
          <p>{meio} · <span className="font-medium">{pago ? "Pago" : "Aguardando pagamento"}</span></p>
          {p.observacao_pedido && (
            <>
              <h2 className="mb-1 mt-3 text-xs font-semibold uppercase text-muted-foreground">Observação</h2>
              <p className="whitespace-pre-wrap">{p.observacao_pedido}</p>
            </>
          )}
        </div>
        <table className="ml-auto w-64 tabular-nums">
          <tbody>
            <tr><td className="py-0.5">Itens</td><td className="text-right">{formatBRL(valorItens)}</td></tr>
            <tr><td className="py-0.5">Desconto</td><td className="text-right">{desconto > 0.009 ? `− ${formatBRL(desconto)}` : formatBRL(0)}</td></tr>
            <tr><td className="py-0.5">Frete</td><td className="text-right">{formatBRL(frete)}</td></tr>
            <tr className="border-t font-semibold"><td className="py-1">Total</td><td className="text-right">{formatBRL(total)}</td></tr>
          </tbody>
        </table>
      </section>

      <footer className="mt-16 grid grid-cols-2 gap-10">
        <div className="border-t pt-1 text-xs text-muted-foreground">Separado por</div>
        <div className="border-t pt-1 text-xs text-muted-foreground">Conferido por</div>
      </footer>
    </div>
  );
}
