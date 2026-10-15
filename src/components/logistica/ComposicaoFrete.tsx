import { brl, ROTULO_COMPOSICAO } from "@/lib/logistica/formato";

/** Grid chave → valor da composição de um documento de frete. */
export function ComposicaoFrete({ composicao }: { composicao: Record<string, number | string> | null | undefined }) {
  const pares = Object.entries(composicao ?? {}).filter(([, v]) => v !== null && v !== "" && v !== 0);
  if (!pares.length) return <p className="text-xs text-muted-foreground">sem composição</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
      {pares.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="text-muted-foreground">{ROTULO_COMPOSICAO[k] ?? k}</span>
          <span className="tabular-nums">{typeof v === "number" ? brl(v) : String(v)}</span>
        </div>
      ))}
    </div>
  );
}

export function BadgeAuditoria({ status, motivo }: { status: string | null; motivo?: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const cls =
    status === "ok" ? "border-success/40 text-success bg-success/10"
      : status === "sem_referencia" ? "border-border text-muted-foreground bg-muted/40"
        : "border-warning/50 text-warning bg-warning/10";
  const rotulo = { ok: "ok", acima_referencia: "acima da tabela", sem_referencia: "sem referência", justificar: "justificar" }[status] ?? status;
  return (
    <span title={motivo ?? undefined} className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>
      {rotulo}
    </span>
  );
}
