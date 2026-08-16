import { CheckCircle2, Clock, AlertTriangle, Info, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSituacaoFinanceiraPedido } from "@/hooks/useSituacaoFinanceiraPedido";

const ESTILOS: Record<
  string,
  { classe: string; Icone: typeof Info; iconeClasse: string }
> = {
  coberto_haver: {
    classe:
      "border-success/40 bg-success/10 text-success",
    Icone: CheckCircle2,
    iconeClasse: "text-success",
  },
  previsto: {
    classe:
      "border-info/40 bg-info/10 text-info",
    Icone: Clock,
    iconeClasse: "text-info",
  },
  recebivel_familia: {
    classe:
      "border-info/40 bg-info/10 text-info",
    Icone: Info,
    iconeClasse: "text-info",
  },
  sem_cobranca: {
    classe: "border-border bg-muted/40 text-foreground",
    Icone: Info,
    iconeClasse: "text-muted-foreground",
  },
  sem_recebivel: {
    classe:
      "border-destructive/40 bg-destructive/10 text-destructive dark:text-destructive-foreground",
    Icone: AlertTriangle,
    iconeClasse: "text-destructive",
  },
};

const NEUTRO = {
  classe: "border-border bg-muted/40 text-foreground",
  Icone: Info,
  iconeClasse: "text-muted-foreground",
};

function Fallback({ compacto }: { compacto?: boolean }) {
  if (compacto) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Nenhum título gerado ainda.
      </p>
    );
  }
  return (
    <div className="text-center py-6 text-muted-foreground space-y-2">
      <Receipt className="h-8 w-8 mx-auto opacity-30" />
      <p className="text-sm">Nenhum título gerado ainda.</p>
      <p className="text-xs">Títulos nascem ao chegar em Pré-Faturado.</p>
    </div>
  );
}

/**
 * Bloco exibido na aba Parcelas quando o pedido não tem título.
 * O texto vem pronto do banco (`situacao_rotulo`) — não reescrever aqui.
 */
export function SituacaoFinanceiraBloco({
  pedidoId,
  compacto,
}: {
  pedidoId: string;
  compacto?: boolean;
}) {
  const { data, isLoading, isError } = useSituacaoFinanceiraPedido(pedidoId);

  if (isLoading) return <Fallback compacto={compacto} />;
  if (isError || !data || !data.situacao_rotulo) return <Fallback compacto={compacto} />;

  const estilo = ESTILOS[data.situacao_financeira ?? ""] ?? NEUTRO;
  const { Icone } = estilo;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2.5",
        estilo.classe,
      )}
    >
      <Icone className={cn("h-4 w-4 mt-0.5 shrink-0", estilo.iconeClasse)} />
      <p className="text-sm">{data.situacao_rotulo}</p>
    </div>
  );
}
