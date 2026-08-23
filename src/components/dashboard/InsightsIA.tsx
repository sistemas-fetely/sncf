import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FETELY_GREEN = "#1A4A3A";
const FETELY_GREEN_BG = "#F0F7F4";

interface InsightsIAProps {
  onboardingsAtrasados: number;
  contratosVencendo: number;
  tarefasBloqueantes: number;
}

interface InsightsPayload {
  analise: string;
  prioridade_do_dia: string;
  dica_produtividade: string;
  noticia?: {
    titulo: string;
    resumo: string;
    fonte: string;
    url?: string;
  };
}

function getCacheKey() {
  const today = new Date().toISOString().split("T")[0];
  return `insights_ia_${today}`;
}

export default function InsightsIA(props: InsightsIAProps) {
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fetchInsights = useCallback(
    async (force = false) => {
      const cacheKey = getCacheKey();
      if (!force) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            setInsights(JSON.parse(cached));
            return;
          } catch {
            localStorage.removeItem(cacheKey);
          }
        }
      }

      setLoading(true);
      setErro(null);
      try {
        const { data, error } = await supabase.functions.invoke("dashboard-insights", {
          body: props,
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.insights) throw new Error("Resposta inválida da IA");

        setInsights(data.insights);
        localStorage.setItem(cacheKey, JSON.stringify(data.insights));
      } catch (e: any) {
        const msg = e?.message || "Não foi possível gerar insights. Tente novamente.";
        setErro(msg);
        if (force) toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    // Recriar callback quando os números mudarem
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.onboardingsAtrasados,
      props.contratosVencendo,
      props.tarefasBloqueantes,
    ],
  );

  useEffect(() => {
    fetchInsights(false);
  }, [fetchInsights]);

  const handleRefresh = () => {
    // Limpa cache do dia e força refetch
    localStorage.removeItem(getCacheKey());
    fetchInsights(true);
  };

  return (
    <Card className="card-shadow animate-fade-in border-l-4" style={{ borderLeftColor: FETELY_GREEN }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: FETELY_GREEN }} />
            Insights IA
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              Atualizado em {new Date().toLocaleDateString("pt-BR")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleRefresh}
              disabled={loading}
              title="Atualizar insights"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : erro && !insights ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">{erro}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Tentar novamente
            </Button>
          </div>
        ) : insights ? (
          <>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium mb-1" style={{ color: FETELY_GREEN }}>
                📊 Análise do Momento
              </p>
              <p className="text-sm">{insights.analise}</p>
            </div>

            <div className="p-3 rounded-lg" style={{ backgroundColor: FETELY_GREEN_BG }}>
              <p className="text-sm font-medium mb-1" style={{ color: FETELY_GREEN }}>
                🎯 Prioridade do Dia
              </p>
              <p className="text-sm">{insights.prioridade_do_dia}</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-sm font-medium mb-1">💡 Dica</p>
              <p className="text-sm">{insights.dica_produtividade}</p>
            </div>

            {insights.noticia && (
              <div className="p-3 rounded-lg border">
                {insights.noticia.url ? (
                  <a
                    href={insights.noticia.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium mb-1 hover:underline flex items-center gap-1"
                    style={{ color: FETELY_GREEN }}
                  >
                    📰 {insights.noticia.titulo}
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                ) : (
                  <p className="text-sm font-medium mb-1">📰 {insights.noticia.titulo}</p>
                )}
                <p className="text-xs text-muted-foreground">{insights.noticia.resumo}</p>
                {insights.noticia.fonte && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Fonte: {insights.noticia.fonte}
                  </p>
                )}
                {insights.noticia.url && (
                  <a
                    href={insights.noticia.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs inline-flex items-center gap-1 mt-1.5 hover:underline"
                    style={{ color: FETELY_GREEN }}
                  >
                    Ler matéria completa <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Clique em atualizar para gerar insights
          </p>
        )}
      </CardContent>
    </Card>
  );
}
