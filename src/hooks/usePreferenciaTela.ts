import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { rawMessage } from "@/lib/format-error";

/**
 * Preferencia de tela por USUARIO, guardada no banco (`user_preferencias_tela`).
 * Antes cada tela resolvia do seu jeito: colunas so' em estado React (sumiam ao
 * sair) e tamanho de pagina em localStorage (preso ao navegador). Agora e' uma
 * regra so'.
 *
 * - `user_id` NUNCA vai na query nem na RPC: quem resolve e' a sessao (RLS).
 * - enquanto carrega, devolve o padrao — a tela nunca espera preferencia.
 * - gravacao com debounce (~800ms): arrastar coluna nao vira escrita por pixel.
 * - falha de gravacao NAO quebra a tela: estado local segue, toast discreto e
 *   console.error. Preferencia e' conforto, nao caminho critico.
 */
export function usePreferenciaTela<T extends Record<string, unknown>>(
  tela: string,
  padrao: T,
) {
  const qc = useQueryClient();
  const chave = useMemo(() => ["preferencia-tela", tela] as const, [tela]);

  const { data, isLoading } = useQuery({
    queryKey: chave,
    enabled: !!tela,
    staleTime: Infinity,
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase
        .from("user_preferencias_tela")
        .select("preferencias")
        .eq("tela", tela)
        .maybeSingle();
      if (error) throw error;
      const p = data?.preferencias;
      return p && typeof p === "object" && !Array.isArray(p)
        ? (p as Record<string, unknown>)
        : {};
    },
  });

  const preferencias = useMemo<T>(
    () => ({ ...padrao, ...(data ?? {}) }) as T,
    // padrao e' literal em cada tela; comparar por conteudo evita loop de render
    [data, JSON.stringify(padrao)], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pendente = useRef<Record<string, unknown> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const salvar = useCallback(
    (patch: Partial<T>) => {
      const atual =
        pendente.current ??
        (qc.getQueryData<Record<string, unknown>>(chave) ?? {});
      const proximo = { ...atual, ...patch };
      pendente.current = proximo;
      qc.setQueryData(chave, proximo);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const corpo = pendente.current ?? proximo;
        pendente.current = null;
        const { error } = await supabase.rpc("fn_preferencia_tela_salvar", {
          p_tela: tela,
          p_preferencias: corpo as never,
        });
        if (error) {
          console.error("fn_preferencia_tela_salvar", error);
          toast.error("Não salvei sua preferência de tela", {
            description: rawMessage(error),
          });
        }
      }, 800);
    },
    [qc, chave, tela],
  );

  return { preferencias, salvar, carregando: isLoading };
}
