import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";

export interface LinhaPagamentoMes {
  mes_pagamento: string;
  tipo_linha: "comissao" | "estorno";
  liberacao_id: string | null;
  vendedor_id: string | null;
  representante: string | null;
  nf_id: string | null;
  nf_numero: string | null;
  pedido_id: string | null;
  pedido: string | null;
  cliente: string | null;
  cliente_pagou_em: string | null;
  valor: number | string | null;
  extrato_id: string | null;
  extrato_sequencia: number | null;
  pagar_ate: string | null;
  cpr_id: string | null;
  cpr_status: string | null;
  situacao: "extrato_aberto" | "extrato_fechado" | "titulo_gerado" | "pago" | null;
}

export function rotuloSituacao(l: LinhaPagamentoMes): string {
  switch (l.situacao) {
    case "extrato_aberto": return "Extrato aberto";
    case "extrato_fechado": return (l.extrato_sequencia ?? 1) > 1 ? `Extrato fechado nº ${l.extrato_sequencia}` : "Extrato fechado";
    case "titulo_gerado": return "Título no Contas a Pagar";
    case "pago": return "Pago";
    default: return "—";
  }
}

/** "2026-10" → "09/2026" */
export function mesAnterior(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export interface GrupoRep { representante: string; linhas: LinhaPagamentoMes[]; subtotal: number }

export function usePagamentoMes(competencia: string) {
  const mes = `${competencia}-01`;
  const q = useQuery({
    queryKey: ["vw_comissao_pagamento_mes", mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_comissao_pagamento_mes" as never)
        .select("*")
        .eq("mes_pagamento", mes)
        .order("representante", { ascending: true })
        .order("cliente_pagou_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaPagamentoMes[];
    },
  });
  useEffect(() => {
    if (q.error) toast.error(`Falha ao carregar comissões pagas no mês: ${formatError(q.error)}`);
  }, [q.error]);

  const { grupos, total, pagarAte } = useMemo(() => {
    const mapa = new Map<string, GrupoRep>();
    let total = 0;
    let pagarAte: string | null = null;
    for (const l of q.data ?? []) {
      const nome = l.representante ?? "—";
      const g = mapa.get(nome) ?? { representante: nome, linhas: [], subtotal: 0 };
      const v = Number(l.valor ?? 0);
      g.linhas.push(l);
      g.subtotal += v;
      total += v;
      if (l.pagar_ate && (!pagarAte || l.pagar_ate > pagarAte)) pagarAte = l.pagar_ate;
      mapa.set(nome, g);
    }
    return { grupos: [...mapa.values()], total, pagarAte };
  }, [q.data]);

  return { carregando: q.isLoading, erro: q.error, linhas: q.data ?? [], grupos, total, pagarAte };
}
