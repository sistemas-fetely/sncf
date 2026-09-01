/**
 * TELA 1 — Contabilidade > Fechamento Mensal.
 *
 * Backend pronto e testado: vw_contabil_competencias, fn_contabil_gates,
 * fn_contabil_posicao, fn_contabil_fechar, fn_contabil_reabrir.
 * Esta tela apenas CONSOME. Nada de escrita direta em tabela.
 *
 * FAIL-LOUD: toda RPC de escrita e aguardada, erro do banco vai pro toast
 * com a mensagem real em portugues e o estado local volta ao que era.
 */
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Lock, LockOpen, CheckCircle2, ArrowUpDown, BookLock, Download } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { rawMessage } from "@/lib/format-error";
import { useAbaUrl } from "@/hooks/useAbaUrl";


/* ────────────────────────────── tipos ────────────────────────────── */

type StatusComp = "aberto" | "fechado" | "reaberto";

interface Competencia {
  competencia: string;
  rotulo: string;
  status: StatusComp;
  unidades: number;
  valor_custo: number;
  valor_custo_nf: number | null;
  icms_excluido: number | null;
  skus: number;
  fechado_em: string | null;
  obs: string | null;
  politica: Record<string, unknown> | null;
  gates_bloqueantes: number;
}

type Severidade = "bloqueante" | "atencao" | "informativo";

interface Gate {
  gate: string;
  severidade: Severidade;
  quantidade: number;
  detalhe: string | null;
}

interface LinhaPosicao {
  sku: string;
  produto: string | null;
  centro: string | null;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
  custo_nf_unitario: number | null;
  valor_nf_total: number | null;
  icms_aliq: number | null;
  ipi_aliq: number | null;
  valor_unit_nf: number | null;
  delta_icms: number | null;
  fonte: "snapshot" | "calculado";
}

/* ───────────────────────────── formato ───────────────────────────── */

const fmtDinheiro = (v: number | null | undefined) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUn = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const fmtUnit = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

