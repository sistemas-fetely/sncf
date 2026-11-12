import { useEstadoTela } from "@/lib/navegacao";
/**
 * ÓRFÃOS DE ENTRADA — créditos bancários sem dono identificado.
 *
 * O operador diz de quem é o dinheiro; o sistema aprende o pagador e as
 * próximas entradas do mesmo documento entram sozinhas.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Loader2,
  Search,
  Sparkles,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { useClientesBusca } from "@/hooks/financeiro/useContaCliente";
import {
  useAtribuirOrfao,
  useConciliacaoOrfaos,
  type OrfaoEntrada,
  type SugestaoForca,
} from "@/hooks/financeiro/useConciliacaoOrfaos";

/* --------------------------------------------------------------- helpers */

function formatarDocumento(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc;
}

const ROTULO_FORCA: Record<Exclude<SugestaoForca, null>, string> = {
  doc_e_cnpj_do_cliente: "CNPJ do cliente",
  pagador_ja_ensinado: "Pagador conhecido",
  pedido_valor_data: "Pedido por valor + data",
};

function mensagemSucesso(valor: number, nome: string, aprendido?: boolean) {
  toast.success(`${formatBRL(valor)} creditado na conta de ${nome}`, {
    description: aprendido
      ? "Pagador ensinado — próximos pagamentos deste documento entram sozinhos."
      : undefined,
  });
}

/* ------------------------------------------------------- dialog atribuir */

