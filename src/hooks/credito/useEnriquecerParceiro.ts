import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Resultado {
  enriquecido: boolean;
  razao_social?: string;
  socios_criados?: number;
  grupo_vinculado?: boolean;
  grupo_criado?: boolean;
  motivo?: string;
  error?: string;
}

export function useEnriquecerParceiro() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (parceiro_id: string): Promise<Resultado> => {
      const { data, error } = await supabase.functions.invoke(
        "enriquecer-parceiro-cnpj",
        { body: { parceiro_id } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as Resultado;
    },
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ["analise-detalhe"] });
      qc.invalidateQueries({ queryKey: ["cliente-detalhe"] });
      qc.invalidateQueries({ queryKey: ["analises-fila"] });
      qc.invalidateQueries({ queryKey: ["parceiro-detalhe"] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });

      if (resp.enriquecido) {
        const partes: string[] = [];
        if (resp.razao_social) partes.push(resp.razao_social);
        if (resp.socios_criados) partes.push(`${resp.socios_criados} sócios`);
        if (resp.grupo_criado) partes.push("grupo criado");
        else if (resp.grupo_vinculado) partes.push("vinculado a grupo");

        toast({
          title: "Cadastro enriquecido",
          description: partes.join(" · "),
        });
      } else {
        toast({
          title: "Não foi possível enriquecer",
          description:
            resp.motivo === "cnpj_nao_encontrado"
              ? "CNPJ não encontrado na BrasilAPI"
              : resp.motivo === "cnpj_invalido"
                ? "CNPJ inválido"
                : "Tente novamente em alguns minutos",
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao enriquecer cadastro",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
