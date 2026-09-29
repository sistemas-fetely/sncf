import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Loader2, MessageCircle, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import { reprocessarFilaB2c } from "@/hooks/vendas/useB2c";
import {
  ConfirmarCartaoDialog, RegistrarRetiradaDialog, QK_VD_GESTAO, type LinhaVD,
} from "@/components/venda-direta/AcoesVendaDireta";

type Situacao =
  | "aguardando_pagamento" | "descendo_bling" | "aguardando_nf" | "separacao"
  | "pronto_retirada" | "em_transporte" | "travado" | "entregue" | "cancelado" | "outro";

interface Linha extends LinhaVD {
  recebido_em: string | null;
  cancelado_em: string | null;
  modal: "retirada" | "entrega" | null;
  pagamento: "pix" | "cartao" | null;
  cliente_telefone: string | null;
  link_pagamento: string | null;
  fila_id: string | null;
  fila_erro: string | null;
  bling_pedido_numero: string | number | null;
  nf_numero: string | number | null;
  entrou_na_fase_em: string | null;
  situacao: Situacao;
}

const CARDS: { s: Situacao; label: string }[] = [
  { s: "aguardando_pagamento", label: "Aguardando pagamento" },
  { s: "descendo_bling", label: "Descendo ao Bling" },
  { s: "aguardando_nf", label: "Aguardando NF" },
  { s: "separacao", label: "Separação" },
  { s: "pronto_retirada", label: "Pronto p/ retirada" },
  { s: "em_transporte", label: "Em transporte" },
  { s: "travado", label: "Travado" },
  { s: "entregue", label: "Entregue (30 dias)" },
  { s: "cancelado", label: "Cancelado" },
];
const LABEL: Record<string, string> = Object.fromEntries(CARDS.map((c) => [c.s, c.label]));
LABEL.entregue = "Entregue";
LABEL.outro = "Outro";

const soDigitos = (s: string) => s.replace(/\D/g, "");
const TRINTA_DIAS = 30 * 24 * 3600 * 1000;

