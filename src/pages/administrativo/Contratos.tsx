import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  FileSignature, Search, AlertTriangle, CheckCircle2, TrendingUp,
  FolderOpen, ArrowRight, Info, Trash2, Clock,
  Banknote, CalendarClock, Activity, ChevronDown, ChevronUp,
  Plus, Loader2, Upload, Save,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

// ─── Paleta Fetely Operacional ─────────────────────────────────────
const VERDE = "#1A4A3A";
const ROSA = "#E91E63";
const VERDE_LIGHT = "#e8f2ee";

// ─── Types ─────────────────────────────────────────────────────────
interface ContratoListagem {
  id: string;
  pasta_id: string;
  numero: string;
  data_assinatura: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  valor_total: number;
  valor_parcela: number;
  ciclo_pagamento: string;
  numero_parcelas: number | null;
  status: string;
  permite_valor_variavel: boolean;
  created_at: string;
  pasta_nome: string;
  pasta_tipo: string;
  parceiro_nome: string | null;
  tipo_contrato_id: string | null;
  tipo_nome: string | null;
}

interface ParcelaInfo {
  contrato_id: string;
  data_vencimento: string;
  valor: number;
  status: string;
  numero_parcela: number | null;
}

interface Parceiro {
  id: string;
  razao_social: string;
  cnpj: string | null;
  nome_fantasia: string | null;
}

interface FormasPagamento {
  id: string;
  nome: string;
}

