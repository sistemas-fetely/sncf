import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { num } from "./dados";

const CAMPOS = [
  "a_liberar_inicial", "apurado", "liberado", "estornado_a_liberar", "a_liberar_final",
  "a_liberar_vencido", "a_liberar_a_vencer", "a_pagar_inicial", "estornado_liberado", "pago", "a_pagar_final",
] as const;
export type CampoCC = (typeof CAMPOS)[number];
export type ValoresCC = Record<CampoCC, number>;
export interface LinhaCC extends ValoresCC { mes: string; vendedor_id: string | null; representante: string }

function zero(): ValoresCC {
  return Object.fromEntries(CAMPOS.map((c) => [c, 0])) as ValoresCC;
}
function converter(r: Record<string, unknown>): LinhaCC {
  const v = zero();
  for (const c of CAMPOS) v[c] = num(r[c]);
  return { ...v, mes: String(r.mes ?? "").slice(0, 10), vendedor_id: (r.vendedor_id as string) ?? null, representante: String(r.representante ?? "—") };
}
function somar(a: ValoresCC, b: ValoresCC) { for (const c of CAMPOS) a[c] += b[c]; }

function menosMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return d.toISOString().slice(0, 10);
}

export function useContaCorrente(competencia: string) {
  const mes = `${competencia}-01`;
  const desde = menosMeses(mes, 5);
  const q = useQuery({
    queryKey: ["vw_comissao_conta_corrente_mensal", desde, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_comissao_conta_corrente_mensal" as never)
        .select("*")
        .gte("mes", desde)
        .lte("mes", mes)
        .order("representante", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(converter);
    },
  });
  useEffect(() => {
    if (q.error) toast.error(`Falha ao carregar a conta corrente de comissões: ${formatError(q.error)}`);
  }, [q.error]);

  return useMemo(() => {
    const todas = q.data ?? [];
    const linhas = todas.filter((l) => l.mes === mes && CAMPOS.some((c) => Math.abs(l[c]) > 0.004));
    const total = zero();
    for (const l of linhas) somar(total, l);
    const historico = new Map<string, ValoresCC>();
    for (const l of todas) {
      const acc = historico.get(l.mes) ?? zero();
      somar(acc, l);
      historico.set(l.mes, acc);
    }
    return {
      carregando: q.isLoading,
      erro: q.error,
      linhas,
      total,
      historico,
      temEstornoLiberar: linhas.some((l) => l.estornado_a_liberar !== 0),
      temEstornoPagar: linhas.some((l) => l.estornado_liberado !== 0),
    };
  }, [q.data, q.isLoading, q.error, mes]);
}

export const LEGENDA_CC =
  "O saldo passa para o mês seguinte. Parcela que o cliente atrasou fica em 'vencido' e é liberada no mês em que ele pagar. O saldo devido sai quando o título do extrato é pago.";

/** Colunas na ordem de exibição, considerando estornos opcionais. */
export function colunasCC(temEstLib: boolean, temEstPag: boolean) {
  const liberar: Array<{ c: CampoCC; r: string }> = [
    { c: "a_liberar_inicial", r: "Saldo anterior" },
    { c: "apurado", r: "+ Apurado" },
    { c: "liberado", r: "− Cliente pagou" },
    ...(temEstLib ? [{ c: "estornado_a_liberar" as CampoCC, r: "− Estornos" }] : []),
    { c: "a_liberar_final", r: "Saldo" },
    { c: "a_liberar_vencido", r: "dos quais vencido" },
  ];
  const pagar: Array<{ c: CampoCC; r: string }> = [
    { c: "a_pagar_inicial", r: "Saldo anterior" },
    { c: "liberado", r: "+ Liberado" },
    ...(temEstPag ? [{ c: "estornado_liberado" as CampoCC, r: "− Estornos" }] : []),
    { c: "pago", r: "− Pago" },
    { c: "a_pagar_final", r: "Saldo devido" },
  ];
  return { liberar, pagar };
}
