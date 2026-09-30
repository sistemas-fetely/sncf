import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
const ETAPAS = ["Inventário", "Distribuído", "Retornos", "Transferência", "Concluído"];
const POSICAO: Record<string, number> = { rascunho: 0, distribuido: 1, retornos_em_andamento: 2, retornos_concluidos: 2, transferencia_emitida: 3, concluido: 4, cancelado: 0 };
export function RegularizacaoStepper({ status }: { status: string }) {
  const atual = POSICAO[status] ?? 0;
  return <ol className="grid grid-cols-5 gap-1" aria-label="Etapas do lote">{ETAPAS.map((e, i) => <li key={e} className="min-w-0"><div className="flex items-center"><span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]", i <= atual ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground")}>{i < atual ? <Check className="h-3 w-3" /> : i + 1}</span>{i < ETAPAS.length - 1 && <span className={cn("h-px flex-1", i < atual ? "bg-primary" : "bg-border")} />}</div><div className="mt-1 truncate text-[11px] text-muted-foreground">{e}</div></li>)}</ol>;
}
