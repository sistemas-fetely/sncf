import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EntregaLinhaInfo } from "@/hooks/pedidos/usePedidoEntrega";

/**
 * PREVISAO-VEM-DO-BANCO (21/08/2026)
 * Formatação e selos de prazo compartilhados entre a coluna Entrega da fila e o
 * resumo de linha. O front não calcula prazo: meta, previsão e desvio (dias úteis)
 * vêm de vw_pedido_entrega. Nunca se troca uma data por um delta.
 */

export function fmtDataCurta(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function fmtDataLonga(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Só responde "essa data já passou?" — nunca calcula diferença (isso é do banco). */
export function jaPassou(v: string | null): boolean {
  if (!v) return false;
  const d = new Date(v);
  if (isNaN(d.getTime())) return false;
  const hoje = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return b > a;
}

/** Selo de procedência da data de entrega já confirmada. */
export function proveniencia(metodo: string | null): { rotulo: string; alerta: boolean } {
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
  condicional_espera_externa: "condicional",
  disponibilidade_retira: "retirada",
  custodia_transferida: "custódia transferida",
  pior_caso_acima_do_teto: "pior caso",
};

export function rotuloFonte(fonte: string | null): string | null {
  if (!fonte) return null;
  return FONTE_ROTULO[fonte] ?? fonte.replace(/_/g, " ");
}

/** Confiança baixa precisa destoar da alta: define se o operador pode repassar a data. */
export function classeConfianca(confianca: string | null): string {
  if (confianca === "fato" || confianca === "alta") return "bg-success/10 text-success border-success/30";
  if (confianca === "baixa") return "bg-warning/15 text-warning border-warning/40 font-medium";
  return "bg-muted text-muted-foreground border-border";
}

const TRANSITO_FONTE_ROTULO: Record<string, string> = {
  tabela_transportadora: "tabela da transportadora para o CEP de destino",
  pior_caso: "prazo de pior caso (transportadora ainda não definida)",
  retira_ou_cliente_contrata: "retirada ou frete contratado pelo cliente",
};

export function textoTooltipMeta(info: EntregaLinhaInfo): string {
  let t =
    "Meta Pedido: alvo cravado na entrada do pedido, somando os SLAs internos de cada fase mais o prazo de trânsito da transportadora até o CEP de destino.";
  if (info.transito_dias != null) {
    const f = info.transito_fonte
      ? TRANSITO_FONTE_ROTULO[info.transito_fonte] ?? info.transito_fonte.replace(/_/g, " ")
      : null;
    t += ` Entraram ${info.transito_dias} dia(s) úteis de trânsito${f ? `, vindos da ${f}` : ""}.`;
  }
  if (info.meta_provisoria) {
    t += " Meta provisória: cravada sem transportadora definida, com prazo de pior caso.";
  }
  const original = fmtDataLonga(info.meta_original);
  if (original && info.meta_original !== info.data_entrega_prevista) {
    t += ` Meta original era ${original}, recravada depois.`;
  }
  return t;
}

export function Selo({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-[10px] rounded px-1 py-[1px] border whitespace-nowrap", className)}>{children}</span>;
}

/**
 * Bloco de prazo: meta e previsão empilhadas, nunca uma no lugar da outra.
 * `formato` controla só o comprimento das datas (coluna estreita usa "curta").
 */
export function BlocoPrazo({
  info,
  formato = "curta",
}: {
  info: EntregaLinhaInfo;
  formato?: "curta" | "longa";
}) {
  const fmt = formato === "longa" ? fmtDataLonga : fmtDataCurta;
  const meta = fmt(info.data_entrega_prevista);
  const previsao = fmt(info.previsao_entrega);
  const desvio = info.dias_vs_meta;
  const entregue = !!info.entregue_em || info.previsao_fonte === "entrega_confirmada";
  const metaVencida = !entregue && jaPassou(info.data_entrega_prevista);
  const previsaoVencida = !entregue && info.previsao_confianca !== "fato" && jaPassou(info.previsao_entrega);
  const retira = info.previsao_fonte === "disponibilidade_retira";
  const fonte = rotuloFonte(info.previsao_fonte);

  if (!meta && !previsao) {
    return (
      <p className="text-[11px] text-muted-foreground/60 italic">
        {info.previsao_motivo_sem_data || "Sem previsão"}
      </p>
    );
  }

  return (
    <div className="space-y-0.5 min-w-0">
      {meta && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-fit cursor-help flex flex-wrap items-center gap-1">
                <Selo className="bg-muted text-muted-foreground border-border">Meta Pedido</Selo>
                <span className={cn("text-[11px]", metaVencida ? "text-warning font-medium" : "text-muted-foreground")}>
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
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-foreground">
            {retira ? "Disponível para retirada em " : "Previsão "}
            <span className={cn("font-medium", previsaoVencida && "text-destructive")}>{previsao}</span>
          </span>
          {fonte && <Selo className={classeConfianca(info.previsao_confianca)}>{fonte}</Selo>}
          {previsaoVencida && (
            <Selo className="bg-destructive/15 text-destructive border-destructive/40 font-medium">
              previsão vencida
            </Selo>
          )}
          {desvio != null && desvio !== 0 && (
            <span className={cn("text-[11px]", desvio > 0 ? "text-destructive font-medium" : "text-success")}>
              {desvio > 0 ? `+${desvio}d` : `${desvio}d`}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/70 italic">
          {info.previsao_motivo_sem_data || "Sem previsão"}
        </p>
      )}
    </div>
  );
}
