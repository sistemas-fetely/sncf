import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Pencil, Plus, Trash2, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Item {
  sku: string | null;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

interface Produto {
  sku: string;
  nome_comercial: string;
  preco_atacado: number;
  multiplos: number;
}

interface Props {
  pedidoId: string;
  estagioAtual: string;
  itensAtuais: Item[];
  onSalvo?: () => void;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const ESTAGIOS_PERMITIDOS = ["recebido", "em_analise_credito", "cobranca", "aguardando_pagamento"];

function useProdutos(busca: string) {
  return useQuery({
    queryKey: ["sncf_produtos", busca],
    queryFn: async () => {
      let q = (supabase as any)
        .from("sncf_produtos")
        .select("sku,nome_comercial,preco_atacado,multiplos")
        .eq("ativo", true);
      if (busca.trim()) q = q.ilike("nome_comercial", `%${busca}%`);
      const { data, error } = await q.order("nome_comercial").limit(30);
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });
}

export function EditarItensDialog({ pedidoId, estagioAtual, itensAtuais, onSalvo }: Props) {
  const [open, setOpen] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);
  const qc = useQueryClient();

  const produtosQ = useProdutos(busca);

  const salvar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("salvar_itens_pedido", {
        p_pedido_id: pedidoId,
        p_itens: itens.map((i) => ({
          sku: i.sku,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
        })),
      });
      if (error) throw error;
      return data as { novo_liquido: number };
    },
    onSuccess: (data) => {
      toast.success(`Itens salvos — novo total: ${fmtBRL.format(data.novo_liquido)}`);
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
      setOpen(false);
      onSalvo?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleOpen = () => {
    setItens(itensAtuais.map((i) => ({ ...i })));
    setBusca("");
    setMostrarCatalogo(false);
    setOpen(true);
  };

  const adicionarProduto = (p: Produto) => {
    setItens((prev) => {
      const existe = prev.findIndex((i) => i.sku === p.sku);
      if (existe >= 0) {
        return prev.map((i, idx) =>
          idx === existe ? { ...i, quantidade: i.quantidade + p.multiplos } : i
        );
      }
      return [
        ...prev,
        {
          sku: p.sku,
          descricao: p.nome_comercial,
          quantidade: p.multiplos,
          valor_unitario: p.preco_atacado,
        },
      ];
    });
    setMostrarCatalogo(false);
    setBusca("");
  };

  const atualizarQtd = (idx: number, val: string) =>
    setItens((prev) =>
      prev.map((i, j) => (j === idx ? { ...i, quantidade: Math.max(1, Number(val) || 1) } : i))
    );

  const remover = (idx: number) => setItens((prev) => prev.filter((_, j) => j !== idx));

  const totalBruto = itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);

  if (!ESTAGIOS_PERMITIDOS.includes(estagioAtual)) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!salvar.isPending) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleOpen}>
          <Pencil className="h-3 w-3" />
          Editar itens
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar itens do pedido</DialogTitle>
        </DialogHeader>

        {/* Lista de itens */}
        <div className="space-y-1">
          {itens.map((item, idx) => (
            <div
              key={`${item.sku ?? "x"}-${idx}`}
              className="flex items-center gap-2 py-2 border-b border-border/40 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.descricao}</p>
                {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
              </div>

              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Qtd:</span>
                <Input
                  type="number"
                  min={1}
                  value={item.quantidade}
                  onChange={(e) => atualizarQtd(idx, e.target.value)}
                  className="w-16 h-7 text-sm text-center"
                />
              </div>

              <p className="text-sm font-semibold shrink-0 w-24 text-right">
                {fmtBRL.format(item.quantidade * item.valor_unitario)}
              </p>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => remover(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {itens.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum item. Adicione pelo menos 1 produto.
            </p>
          )}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center py-2 border-t border-border/60">
          <span className="text-sm font-medium">Total bruto</span>
          <span className="text-base font-bold">{fmtBRL.format(totalBruto)}</span>
        </div>

        {/* Adicionar produto */}
        <div className="space-y-2">
          {!mostrarCatalogo ? (
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setMostrarCatalogo(true)}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar produto
            </Button>
          ) : (
            <div className="space-y-2 border border-border/60 rounded-md p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  autoFocus
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-0.5">
                {produtosQ.isLoading && (
                  <p className="text-xs text-muted-foreground text-center py-3">Carregando...</p>
                )}
                {!produtosQ.isLoading && produtosQ.data?.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    {busca ? "Nenhum produto encontrado" : "Catálogo vazio — sincronize em Parâmetros"}
                  </p>
                )}
                {produtosQ.data?.map((p) => (
                  <button
                    key={p.sku}
                    type="button"
                    onClick={() => adicionarProduto(p)}
                    className="w-full text-left flex justify-between items-center px-2 py-1.5 rounded hover:bg-muted/60 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{p.nome_comercial}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku} · mín {p.multiplos} un
                      </p>
                    </div>
                    <span className="text-sm font-semibold shrink-0 ml-2">
                      {fmtBRL.format(p.preco_atacado)}
                    </span>
                  </button>
                ))}
              </div>

              <Button variant="ghost" size="sm" className="w-full" onClick={() => setMostrarCatalogo(false)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>

        {salvar.error && (
          <Alert variant="destructive">
            <AlertDescription>{(salvar.error as Error).message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || itens.length === 0}>
            {salvar.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              "Salvar itens"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
