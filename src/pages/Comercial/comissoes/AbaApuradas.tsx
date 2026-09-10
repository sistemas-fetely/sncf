import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertTriangle, Loader2, Unlock } from "lucide-react";
import { fmtBRL, fmtCompetencia, fmtData, fmtPP, fmtPct } from "./fmt";

interface Posicao {
  apuracao_id: string;
  competencia: string | null;
  status: string | null;
  representante: string | null;
  nf_numero: string | null;
  pedido: string | null;
  base_total: number | null;
  desconto_pct: number | null;
  ajuste_pp: number | null;
  valor_devido: number | null;
  liberado: number | null;
  pendente: number | null;
  parcelas: number | null;
  parcelas_pagas: number | null;
  proximo_vencimento: string | null;
  vencidas: number | null;
}

interface LinhaDetalhe {
  id: string;
  linha: string | null;
  base: number | null;
  pct_base: number | null;
  ajuste_pp: number | null;
  pct_efetivo: number | null;
  valor: number | null;
}

export function AbaApuradas() {
  const qc = useQueryClient();
  const [liberando, setLiberando] = useState(false);
  const [aberta, setAberta] = useState<Posicao | null>(null);

  const q = useQuery({
    queryKey: ["comissao-posicao"],
    queryFn: async (): Promise<Posicao[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_comissao_posicao")
        .select("*")
        .order("competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Posicao[];
    },
  });

  const detalhe = useQuery({
    queryKey: ["comissao-apuracao-linha", aberta?.apuracao_id],
    enabled: !!aberta?.apuracao_id,
    queryFn: async (): Promise<LinhaDetalhe[]> => {
      const { data, error } = await (supabase as any)
        .from("comissao_apuracao_linha")
        .select("id, linha, base, pct_base, ajuste_pp, pct_efetivo, valor")
        .eq("apuracao_id", aberta!.apuracao_id)
        .order("linha");
      if (error) throw error;
      return (data ?? []) as LinhaDetalhe[];
    },
  });

  async function liberar() {
    setLiberando(true);
    try {
      const { data, error } = await (supabase as any).rpc("fn_comissao_liberar_pendentes");
      if (error) throw error;
      const r = (data ?? {}) as Record<string, unknown>;
      const qtd = Number(r.liberacoes ?? 0);
      const valor = Number(r.valor_liberado ?? 0);
      if (qtd === 0) {
        toast.info("Nenhuma parcela nova liquidada — nada a liberar.");
      } else {
        toast.success(`${qtd} liberação(ões) registrada(s) · ${fmtBRL(valor)}`);
      }
      await qc.invalidateQueries({ queryKey: ["comissao-posicao"] });
      await qc.invalidateQueries({ queryKey: ["comissao-extrato"] });
    } catch (e) {
      toast.error(`Falha ao liberar: ${(e as Error).message}`);
    } finally {
      setLiberando(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Comissões apuradas</CardTitle>
            <p className="text-xs text-muted-foreground">
              O representante só adquire direito quando o cliente paga — por isso apurado e liberado
              são números diferentes. Valor apurado é imutável; correção futura será por estorno.
            </p>
          </div>
          <Button onClick={liberar} disabled={liberando}>
            {liberando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
            Liberar liquidadas
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {q.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Falha ao carregar: {(q.error as Error).message}</AlertDescription>
            </Alert>
          )}

          {q.isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (q.data ?? []).length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma comissão apurada ainda. Use a aba “A apurar”.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Representante</TableHead>
                  <TableHead>NF</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead className="text-right">Ajuste</TableHead>
                  <TableHead className="text-right">Valor devido</TableHead>
                  <TableHead className="text-right">Liberado</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">Parcelas</TableHead>
                  <TableHead>Próx. vencimento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data ?? []).map((p) => {
                  const vencidas = Number(p.vencidas ?? 0);
                  return (
                    <TableRow
                      key={p.apuracao_id}
                      onClick={() => setAberta(p)}
                      className={`cursor-pointer ${vencidas > 0 ? "bg-destructive/5" : ""}`}
                    >
                      <TableCell className="font-medium">{p.representante ?? "—"}</TableCell>
                      <TableCell>{p.nf_numero ?? "—"}</TableCell>
                      <TableCell>{p.pedido ?? "—"}</TableCell>
                      <TableCell>{fmtCompetencia(p.competencia)}</TableCell>
                      <TableCell className="text-right">{fmtBRL(p.base_total)}</TableCell>
                      <TableCell className="text-right">{fmtPct(p.desconto_pct)}</TableCell>
                      <TableCell className="text-right">{fmtPP(p.ajuste_pp)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtBRL(p.valor_devido)}</TableCell>
                      <TableCell className="text-right">{fmtBRL(p.liberado)}</TableCell>
                      <TableCell className="text-right">{fmtBRL(p.pendente)}</TableCell>
                      <TableCell className="text-right">
                        {Number(p.parcelas_pagas ?? 0)}/{Number(p.parcelas ?? 0)}
                      </TableCell>
                      <TableCell>
                        {fmtData(p.proximo_vencimento)}
                        {vencidas > 0 && (
                          <span className="ml-1 text-xs text-destructive">
                            · {vencidas} vencida(s)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={vencidas > 0 ? "destructive" : "secondary"}>
                          {p.status ?? "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>NF {aberta?.nf_numero ?? "—"}</SheetTitle>
            <SheetDescription>
              {aberta?.representante ?? "—"} · devido {fmtBRL(aberta?.valor_devido)} · liberado{" "}
              {fmtBRL(aberta?.liberado)}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {detalhe.isError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{(detalhe.error as Error).message}</AlertDescription>
              </Alert>
            ) : detalhe.isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (detalhe.data ?? []).length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Sem linhas de produto nesta apuração.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">% base</TableHead>
                    <TableHead className="text-right">Ajuste</TableHead>
                    <TableHead className="text-right">% efetivo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detalhe.data ?? []).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.linha ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmtBRL(l.base)}</TableCell>
                      <TableCell className="text-right">{fmtPct(l.pct_base)}</TableCell>
                      <TableCell className="text-right">{fmtPP(l.ajuste_pp)}</TableCell>
                      <TableCell className="text-right">{fmtPct(l.pct_efetivo)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtBRL(l.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
