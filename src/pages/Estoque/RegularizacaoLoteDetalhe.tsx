import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CardIndicador } from "@/components/ui/card-indicador";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { RegularizacaoStepper } from "@/components/regularizacao/RegularizacaoStepper";
import { RegularizacaoStatus } from "@/components/regularizacao/RegularizacaoStatus";
import { RetornosRegularizacao } from "@/components/regularizacao/RetornosRegularizacao";
import type { RegularizacaoItem, RegularizacaoLote, RegularizacaoRetorno, RegularizacaoRetornoItem } from "@/components/regularizacao/types";

const nomeProduto = (p: unknown): string | null => Array.isArray(p) ? String((p[0] as { nome_comercial?: string } | undefined)?.nome_comercial ?? "") || null : String((p as { nome_comercial?: string } | null)?.nome_comercial ?? "") || null;
export default function RegularizacaoLoteDetalhe() {
  const { id } = useParams(); const qc = useQueryClient(); const [aba, setAba] = useAbaUrl("inventario"); const { podeEditar } = usePermissoesTela("tela.regularizacao_estoque");
  const loteQ = useQuery({ queryKey: ["regularizacao", "lote", id], enabled: !!id, refetchInterval: 30_000, queryFn: async () => { const { data, error } = await supabase.from("vw_regularizacao_lote").select("*").eq("id", id ?? "").single(); if (error) throw error; return data as RegularizacaoLote; } });
  const itensQ = useQuery({ queryKey: ["regularizacao", "itens", id], enabled: !!id, queryFn: async () => { const { data, error } = await supabase.from("regularizacao_item").select("id,lote_id,sku,quantidade,quantidade_coberta,sncf_produtos(nome_comercial)").eq("lote_id", id ?? "").order("sku"); if (error) throw error; return (data ?? []).map((r) => ({ id: r.id, lote_id: r.lote_id, sku: r.sku, quantidade: r.quantidade, quantidade_coberta: r.quantidade_coberta, nome_comercial: nomeProduto(r.sncf_produtos) })) as RegularizacaoItem[]; } });
  const retornosQ = useQuery({ queryKey: ["regularizacao", "retornos", id], enabled: !!id, refetchInterval: 30_000, queryFn: async () => { const { data, error } = await supabase.from("regularizacao_retorno_nf").select("*,regularizacao_retorno_item(*)").eq("lote_id", id ?? "").order("nf_origem_data"); if (error) throw error; return (data ?? []).map((r) => ({ ...r, itens: r.regularizacao_retorno_item as RegularizacaoRetornoItem[] })) as RegularizacaoRetorno[]; } });
  const recarregar = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["regularizacao", "lote", id] }), qc.invalidateQueries({ queryKey: ["regularizacao", "itens", id] }), qc.invalidateQueries({ queryKey: ["regularizacao", "retornos", id] }), qc.invalidateQueries({ queryKey: ["regularizacao", "lotes"] })]); };
  const distribuir = useMutation({ mutationFn: async () => { if (!id) throw new Error("Lote inválido."); const { error } = await supabase.rpc("reg_lote_distribuir", { p_lote_id: id }); if (error) throw error; }, onSuccess: async () => { toast.success("Lote redistribuído."); await recarregar(); }, onError: (e) => toast.error(rawMessage(e)) });
  const criarTrs = useMutation({ mutationFn: async () => { if (!id) throw new Error("Lote inválido."); const { error } = await supabase.rpc("reg_lote_criar_trs", { p_lote_id: id }); if (error) throw error; }, onSuccess: async () => { toast.success("TRS de regularização criada."); await recarregar(); }, onError: (e) => toast.error(rawMessage(e)) });
  const lote = loteQ.data; const itens = itensQ.data ?? []; const retornos = retornosQ.data ?? [];
  const cards = useMemo(() => lote ? [{ r: "Peças do inventário", v: lote.pecas_inventario }, { r: "Cobertas", v: lote.pecas_cobertas }, { r: "Descobertas", v: lote.skus_descobertos }, { r: "NFs de retorno", v: lote.nfs_retorno, n: `${lote.nfs_planejadas} planejadas · ${lote.nfs_rascunho} rascunhos · ${lote.nfs_autorizadas} autorizadas · ${lote.nfs_erro} erros` }, { r: "Valor do retorno", v: formatBRL(lote.valor_retorno) }, { r: "TRS", v: lote.trs_numero ?? "—", n: lote.trs_estagio ?? undefined }] : [], [lote]);
  if (loteQ.isLoading) return <PageShell><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></PageShell>;
  if (!lote || loteQ.isError) return <PageShell><div className="rounded-md border p-10 text-center text-destructive">{rawMessage(loteQ.error)}</div></PageShell>;
  return <PageShell variant="dados" className="animate-casa-fade-in"><PageHeader titulo={`${lote.codigo} · ${lote.titulo}`} breadcrumb={[{ label: "Produto" }, { label: "Estoque" }, { label: "Regularização", to: "/estoque/regularizacao" }]} estado={<span className="flex items-center gap-2">{lote.centro_destino_rotulo}<RegularizacaoStatus status={lote.status} /></span>} acoes={<Button asChild variant="outline"><Link to="/estoque/regularizacao"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>} />
    <RegularizacaoStepper status={lote.status} /><div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{cards.map((c) => <CardIndicador key={c.r} rotulo={c.r} valor={typeof c.v === "number" ? c.v.toLocaleString("pt-BR") : c.v} nota={c.n} compacto />)}</div>
    <Tabs value={aba} onValueChange={setAba}><TabsList><TabsTrigger value="inventario">Inventário</TabsTrigger><TabsTrigger value="retornos">Retornos</TabsTrigger><TabsTrigger value="transferencia">Transferência</TabsTrigger></TabsList>
      <TabsContent value="inventario" className="space-y-3"><div className="flex justify-end">{podeEditar && ["rascunho", "distribuido"].includes(lote.status) && <Button variant="outline" onClick={() => distribuir.mutate()} disabled={distribuir.isPending}><RefreshCw className="mr-2 h-4 w-4" />Redistribuir</Button>}</div><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Quantidade</TableHead><TableHead>Coberta</TableHead></TableRow></TableHeader><TableBody>{itens.map((i) => <TableRow key={i.id} className={i.quantidade_coberta < i.quantidade ? "bg-warning/10" : undefined}><TableCell className="font-mono text-xs">{i.sku}</TableCell><TableCell>{i.nome_comercial ?? "—"}</TableCell><TableCell>{i.quantidade.toLocaleString("pt-BR")}</TableCell><TableCell>{i.quantidade_coberta.toLocaleString("pt-BR")}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
      <TabsContent value="retornos"><RetornosRegularizacao retornos={retornos} podeEditar={podeEditar} recarregar={recarregar} /></TabsContent>
      <TabsContent value="transferencia"><div className="space-y-4 rounded-md border p-5"><div className="grid gap-3 sm:grid-cols-3"><div><div className="text-xs text-muted-foreground">TRS</div>{lote.trs_pedido_id ? <Link className="font-medium text-primary underline" to={`/pedidos/${lote.trs_pedido_id}`}>{lote.trs_numero ?? "Abrir transferência"}</Link> : <span>—</span>}</div><div><div className="text-xs text-muted-foreground">Estágio</div><span>{lote.trs_estagio ?? "—"}</span></div><div><div className="text-xs text-muted-foreground">NF 6152 · entradas no centro</div><span>{lote.nf_6152_numero ?? "—"} · {lote.entradas_site.toLocaleString("pt-BR")}</span></div></div>{!lote.trs_pedido_id && lote.status !== "retornos_concluidos" && <p className="text-sm text-muted-foreground">Autorize todos os retornos antes de criar a transferência.</p>}{podeEditar && !lote.trs_pedido_id && lote.status === "retornos_concluidos" && <Button onClick={() => criarTrs.mutate()} disabled={criarTrs.isPending}><Truck className="mr-2 h-4 w-4" />Criar TRS de regularização</Button>}</div></TabsContent>
    </Tabs></PageShell>;
}
