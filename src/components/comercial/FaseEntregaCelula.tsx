import { AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MesaEntregaRow } from "@/hooks/comercial/useMesaEntrega";

/**
 * DATA-NUNCA-VIAJA-PELADA: 70 das 75 previsões são projeção nossa, não promessa
 * de transportadora. A data só aparece acompanhada do selo de origem — sem isso
 * o vendedor transforma projeção interna em promessa ao cliente.
 * Cor sempre por token semântico; nunca cor crua de Tailwind.
 */

const SELO_FONTE: Record<string, string> = {
  cte_previsao: "transportadora",
  projecao_interna: "projeção",
  expedicao_mais_tabela: "estimativa",
};

function ddmm(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return d && m ? `${d}/${m}` : iso;
}

function dataHoraBR(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).replace(", ", " às ");
}

/** Token da fase por `fase_ordem` — desvio manda em qualquer ordem. */
function classeFase(linha: MesaEntregaRow): string {
  if (linha.fase_eh_desvio) return "border-destructive/50 text-destructive";
  const o = Number(linha.fase_ordem ?? 0);
  if (o >= 90) return "border-success/50 text-success";
  if (o >= 85) return "border-warning/50 text-warning";
  if (o >= 80) return "border-primary/50 text-primary";
  return "border-muted-foreground/40 text-muted-foreground";
}

export function FaseEntregaCelula({ linha }: { linha: MesaEntregaRow | undefined }) {
  if (!linha) return <span className="text-xs text-muted-foreground">—</span>;

  const copiar = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar o código");
    }
  };

  const seloFonte =
    linha.previsao_fonte
      ? SELO_FONTE[linha.previsao_fonte] ?? linha.previsao_fonte
      : null;
  const atualizado = dataHoraBR(linha.rastreio_atualizado_em);
  const alerta = !!linha.rastreio_alerta;

  return (
    <div className="flex flex-col items-start gap-0.5 text-xs">
      {linha.fase_rotulo && (
        <Badge
          variant="outline"
          className={cn("rounded px-1.5 py-0 text-[10px]", classeFase(linha))}
        >
          {linha.fase_rotulo}
        </Badge>
      )}

      {linha.data_entrega ? (
        <span className="text-success">Entregue em {ddmm(linha.data_entrega)}</span>
      ) : linha.previsao_entrega ? (
        <span className="flex items-center gap-1">
          <span>Previsão {ddmm(linha.previsao_entrega)}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="rounded px-1 py-0 text-[10px] text-muted-foreground"
              >
                {seloFonte ?? "origem não informada"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Confiança: {linha.previsao_confianca ?? "não informada"}
            </TooltipContent>
          </Tooltip>
        </span>
      ) : linha.previsao_motivo_sem_data ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground">Sem previsão</span>
          </TooltipTrigger>
          <TooltipContent>{linha.previsao_motivo_sem_data}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-muted-foreground">Sem previsão</span>
      )}

      {linha.transportadora && (
        <span className="text-[10px] text-muted-foreground">{linha.transportadora}</span>
      )}

      {/* RASTREIO-EXISTE-SE-TEM-CODIGO: 143 dos 153 pedidos com rastreio não têm
          transportadora preenchida — a condição é o código, nunca a Correios. */}
      {linha.rastreio_codigo && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-1 text-[10px]",
            alerta ? "text-destructive" : "text-muted-foreground",
          )}
          title={
            [alerta ? linha.rastreio_status_texto : null,
              atualizado ? `Atualizado em ${atualizado}` : null]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        >
          {alerta && <AlertTriangle className="h-3 w-3" />}
          <span className="font-mono">
            {[linha.rastreio_servico, linha.rastreio_codigo].filter(Boolean).join(" · ")}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-4 w-4"
            title="Copiar código de rastreio"
            onClick={() => void copiar(linha.rastreio_codigo!)}
          >
            <Copy className="h-3 w-3" />
          </Button>
          {linha.rastreio_rotulo && <span>{linha.rastreio_rotulo}</span>}
        </div>
      )}
    </div>
  );
}
