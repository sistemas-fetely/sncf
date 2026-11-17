import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { CodProduto } from "@/components/produto/CodProduto";
import { formatError } from "@/lib/format-error";
import { podeGerarRetorno, retornoPendente, type DiferencaRetorno } from "./retornoEventoRegras";
import { exigirResultado, usePodeOperarRetorno, type RetornoEvento } from "./useRetornoEvento";

function CardRetorno({ retorno: r }: { retorno: RetornoEvento }) {
  const permissao = usePodeOperarRetorno();
  const qc = useQueryClient(); const [motivo, setMotivo] = useState(""); const [erro, setErro] = useState<string | null>(null);
  const atualizar = async () => { await qc.invalidateQueries(); setErro(null); };
  const resolver = useMutation({ mutationFn: async (acao: "perda" | "ajuste") => {
    if (!motivo.trim()) throw new Error("Informe o motivo.");
    const { data, error } = await supabase.rpc("fn_ti_retorno_resolver_diferenca", { p_pedido_id: r.pedido_id, p_acao: acao, p_motivo: motivo.trim() });
    if (error) throw error; exigirResultado(data);
  }, onSuccess: async () => { await atualizar(); toast.success("Diferença resolvida."); }, onError: (e) => { setErro(formatError(e)); toast.error(formatError(e)); } });
  const gerar = useMutation({ mutationFn: async () => {
    const { data, error } = await supabase.functions.invoke("ti-retorno-gerar-nf", { body: { pedido_id: r.pedido_id } });
    if (error) {
      let mensagem = error.message;
      try { const corpo = await error.context.json(); mensagem = corpo.erro ?? mensagem; } catch { /* preserve original */ }
      throw new Error(mensagem);
    }
    exigirResultado(data);
  }, onSuccess: async () => { await atualizar(); toast.success("NF de retorno em rascunho — a Eva transmite."); }, onError: async (e) => { setErro(formatError(e)); toast.error(formatError(e)); await qc.invalidateQueries(); } });
  const dif = Array.isArray(r.diferenca) ? r.diferenca as unknown as DiferencaRetorno[] : [];
  const nf = r.nf_status === "rascunho" ? `Rascunho nº ${r.nf_numero ?? "—"} — a Eva transmite` : r.nf_status === "autorizada" ? `Autorizada nº ${r.nf_numero ?? "—"}` : r.nf_status === "gerando" ? "Gerando" : r.nf_status === "erro" ? "Erro" : "Sem NF";
  return <Card><CardHeader><CardTitle className="text-base font-medium">{r.pedido?.id_externo ?? r.pedido_id}</CardTitle></CardHeader><CardContent className="space-y-4">
    {r.diferenca_status === "aberta" && <div className="space-y-3"><Badge variant="destructive">Diferença aberta</Badge><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Enviado</TableHead><TableHead>Recebido</TableHead><TableHead>Diferença</TableHead></TableRow></TableHeader><TableBody>{dif.map((d) => <TableRow key={d.sku}><TableCell><CodProduto chave={d.sku} variant="compacto" /></TableCell><TableCell>{d.enviado}</TableCell><TableCell>{d.recebido}</TableCell><TableCell className="text-destructive">{d.diferenca}</TableCell></TableRow>)}</TableBody></Table><Textarea aria-label={`Motivo da diferença ${r.pedido?.id_externo ?? r.pedido_id}`} placeholder="Motivo obrigatório" value={motivo} onChange={(e) => setMotivo(e.target.value)} /><div className="flex flex-wrap gap-2"><Button disabled={!permissao.data || !motivo.trim() || resolver.isPending} onClick={() => resolver.mutate("perda")}>Baixar como perda</Button><Button variant="outline" disabled={!permissao.data || !motivo.trim() || resolver.isPending} onClick={() => resolver.mutate("ajuste")}>Ajustar (voltou ao Site SP)</Button></div></div>}
    <div className="space-y-2"><p className="text-sm font-medium">NF de retorno · {nf}</p>{r.nf_erro && <p className="break-words text-sm text-destructive">{r.nf_erro}</p>}<Button variant="outline" disabled={!permissao.data || !podeGerarRetorno(r) || gerar.isPending} onClick={() => gerar.mutate()}>Gerar NF de retorno</Button></div>
    {permissao.isError && <p role="alert" className="text-sm text-destructive">{formatError(permissao.error)}</p>}
    {erro && <p role="alert" className="break-words text-sm text-destructive">{erro}</p>}
  </CardContent></Card>;
}
export function RetornosEventoPainel({ retornos }: { retornos: RetornoEvento[] }) {
  const pendentes = retornos.filter(retornoPendente);
  return <section className="space-y-3"><h3 className="text-base font-medium">Retornos do evento ({pendentes.length})</h3>{pendentes.map((r) => <CardRetorno key={r.pedido_id} retorno={r} />)}{!pendentes.length && <p className="text-sm text-muted-foreground">Nenhum retorno com diferença ou NF pendente.</p>}</section>;
}