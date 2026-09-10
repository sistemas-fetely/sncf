import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { fmtBRL, fmtCompetencia, fmtData } from "./fmt";

interface Extrato {
  competencia_pagamento: string | null;
  pagar_ate: string | null;
  vendedor_id: string | null;
  representante: string | null;
  email_contato: string | null;
  notas: number | null;
  valor_a_pagar: number | null;
  nfs: string | null;
  tudo_lancado_cpr: boolean | null;
}

function baixarCsv(competencia: string, linhas: Extrato[]) {
  const cab = ["Competência", "Pagar até", "Representante", "E-mail", "NFs", "Notas", "Valor a pagar", "Lançado no CPR"];
  const corpo = linhas.map((l) => [
    fmtCompetencia(l.competencia_pagamento),
    fmtData(l.pagar_ate),
    l.representante ?? "",
    l.email_contato ?? "",
    l.nfs ?? "",
    String(l.notas ?? 0),
    String(Number(l.valor_a_pagar ?? 0).toFixed(2)).replace(".", ","),
    l.tudo_lancado_cpr ? "Sim" : "Não",
  ]);
  const csv = [cab, ...corpo]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `comissoes-${competencia}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Extrato de ${fmtCompetencia(competencia)} exportado.`);
}

export function AbaExtrato() {
  const q = useQuery({
    queryKey: ["comissao-extrato"],
    queryFn: async (): Promise<Extrato[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_comissao_extrato_mensal")
        .select("*")
        .order("competencia_pagamento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Extrato[];
    },
  });

  const grupos = useMemo(() => {
    const mapa = new Map<string, Extrato[]>();
    for (const l of q.data ?? []) {
      const k = l.competencia_pagamento ?? "—";
      mapa.set(k, [...(mapa.get(k) ?? []), l]);
    }
    return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [q.data]);

  const hoje = new Date().toISOString().slice(0, 10);

  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Falha ao carregar extrato: {(q.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  if (q.isLoading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (grupos.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma comissão liberada até agora. O extrato só nasce quando o cliente paga uma parcela.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {grupos.map(([competencia, linhas]) => {
        const total = linhas.reduce((s, l) => s + Number(l.valor_a_pagar ?? 0), 0);
        const atraso = linhas.some(
          (l) => l.pagar_ate && l.pagar_ate < hoje && l.tudo_lancado_cpr === false,
        );
        return (
          <Card key={competencia}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  Competência {fmtCompetencia(competencia)}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Total a pagar {fmtBRL(total)} · pagar até {fmtData(linhas[0]?.pagar_ate)}
                </p>
              </div>
              <Button variant="outline" onClick={() => baixarCsv(competencia, linhas)}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {atraso && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Prazo de pagamento vencido e ainda há comissão sem lançamento em contas a pagar.
                  </AlertDescription>
                </Alert>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Representante</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="text-right">Notas</TableHead>
                    <TableHead>NFs incluídas</TableHead>
                    <TableHead>Pagar até</TableHead>
                    <TableHead className="text-right">Valor a pagar</TableHead>
                    <TableHead>CPR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={`${competencia}-${l.vendedor_id}`}>
                      <TableCell className="font-medium">{l.representante ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.email_contato ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{Number(l.notas ?? 0)}</TableCell>
                      <TableCell className="max-w-[280px] text-xs">{l.nfs ?? "—"}</TableCell>
                      <TableCell>{fmtData(l.pagar_ate)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtBRL(l.valor_a_pagar)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.tudo_lancado_cpr ? (
                          "Lançado"
                        ) : (
                          <span className="text-destructive">Pendente</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
