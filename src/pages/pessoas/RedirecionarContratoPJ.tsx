import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * MUNDO MORTO (25/09/2026): contratos_pj é somente leitura — a ficha oficial
 * do PJ é o vínculo em /pessoas. Este redirecionador encontra o vínculo que
 * nasceu do contrato (vinculos.origem_contrato_pj_id) e manda pra ficha.
 */
export default function RedirecionarContratoPJ() {
  const { id } = useParams<{ id: string }>();

  const vinculoQ = useQuery({
    queryKey: ["redirecionar-contrato-pj", id],
    enabled: !!id,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vinculos")
        .select("pessoa_id")
        .eq("origem_contrato_pj_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as { pessoa_id: string } | null;
    },
  });

  useEffect(() => {
    if (vinculoQ.isError) {
      // FAIL-LOUD: erro real (inclusive RLS negando) vai com a mensagem do banco.
      toast.error((vinculoQ.error as Error)?.message ?? "Erro ao localizar o vínculo do contrato.");
    }
  }, [vinculoQ.isError, vinculoQ.error]);

  if (vinculoQ.isLoading || vinculoQ.isFetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (vinculoQ.data?.pessoa_id) {
    return <Navigate to={`/pessoas/${vinculoQ.data.pessoa_id}/editar`} replace />;
  }

  // Não achou vínculo (ou erro já avisado acima).
  if (!vinculoQ.isError) {
    toast.info("Este contrato PJ antigo foi migrado para Pessoas.");
  }
  return <Navigate to="/pessoas?tipo=PJ" replace />;
}