function DialogAtribuir({
  orfao,
  aberto,
  onFechar,
}: {
  orfao: OrfaoEntrada;
  aberto: boolean;
  onFechar: () => void;
}) {
  const [clienteId, setClienteId] = useState<string | null>(orfao.parceiro_sugerido_id);
  const [clienteNome, setClienteNome] = useState<string | null>(orfao.parceiro_sugerido_nome);
  const [nota, setNota] = useState("");
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termo, setTermo] = useState("");
  const { data: opcoes = [], isLoading: buscando } = useClientesBusca(termo);
  const atribuir = useAtribuirOrfao();

  async function confirmar() {
    if (!clienteId) return;
    try {
      const res = await atribuir.mutateAsync({
        movimentacao_id: orfao.movimentacao_id,
        parceiro_id: clienteId,
        nota: nota.trim() || null,
      });
      mensagemSucesso(
        Number(res.valor ?? orfao.valor),
        clienteNome ?? "cliente",
        res.pagador_aprendido,
      );
      onFechar();
    } catch (e: any) {
      toast.error("Não foi possível atribuir esta entrada", {
        description: e?.message ?? "Erro desconhecido.",
      });
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Atribuir entrada a um cliente</DialogTitle>
          <DialogDescription>
            {formatBRL(orfao.valor)} · {formatDateBR(orfao.data_transacao)} ·{" "}
            {orfao.conta ?? "conta não informada"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente</Label>
            <Popover open={buscaAberta} onOpenChange={setBuscaAberta}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className={cn("truncate", !clienteNome && "text-muted-foreground")}>
                    {clienteNome ?? "Buscar por nome, CNPJ ou CPF"}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar por nome, CNPJ ou CPF"
                    value={termo}
                    onValueChange={setTermo}
                  />
                  <CommandList>
                    {buscando ? (
                      <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> buscando
                      </div>
                    ) : (
                      <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    )}
                    <CommandGroup>
                      {opcoes.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            setClienteId(c.id);
                            setClienteNome(c.nome);
                            setBuscaAberta(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-3.5 w-3.5",
                              clienteId === c.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="text-xs">{c.nome}</span>
                          {c.cnpj && (
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {formatarDocumento(c.cnpj)}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nota (opcional)</Label>
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Como você identificou o dono deste crédito"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={atribuir.isPending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!clienteId || atribuir.isPending}>
            {atribuir.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Confirmar atribuição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------- aceitar sugestão */

function BotaoAceitarSugestao({ orfao }: { orfao: OrfaoEntrada }) {
  const atribuir = useAtribuirOrfao();

  async function aceitar() {
    if (!orfao.parceiro_sugerido_id) return;
    try {
      const res = await atribuir.mutateAsync({
        movimentacao_id: orfao.movimentacao_id,
        parceiro_id: orfao.parceiro_sugerido_id,
        nota: orfao.sugestao_forca === "pedido_valor_data"
          ? `Aceita sugestão (pedido por valor + data · ${orfao.pedido_sugerido})`
          : `Aceita sugestão (${orfao.sugestao_forca ?? "sem força"})`,
      });
      mensagemSucesso(
        Number(res.valor ?? orfao.valor),
        orfao.parceiro_sugerido_nome ?? "cliente",
        res.pagador_aprendido,
      );
    } catch (e: any) {
      toast.error("Não foi possível aceitar a sugestão", {
        description: e?.message ?? "Erro desconhecido.",
      });
    }
  }

  return (
    <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={aceitar} disabled={atribuir.isPending}>
      {atribuir.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Sparkles className="h-3 w-3" />
      )}
      Aceitar
    </Button>
  );
}

import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useClassesSaidaOrfao, useMarcarNaoRecebivel, useOrfaosResolvidos, useDesfazerNaoRecebivel, type OrfaoResolvido } from "@/hooks/financeiro/useConciliacaoOrfaos";
import { filtrarOrfaos, motivoOrfaoValido } from "@/lib/financeiro/orfaos";

function ErroLeitura({ error }: { error: unknown }) {
  return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Não foi possível carregar</AlertTitle><AlertDescription>{(error as { message?: string })?.message ?? String(error)}</AlertDescription></Alert>;
}

function QuemPagou({ linha }: { linha: Pick<OrfaoEntrada, "contraparte_nome" | "contraparte_documento" | "descricao"> }) {
  const doc = formatarDocumento(linha.contraparte_documento);
  if (linha.contraparte_nome || doc) return <><span className="block break-words">{linha.contraparte_nome}</span>{doc && <span className="block text-[10px] text-muted-foreground break-words">{doc}</span>}</>;
  return <div className="text-muted-foreground"><span className="block">banco não informou o pagador</span><Tooltip><TooltipTrigger asChild><span className="block truncate text-[10px]">{linha.descricao ?? "—"}</span></TooltipTrigger><TooltipContent className="max-w-sm break-words">{linha.descricao ?? "—"}</TooltipContent></Tooltip></div>;
}

function DialogNaoRecebivel({ orfao, onFechar }: { orfao: OrfaoEntrada; onFechar: () => void }) {
  const classes = useClassesSaidaOrfao();
  const marcar = useMarcarNaoRecebivel();
  const desfazer = useDesfazerNaoRecebivel();
  const [classe, setClasse] = useState("");
  const [motivo, setMotivo] = useState("");
  async function confirmar() {
    if (!motivoOrfaoValido(classe, motivo)) return;
    try {
      const res = await marcar.mutateAsync({ movimentacao_id: orfao.movimentacao_id, classe, motivo: motivo.trim() });
      toast.success(`${formatBRL(res.valor ?? orfao.valor)} saiu da fila como ${res.classe_nome ?? classes.data?.find(c => c.codigo === classe)?.nome ?? classe}`, {
        action: { label: "Desfazer", onClick: async () => {
          try { await desfazer.mutateAsync({ movimentacao_id: orfao.movimentacao_id }); toast.success("Crédito devolvido à fila"); }
          catch (e: any) { toast.error(e?.message ?? String(e)); }
        } },
      });
      onFechar();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
  }
  return <Dialog open onOpenChange={open => !open && !marcar.isPending && onFechar()}><DialogContent>
    <DialogHeader><DialogTitle>Não é recebível</DialogTitle><DialogDescription>{formatBRL(orfao.valor)} · {formatDateBR(orfao.data_transacao)} · {orfao.conta ?? "—"} · {orfao.contraparte_nome || formatarDocumento(orfao.contraparte_documento) || "banco não informou o pagador"}</DialogDescription></DialogHeader>
    {classes.isError ? <ErroLeitura error={classes.error} /> : classes.isLoading ? <Skeleton className="h-10" /> : <div className="space-y-2"><Label htmlFor="classe-orfao">O que é este crédito?</Label><Select value={classe} onValueChange={setClasse}><SelectTrigger id="classe-orfao"><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>{classes.data?.map(c => <SelectItem key={c.codigo} value={c.codigo}>{c.nome}</SelectItem>)}</SelectContent></Select></div>}
    <div className="space-y-2"><Label htmlFor="motivo-orfao">Motivo</Label><Textarea id="motivo-orfao" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: aporte do sócio em 22/01" minLength={5} required /></div>
    <DialogFooter><Button variant="ghost" disabled={marcar.isPending} onClick={onFechar}>Cancelar</Button><Button disabled={marcar.isPending || classes.isError || !motivoOrfaoValido(classe, motivo)} onClick={confirmar}>{marcar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tirar da fila</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function BlocoOrfaos({ titulo, linhas, sugestao, atribuir, retirar }: { titulo: string; linhas: OrfaoEntrada[]; sugestao: boolean; atribuir: (o: OrfaoEntrada) => void; retirar: (o: OrfaoEntrada) => void }) {
  if (!linhas.length) return null;
  return <Card className="overflow-hidden border-border bg-card"><CardHeader className="px-4 py-3"><CardTitle className="text-sm font-medium">{titulo} · {linhas.length}</CardTitle></CardHeader>
    <Table className="table-fixed bg-card text-xs [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:h-9" containerClassName="lg:overflow-x-hidden">
      <colgroup><col className="w-[12%]" /><col className="w-[16%]" /><col className={sugestao ? "w-[21%]" : "w-[27%]"} /><col className={sugestao ? "w-[14%]" : "w-[17%]"} />{sugestao && <col className="w-[22%]" />}<col className={sugestao ? "w-[15%]" : "w-[28%]"} /></colgroup>
      <TableHeader><TableRow><TableHead>Data</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Quem pagou</TableHead><TableHead>Conta</TableHead>{sugestao && <TableHead>Sugestão</TableHead>}<TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
      <TableBody>{linhas.map(o => <TableRow key={o.movimentacao_id}>
        <TableCell><span className="block">{formatDateBR(o.data_transacao)}</span><span className={cn("block text-[10px] text-muted-foreground", Number(o.dias_em_aberto) >= 7 && "text-warning")}>há {o.dias_em_aberto ?? 0} dias</span></TableCell>
        <TableCell className="text-right font-medium whitespace-nowrap">{formatBRL(o.valor)}</TableCell><TableCell><QuemPagou linha={o} /></TableCell><TableCell className="break-words">{o.conta ?? "—"}</TableCell>
        {sugestao && <TableCell><span className="block break-words">{o.parceiro_sugerido_nome ?? "—"}</span>{o.sugestao_forca && <Badge variant="secondary" className="mt-1 text-[10px] whitespace-normal text-success border-success/30">{ROTULO_FORCA[o.sugestao_forca]}</Badge>}{o.sugestao_forca === "pedido_valor_data" && o.pedido_sugerido && <span className="block text-[10px] text-muted-foreground">{o.pedido_sugerido}</span>}</TableCell>}
        <TableCell><div className="flex justify-end flex-wrap gap-1">{sugestao ? <><BotaoAceitarSugestao orfao={o} /><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => atribuir(o)}>Atribuir a outro cliente…</DropdownMenuItem><DropdownMenuItem onSelect={() => retirar(o)}>Não é recebível…</DropdownMenuItem></DropdownMenuContent></DropdownMenu></> : <><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => atribuir(o)}>Atribuir…</Button><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => retirar(o)}>Não é recebível</Button></>}</div></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </Card>;
}

function Resolvidos() {
  const query = useOrfaosResolvidos();
  const desfazer = useDesfazerNaoRecebivel();
  const [confirmacao, setConfirmacao] = useState<OrfaoResolvido | null>(null);
  async function confirmar() {
    if (!confirmacao) return;
    try { await desfazer.mutateAsync({ movimentacao_id: confirmacao.movimentacao_id }); setConfirmacao(null); toast.success("Crédito devolvido à fila"); }
    catch (e: any) { toast.error(e?.message ?? String(e)); }
  }
  if (query.isLoading) return <Skeleton className="h-9" />;
  if (query.isError) return <ErroLeitura error={query.error} />;
  if (!query.data?.length) return null;
  return <><Collapsible className="rounded-md border border-border bg-card"><CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between text-sm">Resolvidos como não recebível · {query.data.length}<ChevronDown className="h-4 w-4" /></Button></CollapsibleTrigger><CollapsibleContent>
    <Table className="table-fixed bg-card text-xs [&_td]:px-3 [&_th]:px-3" containerClassName="lg:overflow-x-hidden"><TableHeader><TableRow><TableHead>Data</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Quem pagou</TableHead><TableHead>Classe</TableHead><TableHead>Motivo</TableHead><TableHead /></TableRow></TableHeader><TableBody>{query.data.map(o => <TableRow key={o.movimentacao_id}><TableCell>{formatDateBR(o.data_transacao)}</TableCell><TableCell className="text-right break-words">{formatBRL(o.valor)}</TableCell><TableCell><QuemPagou linha={o} /></TableCell><TableCell className="break-words">{o.classe_nome}</TableCell><TableCell className="break-words">{o.motivo}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setConfirmacao(o)}>Desfazer</Button></TableCell></TableRow>)}</TableBody></Table>
    </CollapsibleContent></Collapsible>
    <Dialog open={!!confirmacao} onOpenChange={open => !open && !desfazer.isPending && setConfirmacao(null)}><DialogContent><DialogHeader><DialogTitle>Devolver este crédito à fila?</DialogTitle><DialogDescription>{confirmacao && formatBRL(confirmacao.valor)} · {confirmacao?.classe_nome}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" disabled={desfazer.isPending} onClick={() => setConfirmacao(null)}>Cancelar</Button><Button disabled={desfazer.isPending} onClick={confirmar}>{desfazer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Desfazer</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

export default function OrfaosTab() {
  const query = useConciliacaoOrfaos();
  const [nav, setNav] = useEstadoTela({ busca: "", conta: "todas" }, { prefixo: "orfaos", replaceKeys: ["busca"] });
  const [emAtribuicao, setEmAtribuicao] = useState<OrfaoEntrada | null>(null);
  const [emRetirada, setEmRetirada] = useState<OrfaoEntrada | null>(null);
  const linhas = query.data ?? [];
  const filtradas = filtrarOrfaos(linhas, nav.busca, nav.conta);
  const contas = useMemo(() => Array.from(new Set(linhas.map(o => o.conta).filter((c): c is string => !!c))).sort(), [linhas]);
  const prontas = filtradas.filter(o => !!o.parceiro_sugerido_id);
  const identificar = filtradas.filter(o => !o.parceiro_sugerido_id);
  return <TooltipProvider><div className="space-y-4 min-w-0">
    {query.isLoading ? <div className="space-y-3"><Skeleton className="h-9" /><Skeleton className="h-48" /></div> : query.isError ? <ErroLeitura error={query.error} /> : <>
      <div className="flex flex-wrap xl:flex-nowrap items-center gap-3">
        <p className="flex-1 text-xs leading-relaxed">{linhas.length} créditos sem dono · {formatBRL(linhas.reduce((s, o) => s + Number(o.valor), 0))} · {linhas.filter(o => !!o.parceiro_sugerido_id).length} prontos para aceitar · mais antigo há {Math.max(0, ...linhas.map(o => Number(o.dias_em_aberto ?? 0)))} dias</p>
        <div className="flex gap-2 min-w-0"><div className="relative w-48"><Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar pagador, documento ou valor" placeholder="Pagador, documento ou valor" className="h-8 pl-8 text-xs" value={nav.busca} onChange={e => setNav({ busca: e.target.value })} /></div><Select value={nav.conta} onValueChange={conta => setNav({ conta })}><SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas as contas</SelectItem>{contas.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {!linhas.length ? <div className="py-12 text-center text-sm text-muted-foreground">Nenhum crédito sem dono. Tudo identificado.</div> : <><BlocoOrfaos titulo="Prontos para aceitar" linhas={prontas} sugestao atribuir={setEmAtribuicao} retirar={setEmRetirada} /><BlocoOrfaos titulo="Para identificar" linhas={identificar} sugestao={false} atribuir={setEmAtribuicao} retirar={setEmRetirada} />{!filtradas.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum crédito com estes filtros.</p>}</>}
    </>}
    <Resolvidos />
    {emAtribuicao && <DialogAtribuir key={emAtribuicao.movimentacao_id} orfao={emAtribuicao} aberto onFechar={() => setEmAtribuicao(null)} />}
    {emRetirada && <DialogNaoRecebivel key={emRetirada.movimentacao_id} orfao={emRetirada} onFechar={() => setEmRetirada(null)} />}
  </div></TooltipProvider>;
}
