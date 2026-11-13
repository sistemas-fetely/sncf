import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Banknote, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { useFamiliasCusto, useGravarCustoObrigatorio, usePainelCustoObrigatorio, type DefinirCusto, type IncluirCusto } from "@/hooks/despesas/useCustoObrigatorio";
import { useEstadoTela } from "@/lib/navegacao";
import { formatBRL } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { estadoCelulaCusto, filtrarCustos, filtroPadraoCusto, mesesCustoVisiveis, rotuloMesCusto, totaisCustos, type ChaveCusto, type DecisoesCusto, type FiltroCusto, type ItemCustoObrigatorio } from "@/lib/despesas/custoObrigatorio";

const compacto = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const valorSchema = z.union([z.literal(""), z.coerce.number().finite().nonnegative()]).transform((v) => v === "" ? null : v);
const nomeSchema = z.string().trim().min(1, "Informe o nome.");
const subscribeLargura = (callback: () => void) => { window.addEventListener("resize", callback); return () => window.removeEventListener("resize", callback); };
function BotaoCusto({ permitido, ...props }: ButtonProps & { permitido: boolean }) {
  return <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Button {...props} disabled={!permitido || props.disabled} /></span></TooltipTrigger>{!permitido && <TooltipContent>Sem permissão para classificar despesas.</TooltipContent>}</Tooltip>;
}
type Gravar = (acao: { tipo: "definir"; args: DefinirCusto } | { tipo: "incluir"; args: IncluirCusto }) => Promise<boolean>;
function DialogCusto({ item, permitido, ocupado, gravar, fechar }: { item: ItemCustoObrigatorio | null; permitido: boolean; ocupado: boolean; gravar: Gravar; fechar: () => void }) {
  const [tipo, setTipo] = useState<ChaveCusto>("cnpj");
  const [chave, setChave] = useState("");
  const [nome, setNome] = useState(item?.nome ?? "");
  const [valor, setValor] = useState(item?.valor_esperado?.toString() ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const familias = useFamiliasCusto(!item && tipo === "cartao_familia");
  const salvar = async () => {
    const dados = z.object({ nome: nomeSchema, valor: valorSchema }).safeParse({ nome, valor });
    if (!dados.success) { setErro(dados.error.issues[0]?.message ?? "Revise os campos."); return; }
    if (!item && !chave.trim()) { setErro("Informe a chave."); return; }
    const ok = await gravar(item
      ? { tipo: "definir", args: { p_id: item.id, p_status: "confirmado", p_nome: dados.data.nome, p_valor_esperado: dados.data.valor } }
      : { tipo: "incluir", args: { p_chave_tipo: tipo, p_chave: chave.trim(), p_nome: dados.data.nome, p_valor_esperado: dados.data.valor } });
    if (ok) { toast.success(item ? "Custo obrigatório atualizado." : "Serviço ou contrato incluído."); fechar(); }
  };
  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !ocupado) fechar(); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{item ? "Editar custo obrigatório" : "Incluir serviço ou contrato"}</DialogTitle><DialogDescription>{item ? `Mediana atual: ${item.mediana === null ? "—" : formatBRL(item.mediana)}` : "Marcação de custo obrigatório, sem gerar título ou despesa."}</DialogDescription></DialogHeader>
    <div className="space-y-4">
      {!item && <><div className="space-y-1"><Label htmlFor="custo-tipo">Tipo</Label><Select value={tipo} onValueChange={(v) => { setTipo(v as ChaveCusto); setChave(""); }}><SelectTrigger id="custo-tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cnpj">Fornecedor (CNPJ)</SelectItem><SelectItem value="cartao_familia">Estabelecimento do cartão</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label htmlFor="custo-chave">Chave</Label>{tipo === "cnpj" ? <Input id="custo-chave" inputMode="numeric" value={chave} onChange={(e) => setChave(formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" /> : <Select value={chave} onValueChange={setChave}><SelectTrigger id="custo-chave" disabled={familias.isPending || familias.isError}><SelectValue placeholder={familias.isPending ? "Carregando…" : "Selecionar estabelecimento"} /></SelectTrigger><SelectContent>{familias.data?.map((familia) => <SelectItem key={familia} value={familia}>{familia}</SelectItem>)}</SelectContent></Select>}{familias.error && <p role="alert" className="text-sm text-destructive">{formatError(familias.error)}</p>}{tipo === "cartao_familia" && familias.isSuccess && familias.data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum estabelecimento ativo.</p>}</div></>}
      <div className="space-y-1"><Label htmlFor="custo-nome">Nome</Label><Input id="custo-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="custo-valor">Valor esperado por mês</Label><Input id="custo-valor" type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} /><p className="text-xs text-muted-foreground">Vazio = usar a mediana.</p></div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div><DialogFooter><Button variant="outline" disabled={ocupado} onClick={fechar}>Cancelar</Button><BotaoCusto permitido={permitido} disabled={ocupado || (!item && tipo === "cartao_familia" && !familias.isSuccess)} onClick={() => void salvar()}>{ocupado && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}Salvar</BotaoCusto></DialogFooter>
  </DialogContent></Dialog>;
}

export function CustoObrigatorioTab() {
  const painel = usePainelCustoObrigatorio();
  const mutation = useGravarCustoObrigatorio();
  const { permitido, carregando } = usePermissaoAcao("acao.despesa_classificar");
  const pode = permitido && !carregando;
  const [nav, setNav] = useEstadoTela({ filtro: "", busca: "" }, { prefixo: "co", replaceKeys: ["busca"] });
  const inicial = useRef<FiltroCusto | null>(null);
  if (painel.data && inicial.current === null) inicial.current = filtroPadraoCusto(painel.data.itens);
  const filtro: FiltroCusto = nav.filtro === "todos" || nav.filtro === "sugerido" || nav.filtro === "confirmado" ? nav.filtro : inicial.current ?? "sugerido";
  const [decisoes, setDecisoes] = useState<DecisoesCusto>({});
  const filtroAnterior = useRef(filtro);
  useEffect(() => { if (filtroAnterior.current !== filtro) { setDecisoes({}); filtroAnterior.current = filtro; } }, [filtro]);
  const [dialogo, setDialogo] = useState<{ item: ItemCustoObrigatorio | null } | null>(null);
  const [remover, setRemover] = useState<ItemCustoObrigatorio | null>(null);
  const largura = useSyncExternalStore(subscribeLargura, () => window.innerWidth, () => 1280);
  const data = painel.data;
  const meses = mesesCustoVisiveis(data?.meses ?? [], largura);
  const atual = data?.meses.at(-1);
  const itens = filtrarCustos(data?.itens ?? [], filtro, nav.busca, decisoes);
  const totais = totaisCustos(itens, meses);
  const gravar: Gravar = async (acao) => {
    if (!pode || mutation.isPending) return false;
    try { await mutation.mutateAsync(acao); return true; }
    catch { return false; /* A mensagem real é exibida pelo hook de gravação. */ }
  };
  const decidir = async (item: ItemCustoObrigatorio, status: "confirmado" | "descartado") => {
    if (await gravar({ tipo: "definir", args: { p_id: item.id, p_status: status, p_valor_esperado: null, p_nome: null } })) {
      setDecisoes((d) => ({ ...d, [item.id]: { item, status } }));
      toast.success(status === "confirmado" ? "Custo obrigatório confirmado." : "Custo obrigatório descartado.");
      setRemover(null);
    }
  };
  return <div className="space-y-4" data-testid="custo-obrigatorio">
    {painel.error && <div role="alert" className="rounded-md border border-destructive bg-card p-4 text-sm text-destructive">{formatError(painel.error)}</div>}
    {painel.isPending && <div aria-label="Carregando custo obrigatório" className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-80 w-full" /></div>}
    {data && <>
      <section className="rounded-md border bg-card p-4 text-card-foreground"><div className="grid gap-4 sm:grid-cols-3">
        <div><p className="text-sm text-muted-foreground">Custo obrigatório esperado por mês</p><p className="mt-1 text-2xl font-medium tabular-nums">{formatBRL(data.total_confirmado.esperado)}</p></div>
        <div><p className="text-sm text-muted-foreground">Realizado no mês atual</p><p className="mt-1 text-2xl font-medium tabular-nums">{formatBRL(atual ? data.total_confirmado.por_mes[atual] ?? 0 : 0)}</p></div>
        <div><p className="text-sm text-muted-foreground">Sugestões a confirmar</p><p className="mt-1 text-2xl font-medium tabular-nums">{data.total_sugerido.itens}</p><p className="text-xs text-muted-foreground">{formatBRL(data.total_sugerido.esperado)} por mês</p></div>
      </div>{!data.itens.some((i) => i.status === "confirmado") && <p className="mt-3 text-sm text-muted-foreground">Confirme abaixo os serviços e contratos que são custo obrigatório. O total aparece aqui.</p>}</section>
      <div className="flex flex-wrap items-center gap-2"><div className="flex flex-wrap gap-1" aria-label="Filtrar custos obrigatórios">{([{ valor: "sugerido", rotulo: `Sugestões · ${data.total_sugerido.itens}` }, { valor: "confirmado", rotulo: `Confirmados · ${data.itens.filter((i) => i.status === "confirmado").length}` }, { valor: "todos", rotulo: "Todos" }] as const).map((opcao) => <Button key={opcao.valor} size="sm" variant={filtro === opcao.valor ? "secondary" : "outline"} aria-pressed={filtro === opcao.valor} onClick={() => { if (filtro !== opcao.valor) { setDecisoes({}); setNav({ filtro: opcao.valor }); } }}>{opcao.rotulo}</Button>)}</div><Input className="h-9 w-52" aria-label="Buscar serviço ou contrato" placeholder="Buscar por nome" value={nav.busca} onChange={(e) => setNav({ busca: e.target.value })} /><div className="ml-auto"><BotaoCusto permitido={pode} disabled={mutation.isPending} size="sm" onClick={() => setDialogo({ item: null })}><Plus className="h-4 w-4" />Incluir serviço ou contrato</BotaoCusto></div></div>
      <div className="rounded-md border bg-card text-card-foreground"><Table className="table-fixed text-xs" containerClassName="overflow-x-hidden"><TableHeader><TableRow><TableHead className="w-[25%]">Serviço / contrato</TableHead><TableHead className="w-[14%] text-right">Esperado/mês</TableHead>{meses.map((mes) => <TableHead key={mes} className={cn("px-1 text-right", mes === atual && "bg-primary/5 text-primary")}><span className="block">{rotuloMesCusto(mes)}</span>{mes === atual && <span className="text-[10px] font-normal">(atual)</span>}</TableHead>)}<TableHead className="w-[17%]">Ação</TableHead></TableRow></TableHeader>
        <TableBody>{itens.map((item) => <TableRow key={item.id}><TableCell className="min-w-0"><p className="truncate font-medium" title={item.nome}>{item.nome}</p><p className="truncate text-[10px] text-muted-foreground" title={item.chave}>{item.chave_tipo === "cnpj" ? `Fornecedor · ${formatCNPJ(item.chave)}` : `Cartão · ${item.chave}`}</p>{item.observacao && <p className="truncate text-[10px] text-muted-foreground" title={item.observacao}>{item.observacao}</p>}{decisoes[item.id] && <Badge variant="outline" className="mt-1 text-[10px]">{decisoes[item.id].status === "confirmado" ? "Confirmado agora" : "Descartado agora"}</Badge>}</TableCell><TableCell className="text-right tabular-nums"><span className="whitespace-nowrap">{formatBRL(item.esperado)}</span>{item.valor_esperado === null && <span className="block text-[10px] text-muted-foreground">mediana 6 meses</span>}</TableCell>
          {meses.map((mes) => { const celula = estadoCelulaCusto(item.por_mes[mes], item.esperado, mes !== atual); return <TableCell key={mes} className={cn("px-1 text-right tabular-nums", celula.atencao && "bg-warning/10 text-warning", celula.esmaecida && "text-muted-foreground/50")}><span>{celula.valor === 0 ? "—" : compacto.format(celula.valor)}</span>{celula.pagoSemDespesa && <Tooltip><TooltipTrigger asChild><span tabIndex={0} className="ml-1 inline-flex align-middle text-muted-foreground" aria-label="Pago no banco, ainda sem despesa lançada"><Banknote className="h-3 w-3" /></span></TooltipTrigger><TooltipContent>Pago no banco, ainda sem despesa lançada</TooltipContent></Tooltip>}</TableCell>; })}
          <TableCell><div className="flex flex-wrap gap-1">{item.status === "sugerido" ? <><BotaoCusto permitido={pode} disabled={mutation.isPending} size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void decidir(item, "confirmado")}><Check className="h-3 w-3" />Confirmar</BotaoCusto><BotaoCusto permitido={pode} disabled={mutation.isPending} size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void decidir(item, "descartado")}><X className="h-3 w-3" />Descartar</BotaoCusto></> : item.status === "confirmado" ? <><BotaoCusto permitido={pode} disabled={mutation.isPending} size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setDialogo({ item })}><Pencil className="h-3 w-3" />Editar</BotaoCusto><BotaoCusto permitido={pode} disabled={mutation.isPending} size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setRemover(item)}><Trash2 className="h-3 w-3" />Remover</BotaoCusto></> : <span className="text-muted-foreground">Descartado</span>}</div></TableCell></TableRow>)}{itens.length === 0 && <TableRow><TableCell colSpan={meses.length + 3} className="py-10 text-center text-muted-foreground">Nenhum serviço ou contrato encontrado.</TableCell></TableRow>}</TableBody>
        <TableFooter><TableRow><TableCell>TOTAL</TableCell><TableCell className="text-right tabular-nums">{formatBRL(totais.esperado)}</TableCell>{meses.map((mes) => <TableCell key={mes} className="px-1 text-right tabular-nums">{totais.por_mes[mes] === 0 ? "—" : compacto.format(totais.por_mes[mes])}</TableCell>)}<TableCell /></TableRow></TableFooter>
      </Table></div>
    </>}
    {dialogo && <DialogCusto key={dialogo.item?.id ?? "novo"} item={dialogo.item} permitido={pode} ocupado={mutation.isPending} gravar={gravar} fechar={() => setDialogo(null)} />}
    <AlertDialog open={!!remover} onOpenChange={(aberto) => { if (!aberto && !mutation.isPending) setRemover(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover custo obrigatório?</AlertDialogTitle><AlertDialogDescription>{remover?.nome} deixará de ser marcado como custo obrigatório. Nenhum título ou despesa será alterado.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setRemover(null)}>Cancelar</Button><BotaoCusto permitido={pode} disabled={mutation.isPending} variant="destructive" onClick={() => { if (remover) void decidir(remover, "descartado"); }}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}Remover</BotaoCusto></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
