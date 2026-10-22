import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { definirUrlPublicaDoBanco, getPublicAppUrl } from "@/lib/urls";

/** Lê `fn_url_publica()` UMA vez e aplica na fonte única de `urls.ts`. */
async function lerUrlPublica(): Promise<string> {
  const { data, error } = await (supabase as any).rpc("fn_url_publica");
  if (error) throw new Error(`fn_url_publica: ${error.message}`);
  definirUrlPublicaDoBanco(data as string | null);
  return getPublicAppUrl();
}

let promessaBoot: Promise<string> | null = null;

/** Chamado no boot (main.tsx). Falha registra no console e mantém o fallback. */
export function carregarUrlPublica(): Promise<string> {
  if (!promessaBoot) {
    promessaBoot = lerUrlPublica().catch((e) => {
      console.error("URL pública não carregou do banco; usando fallback.", e);
      promessaBoot = null;
      return getPublicAppUrl();
    });
  }
  return promessaBoot;
}

/** Para componentes: origem pública vigente (re-renderiza quando o banco responde). */
export function useUrlPublica(): string {
  const q = useQuery({
    queryKey: ["url-publica-app"],
    queryFn: carregarUrlPublica,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data ?? getPublicAppUrl();
}
