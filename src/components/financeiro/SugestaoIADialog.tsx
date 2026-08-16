import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  movId: string;
  onClose: () => void;
  onApply: () => void;
}

interface Sugestao {
  plano_contas_id: string;
  categoria_codigo: string;
  categoria_nome: string;
  score: number;
  motivo: string;
  amostra_descricao: string;
  amostra_count: number;
}

export default function SugestaoIADialog({ movId, onClose, onApply }: Props) {
  const [aplicando, setAplicando] = useState(false);

  const { data: contaInfo } = useQuery({
    queryKey: ["conta-info-sugestao", movId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("descricao, valor, parceiro_id, nf_cnpj_emitente")
        .eq("id", movId)
        .single();
      if (error) throw error;
      return data as {
        descricao: string | null;
        valor: number | null;
        parceiro_id: string | null;
        nf_cnpj_emitente: string | null;
      };
    },
  });

  const { data: sugestoes = [], isLoading: loadingSug } = useQuery({
    queryKey: ["sugestoes-ia", movId, contaInfo?.descricao],
    enabled: !!contaInfo,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "sugerir_categoria_para_lancamento",
        {
          p_descricao: contaInfo?.descricao || null,
          p_cnpj: contaInfo?.nf_cnpj_emitente || null,
          p_parceiro_id: contaInfo?.parceiro_id || null,
        },
      );
      if (error) throw error;
      return (data || []) as Sugestao[];
    },
  });

  async function handleAplicar(catId: string) {
    setAplicando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("contas_pagar_receber")
        .update({
          plano_contas_id: catId,
          categoria_confirmada: true,
          categoria_sugerida_ia: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", movId);
      if (error) throw error;
      toast.success("Categoria aplicada");
      onApply();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setAplicando(false);
    }
  }

  async function handleRejeitar() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("contas_pagar_receber")
      .update({ categoria_sugerida_ia: false })
      .eq("id", movId);
    toast.info("Sugestão descartada");
    onApply();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-warning" />
            Sugestão da IA
          </DialogTitle>
          <DialogDescription className="truncate">
            {contaInfo?.descricao}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loadingSug ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Buscando sugestões...
            </div>
          ) : sugestoes.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma sugestão disponível.
            </div>
          ) : (
            sugestoes.map((s) => (
              <div
                key={s.plano_contas_id}
                className="border rounded-md p-3 hover:bg-muted/30"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {s.categoria_codigo}
                      </span>
                      {s.categoria_nome}
                      <span className="ml-2 inline-flex items-center rounded-full bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-medium">
                        {s.score}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.motivo} · {s.amostra_count} similar
                      {s.amostra_count > 1 ? "es" : ""}
                    </div>
                    {s.amostra_descricao && (
                      <div className="text-[11px] text-muted-foreground italic mt-1 truncate">
                        ex: "{s.amostra_descricao}"
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAplicar(s.plano_contas_id)}
                    disabled={aplicando}
                    className="gap-1 bg-success hover:bg-success"
                  >
                    {aplicando ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Aplicar
                  </Button>
                </div>
              </div>
            ))
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRejeitar}
            className="w-full gap-1 text-muted-foreground"
          >
            <X className="h-3 w-3" />
            Descartar todas (não usar IA aqui)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
