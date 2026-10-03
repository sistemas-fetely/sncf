import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { PixPagamento } from "@/components/venda-direta/PixPagamento";
import { invalidarVendaDireta } from "@/components/venda-direta/queryKeys";

export const QK_VD_PIX_SAFRA = "venda-direta-pix-safrapay";

interface PixAberto { id: string; pix_copia_cola: string | null; criado_em: string }

/** Cobrança PIX Safrapay aberta do pedido (meio = 'pix'), ou null. */
export function usePixSafrapay(pedidoId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_VD_PIX_SAFRA, pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("pagamento_link" as never)
        .select("id, pix_copia_cola, criado_em")
        .eq("pedido_id", pedidoId as string).eq("meio", "pix").eq("status", "aberto")
        .order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PixAberto | null;
    },
  });
}

/** safrapay_config.pix_ativo — false = PIX local é o oficial. */
export function usePixSafrapayAtivo() {
  return useQuery({
    queryKey: ["safrapay-config-pix-ativo"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("safrapay_config" as never).select("pix_ativo").eq("id", 1).maybeSingle();
      if (error) throw error;
      return (data as unknown as { pix_ativo: boolean | null } | null)?.pix_ativo === true;
    },
  });
}

export function SeloConfirmacaoAutomatica() {
  return (
    <span className="inline-flex items-center rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
      Confirmação automática
    </span>
  );
}

interface Props {
  pedidoId: string;
  idExterno: string | null;
  total: number | null;
  clienteNome: string | null;
  telefone: string | null;
  /** PIX atual (do criar_pedido_venda_direta / provisão) — usado quando não há cobrança Safrapay. */
  fallbackPayload: string | null;
  fallbackLink: string | null;
  /** Gera a cobrança Safrapay automaticamente se não houver nenhuma aberta. */
  auto?: boolean;
}

export function PixSafrapayPainel({ pedidoId, idExterno, total, clienteNome, telefone, fallbackPayload, fallbackLink, auto }: Props) {
  const qc = useQueryClient();
  const pixQ = usePixSafrapay(pedidoId);
  const ativoQ = usePixSafrapayAtivo();
  const pixAtivo = ativoQ.data === true;
  const [falhou, setFalhou] = useState<string | null>(null);
  const tentou = useRef(false);

  const gerar = useMutation({
    mutationFn: async (forcar: boolean) => {
      const { data, error } = await supabase.functions.invoke("safrapay-pix", { body: { pedido_id: pedidoId, forcar_novo: forcar } });
      if (error) {
        let msg = error.message;
        try { const c = await (error as { context?: Response }).context?.json(); if (c?.erro) msg = c.erro; } catch { /* mantém */ }
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.erro ?? "Falha ao gerar PIX no Safrapay.");
      return data as { pix_copia_cola: string; pagamento_link_id: string };
    },
    onSuccess: async (_d, forcar) => {
      setFalhou(null);
      await qc.resetQueries({ queryKey: [QK_VD_PIX_SAFRA, pedidoId] });
      await invalidarVendaDireta(qc);
      if (forcar) toast.success("Novo PIX gerado.");
    },
    onError: (e, forcar) => {
      const m = rawMessage(e);
      setFalhou(m);
      toast.error(forcar ? `Gerar novo PIX: ${m}` : `PIX Safrapay: ${m}`);
    },
  });

  useEffect(() => {
    if (!pixAtivo || !auto || tentou.current || pixQ.isLoading || pixQ.isError || pixQ.data) return;
    tentou.current = true;
    gerar.mutate(false);
  }, [pixAtivo, auto, pixQ.isLoading, pixQ.isError, pixQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const safra = pixQ.data?.pix_copia_cola ?? null;
  const tel = (telefone ?? "").replace(/\D/g, "");
  const telWa = tel.length <= 11 ? `55${tel}` : tel;
  const nome = (clienteNome ?? "").trim().split(/\s+/)[0] ?? "";

  if (ativoQ.isLoading || pixQ.isLoading || (gerar.isPending && !safra)) {
    return <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Gerando PIX…</div>;
  }

  const tel0 = tel;
  if (!pixAtivo && !safra) {
    const m = `Olá ${nome}! Seu pedido ${idExterno ?? ""} na Fetely ficou em ${formatBRL(total)}. Pague pelo PIX neste link: ${fallbackLink ?? ""}`;
    const w = fallbackLink && tel0.length >= 10 ? `https://wa.me/${telWa}?text=${encodeURIComponent(m)}` : null;
    return <PixPagamento payload={fallbackPayload} link={fallbackLink} whatsappUrl={w} />;
  }

  const botaoNovo = (
    <Button variant="outline" size="sm" disabled={gerar.isPending} onClick={() => gerar.mutate(true)}>
      {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Gerar novo PIX
    </Button>
  );

  if (safra) {
    const msg = `Olá ${nome}! Seu pedido ${idExterno ?? ""} na Fetely ficou em ${formatBRL(total)}. Pague com este PIX copia e cola:\n\n${safra}`;
    const wa = tel.length >= 10 ? `https://wa.me/${telWa}?text=${encodeURIComponent(msg)}` : null;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SeloConfirmacaoAutomatica />
          {botaoNovo}
        </div>
        <PixPagamento payload={safra} link={null} whatsappUrl={wa} />
      </div>
    );
  }

  const msgFb = `Olá ${nome}! Seu pedido ${idExterno ?? ""} na Fetely ficou em ${formatBRL(total)}. Pague pelo PIX neste link: ${fallbackLink ?? ""}`;
  const waFb = fallbackLink && tel.length >= 10 ? `https://wa.me/${telWa}?text=${encodeURIComponent(msgFb)}` : null;
  return (
    <div className="space-y-3">
      {(falhou || pixQ.isError) && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          PIX sem confirmação automática — o pagamento será reconhecido pela conciliação do extrato.
          <div className="mt-1 text-xs text-muted-foreground">{falhou ?? rawMessage(pixQ.error)}</div>
        </div>
      )}
      <div className="flex justify-end">{botaoNovo}</div>
      <PixPagamento payload={fallbackPayload} link={fallbackLink} whatsappUrl={waFb} />
    </div>
  );
}
