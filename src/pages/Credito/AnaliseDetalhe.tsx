import { useParams } from "react-router-dom";
import { useAnaliseDetalhe } from "@/hooks/credito/useAnaliseDetalhe";
import { AnaliseDetalheEntrada } from "@/components/credito/AnaliseDetalheEntrada";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnaliseDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useAnaliseDetalhe(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!data || !id) {
    return <p className="text-muted-foreground">Análise não encontrada.</p>;
  }

  const estagio = data.analise.estagio_atual as string;

  if (estagio === "entrada") {
    return <AnaliseDetalheEntrada analiseId={id} />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">
        Análise {id.slice(0, 8)}... · Estágio: {estagio}
      </h1>
      <p className="text-sm text-muted-foreground">
        Layout do estágio "{estagio}" será construído nas sub-fases 4.3 (Análise) e 4.4 (Decisão).
      </p>
    </div>
  );
}
