import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Pencil, Plus, Trash2, Loader2, Search, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCoberturaItens, rotuloCobertura, type CoberturaItem } from "@/lib/pedidoDestaque";
import { usePedidoEdicaoCampo } from "@/hooks/pedidos/usePedidoEdicaoCampo";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

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

function useProdutos(busca: string) {
  return useQuery({
    queryKey: ["sncf_produtos", busca],
    queryFn: async () => {
      const termo = busca.trim().replace(/[,()"]/g, "");
      let q = (supabase as any)
        .from("sncf_produtos")
        .select("sku,nome_comercial,preco_atacado,multiplos")
        .eq("ativo", true);
      if (termo) {
        q = q.or(`nome_comercial.ilike."%${termo}%",sku.ilike."%${termo}%"`);
      }
      const { data, error } = await q.order("nome_comercial").limit(30);
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });
}

export function EditarItensDialog({ pedidoId, estagioAtual, itensAtuais, onSalvo }: Props) {
  const { regraDe } = usePedidoEdicaoCampo(estagioAtual);
  const [open, setOpen] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);
  const qc = useQueryClient();

  const produtosQ = useProdutos(busca);

  const coberturaQ = useCoberturaItens([pedidoId]);
  useEffect(() => {
    if (coberturaQ.error) toast.error((coberturaQ.error as Error).message);
  }, [coberturaQ.error]);

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
      invalidarPedido(qc, pedidoId);
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

  if (!regraDe("itens")?.permitido) return null;

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
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle>Editar itens do pedido</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
        {/* Lista de itens */}
        <div className="space-y-1">
          {(() => {
            // Itens do diálogo são locais (sem item_id): a cobertura da view é
            // consolidada por SKU para casar com a lista em edição. Quando o mesmo
            // SKU aparece em linhas distintas, somamos quantidade e qtd_coberta
            // antes de derivar o status e o rótulo do SKU no pedido.
            function consolidarPorSku(
              cobertura: Map<string, CoberturaItem>,
            ): Map<string, CoberturaItem> {
              const porSku = new Map<string, CoberturaItem>();
              const flags = new Map<string, { todosFaturado: boolean; todosSemLastro: boolean }>();
              for (const c of cobertura.values()) {
                if (!c.sku) continue;
                const atual = porSku.get(c.sku);
                if (!atual) {
                  porSku.set(c.sku, { ...c });
                  flags.set(c.sku, {
                    todosFaturado: c.cobertura === "faturado",
                    todosSemLastro: c.cobertura === "sem_lastro",
                  });
                  continue;
                }
                const f = flags.get(c.sku)!;
                const quantidade = atual.quantidade + c.quantidade;
                const qtd_coberta = atual.qtd_coberta + c.qtd_coberta;
                const qtd_descoberta = atual.qtd_descoberta + c.qtd_descoberta;
                f.todosFaturado = f.todosFaturado && c.cobertura === "faturado";
                f.todosSemLastro = f.todosSemLastro && c.cobertura === "sem_lastro";
                let coberturaConsolidada: CoberturaItem["cobertura"];
                if (f.todosFaturado) {
                  coberturaConsolidada = "faturado";
                } else if (qtd_coberta >= quantidade) {
                  coberturaConsolidada = "coberto";
                } else if (qtd_coberta > 0) {
                  coberturaConsolidada = "parcial";
                } else if (f.todosSemLastro) {
                  coberturaConsolidada = "sem_lastro";
                } else {
                  coberturaConsolidada = "descoberto";
                }
                porSku.set(c.sku, {
                  ...atual,
                  quantidade,
                  qtd_coberta,
                  qtd_descoberta,
                  cobertura: coberturaConsolidada,
                });
              }
              return porSku;
            }

            const porSku = consolidarPorSku(
              coberturaQ.data ?? new Map<string, CoberturaItem>(),
            );
            const coberturaDe = (sku: string | null) => (sku ? porSku.get(sku) : undefined);
            const problemas = itens
              .map((i) => coberturaDe(i.sku)?.cobertura)
              .filter((c) => c === "parcial" || c === "descoberto" || c === "sem_lastro");
            const temDescoberto = problemas.some((c) => c === "descoberto" || c === "sem_lastro");
            return (
              <>
                {problemas.length > 0 && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 mb-3",
                      temDescoberto
                        ? "bg-destructive/10 border-destructive/40"
                        : "bg-warning/10 border-warning/40"
                    )}
                  >
                    <AlertCircle
                      className={cn("h-4 w-4 shrink-0", temDescoberto ? "text-destructive" : "text-warning")}
                    />
                    <p className={cn("text-xs", temDescoberto ? "text-destructive" : "text-warning")}>
                      {problemas.length} item(ns) sem lastro na fila de reserva — verifique antes de seguir.
                    </p>
                  </div>
                )}
                {itens.map((item, idx) => {
                  const cob = coberturaDe(item.sku);
                  const rotulo = cob ? rotuloCobertura(cob.cobertura, cob.qtd_coberta, cob.quantidade) : null;
                  const descoberto = cob?.cobertura === "descoberto" || cob?.cobertura === "sem_lastro";
                  const parcial = cob?.cobertura === "parcial";
                  return (
                    <div
                      key={`${item.sku ?? "x"}-${idx}`}
                      className={cn(
                        "flex items-center gap-2 py-2 border-b border-border/40 last:border-0 rounded-md px-2 -mx-2",
                        descoberto && "bg-destructive/10 border-destructive/40",
                        parcial && "bg-warning/10 border-warning/40"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{item.descricao}</p>
                          {rotulo && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] h-5",
                                descoberto
                                  ? "border-destructive/40 text-destructive bg-destructive/10"
                                  : "border-warning/40 text-warning bg-warning/10"
                              )}
                            >
                              {rotulo}
                            </Badge>
                          )}
                        </div>

                        {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground">Qtd:</span>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantidade}
                          onChange={(e) => atualizarQtd(idx, e.target.value)}
                          className="w-16 h-7 text-sm text-center"
                        />
                      </div>

                      <p className="text-sm font-medium shrink-0 w-24 text-right">
                        {fmtBRL.format(item.quantidade * item.valor_unitario)}
                      </p>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => remover(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}

                {itens.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum item. Adicione pelo menos 1 produto.
                  </p>
                )}
              </>
            );
          })()}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center py-2 border-t border-border/60">
          <span className="text-sm font-medium">Total bruto</span>
          <span className="text-base font-medium">{fmtBRL.format(totalBruto)}</span>
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
                    <span className="text-sm font-medium shrink-0 ml-2">
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
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/40 shrink-0">

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
