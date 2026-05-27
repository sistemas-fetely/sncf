import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { CriarAnalisePayload } from "@/types/credito";

interface CriarAnaliseResponse {
  analise_id: string;
  parceiro_id: string;
  pedido_id: string;
  status: "criada" | "ja_existe";
}

export function useCriarAnalise() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: CriarAnalisePayload): Promise<CriarAnaliseResponse> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("criar_analise_credito", {
        p_cnpj: payload.cnpj,
        p_id_externo: payload.id_externo,
        p_data_pedido: payload.data_pedido,
        p_valor_bruto: payload.valor_bruto,
        p_valor_liquido: payload.valor_liquido,
        p_condicao_solicitada: payload.condicao_solicitada,
        p_forma_solicitada: payload.forma_solicitada,
        p_desconto_pct: payload.desconto_pct ?? null,
        p_vendedor: payload.vendedor ?? null,
        p_origem: payload.origem ?? null,
        p_itens_json: payload.itens_json ?? null,
        p_recebido_via: payload.recebido_via ?? "api",
      });
      if (error) throw error;
      return data as CriarAnaliseResponse;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["analises-fila"] });

      if (data.status === "criada") {
        supabase.functions
          .invoke("enriquecer-parceiro-cnpj", {
            body: { parceiro_id: data.parceiro_id },
          })
          .then(() => {
            qc.invalidateQueries({ queryKey: ["analise-detalhe", data.analise_id] });
            qc.invalidateQueries({ queryKey: ["analises-fila"] });
          })
          .catch((e) => console.error("Erro enriquecimento background:", e));
      }

      toast({
        title: data.status === "ja_existe" ? "Análise já existente" : "Análise criada",
        description: `ID: ${data.analise_id.slice(0, 8)}...`,
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao criar análise",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
