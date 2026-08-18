import { useEffect, useMemo, useRef } from "react";
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
import { SmartBackButton } from "@/components/SmartBackButton";
import { useIsSocio } from "@/hooks/useIsSocio";

import { PageShell } from "@/components/layout/PageShell";

interface CustoLinha {
  vinculo_id: string;
  pessoa_id: string;
  nome: string;
  tipo_vinculo: "CLT" | "PJ" | string;
  departamento: string | null;
  centro_custo_id: string | null;
  centro_custo_nome: string | null;
  cargo: string | null;
  valor_base: number | null;
  valor_transporte: number | null;
  total_beneficios: number | null;
  total_extras_recorrentes: number | null;
  custo_recorrente_mensal: number | null;
  base_encargo: number | null;
  encargo_direto_mensal: number | null;
  provisao_mensal: number | null;
  custo_total_empresa: number | null;
}

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Nulo é ausência de permissão — não pode se parecer com zero. */
const fmtOuTraco = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : fmtBRL(Number(v));

const num = (v: any) => Number(v || 0);


const COMPOSICAO_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2, 142 71% 45%))", "hsl(var(--chart-3, 38 92% 50%))"];

export default function CustoPessoas() {
  const navigate = useNavigate();
  const { data: isSocio } = useIsSocio();
  const ehDiretoria = isSocio === true;
  const rotuloTotal = ehDiretoria ? "Custo total (empresa)" : "Custo do meu time";


  // Rastro de visualização (telemetria — nunca bloqueia nem alerta o usuário)
  const rastroRef = useRef(false);
  useEffect(() => {
    if (rastroRef.current) return;
    rastroRef.current = true;
    (supabase.rpc as any)("registrar_acesso_lote", {
      p_tipo_dado: "salario",
      p_contexto: "Abriu Custo de Pessoas",
      p_quantidade: null,
    }).then(({ error }: any) => {
      if (error) console.error("registrar_acesso_lote falhou:", error);
    }, (e: any) => console.error("registrar_acesso_lote falhou:", e));
  }, []);

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
    arr.sort((a, b) => num(b.custo_total_empresa) - num(a.custo_total_empresa));
    return arr;
  }, [data]);

  /**
   * DENOMINADOR-E-NUMERADOR-DO-MESMO-CONJUNTO.
   * Linhas com `custo_total_empresa` nulo têm o salário mascarado pelo banco
   * (pode_ver_salario). Elas não entram em soma, média, contagem por vínculo,
   * distribuição por centro de custo nem composição percentual.
   */
  const visiveis = useMemo(
    () => linhas.filter((r) => r.custo_total_empresa !== null && r.custo_total_empresa !== undefined),
    [linhas],
  );

  const kpis = useMemo(() => {
    const remuneracao = visiveis.reduce((s, r) => s + num(r.custo_recorrente_mensal), 0);
    const encargos = visiveis.reduce((s, r) => s + num(r.encargo_direto_mensal), 0);
    const provisoes = visiveis.reduce((s, r) => s + num(r.provisao_mensal), 0);
    const totalEmpresa = visiveis.reduce((s, r) => s + num(r.custo_total_empresa), 0);
    const headcount = linhas.length;
    const comValor = visiveis.length;
    const media = comValor > 0 ? totalEmpresa / comValor : 0;
    const clt = visiveis.filter((r) => r.tipo_vinculo === "CLT");
    const pj = visiveis.filter((r) => r.tipo_vinculo === "PJ");
    return {
      remuneracao,
      encargos,
      provisoes,
      totalEmpresa,
      headcount,
      comValor,
      media,
      cltCount: clt.length,
      cltCusto: clt.reduce((s, r) => s + num(r.custo_total_empresa), 0),
      pjCount: pj.length,
      pjCusto: pj.reduce((s, r) => s + num(r.custo_total_empresa), 0),
    };
  }, [linhas, visiveis]);

  const porArea = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of visiveis) {
      const cc = r.centro_custo_nome || "Sem centro de custo";
      map.set(cc, (map.get(cc) || 0) + num(r.custo_total_empresa));
    }
    return Array.from(map.entries())
      .map(([area, custo]) => ({ area, custo }))
      .sort((a, b) => b.custo - a.custo);
  }, [visiveis]);

  const composicao = useMemo(() => {
    const remuneracao = visiveis.reduce(
      (s, r) => s + num(r.valor_base) + num(r.valor_transporte) + num(r.total_beneficios) + num(r.total_extras_recorrentes),
      0,
    );
    const encargos = visiveis.reduce((s, r) => s + num(r.encargo_direto_mensal), 0);
    const provisoes = visiveis.reduce((s, r) => s + num(r.provisao_mensal), 0);
    const total = remuneracao + encargos + provisoes;
    return [
      { name: "Remuneração (sem encargos)", value: remuneracao, pct: total ? (remuneracao / total) * 100 : 0 },
      { name: "Encargos (caixa do mês)", value: encargos, pct: total ? (encargos / total) * 100 : 0 },
      { name: "Provisões (13º, férias, rescisão)", value: provisoes, pct: total ? (provisoes / total) * 100 : 0 },
    ];
  }, [visiveis]);


  const totaisRodape = useMemo(() => {
    return visiveis.reduce(
      (acc, r) => ({
        remuneracao: acc.remuneracao + num(r.custo_recorrente_mensal),
        encargos: acc.encargos + num(r.encargo_direto_mensal),
        provisoes: acc.provisoes + num(r.provisao_mensal),
        total: acc.total + num(r.custo_total_empresa),
      }),
      { remuneracao: 0, encargos: 0, provisoes: 0, total: 0 },
    );
  }, [visiveis]);


  return (
    <PageShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Custo de Pessoas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Custo recorrente mensal da equipe</p>
          {!ehDiretoria && (
            <p className="text-muted-foreground text-xs mt-1">
              Você vê a remuneração da sua equipe. Valores de outras áreas não aparecem.
            </p>
          )}
        </div>
        <SmartBackButton fallback="/pessoas" fallbackLabel="Voltar" />
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
            <Card className="card-shadow border-primary/40"><CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wallet className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-2xl font-medium truncate">{fmtBRL(kpis.totalEmpresa)}</p>
                <p className="text-xs text-muted-foreground">Custo total (empresa)</p>
              </div>
            </CardContent></Card>
            <Card className="card-shadow"><CardContent className="p-4">
              <p className="text-xl font-medium truncate">{fmtBRL(kpis.remuneracao)}</p>
              <p className="text-xs text-muted-foreground">Remuneração (sem encargos)</p>
              <div className="mt-2 flex flex-col gap-0.5 text-xs">
                <span><span className="text-muted-foreground">Encargos (caixa do mês):</span> <span className="font-medium">{fmtBRL(kpis.encargos)}</span></span>
                <span><span className="text-muted-foreground">Provisões (13º, férias, rescisão):</span> <span className="font-medium">{fmtBRL(kpis.provisoes)}</span></span>
              </div>
            </CardContent></Card>
            <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
              <div>
                <p className="text-2xl font-medium">{kpis.headcount}</p>
                <p className="text-xs text-muted-foreground">Headcount</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">Média: {fmtBRL(kpis.media)}</p>
              </div>
            </CardContent></Card>
            <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Briefcase className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-xs"><span className="font-medium">CLT:</span> {kpis.cltCount} · {fmtBRL(kpis.cltCusto)}</p>
                <p className="text-xs"><span className="font-medium">PJ:</span> {kpis.pjCount} · {fmtBRL(kpis.pjCusto)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">CLT vs PJ (custo total)</p>
              </div>
            </CardContent></Card>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Custo Mensal por Centro de Custo</CardTitle></CardHeader>
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
                    <TableHead>Centro de Custo</TableHead>
                    <TableHead className="text-right">Remuneração (sem encargos)</TableHead>
                    <TableHead className="text-right">Encargos (caixa do mês)</TableHead>
                    <TableHead className="text-right">Provisões (13º, férias, rescisão)</TableHead>
                    <TableHead className="text-right">Custo total (empresa)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((r) => (
                    <TableRow key={r.vinculo_id}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>
                        <Badge variant={r.tipo_vinculo === "CLT" ? "default" : "secondary"}>{r.tipo_vinculo}</Badge>
                      </TableCell>
                      <TableCell>{r.centro_custo_nome || "—"}</TableCell>
                      <TableCell className="text-right">{fmtBRL(num(r.custo_recorrente_mensal))}</TableCell>
                      <TableCell className="text-right">{fmtBRL(num(r.encargo_direto_mensal))}</TableCell>
                      <TableCell className="text-right">{fmtBRL(num(r.provisao_mensal))}</TableCell>
                      <TableCell className="text-right font-medium">{fmtBRL(num(r.custo_total_empresa))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/60 font-medium">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{fmtBRL(totaisRodape.remuneracao)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(totaisRodape.encargos)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(totaisRodape.provisoes)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(totaisRodape.total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
