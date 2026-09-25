import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { fmtBRL, fmtCompetencia, fmtData } from "./fmt";

type Res = Record<string, any>;

async function rpc(nome: string, args: Record<string, unknown>): Promise<Res> {
  const { data, error } = await (supabase as any).rpc(nome, args);
  if (error) throw new Error(formatError(error));
  return (data ?? {}) as Res;
}

/* ---------------- Fechar competência ---------------- */
export function FecharCompetenciaBotao({ competencia }: { competencia: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [rodando, setRodando] = useState(false);

  async function executar() {
    setRodando(true);
    try {
      const r = await rpc("fn_comissao_extrato_fechar", { p_competencia: competencia });
      if (r.ok === false) throw new Error(r.erro ?? JSON.stringify(r));
      toast.success(
        `Competência ${fmtCompetencia(competencia)} fechada: ${Number(r.extratos_fechados ?? 0)} extrato(s), ${fmtBRL(r.valor_total)}`,
        { description: `${Number(r.ja_fechados_ignorados ?? 0)} já fechado(s) ignorado(s)` },
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["comissao-extrato"] }),
        qc.invalidateQueries({ queryKey: ["comissao-extratos-fechados"] }),
      ]);
      setAberto(false);
    } catch (e) {
      toast.error(`Falha ao fechar competência: ${formatError(e)}`);
    } finally {
      setRodando(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}><Lock className="h-4 w-4" />Fechar competência</Button>
      <Dialog open={aberto} onOpenChange={(o) => !rodando && setAberto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar competência {fmtCompetencia(competencia)}?</DialogTitle>
            <DialogDescription>
              Fechar congela o extrato desta competência. Valores já liberados viram um extrato imutável por representante.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={rodando}>Cancelar</Button>
            <Button onClick={executar} disabled={rodando}>
              {rodando && <Loader2 className="h-4 w-4 animate-spin" />}Fechar competência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- Extratos fechados (somente leitura) ----------------
   Enviar e-mail e gerar título a pagar vivem num único lugar:
   Representantes · Ciclo mensal. Aqui só se consulta o que já foi congelado. */
interface ExtratoFechado {
  id: string; vendedor_id: string; competencia: string; pagar_ate: string | null; valor_total: number;
  liberacoes: number; notas: number; cpr_id: string | null; cpr_em: string | null; representante: string;
  enviado_em: string | null; enviado_para: string | null;
}

export function ExtratosFechados() {
  const q = useQuery({
    queryKey: ["comissao-extratos-fechados"],
    queryFn: async (): Promise<ExtratoFechado[]> => {
      const { data, error } = await (supabase as any)
        .from("comissao_extrato")
        .select("id,vendedor_id,competencia,pagar_ate,valor_total,liberacoes,notas,cpr_id,cpr_em,enviado_em,enviado_para")
        .order("competencia", { ascending: false });
      if (error) throw error;
      const linhas = (data ?? []) as Omit<ExtratoFechado, "representante">[];
      const ids = [...new Set(linhas.map((l) => l.vendedor_id))];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const v = await (supabase as any).from("vendedores").select("id,nome_exibicao").in("id", ids);
        if (v.error) throw v.error;
        for (const x of v.data ?? []) nomes.set(x.id, x.nome_exibicao);
      }
      return linhas.map((l) => ({ ...l, representante: nomes.get(l.vendedor_id) ?? "(sem nome)" }));
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Extratos fechados</CardTitle>
        <Link className="text-sm text-gold underline" to="/comercial/representantes?aba=ciclo">
          Operar o ciclo do mês → Representantes · Ciclo mensal
        </Link>
      </CardHeader>
      <CardContent>
        {q.isError ? (
          <Alert variant="destructive"><AlertDescription>Falha ao carregar extratos fechados: {formatError(q.error)}</AlertDescription></Alert>
        ) : q.isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (q.data ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma competência fechada ainda.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Representante</TableHead><TableHead>Competência</TableHead>
              <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Liberações</TableHead>
              <TableHead className="text-right">Notas</TableHead><TableHead>Pagar até</TableHead><TableHead>Título a pagar</TableHead><TableHead>E-mail</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    <Link className="hover:underline" to={`/comercial/representantes/${l.vendedor_id}`}>{l.representante}</Link>
                  </TableCell>
                  <TableCell>{fmtCompetencia(l.competencia)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtBRL(l.valor_total)}</TableCell>
                  <TableCell className="text-right">{Number(l.liberacoes ?? 0)}</TableCell>
                  <TableCell className="text-right">{Number(l.notas ?? 0)}</TableCell>
                  <TableCell>{fmtData(l.pagar_ate)}</TableCell>
                  <TableCell>
                    {l.cpr_id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="bg-success/15 text-success border-success/30">Título gerado</Badge>
                        <Link className="underline" to="/administrativo/contas-pagar" title={`Lançamento ${l.cpr_id}`}>
                          Ver em contas a pagar
                        </Link>
                        <span className="text-muted-foreground">{fmtData(l.cpr_em)}</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.enviado_em ? `Enviado em ${fmtData(l.enviado_em)} para ${l.enviado_para}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
