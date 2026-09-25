/**
 * Padrão PEDIDO-DE-ACESSO: botão travado por permissão vira sinal de demanda.
 * Sem permissão → o botão continua clicável (aria-disabled) e o clique
 * registra um pedido de acesso via `fn_pedir_acesso`.
 */
import * as React from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

export const QUERY_KEY_PEDIDOS_ACESSO = ["acesso-pedidos"] as const;

export function usePedirAcesso(slug: string, rotuloAcao: string, contexto?: Record<string, unknown>) {
  const { permitido, carregando } = usePermissaoAcaoOuSuperAdmin(slug);
  const location = useLocation();
  const qc = useQueryClient();
  const contextoRef = React.useRef(contexto);
  contextoRef.current = contexto;

  const pedir = React.useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("fn_pedir_acesso", {
      p_slug: slug,
      p_rota: location.pathname + location.search,
      p_rotulo: rotuloAcao,
      p_contexto: contextoRef.current ?? {},
    });
    if (error) {
      toast.error(`Não foi possível registrar o pedido de acesso: ${formatError(error)}`);
      return;
    }
    const r = (data ?? {}) as { ok?: boolean; ja_tem?: boolean; vezes?: number; erro?: string };
    if (r.ja_tem) {
      toast.success("Você já tem essa permissão — recarregue a tela.");
      return;
    }
    if (r.ok === false) {
      toast.error(`Não foi possível registrar o pedido de acesso: ${r.erro ?? "resposta sem ok"}`);
      return;
    }
    const vezes = Number(r.vezes ?? 1);
    toast.info(`Sem permissão para “${rotuloAcao}”`, {
      description:
        vezes > 1
          ? `Pedido de acesso registrado (${vezes}ª vez). O administrador vê no Console de Acesso.`
          : "Pedido de acesso registrado. O administrador vê no Console de Acesso.",
    });
    void qc.invalidateQueries({ queryKey: QUERY_KEY_PEDIDOS_ACESSO });
  }, [slug, rotuloAcao, location.pathname, location.search, qc]);

  return { permitido, carregando, pedir };
}

export interface BotaoGuardadoProps extends ButtonProps {
  slug: string;
  rotuloAcao: string;
  contexto?: Record<string, unknown>;
}

export const BotaoGuardado = React.forwardRef<HTMLButtonElement, BotaoGuardadoProps>(
  ({ slug, rotuloAcao, contexto, ...props }, ref) => {
    const { permitido, carregando, pedir } = usePedirAcesso(slug, rotuloAcao, contexto);
    if (carregando) return <Button ref={ref} {...props} disabled />;
    if (permitido) return <Button ref={ref} {...props} />;
    return (
      <Button
        ref={ref}
        {...props}
        disabled={false}
        aria-disabled="true"
        className={cn(props.className, "opacity-50 cursor-not-allowed")}
        title={`Sem permissão (${slug}) — clique para pedir acesso`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void pedir();
        }}
      />
    );
  },
);
BotaoGuardado.displayName = "BotaoGuardado";

export default BotaoGuardado;
