import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, FileText, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/lib/format-currency";


type Fatura = {
  id: string;
  numero_fatura: string | null;
  data_emissao: string | null;
  data_vencimento: string | null;
  valor_total: number;
  status: string | null;
};

type Linha = {
  fatura_id: string;
  destinatario: string | null;
  nf_numero: string | null;
  doc_ref: string | null;
  valor_frete: number | null;
  valor_lancado: number | null;
  diferenca: number | null;
  status_conciliacao: string | null;
};

function useFaturas(transportadoraId: string) {
  return useQuery({
    queryKey: ["faturas-frete", transportadoraId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faturas_frete")
        .select("id, numero_fatura, data_emissao, data_vencimento, valor_total, status")
        .eq("transportadora_id", transportadoraId)
        .order("data_vencimento", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r): Fatura => ({
        id: r.id as string,
        numero_fatura: r.numero_fatura as string | null,
        data_emissao: r.data_emissao as string | null,
        data_vencimento: r.data_vencimento as string | null,
        valor_total: Number(r.valor_total ?? 0),
        status: r.status as string | null,
      }));
    },
  });
}

function useLinhasConciliacao(transportadoraId: string) {
  return useQuery({
    queryKey: ["vw-conciliacao-faturas-frete", transportadoraId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_conciliacao_faturas_frete")
        .select("fatura_id, destinatario, nf_numero, doc_ref, valor_frete, valor_lancado, diferenca, status_conciliacao")
        .eq("transportadora_id", transportadoraId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((r): Linha => ({
        fatura_id: r.fatura_id,
        destinatario: r.destinatario ?? null,
        nf_numero: r.nf_numero ?? null,
        doc_ref: r.doc_ref ?? null,
        valor_frete: r.valor_frete == null ? null : Number(r.valor_frete),
        valor_lancado: r.valor_lancado == null ? null : Number(r.valor_lancado),
        diferenca: r.diferenca == null ? null : Number(r.diferenca),
        status_conciliacao: r.status_conciliacao ?? null,
      }));
    },
  });
}

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  divergente: "Divergente",
  fatura_sem_lancado: "Sem lançado",
  ajuste: "Ajuste",
};

function BadgeStatus({ status }: { status: string | null }) {
  const s = status ?? "";
  const cls =
    s === "ok"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
      : s === "divergente"
        ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800"
        : s === "fatura_sem_lancado"
          ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800"
          : s === "ajuste"
            ? "bg-muted text-muted-foreground border-border"
            : "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", cls)}>
      {STATUS_LABEL[s] ?? s ?? "—"}
    </span>
  );
}

