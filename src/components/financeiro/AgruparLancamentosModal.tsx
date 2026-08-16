import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

interface LancamentoPrincipal {
  id: string;
  descricao: string;
  valor: number;
  data_compra: string;
  fatura_id?: string | null;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lancamentoPrincipal: LancamentoPrincipal & { fatura_id?: string | null };
}

interface Candidato {
  id: string;
  descricao: string;
  valor: number;
  data_compra: string;
}

export function AgruparLancamentosModal({ open, onOpenChange, lancamentoPrincipal }: Props) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();

  // Carrega fatura_id se não veio nas props
  const { data: faturaIdResolvido } = useQuery({
    queryKey: ["lancamento-fatura-id", lancamentoPrincipal.id],
    enabled: open && !lancamentoPrincipal.fatura_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("fatura_cartao_lancamentos")
        .select("fatura_id")
        .eq("id", lancamentoPrincipal.id)
        .maybeSingle();
      return data?.fatura_id ?? null;
    },
  });

  const faturaId = lancamentoPrincipal.fatura_id || faturaIdResolvido;

  const { data: candidatos, isLoading } = useQuery({
    queryKey: ["agrupar-candidatos", faturaId, lancamentoPrincipal.id],
    enabled: open && !!faturaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("fatura_cartao_lancamentos")
        .select("id, descricao, valor, data_compra")
        .eq("fatura_id", faturaId!)
        .eq("status", "pendente")
        .is("conta_pagar_id", null)
        .neq("id", lancamentoPrincipal.id)
        .order("valor", { ascending: true });
      return (data || []) as Candidato[];
    },
  });

  const filtrados = useMemo(() => {
    const lista = candidatos || [];
    if (!busca.trim()) return lista;
    const q = busca.toLowerCase();
    return lista.filter((c) => c.descricao.toLowerCase().includes(q));
  }, [candidatos, busca]);

  const total = useMemo(() => {
    const extras = (candidatos || []).filter((c) => selecionados.has(c.id));
    return Number(lancamentoPrincipal.valor) + extras.reduce((s, c) => s + Number(c.valor), 0);
  }, [candidatos, selecionados, lancamentoPrincipal.valor]);

  function toggle(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function handleClose(o: boolean) {
    if (!o) {
      setSelecionados(new Set());
      setBusca("");
    }
    onOpenChange(o);
  }

  async function handleAgrupar() {
    setSalvando(true);
    const ids = [lancamentoPrincipal.id, ...Array.from(selecionados)];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: resultado, error } = await (supabase as any).rpc(
        "criar_despesa_agrupada",
        { p_lancamento_ids: ids }
      );
      if (error) throw error;
      if (!resultado?.ok) {
        toast.error(resultado?.erro || "Erro ao agrupar");
        return;
      }
      toast.success(
        `Conta agrupada criada: ${resultado.descricao} — ${formatBRL(resultado.valor_agregado)} (${resultado.qtd_lancamentos} lançamentos)`,
        { duration: 5000 }
      );
      handleClose(false);
      qc.invalidateQueries({ queryKey: ["fatura-lancamentos"] });
      qc.invalidateQueries({ queryKey: ["faturas-cartao"] });
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  const totalZero = Math.abs(total) < 0.005;
  const podeSubmeter = selecionados.size > 0 && !totalZero && !salvando;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Agrupar lançamentos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lançamento principal */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">
              Lançamento principal:
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-sm font-medium">{lancamentoPrincipal.descricao}</div>
              <div className="text-sm text-muted-foreground">
                {formatBRL(lancamentoPrincipal.valor)} · {formatDateBR(lancamentoPrincipal.data_compra)}
              </div>
            </div>
          </div>

          {/* Busca */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Adicionar lançamento (estorno/complemento):
            </div>
            <Input
              placeholder="Buscar por descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {/* Lista */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Disponíveis na mesma fatura:
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {isLoading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Carregando...
                </div>
              ) : filtrados.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {busca
                    ? "Nenhum lançamento encontrado."
                    : "Nenhum outro lançamento pendente nessa fatura."}
                </div>
              ) : (
                filtrados.map((c) => {
                  const isSel = selecionados.has(c.id);
                  const isEstorno = Number(c.valor) < 0;
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors",
                        isSel && "bg-primary/5"
                      )}
                    >
                      <Checkbox checked={isSel} onCheckedChange={() => toggle(c.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium truncate">{c.descricao}</div>
                          {isEstorno && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1.5 h-4 bg-destructive/10 text-destructive border-destructive/40"
                            >
                              Estorno
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateBR(c.data_compra)}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          isEstorno ? "text-destructive" : "text-foreground"
                        )}
                      >
                        {formatBRL(c.valor)}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Resumo */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total agrupado:</span>
              <span
                className={cn(
                  "text-lg font-medium tabular-nums",
                  totalZero ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {formatBRL(total)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {selecionados.size + 1} lançamentos serão vinculados a 1 conta a pagar
            </div>
            {totalZero && selecionados.size > 0 && (
              <div className="text-xs text-warning bg-warning/10 border border-warning/40 rounded px-2 py-1.5 mt-2">
                Este agrupamento resulta em R$ 0,00 — não cria conta a pagar.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleAgrupar} disabled={!podeSubmeter}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {selecionados.size === 0
              ? "Criar conta"
              : `Criar conta ${formatBRL(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
