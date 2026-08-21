import { Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EntregaLinhaInfo } from "@/hooks/pedidos/usePedidoEntrega";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";

/**
 * PREVISAO-VEM-DO-BANCO (21/08/2026)
 * O front não calcula prazo. Meta, previsão e desvio (em dias úteis) vêm da view
 * vw_pedido_entrega. Aqui só se exibe — e nunca se troca uma data por um delta.
 */

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

function fmtData(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtCurta(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Data (só o dia) já passou? Usado apenas para "vencida", nunca para calcular desvio. */
function jaPassou(v: string | null): boolean {
  if (!v) return false;
  const d = new Date(v);
  if (isNaN(d.getTime())) return false;
  const hoje = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return b > a;
}

/** Selo de procedência da data de entrega confirmada. */
function proveniencia(metodo: string | null): { rotulo: string; alerta: boolean } {
  if (metodo === "transportadora") return { rotulo: "confirmado pela transportadora", alerta: false };
  if (metodo === "estimativa_cep") return { rotulo: "data estimada, não confirmada", alerta: true };
  return { rotulo: "origem da data desconhecida", alerta: true };
}

const FONTE_ROTULO: Record<string, string> = {
  entrega_confirmada: "entrega confirmada",
  cte_previsao: "prazo do CT-e",
  cte_emissao_mais_tabela: "CT-e + tabela",
  expedicao_mais_tabela: "estimado pela expedição",
  projecao_interna: "projetado pelas fases",
  condicional_espera_externa: "condicional (aguardando destravar)",
  disponibilidade_retira: "disponível para retirada",
  custodia_transferida: "custódia transferida",
  pior_caso_acima_do_teto: "pior caso",
};

function rotuloFonte(fonte: string | null): string | null {
  if (!fonte) return null;
  return FONTE_ROTULO[fonte] ?? fonte.replace(/_/g, " ");
}

/** Confiança baixa precisa ser visualmente distinta: o operador não repassa isso ao cliente. */
function classeConfianca(confianca: string | null): string {
  if (confianca === "fato") return "bg-success/10 text-success border-success/30";
  if (confianca === "alta") return "bg-success/10 text-success border-success/30";
  if (confianca === "media") return "bg-muted text-muted-foreground border-border";
  if (confianca === "baixa") return "bg-warning/15 text-warning border-warning/40 font-medium";
  return "bg-muted text-muted-foreground border-border";
}

const TRANSITO_FONTE_ROTULO: Record<string, string> = {
  tabela_transportadora: "tabela da transportadora para o CEP de destino",
  pior_caso: "prazo de pior caso (transportadora ainda não definida)",
  retira_ou_cliente_contrata: "retirada ou frete contratado pelo cliente",
};

function textoTooltipMeta(info: EntregaLinhaInfo): string {
  let t =
    "Meta Pedido: alvo cravado na entrada do pedido, somando os SLAs internos de cada fase mais o prazo de trânsito até o CEP de destino.";
  if (info.transito_dias != null) {
    const fonte = info.transito_fonte ? TRANSITO_FONTE_ROTULO[info.transito_fonte] ?? info.transito_fonte.replace(/_/g, " ") : null;
    t += ` Entraram ${info.transito_dias} dia(s) úteis de trânsito${fonte ? `, vindos da ${fonte}` : ""}.`;
  }
  if (info.meta_provisoria) {
    t += " Meta provisória: calculada sem transportadora definida, usando prazo de pior caso.";
  }
  const original = fmtData(info.meta_original);
  if (original && info.meta_original !== info.data_entrega_prevista) {
    t += ` Meta original era ${original}, recravada depois.`;
  }
  return t;
}

function Selo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-[10px] rounded px-1 py-[1px] border", className)}>{children}</span>;
}

/** Bloco de prazo: meta e previsão convivem — o desvio é adendo, nunca substituto. */
function BlocoPrazo({ info }: { info: EntregaLinhaInfo }) {
  const meta = fmtCurta(info.data_entrega_prevista);
  const previsao = fmtCurta(info.previsao_entrega);
  const desvio = info.dias_vs_meta;
  const metaVencida = !info.entregue_em && jaPassou(info.data_entrega_prevista);
  const previsaoVencida =
    !info.entregue_em && info.previsao_confianca !== "fato" && jaPassou(info.previsao_entrega);
  const retira = info.previsao_fonte === "disponibilidade_retira";
  const fonte = rotuloFonte(info.previsao_fonte);

  if (!meta && !previsao) {
    return (
      <p className="text-[11px] text-muted-foreground/60 italic">
        {info.previsao_motivo_sem_data || "sem previsão de entrega"}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {meta && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-fit cursor-help flex items-center gap-1">
                <Selo className="bg-muted text-muted-foreground border-border">Meta Pedido</Selo>
                <span
                  className={cn(
                    "text-[11px]",
                    metaVencida ? "text-warning font-medium" : "text-muted-foreground",
                  )}
                >
                  {meta}
                </span>
                {info.meta_provisoria && (
                  <Selo className="bg-warning/10 text-warning border-warning/30">a confirmar</Selo>
                )}
                {metaVencida && <Selo className="bg-warning/15 text-warning border-warning/40">meta vencida</Selo>}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[300px]">{textoTooltipMeta(info)}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {previsao ? (
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">·</span>
          <span className="text-[11px] text-foreground">
            {retira ? "Disponível para retirada em " : "Previsão "}
            <span className={cn(previsaoVencida ? "text-destructive font-medium" : "font-medium")}>{previsao}</span>
          </span>
          {fonte && <Selo className={classeConfianca(info.previsao_confianca)}>{fonte}</Selo>}
          {previsaoVencida && (
            <Selo className="bg-destructive/15 text-destructive border-destructive/40 font-medium">
              previsão vencida
            </Selo>
          )}
          {desvio != null && desvio !== 0 && (
            <span
              className={cn("text-[11px]", desvio > 0 ? "text-destructive font-medium" : "text-success")}
            >
              {desvio > 0 ? `+${desvio}d` : `${desvio}d`}
            </span>
          )}
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground/70 italic">
          · {info.previsao_motivo_sem_data || "sem previsão de entrega"}
        </span>
      )}
    </div>
  );
}

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

  const dataBruta = info.entregue_em || info.data_entrega_transportadora;
  const data = fmtData(dataBruta);
  const proc = proveniencia(info.entregue_metodo);
  const ocorrencia = info.entrega_ocorrencia_texto;

  const linhaData = data ? (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-muted-foreground">{data}</span>
      <Selo
        className={cn(
          proc.alerta
            ? "bg-warning/15 text-warning border-warning/40 font-medium"
            : "bg-success/10 text-success border-success/30",
        )}
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
          <BlocoPrazo info={info} />
          {ocorrencia ? (
            <p className={cn("text-[11px]", info.entrega_ocorrencia_problema ? "text-warning" : "text-muted-foreground")}>
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