export function FaturasConciliacao({
  transportadoraId,
}: {
  transportadoraId: string;
  transportadoraNome?: string;
}) {
  const { data: faturas = [], isLoading: loadingFat } = useFaturas(transportadoraId);
  const { data: linhas = [], isLoading: loadingLinhas } = useLinhasConciliacao(transportadoraId);
  const [expandida, setExpandida] = useState<string | null>(null);

  const linhasPorFatura = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) {
      const arr = m.get(l.fatura_id) ?? [];
      arr.push(l);
      m.set(l.fatura_id, arr);
    }
    return m;
  }, [linhas]);

  const resumoFatura = (faturaId: string) => {
    const arr = linhasPorFatura.get(faturaId) ?? [];
    let ok = 0, div = 0, sem = 0, aj = 0;
    for (const l of arr) {
      if (l.status_conciliacao === "ok") ok++;
      else if (l.status_conciliacao === "divergente") div++;
      else if (l.status_conciliacao === "fatura_sem_lancado") sem++;
      else if (l.status_conciliacao === "ajuste") aj++;
    }
    return { total: arr.length, ok, div, sem, aj };
  };

  const kpis = useMemo(() => {
    let ok = 0, div = 0, sem = 0;
    for (const l of linhas) {
      if (l.status_conciliacao === "ok") ok++;
      else if (l.status_conciliacao === "divergente") div++;
      else if (l.status_conciliacao === "fatura_sem_lancado") sem++;
    }
    const valorTotal = faturas.reduce((s, f) => s + f.valor_total, 0);
    return { qtdFaturas: faturas.length, valorTotal, ok, div, sem };
  }, [linhas, faturas]);

  if (loadingFat || loadingLinhas) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando faturas...
      </div>
    );
  }

  if (faturas.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <FileText className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <div className="mt-2 text-sm font-medium">Nenhuma fatura importada</div>
        <div className="text-xs text-muted-foreground">
          Faturas de frete desta transportadora aparecerão aqui após importação.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Faturas" value={String(kpis.qtdFaturas)} />
        <KpiCard label="Valor total" value={formatBRL(kpis.valorTotal)} />
        <KpiCard label="OK" value={String(kpis.ok)} tone="ok" />
        <KpiCard label="Divergentes" value={String(kpis.div)} tone="warn" />
        <KpiCard label="Sem lançado" value={String(kpis.sem)} tone="danger" />
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="divide-y">
          {faturas.map((f) => {
            const r = resumoFatura(f.id);
            const aberta = expandida === f.id;
            const arr = linhasPorFatura.get(f.id) ?? [];
            const partes: string[] = [];
            if (r.ok) partes.push(`${r.ok} ok`);
            if (r.div) partes.push(`${r.div} divergente${r.div > 1 ? "s" : ""}`);
            if (r.sem) partes.push(`${r.sem} sem lançado`);
            if (r.aj) partes.push(`${r.aj} ajuste${r.aj > 1 ? "s" : ""}`);
            const resumoTxt = r.total === 0
              ? "sem linhas"
              : partes.length === 1 && r.ok === r.total
                ? `${r.ok}/${r.total} conciliados`
                : partes.join(" · ");
            return (
              <Collapsible key={f.id} open={aberta} onOpenChange={(o) => setExpandida(o ? f.id : null)}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors",
                      aberta && "bg-muted/30",
                    )}
                  >
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", aberta && "rotate-180")} />
                    <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-3">
                        <div className="text-sm font-medium truncate">
                          {f.numero_fatura ?? "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Emissão: {formatDateBR(f.data_emissao)}
                        </div>
                      </div>
                      <div className="col-span-2 text-xs">
                        <div className="text-muted-foreground">Vencimento</div>
                        <div>{formatDateBR(f.data_vencimento)}</div>
                      </div>
                      <div className="col-span-2 text-xs">
                        <div className="text-muted-foreground">Valor</div>
                        <div className="tabular-nums">{formatBRL(f.valor_total)}</div>
                      </div>
                      <div className="col-span-2 text-xs">
                        <div className="text-muted-foreground">Status</div>
                        <div>
                          <Badge variant="outline" className="font-normal">
                            {f.status ?? "—"}
                          </Badge>
                        </div>
                      </div>
                      <div className="col-span-3 text-xs text-right text-muted-foreground">
                        {resumoTxt}
                      </div>
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t bg-muted/10 px-4 py-3">
                    {arr.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic py-2">
                        Nenhuma linha de conciliação encontrada para esta fatura.
                      </div>
                    ) : (
                      <div className="rounded-md border bg-background overflow-x-auto">
                        <table className="w-full text-xs min-w-[720px]">
                          <thead className="bg-muted/50">
                            <tr className="text-left">
                              <th className="px-3 py-2 font-medium">Destinatário</th>
                              <th className="px-3 py-2 font-medium">NF</th>
                              <th className="px-3 py-2 font-medium">Doc ref</th>
                              <th className="px-3 py-2 font-medium text-right">Valor cobrado</th>
                              <th className="px-3 py-2 font-medium text-right">Valor lançado</th>
                              <th className="px-3 py-2 font-medium text-right">Diferença</th>
                              <th className="px-3 py-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {arr.map((l, idx) => (
                              <tr key={`${l.fatura_id}-${l.doc_ref ?? l.nf_numero ?? idx}`} className="border-t">
                                <td className="px-3 py-1.5 max-w-[260px] truncate" title={l.destinatario ?? undefined}>
                                  {l.destinatario ?? "—"}
                                </td>
                                <td className="px-3 py-1.5 font-mono">{l.nf_numero ?? "—"}</td>
                                <td className="px-3 py-1.5 font-mono">{l.doc_ref ?? "—"}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {l.valor_frete == null ? "—" : formatBRL(l.valor_frete)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {l.valor_lancado == null ? "—" : formatBRL(l.valor_lancado)}
                                </td>
                                <td
                                  className={cn(
                                    "px-3 py-1.5 text-right tabular-nums",
                                    l.diferenca != null && Math.abs(l.diferenca) > 0.009 && "font-medium",
                                    l.diferenca != null && l.diferenca > 0.009 && "text-amber-700 dark:text-amber-300",
                                    l.diferenca != null && l.diferenca < -0.009 && "text-red-700 dark:text-red-300",
                                  )}
                                >
                                  {l.diferenca == null ? "—" : formatBRL(l.diferenca)}
                                </td>
                                <td className="px-3 py-1.5">
                                  <BadgeStatus status={l.status_conciliacao} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const valueCls =
    tone === "ok"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "danger"
          ? "text-red-700 dark:text-red-300"
          : "";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", valueCls)}>{value}</div>
    </div>
  );
}

