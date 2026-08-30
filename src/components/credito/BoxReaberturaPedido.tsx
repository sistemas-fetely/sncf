import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { AnaliseListItem, AnaliseTransicao } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "—";

interface Props {
  analiseAnteriorId: string;
  transicoes: AnaliseTransicao[];
  analisesAnteriores: AnaliseListItem[];
  /** Condição solicitada no pedido atual. */
  condicaoAtual: string | null | undefined;
  /** Valor líquido do pedido atual. */
  valorAtual: number | null | undefined;
}

export function BoxReaberturaPedido({
  analiseAnteriorId,
  transicoes,
  analisesAnteriores,
  condicaoAtual,
  valorAtual,
}: Props) {
  const reabertura = [...transicoes]
    .reverse()
    .find((t) => t.estagio_origem === "entrada" && !!t.motivo);

  const anterior = analisesAnteriores.find((a) => a.id === analiseAnteriorId);

  const { data: autor } = useQuery({
    queryKey: ["profile-nome", reabertura?.usuario_id],
    enabled: !!reabertura?.usuario_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", reabertura!.usuario_id!)
        .maybeSingle();
      if (error) throw error;
      return data?.full_name ?? null;
    },
  });

  const limiteAnterior = anterior?.limite_concedido ?? null;
  const valorPedido = Number(valorAtual ?? 0);
  const limiteDiverge = limiteAnterior != null && valorPedido > limiteAnterior;
  const condicaoDiverge =
    !!anterior?.pedido_condicao &&
    !!condicaoAtual &&
    anterior.pedido_condicao !== condicaoAtual;
  const validadeDiverge =
    !!anterior?.validade_ate &&
    new Date(anterior.validade_ate + "T00:00:00").getTime() < Date.now();

  return (
    <Card className="border-info/40 bg-info/10">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <RotateCcw className="h-4 w-4 text-info mt-0.5 shrink-0" />
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-info">Por que este pedido voltou</p>
            {reabertura?.motivo ? (
              <p className="text-sm text-info italic">"{reabertura.motivo}"</p>
            ) : (
              <p className="text-sm text-info/80">
                Reaberto sem motivo registrado na transição.
              </p>
            )}
            {reabertura && (
              <p className="text-xs text-info">
                {autor ? `Por ${autor} · ` : ""}
                {new Date(reabertura.criado_em).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </div>

        {anterior ? (
          <div className="rounded-md border border-info/30 bg-background/60 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Decisão anterior × pedido atual
            </p>
            <DeParaLinha
              label="Limite concedido"
              antes={limiteAnterior != null ? fmtBRL.format(limiteAnterior) : "—"}
              agora={fmtBRL.format(valorPedido)}
              diverge={limiteDiverge}
            />
            <DeParaLinha
              label="Condição"
              antes={anterior.pedido_condicao || "—"}
              agora={condicaoAtual || "—"}
              diverge={condicaoDiverge}
            />
            <DeParaLinha
              label="Prazo máximo"
              antes={anterior.prazo_max_dias ? `${anterior.prazo_max_dias} dias` : "—"}
              agora="a definir"
            />
            <DeParaLinha
              label="Validade"
              antes={fmtDate(anterior.validade_ate)}
              agora={validadeDiverge ? "vencida" : "vigente"}
              diverge={validadeDiverge}
            />
          </div>
        ) : (
          <p className="text-xs text-info/80">
            Análise anterior não encontrada no histórico deste cliente.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DeParaLinha({
  label,
  antes,
  agora,
  diverge,
}: {
  label: string;
  antes: string;
  agora: string;
  diverge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-right">
        <span className="text-muted-foreground line-through decoration-muted-foreground/40">
          {antes}
        </span>
        <span className={cn("font-medium", diverge && "text-warning")}>{agora}</span>
        {diverge && (
          <Badge variant="outline" className="border-warning/40 text-warning">
            diverge
          </Badge>
        )}
      </span>
    </div>
  );
}
