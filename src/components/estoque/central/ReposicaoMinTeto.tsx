import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatError } from "@/lib/format-error";
import { numeroOuNulo, validarMinTeto } from "@/lib/estoque/reposicaoMinTeto";
import type { LinhaReposicaoTabela } from "@/lib/estoque/reposicaoSpTabela";

const dataBR = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString("pt-BR") : "";

function useGravarMinTeto() {
  const qc = useQueryClient();
  const depois = async (msg: string) => { toast.success(msg); await qc.invalidateQueries({ queryKey: ["reposicao-sp"] }); await qc.invalidateQueries({ queryKey: ["reposicao-regua"] }); };
  const falha = (e: unknown) => toast.error(formatError(e));
  const definir = useMutation({
    mutationFn: async (a: { skus: string[]; minimo: number | null; teto: number | null; motivo: string }) => {
      const { data, error } = await supabase.rpc("reposicao_excecao_definir", { p_skus: a.skus, p_minimo: a.minimo, p_teto: a.teto, p_motivo: a.motivo.trim() || null });
      if (error) throw error; return data;
    }, onSuccess: n => depois(`Mín/teto manual gravado em ${n} produto(s).`), onError: falha,
  });
  const remover = useMutation({
    mutationFn: async (skus: string[]) => { const { data, error } = await supabase.rpc("reposicao_excecao_remover", { p_skus: skus }); if (error) throw error; return data; },
    onSuccess: n => depois(`${n} produto(s) voltaram à régua.`), onError: falha,
  });
  return { definir, remover };
}

export function SeloMinTeto({ l }: { l: LinhaReposicaoTabela }) {
  if (l.excecao) return <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="ml-1 px-1 py-0 text-[10px] font-normal">manual</Badge></TooltipTrigger><TooltipContent>{[l.excecao_motivo || "Sem motivo", dataBR(l.excecao_em)].filter(Boolean).join(" · ")}</TooltipContent></Tooltip>;
  if (l.excecao_vencida) return <Tooltip><TooltipTrigger asChild><Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px] font-normal">régua</Badge></TooltipTrigger><TooltipContent>Exceção caiu: o produto mudou de classe</TooltipContent></Tooltip>;
  return null;
}

