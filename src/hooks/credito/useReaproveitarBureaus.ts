import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatError } from "@/lib/format-error";
import type { BureauReaproveitavel } from "@/types/credito";

interface Payload {
  analiseId: string;
  parceiroId: string;
  bureaus: BureauReaproveitavel[];
}

/**
 * Copia bureaus de outras análises do mesmo cliente para a análise atual,
 * gravando `reaproveitado_de_id` na linha nova. FAIL-LOUD.
 */
export function useReaproveitarBureaus() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ analiseId, parceiroId, bureaus }: Payload) => {
      if (!bureaus.length) throw new Error("Nenhum bureau selecionado.");

      const rows = bureaus.map((b) => ({
        analise_id: analiseId,
        parceiro_id: parceiroId,
        fonte: b.fonte,
        data_consulta: b.data_consulta,
        score_numerico: b.score_numerico,
        score_categorico: b.score_categorico,
        flag_pefin: b.flag_pefin,
        flag_refin: b.flag_refin,
        flag_protestos: b.flag_protestos,
        flag_falencia_rj: b.flag_falencia_rj,
        flag_acoes_judiciais: b.flag_acoes_judiciais,
        flag_cheque_devolvido: b.flag_cheque_devolvido,
        flag_divida_vencida: b.flag_divida_vencida,
        total_dividas: b.total_dividas,
        documento_storage_path: b.documento_storage_path,
        dados_extraidos_json: b.dados_extraidos_json,
        reaproveitado_de_id: b.reaproveitado_de_id ?? b.id,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("analise_credito_scores")
        .insert(rows);
      if (error) throw error;

      return rows.length;
    },
    onSuccess: (qtd, vars) => {
      qc.invalidateQueries({ queryKey: ["analise-detalhe", vars.analiseId] });
      toast({
        title: "Bureaus reaproveitados",
        description: `${qtd} bureau${qtd > 1 ? "s" : ""} anexado${qtd > 1 ? "s" : ""} a esta análise.`,
      });
    },
    onError: (e: unknown) => {
      toast({
        title: "Erro ao reaproveitar bureaus",
        description: formatError(e),
        variant: "destructive",
      });
    },
  });
}
