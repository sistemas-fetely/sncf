import { Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EntregaLinhaInfo } from "@/hooks/pedidos/usePedidoEntrega";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";

const TOOLTIP_META =
  "Alvo calculado pelo sistema: SLAs internos + 5 dias úteis de trânsito fixos. Não é prazo informado pela transportadora.";

function fmtDataCurta(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
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

/** Linha da NF na coluna Valor: faturamento é fato do dinheiro. */
export function LinhaNfFila({ info }: { info: EntregaLinhaInfo | undefined }) {
  const { baixar, baixando } = useDownloadNfPdf();
  if (!info?.nf_numero) return null;
  return (
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
  );
}

const ESTAGIOS_PREVISAO = new Set([
  "recebido",
  "em_analise_credito",
  "credito_aprovado",
  "cobranca",
  "aguardando_pagamento",
  "aguardando_estoque",
  "pre_separacao",
  "em_separacao",
  "pre_faturamento",
]);

/** Linha de cima: quem entrega, conforme a modalidade de transporte. */
function LinhaQuemEntrega({ info }: { info: EntregaLinhaInfo }) {
  const origem = info.transporte_origem;
  const nome = info.transportadora_nome;
  const prevista = info.estagio && ESTAGIOS_PREVISAO.has(info.estagio);
  const sufixo = prevista ? " (prevista)" : "";

  if (origem === "cliente_retira_ou_propria") {
    return (
      <p className="text-[11px] text-foreground truncate" title="Cliente retira">
        Cliente retira
      </p>
    );
  }
  if (origem === "transportadora_via_frete") {
    const texto = (nome || "Transportadora") + sufixo;
    return (
      <p className={cn("text-[11px] truncate", prevista ? "text-muted-foreground" : "text-foreground")} title={texto}>
        {texto}
      </p>
    );
  }
  if (origem === "transportadora") {
    const texto = (nome || "Transportadora") + sufixo;
    return (
      <p className={cn("text-[11px] truncate", prevista ? "text-muted-foreground" : "text-foreground")} title={texto}>
        {texto}
      </p>
    );
  }
  return (
    <p className="text-[11px] italic text-muted-foreground/60 truncate" title="Transportadora não definida">
      Transportadora não definida
    </p>
  );
}

/** Linha de baixo: ESCADA DE PROCEDÊNCIA — apenas um degrau, o mais alto. */
function LinhaDataProcedencia({ info }: { info: EntregaLinhaInfo }) {
  const entregue = fmtDataCurta(info.entregue_em || info.data_entrega_transportadora);
  if (entregue) {
    return <p className="text-[11px] text-success">Entregue {entregue}</p>;
  }

  const prazo = fmtDataCurta(info.prazo_transportadora);
  if (prazo) {
    return <p className="text-[11px] text-foreground">Transportadora: {prazo}</p>;
  }

  const meta = fmtDataCurta(info.data_entrega_prevista);
  if (meta) {
    const atraso = info.data_entrega_prevista ? diasDesde(info.data_entrega_prevista) : null;
    const atrasada = atraso !== null && atraso > 0;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-fit cursor-help flex flex-wrap items-center gap-1">
              <span className="text-[10px] rounded px-1 py-[1px] border bg-muted text-muted-foreground border-border">
                Meta interna
              </span>
              <span className={cn("text-[11px]", atrasada ? "text-destructive font-medium" : "text-muted-foreground")}>
                {atrasada ? `${atraso}d além da meta` : meta}
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
    );
  }

  return <p className="text-[11px] text-muted-foreground/60 italic">Sem previsão</p>;
}

/** Coluna Entrega da fila: quem entrega, a data pela escada e a última ocorrência. */
export function CelulaEntregaFila({ info }: { info: EntregaLinhaInfo | undefined }) {
  if (!info) {
    return <p className="text-[11px] text-muted-foreground/60 italic">Transportadora não definida</p>;
  }
  return (
    <div className="space-y-0.5 min-w-0">
      <LinhaQuemEntrega info={info} />
      <LinhaDataProcedencia info={info} />
      {info.entrega_ocorrencia_texto && (
        <p
          className={cn(
            "text-[11px]",
            info.entrega_ocorrencia_problema ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {info.entrega_ocorrencia_texto}
        </p>
      )}
    </div>
  );
}
