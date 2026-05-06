import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Target,
  TrendingUp,
  Wallet,
  Coins,
  PiggyBank,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import {
  InvestimentoEditDrawer,
  type EditMode,
} from "@/components/financeiro/InvestimentoEditDrawer";

type FrenteKpi = {
  frente_id: string;
  nome: string;
  codigo?: string | null;
  ordem: number;
  ativa: boolean;
  total_inicial: number;
  total_fechado: number;
  total_pago: number;
  total_saldo: number;
  total_saving: number;
  qtd_linhas: number;
};

type TemaKpi = {
  tema_id: string;
  frente_id: string;
  nome: string;
  ordem: number;
  ativa: boolean;
  total_inicial: number;
  total_fechado: number;
  total_pago: number;
  total_saldo: number;
  total_saving: number;
  qtd_linhas: number;
};

type LinhaKpi = {
  linha_id: string;
  tema_id: string;
  frente_id: string;
  descricao: string;
  valor_inicial: number;
  valor_fechado: number | null;
  data_prevista_pagamento: string | null;
  observacao: string | null;
  ativa: boolean;
  valor_pago: number;
  saldo: number;
  saving: number;
};

function num(v: any): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function KpiCard({
  label,
  valor,
  icon: Icon,
  tone,
}: {
  label: string;
  valor: number;
  icon: any;
  tone?: "default" | "saving";
}) {
  const isSaving = tone === "saving";
  const color =
    isSaving && valor < 0
      ? "text-rose-600"
      : isSaving && valor > 0
        ? "text-emerald-700"
        : "text-foreground";
  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className={cn("text-xl font-bold tabular-nums", color)}>
          {formatBRL(valor)}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniKpis({
  inicial,
  fechado,
  pago,
  saldo,
  saving,
}: {
  inicial: number;
  fechado: number;
  pago: number;
  saldo: number;
  saving: number;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span>Inicial: <strong className="text-foreground">{formatBRL(inicial)}</strong></span>
      <span>Fechado: <strong className="text-foreground">{formatBRL(fechado)}</strong></span>
      <span>Pago: <strong className="text-foreground">{formatBRL(pago)}</strong></span>
      <span>Saldo: <strong className="text-foreground">{formatBRL(saldo)}</strong></span>
      <span>
        Saving:{" "}
        <strong className={cn(saving > 0 ? "text-emerald-700" : saving < 0 ? "text-rose-600" : "text-foreground")}>
          {formatBRL(saving)}
        </strong>
      </span>
    </div>
  );
}

export default function InvestimentoLancamento() {
  const [filtroFrenteId, setFiltroFrenteId] = useState<string>("__all__");
  const [expandedFrentes, setExpandedFrentes] = useState<Set<string>>(new Set());
  const [expandedTemas, setExpandedTemas] = useState<Set<string>>(new Set());

  const [drawerMode, setDrawerMode] = useState<EditMode>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [drawerEnt, setDrawerEnt] = useState<any | null>(null);
  const [drawerParent, setDrawerParent] = useState<string | null>(null);

  const { data: frentes = [], isLoading: loadingF } = useQuery<FrenteKpi[]>({
    queryKey: ["frentes-investimento-kpis"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_frentes_investimento_kpis")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return (data || []).map((f: any) => ({
        ...f,
        total_inicial: num(f.total_inicial),
        total_fechado: num(f.total_fechado),
        total_pago: num(f.total_pago),
        total_saldo: num(f.total_saldo),
        total_saving: num(f.total_saving),
        qtd_linhas: num(f.qtd_linhas),
      }));
    },
  });

  const { data: temas = [] } = useQuery<TemaKpi[]>({
    queryKey: ["temas-investimento-kpis"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_temas_investimento_kpis")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return (data || []).map((t: any) => ({
        ...t,
        total_inicial: num(t.total_inicial),
        total_fechado: num(t.total_fechado),
        total_pago: num(t.total_pago),
        total_saldo: num(t.total_saldo),
        total_saving: num(t.total_saving),
        qtd_linhas: num(t.qtd_linhas),
      }));
    },
  });

  const { data: linhas = [] } = useQuery<LinhaKpi[]>({
    queryKey: ["linhas-investimento-kpis"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_linhas_investimento_kpis")
        .select("*")
        .order("descricao");
      if (error) throw error;
      return (data || []).map((l: any) => ({
        ...l,
        valor_inicial: num(l.valor_inicial),
        valor_fechado: l.valor_fechado == null ? null : num(l.valor_fechado),
        valor_pago: num(l.valor_pago),
        saldo: num(l.saldo),
        saving: num(l.saving),
      }));
    },
  });

  const frentesFiltradas = useMemo(() => {
    if (filtroFrenteId === "__all__") return frentes;
    return frentes.filter((f) => f.frente_id === filtroFrenteId);
  }, [frentes, filtroFrenteId]);

  const totais = useMemo(() => {
    return frentesFiltradas.reduce(
      (acc, f) => ({
        inicial: acc.inicial + f.total_inicial,
        fechado: acc.fechado + f.total_fechado,
        pago: acc.pago + f.total_pago,
        saldo: acc.saldo + f.total_saldo,
        saving: acc.saving + f.total_saving,
      }),
      { inicial: 0, fechado: 0, pago: 0, saldo: 0, saving: 0 },
    );
  }, [frentesFiltradas]);

  function toggleFrente(id: string) {
    setExpandedFrentes((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleTema(id: string) {
    setExpandedTemas((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openDrawer(mode: EditMode, ent: any | null, parent: string | null) {
    setDrawerMode(mode);
    // Normalizar entidade: a view nomeia ID como frente_id/tema_id/linha_id,
    // mas o drawer usa entidade.id internamente. Sem isso, edição quebra (PATCH 400).
    const normalized = ent
      ? {
          ...ent,
          id: ent.id ?? ent.linha_id ?? ent.tema_id ?? ent.frente_id,
        }
      : null;
    setDrawerEnt(normalized);
    setDrawerParent(parent);
  }

  function closeDrawer() {
    setDrawerMode(null);
    setDrawerEnt(null);
    setDrawerParent(null);
  }

  function getSaudeRowClass(l: LinhaKpi): string {
    const base = l.valor_fechado ?? l.valor_inicial;
    if (l.saldo < 0) return "bg-red-50 hover:bg-red-100 border-l-4 border-red-500";
    if (base > 0 && l.valor_pago / base >= 0.85)
      return "bg-amber-50 hover:bg-amber-100 border-l-4 border-amber-500";
    if (l.valor_fechado !== null) return "bg-emerald-50/40 hover:bg-emerald-100/60";
    return "hover:bg-muted/50";
  }

  function calcPercGasto(l: LinhaKpi): number | null {
    const base = l.valor_fechado ?? l.valor_inicial;
    if (!base || base <= 0) return null;
    return Math.round((l.valor_pago / base) * 100);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Investimento de Lançamento</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhamento de orçamento inicial, valores fechados e realizados das frentes
          de investimento de lançamento da Fetely.
        </p>
      </div>

      {/* KPIs */}
      {loadingF ? (
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 h-24" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <KpiCard label="Orçamento Inicial" valor={totais.inicial} icon={Target} />
          <KpiCard label="Previsto / Fechado" valor={totais.fechado} icon={TrendingUp} />
          <KpiCard label="Realizado / Pago" valor={totais.pago} icon={Wallet} />
          <KpiCard label="Saldo a Realizar" valor={totais.saldo} icon={Coins} />
          <KpiCard label="Saving Total" valor={totais.saving} icon={PiggyBank} tone="saving" />
        </div>
      )}

      {/* Cards por Frente — atalho visual de filtro */}
      {frentes && frentes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {frentes.map((f) => {
            const total = f.total_inicial;
            const base = Math.max(f.total_fechado, f.total_inicial);
            const percRealizado = base > 0 ? Math.round((f.total_pago / base) * 100) : null;

            const isSelected = filtroFrenteId === f.frente_id;
            const isAnySelected = filtroFrenteId !== "__all__";
            const dimmed = isAnySelected && !isSelected;

            const corMap: Record<string, string> = {
              MARKETING_LANCAMENTO: "#1A4A3A",
              PRODUTO: "#E91E63",
              FABRICA: "#E8833A",
              TI_TELECOM: "#4FC3D8",
              SHOWROOM: "#8B1A2F",
            };
            const codigo = (f as any).codigo as string | undefined;
            const bg = (codigo && corMap[codigo]) || "#737373";
            const textColor = codigo === "TI_TELECOM" ? "#1A4A3A" : "#FFFFFF";
            const pct = percRealizado === null ? 0 : Math.min(100, Math.max(0, percRealizado));

            return (
              <button
                key={f.frente_id}
                onClick={() =>
                  setFiltroFrenteId(isSelected ? "__all__" : f.frente_id)
                }
                className={cn(
                  "rounded-lg p-4 text-left transition-all duration-200",
                  "hover:brightness-110 cursor-pointer",
                  isSelected && "ring-2 ring-white/60 scale-[1.02]",
                  dimmed && "opacity-50",
                )}
                style={{ backgroundColor: bg, color: textColor }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide opacity-90 truncate">
                  {f.nome}
                </div>
                <div className="text-lg font-bold tabular-nums mt-1">
                  {formatBRL(total)}
                </div>
                {(() => {
                  const total = Number(f.total_inicial) || 0;
                  const pago = Number(f.total_pago) || 0;
                  const fechado = Number(f.total_fechado) || 0;
                  const baseBar = Math.max(total, fechado, pago);

                  const pctPago = baseBar > 0 ? (pago / baseBar) * 100 : 0;
                  const pctComprometido =
                    baseBar > 0 ? (Math.max(0, fechado - pago) / baseBar) * 100 : 0;

                  const percRealizadoLocal =
                    baseBar > 0 ? Math.round((pago / baseBar) * 100) : null;
                  const percTotalComprometido =
                    baseBar > 0 ? Math.round((Math.max(pago, fechado) / baseBar) * 100) : null;

                  return (
                    <>
                      <div className="mt-2 space-y-0.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="opacity-80">Realizado</span>
                          <span className="font-semibold tabular-nums">
                            {percRealizadoLocal === null ? "—" : `${percRealizadoLocal}%`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="opacity-80">Comprometido</span>
                          <span className="font-semibold tabular-nums">
                            {percTotalComprometido === null ? "—" : `${percTotalComprometido}%`}
                          </span>
                        </div>
                      </div>

                      <div
                        className="mt-2 h-2 rounded-full overflow-hidden flex"
                        style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
                        title={`Pago: ${formatBRL(pago)} · Comprometido: ${formatBRL(fechado)} · Total: ${formatBRL(total)}`}
                      >
                        <div
                          className="h-full transition-all duration-500"
                          style={{
                            width: `${Math.min(pctPago, 100)}%`,
                            backgroundColor: "rgba(255,255,255,0.95)",
                          }}
                        />
                        <div
                          className="h-full transition-all duration-500"
                          style={{
                            width: `${Math.min(pctComprometido, Math.max(0, 100 - pctPago))}%`,
                            backgroundColor: "rgba(255,255,255,0.55)",
                          }}
                        />
                      </div>
                    </>
                  );
                })()}
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros + Nova Frente */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Frente:</span>
          <Select value={filtroFrenteId} onValueChange={setFiltroFrenteId}>
            <SelectTrigger className="w-[260px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {frentes.map((f) => (
                <SelectItem key={f.frente_id} value={f.frente_id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => openDrawer("frente", null, null)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Frente
        </Button>
      </div>

      {/* Lista hierárquica */}
      {frentesFiltradas.length === 0 && !loadingF && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma frente cadastrada ainda. Comece criando uma frente.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {frentesFiltradas.map((f) => {
          const expF = expandedFrentes.has(f.frente_id);
          const temasF = temas.filter((t) => t.frente_id === f.frente_id);
          return (
            <Card key={f.frente_id}>
              <CardContent className="p-0">
                <div className="flex items-center gap-3 p-4 border-b">
                  <button
                    onClick={() => toggleFrente(f.frente_id)}
                    className="p-1 hover:bg-muted rounded"
                  >
                    {expF ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base">{f.nome}</h3>
                      {!f.ativa && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          inativa
                        </span>
                      )}
                    </div>
                    <MiniKpis
                      inicial={f.total_inicial}
                      fechado={f.total_fechado}
                      pago={f.total_pago}
                      saldo={f.total_saldo}
                      saving={f.total_saving}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDrawer("frente", f, null)}
                    className="gap-1 h-8"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openDrawer("tema", null, f.frente_id)}
                    className="gap-1 h-8"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Novo Tema
                  </Button>
                </div>

                {expF && (
                  <div className="p-4 space-y-2 bg-muted/20">
                    {temasF.length === 0 && (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        Nenhum tema nesta frente. Adicione um tema.
                      </div>
                    )}
                    {temasF.map((t) => {
                      const expT = expandedTemas.has(t.tema_id);
                      const linhasT = linhas.filter((l) => l.tema_id === t.tema_id);
                      return (
                        <Card key={t.tema_id} className="border-muted">
                          <CardContent className="p-0">
                            <div className="flex items-center gap-3 p-3 border-b bg-background">
                              <button
                                onClick={() => toggleTema(t.tema_id)}
                                className="p-1 hover:bg-muted rounded"
                              >
                                {expT ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-sm">{t.nome}</h4>
                                  {!t.ativa && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                      inativo
                                    </span>
                                  )}
                                </div>
                                <MiniKpis
                                  inicial={t.total_inicial}
                                  fechado={t.total_fechado}
                                  pago={t.total_pago}
                                  saldo={t.total_saldo}
                                  saving={t.total_saving}
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openDrawer("tema", t, f.frente_id)}
                                className="gap-1 h-7 text-xs"
                              >
                                <Pencil className="h-3 w-3" />
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => openDrawer("linha", null, t.tema_id)}
                                className="gap-1 h-7 text-xs"
                              >
                                <Plus className="h-3 w-3" />
                                Nova Linha
                              </Button>
                            </div>

                            {expT && (
                              <div className="p-2">
                                {linhasT.length === 0 ? (
                                  <div className="p-4 text-center text-xs text-muted-foreground">
                                    Nenhuma linha neste tema. Adicione a primeira linha.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-[11px] text-muted-foreground border-b">
                                          <th className="text-left px-2 py-1.5 font-medium">Descrição</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Inicial</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Fechado</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Pago</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Saldo</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Saving</th>
                                          <th className="text-center px-2 py-1.5 font-medium">% Gasto</th>
                                          <th className="text-left px-2 py-1.5 font-medium">Prevista</th>
                                          <th className="text-right px-2 py-1.5 font-medium">Ações</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {linhasT.map((l) => {
                                          const perc = calcPercGasto(l);
                                          return (
                                          <tr
                                            key={l.linha_id}
                                            className={cn(
                                              "border-b cursor-pointer transition-colors",
                                              getSaudeRowClass(l),
                                              !l.ativa && "opacity-60",
                                            )}
                                            onClick={() => openDrawer("linha", l, t.tema_id)}
                                          >
                                            <td className="px-2 py-2">
                                              {l.descricao}
                                              {!l.ativa && (
                                                <span className="ml-2 text-[10px] px-1 py-0.5 rounded bg-muted">
                                                  inativa
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-2 py-2 text-right tabular-nums">
                                              {formatBRL(l.valor_inicial)}
                                            </td>
                                            <td className="px-2 py-2 text-right tabular-nums">
                                              {l.valor_fechado == null ? "—" : formatBRL(l.valor_fechado)}
                                            </td>
                                            <td className="px-2 py-2 text-right tabular-nums">
                                              {formatBRL(l.valor_pago)}
                                            </td>
                                            <td className="px-2 py-2 text-right tabular-nums">
                                              {formatBRL(l.saldo)}
                                            </td>
                                            <td
                                              className={cn(
                                                "px-2 py-2 text-right tabular-nums",
                                                l.saving > 0 && "text-emerald-700",
                                                l.saving < 0 && "text-rose-600",
                                              )}
                                            >
                                              {formatBRL(l.saving)}
                                            </td>
                                            <td className="px-2 py-2 text-center">
                                              {perc === null ? (
                                                <span className="text-muted-foreground">—</span>
                                              ) : (
                                                <Badge
                                                  variant="outline"
                                                  className={cn(
                                                    "tabular-nums",
                                                    perc <= 50 && "text-muted-foreground",
                                                    perc > 50 && perc <= 85 && "text-blue-700 border-blue-300",
                                                    perc > 85 && perc <= 100 && "text-amber-700 border-amber-300 bg-amber-50",
                                                    perc > 100 && "text-red-700 border-red-400 bg-red-50",
                                                  )}
                                                >
                                                  {perc}%{perc > 100 && " ⚠️"}
                                                </Badge>
                                              )}
                                            </td>
                                            <td className="px-2 py-2 text-xs text-muted-foreground">
                                              {formatDateBR(l.data_prevista_pagamento)}
                                            </td>
                                            <td className="px-2 py-2 text-right">
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openDrawer("linha", l, t.tema_id);
                                                }}
                                                className="h-6 w-6 p-0"
                                              >
                                                <Pencil className="h-3 w-3" />
                                              </Button>
                                            </td>
                                          </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <InvestimentoEditDrawer
        mode={drawerMode}
        entidade={drawerEnt}
        parentId={drawerParent}
        onClose={closeDrawer}
        onSaved={closeDrawer}
      />
    </div>
  );
}
