import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { Tag, Loader2 } from "lucide-react";

const SUGESTOES_PADRAO = ["Resolver hoje", "Aguardando info", "Em análise"];

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
}

export function MarcacaoBadge({ marcacao }: { marcacao: string | null }) {
  if (!marcacao) return null;
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-amber-400/60 text-amber-700 bg-amber-50/60">
      <Tag className="h-2.5 w-2.5" />
      {marcacao}
    </Badge>
  );
}

export function MarcacaoPedido({ pedidoId, marcacao, iconOnly = false }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState(marcacao ?? "");
  const [saving, setSaving] = useState(false);

  const { data: sugestoes = SUGESTOES_PADRAO } = useSugestoesMarcacao();

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

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setValor(marcacao ?? ""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => e.stopPropagation()}
          className={iconOnly ? "h-8 w-8 p-0" : ""}
          title="Marcar / editar marcação"
        >
          <Tag className="h-3.5 w-3.5" />
          {!iconOnly && <span className="ml-1">Marcar</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-xs font-medium mb-1.5">Marcação livre</p>
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Ex: Resolver hoje"
            maxLength={60}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); persist(valor.trim() || null); }
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
        <div className="flex justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={saving || !marcacao}
            onClick={() => persist(null)}
          >
            Limpar
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={() => persist(valor.trim() || null)}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