function tempoDesde(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export default function VendaDiretaGestao() {
  const qc = useQueryClient();
  const { podeEditar } = usePermissoesTela("tela.venda_direta_gestao");
  const [filtro, setFiltro] = useState<Situacao | null>(null);
  const [busca, setBusca] = useState("");
  const [cartao, setCartao] = useState<Linha | null>(null);
  const [retirada, setRetirada] = useState<Linha | null>(null);

  const q = useQuery({
    queryKey: QK_VD_GESTAO,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await supabase
        .from("vw_venda_direta_gestao" as never)
        .select("*")
        .order("recebido_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Linha[];
    },
  });

  const reprocessar = useMutation({
    mutationFn: (l: Linha) => reprocessarFilaB2c([l.fila_id!], "bling", "Reprocessado na gestão VD"),
    onSuccess: (_r, l) => {
      toast.success(`Descida de ${l.id_externo} reenviada para a fila`);
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  // Entregue conta só os últimos 30 dias — cartão e filtro seguem a mesma régua.
  const visiveis = useMemo(
    () => (q.data ?? []).filter((l) =>
      l.situacao !== "entregue" ||
      (l.entrou_na_fase_em && Date.now() - new Date(l.entrou_na_fase_em).getTime() <= TRINTA_DIAS)),
    [q.data],
  );

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of visiveis) c[l.situacao] = (c[l.situacao] ?? 0) + 1;
    return c;
  }, [visiveis]);

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const td = soDigitos(t);
    return visiveis.filter((l) => {
      if (filtro && l.situacao !== filtro) return false;
      if (!t) return true;
      return (l.id_externo ?? "").toLowerCase().includes(t) ||
        (l.cliente_nome ?? "").toLowerCase().includes(t) ||
        (td.length >= 3 && soDigitos(l.cliente_telefone ?? "").includes(td));
    });
  }, [visiveis, filtro, busca]);

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); toast.success("Link copiado"); }
    catch (e) { toast.error(rawMessage(e)); }
  }

  function whatsapp(l: Linha) {
    const tel0 = soDigitos(l.cliente_telefone ?? "");
    if (!tel0) { toast.error("Cliente sem telefone cadastrado."); return; }
    const tel = tel0.length <= 11 ? `55${tel0}` : tel0;
    const nome = (l.cliente_nome ?? "").trim().split(/\s+/)[0] ?? "";
    const msg = `Olá ${nome}! Seu pedido ${l.id_externo} na Fetely ficou em ${formatBRL(l.valor_liquido)}. Pague pelo PIX neste link: ${l.link_pagamento ?? ""}`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Venda Direta · Gestão"
        estado={q.dataUpdatedAt ? `Atualizada às ${new Date(q.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : undefined}
        acoes={
          podeEditar && (
            <Button asChild><Link to="/pedidos/venda-direta/novo"><Plus className="mr-1 h-4 w-4" />Novo pedido</Link></Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {CARDS.map((c) => {
          const n = contagem[c.s] ?? 0;
          const ativo = filtro === c.s;
          const alerta = c.s === "travado" && n > 0;
          return (
            <Card
              key={c.s}
              role="button"
              tabIndex={0}
              onClick={() => setFiltro(ativo ? null : c.s)}
              onKeyDown={(e) => e.key === "Enter" && setFiltro(ativo ? null : c.s)}
              className={cn(
                "cursor-pointer transition-colors hover:bg-muted/50",
                ativo && "ring-2 ring-primary",
                alerta && "border-destructive bg-destructive/10",
              )}
            >
              <CardContent className="p-3">
                <div className={cn("text-xs text-muted-foreground", alerta && "text-destructive")}>{c.label}</div>
                <div className={cn("text-2xl font-semibold", alerta && "text-destructive")}>{n}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Nº VD, nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {q.isError ? (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          Erro ao carregar: {rawMessage(q.error)}
        </div>
      ) : (
        <TooltipProvider>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Modal</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Na fase há</TableHead>
                  <TableHead>NF</TableHead>
                  <TableHead>Bling nº</TableHead>
                  {podeEditar && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                )}
                {!q.isLoading && linhas.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Nenhum pedido.</TableCell></TableRow>
                )}
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        <Link className="text-primary underline-offset-2 hover:underline" to={`/pedidos/${l.id}`}>{l.id_externo}</Link>
                        {l.fila_erro && (
                          <Tooltip>
                            <TooltipTrigger asChild><AlertTriangle className="h-4 w-4 text-destructive" aria-label="Erro na fila" /></TooltipTrigger>
                            <TooltipContent className="max-w-sm whitespace-pre-wrap">{l.fila_erro}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{l.cliente_nome ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.cliente_telefone ?? ""}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{l.modal === "retirada" ? "Retirada" : l.modal === "entrega" ? "Entrega" : "—"}</Badge></TableCell>
                    <TableCell>{l.pagamento === "pix" ? "PIX" : l.pagamento === "cartao" ? "Cartão" : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(l.valor_liquido)}</TableCell>
                    <TableCell>
                      <Badge variant={l.situacao === "travado" ? "destructive" : l.situacao === "cancelado" ? "outline" : "secondary"}>
                        {LABEL[l.situacao] ?? l.situacao}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tempoDesde(l.entrou_na_fase_em)}</TableCell>
                    <TableCell>{l.nf_numero ?? "—"}</TableCell>
                    <TableCell>{l.bling_pedido_numero ?? "—"}</TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {l.situacao === "aguardando_pagamento" && l.pagamento === "pix" && (
                            <>
                              <Button size="sm" variant="outline" disabled={!l.link_pagamento} onClick={() => copiar(l.link_pagamento!)}>
                                <Copy className="mr-1 h-3.5 w-3.5" />Copiar link
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => whatsapp(l)}>
                                <MessageCircle className="mr-1 h-3.5 w-3.5" />Reenviar no WhatsApp
                              </Button>
                            </>
                          )}
                          {l.situacao === "aguardando_pagamento" && l.pagamento === "cartao" && (
                            <Button size="sm" onClick={() => setCartao(l)}>Confirmar cartão</Button>
                          )}
                          {l.situacao === "travado" && l.fila_id && (
                            <Button size="sm" variant="outline" disabled={reprocessar.isPending} onClick={() => reprocessar.mutate(l)}>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />Reprocessar descida
                            </Button>
                          )}
                          {l.situacao === "pronto_retirada" && (
                            <Button size="sm" onClick={() => setRetirada(l)}>Registrar retirada</Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}

      <ConfirmarCartaoDialog linha={cartao} onClose={() => setCartao(null)} />
      <RegistrarRetiradaDialog linha={retirada} onClose={() => setRetirada(null)} />
    </PageShell>
  );
}
