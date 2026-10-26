import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface EnviarBlingResponse {
  sucesso: boolean;
  bling_id?: number;
  remessa_id?: string;
  remessa_codigo?: string;
  mensagem?: string;
  proximo_passo?: string;
  erro?: string;
  duracao_ms?: number;
}

interface EnviarBlingParams {
  pedido_id: string;
  remessa_id?: string;
  /** Override declarado do pré-faturamento (mínimo 15 caracteres, mesmo
   *  padrão do `forcar` em empurrar-pedido-xpm). */
  motivo?: string;
}

/** Falha em que o servidor pode ter concluído o envio sem a resposta chegar
 *  (corte de ~150s do gateway, queda de rede, 5xx). */
function respostaIncerta(error: any): boolean {
  const nome = String(error?.name ?? "");
  if (nome === "FunctionsFetchError" || nome === "FunctionsRelayError") return true;
  const status = Number(error?.context?.status ?? 0);
  return status === 0 || status >= 500;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Relê o pedido até o envio aparecer gravado (a edge grava só no fim). */
async function aguardarEnvioGravado(pedidoId: string, limiteMs = 180_000): Promise<number | null> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    const { data } = await supabase
      .from("pedidos")
      .select("bling_id_destino")
      .eq("id", pedidoId)
      .maybeSingle();
    const id = (data as any)?.bling_id_destino;
    if (id) return Number(id);
    await espera(5000);
  }
  return null;
}

export function useEnviarBling() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, remessa_id, motivo }: EnviarBlingParams): Promise<EnviarBlingResponse> => {
      const body: Record<string, string> = { pedido_id };
      if (remessa_id) body.remessa_id = remessa_id;
      if (motivo) body.motivo = motivo;

      const { data, error } = await supabase.functions.invoke<EnviarBlingResponse>(
        "enviar-pedido-bling",
        { body },
      );
      if (error && respostaIncerta(error)) {
        // Pedido grande (ex.: TRS com centenas de itens) passa do tempo máximo da
        // conexão: a tela recebia erro e rebuscava ANTES da edge gravar o envio.
        const blingId = await aguardarEnvioGravado(pedido_id);
        if (blingId) {
          return { sucesso: true, bling_id: blingId, proximo_passo: "confirmado após resposta demorada" };
        }
        throw new Error(
          "O Bling demorou e a resposta não chegou. Recarregue o pedido e confira se já foi enviado antes de tentar de novo.",
        );
      }
      if (error) {
        let msg = error.message;
        try {
          const b = await (error as any).context?.json?.();
          if (b?.erro) msg = typeof b.erro === "string" ? b.erro : JSON.stringify(b.erro);
        } catch { /* mantém mensagem genérica */ }
        throw new Error(msg);
      }
      if (!data?.sucesso) {
        const e = data?.erro;
        throw new Error(typeof e === "string" && e ? e : e ? JSON.stringify(e) : "Falha ao enviar pro Bling");
      }
      return data;
    },
    onSuccess: (data, vars) => {
      // `remessa_codigo` vem da edge como PED/NN. Na UI /NN e exclusivo do split:
      // aqui a linha e uma TENTATIVA de envio (decisao-remessa-e-tentativa-envio).
      const seqTentativa = data.remessa_codigo?.match(/\/(\d+)$/)?.[1];
      const desc = seqTentativa
        ? `Tentativa ${Number(seqTentativa)} · id Bling: ${data.bling_id}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`
        : `id Bling: ${data.bling_id}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`;

      toast({
        title: "Enviado pro Bling",
        description: data.proximo_passo ? `${desc} · ${data.proximo_passo}` : desc,
      });

      void invalidarPedido(qc, vars.pedido_id).catch(() => undefined);
    },
    onError: (e: Error, vars) => {
      toast({ title: "Erro ao enviar pro Bling", description: String(e?.message ?? e), variant: "destructive" });
      // A edge cria a remessa antes do POST: mesmo com falha, o estado pode ter mudado.
      // Falha da rebusca não pode virar erro não tratado e derrubar a tela.
      void invalidarPedido(qc, vars.pedido_id).catch(() => undefined);
    },
  });
}
