import { Fragment, useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronDown, ChevronRight, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { useEstadoTela } from "@/lib/navegacao";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { cn } from "@/lib/utils";
import { rawMessage } from "@/lib/format-error";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { filtrarGrupos, faixaConfianca, periodo, type FiltroConfianca, type FiltroPendencia, type GrupoMesa } from "@/lib/despesas/mesaClassificacao";
import { useClassificarGrupo, useGruposMesa, useItensMesa, useListasMesa } from "@/hooks/despesas/useMesaClassificacao";

const PAGE = 50;
const SEM = "__nenhum__";

function BadgeConfianca({ c }: { c: number | null }) {
  const f = faixaConfianca(c);
  if (!f) return null;
  const cls = f === "alta" ? "bg-success/15 text-success border-success/30" : f === "media" ? "bg-warning/15 text-warning border-warning/30" : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={cn("text-[10px]", cls)}>{f === "alta" ? "Alta" : f === "media" ? "Média" : "Baixa"} · {c}</Badge>;
}

type Alvo = { grupo: GrupoMesa; ids: string[] | null };

function DialogClassificar({ alvo, onClose }: { alvo: Alvo | null; onClose: () => void }) {
  const g = alvo?.grupo;
  const { planos, centros, destinos } = useListasMesa();
  const classificar = useClassificarGrupo();
  const [plano, setPlano] = useState<string | null>(null);
  const [centro, setCentro] = useState<string>(SEM);
  const [destino, setDestino] = useState<string>(SEM);
  const [regra, setRegra] = useState(true);
  const [abrirPlano, setAbrirPlano] = useState(false);
  const [chaveIni, setChaveIni] = useState<string | null>(null);
  const k = g ? `${g.porta}|${g.chave}|${alvo?.ids?.join(",") ?? ""}` : null;
  if (g && k !== chaveIni) {
    setChaveIni(k);
    setPlano(g.sug_plano_contas_id);
    setCentro(g.sug_centro_custo_id ?? SEM);
    setDestino(g.porta === "nf" && g.sug_destino_codigo ? g.sug_destino_codigo : SEM);
    setRegra(g.regra_automatica ?? true);
  }
  const planoSel = planos.data?.find((p) => p.id === plano);
  const modoItens = !!alvo?.ids;
  const erroListas = planos.error || centros.error || destinos.error;
  const confirmar = async () => {
    if (!g || !plano) return;
    try {
      await classificar.mutateAsync({
        p_porta: g.porta, p_chave: g.chave, p_plano_contas_id: plano,
        p_centro_custo_id: centro === SEM ? null : centro,
        p_destino_codigo: g.porta === "nf" && destino !== SEM ? destino : null,
        p_despesa_ids: alvo?.ids ?? null, p_vira_regra: modoItens ? false : regra,
      });
      onClose();
    } catch { /* toast no hook */ }
  };
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Classificar grupo · {g?.rotulo ?? g?.chave}</DialogTitle>
          <DialogDescription>
            {modoItens ? `${alvo!.ids!.length} selecionados` : `${g?.itens ?? 0} lançamentos · ${formatBRL(Number(g?.valor ?? 0))}`}
          </DialogDescription>
        </DialogHeader>
        {erroListas ? <div className="text-sm text-destructive">{rawMessage(erroListas)}</div> : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Plano de contas *</Label>
              <Popover open={abrirPlano} onOpenChange={setAbrirPlano}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="truncate">{planoSel ? `${planoSel.codigo} — ${planoSel.nome}` : planos.isLoading ? "Carregando…" : "Escolher conta"}</span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por código ou nome" />
                    <CommandList>
                      <CommandEmpty>Nenhuma conta.</CommandEmpty>
                      <CommandGroup>
                        {planos.data?.map((p) => (
                          <CommandItem key={p.id} value={`${p.codigo} ${p.nome}`} onSelect={() => { setPlano(p.id); setAbrirPlano(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", plano === p.id ? "opacity-100" : "opacity-0")} />
                            {p.codigo} — {p.nome}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label>Centro de custo</Label>
              <Select value={centro} onValueChange={setCentro}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem centro</SelectItem>
                  {centros.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} {c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {g?.porta === "nf" && (
              <div className="space-y-1">
                <Label>Destino da nota</Label>
                <Select value={destino} onValueChange={setDestino}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Manter destino atual</SelectItem>
                    {destinos.data?.map((d) => <SelectItem key={d.codigo} value={d.codigo}>{d.rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!modoItens && (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <Label htmlFor="vira-regra" className="text-sm font-normal">Usar esta decisão para os próximos lançamentos deste fornecedor</Label>
                <Switch id="vira-regra" checked={regra} onCheckedChange={setRegra} />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={classificar.isPending}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!plano || classificar.isPending}>
            {classificar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItensGrupo({ g, onClassificar }: { g: GrupoMesa; onClassificar: (ids: string[]) => void }) {
  const q = useItensMesa(g.porta, g.chave, true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  if (q.isLoading) return <Skeleton className="h-16 w-full" />;
  if (q.isError) return <div className="text-sm text-destructive">{rawMessage(q.error)}</div>;
  const itens = q.data ?? [];
  const todos = itens.length > 0 && sel.size === itens.length;
  const tog = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="space-y-2">
      {sel.size > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{sel.size} selecionados</span>
          <Button size="sm" onClick={() => onClassificar([...sel])}>Classificar selecionados</Button>
        </div>
      )}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"><Checkbox checked={todos} onCheckedChange={(v) => setSel(v ? new Set(itens.map((i) => i.despesa_id)) : new Set())} /></TableHead>
            <TableHead className="w-24">Competência</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="w-20">NF nº</TableHead>
            <TableHead className="w-48">Plano atual</TableHead>
            <TableHead className="w-36">Centro atual</TableHead>
            <TableHead className="w-28 text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((i) => (
            <TableRow key={i.despesa_id}>
              <TableCell><Checkbox checked={sel.has(i.despesa_id)} onCheckedChange={() => tog(i.despesa_id)} /></TableCell>
              <TableCell className="text-xs">{i.data_competencia ? formatDateBR(i.data_competencia) : "—"}</TableCell>
              <TableCell className="truncate text-xs" title={[i.descricao, i.pista].filter(Boolean).join(" · ")}>
                {i.descricao ?? "—"}{i.pista && <span className="text-muted-foreground"> · {i.pista}</span>}
              </TableCell>
              <TableCell className="text-xs">{i.nf_numero ?? "—"}</TableCell>
              <TableCell className="truncate text-xs" title={i.plano_codigo ? `${i.plano_codigo} — ${i.plano_nome}` : undefined}>
                {i.falta_plano ? <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30 text-[10px]">sem plano</Badge> : `${i.plano_codigo} — ${i.plano_nome}`}
              </TableCell>
              <TableCell className="truncate text-xs">{i.centro_codigo ? `${i.centro_codigo} ${i.centro_nome ?? ""}` : "—"}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatBRL(Number(i.valor))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function MesaClassificacao() {
  const [nav, setNav] = useEstadoTela({ porta: "todas", pendencia: "sem_plano", confianca: "todas", busca: "", pagina: 1 }, { prefixo: "mc", replaceKeys: ["busca"] });
  const q = useGruposMesa();
  const classificar = useClassificarGrupo();
  const [aberto, setAberto] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const pend = nav.pendencia as FiltroPendencia;
  const lista = useMemo(() => filtrarGrupos(q.data ?? [], { porta: nav.porta as string, pendencia: pend, confianca: nav.confianca as FiltroConfianca, busca: nav.busca as string }), [q.data, nav.porta, pend, nav.confianca, nav.busca]);
  const kpi = useMemo(() => ({ grupos: lista.length, itens: lista.reduce((s, g) => s + Number(g.itens_sem_plano ?? 0), 0), valor: lista.reduce((s, g) => s + Number(g.valor_sem_plano ?? 0), 0) }), [lista]);
  const paginas = Math.max(1, Math.ceil(lista.length / PAGE));
  const pag = Math.min(Number(nav.pagina) || 1, paginas);
  const visiveis = lista.slice((pag - 1) * PAGE, pag * PAGE);
  const confirmar = (g: GrupoMesa) => classificar.mutate({
    p_porta: g.porta, p_chave: g.chave, p_plano_contas_id: g.sug_plano_contas_id!, p_centro_custo_id: g.sug_centro_custo_id,
    p_destino_codigo: g.porta === "nf" ? g.sug_destino_codigo : null, p_despesa_ids: null, p_vira_regra: !!g.regra_automatica,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[["Grupos a classificar", String(kpi.grupos)], ["Lançamentos sem plano", String(kpi.itens)], ["Valor sem plano", formatBRL(kpi.valor)]].map(([t, v]) => (
          <Card key={t}><CardContent className="p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{t}</div><div className="mt-1 text-2xl font-serif">{v}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar fornecedor, chave ou pista" value={nav.busca as string} onChange={(e) => setNav({ busca: e.target.value, pagina: 1 })} />
            </div>
            <Select value={nav.porta as string} onValueChange={(v) => setNav({ porta: v, pagina: 1 })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todas">Todas</SelectItem><SelectItem value="nf">NF</SelectItem><SelectItem value="cartao">Cartão</SelectItem></SelectContent>
            </Select>
            <Select value={pend} onValueChange={(v) => setNav({ pendencia: v, pagina: 1 })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="sem_plano">Sem plano</SelectItem><SelectItem value="sem_centro">Sem centro</SelectItem><SelectItem value="todas">Todas</SelectItem></SelectContent>
            </Select>
            <Select value={nav.confianca as string} onValueChange={(v) => setNav({ confianca: v, pagina: 1 })}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda confiança</SelectItem><SelectItem value="alta">Alta (≥75)</SelectItem>
                <SelectItem value="media">Média (50–74)</SelectItem><SelectItem value="baixa">Baixa (&lt;50)</SelectItem><SelectItem value="sem">Sem sugestão</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {q.isLoading ? <Skeleton className="h-40 w-full" />
            : q.isError ? <div className="text-sm text-destructive">{rawMessage(q.error)}</div>
            : lista.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground"><CheckCircle2 className="h-8 w-8 text-success" />Tudo classificado.</div>
            ) : (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Fornecedor / Estabelecimento</TableHead>
                    <TableHead className="w-14 text-right">Itens</TableHead>
                    <TableHead className="w-28 text-right">Valor</TableHead>
                    <TableHead className="w-28">Período</TableHead>
                    <TableHead className="w-[30%]">Sugestão</TableHead>
                    <TableHead className="w-44 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((g) => {
                    const id = `${g.porta}|${g.chave}`;
                    const exp = aberto === id;
                    const temSug = !!g.sug_plano_contas_id;
                    const muda = g.porta === "nf" && g.sug_destino_codigo && g.sug_destino_codigo !== g.destinos;
                    return (
                      <Fragment key={id}>
                        <TableRow data-foco-id={id} className="align-top">
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ver itens" onClick={() => setAberto(exp ? null : id)}>
                              {exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="min-w-0">
                            <div className="truncate font-medium" title={g.rotulo ?? g.chave}>{g.rotulo ?? g.chave}</div>
                            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="shrink-0 text-[10px]">{g.porta === "nf" ? "NF" : "Cartão"}</Badge>
                              {g.porta === "nf" && /^\d{14}$/.test(g.chave) && <span className="shrink-0 font-mono">{formatCNPJ(g.chave)}</span>}
                              {g.pista && <span className="truncate" title={g.pista}>{g.pista}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{pend === "sem_centro" ? g.itens : g.itens_sem_plano}</TableCell>
                          <TableCell className="text-right font-mono">{formatBRL(Number(pend === "sem_centro" ? g.valor : g.valor_sem_plano))}</TableCell>
                          <TableCell className="text-xs">{periodo(g.de, g.ate)}</TableCell>
                          <TableCell className="min-w-0 text-xs">
                            {temSug ? (
                              <div className="space-y-1">
                                <div className="truncate font-medium" title={`${g.sug_plano_codigo} — ${g.sug_plano_nome}`}>{g.sug_plano_codigo} — {g.sug_plano_nome}</div>
                                {g.sug_centro_codigo && <div className="truncate text-muted-foreground">Centro: {g.sug_centro_codigo} {g.sug_centro_nome}</div>}
                                {g.sug_motivo && <div className="truncate text-muted-foreground" title={g.sug_motivo}>{g.sug_motivo}</div>}
                                <div className="flex flex-wrap gap-1">
                                  <BadgeConfianca c={g.sug_confianca} />
                                  {muda && <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30 text-[10px]">Muda destino → {g.sug_destino_rotulo}</Badge>}
                                  {g.regra_automatica === false && <Badge variant="outline" className="text-[10px] text-muted-foreground">Não vira regra</Badge>}
                                </div>
                              </div>
                            ) : <span className="text-muted-foreground">Sem sugestão</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {temSug && (
                                <Button size="sm" disabled={classificar.isPending} onClick={() => confirmar(g)}>
                                  {classificar.isPending && classificar.variables?.p_chave === g.chave && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Confirmar
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => setAlvo({ grupo: g, ids: null })}>Trocar</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {exp && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={7} className="p-3"><ItensGrupo g={g} onClassificar={(ids) => setAlvo({ grupo: g, ids })} /></TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          {paginas > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
              Página {pag} de {paginas}
              <Button size="sm" variant="outline" disabled={pag <= 1} onClick={() => setNav({ pagina: pag - 1 })}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={pag >= paginas} onClick={() => setNav({ pagina: pag + 1 })}>Próxima</Button>
            </div>
          )}
        </CardContent>
      </Card>
      <DialogClassificar alvo={alvo} onClose={() => setAlvo(null)} />
    </div>
  );
}
