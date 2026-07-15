import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EnvioBoleto {
  id: string;
  tipo_email: string;
  destinatario: string;
  enviado_em: string;
}

export function useEnviosBoletoTitulo(pedido_id: string | null | undefined, titulo_id?: string | null) {
  return useQuery({
    queryKey: ["envios-boleto-titulo", pedido_id, titulo_id],
    queryFn: async (): Promise<EnvioBoleto[]> => {
      if (!pedido_id) return [];
      const { data, error } = await (supabase as any)
        .from("pedido_email_log")
        .select("id, tipo_email, destinatario, enviado_em, titulo_id")
        .eq("pedido_id", pedido_id)
        .in("tipo_email", ["boleto-safra", "boleto", "link-cobranca", "cobranca"])
        .order("enviado_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      const list = (data ?? []) as any[];
      const filtered = titulo_id ? list.filter((r) => !r.titulo_id || r.titulo_id === titulo_id) : list;
      return filtered.slice(0, 5).map((r) => ({
        id: r.id,
        tipo_email: r.tipo_email,
        destinatario: r.destinatario,
        enviado_em: r.enviado_em,
      }));
    },
    enabled: !!pedido_id,
    staleTime: 30_000,
  });
}

export interface InstrumentoLogEntry {
  id: string;
  titulo_id: string;
  evento: string;
  data_anterior: string | null;
  data_nova: string | null;
  nosso_numero_anterior: string | null;
  nosso_numero_novo: string | null;
  detalhe: string | null;
  origem: string | null;
  created_at: string;
}

export function useHistoricoInstrumento(titulo_id: string | null | undefined, limit = 8) {
  return useQuery({
    queryKey: ["titulo-instrumento-log", titulo_id, limit],
    queryFn: async (): Promise<InstrumentoLogEntry[]> => {
      if (!titulo_id) return [];
      const { data, error } = await (supabase as any)
        .from("titulo_instrumento_log")
        .select("id, titulo_id, evento, data_anterior, data_nova, nosso_numero_anterior, nosso_numero_novo, detalhe, origem, created_at")
        .eq("titulo_id", titulo_id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as InstrumentoLogEntry[];
    },
    enabled: !!titulo_id,
    staleTime: 30_000,
  });
}
