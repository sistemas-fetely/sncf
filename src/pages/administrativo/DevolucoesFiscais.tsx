import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  Loader2,
  PackageX,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format-currency";
import { fmtData, fmtDataHora } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

/**
 * DEVOLUCAO-TOTAL-ANULA-A-VENDA (29/08/2026)
 * Mesa de decisão humana: NF de entrada que referencia (refNFe) uma NF de saída
 * nossa gera um vínculo SUGERIDO. Parcial só registra o valor devolvido; total
 * desmonta a venda (estoque, títulos, boletos, pedido, expedição XPM).
 */

type ItemDevolvido = Record<string, unknown>;

interface VinculoMesa {
  id: string;
  status: string;
  grau_sugerido: string | null;
  grau: string | null;
  pct_devolvido: number | null;
  valor_devolvido: number | null;
  valor_nota_saida: number | null;
  itens: ItemDevolvido[] | null;
  motivo: string | null;
  confirmado_por_nome: string | null;
  confirmado_em: string | null;
  criado_em: string | null;
  retorno_numero: string | null;
  retorno_data: string | null;
  retorno_emitente: string | null;
  retorno_cnpj: string | null;
  retorno_natureza: string | null;
  nf_saida_id: string | null;
  saida_numero: string | null;
  saida_serie: string | null;
  saida_data: string | null;
  saida_estado: string | null;
  saida_estado_rotulo: string | null;
  pedido_id: string | null;
  pedido_ref: string | null;
  pedido_estagio: string | null;
  cliente: string | null;
  titulos_pagos: number | null;
  titulos_abertos: number | null;
  adiantamento_vivo: number | null;
}

type Aba = "sugerido" | "confirmado" | "descartado";

const QK = ["devolucao-vinculo-mesa"];

