// Aba de SOPS > Produto > Estoque. Consulta do histórico de renomeações de `nome`
// no Bling (o texto que sai na linha do pedido e na NF). A EXECUÇÃO migrou para a
// Conciliação de Cadastro → "Corrigir no Bling"; esta tela vira só consulta.
// A edge atualizar-nomes-bling segue publicada, fora da tela.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type LogRow = {
  id?: string;
  sku: string | null;
  bling_id: string | null;
  nome_antes: string | null;
  nome_depois: string | null;
  dry_run: boolean | null;
  sucesso: boolean | null;
  erro_msg: string | null;
  tentativa_em: string | null;
};

const fmtQuando = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function NomesBling() {
  const [limiteHistorico, setLimiteHistorico] = useState(50);

  // ---- Histórico ----
  const historico = useQuery({
    queryKey: ["nomes-bling-log", limiteHistorico],
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("bling_nome_log")
        .select("sku, bling_id, nome_antes, nome_depois, dry_run, sucesso, erro_msg, tentativa_em")
        .order("tentativa_em", { ascending: false })
        .limit(limiteHistorico);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const historicoTotal = useQuery({
    queryKey: ["nomes-bling-log-total"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bling_nome_log")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <PageShell>
      <PageHeader
        titulo="Histórico de renomeações no Bling"
        estado="Registro das renomeações de nome de produto aplicadas no Bling. A correção de nomes agora acontece pela Conciliação de Cadastro → Corrigir no Bling."
      />

      <p className="text-sm text-muted-foreground">
        Tela de consulta. Nomes agora se corrigem pela{" "}
        <Link to="/vendas/produto/conciliacao" className="underline underline-offset-2 hover:text-foreground">
          Conciliação de Cadastro → Corrigir no Bling
        </Link>
        .
      </p>

      {/* Histórico */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Histórico</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => historico.refetch()}
            disabled={historico.isFetching}
          >
            {historico.isFetching
              ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {historico.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Falha ao ler o histórico: {(historico.error as any)?.message}</span>
            </div>
          ) : (
            <>
              <div className="mb-2 flex justify-end text-xs text-muted-foreground">
                mostrando {(historico.data ?? []).length} de {historicoTotal.data ?? "—"}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nome antes</TableHead>
                    <TableHead>Nome depois</TableHead>
                    <TableHead>Dry run</TableHead>
                    <TableHead>Sucesso</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(historico.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                        {historico.isLoading ? "Carregando…" : "Sem registros."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    historico.data!.map((l, i) => (
                      <TableRow key={`${l.sku}-${l.tentativa_em}-${i}`}>
                        <TableCell className="whitespace-nowrap text-xs">{fmtQuando(l.tentativa_em)}</TableCell>
                        <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                        <TableCell className="text-sm">{l.nome_antes ?? "—"}</TableCell>
                        <TableCell className="text-sm">{l.nome_depois ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={l.dry_run ? "secondary" : "outline"}>
                            {l.dry_run ? "simulação" : "real"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={l.sucesso ? "default" : "destructive"}>
                            {l.sucesso ? "sim" : "não"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-destructive">{l.erro_msg ?? ""}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {(historico.data ?? []).length >= limiteHistorico && (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historico.isFetching}
                    onClick={() => setLimiteHistorico((n) => n + 50)}
                  >
                    Ver mais 50
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