/** Alíquota vem como fração (0.0675) — exibida como 6,75%. */
const fmtAliq = (v: number | null | undefined) =>
  v == null ? "—" : `${(Number(v) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const num = (v: unknown) => Number(v || 0);


const SELO_STATUS: Record<StatusComp, { estado: EstadoSelo; texto: string }> = {
  fechado: { estado: "success", texto: "Fechado" },
  aberto: { estado: "info", texto: "Aberto" },
  reaberto: { estado: "warning", texto: "Reaberto" },
};

const SELO_SEVERIDADE: Record<Severidade, { estado: EstadoSelo; texto: string }> = {
  bloqueante: { estado: "destructive", texto: "Bloqueante" },
  atencao: { estado: "warning", texto: "Atenção" },
  informativo: { estado: "info", texto: "Informativo" },
};

const ROTULO_GATE: Record<string, string> = {
  sku_sem_custo: "SKUs sem custo de aterrissagem",
  entrada_sem_nf: "Entradas sem NF vinculada",
  nf_autorizada_sem_baixa: "NFs autorizadas sem baixa de estoque",
  mov_retroativo_mes_fechado: "Movimentos retroativos em mês fechado",
  nf_sem_serie: "NFs sem série preenchida",
};

const POR_PAGINA = 100;

/* ────────────────────────────── tela ─────────────────────────────── */

export default function FechamentoContabil() {
  const qc = useQueryClient();
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ campo: keyof LinhaPosicao; asc: boolean }>({ campo: "valor_total", asc: false });
  const [pagina, setPagina] = useState(0);
  const [dialogFechar, setDialogFechar] = useState<"normal" | "forcar" | null>(null);
  const [dialogReabrir, setDialogReabrir] = useState(false);
  const [obs, setObs] = useState("");
  const [motivo, setMotivo] = useState("");

  const competencias = useQuery({
    queryKey: ["contabil-competencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_contabil_competencias")
        .select("*")
        .order("competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Competencia[];
    },
  });

  // Seleção inicial: competência aberta mais recente (fallback: a mais recente).
  useEffect(() => {
    if (selecionada || !competencias.data?.length) return;
    const aberta = competencias.data.find((c) => c.status === "aberto");
    setSelecionada((aberta ?? competencias.data[0]).competencia);
  }, [competencias.data, selecionada]);

  const comp = competencias.data?.find((c) => c.competencia === selecionada) ?? null;

  const gates = useQuery({
    queryKey: ["contabil-gates", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_contabil_gates", { p_competencia: selecionada! });
      if (error) throw error;
      return (data ?? []) as unknown as Gate[];
    },
  });

  const posicao = useQuery({
    queryKey: ["contabil-posicao", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_contabil_posicao", { p_competencia: selecionada! });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaPosicao[];
    },
  });

  useEffect(() => { setPagina(0); }, [selecionada, busca, ordem]);

  const linhas = posicao.data ?? [];

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = t
      ? linhas.filter(
          (l) => l.sku?.toLowerCase().includes(t) || (l.produto ?? "").toLowerCase().includes(t)
        )
      : linhas;
    const { campo, asc } = ordem;
    return [...base].sort((a, b) => {
      const va = a[campo], vb = b[campo];
      if (typeof va === "number" && typeof vb === "number") return asc ? va - vb : vb - va;
      return asc
        ? String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR")
        : String(vb ?? "").localeCompare(String(va ?? ""), "pt-BR");
    });
  }, [linhas, busca, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, paginaAtual * POR_PAGINA + POR_PAGINA);

  const totais = useMemo(
    () =>
      filtradas.reduce(
        (acc, l) => ({ un: acc.un + Number(l.quantidade || 0), rs: acc.rs + Number(l.valor_total || 0) }),
        { un: 0, rs: 0 }
      ),
    [filtradas]
  );

  const fonte = linhas[0]?.fonte;
  const gatesBloqueantes = (gates.data ?? []).filter((g) => g.severidade === "bloqueante" && g.quantidade > 0);
  const todosLimpos = (gates.data ?? []).length > 0 && (gates.data ?? []).every((g) => g.quantidade === 0);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["contabil-competencias"] });
    qc.invalidateQueries({ queryKey: ["contabil-gates", selecionada] });
    qc.invalidateQueries({ queryKey: ["contabil-posicao", selecionada] });
  };

  const fechar = useMutation({
    mutationFn: async ({ forcar, observacao }: { forcar: boolean; observacao: string }) => {
      const { error } = await supabase.rpc("fn_contabil_fechar", {
        p_competencia: selecionada!,
        p_forcar: forcar,
        p_obs: observacao || null,
      });
      if (error) throw error;
    },
    onMutate: () => {
      // rollback otimista: guarda o cache atual antes de mexer
      const anterior = qc.getQueryData(["contabil-competencias"]);
      qc.setQueryData<Competencia[]>(["contabil-competencias"], (old) =>
        (old ?? []).map((c) => (c.competencia === selecionada ? { ...c, status: "fechado" } : c))
      );
      return { anterior };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(["contabil-competencias"], ctx.anterior);
      toast.error(rawMessage(e));
    },
    onSuccess: () => {
      toast.success(`Competência ${comp?.rotulo} fechada.`);
      setDialogFechar(null);
      setObs("");
      invalidar();
    },
  });

  const reabrir = useMutation({
    mutationFn: async (m: string) => {
      const { error } = await supabase.rpc("fn_contabil_reabrir", {
        p_competencia: selecionada!,
        p_motivo: m,
      });
      if (error) throw error;
    },
    onMutate: () => {
      const anterior = qc.getQueryData(["contabil-competencias"]);
      qc.setQueryData<Competencia[]>(["contabil-competencias"], (old) =>
        (old ?? []).map((c) => (c.competencia === selecionada ? { ...c, status: "reaberto" } : c))
      );
      return { anterior };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(["contabil-competencias"], ctx.anterior);
      toast.error(rawMessage(e));
    },
    onSuccess: () => {
      toast.success(`Competência ${comp?.rotulo} reaberta.`);
      setDialogReabrir(false);
      setMotivo("");
      invalidar();
    },
  });

  const Cabecalho = ({ campo, children, num }: { campo: keyof LinhaPosicao; children: React.ReactNode; num?: boolean }) => (
    <th className={cn("px-3 py-2 text-[11px] font-normal text-muted-foreground", num ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => setOrdem((o) => ({ campo, asc: o.campo === campo ? !o.asc : false }))}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", num && "flex-row-reverse")}
      >
        {children}
        <ArrowUpDown className={cn("h-3 w-3", ordem.campo === campo ? "opacity-100" : "opacity-30")} aria-hidden="true" />
      </button>
    </th>
  );

  return (
    <PageShell>
      {/* ZONA 1 */}
      <PageTitle
        titulo="Fechamento Mensal"
        estado="Posição contábil de estoque por competência"
        icone={BookLock}
        acoes={
          comp && (
            <div className="flex items-center gap-3">
              {(comp.status === "aberto" || comp.status === "reaberto") && (
                <>
                  <Button
                    size="sm"
                    disabled={comp.gates_bloqueantes > 0 || fechar.isPending}
                    onClick={() => setDialogFechar("normal")}
                  >
                    <Lock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Fechar competência
                  </Button>
                  {comp.gates_bloqueantes > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => setDialogFechar("forcar")}
                    >
                      Fechar mesmo assim
                    </button>
                  )}
                </>
              )}
              {comp.status === "fechado" && (
                <Button size="sm" variant="outline" onClick={() => setDialogReabrir(true)}>
                  <LockOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Reabrir
                </Button>
              )}
            </div>
          )
        }
      />

      {/* ZONA 2 — faixa de competências */}
      {competencias.isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] w-[240px] shrink-0 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : competencias.error ? (
        <p className="text-sm text-destructive">{rawMessage(competencias.error)}</p>
      ) : !competencias.data?.length ? (
        <EstadoVazio mensagem="Nenhuma competência gerada ainda. Registre movimentações de estoque para abrir a primeira." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {competencias.data.map((c) => {
            const ativo = c.competencia === selecionada;
            const s = SELO_STATUS[c.status] ?? SELO_STATUS.aberto;
            return (
              <button
                key={c.competencia}
                type="button"
                onClick={() => setSelecionada(c.competencia)}
                className={cn(
                  "w-[240px] shrink-0 rounded-lg border p-3 text-left transition-colors",
                  ativo ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{c.rotulo}</span>
                  <Selo estado={s.estado}>{s.texto}</Selo>
                </div>
                <p className="mt-1 text-base tabular-nums">{fmtDinheiro(c.valor_custo)}</p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {fmtUn(c.unidades)} un · {fmtUn(c.skus)} SKUs
                </p>
                {c.gates_bloqueantes > 0 && (
                  <div className="mt-1.5">
                    <Selo estado="warning">{c.gates_bloqueantes} pendências</Selo>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ZONA 3 — gates */}
      {comp && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Checagens de {comp.rotulo}</h2>
          {gates.isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          ) : gates.error ? (
            <p className="text-sm text-destructive">{rawMessage(gates.error)}</p>
          ) : !gates.data?.length ? (
            <EstadoVazio mensagem="Nenhuma checagem configurada para esta competência." />
          ) : (
            <div className="space-y-2">
              {todosLimpos && (
                <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Nenhuma pendência. Competência pronta para fechar.
                </div>
              )}
              <ul className="divide-y rounded-lg border">
                {gates.data.map((g) => {
                  const sev = SELO_SEVERIDADE[g.severidade] ?? SELO_SEVERIDADE.informativo;
                  const zero = g.quantidade === 0;
                  return (
                    <li key={g.gate} className={cn("flex items-start gap-3 px-3 py-2.5", zero && "opacity-45")}>
                      <Selo estado={zero ? "muted" : sev.estado}>{sev.texto}</Selo>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{ROTULO_GATE[g.gate] ?? g.gate}</p>
                        {g.detalhe && <p className="text-xs text-muted-foreground">{g.detalhe}</p>}
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">{fmtUn(g.quantidade)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ZONA 4 — posição por SKU */}
      {comp && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">Posição por SKU</h2>
            {fonte && (
              <Selo estado={fonte === "snapshot" ? "success" : "info"}>
                {fonte === "snapshot" ? "Snapshot congelado" : "Cálculo ao vivo"}
              </Selo>
            )}
          </div>

          <TabelaFetely
            busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar por SKU ou produto…" }}
            carregando={posicao.isLoading}
            erro={posicao.error ? rawMessage(posicao.error) : null}
            aoTentarNovamente={() => posicao.refetch()}
            vazio={{ mensagem: "Nenhuma posição de estoque nesta competência. Registre entradas para começar." }}
            semResultado="Nenhum SKU corresponde a essa busca."
            total={linhas.length}
            exibidos={filtradas.length}
            rotulo="SKUs"
            rodapeDireita={
              totalPaginas > 1 ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={paginaAtual === 0} onClick={() => setPagina(paginaAtual - 1)}>
                    Anterior
                  </Button>
                  <span className="tabular-nums">
                    {paginaAtual + 1} / {totalPaginas}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={paginaAtual >= totalPaginas - 1}
                    onClick={() => setPagina(paginaAtual + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              ) : undefined
            }
          >
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <Cabecalho campo="sku">SKU</Cabecalho>
                    <Cabecalho campo="produto">Produto</Cabecalho>
                    <Cabecalho campo="centro">Centro</Cabecalho>
                    <Cabecalho campo="quantidade" num>Quantidade</Cabecalho>
                    <Cabecalho campo="custo_unitario" num>Custo unitário</Cabecalho>
                    <Cabecalho campo="valor_total" num>Valor total</Cabecalho>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visiveis.map((l, i) => (
                    <tr key={`${l.sku}-${l.centro}-${i}`} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{l.sku}</td>
                      <td className="max-w-[420px] truncate px-3 py-2 text-muted-foreground">{l.produto ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{l.centro ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtUn(l.quantidade)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtUnit(l.custo_unitario)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDinheiro(l.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 border-t bg-background">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">
                      Total da competência
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUn(totais.un)}</td>
                    <td />
                    <td className="px-3 py-2 text-right tabular-nums">{fmtDinheiro(totais.rs)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </TabelaFetely>
        </section>
      )}

      {/* ZONA 6 — política aplicada */}
      {comp?.status === "fechado" && comp.politica && (
        <Collapsible>
          <div className="rounded-lg border">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm">
              <span>Política contábil aplicada neste fechamento</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=open]:hidden" aria-hidden="true" />
              <ChevronUp className="hidden h-4 w-4 text-muted-foreground group-data-[state=open]:block" aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <dl className="divide-y border-t">
                {Object.entries(comp.politica).map(([k, v]) => (
                  <div key={k} className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
                    <dt className="w-[220px] shrink-0 text-xs text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 flex-1 text-sm">
                      {Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
              {comp.obs && (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">{comp.obs}</p>
              )}
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Dialog — fechar */}
      <Dialog open={dialogFechar !== null} onOpenChange={(o) => { if (!o) { setDialogFechar(null); setObs(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogFechar === "forcar" ? "Fechar ignorando pendências" : `Fechar ${comp?.rotulo ?? "competência"}`}
            </DialogTitle>
            <DialogDescription>
              {dialogFechar === "forcar"
                ? "As pendências bloqueantes abaixo serão ignoradas. Explique por quê — este texto fica registrado no fechamento."
                : "A posição desta competência será congelada em snapshot."}
            </DialogDescription>
          </DialogHeader>

          {dialogFechar === "forcar" && (
            <ul className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              {gatesBloqueantes.map((g) => (
                <li key={g.gate} className="flex items-center justify-between gap-3 text-sm">
                  <span>{ROTULO_GATE[g.gate] ?? g.gate}</span>
                  <span className="tabular-nums text-destructive">{fmtUn(g.quantidade)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="obs-fechamento">
              {dialogFechar === "forcar" ? "Justificativa (mínimo 20 caracteres)" : "Observação (opcional)"}
            </Label>
            <Textarea
              id="obs-fechamento"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={4}
              placeholder={dialogFechar === "forcar" ? "Por que estamos fechando com pendências…" : "Contexto do fechamento…"}
            />
            {dialogFechar === "forcar" && (
              <p className="text-[11px] tabular-nums text-muted-foreground">{obs.trim().length} / 20</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogFechar(null); setObs(""); }}>
              Cancelar
            </Button>
            <Button
              disabled={fechar.isPending || (dialogFechar === "forcar" && obs.trim().length < 20)}
              onClick={() => fechar.mutate({ forcar: dialogFechar === "forcar", observacao: obs.trim() })}
            >
              {fechar.isPending ? "Fechando…" : dialogFechar === "forcar" ? "Fechar mesmo assim" : "Fechar competência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — reabrir */}
      <Dialog open={dialogReabrir} onOpenChange={(o) => { if (!o) { setDialogReabrir(false); setMotivo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir {comp?.rotulo ?? "competência"}</DialogTitle>
            <DialogDescription>
              O snapshot congelado deixa de valer enquanto a competência estiver reaberta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-reabertura">Motivo (obrigatório)</Label>
            <Textarea
              id="motivo-reabertura"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="O que precisa ser corrigido nesta competência…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogReabrir(false); setMotivo(""); }}>
              Cancelar
            </Button>
            <Button
              disabled={reabrir.isPending || motivo.trim().length === 0}
              onClick={() => reabrir.mutate(motivo.trim())}
            >
              {reabrir.isPending ? "Reabrindo…" : "Reabrir competência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
