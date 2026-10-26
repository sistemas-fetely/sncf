import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TrsAtrasado {
  id_externo: string;
  destino_interno: string | null;
  faturado_em: string | null;
  dias_em_transito: number;
  nfs: string | string[] | null;
  pecas: number | null;
  limite_dias: number;
}
export interface TrsNaturezaDivergente {
  id_externo: string;
  numero: string | null;
  data_emissao: string | null;
  natureza_pedido: string | null;
  natureza_nf_codigo: string | null;
  natureza_nf?: string | null;
}

export function useTrsAtrasados() {
  return useQuery({
    queryKey: ["transferencias-internas", "transito-atrasado"],
    queryFn: async (): Promise<TrsAtrasado[]> => {
      const { data, error } = await (supabase as any).from("vw_trs_transito_atrasado").select("*").order("dias_em_transito", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrsAtrasado[];
    },
  });
}
export function useTrsNaturezaDivergente() {
  return useQuery({
    queryKey: ["transferencias-internas", "nf-natureza-divergente"],
    queryFn: async (): Promise<TrsNaturezaDivergente[]> => {
      const { data, error } = await (supabase as any).from("vw_trs_nf_natureza_divergente").select("*");
      if (error) throw error;
      return (data ?? []) as TrsNaturezaDivergente[];
    },
  });
}

const fmtNfs = (n: TrsAtrasado["nfs"]) => (Array.isArray(n) ? n.join(", ") : n) || "—";

export function AlertasTransferenciaFisica() {
  const [, setParams] = useSearchParams();
  const atrasQ = useTrsAtrasados();
  const divQ = useTrsNaturezaDivergente();

  useEffect(() => { if (atrasQ.isError) toast.error(formatError(atrasQ.error)); }, [atrasQ.isError, atrasQ.error]);
  useEffect(() => { if (divQ.isError) toast.error(formatError(divQ.error)); }, [divQ.isError, divQ.error]);

  const atras = atrasQ.data ?? [];
  const div = divQ.data ?? [];
  if (!atras.length && !div.length) return null;

  const irReceber = (trs: string) =>
    setParams((p) => { const n = new URLSearchParams(p); n.set("aba", "receber"); n.set("receber_trs", trs); return n; }, { replace: false });

  return (
    <div className="space-y-3">
      {div.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> NF com natureza errada — não receber
          </div>
          <ul className="space-y-0.5 text-sm">
            {div.map((d) => (
              <li key={`${d.id_externo}-${d.numero}`}>
                NF {d.numero ?? "—"} do {d.id_externo} saiu como {d.natureza_nf_codigo ?? d.natureza_nf ?? "—"} — esperado {d.natureza_pedido ?? "—"}. Fale com o fiscal.
              </li>
            ))}
          </ul>
        </div>
      )}
      {atras.length > 0 && (
        <div className="rounded-md border border-warning/50 bg-warning/10 p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-warning" /> Em trânsito há mais de {atras[0].limite_dias} dias sem recebimento
          </div>
          <ul className="space-y-0.5 text-sm">
            {atras.map((a) => (
              <li key={a.id_externo}>
                <button type="button" onClick={() => irReceber(a.id_externo)} className="text-left underline-offset-2 hover:underline">
                  <span className="font-medium tabular-nums">{a.id_externo}</span> · {a.destino_interno ?? "—"} · NF {fmtNfs(a.nfs)} · {a.pecas ?? 0} peças · há {a.dias_em_transito} dias
                  {a.faturado_em && <span className="text-muted-foreground"> (faturado {fmtData(a.faturado_em)})</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
