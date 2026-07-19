import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, BarChart3, CheckCircle, Layers, Loader2, Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fmtBRL = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Resumo {
  total_ativas: number;
  revisadas: number;
  a_revisar: number;
  carimbadas_motor: number;
  carimbadas_humano: number;
  regras_confirmadas: number;
}

interface FilaCnpj {
  fornecedor_cnpj: string;
  fornecedor: string | null;
  qtd_a_revisar: number;
  valor_total: number;
}

export default function MotorClassificacao() {
  const navigate = useNavigate();

  const resumoQ = useQuery({
    queryKey: ["motor-resumo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_motor_resumo")
        .select("*")
        .single();
      if (error) {
        toast.error(humanizeError(error.message));
        throw error;
      }
      return data as Resumo;
    },
  });

  const filaQ = useQuery({
    queryKey: ["motor-fila-cnpj"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_motor_fila_por_cnpj")
        .select("*");
      if (error) {
        toast.error(humanizeError(error.message));
        throw error;
      }
      return (data || []) as FilaCnpj[];
    },
  });

  const loading = resumoQ.isLoading || filaQ.isLoading;
  const resumo = resumoQ.data;
  const fila = filaQ.data || [];

  const totalCarimbadas =
    (resumo?.carimbadas_motor || 0) + (resumo?.carimbadas_humano || 0);
  const taxaAutomacao =
    totalCarimbadas > 0
      ? ((resumo?.carimbadas_motor || 0) / totalCarimbadas) * 100
      : 0;

  const top10 = fila.slice(0, 10).map((f) => ({
    name: f.fornecedor || f.fornecedor_cnpj,
    qtd: f.qtd_a_revisar,
  }));

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/administrativo-fetely/nfs-stage")}
            className="gap-2 text-muted-foreground -ml-2 mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para NFs Stage
          </Button>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-admin" />
            Motor de Classificação
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Observabilidade e priorização da fila
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="A revisar"
              value={resumo?.a_revisar ?? 0}
              subtitle="NFs aguardando validação humana"
              icon={AlertCircle}
              variant="warning"
            />
            <StatCard
              title="Taxa de automação"
              value={`${taxaAutomacao.toFixed(1)}%`}
              subtitle={`${resumo?.carimbadas_motor ?? 0} pelo motor · ${resumo?.carimbadas_humano ?? 0} por humano`}
              icon={Zap}
              variant="success"
            />
            <StatCard
              title="Regras confirmadas"
              value={resumo?.regras_confirmadas ?? 0}
              subtitle="combinações CNPJ+NCM aprendidas"
              icon={CheckCircle}
              variant="info"
            />
            <StatCard
              title="Total no stage"
              value={resumo?.total_ativas ?? 0}
              subtitle={`${resumo?.revisadas ?? 0} revisadas`}
              icon={Layers}
              variant="default"
            />
          </div>

          {/* Priorização */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Priorização da fila por fornecedor</CardTitle>
              <p className="text-sm text-muted-foreground">
                Confirmar uma NF de um fornecedor aplica a regra às demais do
                mesmo CNPJ automaticamente. Comece pelos de maior volume.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {fila.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mx-auto mb-2 text-success" />
                  <p className="font-medium">Nenhuma NF na fila. Motor em dia.</p>
                </div>
              ) : (
                <>
                  {top10.length > 0 && (
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={top10}
                          layout="vertical"
                          margin={{ left: 20, right: 20, top: 5, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={180}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip
                            formatter={(v: number) => [`${v} NFs`, "A revisar"]}
                          />
                          <Bar
                            dataKey="qtd"
                            fill="hsl(var(--primary))"
                            radius={[0, 4, 4, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fornecedor</TableHead>
                          <TableHead>CNPJ</TableHead>
                          <TableHead className="text-right">Qtd a revisar</TableHead>
                          <TableHead className="text-right">Valor total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fila.map((f) => (
                          <TableRow key={f.fornecedor_cnpj}>
                            <TableCell className="font-medium">
                              {f.fornecedor || (
                                <span className="text-muted-foreground italic">
                                  {f.fornecedor_cnpj}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {f.fornecedor_cnpj}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {f.qtd_a_revisar}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtBRL(f.valor_total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
