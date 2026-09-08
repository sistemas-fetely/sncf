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
  UserSearch,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
                    {clienteNome ?? "Buscar por nome ou CNPJ"}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar cliente por nome ou CNPJ"
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
        nota: `Aceita sugestão (${orfao.sugestao_forca ?? "sem força"})`,
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
      Aceitar sugestão
    </Button>
  );
}

/* ------------------------------------------------------------------ tela */

export default function ConciliacaoOrfaos() {
  const { data: orfaos, isLoading, isError, error } = useConciliacaoOrfaos();
  const [filtroConta, setFiltroConta] = useState("todas");
  const [filtroMeio, setFiltroMeio] = useState("todos");
  const [filtroSugestao, setFiltroSugestao] = useState("todos");
  const [emAtribuicao, setEmAtribuicao] = useState<OrfaoEntrada | null>(null);

  const linhas = orfaos ?? [];

  const contas = useMemo(
    () => Array.from(new Set(linhas.map((o) => o.conta).filter(Boolean) as string[])).sort(),
    [linhas],
  );
  const meios = useMemo(
    () => Array.from(new Set(linhas.map((o) => o.meio).filter(Boolean) as string[])).sort(),
    [linhas],
  );

  const filtradas = useMemo(
    () =>
      linhas.filter((o) => {
        if (filtroConta !== "todas" && o.conta !== filtroConta) return false;
        if (filtroMeio !== "todos" && o.meio !== filtroMeio) return false;
        if (filtroSugestao === "com" && !o.parceiro_sugerido_id) return false;
        if (filtroSugestao === "sem" && o.parceiro_sugerido_id) return false;
        return true;
      }),
    [linhas, filtroConta, filtroMeio, filtroSugestao],
  );

  const kpis = useMemo(() => {
    const total = linhas.length;
    const valorTotal = linhas.reduce((s, o) => s + Number(o.valor ?? 0), 0);
    const comSug = linhas.filter((o) => !!o.parceiro_sugerido_id);
    const valorSug = comSug.reduce((s, o) => s + Number(o.valor ?? 0), 0);
    const maisAntigo = linhas.reduce((m, o) => Math.max(m, Number(o.dias_em_aberto ?? 0)), 0);
    return { total, valorTotal, comSug: comSug.length, valorSug, maisAntigo };
  }, [linhas]);

  return (
    <PageShell>
      <PageHeader
        titulo="Órfãos de Entrada"
        icone={UserSearch}
        estado={
          isError
            ? "fila indisponível"
            : `${kpis.total} crédito(s) sem dono · ${kpis.comSug} com sugestão`
        }
        breadcrumb={[
          { label: "Finanças", href: "/administrativo" },
          { label: "Órfãos de Entrada" },
        ]}
      />

      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-3xl">
        Créditos bancários em que o sistema não identificou o cliente. Ao dizer de quem é, o pagador
        é ensinado e o crédito entra na conta do cliente, quitando títulos em ordem de vencimento.
      </p>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a fila</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Erro desconhecido."}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Órfãos na fila
            </p>
            <p className="text-2xl font-medium">{isError ? "—" : kpis.total}</p>
            <p className="text-xs text-muted-foreground">{formatBRL(kpis.valorTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Com sugestão
            </p>
            <p className="text-2xl font-medium text-success">{isError ? "—" : kpis.comSug}</p>
            <p className="text-xs text-muted-foreground">{formatBRL(kpis.valorSug)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mais antigo</p>
            <p
              className={cn(
                "text-2xl font-medium",
                kpis.maisAntigo >= 7 ? "text-warning" : undefined,
              )}
            >
              {isError ? "—" : kpis.maisAntigo}
            </p>
            <p className="text-xs text-muted-foreground">dias em aberto</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtroConta} onValueChange={setFiltroConta}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="Conta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as contas</SelectItem>
            {contas.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroMeio} onValueChange={setFiltroMeio}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Meio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meios</SelectItem>
            {meios.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroSugestao} onValueChange={setFiltroSugestao}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Sugestão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Com e sem sugestão</SelectItem>
            <SelectItem value="com">Só com sugestão</SelectItem>
            <SelectItem value="sem">Só sem sugestão</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-[11px] text-muted-foreground ml-auto">
          {filtradas.length} de {linhas.length}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <TooltipProvider>
          <div className="rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Meio</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Contraparte</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead>Sugestão</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-6">
                      Nenhum crédito órfão com estes filtros.
                    </TableCell>
                  </TableRow>
                )}
                {filtradas.map((o) => {
                  const dias = Number(o.dias_em_aberto ?? 0);
                  const doc = formatarDocumento(o.contraparte_documento);
                  return (
                    <TableRow key={o.movimentacao_id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateBR(o.data_transacao)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium whitespace-nowrap">
                        {formatBRL(o.valor)}
                      </TableCell>
                      <TableCell>
                        {o.meio ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {o.meio}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate">{o.descricao ?? "—"}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[380px]">
                            {o.descricao ?? "sem descrição"}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="block">{o.contraparte_nome ?? "—"}</span>
                        {doc && (
                          <span className="block text-[10px] text-muted-foreground">{doc}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{o.conta ?? "—"}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-xs",
                          dias >= 7 ? "text-warning font-medium" : undefined,
                        )}
                      >
                        <span>{dias}</span>
                        {o.pos_corte && (
                          <Badge variant="outline" className="ml-1.5 text-[10px]">
                            pós-corte
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {o.parceiro_sugerido_id ? (
                          <div className="space-y-0.5">
                            <span className="block">{o.parceiro_sugerido_nome ?? "cliente"}</span>
                            {o.sugestao_forca && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] text-success border-success/30"
                              >
                                {ROTULO_FORCA[o.sugestao_forca]}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">sem sugestão</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {o.parceiro_sugerido_id && <BotaoAceitarSugestao orfao={o} />}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => setEmAtribuicao(o)}
                          >
                            <Search className="h-3 w-3" />
                            Atribuir…
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}

      {emAtribuicao && (
        <DialogAtribuir
          key={emAtribuicao.movimentacao_id}
          orfao={emAtribuicao}
          aberto
          onFechar={() => setEmAtribuicao(null)}
        />
      )}
    </PageShell>
  );
}
