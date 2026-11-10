import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { InstrucaoExpedicao } from "@/lib/pedidos/instrucaoExpedicao";
import { useLerInstrucaoExpedicao } from "./useMesaSp";

export function SeloInstrucaoExpedicao({ pedido }: { pedido: InstrucaoExpedicao }) {
  if (pedido.instrucao_expedicao == null) return null;
  const Icone = pedido.instrucao_pendente ? AlertTriangle : CheckCircle2;
  return <TooltipProvider><Tooltip><TooltipTrigger asChild>
    <span tabIndex={0} className={cn("inline-flex items-center gap-1 rounded border border-warning/50 px-1.5 py-0.5 text-xs text-warning-strong", pedido.instrucao_pendente ? "bg-warning/25 font-semibold motion-safe:animate-pulse" : "bg-warning/10")}>
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Instrução
    </span>
  </TooltipTrigger><TooltipContent className="max-w-sm whitespace-pre-wrap break-words">{pedido.instrucao_expedicao}</TooltipContent></Tooltip></TooltipProvider>;
}

export function FaixaInstrucaoExpedicao({ pedido }: { pedido: InstrucaoExpedicao & { id: string } }) {
  const ler = useLerInstrucaoExpedicao();
  if (pedido.instrucao_expedicao == null) return null;
  const pendente = pedido.instrucao_pendente;
  const Icone = pendente ? AlertTriangle : CheckCircle2;
  return <section aria-label="Instrução para expedição" className={cn("flex items-start gap-3 rounded-md border text-warning-strong", pendente ? "border-warning bg-warning/25 p-4" : "border-warning/40 bg-warning/10 p-3")}>
    <Icone className={cn("shrink-0", pendente ? "h-7 w-7" : "h-5 w-5")} aria-hidden="true" />
    <div className="min-w-0 flex-1 space-y-2">
      <h3 className="text-sm font-semibold">Instrução para expedição</h3>
      <p className={cn("whitespace-pre-wrap break-words", pendente ? "text-base font-semibold" : "text-sm")}>{pedido.instrucao_expedicao}</p>
      {pendente ? <Button disabled={ler.isPending} onClick={() => ler.mutate({ p_pedido_id: pedido.id })}>
        {ler.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Li a instrução
      </Button> : <p className="text-xs">{pedido.instrucao_expedicao_lida_em ? `Lida às ${new Date(pedido.instrucao_expedicao_lida_em).toLocaleString("pt-BR")}` : "Lida"}</p>}
    </div>
  </section>;
}