interface DadosIA {
  numero_sugerido?: string;
  data_assinatura?: string;
  vigencia_inicio?: string;
  vigencia_fim?: string;
  valor_total?: number;
  valor_parcela?: number;
  ciclo_pagamento?: string;
  numero_parcelas?: number;
  dia_vencimento?: number;
  data_primeira_parcela?: string;
  tem_setup?: boolean;
  valor_setup?: number;
  parcelas_setup?: number;
  data_primeira_parcela_setup?: string;
  reajuste_indice?: string;
  reajuste_data?: string;
  renova_automaticamente?: boolean;
  permite_valor_variavel?: boolean;
  resumo_ia?: string;
  confianca?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────
function mrr(c: ContratoListagem): number {
  if (c.status !== "vigente") return 0;
  switch (c.ciclo_pagamento) {
    case "mensal": return Number(c.valor_parcela);
    case "trimestral": return Number(c.valor_parcela) / 3;
    case "anual": return Number(c.valor_parcela) / 12;
    default: return 0;
  }
}

function cicloLabel(c: ContratoListagem) {
  if (c.ciclo_pagamento === "unico") return "Único";
  if (c.ciclo_pagamento === "parcelado") return `${c.numero_parcelas}x parcelado`;
  if (c.ciclo_pagamento === "mensal") return "Mensal";
  if (c.ciclo_pagamento === "trimestral") return "Trimestral";
  if (c.ciclo_pagamento === "anual") return "Anual";
  return c.ciclo_pagamento;
}

function mesLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

// ─── KPI Card ──────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, accent = VERDE, alert = false,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent?: string; alert?: boolean;
}) {
  return (
    <div
      className="rounded-lg border bg-card p-4"
      style={alert ? { borderColor: accent, borderWidth: 1.5 } : undefined}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <div
          className="rounded-md p-1.5"
          style={{ background: alert ? `${accent}15` : VERDE_LIGHT }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-semibold" style={alert ? { color: accent } : undefined}>
          {value}
        </p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Saúde do contrato ─────────────────────────────────────────────
function saudeContrato(
  c: ContratoListagem,
  atrasadasMap: Map<string, number>,
  proximaMap: Map<string, ParcelaInfo>,
): "ok" | "alerta" | "critico" {
  if ((atrasadasMap.get(c.id) ?? 0) > 0) return "critico";
  const prox = proximaMap.get(c.id);
  if (prox) {
    const dias = (new Date(prox.data_vencimento).getTime() - Date.now()) / 86_400_000;
    if (dias <= 10) return "alerta";
  }
  if (c.vigencia_fim) {
    const dias = (new Date(c.vigencia_fim).getTime() - Date.now()) / 86_400_000;
    if (dias <= 30) return "alerta";
  }
  return "ok";
}

const SAUDE_COLOR: Record<string, string> = { ok: "#16a34a", alerta: "#d97706", critico: ROSA };
const SAUDE_LABEL: Record<string, string> = { ok: "Em dia", alerta: "Atenção", critico: "Crítico" };

// ─── Main ──────────────────────────────────────────────────────────
export default function Contratos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [contratoParaExcluir, setContratoParaExcluir] = useState<ContratoListagem | null>(null);
  const [mostrarBanner, setMostrarBanner] = useState(false);
  const [novoContratoOpen, setNovoContratoOpen] = useState(false);
  const [contratoDetalhes, setContratoDetalhes] = useState<ContratoListagem | null>(null);

  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ["contratos-todos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pasta_contratos")
        .select(`*, ged_pastas!inner(nome, tipo, parceiro_id, parceiros_comerciais(razao_social)), tipos_contrato(nome)`)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        ...c,
        pasta_nome: c.ged_pastas?.nome,
        pasta_tipo: c.ged_pastas?.tipo,
        parceiro_nome: c.ged_pastas?.parceiros_comerciais?.razao_social ?? null,
        tipo_nome: c.tipos_contrato?.nome ?? null,
      })) as ContratoListagem[];
    },
  });

  const { data: tiposContrato = [] } = useQuery({
    queryKey: ["tipos-contrato"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tipos_contrato")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const atualizarTipoMutation = useMutation({
    mutationFn: async ({ id, tipo_contrato_id }: { id: string; tipo_contrato_id: string | null }) => {
      const { error } = await (supabase as any)
        .from("pasta_contratos")
        .update({ tipo_contrato_id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos-todos"] });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar tipo", variant: "destructive" });
    },
  });

  const { data: parcelasData } = useQuery({
    queryKey: ["parcelas-dashboard"],
    queryFn: async () => {
      const hoje = new Date().toISOString().split("T")[0];
      const em12m = new Date(Date.now() + 365 * 86_400_000).toISOString().split("T")[0];
      const { data: futuras } = await (supabase as any)
        .from("pasta_contrato_parcelas")
        .select("contrato_id, data_vencimento, valor, status, numero_parcela")
        .gte("data_vencimento", hoje)
        .lte("data_vencimento", em12m)
        .order("data_vencimento", { ascending: true });
      const { data: atrasadas } = await (supabase as any)
        .from("pasta_contrato_parcelas")
        .select("contrato_id, data_vencimento, valor, status")
        .lt("data_vencimento", hoje)
        .neq("status", "pago");
      return {
        futuras: (futuras ?? []) as ParcelaInfo[],
        atrasadas: (atrasadas ?? []) as ParcelaInfo[],
      };
    },
  });

  const kpis = useMemo(() => {
    const vigentes = contratos.filter((c) => c.status === "vigente");
    const totalMrr = vigentes.reduce((s, c) => s + mrr(c), 0);
    const commitment12m = (parcelasData?.futuras ?? []).reduce((s, p) => s + Number(p.valor), 0);

    const atrasadasMap = new Map<string, number>();
    for (const p of parcelasData?.atrasadas ?? []) {
      atrasadasMap.set(p.contrato_id, (atrasadasMap.get(p.contrato_id) ?? 0) + 1);
    }
    const totalAtrasadas = parcelasData?.atrasadas?.length ?? 0;

    const proximaMap = new Map<string, ParcelaInfo>();
    for (const p of parcelasData?.futuras ?? []) {
      if (!proximaMap.has(p.contrato_id)) proximaMap.set(p.contrato_id, p);
    }

    const venceMes = vigentes.filter((c) => {
      if (!c.vigencia_fim) return false;
      const dias = (new Date(c.vigencia_fim).getTime() - Date.now()) / 86_400_000;
      return dias > 0 && dias <= 30;
    }).length;

    const hoje = new Date();
    const meses: { mes: string; valor: number; date: Date }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      meses.push({ mes: mesLabel(d), valor: 0, date: d });
    }
    for (const p of parcelasData?.futuras ?? []) {
      const d = new Date(p.data_vencimento);
      const idx = meses.findIndex(
        (m) => m.date.getFullYear() === d.getFullYear() && m.date.getMonth() === d.getMonth(),
      );
      if (idx >= 0) meses[idx].valor += Number(p.valor);
    }

    return {
      totalMrr, arr: totalMrr * 12, commitment12m,
      vigentes: vigentes.length, total: contratos.length,
      venceMes, totalAtrasadas, atrasadasMap, proximaMap, chartData: meses,
    };
  }, [contratos, parcelasData]);

  const contratosFiltrados = contratos.filter((c) => {
    if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
    if (filtroTipo === "__none__" && c.tipo_contrato_id !== null) return false;
    if (filtroTipo !== "todos" && filtroTipo !== "__none__" && c.tipo_contrato_id !== filtroTipo) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      return (
        c.numero?.toLowerCase().includes(q) ||
        c.pasta_nome?.toLowerCase().includes(q) ||
        c.parceiro_nome?.toLowerCase().includes(q) ||
        c.tipo_nome?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const excluirMutation = useMutation({
    mutationFn: async (contrato: ContratoListagem) => {
      const { data: parcelas } = await (supabase as any)
        .from("pasta_contrato_parcelas").select("id").eq("pasta_contrato_id", contrato.id);
      const ids = (parcelas ?? []).map((p: any) => p.id);
      if (ids.length > 0) {
        const { error } = await (supabase as any)
          .from("contas_pagar_receber")
          .update({ pasta_contrato_parcela_id: null })
          .in("pasta_contrato_parcela_id", ids);
        if (error) throw new Error(error.message);
      }
      const { error } = await (supabase as any)
        .from("pasta_contratos").delete().eq("id", contrato.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos-todos"] });
      queryClient.invalidateQueries({ queryKey: ["parcelas-dashboard"] });
      toast({ title: "Contrato excluído com sucesso." });
      setContratoParaExcluir(null);
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
      setContratoParaExcluir(null);
    },
  });

  function statusBadge(s: string) {
    if (s === "vigente") return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Vigente</Badge>;
    if (s === "encerrado") return <Badge variant="secondary">Encerrado</Badge>;
    if (s === "futuro") return <Badge variant="outline">Futuro</Badge>;
    if (s === "suspenso") return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Suspenso</Badge>;
    if (s === "rascunho") return <Badge variant="outline">Rascunho</Badge>;
    return <Badge>{s}</Badge>;
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-md border bg-white p-2 shadow-md">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium" style={{ color: VERDE }}>
          {formatBRL(payload[0].value)}
        </p>
      </div>
    );
  };

  const recorrentesCount = contratos.filter(
    (c) => ["mensal", "trimestral", "anual"].includes(c.ciclo_pagamento) && c.status === "vigente",
  ).length;

  return (
    <div className="container mx-auto py-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contratos</h1>
          <p className="text-sm text-slate-500 mt-1">Gestão de compromissos e recorrência</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMostrarBanner(!mostrarBanner)}
            className="text-slate-500 text-xs"
          >
            <Info className="h-3.5 w-3.5 mr-1.5" />
            Como criar
            {mostrarBanner ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
          </Button>
          <Button
            size="sm"
            onClick={() => setNovoContratoOpen(true)}
            style={{ background: VERDE }}
            className="text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo Contrato
          </Button>
        </div>
      </div>

      {mostrarBanner && (
        <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-600">
          Os contratos nascem do GED. Crie uma pasta/projeto, suba os documentos e clique em{" "}
          <span className="font-medium">"Gerar contrato com IA"</span>.
        </div>
      )}

      {/* KPIs Row 1 — Recorrência */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="MRR (recorrência mensal)"
          value={formatBRL(kpis.totalMrr)}
          sub="contratos vigentes recorrentes"
          icon={TrendingUp}
        />
        <KpiCard
          label="ARR (anualizado)"
          value={formatBRL(kpis.arr)}
          sub="MRR × 12"
          icon={Banknote}
        />
        <KpiCard
          label="Comprometido 12m"
          value={formatBRL(kpis.commitment12m)}
          sub="todas parcelas próximas"
          icon={CalendarClock}
        />
      </div>

      {/* KPIs Row 2 — Saúde */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total" value={kpis.total} sub={`${kpis.vigentes} vigentes`} icon={FileSignature} />
        <KpiCard label="Recorrentes" value={recorrentesCount} sub="geram MRR" icon={Activity} />
        <KpiCard
          label="Vencem em 30 dias"
          value={kpis.venceMes}
          sub="renovação ou fim"
          icon={Clock}
          accent="#d97706"
          alert={kpis.venceMes > 0}
        />
        <KpiCard
          label="Parcelas em atraso"
          value={kpis.totalAtrasadas}
          sub={kpis.totalAtrasadas > 0 ? "ação necessária" : "tudo em dia"}
          icon={AlertTriangle}
          accent={ROSA}
          alert={kpis.totalAtrasadas > 0}
        />
      </div>

      {/* Gráfico */}
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Comprometimento por mês</h3>
            <p className="text-xs text-slate-500 mt-0.5">Parcelas que vencem nos próximos 6 meses</p>
          </div>
          <CalendarClock className="h-4 w-4 text-slate-400" />
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={kpis.chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: VERDE_LIGHT }} />
              <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                {kpis.chartData.map((_, i) => (
                  <Cell key={i} fill={VERDE} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por número, projeto, parceiro ou tipo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 border-slate-200"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="vigente">Vigentes</SelectItem>
            <SelectItem value="futuro">Futuros</SelectItem>
            <SelectItem value="suspenso">Suspensos</SelectItem>
            <SelectItem value="encerrado">Encerrados</SelectItem>
            <SelectItem value="rascunho">Rascunhos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="__none__">Sem tipo</SelectItem>
            {tiposContrato.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading && (
          <div className="text-center py-12 text-sm text-slate-500">Carregando contratos...</div>
        )}
        {!isLoading && contratosFiltrados.length === 0 && (
          <div className="text-center py-12">
            <FileSignature className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">
              {contratos.length === 0 ? "Nenhum contrato cadastrado." : "Nenhum contrato com esses filtros."}
            </p>
          </div>
        )}
        {!isLoading && contratosFiltrados.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Projeto / Parceiro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ciclo</TableHead>
                <TableHead className="text-right">Parcela</TableHead>
                <TableHead>Próx. vencimento</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contratosFiltrados.map((c) => {
                const saude = saudeContrato(c, kpis.atrasadasMap, kpis.proximaMap);
                const prox = kpis.proximaMap.get(c.id);
                const atrasadas = kpis.atrasadasMap.get(c.id) ?? 0;
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setContratoDetalhes(c)}
                  >
                    <TableCell>
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ background: SAUDE_COLOR[saude] }}
                        title={SAUDE_LABEL[saude]}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.numero}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{c.pasta_nome}</p>
                        {c.parceiro_nome && (
                          <p className="text-xs text-slate-500">{c.parceiro_nome}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={c.tipo_contrato_id ?? "__none__"}
                        onValueChange={(v) =>
                          atualizarTipoMutation.mutate({
                            id: c.id,
                            tipo_contrato_id: v === "__none__" ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-36 border-dashed">
                          <SelectValue placeholder="Sem tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground">Sem tipo</span>
                          </SelectItem>
                          {tiposContrato.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        {cicloLabel(c)}
                        {c.permite_valor_variavel && (
                          <Badge variant="outline" className="text-xs">SaaS</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatBRL(c.valor_parcela)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {prox ? (
                        <div>
                          <p className="font-medium">{formatDateBR(prox.data_vencimento)}</p>
                          {atrasadas > 0 && (
                            <p style={{ color: ROSA }} className="text-xs">
                              {atrasadas} em atraso
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <p>{formatDateBR(c.vigencia_inicio)}</p>
                      <p className="text-slate-500">→ {c.vigencia_fim ? formatDateBR(c.vigencia_fim) : "sem fim"}</p>
                    </TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/administrativo-fetely/ged?pasta=${c.pasta_id}`);
                          }}
                          title="Abrir no GED"
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContratoParaExcluir(c);
                          }}
                          title="Excluir contrato"
                          className="hover:bg-rose-50"
                          style={{ color: "#fca5a5" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = ROSA)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#fca5a5")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialog exclusão */}
      <AlertDialog
        open={!!contratoParaExcluir}
        onOpenChange={(open) => { if (!open) setContratoParaExcluir(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Contrato <span className="font-mono font-medium">{contratoParaExcluir?.numero}</span> —{" "}
                  <span className="font-medium">{contratoParaExcluir?.pasta_nome}</span>.
                </p>
                <p className="text-amber-700">
                  ⚠️ Parcelas removidas. Despesas já lançadas em Contas a Pagar são mantidas, perdem o vínculo.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => contratoParaExcluir && excluirMutation.mutate(contratoParaExcluir)}
              disabled={excluirMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluirMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NovoContratoDialog
        open={novoContratoOpen}
        onOpenChange={setNovoContratoOpen}
        onSucesso={() => {
          queryClient.invalidateQueries({ queryKey: ["contratos-todos"] });
          queryClient.invalidateQueries({ queryKey: ["parcelas-dashboard"] });
        }}
      />

      <ContratoDetalheDrawer
        contrato={contratoDetalhes}
        onClose={() => setContratoDetalhes(null)}
      />
    </div>
  );
}

// ─── Contrato Detalhe Drawer ───────────────────────────────────────
function ContratoDetalheDrawer({
  contrato,
  onClose,
}: {
  contrato: ContratoListagem | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: parcelas = [] } = useQuery({
    queryKey: ["contrato-parcelas", contrato?.id],
    enabled: !!contrato?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pasta_contrato_parcelas")
        .select("id, origem, numero_parcela, total_parcelas, data_vencimento, valor, status, conta_pagar_id")
        .eq("contrato_id", contrato!.id)
        .order("data_vencimento");
      return data || [];
    },
  });

  const { data: cprs = [] } = useQuery({
    queryKey: ["contrato-cprs", contrato?.id],
    enabled: !!contrato?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, descricao, valor, data_vencimento, status, pasta_contrato_parcela_id, pago_em")
        .eq("pasta_contrato_id", contrato!.id)
        .is("deleted_at", null)
        .order("data_vencimento");
      return data || [];
    },
  });

  const cprsExtras = cprs.filter((c: any) => !c.pasta_contrato_parcela_id);
  const totalComprometido = parcelas.reduce((s: number, p: any) => s + Number(p.valor), 0);
  const totalPago = cprs
    .filter((c: any) => c.status === "enviado_para_pagamento")
    .reduce((s: number, c: any) => s + Number(c.valor), 0);
  const totalExtras = cprsExtras.reduce((s: number, c: any) => s + Number(c.valor), 0);
  const cprMap = new Map(cprs.map((c: any) => [c.pasta_contrato_parcela_id, c]));

  function statusCPRBadge(status: string) {
    const cls: Record<string, string> = {
      aprovado: "bg-blue-100 text-blue-800 border-blue-300",
      enviado_para_pagamento: "bg-amber-100 text-amber-800 border-amber-300",
      cancelado: "bg-slate-100 text-slate-500 border-slate-300",
      aberto: "bg-slate-100 text-slate-700 border-slate-300",
    };
    const label: Record<string, string> = {
      aprovado: "Aprovado",
      enviado_para_pagamento: "Pago",
      cancelado: "Cancelado",
      aberto: "Aberto",
    };
    return (
      <Badge variant="outline" className={cls[status] ?? "bg-slate-100 text-slate-700 border-slate-300"}>
        {label[status] ?? status}
      </Badge>
    );
  }

  if (!contrato) return null;

  return (
    <Sheet open={!!contrato} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contrato.numero}</SheetTitle>
          <SheetDescription>
            {contrato.pasta_nome}
            {contrato.parceiro_nome && ` · ${contrato.parceiro_nome}`}
          </SheetDescription>
        </SheetHeader>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Comprometido</p>
            <p className="text-lg font-semibold">{formatBRL(totalComprometido)}</p>
            <p className="text-xs text-muted-foreground">parcelas geradas</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Pago</p>
            <p className="text-lg font-semibold">{formatBRL(totalPago)}</p>
            <p className="text-xs text-muted-foreground">enviado p/ pagamento</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Extras</p>
            <p className="text-lg font-semibold">{formatBRL(totalExtras)}</p>
            <p className="text-xs text-muted-foreground">{cprsExtras.length} lançamentos</p>
          </div>
        </div>

        {/* Parcelas */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Parcelas</h3>
            <span className="text-xs text-muted-foreground">{parcelas.length} parcelas</span>
          </div>
          <div className="space-y-2">
            {parcelas.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma parcela gerada.</p>
            )}
            {parcelas.map((p: any) => {
              const cpr = cprMap.get(p.id) as any;
              return (
                <div key={p.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <p className="font-medium">
                      {p.origem === "setup"
                        ? `Setup ${p.numero_parcela ?? ""}/${p.total_parcelas ?? ""}`
                        : p.total_parcelas
                        ? `Parcela ${p.numero_parcela}/${p.total_parcelas}`
                        : formatDateBR(p.data_vencimento)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateBR(p.data_vencimento)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{formatBRL(p.valor)}</span>
                    {cpr ? (
                      statusCPRBadge(cpr.status)
                    ) : (
                      <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-300">
                        Sem CPR
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ações */}
        <div className="flex justify-between gap-2 mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => navigate(`/administrativo-fetely/ged?pasta=${contrato.pasta_id}`)}
          >
            <FolderOpen className="h-4 w-4 mr-2" /> Ver no GED
          </Button>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Novo Contrato Dialog ──────────────────────────────────────────
function NovoContratoDialog({
  open,
  onOpenChange,
  onSucesso,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSucesso: () => void;
}) {
  const { toast } = useToast();
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);

  const [parceiroId, setParceiroId] = useState("");
  const [buscaParceiro, setBuscaParceiro] = useState("");

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processandoIA, setProcessandoIA] = useState(false);
  const [dadosIA, setDadosIA] = useState<DadosIA | null>(null);
  const [pastaId, setPastaId] = useState<string | null>(null);
  const [modoEtapa2, setModoEtapa2] = useState<"upload" | "ged">("upload");
  const [pastaGedId, setPastaGedId] = useState("");
  const [buscaGed, setBuscaGed] = useState("");

  const [numero, setNumero] = useState("");
  const [tipoContratoId, setTipoContratoId] = useState<string | null>(null);
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [vigenciaInicio, setVigenciaInicio] = useState("");
  const [vigenciaFim, setVigenciaFim] = useState("");
  const [ciclo, setCiclo] = useState("mensal");
  const [valorParcela, setValorParcela] = useState("");
  const [numParcelas, setNumParcelas] = useState("");
  const [diaVenc, setDiaVenc] = useState("10");
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState("");
  const [temSetup, setTemSetup] = useState(false);
  const [valorSetup, setValorSetup] = useState("");
  const [parcelasSetup, setParcelasSetup] = useState("1");
  const [dataPrimeiraSetup, setDataPrimeiraSetup] = useState("");
  const [formaId, setFormaId] = useState<string | null>(null);
  const [renovaAuto, setRenovaAuto] = useState(false);
  const [alertaDias, setAlertaDias] = useState("60");
  const [permiteVariavel, setPermiteVariavel] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros-contratos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social, cnpj, nome_fantasia")
        .eq("ativo", true)
        .order("razao_social");
      return (data || []) as Parceiro[];
    },
  });

  const { data: tiposContrato = [] } = useQuery({
    queryKey: ["tipos-contrato-dialog"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tipos_contrato")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      return (data || []) as { id: string; nome: string }[];
    },
  });

  const { data: formasPagamento = [] } = useQuery({
    queryKey: ["formas-pagamento-contratos"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("formas_pagamento")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      return (data || []) as FormasPagamento[];
    },
  });

  const { data: pastasGED = [] } = useQuery({
    queryKey: ["pastas-ged-com-parceiro"],
    enabled: etapa === 2 && modoEtapa2 === "ged",
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("vw_ged_pastas_kpis")
        .select("id, nome, parceiro_id, total_contratos")
        .eq("ativa", true)
        .not("parceiro_id", "is", null)
        .order("nome");
      return (data || []) as {
        id: string;
        nome: string;
        parceiro_id: string;
        total_contratos: number;
      }[];
    },
  });

  const pastasGEDFiltradas = pastasGED.filter((p) =>
    p.nome.toLowerCase().includes(buscaGed.toLowerCase())
  );

  const parceirosFiltrados = parceiros.filter(
    (p) =>
      p.razao_social.toLowerCase().includes(buscaParceiro.toLowerCase()) ||
      (p.cnpj && p.cnpj.includes(buscaParceiro))
  );

  useEffect(() => {
    if (!dadosIA) return;
    if (dadosIA.numero_sugerido) setNumero(dadosIA.numero_sugerido);
    if (dadosIA.data_assinatura) setDataAssinatura(dadosIA.data_assinatura);
    if (dadosIA.vigencia_inicio) setVigenciaInicio(dadosIA.vigencia_inicio);
    if (dadosIA.vigencia_fim) setVigenciaFim(dadosIA.vigencia_fim ?? "");
    if (dadosIA.valor_parcela) setValorParcela(String(dadosIA.valor_parcela));
    if (dadosIA.ciclo_pagamento) setCiclo(dadosIA.ciclo_pagamento);
    if (dadosIA.numero_parcelas) setNumParcelas(String(dadosIA.numero_parcelas));
    if (dadosIA.dia_vencimento) setDiaVenc(String(dadosIA.dia_vencimento));
    if (dadosIA.data_primeira_parcela) setDataPrimeiraParcela(dadosIA.data_primeira_parcela);
    if (typeof dadosIA.tem_setup === "boolean") setTemSetup(dadosIA.tem_setup);
    if (dadosIA.valor_setup) setValorSetup(String(dadosIA.valor_setup));
    if (dadosIA.parcelas_setup) setParcelasSetup(String(dadosIA.parcelas_setup));
    if (dadosIA.data_primeira_parcela_setup) setDataPrimeiraSetup(dadosIA.data_primeira_parcela_setup);
    if (typeof dadosIA.renova_automaticamente === "boolean") setRenovaAuto(dadosIA.renova_automaticamente);
    if (typeof dadosIA.permite_valor_variavel === "boolean") setPermiteVariavel(dadosIA.permite_valor_variavel);
  }, [dadosIA]);

  function resetar() {
    setEtapa(1);
    setParceiroId(""); setBuscaParceiro("");
    setArquivo(null); setProcessandoIA(false); setDadosIA(null); setPastaId(null);
    setNumero(""); setTipoContratoId(null); setDataAssinatura("");
    setVigenciaInicio(""); setVigenciaFim(""); setCiclo("mensal");
    setValorParcela(""); setNumParcelas(""); setDiaVenc("10");
    setDataPrimeiraParcela(""); setTemSetup(false); setValorSetup("");
    setParcelasSetup("1"); setDataPrimeiraSetup(""); setFormaId(null);
    setRenovaAuto(false); setAlertaDias("60"); setPermiteVariavel(false);
    setPastaGedId(""); setModoEtapa2("upload"); setBuscaGed("");
  }

  async function buscarOuCriarPasta(pId: string): Promise<string> {
    const { data: pastas } = await (supabase as any)
      .from("ged_pastas")
      .select("id")
      .eq("parceiro_id", pId)
      .limit(1);

    if (pastas && pastas.length > 0) return pastas[0].id;

    const parceiro = parceiros.find((p) => p.id === pId);
    const { data: novaPasta, error } = await (supabase as any)
      .from("ged_pastas")
      .insert({
        nome: parceiro?.razao_social ?? "Parceiro",
        parceiro_id: pId,
        tipo: "contratos",
        ativa: true,
      })
      .select("id")
      .single();

    if (error) throw new Error("Erro ao criar pasta: " + error.message);
    return novaPasta.id;
  }

  async function processarUploadEIA() {
    if (!arquivo || !parceiroId) return;
    setProcessandoIA(true);

    try {
      const pId = await buscarOuCriarPasta(parceiroId);
      setPastaId(pId);

      const path = `${pId}/${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("ged")
        .upload(path, arquivo, { contentType: arquivo.type });
      if (upErr) throw new Error("Upload: " + upErr.message);

      await (supabase as any).from("ged_documentos").insert({
        pasta_id: pId,
        nome: arquivo.name.replace(/\.[^/.]+$/, ""),
        arquivo_original: arquivo.name,
        tipo_documento: "contrato",
        storage_path: path,
        mime_type: arquivo.type,
        tamanho_bytes: arquivo.size,
      });

      const { data: iaData, error: iaErr } = await supabase.functions.invoke(
        "gerar-contrato-de-pasta",
        { body: { pasta_id: pId } }
      );

      if (iaErr) throw new Error("IA: " + iaErr.message);

      setDadosIA(iaData as DadosIA);
      setEtapa(3);
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setProcessandoIA(false);
    }
  }

  async function processarDoGED() {
    if (!pastaGedId) return;
    setProcessandoIA(true);
    try {
      setPastaId(pastaGedId);
      const { data: iaData, error: iaErr } = await supabase.functions.invoke(
        "gerar-contrato-de-pasta",
        { body: { pasta_id: pastaGedId } }
      );
      if (iaErr) throw new Error("IA: " + iaErr.message);
      if ((iaData as any)?.error) throw new Error((iaData as any).error);
      setDadosIA(iaData as DadosIA);
      setEtapa(3);
    } catch (err) {
      toast({
        title: "Erro ao processar",
        description: err instanceof Error ? err.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setProcessandoIA(false);
    }
  }

  async function salvar() {
    if (!pastaId || !numero || !vigenciaInicio || !valorParcela || !dataPrimeiraParcela) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSalvando(true);

    try {
      const { data: contrato, error: errC } = await (supabase as any)
        .from("pasta_contratos")
        .insert({
          pasta_id: pastaId,
          numero,
          tipo_contrato_id: tipoContratoId,
          data_assinatura: dataAssinatura || null,
          vigencia_inicio: vigenciaInicio,
          vigencia_fim: vigenciaFim || null,
          ciclo_pagamento: ciclo,
          valor_parcela: Number(valorParcela),
          valor_total: Number(valorParcela) * (numParcelas ? Number(numParcelas) : 12),
          numero_parcelas: numParcelas ? Number(numParcelas) : null,
          dia_vencimento: Number(diaVenc),
          data_primeira_parcela: dataPrimeiraParcela,
          tem_setup: temSetup,
          valor_setup: temSetup && valorSetup ? Number(valorSetup) : null,
          parcelas_setup: temSetup && parcelasSetup ? Number(parcelasSetup) : null,
          data_primeira_parcela_setup: temSetup && dataPrimeiraSetup ? dataPrimeiraSetup : null,
          meio_pagamento_id: formaId,
          renova_automaticamente: renovaAuto,
          alerta_renovacao_dias: Number(alertaDias),
          permite_valor_variavel: permiteVariavel,
          resumo_ia: dadosIA?.resumo_ia ?? null,
          clausulas_extraidas: dadosIA ? { documentos_usados: dadosIA } : null,
          status: "vigente",
        })
        .select("id")
        .single();

      if (errC) throw new Error(errC.message);

      await (supabase as any).rpc("gerar_parcelas_pasta_contrato", {
        p_contrato_id: contrato.id,
      });

      const { data: qtdCprs } = await (supabase as any).rpc(
        "fn_gerar_cprs_de_contrato",
        { p_contrato_id: contrato.id }
      );

      toast({
        title: "Contrato criado",
        description: `${qtdCprs ?? 0} despesas lançadas em Contas a Pagar com status Aprovado.`,
      });

      onSucesso();
      onOpenChange(false);
      resetar();
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetar(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Contrato</DialogTitle>
          <DialogDescription>
            {etapa === 1 && "Selecione o parceiro do contrato"}
            {etapa === 2 && "Faça upload do documento — a IA extrai os dados automaticamente"}
            {etapa === 3 && "Verifique e confirme os dados do contrato"}
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de etapas */}
        <div className="flex items-center gap-2 text-xs">
          {[
            { n: 1, label: "Parceiro" },
            { n: 2, label: "Documento" },
            { n: 3, label: "Confirmar" },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">›</span>}
              <span
                className={
                  etapa === s.n
                    ? "font-semibold text-emerald-700"
                    : etapa > s.n
                    ? "text-emerald-600"
                    : "text-slate-400"
                }
              >
                {s.n}. {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Etapa 1 — Parceiro */}
        {etapa === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Parceiro *</label>
              <Input
                placeholder="Buscar por nome ou CNPJ..."
                value={buscaParceiro}
                onChange={(e) => setBuscaParceiro(e.target.value)}
              />
              <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
                {parceirosFiltrados.length === 0 && (
                  <div className="p-4 text-sm text-slate-500">
                    Nenhum parceiro encontrado. Cadastre em Parceiros Comerciais primeiro.
                  </div>
                )}
                {parceirosFiltrados.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setParceiroId(p.id)}
                    className={`px-3 py-2.5 cursor-pointer text-sm hover:bg-muted/50 ${
                      parceiroId === p.id ? "bg-emerald-50 border-l-2 border-l-emerald-500" : ""
                    }`}
                  >
                    <p className="font-medium">{p.razao_social}</p>
                    {p.cnpj && <p className="text-xs text-slate-500">{p.cnpj}</p>}
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={() => setEtapa(2)}
                disabled={!parceiroId}
                style={{ background: VERDE }}
                className="text-white"
              >
                Próximo
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Etapa 2 — Documento */}
        {etapa === 2 && (
          <div className="space-y-4">
            <div className="flex rounded-lg border overflow-hidden text-sm">
              <button
                className={`flex-1 py-2 px-3 text-center transition-colors ${
                  modoEtapa2 === "upload"
                    ? "bg-card font-medium"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                }`}
                onClick={() => setModoEtapa2("upload")}
              >
                Upload novo
              </button>
              <button
                className={`flex-1 py-2 px-3 text-center transition-colors ${
                  modoEtapa2 === "ged"
                    ? "bg-card font-medium"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                }`}
                onClick={() => setModoEtapa2("ged")}
              >
                Importar do GED
              </button>
            </div>

            {modoEtapa2 === "upload" && (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30"
                onClick={() => document.getElementById("upload-contrato-novo")?.click()}
              >
                <input
                  id="upload-contrato-novo"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
                {arquivo ? (
                  <div>
                    <p className="font-medium text-sm">{arquivo.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(arquivo.size / 1024).toFixed(0)} KB — clique para trocar
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-medium">Clique para selecionar o PDF do contrato</p>
                    <p className="text-xs text-slate-500 mt-1">A IA analisa e preenche os dados automaticamente</p>
                  </div>
                )}
              </div>
            )}

            {modoEtapa2 === "ged" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Selecione uma pasta do GED — a IA lê os documentos existentes e extrai os dados do contrato.
                </p>
                <Input
                  placeholder="Buscar pasta..."
                  value={buscaGed}
                  onChange={(e) => setBuscaGed(e.target.value)}
                />
                <div className="border rounded-md max-h-52 overflow-y-auto divide-y">
                  {pastasGEDFiltradas.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Nenhuma pasta com parceiro encontrada.
                    </p>
                  )}
                  {pastasGEDFiltradas.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setPastaGedId(p.id)}
                      className={`px-3 py-2.5 cursor-pointer text-sm hover:bg-muted/50 flex items-center justify-between ${
                        pastaGedId === p.id
                          ? "bg-emerald-50 border-l-2 border-l-emerald-500"
                          : ""
                      }`}
                    >
                      <p className="font-medium truncate">{p.nome}</p>
                      {p.total_contratos > 0 && (
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                          {p.total_contratos} contrato{p.total_contratos !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {processandoIA && (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando documentos com IA...
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEtapa(1)} disabled={processandoIA}>
                Voltar
              </Button>
              {modoEtapa2 === "upload" ? (
                <Button
                  onClick={processarUploadEIA}
                  disabled={!arquivo || processandoIA}
                  style={{ background: VERDE }}
                  className="text-white"
                >
                  {processandoIA ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
                  ) : (
                    "Processar com IA"
                  )}
                </Button>
              ) : (
                <Button
                  onClick={processarDoGED}
                  disabled={!pastaGedId || processandoIA}
                  style={{ background: VERDE }}
                  className="text-white"
                >
                  {processandoIA ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
                  ) : (
                    "Gerar contrato com IA"
                  )}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {/* Etapa 3 — Formulário */}
        {etapa === 3 && (
          <div className="space-y-4">
            {dadosIA?.confianca === "baixa" && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                ⚠️ IA com baixa confiança — verifique os dados antes de confirmar.
              </div>
            )}
            {dadosIA?.resumo_ia && (
              <div className="rounded-md bg-slate-50 border p-2.5 text-xs text-slate-600">
                {dadosIA.resumo_ia}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Número *</label>
                <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="CTR-2026-001" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Tipo de Contrato</label>
                <Select
                  value={tipoContratoId ?? "__none__"}
                  onValueChange={(v) => setTipoContratoId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem tipo</SelectItem>
                    {tiposContrato.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Data Assinatura</label>
                <Input type="date" value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Vigência Início *</label>
                <Input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Vigência Fim</label>
                <Input type="date" value={vigenciaFim} onChange={(e) => setVigenciaFim(e.target.value)} placeholder="Sem fim" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Ciclo</label>
                <Select value={ciclo} onValueChange={setCiclo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unico">Único</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Valor da Parcela *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={valorParcela}
                  onChange={(e) => setValorParcela(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Nº de Parcelas</label>
                <Input
                  type="number"
                  value={numParcelas}
                  onChange={(e) => setNumParcelas(e.target.value)}
                  placeholder="Deixe vazio = sem fim"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">1ª Parcela *</label>
                <Input type="date" value={dataPrimeiraParcela} onChange={(e) => setDataPrimeiraParcela(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Dia de Vencimento</label>
                <Input type="number" value={diaVenc} onChange={(e) => setDiaVenc(e.target.value)} min="1" max="28" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Forma de Pagamento</label>
                <Select
                  value={formaId ?? "__none__"}
                  onValueChange={(v) => setFormaId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não definido</SelectItem>
                    {formasPagamento.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-md p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={temSetup}
                  onChange={(e) => setTemSetup(e.target.checked)}
                  className="h-4 w-4"
                />
                Tem taxa de setup
              </label>
              {temSetup && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Valor Setup</label>
                    <Input type="number" step="0.01" value={valorSetup} onChange={(e) => setValorSetup(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Parcelas Setup</label>
                    <Input type="number" value={parcelasSetup} onChange={(e) => setParcelasSetup(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">1ª Parcela Setup</label>
                    <Input type="date" value={dataPrimeiraSetup} onChange={(e) => setDataPrimeiraSetup(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={renovaAuto}
                  onChange={(e) => setRenovaAuto(e.target.checked)}
                  className="h-4 w-4"
                />
                Renova automaticamente
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={permiteVariavel}
                  onChange={(e) => setPermiteVariavel(e.target.checked)}
                  className="h-4 w-4"
                />
                SaaS (valor variável)
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEtapa(2)} disabled={salvando}>Voltar</Button>
              <Button
                onClick={salvar}
                disabled={salvando}
                style={{ background: VERDE }}
                className="text-white"
              >
                {salvando ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                ) : (
                  "Salvar e gerar despesas"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
