import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Users, Wallet, Briefcase, Building2, ClipboardList } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

interface DimensionamentoArea {
  centro_custo_id: string;
  centro_custo: string;
  ocupados: number;
  ocupados_clt: number;
  ocupados_pj: number;
  vagas_abertas: number;
  vagas_em_processo: number;
  vagas_futuras: number;
  tamanho_planejado: number;
  custo_valor_base: number;
  custo_transporte: number;
  custo_beneficios_extras: number;
}

const fmtBRL = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const num = (v: any) => Number(v || 0);

function custoTotal(r: DimensionamentoArea) {
  return num(r.custo_valor_base) + num(r.custo_transporte) + num(r.custo_beneficios_extras);
}

export default function PanoramaAreas() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dimensionamento-areas"],
    queryFn: async (): Promise<DimensionamentoArea[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_dimensionamento_areas")
        .select("*");
      if (error) {
        toast.error(humanizeError(error.message));
        throw error;
      }
      return (data || []) as DimensionamentoArea[];
    },
  });

  const rows = (data || []).map((r) => ({
    ...r,
    ocupados: num(r.ocupados),
    ocupados_clt: num(r.ocupados_clt),
    ocupados_pj: num(r.ocupados_pj),
    vagas_abertas: num(r.vagas_abertas),
    custo_valor_base: num(r.custo_valor_base),
    custo_transporte: num(r.custo_transporte),
    custo_beneficios_extras: num(r.custo_beneficios_extras),
  }));

  const sorted = [...rows].sort((a, b) => custoTotal(b) - custoTotal(a));

  const totOcupados = rows.reduce((s, r) => s + r.ocupados, 0);
  const totCLT = rows.reduce((s, r) => s + r.ocupados_clt, 0);
  const totPJ = rows.reduce((s, r) => s + r.ocupados_pj, 0);
  const totVagas = rows.reduce((s, r) => s + r.vagas_abertas, 0);
  const totBase = rows.reduce((s, r) => s + r.custo_valor_base, 0);
  const totCusto = rows.reduce((s, r) => s + custoTotal(r), 0);

  const chartData = sorted.map((r) => ({
    centro_custo: r.centro_custo,
    custo: custoTotal(r),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panorama de Áreas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Headcount e custo mensal por centro de custo
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/pessoas/vagas")} className="gap-2">
            <ClipboardList className="h-4 w-4" /> Gerenciar vagas
          </Button>
          <Button variant="outline" onClick={() => navigate("/pessoas")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{totOcupados}</p><p className="text-xs text-muted-foreground">Total de pessoas</p></div>
        </CardContent></Card>
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success"><Wallet className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{fmtBRL(totCusto)}</p><p className="text-xs text-muted-foreground">Custo mensal total</p></div>
        </CardContent></Card>
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info"><Building2 className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{totCLT}</p><p className="text-xs text-muted-foreground">CLT</p></div>
        </CardContent></Card>
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning"><Briefcase className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{totPJ}</p><p className="text-xs text-muted-foreground">PJ</p></div>
        </CardContent></Card>
      </div>

      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="text-base">Custo Mensal por Centro de Custo</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-[320px]">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhuma área com dados ainda.
            </div>
          ) : (
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="departamento" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => fmtBRL(v)} tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                  <Bar dataKey="custo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="text-base">Detalhamento por Área</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Área</TableHead>
                  <TableHead className="font-semibold text-right">Ocupados</TableHead>
                  <TableHead className="font-semibold text-right">CLT</TableHead>
                  <TableHead className="font-semibold text-right">PJ</TableHead>
                  <TableHead className="font-semibold text-right">Vagas Abertas</TableHead>
                  <TableHead className="font-semibold text-right">Custo Base</TableHead>
                  <TableHead className="font-semibold text-right">Custo Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma área com dados ainda.</TableCell></TableRow>
                ) : (
                  <>
                    {sorted.map((r) => (
                      <TableRow key={r.departamento_id}>
                        <TableCell className="font-medium text-sm">{r.departamento}</TableCell>
                        <TableCell className="text-right text-sm">{r.ocupados}</TableCell>
                        <TableCell className="text-right text-sm">{r.ocupados_clt}</TableCell>
                        <TableCell className="text-right text-sm">{r.ocupados_pj}</TableCell>
                        <TableCell className="text-right text-sm">
                          {r.vagas_abertas > 0 ? (
                            <Badge className="bg-warning/10 text-warning border-0">{r.vagas_abertas}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmtBRL(r.custo_valor_base)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{fmtBRL(custoTotal(r))}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{totOcupados}</TableCell>
                      <TableCell className="text-right">{totCLT}</TableCell>
                      <TableCell className="text-right">{totPJ}</TableCell>
                      <TableCell className="text-right">{totVagas}</TableCell>
                      <TableCell className="text-right">{fmtBRL(totBase)}</TableCell>
                      <TableCell className="text-right">{fmtBRL(totCusto)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
