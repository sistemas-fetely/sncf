// KITS DO PRODUTO — /vendas/produto/kits (26/11/2026, frente KITS-MARKETPLACE)
// Leitura: vw_produto_kit_lista / vw_produto_kit_componente / produto_kit_evento.
// Escrita SOMENTE por fn_kit_salvar e fn_kit_definir_ativo (validação no banco).
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { useEstadoTela, useFocoAoVoltar, useRestaurarScroll } from "@/lib/navegacao";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { ProdutoAbas } from "@/components/produto/ProdutoAbas";
import { InfoMetrica } from "@/components/metricas/InfoMetrica";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { fmtDataHora } from "@/lib/data";
import { rawMessage } from "@/lib/format-error";
import { descontoKit, filtrarKits, normalizarCodigoKit, type KitLinha } from "@/lib/acervo/kitsProduto";
import {
  useBuscaProdutoAtivo, useDefinirAtivoKit, useKitComponentes, useKitEventos, useKits, useSalvarKit,
  type ProdutoOpcao,
} from "@/components/acervo/useKitsProduto";

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR"));
const SimNao = ({ v }: { v: boolean }) => <Badge variant={v ? "secondary" : "outline"} className="font-normal">{v ? "Sim" : "Não"}</Badge>;

export default function KitsProduto() {
  const { data: kits, isLoading, error } = useKits();
  const { permitido: podeEditar } = usePermissaoAcaoOuSuperAdmin("acao.produto_kit_editar");
  const [nav, setNav] = useEstadoTela({ busca: "", situacao: "ativos", bling: "todos", detalhe: "" }, { replaceKeys: ["busca"] });
  const [editor, setEditor] = useState<{ kit: KitLinha | null } | null>(null);
  const lista = useMemo(() => filtrarKits(kits ?? [], nav), [kits, nav]);
  useFocoAoVoltar({ pronto: !isLoading, idsVisiveis: lista.map(k => k.sku) });
  useRestaurarScroll(null, !isLoading);
  const aberto = (kits ?? []).find(k => k.sku === nav.detalhe) ?? null;

  return (
    <PageShell>
      <PageHeader titulo="Kits" icone={Boxes} estado={isLoading ? "Carregando…" : `${lista.length} kits`}
        acoes={podeEditar ? <Button onClick={() => setEditor({ kit: null })}><Plus className="mr-2 h-4 w-4" />Novo kit</Button> : undefined} />
      <ProdutoAbas />

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Buscar código ou nome" value={nav.busca} onChange={e => setNav({ busca: e.target.value })} />
        <Select value={nav.situacao} onValueChange={v => setNav({ situacao: v })}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ativos">Ativos</SelectItem><SelectItem value="inativos">Inativos</SelectItem><SelectItem value="todos">Todos</SelectItem></SelectContent>
        </Select>
        <Select value={nav.bling} onValueChange={v => setNav({ bling: v })}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Bling: todos</SelectItem><SelectItem value="sim">No Bling</SelectItem><SelectItem value="nao">Fora do Bling</SelectItem></SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{lista.length} kits</span>
      </div>

      {error ? (
        <Alert variant="destructive"><AlertDescription>{rawMessage(error)}</AlertDescription></Alert>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Nome</TableHead>
              <TableHead className="text-right">Preço</TableHead><TableHead className="text-right">Componentes</TableHead>
              <TableHead className="text-right">Soma dos componentes</TableHead>
              <TableHead className="text-right group"><span className="inline-flex items-center gap-1">Disponível
                <InfoMetrica rotulo="Disponível">Quantos kits dá para montar com o estoque disponível da rede. O kit não tem estoque próprio.</InfoMetrica></span></TableHead>
              <TableHead>Shopify</TableHead><TableHead>Bling</TableHead><TableHead>Situação</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
              )) : lista.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum kit com esses filtros.</TableCell></TableRow>
              ) : lista.map(k => (
                <TableRow key={k.sku} data-foco-id={k.sku} className="cursor-pointer hover:bg-muted/40" onClick={() => setNav({ detalhe: k.sku })}>
                  <TableCell className="font-mono text-xs">{k.sku}</TableCell>
                  <TableCell>{k.nome}{k.componentes_inativos > 0 && (
                    <Badge variant="outline" className="ml-2 border-warning text-warning font-normal"><AlertTriangle className="mr-1 h-3 w-3" />componente inativo</Badge>)}</TableCell>
                  <TableCell className="text-right">{brl(k.preco_venda)}</TableCell>
                  <TableCell className="text-right">{k.n_componentes}</TableCell>
                  <TableCell className="text-right">{brl(k.soma_componentes)}</TableCell>
                  <TableCell className="text-right">{num(k.disponivel)}</TableCell>
                  <TableCell><SimNao v={k.no_shopify} /></TableCell>
                  <TableCell><SimNao v={k.no_bling} /></TableCell>
                  <TableCell><Badge variant={k.ativo ? "secondary" : "outline"}>{k.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <GavetaKit kit={aberto} podeEditar={podeEditar} onFechar={() => setNav({ detalhe: "" })} onEditar={k => setEditor({ kit: k })} />
      {editor && <EditorKit kit={editor.kit} onFechar={() => setEditor(null)} onSalvo={sku => { setEditor(null); setNav({ detalhe: sku }); }} />}
    </PageShell>
  );
}

function GavetaKit({ kit, podeEditar, onFechar, onEditar }: { kit: KitLinha | null; podeEditar: boolean; onFechar: () => void; onEditar: (k: KitLinha) => void }) {
  const sku = kit?.sku ?? null;
  const comps = useKitComponentes(sku);
  const hist = useKitEventos(sku);
  const definir = useDefinirAtivoKit();
  const [motivoAberto, setMotivoAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const desc = kit ? descontoKit(kit.soma_componentes, kit.preco_venda) : null;

  async function alternar(ativo: boolean, m: string | null) {
    if (!kit) return;
    try {
      await definir.mutateAsync({ sku: kit.sku, ativo, motivo: m });
      toast.success(ativo ? "Kit reativado" : "Kit inativado");
      setMotivoAberto(false); setMotivo("");
    } catch (e) { toast.error(rawMessage(e)); }
  }

  return (
    <Sheet open={!!kit} onOpenChange={o => !o && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {kit && <>
          <SheetHeader>
            <SheetTitle className="font-mono">{kit.sku}</SheetTitle>
            <SheetDescription>{kit.nome}</SheetDescription>
          </SheetHeader>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{brl(kit.preco_venda)}</span>
            <Badge variant={kit.ativo ? "secondary" : "outline"}>{kit.ativo ? "Ativo" : "Inativo"}</Badge>
            <Badge variant="outline" className="font-normal">Shopify: {kit.no_shopify ? "sim" : "não"}</Badge>
            <Badge variant="outline" className="font-normal">Bling: {kit.no_bling ? "sim" : "não"}</Badge>
          </div>
          {podeEditar && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEditar(kit)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
              {kit.ativo
                ? <Button size="sm" variant="outline" onClick={() => setMotivoAberto(true)}>Inativar</Button>
                : <Button size="sm" variant="outline" disabled={definir.isPending} onClick={() => alternar(true, null)}>Reativar</Button>}
            </div>
          )}

          <h3 className="mt-5 mb-2 text-sm font-medium">Componentes</h3>
          {comps.error ? <Alert variant="destructive"><AlertDescription>{rawMessage(comps.error)}</AlertDescription></Alert>
            : comps.isLoading ? <Skeleton className="h-20 w-full" /> : (
            <Card><CardContent className="p-0"><Table>
              <TableHeader><TableRow><TableHead>Cód. cadastro</TableHead><TableHead>SKU</TableHead><TableHead>Nome</TableHead>
                <TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Preço ref.</TableHead><TableHead className="text-right">Disponível</TableHead></TableRow></TableHeader>
              <TableBody>
                {(comps.data ?? []).map(c => (
                  <TableRow key={c.componente_sku}>
                    <TableCell className="font-mono text-xs">{c.cod_cadastro ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.componente_sku}</TableCell>
                    <TableCell>{c.nome}{!c.componente_ativo && <Badge variant="outline" className="ml-2 border-warning text-warning font-normal">inativo</Badge>}</TableCell>
                    <TableCell className="text-right">{num(c.quantidade)}</TableCell>
                    <TableCell className="text-right">{brl(c.preco_ref)}</TableCell>
                    <TableCell className="text-right">{num(c.disponivel)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell colSpan={4}>Soma {brl(kit.soma_componentes)} × kit {brl(kit.preco_venda)}</TableCell>
                  <TableCell colSpan={2} className="text-right">
                    {desc ? `Desconto do kit: ${brl(desc.valor)} (${desc.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)` : "—"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table></CardContent></Card>
          )}

          <h3 className="mt-5 mb-2 text-sm font-medium">Histórico</h3>
          {hist.error ? <Alert variant="destructive"><AlertDescription>{rawMessage(hist.error)}</AlertDescription></Alert>
            : hist.isLoading ? <Skeleton className="h-16 w-full" />
            : (hist.data?.eventos.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">Sem eventos.</p> : (
            <ul className="divide-y rounded-md border bg-card text-sm">
              {hist.data!.eventos.map(e => (
                <li key={e.id} className="px-3 py-2">
                  <div className="flex justify-between gap-2"><span className="font-medium">{hist.data!.rotulos.get(e.tipo) ?? e.tipo}</span>
                    <span className="text-xs text-muted-foreground">{fmtDataHora(e.em)}</span></div>
                  <div className="text-xs text-muted-foreground">{e.por_nome ?? "—"}{e.detalhe?.motivo ? ` · Motivo: ${e.detalhe.motivo}` : ""}</div>
                </li>
              ))}
            </ul>
          )}

          <Dialog open={motivoAberto} onOpenChange={setMotivoAberto}>
            <DialogContent>
              <DialogHeader><DialogTitle>Inativar {kit.sku}</DialogTitle><DialogDescription>Informe o motivo.</DialogDescription></DialogHeader>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Por que está inativando?" />
              <DialogFooter>
                <Button variant="outline" onClick={() => setMotivoAberto(false)}>Cancelar</Button>
                <Button disabled={!motivo.trim() || definir.isPending} onClick={() => alternar(false, motivo.trim())}>Inativar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>}
      </SheetContent>
    </Sheet>
  );
}

type CompEdit = { sku: string; cod_cadastro: string | null; nome: string; quantidade: number };

function EditorKit({ kit, onFechar, onSalvo }: { kit: KitLinha | null; onFechar: () => void; onSalvo: (sku: string) => void }) {
  const atuais = useKitComponentes(kit?.sku ?? null);
  const salvar = useSalvarKit();
  const [codigo, setCodigo] = useState(kit?.sku ?? "");
  const [nome, setNome] = useState(kit?.nome ?? "");
  const [preco, setPreco] = useState(kit?.preco_venda != null ? String(kit.preco_venda).replace(".", ",") : "");
  const [comps, setComps] = useState<CompEdit[] | null>(kit ? null : []);
  const [termo, setTermo] = useState("");
  const busca = useBuscaProdutoAtivo(termo);

  const lista: CompEdit[] = comps ?? (atuais.data ?? []).map(c => ({ sku: c.componente_sku, cod_cadastro: c.cod_cadastro, nome: c.nome ?? c.componente_sku, quantidade: Number(c.quantidade) }));
  const travaCodigo = !!kit?.no_bling;
  const precoNum = preco.trim() ? Number(preco.replace(/\./g, "").replace(",", ".")) : null;
  const valido = codigo && nome.trim() && lista.length > 0 && lista.every(c => c.quantidade > 0) && (precoNum == null || Number.isFinite(precoNum));

  const adicionar = (p: ProdutoOpcao) => {
    if (lista.some(c => c.sku === p.sku)) { toast.error("Esse produto já está no kit."); return; }
    setComps([...lista, { sku: p.sku, cod_cadastro: p.cod_cadastro, nome: p.nome, quantidade: 1 }]); setTermo("");
  };

  async function confirmar() {
    try {
      const r = await salvar.mutateAsync({ sku: codigo, nome: nome.trim(), preco: precoNum,
        componentes: lista.map(c => ({ sku: c.sku, quantidade: c.quantidade })), skuOriginal: kit?.sku ?? null });
      toast.success(kit ? "Kit atualizado" : "Kit criado");
      onSalvo(r?.sku ?? codigo);
    } catch (e) { toast.error(rawMessage(e)); }
  }

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{kit ? `Editar ${kit.sku}` : "Novo kit"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>Código</Label>
            <Input value={codigo} disabled={travaCodigo} onChange={e => setCodigo(normalizarCodigoKit(e.target.value))} />
            {travaCodigo && <p className="text-xs text-muted-foreground">Já está no Bling — o código não muda mais.</p>}</div>
          <div className="space-y-1 sm:col-span-2"><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div className="space-y-1"><Label>Preço (R$)</Label><Input inputMode="decimal" value={preco} onChange={e => setPreco(e.target.value)} placeholder="Opcional" /></div>
        </div>

        <div className="space-y-2">
          <Label>Componentes</Label>
          <div className="relative">
            <Input value={termo} onChange={e => setTermo(e.target.value)} placeholder="Buscar produto ativo por SKU, código ou nome" />
            {termo.trim().length >= 2 && (
              <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                {busca.isLoading ? <p className="p-2 text-sm text-muted-foreground">Buscando…</p>
                  : busca.error ? <p className="p-2 text-sm text-destructive">{rawMessage(busca.error)}</p>
                  : (busca.data ?? []).length === 0 ? <p className="p-2 text-sm text-muted-foreground">Nenhum produto ativo.</p>
                  : busca.data!.map(p => (
                    <button key={p.sku} type="button" onClick={() => adicionar(p)} className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted">
                      <span className="font-mono text-xs">{p.cod_cadastro ?? p.sku}</span> · {p.nome} <span className="text-muted-foreground">{brl(p.preco)}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          {kit && atuais.isLoading && !comps ? <Skeleton className="h-16 w-full" /> : lista.length === 0
            ? <p className="text-sm text-muted-foreground">Adicione pelo menos um componente.</p> : (
            <ul className="divide-y rounded-md border bg-card">
              {lista.map((c, i) => (
                <li key={c.sku} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate"><span className="font-mono text-xs">{c.cod_cadastro ?? c.sku}</span> · {c.nome}</span>
                  <Input type="number" min={1} className="w-20" value={c.quantidade}
                    onChange={e => setComps(lista.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x))} />
                  <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => setComps(lista.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!valido || salvar.isPending} onClick={confirmar}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
