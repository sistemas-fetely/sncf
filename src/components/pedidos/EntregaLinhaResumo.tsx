import { Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EntregaLinhaInfo } from "@/hooks/pedidos/usePedidoEntrega";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";

/** Estágios em que a linha da fila mostra o resumo de saída (data / transportadora / NF). */
export const ESTAGIOS_COM_RESUMO_ENTREGA = ["entregue", "em_transporte", "faturado"] as const;

function fmtData(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Selo de procedência da data — obrigatório: estimativa nunca pode parecer fato. */
function proveniencia(metodo: string | null): { rotulo: string; alerta: boolean } {
  if (metodo === "transportadora") return { rotulo: "confirmado pela transportadora", alerta: false };
  if (metodo === "estimativa_cep") return { rotulo: "data estimada, não confirmada", alerta: true };
  return { rotulo: "origem da data desconhecida", alerta: true };
}

/** Dias corridos entre hoje e uma data ISO (positivo = data já passou). */
function diasDesde(v: string): number | null {
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.floor((b - a) / 86400000);
}

const TOOLTIP_META =
  "Alvo calculado pelo sistema: SLAs internos + 5 dias úteis de trânsito fixos. Não é prazo informado pela transportadora.";

function LinhaTransportadora({ nome }: { nome: string | null }) {
  return nome ? (
    <p className="text-[11px] text-muted-foreground">{nome}</p>
  ) : (
    <p className="text-[11px] text-muted-foreground/60 italic">transportadora não registrada</p>
  );
}

/** Bloco de logística para pedidos ainda não entregues (faturado / em_transporte). */
function ResumoEmRota({ info }: { info: EntregaLinhaInfo }) {
  const prazo = fmtData(info.prazo_transportadora);
  const meta = fmtData(info.data_entrega_prevista);
  const atraso = info.data_entrega_prevista ? diasDesde(info.data_entrega_prevista) : null;
  const atrasada = atraso !== null && atraso > 0;
  const rastreio = info.entrega_ocorrencia_texto;

  return (
    <>
      {prazo ? (
        <p className="text-[11px] font-medium text-foreground">
          Prazo da transportadora: <span className="text-primary">{prazo}</span>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground/60 italic">sem prazo da transportadora</p>
      )}

      {meta && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-fit cursor-help flex flex-wrap items-center gap-1">
                <span className="text-[10px] rounded px-1 py-[1px] border bg-muted text-muted-foreground border-border">
                  Meta interna
                </span>
                <span className={cn("text-[11px]", atrasada ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {atrasada ? `${atraso} dias além da meta` : meta}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[280px]">
                {TOOLTIP_META}
                {atrasada ? ` Meta era ${meta}.` : ""}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {rastreio ? (
        <p className={cn("text-[11px]", info.entrega_ocorrencia_problema ? "text-warning" : "text-muted-foreground")}>
          Rastreio: {rastreio}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground/60 italic">sem rastreio registrado</p>
      )}
    </>
  );
}

export function EntregaLinhaResumo({ info }: { info: EntregaLinhaInfo | undefined }) {
  const { baixar, baixando } = useDownloadNfPdf();
  if (!info) return null;

  const emRota = info.estagio === "em_transporte" || info.estagio === "faturado";

  const dataBruta = info.entregue_em || info.data_entrega_transportadora;
  const data = fmtData(dataBruta);
  const proc = proveniencia(info.entregue_metodo);
  const ocorrencia = info.entrega_ocorrencia_texto;

  const linhaData = data ? (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-muted-foreground">{data}</span>
      <span
        className={cn(
          "text-[10px] rounded px-1 py-[1px] border",
          proc.alerta
            ? "bg-warning/15 text-warning border-warning/40 font-medium"
            : "bg-success/10 text-success border-success/30",
        )}
      >
        {proc.rotulo}
      </span>
    </div>
  ) : null;

  return (
    <div className="mt-1 space-y-0.5">
      {emRota ? (
        <ResumoEmRota info={info} />
      ) : (
        linhaData &&
        (ocorrencia ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-fit cursor-help">{linhaData}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-[280px]">{ocorrencia}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          linhaData
        ))
      )}


      {info.transportadora_nome ? (
        <p className="text-[11px] text-muted-foreground">{info.transportadora_nome}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground/60 italic">transportadora não registrada</p>
      )}

      {info.nf_numero ? (
        <p className="text-[11px] text-muted-foreground">
          NF{" "}
          {info.nf_id ? (
            <button
              type="button"
              disabled={baixando}
              className="underline text-primary disabled:opacity-60"
              onClick={(e) => {
                e.stopPropagation();
                baixar({ nf_id: info.nf_id!, nome: `NF-${info.nf_numero}${info.nf_serie ? `-${info.nf_serie}` : ""}` });
              }}
              title="Baixar PDF da NF"
            >
              {baixando ? <Loader2 className="inline h-3 w-3 animate-spin" /> : info.nf_numero}
            </button>
          ) : (
            info.nf_numero
          )}
          {info.nf_serie ? ` · série ${info.nf_serie}` : ""}
        </p>
      ) : (
        <p className="text-[11px] text-warning">sem NF registrada</p>
      )}
    </div>
  );
}
