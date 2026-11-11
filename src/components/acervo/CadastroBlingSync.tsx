import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useEstadoTela } from "@/lib/navegacao";
import { formatError } from "@/lib/format-error";
import { CodProduto } from "@/components/produto/CodProduto";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
const sb = supabase as unknown as SupabaseClient;
type Resumo = { total: number; lidos: number; restantes: number; produtos_divergentes: number; campos_divergentes: number; sem_vinculo: number; sem_peso: number; sem_dimensao: number; erros: number; pendentes: number; por_campo: Record<string, number> };
const exibir = (v: unknown) => v == null ? "—" : String(v);
async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("bling-produto-sync", { body });
  if (error) {
    const r = error.context instanceof Response ? await error.context.clone().json().catch(() => null) : null;
    throw new Error(r?.erro ?? formatError(error));
  }
  if (!data?.ok) throw new Error(data?.erro ?? "Falha na comparação.");
  return data;
}
export function CadastroBlingSync() {
  const [estado, setEstado] = useEstadoTela({ execucao: "", busca: "", lista: "divergencias", pagina: 1 }, { prefixo: "bs" });
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false), [erro, setErro] = useState<string | null>(null), [confirmar, setConfirmar] = useState(false);
  const [progresso, setProgresso] = useState<Resumo | null>(null);
  const configQ = useQuery({ queryKey: ["bling-sync", "config"], queryFn: async () => { const r = await sb.from("bling_produto_sync_config").select("*").eq("id", true).single(); if (r.error) throw r.error; return r.data; } });
  const execQ = useQuery({ queryKey: ["bling-sync", "execucoes"], refetchInterval: ocupado ? 3000 : false, queryFn: async () => { const r = await sb.from("bling_produto_sync_execucao").select("*").order("criado_em", { ascending: false }).limit(30); if (r.error) throw r.error; return r.data; } });
  const id = estado.execucao || execQ.data?.[0]?.id || "";
  const execucao = execQ.data?.find((e) => e.id === id);
  const resumoQ = useQuery({ queryKey: ["bling-sync", "resumo", id], enabled: !!id, refetchInterval: ocupado ? 3000 : false, queryFn: async (): Promise<Resumo> => { const r = await sb.rpc("fn_bling_produto_sync_resumo", { p_execucao: id }); if (r.error) throw r.error; return r.data; } });
  const listaQ = useQuery({ queryKey: ["bling-sync", "lista", id, estado.lista, estado.busca, estado.pagina], enabled: !!id, refetchInterval: ocupado ? 3000 : false, queryFn: async () => {
    const divergencias = estado.lista === "divergencias";
    let q = sb.from(divergencias ? "bling_produto_sync_item" : "bling_produto_sync_produto").select("*", { count: "exact" }).eq("execucao_id", id).order("sku");
    if (estado.lista === "sem_vinculo") q = q.eq("sem_vinculo", true);
    if (estado.lista === "sem_medidas") q = q.or("sem_peso.eq.true,sem_dimensao.eq.true");
    if (estado.lista === "erros") q = q.eq("status", "erro");
    if (estado.busca.trim()) q = q.ilike("sku", `%${estado.busca.trim()}%`);
    const inicio = (Math.max(1, estado.pagina) - 1) * 50;
    const r = await q.range(inicio, inicio + 49); if (r.error) throw r.error; return { linhas: r.data ?? [], total: r.count ?? 0 };
  } });
  async function executar(acao: "diff" | "aplicar", continuar = false) {
    setOcupado(true); setErro(null); setProgresso(null); setConfirmar(false);
    let atual: string | undefined = continuar || acao === "aplicar" ? id : undefined;
    try {
      let concluido = false;
      while (!concluido) {
        const r = await chamar({ acao, ...(atual ? { execucao_id: atual } : {}) });
        atual = r.execucao_id; setEstado({ execucao: atual ?? "", pagina: 1 }); setProgresso(r.resumo); concluido = r.concluido;
        await qc.invalidateQueries({ queryKey: ["bling-sync"] });
      }
      toast.success(acao === "diff" ? "Comparação concluída." : "Envio concluído.");
    } catch (e) { const mensagem = formatError(e); setErro(mensagem); toast.error(mensagem); }
    finally { setOcupado(false); await qc.invalidateQueries({ queryKey: ["bling-sync"] }); }
  }
  const resumo = progresso ?? resumoQ.data;
  const resolucaoQ = useQuery({ queryKey: ["bling-sync", "resolucao", id], enabled: !!id, refetchInterval: ocupado ? 3000 : false, queryFn: async () => { const r = await sb.from("bling_produto_sync_produto").select("status,fonte").eq("execucao_id", id); if (r.error) throw r.error; return { comparados: (r.data ?? []).filter((p) => p.status === "comparado").length, desatualizados: (r.data ?? []).filter((p) => p.fonte?.resolucao_bling?.id_desatualizado).length }; } });
  const falha = erro ?? [configQ.error, execQ.error, resumoQ.error, listaQ.error].filter(Boolean).map(formatError).join(" · ");
  const paginaMax = Math.max(1, Math.ceil((listaQ.data?.total ?? 0) / 50));
  return <section className="space-y-4 border-b border-border pb-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Cadastro no Bling</h2><div className="flex flex-wrap gap-2">
      <BotaoGuardado slug="acao.varrer_bling" rotuloAcao="Comparar com o Bling" disabled={ocupado} onClick={() => void executar("diff")}><RefreshCw className={ocupado ? "animate-spin" : ""} />Comparar com o Bling</BotaoGuardado>
      {execucao?.status === "comparando" && <BotaoGuardado slug="acao.varrer_bling" rotuloAcao="Comparar com o Bling" variant="outline" disabled={ocupado} onClick={() => void executar("diff", true)}>Continuar comparação</BotaoGuardado>}
      <BotaoGuardado slug="acao.produto_corrigir_externo" rotuloAcao="Enviar ao Bling" variant="outline" disabled={ocupado || !configQ.data?.escrita_habilitada || !resumo?.pendentes || execucao?.status === "comparando"} onClick={() => setConfirmar(true)}><Send />Enviar ao Bling</BotaoGuardado>
    </div></div>
    <p className="text-sm text-muted-foreground">Envio {configQ.data?.escrita_habilitada ? "habilitado" : "desligado"} · Automação {configQ.data?.automatico_habilitado ? "habilitada" : "desligada"}</p>
    {resolucaoQ.data && <p className="text-sm text-muted-foreground">{resolucaoQ.data.comparados} comparados · {resolucaoQ.data.desatualizados} IDs desatualizados em Produtos</p>}
    {resolucaoQ.error && <p role="alert" className="text-sm text-destructive">{formatError(resolucaoQ.error)}</p>}
    {falha && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{falha}</p>}
    {ocupado && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{resumo?.lidos ?? 0} / {resumo?.total ?? "—"} produtos · {resumo?.restantes ?? "—"} restantes</p>}
    {resumo && <><div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-3 text-sm"><span><strong>{resumo.produtos_divergentes}</strong> produtos divergentes</span><span><strong>{resumo.campos_divergentes}</strong> campos</span><span><strong>{resumo.sem_vinculo}</strong> sem vínculo</span><span><strong>{resumo.sem_peso}</strong> sem peso</span><span><strong>{resumo.sem_dimensao}</strong> sem dimensão</span><span className={resumo.erros ? "text-destructive" : "text-muted-foreground"}>{resumo.erros} erros</span></div>
      <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">{Object.entries(resumo.por_campo).map(([campo,n]) => <div key={campo} className="flex justify-between gap-2 border-b border-border py-2"><dt className="break-words">{campo}</dt><dd className="font-semibold tabular-nums">{n}</dd></div>)}</dl></>}
    <div className="flex flex-wrap gap-2"><Select value={id || undefined} onValueChange={(execucao) => setEstado({ execucao, pagina: 1 })}><SelectTrigger className="w-64"><SelectValue placeholder="Comparações" /></SelectTrigger><SelectContent>{execQ.data?.map((e) => <SelectItem key={e.id} value={e.id}>{new Date(e.criado_em).toLocaleString("pt-BR")} · {e.status}</SelectItem>)}</SelectContent></Select>
      <Select value={estado.lista} onValueChange={(lista) => setEstado({ lista, pagina: 1 })}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="divergencias">De-para</SelectItem><SelectItem value="sem_vinculo">Sem vínculo no Bling</SelectItem><SelectItem value="sem_medidas">Sem peso ou dimensão</SelectItem><SelectItem value="erros">Erros por produto</SelectItem></SelectContent></Select>
      <Input className="w-56" aria-label="Buscar SKU" placeholder="Buscar SKU" value={estado.busca} onChange={(e) => setEstado({ busca: e.target.value, pagina: 1 })} />
    </div>
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Campo</TableHead><TableHead>Bling atual</TableHead><TableHead>SNCF</TableHead><TableHead>Status / pendência</TableHead></TableRow></TableHeader><TableBody>
      {listaQ.data?.linhas.map((l) => <TableRow key={l.id ?? l.sku} data-foco-id={l.sku}><TableCell><CodProduto chave={l.sku} /></TableCell><TableCell>{l.campo ?? "—"}</TableCell><TableCell className="max-w-64 break-all">{exibir(l.valor_bling)}</TableCell><TableCell className="max-w-64 break-all">{exibir(l.valor_sncf)}</TableCell><TableCell className="max-w-80 whitespace-normal break-words"><span className={l.erro ? "text-destructive" : "text-muted-foreground"}>{l.erro ?? ([l.sem_vinculo && "Sem vínculo", l.sem_peso && "Sem peso", l.sem_dimensao && "Sem dimensão"].filter(Boolean).join(" · ") || l.status)}</span></TableCell></TableRow>)}
      {!listaQ.isLoading && !listaQ.error && !listaQ.data?.linhas.length && <TableRow><TableCell colSpan={5} className="text-muted-foreground">{id ? "Nenhum item nesta lista." : "Nenhuma comparação registrada."}</TableCell></TableRow>}
    </TableBody></Table></div>
    <div className="flex items-center justify-end gap-3"><Button variant="outline" size="icon" aria-label="Página anterior" disabled={estado.pagina <= 1} onClick={() => setEstado({ pagina: estado.pagina - 1 })}><ArrowLeft /></Button><span className="text-sm tabular-nums">{estado.pagina} / {paginaMax}</span><Button variant="outline" size="icon" aria-label="Próxima página" disabled={estado.pagina >= paginaMax} onClick={() => setEstado({ pagina: estado.pagina + 1 })}><ArrowRight /></Button></div>
    <AlertDialog open={confirmar} onOpenChange={setConfirmar}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Enviar cadastro ao Bling?</AlertDialogTitle><AlertDialogDescription>{resumo?.produtos_divergentes} produtos · {resumo?.pendentes} campos pendentes.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><Button onClick={() => void executar("aplicar")}>Enviar ao Bling</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}