function FormMinTeto({ l, onFeito }: { l: LinhaReposicaoTabela; onFeito?: () => void }) {
  const { definir, remover } = useGravarMinTeto();
  const [min, setMin] = useState(String(l.minimo ?? "")); const [teto, setTeto] = useState(String(l.teto ?? "")); const [motivo, setMotivo] = useState(l.excecao ? l.excecao_motivo ?? "" : "");
  const erro = validarMinTeto(numeroOuNulo(min), numeroOuNulo(teto), { exigirAmbos: true });
  const ocupado = definir.isPending || remover.isPending;
  return <div className="space-y-2 text-xs">
    <div className="flex gap-2"><label className="flex-1">Mín<Input className="h-8 text-right tabular-nums" type="number" min={0} value={min} onChange={e => setMin(e.target.value)} /></label><label className="flex-1">Teto<Input className="h-8 text-right tabular-nums" type="number" min={0} value={teto} onChange={e => setTeto(e.target.value)} /></label></div>
    <Input className="h-8" placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
    {erro && <p className="text-destructive">{erro}</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={!!erro || ocupado} onClick={() => definir.mutate({ skus: [l.sku], minimo: numeroOuNulo(min), teto: numeroOuNulo(teto), motivo }, { onSuccess: onFeito })}>Salvar</Button>
      {l.excecao && <Button size="sm" variant="outline" disabled={ocupado} onClick={() => remover.mutate([l.sku], { onSuccess: onFeito })}>Voltar à régua ({l.regua_minimo ?? "—"}/{l.regua_teto ?? "—"})</Button>}
    </div>
  </div>;
}

export function CelulaMinTeto({ l }: { l: LinhaReposicaoTabela }) {
  const [aberto, setAberto] = useState(false);
  return <Popover open={aberto} onOpenChange={setAberto}>
    <PopoverTrigger asChild><button type="button" className="tabular-nums underline decoration-dotted underline-offset-2 hover:text-primary" aria-label={`Editar mín/teto de ${l.sku}`}>{l.minimo ?? "—"}/{l.teto ?? "—"}</button></PopoverTrigger>
    <PopoverContent className="w-64" align="end">{aberto && <FormMinTeto l={l} onFeito={() => setAberto(false)} />}</PopoverContent>
  </Popover>;
}

export function DialogoMinTetoMassa({ skus, open, onOpenChange }: { skus: string[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { definir, remover } = useGravarMinTeto();
  const [min, setMin] = useState(""); const [teto, setTeto] = useState(""); const [motivo, setMotivo] = useState("");
  const erro = validarMinTeto(numeroOuNulo(min), numeroOuNulo(teto));
  const ocupado = definir.isPending || remover.isPending;
  const fechar = () => { onOpenChange(false); setMin(""); setTeto(""); setMotivo(""); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-sm">
    <DialogHeader><DialogTitle>Mín/Teto dos selecionados</DialogTitle><DialogDescription>{skus.length} produto(s) serão afetados. Campo vazio mantém o valor atual.</DialogDescription></DialogHeader>
    <div className="space-y-2 text-sm">
      <div className="flex gap-2"><label className="flex-1">Mín<Input type="number" min={0} value={min} onChange={e => setMin(e.target.value)} /></label><label className="flex-1">Teto<Input type="number" min={0} value={teto} onChange={e => setTeto(e.target.value)} /></label></div>
      <Input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
      {erro && (min || teto) && <p className="text-xs text-destructive">{erro}</p>}
    </div>
    <DialogFooter className="gap-2">
      <Button variant="outline" disabled={ocupado || !skus.length} onClick={() => remover.mutate(skus, { onSuccess: fechar })}>Voltar à régua</Button>
      <Button disabled={!!erro || ocupado || !skus.length} onClick={() => definir.mutate({ skus, minimo: numeroOuNulo(min), teto: numeroOuNulo(teto), motivo }, { onSuccess: fechar })}>Salvar</Button>
    </DialogFooter>
  </DialogContent></Dialog>;
}

type Regua = { classe: string; rotulo: string; minimo: number; teto: number; teto_mais_inner: boolean; ordem: number };

function LinhaRegua({ r }: { r: Regua }) {
  const qc = useQueryClient();
  const [min, setMin] = useState(String(r.minimo)); const [teto, setTeto] = useState(String(r.teto)); const [inner, setInner] = useState(r.teto_mais_inner);
  const erro = validarMinTeto(numeroOuNulo(min), inner ? numeroOuNulo(min) : numeroOuNulo(teto), { exigirAmbos: true });
  const salvar = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("reposicao_regua_atualizar", { p_classe: r.classe, p_minimo: numeroOuNulo(min)!, p_teto: numeroOuNulo(teto) ?? numeroOuNulo(min)!, p_teto_mais_inner: inner }); if (error) throw error; },
    onSuccess: async () => { toast.success(`Régua de ${r.rotulo} salva.`); await qc.invalidateQueries({ queryKey: ["reposicao-regua"] }); await qc.invalidateQueries({ queryKey: ["reposicao-sp"] }); },
    onError: e => toast.error(formatError(e)),
  });
  return <tr className="border-t">
    <td className="p-2">{r.rotulo}</td>
    <td className="p-2"><Input className="h-8 w-16 text-right tabular-nums" type="number" min={0} value={min} onChange={e => setMin(e.target.value)} aria-label={`Mínimo ${r.rotulo}`} /></td>
    <td className="p-2"><Input className="h-8 w-16 text-right tabular-nums" type="number" min={0} disabled={inner} value={teto} onChange={e => setTeto(e.target.value)} aria-label={`Teto ${r.rotulo}`} /></td>
    <td className="p-2"><Switch checked={inner} onCheckedChange={setInner} aria-label={`Teto = mín + inner ${r.rotulo}`} /></td>
    <td className="p-2"><Button size="sm" variant="outline" disabled={!!erro || salvar.isPending} title={erro ?? undefined} onClick={() => salvar.mutate()}>Salvar</Button></td>
  </tr>;
}

function LinhaExcecao({ l }: { l: LinhaReposicaoTabela }) {
  return <li className="border-t py-2 text-xs"><div className="mb-1 flex flex-wrap items-center gap-1"><span className="font-medium">{l.cod_cadastro ?? l.sku}</span><span className="text-muted-foreground">{l.nome_comercial}</span><SeloMinTeto l={l} />{l.excecao && l.excecao_em && <span className="text-muted-foreground">· {dataBR(l.excecao_em)}</span>}</div><FormMinTeto key={`${l.sku}-${l.minimo}-${l.teto}-${l.excecao}`} l={l} /></li>;
}

export function BotaoRegua({ linhas }: { linhas: LinhaReposicaoTabela[] }) {
  const [aberto, setAberto] = useState(false); const [busca, setBusca] = useState("");
  const regua = useQuery({ queryKey: ["reposicao-regua"], enabled: aberto, queryFn: async () => {
    const { data, error } = await supabase.from("reposicao_regua").select("classe,rotulo,minimo,teto,teto_mais_inner,ordem").eq("ativo", true).order("ordem");
    if (error) throw error; return data as Regua[];
  } });
  const lista = useMemo(() => {
    const t = busca.trim().toLocaleLowerCase("pt-BR");
    const base = t ? linhas.filter(l => [l.sku, l.cod_cadastro, l.nome_comercial].some(v => v?.toLocaleLowerCase("pt-BR").includes(t))) : linhas.filter(l => l.excecao);
    return [...base].sort((a, b) => Number(!!b.excecao) - Number(!!a.excecao)).slice(0, 50);
  }, [linhas, busca]);
  return <>
    <Button variant="outline" size="sm" className="h-9" onClick={() => setAberto(true)}><SlidersHorizontal className="mr-2 h-4 w-4" />Régua</Button>
    <Sheet open={aberto} onOpenChange={setAberto}><SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader><SheetTitle>Régua de reposição</SheetTitle></SheetHeader>
      <section className="mt-4 space-y-2"><h3 className="text-sm font-semibold">Régua por classe</h3><p className="text-xs text-muted-foreground">Vale para todos os produtos da classe que não têm mín/teto manual.</p>
        {regua.error ? <p className="text-xs text-destructive">{formatError(regua.error)}</p> : <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-2">Classe</th><th className="p-2">Mín</th><th className="p-2">Teto</th><th className="p-2">Teto = mín + inner</th><th /></tr></thead><tbody>{(regua.data ?? []).map(r => <LinhaRegua key={`${r.classe}-${r.minimo}-${r.teto}-${r.teto_mais_inner}`} r={r} />)}{regua.isLoading && <tr><td colSpan={5} className="p-2 text-muted-foreground">Carregando…</td></tr>}</tbody></table>}
      </section>
      <section className="mt-6 space-y-2"><h3 className="text-sm font-semibold">Mín/Teto manual por produto</h3>
        <Input className="h-9" placeholder="Buscar código ou nome (todos os produtos)" value={busca} onChange={e => setBusca(e.target.value)} />
        {!lista.length ? <p className="text-xs text-muted-foreground">{busca ? "Nenhum produto encontrado." : "Nenhum produto com mín/teto manual."}</p> : <ul>{lista.map(l => <LinhaExcecao key={l.sku} l={l} />)}</ul>}
      </section>
    </SheetContent></Sheet>
  </>;
}
