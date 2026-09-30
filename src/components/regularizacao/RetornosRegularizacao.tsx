import { Fragment, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RegularizacaoStatus } from "./RegularizacaoStatus";
import { VincularRascunhoDialog } from "./VincularRascunhoDialog";
import type { RegularizacaoRetorno } from "./types";

async function gerar(id: string) {
  const { data, error } = await supabase.functions.invoke("regularizacao-gerar-rascunho", { body: { retorno_nf_id: id } });
  if (error) {
    const resposta = (error as { context?: unknown }).context;
    if (resposta instanceof Response) {
      const corpo = await resposta.clone().json().catch(() => null) as { erro?: string } | null;
      if (corpo?.erro) throw new Error(corpo.erro);
    }
    throw error;
  }
  if (!data?.ok) throw new Error(data?.erro ?? "Falha ao gerar rascunho.");
  return data;
}
export function RetornosRegularizacao({ retornos, podeEditar, recarregar }: { retornos: RegularizacaoRetorno[]; podeEditar: boolean; recarregar: () => Promise<unknown> }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set()); const [vincular, setVincular] = useState<string | null>(null); const [progresso, setProgresso] = useState("");
  const gerarUm = useMutation({ mutationFn: gerar, onSuccess: async (d) => { toast.success(`Rascunho ${d.numero ?? ""} criado.`); await recarregar(); }, onError: (e) => toast.error(rawMessage(e)) });
  const pendentes = retornos.filter((r) => r.status === "planejada" || r.status === "erro");
  const gerarTodos = async () => { for (let i = 0; i < pendentes.length; i += 1) { setProgresso(`${i + 1} de ${pendentes.length}`); try { await gerar(pendentes[i].id); await recarregar(); } catch (e) { toast.error(rawMessage(e)); setProgresso(""); return; } } setProgresso(""); toast.success("Todos os rascunhos pendentes foram criados."); };
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm"><span>O SNCF cria o rascunho (pendente). A Eva confere e transmite no Bling. Quando a NF é autorizada, ela aparece aqui sozinha.</span>{podeEditar && pendentes.length > 0 && <Button size="sm" onClick={() => void gerarTodos()} disabled={!!progresso || gerarUm.isPending}>{progresso ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{progresso}</> : "Gerar todos os pendentes"}</Button>}</div>
    <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead className="w-10" /><TableHead>NF de origem</TableHead><TableHead>Data</TableHead><TableHead>Chave</TableHead><TableHead>Linhas</TableHead><TableHead>Peças</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead>NF de retorno</TableHead>{podeEditar && <TableHead>Ações</TableHead>}</TableRow></TableHeader><TableBody>{retornos.map((r) => { const aberto = abertos.has(r.id); const acionavel = r.status === "planejada" || r.status === "erro"; return <Fragment key={r.id}><TableRow><TableCell><Button variant="ghost" size="icon" onClick={() => setAbertos((s) => { const n = new Set(s); aberto ? n.delete(r.id) : n.add(r.id); return n; })}>{aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button></TableCell><TableCell>{r.nf_origem_numero}</TableCell><TableCell>{formatDateBR(r.nf_origem_data)}</TableCell><TableCell><Button variant="ghost" size="sm" className="font-mono text-xs" onClick={() => void navigator.clipboard.writeText(r.nf_origem_chave).then(() => toast.success("Chave copiada."))}>{`${r.nf_origem_chave.slice(0, 8)}…${r.nf_origem_chave.slice(-6)}`}<Copy className="ml-2 h-3 w-3" /></Button></TableCell><TableCell>{r.linhas}</TableCell><TableCell>{r.pecas.toLocaleString("pt-BR")}</TableCell><TableCell>{formatBRL(r.valor)}</TableCell><TableCell><RegularizacaoStatus status={r.status} />{r.erro && <div className="mt-1 max-w-56 text-xs text-destructive">{r.erro}</div>}</TableCell><TableCell>{r.nf_retorno_numero ?? "—"}</TableCell>{podeEditar && <TableCell>{acionavel && <div className="flex gap-1"><Button size="sm" onClick={() => gerarUm.mutate(r.id)} disabled={gerarUm.isPending}>Gerar rascunho</Button><Button size="sm" variant="outline" onClick={() => setVincular(r.id)}>Vincular</Button></div>}</TableCell>}</TableRow>{aberto && <TableRow><TableCell /><TableCell colSpan={9}><div className="grid gap-1 py-2 text-xs">{r.itens?.map((i) => <div key={i.id} className="grid grid-cols-[minmax(140px,1fr)_80px_110px] gap-3"><span className="font-mono">{i.sku}</span><span>{i.quantidade.toLocaleString("pt-BR")} {i.unidade ?? "UN"}</span><span>{formatBRL(i.valor_unit_origem)}</span></div>)}</div></TableCell></TableRow>}</Fragment>; })}</TableBody></Table></div>
    {vincular && <VincularRascunhoDialog retornoId={vincular} aberto onOpenChange={(v) => { if (!v) setVincular(null); }} onSuccess={() => void recarregar()} />}
  </div>;
}
