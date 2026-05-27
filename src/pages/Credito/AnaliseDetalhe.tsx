import { useParams, useNavigate } from "react-router-dom";
import { useAnaliseDetalhe } from "@/hooks/credito/useAnaliseDetalhe";
import { AnaliseDetalheEntrada } from "@/components/credito/AnaliseDetalheEntrada";
import { AnaliseDetalheAnalise } from "@/components/credito/AnaliseDetalheAnalise";
import { AnaliseDetalheDecisao } from "@/components/credito/AnaliseDetalheDecisao";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";

export default function AnaliseDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const statusFinal = data.analise.status_final as string | null;

  // Análise finalizada — tela read-only
  if (statusFinal) {
    const iconMap: Record<string, JSX.Element> = {
      aprovado: <CheckCircle2 className="h-10 w-10 text-green-600" />,
      aprovado_com_ressalva: <AlertCircle className="h-10 w-10 text-amber-600" />,
      reprovado: <XCircle className="h-10 w-10 text-destructive" />,
      cancelado: <XCircle className="h-10 w-10 text-muted-foreground" />,
    };

    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
        <CasaPageHeader
          breadcrumb={[
            { label: "Casa", to: "/" },
            { label: "Crédito", to: "/credito" },
            { label: `Análise · ${statusFinal.replace(/_/g, " ")}` },
          ]}
          title="Análise decidida"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => navigate("/credito?tab=decididas")}
            >
              <ArrowLeft className="h-4 w-4" />
              Fila (Decididas)
            </Button>
          }
        />
        <Card>
          <CardContent className="p-8 space-y-5 text-center">
            <div className="flex justify-center">{iconMap[statusFinal]}</div>
            <h1 className="text-2xl font-bold capitalize">
              Análise {statusFinal.replace(/_/g, " ")}
            </h1>
            <p className="text-sm text-muted-foreground">
              Decidida em{" "}
              {data.analise.decidido_em
                ? new Date(data.analise.decidido_em).toLocaleString("pt-BR")
                : "—"}
            </p>
            {data.analise.parecer_final && (
              <blockquote className="text-sm italic border-l-2 pl-3 text-left max-w-xl mx-auto">
                "{data.analise.parecer_final}"
              </blockquote>
            )}
            {data.analise.ressalva && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-left max-w-xl mx-auto">
                <p className="text-xs font-medium text-amber-900 uppercase tracking-wide mb-1">
                  Ressalva
                </p>
                <p className="text-sm text-amber-900">{data.analise.ressalva}</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t text-left">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Perfil</p>
                <p className="font-medium">{data.analise.perfil_aplicado || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Limite</p>
                <p className="font-medium">
                  R$ {Number(data.analise.limite_concedido || 0).toLocaleString("pt-BR")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Prazo</p>
                <p className="font-medium">{data.analise.prazo_max_dias || "—"} dias</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Validade</p>
                <p className="font-medium">
                  {data.analise.validade_ate
                    ? new Date(data.analise.validade_ate).toLocaleDateString("pt-BR")
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (estagio === "entrada") return <AnaliseDetalheEntrada analiseId={id} />;
  if (estagio === "analise") return <AnaliseDetalheAnalise analiseId={id} />;
  if (estagio === "decisao") return <AnaliseDetalheDecisao analiseId={id} />;

  return (
    <p className="text-muted-foreground">Estágio desconhecido: {estagio}</p>
  );
}
