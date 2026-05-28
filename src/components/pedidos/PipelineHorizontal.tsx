import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePedidosPipeline } from "@/hooks/pedidos/usePedidosPipeline";
import {
  ESTAGIO_LABELS, ESTAGIO_CORES, ESTAGIO_ORDEM,
  ESTAGIO_FASE, FASE_LABELS, FASE_ORDEM,
} from "@/types/pedido";
import type { EstagioPedido, FaseCluster } from "@/types/pedido";
import { useMemo } from "react";

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

interface Props {
  onClickEstagio?: (estagio: EstagioPedido) => void;
  estagioAtivo?: EstagioPedido | null;
}

interface EstagioConsolidado {
  estagio: EstagioPedido;
  qtd: number;
  valor: number;
  sla: number;
}

interface ClusterAgrupado {
  fase: FaseCluster;
  estagios: EstagioConsolidado[];
  qtdTotal: number;
}

export function PipelineHorizontal({ onClickEstagio, estagioAtivo }: Props) {
  const { data, isLoading } = usePedidosPipeline();

  const consolidado: EstagioConsolidado[] = useMemo(() => {
    const map = new Map<EstagioPedido, { qtd: number; valor: number; sla: number }>();
    ESTAGIO_ORDEM.forEach((e) => map.set(e, { qtd: 0, valor: 0, sla: 0 }));
    (data || []).forEach((row) => {
      const atual = map.get(row.estagio) || { qtd: 0, valor: 0, sla: 0 };
      atual.qtd += row.qtd;
      atual.valor += Number(row.soma_valor || 0);
      atual.sla += row.qtd_sla_estourado;
      map.set(row.estagio, atual);
    });
    return ESTAGIO_ORDEM.map((estagio) => ({
      estagio,
      ...(map.get(estagio) || { qtd: 0, valor: 0, sla: 0 }),
    }));
  }, [data]);

  // Filtra estágios efêmeros/legados quando vazios:
  // - em_cobranca legado (substituído pelas 3 trilhas)
  // - recebido (efêmero — alocação automática vai retirar em segundos)
  const visiveisNaBarra = useMemo(
    () =>
      consolidado.filter(
        (e) => !["em_cobranca", "recebido"].includes(e.estagio) && e.qtd === 0)
      ),
    [consolidado]
  );

  // Agrupa em clusters — esconde clusters totalmente vazios
  const clusters: ClusterAgrupado[] = useMemo(() => {
    const map = new Map<FaseCluster, EstagioConsolidado[]>();
    FASE_ORDEM.forEach((f) => map.set(f, []));
    visiveisNaBarra.forEach((e) => {
      const fase = ESTAGIO_FASE[e.estagio];
      const arr = map.get(fase) || [];
      arr.push(e);
      map.set(fase, arr);
    });
    return FASE_ORDEM.map((fase) => {
      const estagios = map.get(fase) || [];
      return {
        fase,
        estagios,
        qtdTotal: estagios.reduce((acc, e) => acc + e.qtd, 0),
      };
    }).filter((c) => c.estagios.length > 0); // esconde clusters sem nenhum estágio visível
  }, [visiveisNaBarra]);

  const total = consolidado.reduce((acc, e) => acc + e.qtd, 0);
  const totalAtivo = consolidado
    .filter((e) => !["entregue", "cancelado"].includes(e.estagio))
    .reduce((acc, e) => acc + e.qtd, 0);
  const slaEstouradoTotal = consolidado.reduce((acc, e) => acc + e.sla, 0);

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-semibold">{totalAtivo} em operação</span>
            <span className="text-muted-foreground"> · {total} total</span>
          </div>
          {slaEstouradoTotal > 0 && (
            <div className="text-xs text-red-600 font-medium">
              {slaEstouradoTotal} pedido{slaEstouradoTotal > 1 ? "s" : ""} com SLA estourado
            </div>
          )}
        </div>

        {/* Cluster headers */}
        <div className="flex w-full text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {clusters.map((c) => {
            const peso = Math.max(c.qtdTotal, c.estagios.length * 0.3);
            return (
              <div
                key={c.fase}
                style={{ flex: peso }}
                className="px-1 truncate"
              >
                {FASE_LABELS[c.fase]}
                {c.qtdTotal > 0 && (
                  <span className="text-foreground/70 normal-case"> · {c.qtdTotal}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Barra de segmentos agrupados */}
        <div className="flex h-8 w-full rounded-md overflow-hidden border border-border">
          {clusters.map((c, idx) => {
            const pesoCluster = Math.max(c.qtdTotal, c.estagios.length * 0.3);
            return (
              <div
                key={c.fase}
                style={{ flex: pesoCluster }}
                className={cn(
                  "flex h-full",
                  idx < clusters.length - 1 && "border-r-2 border-background"
                )}
              >
                {c.estagios.map(({ estagio, qtd }) => {
                  const flexBase = qtd > 0 ? Math.max(qtd, 0.5) : 0.2;
                  const isAtivo = estagioAtivo === estagio;
                  return (
                    <button
                      key={estagio}
                      type="button"
                      onClick={() => onClickEstagio?.(estagio)}
                      style={{ flex: flexBase }}
                      title={`${ESTAGIO_LABELS[estagio]}: ${qtd}`}
                      className={cn(
                        "text-[11px] font-medium text-white px-1 transition-all hover:opacity-90 border-r border-white/20 last:border-r-0",
                        ESTAGIO_CORES[estagio],
                        qtd === 0 && "opacity-25",
                        isAtivo && "ring-2 ring-foreground/30 ring-inset"
                      )}
                    >
                      {qtd > 0 ? qtd : ""}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Legenda — só estágios com qtd > 0 ou SLA estourado */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {consolidado
            .filter((e) => e.qtd > 0 || e.sla > 0)
            .map(({ estagio, qtd, valor, sla }) => (
              <div key={estagio} className="flex items-center gap-1">
                <span className={cn("h-2 w-2 rounded-sm", ESTAGIO_CORES[estagio])} />
                <span>{ESTAGIO_LABELS[estagio]}</span>
                <span className="font-medium text-foreground">· {qtd}</span>
                {qtd > 0 && <span>· {fmtBRL(valor)}</span>}
                {sla > 0 && (
                  <span className="text-red-600 font-medium">· {sla} SLA</span>
                )}
              </div>
            ))}
          {consolidado.every((e) => e.qtd === 0) && (
            <span>Nenhum pedido no funil</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
