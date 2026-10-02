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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  fmtBRL, fmtCompetencia, fmtData, fmtJanelaRecebimento, fmtMesRecebimento,
  liberaFechamentoEm, podeFecharCompetencia,
} from "./fmt";

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
  const podeFechar = podeFecharCompetencia(competencia);

  async function executar() {
    setRodando(true);
    try {
      const r = await rpc("fn_comissao_extrato_fechar", { p_competencia: competencia });
      if (r.ok === false) throw new Error(r.erro ?? JSON.stringify(r));
      const complementares = Number(r.complementares ?? 0);
      toast.success(
        `Extrato de pagamento ${fmtCompetencia(competencia)} fechado: ${Number(r.extratos_fechados ?? 0)} extrato(s), ${fmtBRL(r.valor_total)}`,
        complementares > 0
          ? { description: `${complementares} extrato(s) complementar(es) de recebimentos que chegaram depois do fechamento` }
          : undefined,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["comissao-extrato"] }),
        qc.invalidateQueries({ queryKey: ["comissao-extratos-fechados"] }),
      ]);
      setAberto(false);
    } catch (e) {
      toast.error(`Falha ao fechar extrato de pagamento: ${formatError(e)}`);
    } finally {
      setRodando(false);
    }
  }

  return (
    <>
      {podeFechar ? (
        <Button variant="outline" onClick={() => setAberto(true)}>
          <Lock className="h-4 w-4" />Fechar extrato
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button variant="outline" disabled>
                <Lock className="h-4 w-4" />Fechar extrato
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Os recebimentos de {fmtMesRecebimento(competencia)} ainda estão correndo. Libera em{" "}
            {liberaFechamentoEm(competencia)}.
          </TooltipContent>
        </Tooltip>
      )}
      <Dialog open={aberto} onOpenChange={(o) => !rodando && setAberto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar extrato de pagamento {fmtCompetencia(competencia)}?</DialogTitle>
            <DialogDescription>
              Congela o extrato com tudo que os clientes pagaram de {fmtJanelaRecebimento(competencia)}. Valores já liberados viram um extrato imutável por representante.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={rodando}>Cancelar</Button>
            <Button onClick={executar} disabled={rodando}>
              {rodando && <Loader2 className="h-4 w-4 animate-spin" />}Fechar extrato
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
  id: string; vendedor_id: string; competencia: string; sequencia: number; pagar_ate: string | null; valor_total: number;
  liberacoes: number; notas: number; cpr_id: string | null; cpr_em: string | null; representante: string;
  enviado_em: string | null; enviado_para: string | null;
}

export function ExtratosFechados() {
  const q = useQuery({
    queryKey: ["comissao-extratos-fechados"],
    queryFn: async (): Promise<ExtratoFechado[]> => {
      const { data, error } = await (supabase as any)
        .from("comissao_extrato")
        .select("id,vendedor_id,competencia,sequencia,pagar_ate,valor_total,liberacoes,notas,cpr_id,cpr_em,enviado_em,enviado_para")
        .order("competencia", { ascending: false })
        .order("sequencia", { ascending: false });
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
              <TableHead>Representante</TableHead><TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Liberações</TableHead>
              <TableHead className="text-right">Notas</TableHead><TableHead>Pagar até</TableHead><TableHead>Título a pagar</TableHead><TableHead>E-mail</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    <Link className="hover:underline" to={`/comercial/representantes/${l.vendedor_id}`}>{l.representante}</Link>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span>{fmtCompetencia(l.competencia)}</span>
                        {Number(l.sequencia ?? 1) > 1 && (
                          <Badge variant="outline" className="bg-muted text-muted-foreground border-border/60">
                            complementar nº {l.sequencia}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        receb. {fmtJanelaRecebimento(l.competencia).replace(/\/\d{4}$/, "")}
                      </div>
                    </div>
                  </TableCell>
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
