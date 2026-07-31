import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatError } from "@/lib/format-error";

export interface LinkPagamentoPedido {
  link_id: string;
  pedido_id: string;
  id_externo: string | null;
  estagio: string | null;
  parceiro_id: string | null;
  valor_liquido: number | null;
  link: string | null;
  tipo_pagamento: string | null;
  gerado_em: string | null;
  expira_em: string | null;
  dias_para_vencer: number | null;
  enviado_em: string | null;
  motivo_troca: string | null;
  substituiu_id: string | null;
  created_at: string | null;
  situacao: "valido" | "vencendo" | "expirado";
  cobranca_viva: boolean | null;
  renovado_nao_reenviado: boolean | null;
  links_na_trilha: number | null;
}

/** dd/MM/yyyy a partir de date (yyyy-mm-dd) ou ISO. */
export function fmtDataBR(v?: string | null): string {
  if (!v) return "—";
  const base = v.length <= 10 ? `${v}T12:00:00` : v;
  const d = new Date(base);
  if (isNaN(d.getTime())) return String(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function useLinkPagamentoPedido(pedidoId?: string | null) {
  return useQuery({
    queryKey: ["link-pagamento", pedidoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pedido_link_pagamento")
        .select("*")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw new Error(formatError(error));
      return (data ?? null) as LinkPagamentoPedido | null;
    },
    enabled: !!pedidoId,
  });
}

interface RegistrarArgs {
  pedido_id: string;
  link: string;
  gerado_em?: string | null;
  expira_em?: string | null;
  tipo_pagamento?: string | null;
  motivo?: string | null;
}

export function useRegistrarLinkPagamento() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: RegistrarArgs) => {
      const { data, error } = await (supabase as any).rpc("registrar_link_pagamento", {
        p_pedido_id: args.pedido_id,
        p_link: args.link,
        p_gerado_em: args.gerado_em ?? undefined,
        p_expira_em: args.expira_em ?? undefined,
        p_tipo_pagamento: args.tipo_pagamento ?? undefined,
        p_motivo: args.motivo ?? undefined,
      });
      if (error) throw new Error(formatError(error));
      return data as any;
    },
    onSuccess: (data, vars) => {
      toast({
        title: "Link renovado",
        description: `Válido até ${fmtDataBR(data?.expira_em)} · ${data?.titulos_atualizados ?? 0} título(s) e ${data?.portoes_atualizados ?? 0} portão(ões) atualizados`,
      });
      for (const key of [
        "link-pagamento",
        "portao-links",
        "gerenciar-links",
        "comunic-portao",
        "pedido-detalhe",
        "pedido-titulos",
      ]) {
        qc.invalidateQueries({ queryKey: [key, vars.pedido_id] });
      }
    },
    onError: (e: unknown) => {
      toast({ title: "Erro ao registrar link", description: formatError(e), variant: "destructive" });
    },
  });
}

export function useMarcarLinkEnviado() {
  return useMutation({
    mutationFn: async (pedido_id: string) => {
      const { data, error } = await (supabase as any).rpc("marcar_link_enviado", {
        p_pedido_id: pedido_id,
      });
      if (error) throw new Error(formatError(error));
      return data as any;
    },
  });
}
