import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Tag, Loader2 } from "lucide-react";

const SUGESTOES_PADRAO = [
  "Comercial - Reng. Credito",
  "Resolver hoje",
  "Aguardando info",
  "Em análise",
];

function useSugestoesMarcacao() {
  return useQuery({
    queryKey: ["marcacoes-sugestoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("marcacao")
        .not("marcacao", "is", null)
        .neq("marcacao", "");
      if (error) throw error;
      const usadas = [...new Set((data ?? []).map((r) => r.marcacao as string))].sort();
      const extras = usadas.filter((s) => !SUGESTOES_PADRAO.includes(s));
      return [...SUGESTOES_PADRAO, ...extras];
    },
    staleTime: 1000 * 60 * 5,
  });
}

interface Props {
  pedidoId: string;
  marcacao: string | null;
  iconOnly?: boolean;
  /** Abertura controlada pelo pai (uso: item dentro de DropdownMenu). */
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** Esconde o botão próprio — quem abre é o pai. */
  hideTrigger?: boolean;
}

export function MarcacaoBadge({ marcacao }: { marcacao: string | null }) {
  if (!marcacao) return null;
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-warning/60 text-warning bg-warning/10">
      <Tag className="h-2.5 w-2.5" />
      {marcacao}
    </Badge>
  );
}

export function MarcacaoPedido({
  pedidoId,
  marcacao,
  iconOnly = false,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: Props) {
  const qc = useQueryClient();
  const [openInterno, setOpenInterno] = useState(false);
  const controlado = openProp !== undefined;
  const open = controlado ? openProp : openInterno;
  const setOpen = (o: boolean) => {
    if (!controlado) setOpenInterno(o);
    onOpenChange?.(o);
  };
  const [valor, setValor] = useState(marcacao ?? "");
  const [saving, setSaving] = useState(false);

  // Sincroniza o campo com o valor vigente a cada abertura. Necessário porque,
  // quando a abertura vem do pai, o onOpenChange do Dialog não dispara e o
  // useState inicial fica obsoleto depois do primeiro save + refetch.
  useEffect(() => {
    if (open) setValor(marcacao ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const persist = async (novo: string | null) => {
    setSaving(true);
    const { error } = await supabase
      .from("pedidos")
      .update({ marcacao: novo })
      .eq("id", pedidoId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar marcação", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: novo ? "Marcação salva" : "Marcação removida" });
    qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
    qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
    qc.invalidateQueries({ queryKey: ["marcacoes-sugestoes"] });
    setOpen(false);
  };

  const { data: sugestoes = SUGESTOES_PADRAO } = useSugestoesMarcacao();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => e.stopPropagation()}
            className={
              iconOnly
                ? "h-8 w-8 p-0"
                : cn(
                    "h-7 gap-1 text-xs",
                    marcacao && "border-warning/60 text-warning bg-warning/10 hover:bg-warning/10 hover:text-warning",
                  )
            }
            title={marcacao ? `Marcação: ${marcacao} — clique para editar` : "Marcar pedido"}
          >
            <Tag className="h-3.5 w-3.5" />
            {!iconOnly && (
              <span className="max-w-[200px] truncate">{marcacao ?? "Marcar"}</span>
            )}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Marcação do pedido
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium mb-1.5 text-muted-foreground">Marcação livre</p>
            <Input
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ex: Resolver hoje"
              maxLength={60}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  persist(valor.trim() || null);
                }
              }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setValor(s)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-accent transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={saving || !marcacao}
            onClick={() => persist(null)}
          >
            Limpar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={saving} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={saving} onClick={() => persist(valor.trim() || null)}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
