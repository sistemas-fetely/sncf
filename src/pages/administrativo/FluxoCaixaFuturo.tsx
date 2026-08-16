import { PageShell } from "@/components/layout/PageShell";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  TrendingUp,
  Calendar,
  CreditCard,
  ChevronRight,
  Sparkles,
  Calculator,
  XCircle,
  Receipt,
  Layers,
  AlertTriangle,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cancelarCompromisso } from "@/lib/financeiro/compromissos-handler";

// =====================================================
// Types
// =====================================================
type ParcelaPrevista = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  numero_parcela: number;
  total_parcelas: number;
  compromisso_parcelado_id: string | null;
  compromisso_recorrente_id: string | null;
  origem_tipo: "parcelado" | "recorrente";
};

type Compromisso = {
  id: string;
  descricao: string;
  origem: string;
  valor_total: number;
  qtd_parcelas: number;
  valor_parcela: number;
  data_compra: string;
  data_primeira_parcela: string;
  status: string;
  parcelas_pagas: number;
  parcelas_previstas: number;
  conta_bancaria_id: string | null;
  conta_bancaria?: { nome_exibicao: string } | null;
  created_at: string;
};

type CompromissoRecorrente = {
  id: string;
  descricao: string;
  valor: number;
  periodicidade: "mensal" | "trimestral" | "anual";
  dia_vencimento: number;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  conta_bancaria_id: string | null;
  conta_bancaria?: { nome_exibicao: string } | null;
};