function num(v: number | null | undefined): number {
  return Number(v ?? 0);
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

function itemCampo(item: ItemDevolvido, chaves: string[]): string | null {
  for (const k of chaves) {
    const v = str(item[k]);
    if (v) return v;
  }
  return null;
}

function itemNumero(item: ItemDevolvido, chaves: string[]): number | null {
  for (const k of chaves) {
    const v = item[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

export default function DevolucoesFiscais() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("sugerido");
  const [alvoTotal, setAlvoTotal] = useState<VinculoMesa | null>(null);
  const [alvoDescarte, setAlvoDescarte] = useState<VinculoMesa | null>(null);
  const [motivoDescarte, setMotivoDescarte] = useState("");

  const listaQ = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<VinculoMesa[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_devolucao_vinculo_mesa")
        .select("*")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VinculoMesa[];
    },
  });

  const linhas = listaQ.data ?? [];

  const porAba = useMemo(() => {
    const grupos: Record<Aba, VinculoMesa[]> = { sugerido: [], confirmado: [], descartado: [] };
    for (const l of linhas) {
      const s = (l.status ?? "").toLowerCase();
      if (s.startsWith("confirmad")) grupos.confirmado.push(l);
      else if (s.startsWith("descartad")) grupos.descartado.push(l);
      else grupos.sugerido.push(l);
    }
    return grupos;
  }, [linhas]);

  const procurar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("fn_devolucao_sugerir_vinculos");
      if (error) throw error;
      return (data ?? {}) as {
        ok?: boolean;
        erro?: string;
        sugestoes_novas?: number;
        aguardando_confirmacao?: number;
      };
    },
    onSuccess: (r) => {
      if (r.ok !== true) {
        toast.error(r.erro || "Falha ao procurar vínculos");
        return;
      }
      const novas = num(r.sugestoes_novas);
      toast.success(
        novas > 0
          ? `${novas} sugestão(ões) nova(s). ${num(r.aguardando_confirmacao)} aguardando confirmação.`
          : `Nenhuma sugestão nova. ${num(r.aguardando_confirmacao)} aguardando confirmação.`,
      );
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const confirmar = useMutation({
    mutationFn: async (v: { id: string; grau: "parcial" | "total"; motivo: string }) => {
      const { data, error } = await (supabase.rpc as any)("fn_devolucao_confirmar_vinculo", {
        p_vinculo_id: v.id,
        p_grau: v.grau,
        p_motivo: v.motivo,
      });
      if (error) throw error;
      return { grau: v.grau, resp: (data ?? {}) as Record<string, any> };
    },
    onSuccess: ({ grau, resp }) => {
      // FAIL-LOUD: a RPC devolve {ok:false, erro} sem lançar exceção.
      if (resp.ok !== true) {
        toast.error(resp.erro || "Falha ao confirmar devolução");
        return;
      }
      if (grau === "total") {
        const anulacao = (resp.anulacao ?? {}) as { bloqueado?: boolean; motivo_bloqueio?: string };
        if (anulacao.bloqueado) {
          toast.warning(
            anulacao.motivo_bloqueio ||
              "Devolução confirmada, mas a anulação foi bloqueada — trate manualmente.",
          );
        } else {
          toast.success("Devolução total confirmada. A venda foi anulada.");
        }
      } else {
        toast.success("Devolução parcial confirmada. A nota de saída segue válida.");
      }
      setAlvoTotal(null);
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const descartar = useMutation({
    mutationFn: async (v: { id: string; motivo: string }) => {
      const { data, error } = await (supabase.rpc as any)("fn_devolucao_descartar_vinculo", {
        p_vinculo_id: v.id,
        p_motivo: v.motivo,
      });
      if (error) throw error;
      return (data ?? {}) as { ok?: boolean; erro?: string };
    },
    onSuccess: (r) => {
      if (r.ok !== true) {
        toast.error(r.erro || "Falha ao descartar vínculo");
        return;
      }
      toast.success("Vínculo descartado.");
      setAlvoDescarte(null);
      setMotivoDescarte("");
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const ocupado = confirmar.isPending || descartar.isPending;
  const visiveis = porAba[aba];

  return (
    <PageShell>
      <PageHeader
        titulo="Devoluções Fiscais"
        icone={PackageX}
        estado="Notas fiscais de retorno que referenciam notas de saída nossas e aguardam decisão: devolução parcial ou anulação total da venda."
        acoes={
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => procurar.mutate()}
            disabled={procurar.isPending}
          >
            {procurar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Procurar novos vínculos
          </Button>
        }
      />

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <TabsList>
          <TabsTrigger value="sugerido">Sugeridos ({porAba.sugerido.length})</TabsTrigger>
          <TabsTrigger value="confirmado">Confirmados ({porAba.confirmado.length})</TabsTrigger>
          <TabsTrigger value="descartado">Descartados ({porAba.descartado.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {listaQ.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : listaQ.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {formatError(listaQ.error)}
          </CardContent>
        </Card>
      ) : visiveis.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <PackageX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">
              {aba === "sugerido"
                ? "Nenhuma NF de retorno aguardando decisão"
                : aba === "confirmado"
                  ? "Nenhuma devolução confirmada ainda"
                  : "Nenhum vínculo descartado"}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {aba === "sugerido"
                ? "Quando entrar uma nota que referencia uma venda nossa, ela aparece aqui para você decidir se a devolução é parcial ou total."
                : "Os vínculos aparecem aqui depois que alguém decide sobre eles."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visiveis.map((v) => (
            <CardVinculo
              key={v.id}
              v={v}
              aba={aba}
              ocupado={ocupado}
              onParcial={() =>
                confirmar.mutate({ id: v.id, grau: "parcial", motivo: "Confirmado na mesa de devoluções fiscais" })
              }
              onTotal={() => setAlvoTotal(v)}
              onDescartar={() => {
                setMotivoDescarte("");
                setAlvoDescarte(v);
              }}
            />
          ))}
        </div>
      )}

      {/* Confirmação em duas etapas — TOTAL anula a venda */}
      <AlertDialog open={!!alvoTotal} onOpenChange={(o) => !o && !confirmar.isPending && setAlvoTotal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar devolução TOTAL e anular a venda?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Nossa NF {alvoTotal?.saida_serie}-{alvoTotal?.saida_numero} para{" "}
                  {alvoTotal?.cliente ?? "cliente não identificado"} será anulada. Ao confirmar:
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>o estoque dos itens é estornado;</li>
                  <li>os títulos da venda são cancelados;</li>
                  <li>os boletos vão para baixa no banco;</li>
                  <li>o pedido volta para pré-faturamento em pausa;</li>
                  <li>a expedição na XPM é declarada como retornada e para de se mover.</li>
                </ul>
                {alvoTotal && (num(alvoTotal.titulos_pagos) > 0 || num(alvoTotal.adiantamento_vivo) > 0) && (
                  <p className="text-warning">
                    Atenção: há dinheiro dentro. A anulação pode ser bloqueada e cair para tratamento
                    manual.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmar.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!alvoTotal) return;
                confirmar.mutate({
                  id: alvoTotal.id,
                  grau: "total",
                  motivo: "Devolução total confirmada na mesa de devoluções fiscais",
                });
              }}
            >
              {confirmar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Anular a venda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Descarte com motivo obrigatório */}
      <Dialog open={!!alvoDescarte} onOpenChange={(o) => !o && !descartar.isPending && setAlvoDescarte(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar vínculo sugerido</DialogTitle>
            <DialogDescription>
              Use quando o casamento entre a NF de retorno e a nossa nota estiver errado. Explique o
              motivo — fica registrado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-descarte">Motivo</Label>
            <Textarea
              id="motivo-descarte"
              value={motivoDescarte}
              onChange={(e) => setMotivoDescarte(e.target.value)}
              placeholder="Por que este vínculo não vale?"
              rows={4}
              disabled={descartar.isPending}
            />
            <p
              className={cn(
                "text-xs",
                motivoDescarte.trim().length < 15 ? "text-muted-foreground" : "text-success",
              )}
            >
              {motivoDescarte.trim().length}/15 caracteres mínimos
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAlvoDescarte(null)}
              disabled={descartar.isPending}
            >
              Cancelar
            </Button>
            <Button
              disabled={motivoDescarte.trim().length < 15 || descartar.isPending}
              onClick={() =>
                alvoDescarte &&
                descartar.mutate({ id: alvoDescarte.id, motivo: motivoDescarte.trim() })
              }
            >
              {descartar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function CardVinculo({
  v,
  aba,
  ocupado,
  onParcial,
  onTotal,
  onDescartar,
}: {
  v: VinculoMesa;
  aba: Aba;
  ocupado: boolean;
  onParcial: () => void;
  onTotal: () => void;
  onDescartar: () => void;
}) {
  const [abertoItens, setAbertoItens] = useState(false);
  const itens = Array.isArray(v.itens) ? v.itens : [];
  const dinheiroDentro = num(v.titulos_pagos) > 0 || num(v.adiantamento_vivo) > 0;
  const pct = num(v.pct_devolvido);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* Linha 1 — o encontro das duas notas */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">NF de retorno {v.retorno_numero ?? "—"}</span>
          <span className="text-muted-foreground">· {v.retorno_emitente ?? "emitente não identificado"}</span>
          <span className="text-muted-foreground">· {fmtData(v.retorno_data)}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">
            nossa NF {v.saida_serie ?? "—"}-{v.saida_numero ?? "—"}
          </span>
          <span className="text-muted-foreground">· {v.cliente ?? "cliente não identificado"}</span>
          <span className="text-muted-foreground">· {fmtData(v.saida_data)}</span>
        </div>

        {/* Linha 2 — os números */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>{formatBRL(Number(v.valor_devolvido))}</span>
          <span className="text-muted-foreground">de {formatBRL(Number(v.valor_nota_saida))}</span>
          <span className="font-medium text-foreground">·</span>
          <span className="text-base font-medium">{pct.toFixed(1)}%</span>
          {(aba === "sugerido" ? v.grau_sugerido : (v.grau ?? v.grau_sugerido)) && (
            <Badge variant={(v.grau ?? v.grau_sugerido) === "total" ? "destructive" : "secondary"}>
              {aba === "sugerido"
                ? `Sugerido: ${v.grau_sugerido}`
                : `Grau: ${v.grau ?? v.grau_sugerido}`}
            </Badge>
          )}
        </div>

        {/* Linha 3 — contexto */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {v.pedido_ref && (
            <span>
              Pedido{" "}
              {v.pedido_id ? (
                <Link to={`/pedidos/${v.pedido_id}`} className="text-primary underline-offset-2 hover:underline">
                  {v.pedido_ref}
                </Link>
              ) : (
                v.pedido_ref
              )}
            </span>
          )}
          {v.pedido_estagio && <span>· {v.pedido_estagio}</span>}
          {v.saida_estado_rotulo && <span>· {v.saida_estado_rotulo}</span>}
          {v.retorno_natureza && <span>· {v.retorno_natureza}</span>}
          {v.criado_em && <span>· sugerido em {fmtDataHora(v.criado_em)}</span>}
        </div>

        {/* Itens devolvidos */}
        {itens.length > 0 && (
          <Collapsible open={abertoItens} onOpenChange={setAbertoItens}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", abertoItens && "rotate-180")} />
                Ver itens ({itens.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <ul className="divide-y rounded-md border text-xs">
                {itens.map((item, i) => {
                  const codigo = itemCampo(item, ["codigo", "sku", "codigo_produto"]);
                  const descricao = itemCampo(item, ["descricao", "nome", "produto"]);
                  const qtd = itemNumero(item, ["quantidade", "qtd", "qtde"]);
                  const valor = itemNumero(item, ["valor_total", "valor", "total"]);
                  return (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        {codigo && <span className="font-mono text-[11px] text-muted-foreground">{codigo} · </span>}
                        {descricao ?? "Item sem descrição"}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {qtd !== null && <>{qtd} un</>}
                        {qtd !== null && valor !== null && " · "}
                        {valor !== null && formatBRL(valor)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* ALERTA DE DINHEIRO DENTRO — informação, não trava */}
        {aba === "sugerido" && dinheiroDentro && (
          <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs font-medium text-warning-strong">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              {(() => {
                const partes: string[] = [];
                const titulosPagos = num(v.titulos_pagos);
                const adiantamento = num(v.adiantamento_vivo);
                if (titulosPagos > 0) partes.push(`${titulosPagos} título(s) pago(s)`);
                if (adiantamento > 0) partes.push(`${formatBRL(adiantamento)} de adiantamento`);
                const corpo = partes.join(" e ");
                return `Dinheiro dentro: ${corpo}. Se confirmar como TOTAL, a anulação será BLOQUEADA e cairá para tratamento manual.`;
              })()}
            </p>
          </div>
        )}

        {/* Decisão / registro */}
        {aba === "sugerido" ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={onParcial} disabled={ocupado} className="gap-2">
              {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar parcial
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={onTotal}
              disabled={ocupado}
              className="gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Confirmar total
            </Button>
            <Button size="sm" variant="ghost" onClick={onDescartar} disabled={ocupado}>
              Descartar
            </Button>
          </div>
        ) : (
          <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
            <p>
              {aba === "confirmado" ? "Confirmado" : "Descartado"} por{" "}
              {v.confirmado_por_nome ?? "—"}
              {v.confirmado_em && <> em {fmtDataHora(v.confirmado_em)}</>}
            </p>
            {v.motivo && <p className="italic">“{v.motivo}”</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
