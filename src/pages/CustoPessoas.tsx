import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Users, Wallet, TrendingUp, Briefcase } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

interface CustoLinha {
  vinculo_id: string;
  pessoa_id: string;
  nome: string;
  tipo_vinculo: "CLT" | "PJ" | string;
  departamento: string | null;
  cargo: string | null;
  valor_base: number | null;
  valor_transporte: number | null;
  total_beneficios: number | null;
  total_extras_recorrentes: number | null;
  custo_recorrente_mensal: number | null;
}

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const num = (v: any) => Number(v || 0);

const COMPOSICAO_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2, 142 71% 45%))", "hsl(var(--chart-3, 38 92% 50%))"];

export default function CustoPessoas() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["custo-pessoas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_custo_pessoas")
        .select("*");
      if (error) {
        toast.error(humanizeError(error.message));
        throw error;
      }
      return (data || []) as CustoLinha[];
    },
  });

  const linhas = useMemo(() => {
    const arr = [...(data || [])];
    arr.sort((a, b) => num(b.custo_recorrente_mensal) - num(a.custo_recorrente_mensal));
    return arr;
  }, [data]);

  const kpis = useMemo(() => {
    const total = linhas.reduce((s, r) => s + num(r.custo_recorrente_mensal), 0);
    const headcount = linhas.length;
    const media = headcount > 0 ? total / headcount : 0;
    const clt = linhas.filter((r) => r.tipo_vinculo === "CLT");
    const pj = linhas.filter((r) => r.tipo_vinculo === "PJ");
    return {
      total,
      headcount,
      media,
      cltCount: clt.length,
      cltCusto: clt.reduce((s, r) => s + num(r.custo_recorrente_mensal), 0),
      pjCount: pj.length,
      pjCusto: pj.reduce((s, r) => s + num(r.custo_recorrente_mensal), 0),
    };
  }, [linhas]);

  const porArea = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of linhas) {
      const dep = r.departamento || "Sem área";
      map.set(dep, (map.get(dep) || 0) + num(r.custo_recorrente_mensal));
    }
    return Array.from(map.entries())
      .map(([area, custo]) => ({ area, custo }))
      .sort((a, b) => b.custo - a.custo);
  }, [linhas]);

  const composicao = useMemo(() => {
    const base = linhas.reduce((s, r) => s + num(r.valor_base) + num(r.valor_transporte), 0);
    const beneficios = linhas.reduce((s, r) => s + num(r.total_beneficios), 0);
    const extras = linhas.reduce((s, r) => s + num(r.total_extras_recorrentes), 0);
    const total = base + beneficios + extras;
    return [
      { name: "Salário base", value: base, pct: total ? (base / total) * 100 : 0 },
      { name: "Benefícios", value: beneficios, pct: total ? (beneficios / total) * 100 : 0 },
      { name: "Extras recorrentes", value: extras, pct: total ? (extras / total) * 100 : 0 },
    ];
  }, [linhas]);

  const totaisRodape = useMemo(() => {
    return linhas.reduce(
      (acc, r) => ({
        base: acc.base + num(r.valor_base) + num(r.valor_transporte),
        beneficios: acc.beneficios + num(r.total_beneficios),
        extras: acc.extras + num(r.total_extras_recorrentes),
        total: acc.total + num(r.custo_recorrente_mensal),
      }),
      { base: 0, beneficios: 0, extras: 0, total: 0 },
    );
  }, [linhas]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Custo de Pessoas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Custo recorrente mensal da equipe</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => navigate("/pessoas")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : linhas.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          Nenhum vínculo ativo com custo ainda.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wallet className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-2xl font-bold truncate">{fmtBRL(kpis.total)}</p>
                <p className="text-xs text-muted-foreground">Custo Mensal Total</p>
              </div>
            </CardContent></Card>
            <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
              <div>
                <p className="text-2xl font-bold">{kpis.headcount}</p>
                <p className="text-xs text-muted-foreground">Headcount</p>
              </div>
            </CardContent></Card>
            <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-2xl font-bold truncate">{fmtBRL(kpis.media)}</p>
                <p className="text-xs text-muted-foreground">Custo Médio / Pessoa</p>
              </div>
            </CardContent></Card>
            <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Briefcase className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-xs"><span className="font-semibold">CLT:</span> {kpis.cltCount} · {fmtBRL(kpis.cltCusto)}</p>
                <p className="text-xs"><span className="font-semibold">PJ:</span> {kpis.pjCount} · {fmtBRL(kpis.pjCusto)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">CLT vs PJ</p>
              </div>
            </CardContent></Card>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Custo Mensal por Área</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porArea}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="area" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis tickFormatter={(v) => `R$${Math.round(v/1000)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => fmtBRL(v)} />
                      <Bar dataKey="custo" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Composição do Custo</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={composicao}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(e: any) => `${e.pct.toFixed(1)}%`}
                      >
                        {composicao.map((_, i) => (
                          <Cell key={i} fill={COMPOSICAO_COLORS[i % COMPOSICAO_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number, n: string) => [fmtBRL(v), n]} />
                      <Legend
                        formatter={(value, entry: any) => {
                          const item = composicao.find((c) => c.name === value);
                          return `${value}: ${fmtBRL(item?.value || 0)} (${item?.pct.toFixed(1)}%)`;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Custo por Pessoa</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Benefícios</TableHead>
                    <TableHead className="text-right">Extras</TableHead>
                    <TableHead className="text-right">Custo Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((r) => (
                    <TableRow key={r.vinculo_id}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>
                        <Badge variant={r.tipo_vinculo === "CLT" ? "default" : "secondary"}>{r.tipo_vinculo}</Badge>
                      </TableCell>
                      <TableCell>{r.departamento || "—"}</TableCell>
                      <TableCell className="text-right">{fmtBRL(num(r.valor_base) + num(r.valor_transporte))}</TableCell>
                      <TableCell className="text-right">{fmtBRL(num(r.total_beneficios))}</TableCell>
                      <TableCell className="text-right">{fmtBRL(num(r.total_extras_recorrentes))}</TableCell>
                      <TableCell className="text-right font-bold">{fmtBRL(num(r.custo_recorrente_mensal))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/60 font-semibold">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{fmtBRL(totaisRodape.base)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(totaisRodape.beneficios)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(totaisRodape.extras)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(totaisRodape.total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
