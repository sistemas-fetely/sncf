/**
 * Auditoria Financeira — trabalho sobre o lote congelado mais recente.
 * Fonte: `vw_auditoria_lote_atual`. Ações: RPC `tratar_achado_auditoria`
 * (por linha) e `gerar_snapshot_auditoria` (novo lote).
 *
 * IMPORTANTE: os valores das classes NÃO são somáveis entre si —
 * naturezas diferentes de dinheiro. Somar dentro de uma classe é ok;
 * somar entre classes é proibido.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import type { EstagioPedido } from "@/types/pedido";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, ShieldAlert, Info, RefreshCw, ExternalLink, Loader2, CheckCircle2,
} from "lucide-react";

type Situacao = "aberto" | "em_analise" | "resolvido" | "explicado" | "reaparecido";
type Fonte = "integridade_financeira" | "recebivel_sem_titulo";

type Achado = {
  id: string;
  lote_id: string;
  gerado_em: string;
  fonte: Fonte | string | null;
  chave: string | null;
  classe: string | null;
  severidade: number | null;
  pedido_id: string | null;
  id_externo: string | null;
  cliente: string | null;
  valor: number | null;
  estagio: string | null;
  detalhe: string | null;
  acao: string | null;
  situacao: Situacao | string | null;
  nota: string | null;
  tratado_em: string | null;
  tratado_por: string | null;
};

const CLASSE_LABEL: Record<string, string> = {
  REALOCAR_DO_PAI: "Realocar do pedido pai",
  REALOCAR_PARCIAL: "Realocar parcial + faturar diferença",
  BOLETO_PAGO_SEM_EVIDENCIA: "Boleto pago sem evidência bancária",
  FATURAR_REMESSA: "Remessa a faturar",
  PEDIDO_SEM_RECEBIVEL: "Pedido sem recebível",
  SUBFATURADO: "Subfaturado",
  SOBREFATURADO: "Sobrefaturado",
  BOLETO_SEM_MOVIMENTACAO: "Boleto sem movimentação vinculada",
  PAGO_SEM_VINCULO_ORIGEM: "Pago sem vínculo de origem",
  CANCELADO_ESTACIONADO: "Cancelado estacionado",
  RECEBIVEL_SEM_TITULO: "Recebível sem título",
};
const labelClasse = (c: string | null) => (c && CLASSE_LABEL[c]) || c || "—";

const FONTE_LABEL: Record<string, string> = {
  integridade_financeira: "Integridade financeira",
  recebivel_sem_titulo: "Recebível sem título",
};

const SITUACAO_META: Record<Situacao, { label: string; className: string }> = {
  aberto:       { label: "Aberto",       className: "bg-muted text-foreground border-border" },
  em_analise:   { label: "Em análise",   className: "bg-info/15 text-info border-info/40" },
  resolvido:    { label: "Resolvido",    className: "bg-success/15 text-success border-success/40" },
  explicado:    { label: "Explicado",    className: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/40" },
  reaparecido:  { label: "Reapareceu",   className: "bg-destructive text-destructive-foreground border-destructive font-semibold ring-2 ring-destructive/40" },
};

const SEV_META = {
  1: { label: "Severidade 1", icon: ShieldAlert,    badge: "border-destructive text-destructive" },
  2: { label: "Severidade 2", icon: AlertTriangle,  badge: "border-warning text-warning" },
  3: { label: "Severidade 3", icon: Info,           badge: "text-muted-foreground" },
} as const;

function formatDataHora(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

type TratarResp = {
  ok: boolean;
  erro?: string | null;
  classe?: string | null;
  cliente?: string | null;
  valor?: number | null;
  situacao_antes?: Situacao | null;
  situacao_depois?: Situacao | null;
  propaga_para_proximos_lotes?: boolean | null;
};

type SnapshotResp = {
  ok: boolean;
  erro?: string | null;
  lote_id?: string | null;
  gerado_em?: string | null;
  total?: number | null;
  abertos?: number | null;
  reaparecidos?: number | null;
  herdados?: number | null;
};

export default function AuditoriaFinanceira() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [busca, setBusca] = useState("");
  const [sevFiltro, setSevFiltro] = useState<string>("1");
  const [classeFiltro, setClasseFiltro] = useState<string>("todas");
  const [fonteFiltro, setFonteFiltro] = useState<string>("todas");
  const [situacaoFiltro, setSituacaoFiltro] = useState<string>("aberto");

  const [tratar, setTratar] = useState<Achado | null>(null);
  const [novaSituacao, setNovaSituacao] = useState<"em_analise" | "resolvido" | "explicado">("em_analise");
  const [nota, setNota] = useState("");

  const { data: lote = [], isLoading } = useQuery({
    queryKey: ["auditoria-lote-atual"],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => Promise<{ data: Achado[] | null; error: Error | null }>;
        };
      })
        .from("vw_auditoria_lote_atual")
        .select("*");
      if (error) throw error;
      return (data ?? []) as Achado[];
    },
  });

  const geradoEm = lote[0]?.gerado_em ?? null;

  const contadores = useMemo(() => {
    const c = { aberto: 0, em_analise: 0, resolvido: 0, explicado: 0, reaparecido: 0 } as Record<Situacao, number>;
    for (const a of lote) {
      const s = (a.situacao ?? "aberto") as Situacao;
      if (s in c) c[s] += 1;
    }
    return c;
  }, [lote]);

  const classesDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const a of lote) if (a.classe) s.add(a.classe);
    return Array.from(s).sort();
  }, [lote]);

  const fontesDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const a of lote) if (a.fonte) s.add(String(a.fonte));
    return Array.from(s).sort();
  }, [lote]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lote.filter((a) => {
      if (sevFiltro !== "todas" && String(a.severidade ?? "") !== sevFiltro) return false;
      if (classeFiltro !== "todas" && (a.classe ?? "") !== classeFiltro) return false;
      if (fonteFiltro !== "todas" && String(a.fonte ?? "") !== fonteFiltro) return false;
      if (situacaoFiltro !== "todas" && (a.situacao ?? "aberto") !== situacaoFiltro) return false;
      if (!q) return true;
      return (
        (a.id_externo || "").toLowerCase().includes(q) ||
        (a.cliente || "").toLowerCase().includes(q) ||
        (a.detalhe || "").toLowerCase().includes(q)
      );
    });
  }, [lote, busca, sevFiltro, classeFiltro, fonteFiltro, situacaoFiltro]);

  const mTratar = useMutation({
    mutationFn: async (args: {
      achado_id: string;
      situacao: "em_analise" | "resolvido" | "explicado";
      nota: string | null;
    }) => {
      const { data, error } = await supabase.rpc("tratar_achado_auditoria" as never, {
        p_achado_id: args.achado_id,
        p_situacao: args.situacao,
        p_nota: args.nota,
        p_user_id: user?.id ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as TratarResp;
    },
    onSuccess: (resp) => {
      if (!resp?.ok) {
        toast.error(resp?.erro || "Não foi possível tratar o achado.");
        return;
      }
      const linha = `${labelClasse(resp.classe ?? null)} · ${resp.cliente ?? "—"}`;
      const transicao = `${SITUACAO_META[(resp.situacao_antes ?? "aberto") as Situacao]?.label ?? resp.situacao_antes} → ${SITUACAO_META[(resp.situacao_depois ?? "aberto") as Situacao]?.label ?? resp.situacao_depois}`;
      const extra = resp.propaga_para_proximos_lotes
        ? " A explicação passa a valer nos próximos lotes."
        : "";
      toast.success(`${linha} — ${transicao}.${extra}`);
      qc.invalidateQueries({ queryKey: ["auditoria-lote-atual"] });
      setTratar(null);
      setNota("");
    },
    onError: (err) => {
      toast.error(formatError(err));
    },
  });

  const mGerar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("gerar_snapshot_auditoria" as never, {
        p_user_id: user?.id ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as SnapshotResp;
    },
    onSuccess: (resp) => {
      if (!resp?.ok) {
        toast.error(resp?.erro || "Falha ao gerar novo lote.");
        return;
      }
      toast.success(
        `Novo lote gerado: ${resp.total ?? 0} achados, ${resp.abertos ?? 0} abertos, ${resp.reaparecidos ?? 0} reaparecidos.`
      );
      qc.invalidateQueries({ queryKey: ["auditoria-lote-atual"] });
    },
    onError: (err) => toast.error(formatError(err)),
  });

  const abrirTratar = (a: Achado) => {
    setTratar(a);
    setNovaSituacao("em_analise");
    setNota(a.nota ?? "");
  };

  const notaObrigatoria = novaSituacao === "explicado";
  const podeSalvar =
    !!tratar &&
    !mTratar.isPending &&
    (!notaObrigatoria || nota.trim().length > 0);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria Financeira</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lote congelado de{" "}
            <span className="font-medium text-foreground">{formatDataHora(geradoEm)}</span>. Trabalhe pelas situações; um novo
            lote propaga o que já foi explicado.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={mGerar.isPending}>
              {mGerar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Gerar novo lote
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Gerar novo lote de auditoria</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    O lote atual será substituído por um novo congelamento da malha financeira.
                  </p>
                  <p>
                    Achados marcados como <strong>explicado</strong> se propagam automaticamente.
                    Achados marcados como <strong>resolvido</strong> que voltarem a aparecer entram
                    como <strong>reaparecido</strong> — sinal de que o problema não foi de fato encerrado.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => mGerar.mutate()}>
                Gerar novo lote
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Aviso obrigatório sobre não-somabilidade */}
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
        <div className="flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-foreground">
              Os valores destas classes não somam entre si.
            </div>
            <div className="text-muted-foreground leading-relaxed">
              São naturezas diferentes de dinheiro: <strong>recebível fora da cobrança</strong> é
              dinheiro possivelmente não perseguido; <strong>pago sem prova</strong> e{" "}
              <strong>recebido escondido</strong> são dinheiro já recebido com rastro faltando;{" "}
              <strong>faturar remessa</strong> é receita ainda a faturar. Somar tudo daria um total
              sem significado — trabalhe classe por classe.
            </div>
          </div>
        </div>
      </div>

      {/* Contadores por situação */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(["aberto", "em_analise", "resolvido", "explicado", "reaparecido"] as const).map((s) => {
          const meta = SITUACAO_META[s];
          const ativo = situacaoFiltro === s;
          return (
            <Card
              key={s}
              onClick={() => setSituacaoFiltro((cur) => (cur === s ? "todas" : s))}
              className={cn(
                "cursor-pointer transition-all border",
                ativo && "ring-2 ring-primary",
                s === "reaparecido" && contadores[s] > 0 && "border-destructive/60 bg-destructive/5"
              )}
            >
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {meta.label}
                </div>
                <div
                  className={cn(
                    "text-2xl font-bold tabular-nums mt-1",
                    s === "reaparecido" && contadores[s] > 0 && "text-destructive"
                  )}
                >
                  {contadores[s]}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-start sm:items-center">
        <Input
          placeholder="Buscar por pedido, cliente ou detalhe…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <Select value={sevFiltro} onValueChange={setSevFiltro}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Severidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas severidades</SelectItem>
            <SelectItem value="1">Severidade 1</SelectItem>
            <SelectItem value="2">Severidade 2</SelectItem>
            <SelectItem value="3">Severidade 3</SelectItem>
          </SelectContent>
        </Select>
        <Select value={classeFiltro} onValueChange={setClasseFiltro}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Classe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as classes</SelectItem>
            {classesDisponiveis.map((c) => (
              <SelectItem key={c} value={c}>{labelClasse(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fonteFiltro} onValueChange={setFonteFiltro}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Fonte" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as fontes</SelectItem>
            {fontesDisponiveis.map((f) => (
              <SelectItem key={f} value={f}>{FONTE_LABEL[f] ?? f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={situacaoFiltro} onValueChange={setSituacaoFiltro}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas situações</SelectItem>
            {(["aberto", "em_analise", "resolvido", "explicado", "reaparecido"] as const).map((s) => (
              <SelectItem key={s} value={s}>{SITUACAO_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground sm:ml-auto">
          {filtrados.length} de {lote.length} achados
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-8 text-center">Carregando…</div>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum achado com os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {filtrados.map((a) => {
              const sev = (a.severidade ?? 3) as 1 | 2 | 3;
              const sevMeta = SEV_META[sev] ?? SEV_META[3];
              const sitKey = (a.situacao ?? "aberto") as Situacao;
              const sitMeta = SITUACAO_META[sitKey] ?? SITUACAO_META.aberto;
              return (
                <div key={a.id} className="px-5 py-4 grid grid-cols-12 gap-3 items-start">
                  <div className="col-span-12 md:col-span-2 space-y-1">
                    <Badge variant="outline" className={cn("flex-shrink-0", sevMeta.badge)}>
                      Sev {sev}
                    </Badge>
                    <div className="text-sm font-medium truncate" title={labelClasse(a.classe)}>
                      {labelClasse(a.classe)}
                    </div>
                    {a.estagio && <EstagioBadge estagio={a.estagio as EstagioPedido} />}
                  </div>
                  <div className="col-span-12 md:col-span-3 text-sm">
                    <div className="truncate" title={a.cliente ?? ""}>
                      {a.cliente || "—"}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span className="tabular-nums">{a.id_externo || "—"}</span>
                      {a.pedido_id && (
                        <button
                          onClick={() => navigate(`/pedidos/${a.pedido_id}`)}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          abrir <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="text-sm font-medium tabular-nums mt-1">
                      {formatBRL(Number(a.valor || 0))}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-4 space-y-2 text-sm">
                    <div className="text-muted-foreground">{a.detalhe || "—"}</div>
                    {a.acao && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-0.5">
                          Ação
                        </div>
                        <div className="leading-snug text-foreground">{a.acao}</div>
                      </div>
                    )}
                    {a.nota && (
                      <div className="text-xs text-muted-foreground italic border-l-2 pl-2 border-border">
                        Nota: {a.nota}
                      </div>
                    )}
                  </div>
                  <div className="col-span-12 md:col-span-3 flex flex-col gap-2 items-start md:items-end">
                    <Badge variant="outline" className={cn("border", sitMeta.className)}>
                      {sitMeta.label}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => abrirTratar(a)}>
                      Tratar
                    </Button>
                    {a.tratado_em && (
                      <div className="text-[10px] text-muted-foreground">
                        Tratado em {formatDataHora(a.tratado_em)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Dialog de tratamento */}
      <Dialog open={!!tratar} onOpenChange={(o) => { if (!o) { setTratar(null); setNota(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tratar achado</DialogTitle>
            <DialogDescription>
              {tratar ? `${labelClasse(tratar.classe)} · ${tratar.cliente ?? "—"} · ${formatBRL(Number(tratar.valor || 0))}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nova situação</label>
              <Select
                value={novaSituacao}
                onValueChange={(v) => setNovaSituacao(v as typeof novaSituacao)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_analise">Em análise</SelectItem>
                  <SelectItem value="resolvido">Resolvido</SelectItem>
                  <SelectItem value="explicado">Explicado (propaga para próximos lotes)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Nota {notaObrigatoria && <span className="text-destructive">*</span>}
              </label>
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder={
                  notaObrigatoria
                    ? "Explique por que este achado deve ser considerado explicado nos próximos lotes."
                    : "Opcional — contexto do tratamento."
                }
                rows={4}
              />
              {notaObrigatoria && (
                <p className="text-xs text-warning">
                  A explicação é obrigatória e passará a valer para este achado nos próximos lotes.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTratar(null)} disabled={mTratar.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={!podeSalvar}
              onClick={() =>
                tratar &&
                mTratar.mutate({
                  achado_id: tratar.id,
                  situacao: novaSituacao,
                  nota: nota.trim() ? nota.trim() : null,
                })
              }
            >
              {mTratar.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
