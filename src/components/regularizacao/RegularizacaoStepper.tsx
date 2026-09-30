import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
const ETAPAS = ["Inventário", "Origem fiscal", "Retorno à filial", "Transferência 6152", "Estoque vendável"];
const POSICAO: Record<string, number> = { rascunho: 0, distribuido: 2, retornos_em_andamento: 2, retornos_concluidos: 3, transferencia_emitida: 3, concluido: 4, cancelado: 0 };
export function RegularizacaoStepper({ status, entradasSite = 0 }: { status: string; entradasSite?: number }) {
  const atual = status === "transferencia_emitida" && entradasSite > 0 ? 4 : POSICAO[status] ?? 0;
  return <ol className="grid grid-cols-2 gap-x-1 gap-y-3 sm:grid-cols-5" aria-label="Etapas do lote">{ETAPAS.map((e, i) => <li key={e} className="min-w-0"><div className="flex items-center"><span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]", i <= atual ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground")}>{i < atual ? <Check className="h-3 w-3" /> : i + 1}</span>{i < ETAPAS.length - 1 && <span className={cn("h-px flex-1", i < atual ? "bg-primary" : "bg-border")} />}</div><div className="mt-1 text-[11px] text-muted-foreground">{i + 1} {e}</div></li>)}</ol>;
}
