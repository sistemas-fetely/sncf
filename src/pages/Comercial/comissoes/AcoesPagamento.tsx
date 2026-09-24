import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock, FileText, Mail } from "lucide-react";
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

/* ---------------- Extratos fechados + gerar CPR ---------------- */
interface ExtratoFechado {
  id: string; vendedor_id: string; competencia: string; pagar_ate: string | null; valor_total: number;
  liberacoes: number; notas: number; cpr_id: string | null; cpr_em: string | null; representante: string;
  enviado_em: string | null; enviado_para: string | null;
}

export function ExtratosFechados() {
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState<ExtratoFechado | null>(null);
  const [rodando, setRodando] = useState(false);
  const [falha, setFalha] = useState<{ erro: string; acao?: string; vendedor_id: string } | null>(null);
  const [enviar, setEnviar] = useState<ExtratoFechado | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviarEmail() {
    if (!enviar) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("enviar-extrato-comissao", { body: { extrato_id: enviar.id } });
      if (error) {
        let det = formatError(error);
        try { const t = await (error as any).context?.text?.(); if (t) det = JSON.parse(t).error ?? t; } catch { /* mantém */ }
        throw new Error(det);
      }
      if (!data?.ok) throw new Error(data?.error ?? JSON.stringify(data));
      toast.success(`Extrato enviado para ${data.enviado_para}`);
      await qc.invalidateQueries({ queryKey: ["comissao-extratos-fechados"] });
      setEnviar(null);
    } catch (e) {
      toast.error(`Falha ao enviar extrato: ${formatError(e)}`);
    } finally {
      setEnviando(false);
    }
  }

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

  async function gerar() {
    if (!confirmar) return;
    const alvo = confirmar;
    setRodando(true);
    try {
      const r = await rpc("fn_comissao_gerar_cpr", { p_extrato_id: alvo.id });
      if (r.ok !== true) {
        setConfirmar(null);
        setFalha({ erro: r.erro ?? JSON.stringify(r), acao: r.acao, vendedor_id: alvo.vendedor_id });
        return;
      }
      toast.success(`Título a pagar gerado: ${fmtBRL(r.valor ?? alvo.valor_total)}`, {
        description: `Vencimento ${fmtData(r.vencimento ?? r.data_vencimento ?? alvo.pagar_ate)}`,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["comissao-extratos-fechados"] }),
        qc.invalidateQueries({ queryKey: ["comissao-extrato"] }),
      ]);
      setConfirmar(null);
    } catch (e) {
      toast.error(`Falha ao gerar título: ${formatError(e)}`);
    } finally {
      setRodando(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Extratos fechados</CardTitle></CardHeader>
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
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setConfirmar(l)}>
                        <FileText className="h-4 w-4" />Gerar título a pagar
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1 text-xs">
                      {l.enviado_em && (
                        <span className="text-muted-foreground">Enviado em {fmtData(l.enviado_em)} para {l.enviado_para}</span>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setEnviar(l)}>
                        <Mail className="h-4 w-4" />{l.enviado_em ? "Reenviar" : "Enviar por e-mail"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!enviar} onOpenChange={(o) => !o && !enviando && setEnviar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{enviar?.enviado_em ? "Reenviar extrato por e-mail?" : "Enviar extrato por e-mail?"}</DialogTitle>
            <DialogDescription>
              {enviar && `${enviar.representante} · competência ${fmtCompetencia(enviar.competencia)} · ${fmtBRL(enviar.valor_total)}. Vai para o e-mail de contato cadastrado do representante.`}
              {enviar?.enviado_em && ` Já enviado em ${fmtData(enviar.enviado_em)} para ${enviar.enviado_para}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnviar(null)} disabled={enviando}>Cancelar</Button>
            <Button onClick={enviarEmail} disabled={enviando}>{enviando && <Loader2 className="h-4 w-4 animate-spin" />}{enviar?.enviado_em ? "Reenviar" : "Enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmar} onOpenChange={(o) => !o && !rodando && setConfirmar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar título a pagar?</DialogTitle>
            <DialogDescription>
              {confirmar && `${confirmar.representante} · competência ${fmtCompetencia(confirmar.competencia)} · ${fmtBRL(confirmar.valor_total)} · pagar até ${fmtData(confirmar.pagar_ate)}. O lançamento entra em contas a pagar.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(null)} disabled={rodando}>Cancelar</Button>
            <Button onClick={gerar} disabled={rodando}>{rodando && <Loader2 className="h-4 w-4 animate-spin" />}Gerar título</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!falha} onOpenChange={(o) => !o && setFalha(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>O título não foi gerado</DialogTitle></DialogHeader>
          <p className="text-sm text-destructive">{falha?.erro}</p>
          {falha?.acao && <p className="text-sm"><span className="font-medium">O que fazer: </span>{falha.acao}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFalha(null)}>Fechar</Button>
            {falha && <Button asChild><Link to={`/comercial/representantes/${falha.vendedor_id}`}>Abrir ficha do representante</Link></Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
