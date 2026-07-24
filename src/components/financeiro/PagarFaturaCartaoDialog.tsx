import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Furo = {
  id: string;
  data_transacao: string;
  descricao: string | null;
  valor: number;
};

type Fatura = {
  id: string;
  data_vencimento: string;
  valor_total: number;
  numero_documento: string | null;
  status: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  furo: Furo | null;
  onDone: () => void;
}

export function PagarFaturaCartaoDialog({ open, onOpenChange, furo, onDone }: Props) {
  const [processando, setProcessando] = useState<string | null>(null);

  const { data: faturas = [], isLoading } = useQuery({
    queryKey: ["pagar-fatura-cartao-faturas", furo?.id],
    enabled: open && !!furo,
    queryFn: async () => {
      const { data, error } = await sb
        .from("faturas_cartao")
        .select("id, data_vencimento, valor_total, numero_documento, status")
        .is("movimentacao_bancaria_id", null)
        .neq("status", "cancelada")
        .order("data_vencimento", { ascending: false });
      if (error) throw error;
      return (data || []) as Fatura[];
    },
  });

  async function vincular(fatura: Fatura) {
    if (!furo) return;
    setProcessando(fatura.id);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { data, error } = await sb.rpc("pagar_fatura_cartao", {
        p_mov_id: furo.id,
        p_fatura_id: fatura.id,
        p_user_id: userRes.user?.id ?? null,
      });
      if (error) { toast.error(error.message); return; }
      if (data?.ok === false) { toast.error(data?.erro || "Falha ao vincular fatura"); return; }
      toast.success("Fatura conciliada com o pagamento");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Pagar fatura de cartão
          </DialogTitle>
          <DialogDescription>
            Vincule este débito bancário a uma fatura de cartão em aberto.
          </DialogDescription>
        </DialogHeader>

        {furo && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center gap-3">
            <span className="whitespace-nowrap">{formatDateBR(furo.data_transacao)}</span>
            <span className="flex-1 min-w-0 truncate" title={furo.descricao || ""}>
              {furo.descricao || "—"}
            </span>
            <span className="font-mono font-semibold whitespace-nowrap">{formatBRL(Number(furo.valor))}</span>
          </div>
        )}

        <div className="max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando faturas…
            </div>
          ) : faturas.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma fatura em aberto — importe a fatura na tela Faturas de Cartão.
            </div>
          ) : (
            <div className="divide-y">
              {faturas.map((f) => {
                const delta = Number(furo?.valor || 0) - Number(f.valor_total || 0);
                const bate = Math.abs(delta) < 0.01;
                return (
                  <div key={f.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="w-24 shrink-0 whitespace-nowrap">{formatDateBR(f.data_vencimento)}</div>
                    <div className="w-32 shrink-0 truncate text-muted-foreground" title={f.numero_documento || ""}>
                      {f.numero_documento || "—"}
                    </div>
                    <div className="w-32 shrink-0 font-mono text-right whitespace-nowrap">
                      {formatBRL(Number(f.valor_total))}
                    </div>
                    <div className="flex-1">
                      {bate ? (
                        <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400">
                          valor bate
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-500">
                          Δ {formatBRL(Math.abs(delta))}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="h-7"
                      disabled={processando === f.id}
                      onClick={() => vincular(f)}
                    >
                      {processando === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vincular"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
