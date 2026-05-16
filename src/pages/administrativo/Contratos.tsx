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
  FileSignature, Search, AlertTriangle, CheckCircle2, TrendingUp,
  FolderOpen, ArrowRight, Info, Trash2, Clock,
  Banknote, CalendarClock, Activity, ChevronDown, ChevronUp,
  Plus, Loader2, Upload,
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
            onClick={() => navigate("/administrativo-fetely/ged")}
            style={{ background: VERDE }}
            className="text-white hover:opacity-90"
          >
            Ir para o GED
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
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
                    onClick={() => navigate(`/administrativo-fetely/ged?pasta=${c.pasta_id}`)}
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
    </div>
  );
}
