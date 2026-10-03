import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { invalidarVendaDireta, type LinhaVD } from "@/components/venda-direta/AcoesVendaDireta";
import { AVISO_409, ErroEdge, chamarEdge, type LinkCartaoOk } from "@/components/venda-direta/LinkCartao";

export interface RemontarResultado {
  ok: boolean;
  id_externo: string | null;
  valor: number | null;
  forma: "pix" | "cartao" | "cartao_credito";
  link_pagamento: string | null;
  pix_copia_cola: string | null;
  precisa_novo_link_cartao: boolean | null;
}

/** Confirma e chama vd_remontar_pagamento; depois abre PIX ou link do cartão. */
export function RemontarPagamentoDialog<T extends LinhaVD>({ linha, onClose, onPix, onCartao }: {
  linha: T | null;
  onClose: () => void;
  onPix: (linha: T, payload: string | null) => void;
  onCartao: (linha: T) => void;
}) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);

  async function remontar() {
    if (!linha) return;
    setOcupado(true);
    try {
      const { data, error } = await (supabase as any).rpc("vd_remontar_pagamento", { p_pedido_id: linha.id });
      if (error) throw error;
      const r = data as RemontarResultado;
      if (!r?.ok) throw new Error((data as { erro?: string })?.erro ?? "Falha ao remontar pagamento.");
      toast.success(`Pagamento de ${r.id_externo ?? linha.id_externo} remontado · ${formatBRL(r.valor)}`);
      await invalidarVendaDireta(qc);
      const atualizada = { ...linha, valor_liquido: r.valor ?? linha.valor_liquido, link_pagamento: r.link_pagamento ?? linha.link_pagamento } as T;
      onClose();
      if (r.precisa_novo_link_cartao || r.forma !== "pix") {
        if (r.precisa_novo_link_cartao) {
          try {
            await chamarEdge<LinkCartaoOk>("safrapay-link", { pedido_id: linha.id, forcar_novo: true });
            await invalidarVendaDireta(qc);
            toast.success("Novo link do cartão gerado");
          } catch (e) {
            toast.error(e instanceof ErroEdge && e.status === 409 && /aguardando ativa/i.test(e.message) ? AVISO_409 : rawMessage(e));
          }
        }
        onCartao(atualizada);
      } else {
        onPix(atualizada, r.pix_copia_cola);
      }
    } catch (e) {
      toast.error(rawMessage(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <AlertDialog open={!!linha} onOpenChange={(v) => !v && !ocupado && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remontar pagamento</AlertDialogTitle>
          <AlertDialogDescription>
            Gerar novo pagamento de {formatBRL(linha?.valor_liquido ?? null)} para {linha?.id_externo}? O link antigo deixa de valer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={ocupado} onClick={(e) => { e.preventDefault(); void remontar(); }}>
            {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remontar pagamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
