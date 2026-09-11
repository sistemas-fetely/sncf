import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { EstagioPedido } from "@/types/pedido";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface Args {
  pedido_id: string;
  para_estagio: EstagioPedido;
  proxima_acao?: string;
  motivo?: string;
}

/** Assinatura da guarda de lastro na RPC `transicionar_pedido` (ERRCODE 22023). */
const MARCA_SEM_LASTRO = "sem lastro para descer a pre-separacao";

/**
 * Assinatura da guarda de lastro FINANCEIRO (PED-2202): mesmo gatilho, outra
 * mensagem. Sem este segundo caminho o operador recebia um toast seco e não
 * tinha onde clicar.
 */
const MARCA_SEM_LASTRO_FIN = "sem lastro financeiro para descer a pre-separacao";

/** Extrai a lista de faltantes que vem depois de `Faltam: ` na mensagem do banco. */
function extrairFaltantes(msg: string): string[] {
  const i = msg.indexOf("Faltam:");
  if (i === -1) return [];
  return msg
    .slice(i + "Faltam:".length)
    .split(/[;,]/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

export interface FaltaLastroFinanceiro {
  falta: string | null;
  classe: string | null;
  classeMotivo: string | null;
  caminho: string | null;
  mensagem: string;
}

/**
 * Parse tolerante da mensagem do banco. Qualquer campo que não casar fica null;
 * o parse NUNCA estoura — no pior caso a tela mostra a mensagem cheia.
 */
function parseLastroFinanceiro(msg: string): FaltaLastroFinanceiro {
  const base: FaltaLastroFinanceiro = {
    falta: null,
    classe: null,
    classeMotivo: null,
    caminho: null,
    mensagem: msg,
  };
  try {
    const falta = msg.match(/Falta (.+?) de cobertura/);
    if (falta) base.falta = falta[1].trim();
    const classe = msg.match(/Cliente classe ([^\s(]+)\s*\(([^)]+)\)/);
    if (classe) {
      base.classe = classe[1].trim();
      base.classeMotivo = classe[2].trim();
    }
    const caminho = msg.match(/Caminho: (.+?)\. Ou informe/);
    if (caminho) base.caminho = caminho[1].trim();
  } catch {
    // parse defensivo: mantém só a mensagem cheia
  }
  return base;
}

export function useTransicionarPedido() {
  const qc = useQueryClient();
  const { toast } = useToast();

  /**
   * RESERVA-NASCE-DA-PRE-SEPARACAO: quando a guarda do banco bloqueia a descida
   * sem motivo, guardamos os faltantes aqui pra a tela abrir a confirmação de
   * override (o override é o próprio `motivo`).
   */
  const [faltaLastro, setFaltaLastro] = useState<{ faltantes: string[]; mensagem: string } | null>(null);
  const limparFaltaLastro = () => setFaltaLastro(null);

  /**
   * LASTRO-FINANCEIRO-TEM-PORTA-PROPRIA (PED-2202): guarda de dinheiro, não de
   * SKU. O diálogo oferece reenviar para análise, dividir o pedido ou forçar
   * com alçada — o toast seco morreu aqui.
   */
  const [faltaLastroFinanceiro, setFaltaLastroFinanceiro] = useState<FaltaLastroFinanceiro | null>(null);
  const limparFaltaLastroFinanceiro = () => setFaltaLastroFinanceiro(null);

  const mutation = useMutation({
    mutationFn: async ({ pedido_id, para_estagio, proxima_acao, motivo }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("transicionar_pedido", {
        p_pedido_id: pedido_id,
        p_para_estagio: para_estagio,
        p_proxima_acao: proxima_acao ?? null,
        p_motivo: motivo ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      setFaltaLastro(null);
      invalidarPedido(qc, variables.pedido_id);
      toast({ title: "Pedido avançado" });
    },
    onError: (e: Error, variables) => {
      const msg = e.message ?? "";
      const ehLastro = msg.includes(MARCA_SEM_LASTRO);
      if (ehLastro && !variables?.motivo) {
        setFaltaLastro({ faltantes: extrairFaltantes(msg), mensagem: msg });
        return;
      }
      toast({ title: "Erro ao avançar", description: msg, variant: "destructive" });
    },
  });

  return { ...mutation, faltaLastro, limparFaltaLastro };
}
