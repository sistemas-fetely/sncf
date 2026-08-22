import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntregaLinhaInfo } from "@/hooks/pedidos/usePedidoEntrega";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";
import { BlocoPrazo, Selo, fmtDataCurta, proveniencia } from "@/components/pedidos/prazoEntrega";

/** Linha da NF na coluna Valor: faturamento é fato do dinheiro. */
export function LinhaNfFila({ info }: { info: EntregaLinhaInfo | undefined }) {
  const { baixar, baixando } = useDownloadNfPdf();
  if (!info?.nf_numero) return null;
  const naoAutorizada = !!info.nf_situacao && info.nf_situacao !== "autorizada";
  return (
    <button
      type="button"
      disabled={baixando || !info.nf_id}
      className="w-fit disabled:opacity-60"
      onClick={(e) => {
        e.stopPropagation();
        if (info.nf_id) {
          baixar({ nf_id: info.nf_id, nome: `NF-${info.nf_numero}${info.nf_serie ? `-${info.nf_serie}` : ""}` });
        }
      }}
      title={info.nf_id ? "Baixar PDF da NF" : undefined}
    >
      <Selo
        className={cn(
          "inline-flex items-center gap-1",
          naoAutorizada
            ? "bg-warning/15 text-warning border-warning/40 font-medium"
            : "bg-muted text-muted-foreground border-border",
        )}
      >
        {baixando && <Loader2 className="h-3 w-3 animate-spin" />}
        NF {info.nf_numero}
        {info.nf_serie ? ` · série ${info.nf_serie}` : ""}
        {naoAutorizada
          ? ` · ${info.nf_situacao === "pendente" ? "pendente de autorização" : info.nf_situacao}`
          : ""}
      </Selo>
    </button>
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

/** Info da linha, com o apelido cadastral da transportadora (não está no tipo global). */
type EntregaLinhaInfoComApelido = EntregaLinhaInfo & {
  transportadora_apelido?: string | null;
};

/** Linha de cima: quem entrega, conforme a modalidade de transporte. */
function LinhaQuemEntrega({ info }: { info: EntregaLinhaInfoComApelido }) {
  const origem = info.transporte_origem;
  const nome = info.transportadora_apelido || info.transportadora_nome;
  const prevista = info.estagio && ESTAGIOS_PREVISAO.has(info.estagio);
  const sufixo = prevista ? " (prevista)" : "";

  if (origem === "cliente_retira_ou_propria") {
    return (
      <p className="text-[11px] text-foreground truncate" title="Cliente retira">
        Cliente retira
      </p>
    );
  }
  if (origem === "transportadora_via_frete" || origem === "transportadora") {
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

/**
 * Linha de baixo: meta e previsão CONVIVEM (PREVISAO-VEM-DO-BANCO, 21/08/2026).
 * Só o pedido entregue troca o bloco pela data real com selo de procedência.
 */
function LinhaDataProcedencia({ info }: { info: EntregaLinhaInfo }) {
  const entregueEm = info.entregue_em || info.data_entrega_transportadora;
  const entregue = info.estagio === "entregue" || !!info.entregue_em;
  const dataEntregue = fmtDataCurta(entregueEm);

  if (entregue && dataEntregue) {
    const proc = proveniencia(info.entregue_metodo);
    return (
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-success">Entregue {dataEntregue}</span>
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
    );
  }

  return <BlocoPrazo info={info} formato="curta" />;
}

/** Coluna Entrega da fila: quem entrega, o bloco de prazo e a última ocorrência. */
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
