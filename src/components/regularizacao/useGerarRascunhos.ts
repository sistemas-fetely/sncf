import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import type { RegularizacaoRetorno } from "./types";

export async function gerarRascunhoRegularizacao(id: string) {
  const { data, error } = await supabase.functions.invoke("regularizacao-gerar-rascunho", { body: { retorno_nf_id: id } });
  if (error) {
    const resposta = (error as { context?: unknown }).context;
    if (resposta instanceof Response) {
      const corpo = await resposta.clone().json().catch(() => null) as { erro?: string } | null;
      if (corpo?.erro) throw new Error(corpo.erro);
    }
    throw error;
  }
  if (!data?.ok) throw new Error(data?.erro ?? "Falha ao gerar rascunho.");
  return data;
}

export function useGerarRascunhos(retornos: RegularizacaoRetorno[], recarregar: () => Promise<unknown>) {
  const [progresso, setProgresso] = useState("");
  const pendentes = retornos.filter((r) => r.status === "planejada" || r.status === "erro");
  const gerarUm = useMutation({
    mutationFn: gerarRascunhoRegularizacao,
    onSuccess: async (data) => { toast.success(`Rascunho ${data.numero ?? ""} criado.`); await recarregar(); },
    onError: (error) => toast.error(rawMessage(error)),
  });
  const gerarTodos = async () => {
    for (let indice = 0; indice < pendentes.length; indice += 1) {
      setProgresso(`${indice + 1} de ${pendentes.length}`);
      try { await gerarRascunhoRegularizacao(pendentes[indice].id); await recarregar(); }
      catch (error) { toast.error(rawMessage(error)); setProgresso(""); return; }
    }
    setProgresso(""); toast.success("Todos os rascunhos pendentes foram criados.");
  };
  return { pendentes, progresso, gerarUm, gerarTodos };
}