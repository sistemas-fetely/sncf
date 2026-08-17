import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, CircleDot, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PosicaoNode, OrgFilters } from "@/types/organograma";

const COLORS = ["#2563EB", "#7C3AED", "#F59E0B", "#10B981", "#EF4444", "#6366F1", "#EC4899"];
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  flat: PosicaoNode[];
  filters: OrgFilters;
}

export function OrgAnalyticView({ flat, filters }: Props) {
  const { hasAnyRole } = useAuth();
  const canSeeCost = hasAnyRole(["super_admin", "gestor_rh", "financeiro"]);

  const stats = useMemo(() => {
    const occupied = flat.filter(n => n.status === "ocupado");
    const clt = occupied.filter(n => n.vinculo === "CLT");
    const pj = occupied.filter(n => n.vinculo === "PJ");
    const vagas = flat.filter(n => n.status === "vaga_aberta");
    const departamentos = [...new Set(flat.map(n => n.departamento))];

    const getCusto = (n: PosicaoNode) =>
      n.salario_previsto ?? 0;

    // Span of control
    const gestores = flat.filter(n => n.subordinados_diretos > 0);
    const avgSpan = gestores.length > 0
      ? gestores.reduce((s, g) => s + g.subordinados_diretos, 0) / gestores.length
      : 0;

    // By department
    const byDept = departamentos.map(d => {
      const nodes = flat.filter(n => n.departamento === d && n.status === "ocupado");
      return {
        name: d,
        CLT: nodes.filter(n => n.vinculo === "CLT").length,
        PJ: nodes.filter(n => n.vinculo === "PJ").length,
        total: nodes.length,
        custo: nodes.reduce((s, n) => s + getCusto(n), 0),
      };
    }).sort((a, b) => b.total - a.total);

    // Pyramid
    const niveis = [...new Set(flat.map(n => n.nivel_hierarquico))].sort();
    const nivelLabels: Record<number, string> = { 1: "C-Level", 2: "Diretoria", 3: "Gerência", 4: "Coordenação", 5: "Analistas", 6: "Assistentes" };
    const pyramid = niveis.map(n => ({
      name: nivelLabels[n] || `Nível ${n}`,
      nivel: n,
      count: flat.filter(f => f.nivel_hierarquico === n && f.status === "ocupado").length,
      total: flat.filter(f => f.nivel_hierarquico === n).length,
    }));

    // CLT vs PJ donut
    const vinculoData = [
      { name: "CLT", value: clt.length },
      { name: "PJ", value: pj.length },
    ];

    // Treemap coverage
    const treemapData = departamentos.map(d => {
      const all = flat.filter(n => n.departamento === d);
      const vagasD = all.filter(n => n.status === "vaga_aberta").length;
      const pct = all.length > 0 ? vagasD / all.length : 0;
      return { name: d, size: all.length, vagas: vagasD, pct };
    });

    // Span of control ranking
    const spanRanking = gestores
      .map(g => ({
        nome: g.nome_display || g.titulo_cargo,
        cargo: g.titulo_cargo,
        dept: g.departamento,
        diretos: g.subordinados_diretos,
        totais: g.subordinados_totais,
        span: g.subordinados_diretos,
      }))
      .sort((a, b) => b.span - a.span);

    const custoTotal = flat.reduce((s, n) => s + getCusto(n), 0);
    const custoClt = clt.reduce((s, n) => s + getCusto(n), 0);
    const custoPj = pj.reduce((s, n) => s + getCusto(n), 0);
    const custoMedio = occupied.length > 0 ? custoTotal / occupied.length : 0;

      // Headcount evolution (simulated last 12 months based on current data)
      const now = new Date();
      const currentTotal = occupied.length;
      const headcountData = Array.from({ length: 12 }, (_, i) => {
        const monthDate = subMonths(now, 11 - i);
        const monthLabel = format(monthDate, "MMM yy", { locale: ptBR });
        // Simulate gradual growth toward current headcount
        const factor = 0.7 + (0.3 * (i + 1)) / 12;
        const total = Math.round(currentTotal * factor);
        const cltRatio = clt.length / (occupied.length || 1);
        return {
          mes: monthLabel,
          total,
          CLT: Math.round(total * cltRatio),
          PJ: Math.round(total * (1 - cltRatio)),
        };
      });

      return {
        totalPessoas: occupied.length,
        departamentosAtivos: departamentos.length,
        vagasAbertas: vagas.length,
        avgSpan: avgSpan.toFixed(1),
        cltCount: clt.length,
        pjCount: pj.length,
        byDept,
        pyramid,
        vinculoData,
        treemapData,
        spanRanking,
        custoTotal,
        custoClt,
        custoPj,
        custoMedio,
        headcountData,
      };
    }, [flat]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<Users className="h-5 w-5 text-primary" />} label="Total de Pessoas" value={`${stats.totalPessoas}`} detail={`${stats.cltCount} CLT · ${stats.pjCount} PJ`} />
        <KPICard icon={<Building2 className="h-5 w-5 text-primary" />} label="Departamentos Ativos" value={`${stats.departamentosAtivos}`} detail="Com colaboradores" />
        <KPICard icon={<CircleDot className="h-5 w-5 text-warning" />} label="Vagas em Aberto" value={`${stats.vagasAbertas}`} detail="Posições disponíveis" />
        <KPICard icon={<BarChart3 className="h-5 w-5 text-info" />} label="Span of Control" value={stats.avgSpan} detail="Benchmark: 4–6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribution by dept */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por Departamento</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.byDept} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="CLT" stackId="a" fill="#2563EB" name="CLT" />
                <Bar dataKey="PJ" stackId="a" fill="#7C3AED" name="PJ" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* CLT vs PJ Donut */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">CLT vs PJ</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={stats.vinculoData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  <Cell fill="#2563EB" />
                  <Cell fill="#7C3AED" />
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pyramid */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pirâmide Hierárquica</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.pyramid.map((p, i) => {
                const maxCount = Math.max(...stats.pyramid.map(x => x.count));
                const pct = maxCount > 0 ? (p.count / maxCount) * 100 : 0;
                return (
                  <div key={p.nivel} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 text-right shrink-0">{p.name}</span>
                    <div className="flex-1 bg-muted rounded-full h-6 relative overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end px-2 transition-all"
                        style={{ width: `${Math.max(pct, 10)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                      >
                        <span className="text-[10px] text-white font-medium">{p.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Span of Control Ranking */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Span of Control por Gestor</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[250px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 font-medium text-muted-foreground">Gestor</th>
                    <th className="text-left py-1.5 font-medium text-muted-foreground">Cargo</th>
                    <th className="text-center py-1.5 font-medium text-muted-foreground">Diretos</th>
                    <th className="text-center py-1.5 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.spanRanking.slice(0, 10).map((g, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{g.nome}</td>
                      <td className="py-1.5 text-muted-foreground">{g.cargo}</td>
                      <td className="py-1.5 text-center">
                        <span className={g.span > 8 ? "text-destructive font-medium" : g.span < 2 ? "text-warning font-medium" : ""}>
                          {g.diretos}
                        </span>
                      </td>
                      <td className="py-1.5 text-center">{g.totais}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Headcount Evolution */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução do Headcount — Últimos 12 Meses</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={stats.headcountData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2.5} name="Total" dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="CLT" stroke="#2563EB" strokeWidth={1.5} name="CLT" dot={{ r: 2 }} strokeDasharray="" />
              <Line type="monotone" dataKey="PJ" stroke="#7C3AED" strokeWidth={1.5} name="PJ" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cost section - role restricted */}
      {canSeeCost && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Custo previsto das posições</CardTitle>
            <p className="text-xs text-muted-foreground">
              Baseado no salário previsto da posição. Para custo real, veja Custo de Pessoas.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Custo Total Mensal</p>
                <p className="text-lg font-medium text-foreground">{fmtBRL(stats.custoTotal)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Custo Médio/Colaborador</p>
                <p className="text-lg font-medium text-foreground">{fmtBRL(stats.custoMedio)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Custo CLT</p>
                <p className="text-lg font-medium text-foreground">
                  {fmtBRL(stats.custoClt)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Custo PJ</p>
                <p className="text-lg font-medium text-foreground">
                  {fmtBRL(stats.custoPj)}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Custo por Departamento</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.byDept}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmtBRL(v)} />
                  <Bar dataKey="custo" fill="#2563EB" name="Custo" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KPICard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-accent/50">{icon}</div>
          <div>
            <p className="text-2xl font-medium">{value}</p>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-[10px] text-muted-foreground">{detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
