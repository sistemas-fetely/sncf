import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Users, Wallet, CalendarDays, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

interface LinhaFolha {
  vinculo_id: string;
  pessoa: string;
  tipo_vinculo: "CLT" | "PJ";
  departamento: string | null;
  valor_base: number;
  valor_transporte: number;
  total_beneficios: number;
  extras_recorrentes: number;
  extras_pontuais: number;
  total_mes: number;
}

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FolhaMensal() {
  const navigate = useNavigate();
  const hoje = new Date();
  const defaultComp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [competencia, setCompetencia] = useState<string>(defaultComp);

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["folha-competencia", competencia],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_folha_competencia", {
        p_competencia: `${competencia}-01`,
      });
      if (error) {
        toast.error(humanizeError(error.message || String(error)));
        throw error;
      }
      return (data || []) as LinhaFolha[];
    },
  });

  const sorted = useMemo(
    () => [...linhas].sort((a, b) => Number(b.total_mes) - Number(a.total_mes)),
    [linhas]
  );

  const totais = useMemo(() => {
    const acc = {
      base: 0,
      transporte: 0,
      beneficios: 0,
      extras_rec: 0,
      extras_pont: 0,
      total: 0,
    };
    for (const l of linhas) {
      acc.base += Number(l.valor_base) || 0;
      acc.transporte += Number(l.valor_transporte) || 0;
      acc.beneficios += Number(l.total_beneficios) || 0;
      acc.extras_rec += Number(l.extras_recorrentes) || 0;
      acc.extras_pont += Number(l.extras_pontuais) || 0;
      acc.total += Number(l.total_mes) || 0;
    }
    return acc;
  }, [linhas]);

  const recorrente = totais.base + totais.transporte + totais.beneficios + totais.extras_rec;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Folha Mensal</h1>
          <p className="text-muted-foreground text-sm mt-1">Custo da equipe por competência</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => navigate("/pessoas")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="competencia">Competência</Label>
              <Input
                id="competencia"
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className="w-48"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-4">
        <Card className="card-shadow border-primary/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{fmtBRL(totais.total)}</p>
              <p className="text-xs text-muted-foreground">Total da Folha</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{fmtBRL(recorrente)}</p>
              <p className="text-xs text-muted-foreground">Recorrente</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{fmtBRL(totais.extras_pont)}</p>
              <p className="text-xs text-muted-foreground">Pontual no mês</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{linhas.length}</p>
              <p className="text-xs text-muted-foreground">Headcount</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Pessoa</TableHead>
                  <TableHead className="font-semibold">Tipo</TableHead>
                  <TableHead className="font-semibold">Área</TableHead>
                  <TableHead className="font-semibold text-right">Base</TableHead>
                  <TableHead className="font-semibold text-right">Benefícios</TableHead>
                  <TableHead className="font-semibold text-right">Extras recorrentes</TableHead>
                  <TableHead className="font-semibold text-right">Extras pontuais</TableHead>
                  <TableHead className="font-semibold text-right">Total do mês</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum custo nesta competência.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {sorted.map((l) => {
                      const base = (Number(l.valor_base) || 0) + (Number(l.valor_transporte) || 0);
                      const pont = Number(l.extras_pontuais) || 0;
                      return (
                        <TableRow key={l.vinculo_id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{l.pessoa}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                l.tipo_vinculo === "CLT"
                                  ? "bg-info text-info-foreground hover:bg-info/90 font-bold border-0"
                                  : "bg-warning text-warning-foreground hover:bg-warning/90 font-bold border-0"
                              }
                            >
                              {l.tipo_vinculo}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{l.departamento || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtBRL(base)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtBRL(Number(l.total_beneficios) || 0)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtBRL(Number(l.extras_recorrentes) || 0)}</TableCell>
                          <TableCell className={`text-right tabular-nums ${pont > 0 ? "text-warning font-semibold" : "text-muted-foreground"}`}>
                            {pont > 0 ? fmtBRL(pont) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold">{fmtBRL(Number(l.total_mes) || 0)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/60 font-semibold">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(totais.base + totais.transporte)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(totais.beneficios)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(totais.extras_rec)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(totais.extras_pont)}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold">{fmtBRL(totais.total)}</TableCell>
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
