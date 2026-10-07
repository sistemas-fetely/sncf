import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarraImpressao } from "@/components/impressao/BarraImpressao";
import { formatError } from "@/lib/format-error";
import { fmtCompetencia } from "../comissoes/fmt";
import { EstilosExtrato, ExtratoRepresentanteDocumento } from "./ExtratoRepresentanteDocumento";

const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Lote: todos os extratos de um mês de PAGAMENTO, um representante por folha. */
export default function ExtratosLoteImpressao() {
  const [params] = useSearchParams();
  const competencia = params.get("competencia") ?? "";
  const valida = RE_COMPETENCIA.test(competencia);
  const dia = `${competencia}-01`;

  const q = useQuery({
    queryKey: ["extratos-lote-representantes", competencia],
    enabled: valida,
    queryFn: async () => {
      const [ex, pg, cart, comp] = await Promise.all([
        (supabase as any).from("comissao_extrato").select("vendedor_id").eq("competencia", dia),
        (supabase as any).from("vw_comissao_pagamento_mes").select("vendedor_id, representante").eq("mes_pagamento", dia),
        (supabase as any).from("vw_comissao_detalhe").select("vendedor_id").in("situacao_parcela", ["a_vencer", "vencida"]).limit(10000),
        (supabase as any).from("vw_comissao_complemento_pendente").select("vendedor_id"),
      ]);
      if (cart.error) throw cart.error;
      if (comp.error) throw comp.error;
      if (ex.error) throw ex.error;
      if (pg.error) throw pg.error;
      const nomes = new Map<string, string>();
      for (const l of pg.data ?? []) if (l.vendedor_id) nomes.set(l.vendedor_id, l.representante ?? nomes.get(l.vendedor_id) ?? "");
      for (const l of [...(cart.data ?? []), ...(comp.data ?? [])]) if (l.vendedor_id && !nomes.has(l.vendedor_id)) nomes.set(l.vendedor_id, "");
      for (const l of ex.data ?? []) if (l.vendedor_id && !nomes.has(l.vendedor_id)) nomes.set(l.vendedor_id, "");
      const faltam = [...nomes].filter(([, n]) => !n).map(([id]) => id);
      if (faltam.length) {
        const { data, error } = await (supabase as any).from("vw_representante_financeiro").select("vendedor_id, representante").in("vendedor_id", faltam);
        if (error) throw error;
        for (const l of data ?? []) nomes.set(l.vendedor_id, l.representante ?? "");
      }
      return [...nomes].map(([id, nome]) => ({ id, nome: nome || "Sem nome" }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });

  if (!valida) return <div className="flex min-h-screen items-center justify-center p-8 text-destructive-strong">Competência inválida. Use o formato AAAA-MM.</div>;
  if (q.isLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Preparando os extratos…</div>;
  if (q.error) return <div className="flex min-h-screen items-center justify-center p-8 text-destructive-strong">Falha ao listar os extratos: {formatError(q.error)}</div>;
  const lista = q.data ?? [];

  return (
    <main className="documento-extrato">
      <EstilosExtrato />
      <BarraImpressao />
      <p className="tela-apenas mx-auto mb-4 w-[210mm] max-w-full text-sm font-medium">
        Extratos de pagamento {fmtCompetencia(dia)} · {lista.length} {lista.length === 1 ? "representante" : "representantes"}
      </p>
      {lista.length === 0 ? (
        <p className="text-center text-muted-foreground">Nenhum extrato neste mês.</p>
      ) : lista.map((r, i) => (
        <div key={r.id} className={i > 0 ? "quebra-pagina" : undefined} data-representante={r.nome}>
          <ExtratoRepresentanteDocumento vendedorId={r.id} competencia={competencia} mostrarSeletor={false} />
        </div>
      ))}
    </main>
  );
}
