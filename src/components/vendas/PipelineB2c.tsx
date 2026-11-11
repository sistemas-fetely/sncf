import { AlertTriangle, Inbox, Receipt, Clock, Package, FileText, Truck, PackageCheck, Ban } from "lucide-react";
import { PipelineFases } from "./PipelineFases";
import { usePipelineB2c } from "@/hooks/vendas/useB2c";

/**
 * Casa do B2C — pipeline horizontal do canal loja.
 * Lê vw_pipeline_b2c (uma linha por estágio). NÃO reaproveita PipelineHorizontal:
 * aquela é do B2B e tem outro catálogo de estágios.
 *
 * ENTRADA-B2C-POR-FASES (19/09/2026): a régua é só de FASES. "Fila ativa" e
 * "incluir cancelados" não são fase — saíram para a linha de filtros.
 */

const ICONES: Record<string, JSX.Element> = {
  recebido: <Inbox className="h-4 w-4" />,
  cobranca: <Receipt className="h-4 w-4" />,
  aguardando_pagamento: <Clock className="h-4 w-4" />,
  pre_separacao: <Clock className="h-4 w-4" />,
  em_separacao: <Package className="h-4 w-4" />,
  pre_faturamento: <FileText className="h-4 w-4" />,
  faturado: <FileText className="h-4 w-4" />,
  travado: <AlertTriangle className="h-4 w-4" />,
  em_transporte: <Truck className="h-4 w-4" />,
  entregue: <PackageCheck className="h-4 w-4" />,
  cancelado: <Ban className="h-4 w-4" />,
};

export interface ContagemEstagio {
  qtd: number;
  valor: number;
  alerta: number;
}

interface Props {
  estagioAtivo?: string | null;
  onClickEstagio?: (estagio: string) => void;
  onLimparFiltro?: () => void;
  /**
   * BADGE-LÊ-A-MESMA-FONTE: quantos alertas por estágio devem deixar de contar —
   * pedidos sem pedido interno SNCF cuja descida ao Bling está em dia (na fila
   * ou já enviado) não são problema. Reduz o com_alerta da view, nunca aumenta.
   */
  reducaoAlerta?: Record<string, number>;
  /**
   * Quando há filtro de CD ativo, a régua precisa contar a MESMA lista que a
   * tabela mostra — a view de pipeline é do total. Em modo Total, fica nulo.
   */
  contagens?: Record<string, ContagemEstagio> | null;
  /** Pedidos parados em Recebido há mais de 2h sem CD escolhido. */
  alertaSemCd?: number;
}

export function PipelineB2c({
  estagioAtivo,
  onClickEstagio,
  onLimparFiltro,
  reducaoAlerta,
  contagens,
  alertaSemCd = 0,
}: Props) {
  const { data, isLoading, isError, error } = usePipelineB2c();

  return <PipelineFases
    fases={(data ?? []).filter(f => f.visivel_no_pipeline).map(f => {
      const c = contagens?.[f.estagio];
      return {
        codigo: f.estagio,
        rotulo: f.rotulo ?? f.estagio,
        proxima_acao: f.proxima_acao,
        qtd: c ? c.qtd : Number(f.qtd ?? 0),
        valor: c ? c.valor : Number(f.soma_valor ?? 0),
        alertas: c ? c.alerta : Math.max(0, Number(f.com_alerta ?? 0) - (reducaoAlerta?.[f.estagio] ?? 0)),
        icone: ICONES[f.estagio],
        eh_desvio: !!f.eh_desvio,
        alertaSemCd: f.estagio === "recebido" ? alertaSemCd : 0,
      };
    })}
    estagioAtivo={estagioAtivo}
    onClickEstagio={onClickEstagio}
    onLimparFiltro={onLimparFiltro}
    carregando={isLoading}
    erro={isError ? `Erro ao carregar o pipeline do B2C: ${(error as Error)?.message ?? "erro desconhecido"}` : null}
  />;
}
