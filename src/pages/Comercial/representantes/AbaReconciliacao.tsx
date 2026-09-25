import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, RefreshCw, SearchCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fmtBRL, fmtData } from "../comissoes/fmt";

type Mudanca = { pedido: string | null; de: string; para: string; valor: number | null };
type Resultado = {
  ok: boolean;
  simulacao: boolean;
  recebidos: number;
  corrigidos: number;
  ja_corretos: number;
  bloqueados_com_apuracao: number;
  bloqueados: Mudanca[];
  vendedor_sem_espelho: number;
  mudancas: Mudanca[];
  erros: { pedido: string | null; erro: string }[];
};

async function chamarEdge(simular: boolean): Promise<Resultado> {
  const { data, error } = await supabase.functions.invoke("sync-pedido-vendedor", {
    body: simular ? { simular: true } : {},
  });
  if (error) {
    let detalhe = formatError(error);
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) { const b = await ctx.json(); if (b?.erro) detalhe = b.erro; }
    } catch { /* mantém a mensagem original */ }
    throw new Error(detalhe);
  }
  if (!data || typeof data !== "object") throw new Error("A verificação não devolveu resultado.");
  return data as Resultado;
}

const cab = "sticky top-0 z-10 whitespace-nowrap bg-muted";

export function AbaReconciliacao() {
  const qc = useQueryClient();
  const [verificando, setVerificando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [sim, setSim] = useState<Resultado | null>(null);

  const bloqQ = useQuery({
    queryKey: ["pedido-vendedor-divergencia-aberta"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_vendedor_divergencia")
        .select("id,fop_vendedor_nome,motivo_bloqueio,detectada_em,pedido:pedidos(id_externo,valor_bruto),atual:vendedores!pedido_vendedor_divergencia_vendedor_sncf_id_fkey(nome_exibicao),fop:vendedores!pedido_vendedor_divergencia_vendedor_fop_id_fkey(nome_exibicao)")
        .is("resolvida_em", null)
        .order("detectada_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string; fop_vendedor_nome: string | null; motivo_bloqueio: string | null;
        pedido: { id_externo: string | null; valor_bruto: number | null } | null;
        atual: { nome_exibicao: string | null } | null; fop: { nome_exibicao: string | null } | null;
      }[];
    },
  });

  const logQ = useQuery({
    queryKey: ["pedido-vendedor-correcao-log"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_vendedor_correcao_log")
        .select("id,id_externo,vendedor_antes,vendedor_depois,valor_pedido,corrigido_em")
        .order("corrigido_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as {
        id: string; id_externo: string | null; vendedor_antes: string | null;
        vendedor_depois: string | null; valor_pedido: number | null; corrigido_em: string;
      }[];
    },
  });

  async function verificar() {
    setVerificando(true);
    try {
      setSim(await chamarEdge(true));
    } catch (e) {
      toast.error(`Falha ao verificar divergências: ${formatError(e)}`);
    } finally {
      setVerificando(false);
    }
  }

  async function aplicar() {
    setAplicando(true);
    try {
      const r = await chamarEdge(false);
      const partes = [`${r.corrigidos} corrigidos`, `${r.ja_corretos} já corretos`, `${r.bloqueados_com_apuracao} bloqueados`];
      if (r.erros?.length) {
        toast.warning(partes.join(" · "), { description: `${r.erros.length} com erro: ${r.erros.slice(0, 3).map((e) => `${e.pedido ?? "?"}: ${e.erro}`).join(" | ")}` });
      } else {
        toast.success(partes.join(" · "));
      }
      setConfirmar(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pedido-vendedor-divergencia-aberta"] }),
        qc.invalidateQueries({ queryKey: ["pedido-vendedor-correcao-log"] }),
        qc.invalidateQueries({ queryKey: ["representante-kpi"] }),
      ]);
      setSim(await chamarEdge(true));
    } catch (e) {
      toast.error(`Falha ao aplicar correções: ${formatError(e)}`);
    } finally {
      setAplicando(false);
    }
  }

  const mudancas = sim?.mudancas ?? [];
  const totalValor = mudancas.reduce((s, m) => s + Number(m.valor ?? 0), 0);
  const bloqueados = bloqQ.data ?? [];
  const semNada = sim != null && mudancas.length === 0 && (sim.bloqueados?.length ?? 0) === 0 && bloqueados.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={verificar} disabled={verificando || aplicando}>
          <SearchCheck className={cn("h-4 w-4 mr-1", verificando && "animate-pulse")} />
          {verificando ? "Verificando…" : "Verificar divergências"}
        </Button>
        {mudancas.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setConfirmar(true)} disabled={aplicando || verificando}>
            <RefreshCw className={cn("h-4 w-4 mr-1", aplicando && "animate-spin")} />
            Aplicar correções
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          Compara o vendedor de cada pedido no SNCF com o representante corrigido no FOP.
        </span>
      </div>

      {sim && (
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["Serão corrigidos", sim.corrigidos],
            ["Já estão corretos", sim.ja_corretos],
            ["Bloqueados", sim.bloqueados_com_apuracao],
          ] as const).map(([l, v]) => (
            <Card key={l}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className="mt-1 text-lg font-medium tabular-nums">{v}</div>
            </CardContent></Card>
          ))}
        </div>
      )}
      {sim && (sim.vendedor_sem_espelho > 0 || sim.erros?.length > 0) && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning">
          {sim.erros.length} pedido(s) não puderam ser avaliados
          {sim.vendedor_sem_espelho > 0 && ` (${sim.vendedor_sem_espelho} com vendedor do FOP não espelhado no SNCF)`}:{" "}
          {sim.erros.slice(0, 5).map((e) => `${e.pedido ?? "?"} — ${e.erro}`).join(" · ")}
        </div>
      )}

      {semNada ? (
        <div className="rounded-md border bg-card py-10 text-center text-sm text-muted-foreground">
          Nenhuma divergência entre SNCF e FOP.
        </div>
      ) : mudancas.length > 0 && (
        <Card><CardContent className="p-0">
          <Table containerClassName="max-h-[min(60vh,40rem)]">
            <TableHeader><TableRow>
              <TableHead className={cab}>Pedido</TableHead>
              <TableHead className={cab}>De (SNCF)</TableHead>
              <TableHead className={cab}>Para (FOP)</TableHead>
              <TableHead className={cn(cab, "text-right")}>Valor do pedido</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {mudancas.map((m, i) => (
                <TableRow key={`${m.pedido}-${i}`}>
                  <TableCell className="font-mono">{m.pedido ?? "—"}</TableCell>
                  <TableCell>{m.de}</TableCell>
                  <TableCell className="font-medium">{m.para}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBRL(m.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Bloqueados — exigem decisão</h3>
        <p className="text-xs text-muted-foreground">
          Estes pedidos já têm comissão apurada. Trocar o vendedor agora exigiria estornar a apuração atual e reapurar para o novo representante — por isso o sistema não faz sozinho.
        </p>
        {bloqQ.isError ? (
          <p className="text-sm text-destructive">Falha ao carregar bloqueados: {formatError(bloqQ.error)}</p>
        ) : bloqQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : bloqueados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido bloqueado.</p>
        ) : (
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead className={cab}>Pedido</TableHead>
                <TableHead className={cab}>Vendedor atual</TableHead>
                <TableHead className={cab}>Vendedor no FOP</TableHead>
                <TableHead className={cab}>Motivo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {bloqueados.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono whitespace-nowrap">{b.pedido?.id_externo ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{b.atual?.nome_exibicao ?? "(sem vendedor)"}</TableCell>
                    <TableCell className="whitespace-nowrap">{b.fop?.nome_exibicao ?? b.fop_vendedor_nome ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.motivo_bloqueio ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )}
      </section>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 px-2">
            <ChevronDown className="h-4 w-4" />Histórico de correções ({logQ.data?.length ?? 0})
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {logQ.isError ? (
            <p className="text-sm text-destructive">Falha ao carregar histórico: {formatError(logQ.error)}</p>
          ) : (logQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma correção registrada ainda.</p>
          ) : (
            <Card><CardContent className="p-0">
              <Table containerClassName="max-h-[min(60vh,40rem)]">
                <TableHeader><TableRow>
                  <TableHead className={cab}>Pedido</TableHead>
                  <TableHead className={cab}>De</TableHead>
                  <TableHead className={cab}>Para</TableHead>
                  <TableHead className={cn(cab, "text-right")}>Valor</TableHead>
                  <TableHead className={cab}>Data</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(logQ.data ?? []).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono">{l.id_externo ?? "—"}</TableCell>
                      <TableCell>{l.vendedor_antes ?? "(sem vendedor)"}</TableCell>
                      <TableCell>{l.vendedor_depois ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(l.valor_pedido)}</TableCell>
                      <TableCell className="tabular-nums">{fmtData(l.corrigido_em)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={confirmar} onOpenChange={(o) => !aplicando && setConfirmar(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar correções de vendedor?</AlertDialogTitle>
            <AlertDialogDescription>
              {mudancas.length} pedido(s) terão o vendedor trocado para o representante do FOP, somando {fmtBRL(totalValor)}.
              Os pedidos com comissão já apurada não serão alterados — ficam em "Bloqueados".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={aplicando} onClick={(e) => { e.preventDefault(); void aplicar(); }}>
              {aplicando ? "Aplicando…" : "Aplicar correções"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
