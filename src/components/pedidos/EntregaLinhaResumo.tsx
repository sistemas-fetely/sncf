import { Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EntregaLinhaInfo } from "@/hooks/pedidos/usePedidoEntrega";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";
import { BlocoPrazo, Selo, fmtDataLonga, proveniencia } from "@/components/pedidos/prazoEntrega";

/** Todas as fases mostram meta e previsão — prazo não é privilégio de quem já faturou. */
export const ESTAGIOS_COM_RESUMO_ENTREGA = [
  "recebido",
  "em_analise_credito",
  "credito_aprovado",
  "cobranca",
  "aguardando_pagamento",
  "aguardando_estoque",
  "pre_separacao",
  "em_separacao",
  "pre_faturamento",
  "faturado",
  "em_transporte",
  "entregue",
] as const;

function LinhaTransportadora({ nome }: { nome: string | null }) {
  return nome ? (
    <p className="text-[11px] text-muted-foreground">{nome}</p>
  ) : (
    <p className="text-[11px] text-muted-foreground/60 italic">transportadora não registrada</p>
  );
}

export function EntregaLinhaResumo({ info }: { info: EntregaLinhaInfo | undefined }) {
  const { baixar, baixando } = useDownloadNfPdf();
  if (!info) return null;

  const entregue = info.estagio === "entregue" || !!info.entregue_em;
  const data = fmtDataLonga(info.entregue_em || info.data_entrega_transportadora);
  const proc = proveniencia(info.entregue_metodo);
  const ocorrencia = info.entrega_ocorrencia_texto;

  const linhaData = data ? (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-muted-foreground">{data}</span>
      <Selo
        className={
          proc.alerta
            ? "bg-warning/15 text-warning border-warning/40 font-medium"
            : "bg-success/10 text-success border-success/30"
        }
      >
        {proc.rotulo}
      </Selo>
    </div>
  ) : null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
      {entregue && linhaData ? (
        ocorrencia ? (
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
        )
      ) : (
        <>
          <BlocoPrazo info={info} formato="longa" />
          {ocorrencia ? (
            <p
              className={cn(
                "text-[11px]",
                info.entrega_ocorrencia_problema ? "text-warning" : "text-muted-foreground",
              )}
            >
              Rastreio: {ocorrencia}
            </p>
          ) : null}
        </>
      )}
      <LinhaTransportadora nome={info.transportadora_nome} />

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
          {info.nf_situacao && info.nf_situacao !== "autorizada" ? (
            <span className="ml-1 text-warning">
              · {info.nf_situacao === "pendente" ? "pendente de autorização" : info.nf_situacao}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-[11px] text-warning">sem NF registrada</p>
      )}
    </div>
  );
}
