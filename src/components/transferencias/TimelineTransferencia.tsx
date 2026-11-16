import { useQuery } from "@tanstack/react-query";
import { Circle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtData } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { montarTimelineTransferencia, type EventoTransferencia } from "./timelineRegras";

const rotulos = ["Pedido criado", "Expedição XPM", "NF emitida", "Em transporte", "Entregue", "Conferido no destino"];

export function TimelineTransferencia({ pedidoId }: { pedidoId: string }) {
  const q = useQuery({
    queryKey: ["transferencia-timeline", pedidoId],
    queryFn: async () => {
      const { data: transferencia, error } = await (supabase as any).from("vw_transferencias_painel").select("nf_data_emissao, origem_registro").eq("id", pedidoId).maybeSingle();
      if (error) throw error;
      if (!transferencia || transferencia.origem_registro === "ti") return null;
      const eventos: EventoTransferencia[] = [];
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error: erro } = await supabase.from("pedido_eventos").select("tipo_evento, estagio_novo, metadata, criado_em").eq("pedido_id", pedidoId).eq("tipo_evento", "mudou_estagio").order("criado_em").order("id").range(inicio, inicio + 999);
        if (erro) throw erro;
        eventos.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      const { data: recebimento, error: erroRecebimento } = await (supabase as any).from("trs_recebimento").select("data_recebimento").eq("pedido_id", pedidoId).order("data_recebimento", { ascending: false }).limit(1).maybeSingle();
      if (erroRecebimento) throw erroRecebimento;
      return montarTimelineTransferencia(eventos, transferencia.nf_data_emissao, recebimento?.data_recebimento ?? null);
    },
  });
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="text-sm text-destructive">Falha ao carregar linha do tempo: {formatError(q.error)}</p>;
  if (!q.data) return null;
  const timeline = q.data;
  return <div className="overflow-x-auto py-3" aria-label="Linha do tempo da transferência">
    <ol className="grid min-w-[840px] grid-cols-6 gap-3">
      {rotulos.map((rotulo, i) => <li key={rotulo} aria-current={i === timeline.atual ? "step" : undefined} className={cn("border-t-2 pt-3 text-sm", i === timeline.atual ? "border-primary text-primary" : i < timeline.atual ? "border-border text-foreground" : "border-border text-muted-foreground")}>
        <div className="mb-2 flex items-center gap-2">{timeline.datas[i] ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Circle className="h-4 w-4 shrink-0" />}<span className={cn(i === timeline.atual && "font-medium")}>{rotulo}</span></div>
        <div className="text-xs tabular-nums">{fmtData(timeline.datas[i])}</div>
        {i === timeline.atual && timeline.dias !== null && <div className="mt-1 text-xs">há {timeline.dias} dias</div>}
      </li>)}
    </ol>
  </div>;
}