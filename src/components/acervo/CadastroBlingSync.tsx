import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { fmtDataHora } from "@/lib/data";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
const sb = supabase as unknown as SupabaseClient;
type Resumo = { total: number; lidos: number; restantes: number; produtos_divergentes: number; campos_divergentes: number; sem_vinculo: number; sem_peso: number; sem_dimensao: number; erros: number; pendentes: number; por_campo: Record<string, number> };
class ErroChamada extends Error { constructor(m: string, public status?: number) { super(m); } }
async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("bling-produto-sync", { body });
  if (error) {
    const ctx = error.context instanceof Response ? error.context : null;
    const r = ctx ? await ctx.clone().json().catch(() => null) : null;
    throw new ErroChamada(r?.erro ?? formatError(error), ctx?.status);
  }
  if (!data?.ok) throw new Error(data?.erro ?? "Falha na comparação.");
  return data;
}
/** Controle compacto do motor Bling: estado da última leitura + Comparar / Continuar / Enviar. Sem tabela. */
export function BlingSyncControle() {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false), [erro, setErro] = useState<string | null>(null), [confirmar, setConfirmar] = useState(false);
  const [fase, setFase] = useState<null | "comparando" | "enviando">(null), [pendentesInicio, setPendentesInicio] = useState<number | null>(null);
  const [progresso, setProgresso] = useState<Resumo | null>(null);
  const [verErros, setVerErros] = useState(false);
  const configQ = useQuery({ queryKey: ["bling-sync", "config"], queryFn: async () => { const r = await sb.from("bling_produto_sync_config").select("*").eq("id", true).single(); if (r.error) throw r.error; return r.data; } });
  const emMassaQ = useQuery({ queryKey: ["bling-sync", "campos-em-massa"], queryFn: async () => { const r = await sb.from("produto_campo_destino").select("campo,rotulo_tela").eq("sistema", "Bling").eq("ativo", true).eq("na_correcao", true).eq("sobrescreve", true).order("rotulo_tela"); if (r.error) throw r.error; return (r.data ?? []) as { campo: string; rotulo_tela: string | null }[]; } });
  const execQ = useQuery({ queryKey: ["bling-sync", "execucoes"], refetchInterval: ocupado ? 3000 : false, queryFn: async () => { const r = await sb.from("bling_produto_sync_execucao").select("*").order("criado_em", { ascending: false }).limit(1); if (r.error) throw r.error; return r.data; } });
  const execucao = execQ.data?.[0];
  const id: string = execucao?.id ?? "";
  const resumoQ = useQuery({ queryKey: ["bling-sync", "resumo", id], enabled: !!id, refetchInterval: ocupado ? 3000 : false, queryFn: async (): Promise<Resumo> => { const r = await sb.rpc("fn_bling_produto_sync_resumo", { p_execucao: id }); if (r.error) throw r.error; return r.data; } });
  const errosQ = useQuery({ queryKey: ["bling-sync", "erros", id], enabled: verErros && !!id, queryFn: async () => { const r = await sb.from("bling_produto_sync_produto").select("sku,erro").eq("execucao_id", id).eq("status", "erro").order("sku"); if (r.error) throw r.error; return (r.data ?? []) as { sku: string; erro: string | null }[]; } });
  async function executar(acao: "diff" | "aplicar", continuar = false) {
    if (acao === "aplicar") { setPendentesInicio(resumo?.pendentes ?? null); toast.info("Envio ao Bling iniciado — acompanhe o progresso na tela."); }
    setFase(acao === "diff" ? "comparando" : "enviando");
    setOcupado(true); setErro(null); setProgresso(null); setConfirmar(false);
    let atual: string | undefined = continuar || acao === "aplicar" ? id : undefined;
    try {
      if (acao === "diff") {
        // Uma chamada; a continuação roda em segundo plano na própria função. Aqui só acompanha.
        let concluido = false;
        try {
          const r = await chamar({ acao, ...(atual ? { execucao_id: atual } : {}) });
          atual = r.execucao_id; setProgresso(r.resumo); concluido = r.concluido;
        } catch (e) {
          if (!(e instanceof ErroChamada && e.status === 409)) throw e;
          toast.info("A comparação já está rodando em segundo plano.");
        }
        if (!concluido) {
          if (!atual) throw new Error("Comparação em andamento sem execução identificada; recarregue a página.");
          let ultimoLido = "", marco = Date.now();
          for (;;) {
            await new Promise((res) => setTimeout(res, 3000));
            const [ex, lido] = await Promise.all([
              sb.from("bling_produto_sync_execucao").select("status").eq("id", atual).single(),
              sb.from("bling_produto_sync_produto").select("lido_em").eq("execucao_id", atual).not("lido_em", "is", null).order("lido_em", { ascending: false }).limit(1).maybeSingle(),
            ]);
            if (ex.error) throw ex.error; if (lido.error) throw lido.error;
            if (ex.data?.status !== "comparando") break;
            const l = lido.data?.lido_em ?? "";
            if (l !== ultimoLido) { ultimoLido = l; marco = Date.now(); }
            else if (Date.now() - marco > 120000) throw new Error("Comparação parou; use Continuar comparação.");
            await qc.invalidateQueries({ queryKey: ["bling-sync"] });
          }
        }
        setProgresso(null);
        toast.success("Comparação concluída.");
        return;
      }
      let concluido = false;
      while (!concluido) {
        const r = await chamar({ acao, ...(atual ? { execucao_id: atual } : {}) });
        atual = r.execucao_id; setProgresso(r.resumo); concluido = r.concluido;
        await qc.invalidateQueries({ queryKey: ["bling-sync"] });
      }
      toast.success("Envio ao Bling concluído.");
    } catch (e) { const mensagem = formatError(e); setErro(mensagem); toast.error(mensagem); }
    finally { setOcupado(false); setFase(null); setPendentesInicio(null); await Promise.all([qc.invalidateQueries({ queryKey: ["bling-sync"] }), qc.invalidateQueries({ queryKey: ["conciliacao-fila"] })]); }
  }
  const resumo = progresso ?? resumoQ.data;
  const falha = erro ?? [configQ.error, execQ.error, resumoQ.error].filter(Boolean).map(formatError).join(" · ");
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {ocupado && <Loader2 className="mr-1 inline size-4 animate-spin" />}
        {execucao ? <>Última leitura do Bling: {fmtDataHora(execucao.criado_em)} · {resumo?.lidos ?? 0}/{resumo?.total ?? "—"} produtos</> : "Nenhuma leitura do Bling registrada."}
        {!!resumo?.sem_vinculo && <> · {resumo.sem_vinculo} sem vínculo</>}
        {!!resumo?.erros && <> · <button type="button" className="text-destructive underline-offset-2 hover:underline" onClick={() => setVerErros(true)}>{resumo.erros} erros</button></>}
        {configQ.data && !configQ.data.escrita_habilitada && <> · Envio desligado</>}
      </p>
      <div className="flex flex-wrap gap-2">
        <BotaoGuardado slug="acao.varrer_bling" rotuloAcao="Comparar com o Bling" size="sm" disabled={ocupado} onClick={() => void executar("diff")}><RefreshCw className={ocupado ? "animate-spin" : ""} />Comparar com o Bling</BotaoGuardado>
        {execucao?.status === "comparando" && <BotaoGuardado slug="acao.varrer_bling" rotuloAcao="Comparar com o Bling" size="sm" variant="outline" disabled={ocupado} onClick={() => void executar("diff", true)}>Continuar comparação</BotaoGuardado>}
        <BotaoGuardado slug="acao.produto_corrigir_externo" rotuloAcao="Enviar ao Bling (em massa)" title="Envia ao Bling os campos marcados para envio em massa de todos os produtos pendentes da última comparação." size="sm" variant="outline" disabled={ocupado || !configQ.data?.escrita_habilitada || !resumo?.pendentes || execucao?.status === "comparando"} onClick={() => setConfirmar(true)}><Send />Enviar ao Bling (em massa)</BotaoGuardado>
      </div>
    </div>
    {fase && (() => {
      const comparando = fase === "comparando";
      const total = comparando ? (resumo?.total ?? 0) : (pendentesInicio ?? 0);
      const feito = comparando ? (resumo?.lidos ?? 0) : Math.max(0, total - (resumo?.pendentes ?? total));
      const pct = total > 0 ? Math.min(100, Math.round((feito / total) * 100)) : null;
      return <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{comparando ? `Comparando com o Bling… ${feito}/${total || "—"} produtos` : pct === null ? "Enviando ao Bling…" : `Enviando ao Bling… ${feito}/${total}`}</p>
        <div className="h-1.5 overflow-hidden rounded bg-muted">{pct === null ? <div className="h-full w-full animate-pulse bg-primary/60" /> : <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />}</div>
      </div>;
    })()}
    {falha && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{falha}</p>}
    <AlertDialog open={confirmar} onOpenChange={setConfirmar}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Enviar em massa ao Bling?</AlertDialogTitle><AlertDialogDescription asChild><div className="space-y-2">
      <p>{resumo?.produtos_divergentes} produtos · {resumo?.pendentes} campos pendentes.</p>
      <p>Vão só os campos marcados para envio em massa{emMassaQ.data ? <>: <span className="text-foreground">{[...emMassaQ.data.map((c) => c.rotulo_tela || c.campo), "Origem fiscal (regra fiscal fixa)"].join(", ")}</span></> : "…"}. Os demais ficam para correção produto a produto.</p>
      {emMassaQ.error && <p role="alert" className="text-destructive">{formatError(emMassaQ.error)}</p>}
    </div></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><Button disabled={!emMassaQ.data} onClick={() => void executar("aplicar")}>Enviar em massa</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={verErros} onOpenChange={setVerErros}><DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Erros da última leitura do Bling</DialogTitle></DialogHeader>
      {errosQ.error ? <p role="alert" className="text-sm text-destructive">{formatError(errosQ.error)}</p>
        : errosQ.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : <Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader><TableBody>
          {(errosQ.data ?? []).map(e => <TableRow key={e.sku}><TableCell className="font-mono text-xs">{e.sku}</TableCell><TableCell className="whitespace-normal break-words text-sm">{e.erro ?? "—"}</TableCell></TableRow>)}
        </TableBody></Table>}
    </DialogContent></Dialog>
  </div>;
}
export const CadastroBlingSync = BlingSyncControle;
