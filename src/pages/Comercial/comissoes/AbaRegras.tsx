import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2 } from "lucide-react";
import { fmtData, fmtPP, fmtPct } from "./fmt";

interface RegraLinha {
  id: string;
  linha: string | null;
  percentual: number | null;
  vigencia_inicio: string | null;
  observacao: string | null;
}

interface Faixa {
  id: string;
  faixa_de: number | null;
  faixa_ate: number | null;
  ajuste_pp: number | null;
  exige_aprovacao_diretoria: boolean | null;
  vigencia_inicio: string | null;
}

export function AbaRegras() {
  const linhas = useQuery({
    queryKey: ["comissao-regra-linha"],
    queryFn: async (): Promise<RegraLinha[]> => {
      const { data, error } = await (supabase as any)
        .from("comissao_regra_linha")
        .select("id, linha, percentual, vigencia_inicio, observacao")
        .is("vigencia_fim", null)
        .order("linha");
      if (error) throw error;
      return (data ?? []) as RegraLinha[];
    },
  });

  const regua = useQuery({
    queryKey: ["comissao-regua-desconto"],
    queryFn: async (): Promise<Faixa[]> => {
      const { data, error } = await (supabase as any)
        .from("comissao_regua_desconto")
        .select("id, faixa_de, faixa_ate, ajuste_pp, exige_aprovacao_diretoria, vigencia_inicio")
        .is("vigencia_fim", null)
        .order("faixa_de");
      if (error) throw error;
      return (data ?? []) as Faixa[];
    },
  });

  const erro = (linhas.error ?? regua.error) as Error | null;

  return (
    <div className="space-y-4">
      {erro && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Falha ao carregar regras: {erro.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Percentual por linha</CardTitle>
          <p className="text-xs text-muted-foreground">
            Regras vigentes, somente leitura nesta versão.
          </p>
        </CardHeader>
        <CardContent>
          {linhas.isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (linhas.data ?? []).length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma regra de linha vigente.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Linha</TableHead>
                  <TableHead className="text-right">Percentual</TableHead>
                  <TableHead>Vigente desde</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(linhas.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.linha ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmtPct(r.percentual)}</TableCell>
                    <TableCell>{fmtData(r.vigencia_inicio)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.observacao ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Régua de desconto</CardTitle>
          <p className="text-xs text-muted-foreground">
            Quanto maior o desconto concedido, maior o ajuste em pontos percentuais sobre a comissão.
          </p>
        </CardHeader>
        <CardContent>
          {regua.isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (regua.data ?? []).length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma faixa de desconto vigente.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faixa de desconto</TableHead>
                  <TableHead className="text-right">Ajuste</TableHead>
                  <TableHead>Aprovação</TableHead>
                  <TableHead>Vigente desde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(regua.data ?? []).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">
                      {fmtPct(f.faixa_de)} a {fmtPct(f.faixa_ate)}
                    </TableCell>
                    <TableCell className="text-right">{fmtPP(f.ajuste_pp)}</TableCell>
                    <TableCell>
                      {f.exige_aprovacao_diretoria ? (
                        <Badge variant="outline">Exige diretoria</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Automática</span>
                      )}
                    </TableCell>
                    <TableCell>{fmtData(f.vigencia_inicio)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