type AgrupadoPorMes = {
  mes_label: string; // "Maio 2026"
  mes_iso: string;   // "2026-05"
  qtd_parcelas: number;
  valor_total: number;
  parcelas: ParcelaPrevista[];
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatarMesAno(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  return `${MESES[mes - 1]} ${ano}`;
}

const ORIGEM_BADGE: Record<
  "parcelado" | "recorrente",
  { label: string; className: string; Icon: typeof CreditCard }
> = {
  parcelado: {
    label: "Parcelado",
    className: "bg-info/10 text-info border-info/40",
    Icon: CreditCard,
  },
  recorrente: {
    label: "Recorrente",
    className: "bg-info/10 text-info border-info/40",
    Icon: Repeat,
  },
};

export default function FluxoCaixaFuturo() {
  const qc = useQueryClient();
  const [mesExpandido, setMesExpandido] = useState<string | null>(null);
  const [compromissoDetalhe, setCompromissoDetalhe] = useState<string | null>(null);
  const [compromissoCancelar, setCompromissoCancelar] = useState<Compromisso | null>(null);

  // Parcelas previstas (parcelados + recorrentes)
  const { data: parcelas, isLoading: loadingParcelas } = useQuery({
    queryKey: ["parcelas-previstas"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, descricao, valor, data_vencimento, numero_parcela, total_parcelas, compromisso_parcelado_id, compromisso_recorrente_id")
        .eq("status", "previsto")
        .eq("tipo", "pagar")
        .or("compromisso_parcelado_id.not.is.null,compromisso_recorrente_id.not.is.null")
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return ((data || []) as Array<Record<string, unknown>>).map((p) => ({
        ...p,
        origem_tipo: p.compromisso_recorrente_id ? "recorrente" : "parcelado",
      })) as ParcelaPrevista[];
    },
  });

  // Compromissos ativos
  const { data: compromissos, isLoading: loadingComp } = useQuery({
    queryKey: ["compromissos-parcelados"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("compromissos_parcelados")
        .select(`
          *,
          conta_bancaria:conta_bancaria_id ( nome_exibicao )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Compromisso[];
    },
  });

  // Compromissos recorrentes ativos
  const { data: recorrentes, isLoading: loadingRec } = useQuery({
    queryKey: ["compromissos-recorrentes-ativos"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("compromissos_recorrentes")
        .select(`
          id, descricao, valor, periodicidade, dia_vencimento,
          data_inicio, data_fim, status, conta_bancaria_id,
          conta_bancaria:conta_bancaria_id ( nome_exibicao )
        `)
        .eq("status", "ativo")
        .order("descricao");
      if (error) throw error;
      return (data || []) as CompromissoRecorrente[];
    },
  });

  const isLoading = loadingParcelas || loadingComp || loadingRec;

  const agrupadoPorMes = useMemo<AgrupadoPorMes[]>(() => {
    if (!parcelas) return [];
    const grupos: Record<string, AgrupadoPorMes> = {};
    for (const p of parcelas) {
      const mesIso = p.data_vencimento.substring(0, 7); // "2026-05"
      if (!grupos[mesIso]) {
        grupos[mesIso] = {
          mes_iso: mesIso,
          mes_label: formatarMesAno(mesIso + "-01"),
          qtd_parcelas: 0,
          valor_total: 0,
          parcelas: [],
        };
      }
      grupos[mesIso].qtd_parcelas++;
      grupos[mesIso].valor_total += p.valor;
      grupos[mesIso].parcelas.push(p);
    }
    return Object.values(grupos).sort((a, b) => a.mes_iso.localeCompare(b.mes_iso));
  }, [parcelas]);

  // Compromissos ativos (filtrados)
  const compromissosAtivos = (compromissos || []).filter((c) => c.status === "ativo");
  const compromissosQuitados = (compromissos || []).filter((c) => c.status === "quitado");

  // Compromisso detalhe (do dialog)
  const compromissoDetalhado = (compromissos || []).find((c) => c.id === compromissoDetalhe);

  // Parcelas do compromisso detalhado
  const parcelasDoCompromisso = (parcelas || []).filter(
    (p) => p.compromisso_parcelado_id === compromissoDetalhe,
  );

  // KPIs
  const totalPrevisto = (parcelas || []).reduce((s, p) => s + p.valor, 0);
  const proximoMes = agrupadoPorMes[0];

  async function handleCancelarCompromissoConfirmado() {
    if (!compromissoCancelar) return;
    try {
      await cancelarCompromisso(compromissoCancelar.id);
      toast.success("Compromisso cancelado e parcelas previstas removidas");
      qc.invalidateQueries({ queryKey: ["parcelas-previstas"] });
      qc.invalidateQueries({ queryKey: ["compromissos-parcelados"] });
      setCompromissoCancelar(null);
      setCompromissoDetalhe(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    }
  }

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-medium tracking-tight flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-admin" />
          Fluxo de Caixa Futuro
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Parcelas firmadas (cartão e parcelamentos manuais) que vão impactar o caixa nos próximos meses.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Calculator className="h-3 w-3 text-admin" /> Total previsto
            </p>
            <p className="text-2xl font-medium text-admin">{formatBRL(totalPrevisto)}</p>
            <p className="text-[10px] text-muted-foreground">
              em {parcelas?.length || 0} parcela(s) firmada(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-warning" /> Próximo mês
            </p>
            <p className="text-2xl font-medium text-warning">
              {proximoMes ? formatBRL(proximoMes.valor_total) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {proximoMes ? `${proximoMes.mes_label} (${proximoMes.qtd_parcelas} parc.)` : "Nada previsto"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-info" /> Compromissos ativos
            </p>
            <p className="text-2xl font-medium text-info">{compromissosAtivos.length}</p>
            <p className="text-[10px] text-muted-foreground">
              {compromissosQuitados.length} já quitado(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fluxo por mês */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-admin" />
              Próximos meses
            </h2>
            <span className="text-xs text-muted-foreground">
              Clique no mês pra ver os detalhes
            </span>
          </div>

          {loadingParcelas ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : agrupadoPorMes.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              <p>Nenhuma parcela futura prevista.</p>
              <p className="text-xs mt-1">
                Importe uma fatura de cartão com parcelas pra começar a popular o fluxo.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {agrupadoPorMes.map((g) => {
                const isExpanded = mesExpandido === g.mes_iso;
                return (
                  <div key={g.mes_iso} className="rounded-md border overflow-hidden">
                    <button
                      onClick={() => setMesExpandido(isExpanded ? null : g.mes_iso)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                    >
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{g.mes_label}</div>
                        <div className="text-xs text-muted-foreground">
                          {g.qtd_parcelas} parcela{g.qtd_parcelas === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-medium font-mono text-admin">
                          {formatBRL(g.valor_total)}
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-muted/20">
                        <Table>
                          <TableHeader>
                            <TableRow className="text-xs">
                              <TableHead className="w-24">Vencimento</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead className="w-20 text-center">Parcela</TableHead>
                              <TableHead className="text-right w-28">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {g.parcelas.map((p) => {
                              const info = ORIGEM_BADGE[p.origem_tipo];
                              const Icon = info.Icon;
                              const clickable = p.origem_tipo === "parcelado" && p.compromisso_parcelado_id;
                              return (
                                <TableRow
                                  key={p.id}
                                  className={clickable ? "cursor-pointer hover:bg-background" : ""}
                                  onClick={
                                    clickable
                                      ? () => setCompromissoDetalhe(p.compromisso_parcelado_id)
                                      : undefined
                                  }
                                >
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {formatDateBR(p.data_vencimento)}
                                  </TableCell>
                                  <TableCell className="text-xs">{p.descricao}</TableCell>
                                  <TableCell className="text-center">
                                    <Badge
                                      variant="outline"
                                      className={`text-[9px] py-0 px-1 h-4 inline-flex items-center gap-1 ${info.className}`}
                                    >
                                      <Icon className="h-2.5 w-2.5" />
                                      {p.origem_tipo === "parcelado"
                                        ? `${p.numero_parcela}/${p.total_parcelas}`
                                        : "Recorrente"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {formatBRL(p.valor)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compromissos ativos */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium flex items-center gap-2">
              <Layers className="h-4 w-4 text-admin" />
              Compromissos ativos
            </h2>
          </div>

          {/* Seção Parcelados */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2 text-info">
              <CreditCard className="h-4 w-4" />
              Parcelados em andamento ({compromissosAtivos.length})
            </h3>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : compromissosAtivos.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Nenhum parcelado ativo.
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-28 text-center">Origem</TableHead>
                      <TableHead className="w-32">Cartão</TableHead>
                      <TableHead className="text-right w-28">Valor parcela</TableHead>
                      <TableHead className="text-center w-24">Progresso</TableHead>
                      <TableHead className="text-right w-32">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compromissosAtivos.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setCompromissoDetalhe(c.id)}
                      >
                        <TableCell>
                          <div className="text-sm font-medium">{c.descricao}</div>
                          <div className="text-[10px] text-muted-foreground">
                            desde {formatDateBR(c.data_compra)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">
                            {c.origem === "cartao" ? "Cartão" : c.origem === "manual" ? "Manual" : c.origem}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.conta_bancaria?.nome_exibicao || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatBRL(c.valor_parcela)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">
                            {c.parcelas_pagas}/{c.qtd_parcelas}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {formatBRL(c.valor_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Seção Recorrentes */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2 text-info">
              <Repeat className="h-4 w-4" />
              Recorrentes ativos ({(recorrentes || []).length})
            </h3>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (recorrentes || []).length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Nenhum compromisso recorrente ativo.
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-28 text-center">Periodicidade</TableHead>
                      <TableHead className="w-32">Conta saída</TableHead>
                      <TableHead className="w-24 text-center">Vencimento</TableHead>
                      <TableHead className="w-32">Vigência</TableHead>
                      <TableHead className="text-right w-28">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(recorrentes || []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="text-sm font-medium">{r.descricao}</div>
                          <div className="text-[10px] text-muted-foreground">
                            desde {formatDateBR(r.data_inicio)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {r.periodicidade}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.conta_bancaria?.nome_exibicao || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-center">
                          Dia {r.dia_vencimento}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.data_fim ? `até ${formatDateBR(r.data_fim)}` : "Sem fim"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {formatBRL(r.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog detalhe compromisso */}
      <Dialog
        open={compromissoDetalhe !== null}
        onOpenChange={(v) => !v && setCompromissoDetalhe(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-admin" />
              Detalhes do compromisso
            </DialogTitle>
            <DialogDescription>
              {compromissoDetalhado?.descricao}
            </DialogDescription>
          </DialogHeader>

          {compromissoDetalhado && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-md border p-2 bg-muted/30">
                  <p className="text-muted-foreground">Valor total</p>
                  <p className="text-base font-medium font-mono">
                    {formatBRL(compromissoDetalhado.valor_total)}
                  </p>
                </div>
                <div className="rounded-md border p-2 bg-muted/30">
                  <p className="text-muted-foreground">Parcela</p>
                  <p className="text-base font-medium font-mono">
                    {formatBRL(compromissoDetalhado.valor_parcela)}
                  </p>
                </div>
                <div className="rounded-md border p-2 bg-muted/30">
                  <p className="text-muted-foreground">Total parcelas</p>
                  <p className="text-base font-medium">{compromissoDetalhado.qtd_parcelas}</p>
                </div>
                <div className="rounded-md border p-2 bg-muted/30">
                  <p className="text-muted-foreground">Pagas / Previstas</p>
                  <p className="text-base font-medium">
                    {compromissoDetalhado.parcelas_pagas} / {compromissoDetalhado.parcelas_previstas}
                  </p>
                </div>
              </div>

              {compromissoDetalhado.origem === "cartao" && (
                <div className="rounded-md border p-3 bg-info/50 text-xs">
                  <p className="flex items-center gap-1.5 font-medium text-info">
                    <CreditCard className="h-3.5 w-3.5" />
                    Compromisso de cartão de crédito
                  </p>
                  <p className="text-info mt-1">
                    Cartão: <strong>{compromissoDetalhado.conta_bancaria?.nome_exibicao || "—"}</strong>
                  </p>
                  <p className="text-info">
                    Compra detectada em: <strong>{formatDateBR(compromissoDetalhado.data_compra)}</strong>
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium mb-2">
                  Parcelas previstas ({parcelasDoCompromisso.length})
                </p>
                {parcelasDoCompromisso.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Nenhuma parcela prevista. Esse compromisso pode estar quitado.
                  </p>
                ) : (
                  <div className="rounded-md border overflow-hidden max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16 text-center">Parcela</TableHead>
                          <TableHead className="w-32">Vencimento</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parcelasDoCompromisso.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-[9px]">
                                {p.numero_parcela}/{p.total_parcelas}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatDateBR(p.data_vencimento)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {formatBRL(p.valor)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {compromissoDetalhado.status === "ativo" && (
                <div className="flex justify-end pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCompromissoCancelar(compromissoDetalhado)}
                    className="text-destructive border-destructive/30 hover:bg-destructive/5 gap-2"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar compromisso
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog cancelar compromisso */}
      <AlertDialog
        open={compromissoCancelar !== null}
        onOpenChange={(v) => !v && setCompromissoCancelar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancelar compromisso parcelado?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a cancelar o compromisso "{compromissoCancelar?.descricao}".
              <br /><br />
              Isso vai:
              <ul className="list-disc pl-5 mt-1 text-xs">
                <li>Marcar o compromisso como cancelado</li>
                <li>Remover as <strong>{compromissoCancelar?.parcelas_previstas || 0} parcelas previstas</strong> do fluxo de caixa</li>
              </ul>
              <br />
              <strong>NÃO afeta</strong> as parcelas já pagas. Use isso quando uma compra parcelada foi cancelada/estornada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancelarCompromissoConfirmado();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar compromisso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
