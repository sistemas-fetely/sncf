import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, ChevronDown, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CodProduto } from "@/components/produto/CodProduto";
import { MiniaturaProduto } from "@/components/estoque/MiniaturaProduto";
import { LeitorCodigoBarras, type LeituraCodigo } from "@/components/estoque/LeitorCodigoBarras";
import { useFotosPrincipais } from "@/hooks/useFotosProduto";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { useEstadoTela } from "@/lib/navegacao";
import { formatError } from "@/lib/format-error";
import { hojeISO, fmtData } from "@/lib/data";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Centro { id: string; codigo: string; rotulo: string; estab: string }
interface Item { sku: string; cod_cadastro: string | null; nome: string | null; qtd: string }
interface Hist {
  numero: string; data: string; origem_rotulo: string | null; destino_rotulo: string | null;
  sku: string; nome_comercial: string | null; cod_cadastro: string | null; quantidade: number; obs: string | null;
}

const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const diaSeguinte = (iso: string) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

interface PainelProps {
  /** Mostra o formulário de transferência (origem/destino, itens, botão). */
  mostrarFormulario?: boolean;
  /** Mostra o histórico agrupado por número (TI-000X). */
  mostrarHistorico?: boolean;
  rotuloBotao?: string;
  tituloHistorico?: string;
  /** Selo "Sem NF · entre CDs SP" em cada linha do histórico. */
  seloSemNf?: boolean;
}

export function TransferenciaInternaPainel({
  mostrarFormulario = true, mostrarHistorico = true, rotuloBotao = "Transferir",
  tituloHistorico = "Histórico", seloSemNf = false,
}: PainelProps = {}) {
  const qc = useQueryClient();
  const [nav, setNav] = useEstadoTela({ origem: "", destino: "", de: diasAtras(30), ate: hojeISO() }, { prefixo: "ti" });
  const [itens, setItens] = useState<Item[]>([]);
  const [obs, setObs] = useState("");
  // Separação física antecipada: permite itens acima do disponível na origem (saldo negativo até a entrada).
  const [permitirNegativo, setPermitirNegativo] = useState(false);
  const [termo, setTermo] = useState("");
  const [debounced, setDebounced] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const permContagem = usePermissaoAcaoOuSuperAdmin("acao.estoque_contagem_registrar");
  const permExpedicao = usePermissaoAcaoOuSuperAdmin("acao.expedicao_sp_operar");
  const podeTransferir = permContagem.permitido || permExpedicao.permitido;

  useEffect(() => { const t = setTimeout(() => setDebounced(termo.trim()), 300); return () => clearTimeout(t); }, [termo]);

  // Pares possíveis: centros ativos do mesmo estabelecimento fiscal (coalesce(centro_fiscal_id, id)).
  const centrosQ = useQuery({
    queryKey: ["ti-centros"],
    queryFn: async (): Promise<Centro[]> => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao").select("id,codigo,nome,rotulo_curto,centro_fiscal_id").eq("ativo", true).order("codigo");
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({ id: c.id, codigo: c.codigo, rotulo: c.rotulo_curto ?? c.nome ?? c.codigo, estab: c.centro_fiscal_id ?? c.id }));
    },
  });
  const elegiveis = useMemo(() => {
    const cs = centrosQ.data ?? [];
    const porEstab = new Map<string, number>();
    cs.forEach((c) => porEstab.set(c.estab, (porEstab.get(c.estab) ?? 0) + 1));
    return cs.filter((c) => (porEstab.get(c.estab) ?? 0) > 1);
  }, [centrosQ.data]);
  const origemC = elegiveis.find((c) => c.codigo === nav.origem) ?? null;
  const destinosPossiveis = elegiveis.filter((c) => origemC && c.estab === origemC.estab && c.codigo !== origemC.codigo);
  const destinoC = destinosPossiveis.find((c) => c.codigo === nav.destino) ?? null;

  // Padrão: primeiro par disponível.
  useEffect(() => {
    if (elegiveis.length === 0) return;
    if (origemC && destinoC) return;
    const o = origemC ?? elegiveis[0];
    const d = elegiveis.find((c) => c.estab === o.estab && c.codigo !== o.codigo);
    if (d) setNav({ origem: o.codigo, destino: d.codigo });
  }, [elegiveis, origemC, destinoC]); // eslint-disable-line react-hooks/exhaustive-deps

  const skus = itens.map((i) => i.sku);
  const saldoQ = useQuery({
    queryKey: ["ti-estoque-centro", nav.origem, nav.destino, skus.slice().sort().join(",")],
    enabled: skus.length > 0 && !!origemC && !!destinoC,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_estoque_centro").select("sku,centro,disponivel").in("centro", [nav.origem, nav.destino]).in("sku", skus);
      if (error) throw error;
      const m = new Map<string, number>();
      (data ?? []).forEach((r: any) => m.set(`${r.centro}|${r.sku}`, Number(r.disponivel ?? 0)));
      return m;
    },
  });
  const disp = (centro: string, sku: string) => saldoQ.data?.get(`${centro}|${sku}`) ?? 0;

  const buscaQ = useQuery({
    queryKey: ["ti-busca-produto", debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const t = debounced.replace(/[,()%*]/g, " ").trim();
      const { data, error } = await (supabase as any)
        .from("sncf_produtos").select("sku,cod_cadastro,nome_comercial")
        .or(`sku.ilike.%${t}%,cod_cadastro.ilike.%${t}%,nome_comercial.ilike.%${t}%`).order("sku").limit(15);
      if (error) throw error;
      return (data ?? []) as { sku: string; cod_cadastro: string | null; nome_comercial: string | null }[];
    },
  });

  const fotosQ = useFotosPrincipais(itens.map((i) => i.cod_cadastro));

  function somar(p: { sku: string; cod_cadastro: string | null; nome: string | null }, delta: number) {
    setItens((lista) => {
      const i = lista.findIndex((x) => x.sku === p.sku);
      if (i < 0) return delta > 0 ? [...lista, { ...p, qtd: String(delta) }] : lista;
      const atual = Number(lista[i].qtd) || 0;
      const novo = Math.max(0, atual + delta);
      const n = [...lista];
      n[i] = { ...n[i], qtd: String(novo) };
      return n;
    });
  }

  async function aoLer(l: LeituraCodigo) {
    if (itens.some((i) => i.sku === l.sku)) { somar({ sku: l.sku, cod_cadastro: null, nome: null }, l.unidades); return; }
    const { data: p, error } = await (supabase as any)
      .from("sncf_produtos").select("sku,cod_cadastro,nome_comercial").eq("sku", l.sku).maybeSingle();
    if (error) { toast.error(`Falha ao buscar produto ${l.sku}: ${formatError(error)}`); return; }
    somar({ sku: l.sku, cod_cadastro: p?.cod_cadastro ?? null, nome: p?.nome_comercial ?? null }, l.unidades);
  }

  const qtdInvalida = (v: string) => v === "" || isNaN(Number(v)) || Number(v) <= 0 || !Number.isInteger(Number(v));
  const passa = (i: Item) => !!saldoQ.data && Number(i.qtd) > disp(nav.origem, i.sku);
  const algumPassa = itens.some(passa);
  // Com item acima do disponível, exige o checkbox de separação antecipada E observação preenchida.
  const podeEnviar = !algumPassa || (permitirNegativo && obs.trim().length > 0);
  const algumInvalido = itens.some((i) => qtdInvalida(i.qtd));
  const pecas = itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);

  const transferir = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_transferencia_interna", {
        p_origem: nav.origem, p_destino: nav.destino,
        p_itens: itens.map((i) => ({ sku: i.sku, quantidade: Number(i.qtd) })),
        p_observacao: obs.trim() || null,
        p_permitir_negativo: algumPassa && permitirNegativo,
      });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; numero?: string; itens?: number; pecas?: number; saldo_negativo?: boolean; erro?: string };
      if (r.ok === false) throw new Error(r.erro ?? "A transferência não foi registrada.");
      return r;
    },
    onSuccess: async (r) => {
      if (r.saldo_negativo) {
        toast.success(`${r.numero ?? "Transferência"} — ${r.itens ?? itens.length} itens, ${r.pecas ?? pecas} peças — Transferência registrada com saldo negativo na origem — será abatido na entrada.`);
      } else {
        toast.success(`${r.numero ?? "Transferência"} — ${r.itens ?? itens.length} itens, ${r.pecas ?? pecas} peças transferidas`);
      }
      setItens([]); setObs(""); setPermitirNegativo(false);
      await qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes("estoque") });
      await qc.invalidateQueries({ queryKey: ["ti-historico"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const histQ = useQuery({
    queryKey: ["ti-historico", nav.de, nav.ate],
    queryFn: async () => {
      let q = (supabase as any).from("vw_transferencia_interna")
        .select("numero,data,origem_rotulo,destino_rotulo,sku,nome_comercial,cod_cadastro,quantidade,obs")
        .order("data", { ascending: false }).limit(5000);
      if (nav.de) q = q.gte("data", nav.de);
      if (nav.ate) q = q.lt("data", diaSeguinte(nav.ate));
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Hist[];
    },
  });
  const grupos = useMemo(() => {
    const m = new Map<string, Hist[]>();
    (histQ.data ?? []).forEach((h) => { const l = m.get(h.numero) ?? []; l.push(h); m.set(h.numero, l); });
    return [...m.entries()].map(([numero, linhas]) => ({ numero, linhas, cab: linhas[0], pecas: linhas.reduce((s, l) => s + Number(l.quantidade ?? 0), 0) }))
      .sort((a, b) => (b.cab.data ?? "").localeCompare(a.cab.data ?? "") || b.numero.localeCompare(a.numero));
  }, [histQ.data]);

  return (
    <section className="space-y-4">
      {mostrarFormulario && (<>
      <p className="text-sm text-muted-foreground">
        Mova saldo entre centros do mesmo estabelecimento fiscal. Não gera nota — só muda onde a peça está.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={origemC?.codigo ?? ""} onValueChange={(v) => {
          const o = elegiveis.find((c) => c.codigo === v);
          const d = elegiveis.find((c) => o && c.estab === o.estab && c.codigo !== v);
          setNav({ origem: v, destino: d?.codigo ?? "" });
        }}>
          <SelectTrigger className="w-[200px]" aria-label="Origem"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>{elegiveis.map((c) => <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="icon" aria-label="Inverter origem e destino" disabled={!origemC || !destinoC}
          onClick={() => setNav({ origem: nav.destino, destino: nav.origem })}>
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <Select value={destinoC?.codigo ?? ""} onValueChange={(v) => setNav({ destino: v })}>
          <SelectTrigger className="w-[200px]" aria-label="Destino"><SelectValue placeholder="Destino" /></SelectTrigger>
          <SelectContent>{destinosPossiveis.map((c) => <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {centrosQ.isError && <p className="text-sm text-destructive">Falha ao carregar centros: {formatError(centrosQ.error)}</p>}
      {centrosQ.isSuccess && elegiveis.length === 0 && <p className="text-sm text-destructive">Nenhum par de centros do mesmo estabelecimento fiscal encontrado.</p>}
      {saldoQ.isError && <p className="text-sm text-destructive">Falha ao ler saldos: {formatError(saldoQ.error)}</p>}

      <div className="flex flex-wrap items-start gap-2">
        <div className="relative w-[320px]">
          <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar por código, SKU ou nome" />
          {debounced.length >= 2 && termo && (
            <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
              {buscaQ.isLoading ? <div className="p-2 text-sm text-muted-foreground">Buscando…</div>
                : buscaQ.isError ? <div className="p-2 text-sm text-destructive">{formatError(buscaQ.error)}</div>
                : (buscaQ.data ?? []).length === 0 ? <div className="p-2 text-sm text-muted-foreground">Nenhum produto</div>
                : buscaQ.data!.map((p) => (
                  <button key={p.sku} type="button" className="block w-full px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => { somar({ sku: p.sku, cod_cadastro: p.cod_cadastro, nome: p.nome_comercial }, 1); setTermo(""); }}>
                    <span className="font-mono text-xs">{p.cod_cadastro ?? p.sku}</span> · {p.nome_comercial ?? p.sku}
                  </button>
                ))}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <LeitorCodigoBarras onLeitura={(l) => void aoLer(l)} onDesfazer={(l) => somar({ sku: l.sku, cod_cadastro: null, nome: null }, -l.unidades)} />
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">Bipe ou busque produtos para transferir</div>
      ) : (
        <div className="rounded-md border">
          <Table className="text-[12px]">
            <TableHeader className="bg-card"><TableRow>
              <TableHead className="w-[150px]">Código</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="w-[110px] text-right">Disp. {origemC?.rotulo ?? "origem"}</TableHead>
              <TableHead className="w-[110px] text-right">Disp. {destinoC?.rotulo ?? "destino"}</TableHead>
              <TableHead className="w-[120px] text-right">Quantidade</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow></TableHeader>
            <TableBody>
              {itens.map((i) => {
                const excede = passa(i);
                return (
                  <TableRow key={i.sku} className={cn(excede && "bg-destructive/10")}>
                    <TableCell><CodProduto chave={i.sku} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MiniaturaProduto url={i.cod_cadastro ? fotosQ.data?.get(i.cod_cadastro) : null} nome={i.nome} />
                        <span className="truncate">{i.nome ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", excede && "font-medium text-destructive")}>
                      {saldoQ.isLoading ? "…" : disp(nav.origem, i.sku)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{saldoQ.isLoading ? "…" : disp(nav.destino, i.sku)}</TableCell>
                    <TableCell className="text-right">
                      <Input type="number" min={1} step={1} inputMode="numeric" value={i.qtd}
                        aria-invalid={excede || qtdInvalida(i.qtd)}
                        onChange={(e) => setItens((l) => l.map((x) => x.sku === i.sku ? { ...x, qtd: e.target.value } : x))}
                        className={cn("ml-auto h-8 w-24 text-right tabular-nums", (excede || qtdInvalida(i.qtd)) && "border-destructive")} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" aria-label="Remover item" onClick={() => setItens((l) => l.filter((x) => x.sku !== i.sku))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {algumPassa && (<div className="space-y-2">
        <p className="text-sm text-destructive">Há itens com quantidade acima do disponível na origem.</p>
        <label className="flex max-w-xl cursor-pointer items-start gap-2 text-sm">
          <Checkbox checked={permitirNegativo} onCheckedChange={(v) => setPermitirNegativo(v === true)} className="mt-0.5" />
          <span>Separação física antecipada — a entrada ainda não foi finalizada (a origem ficará negativa até a entrada)</span>
        </label>
      </div>)}

      <div className="flex flex-wrap items-end gap-3">
        <Textarea value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder={algumPassa ? "Observação (obrigatória — motivo do saldo negativo)" : "Observação (opcional)"}
          className="min-h-[60px] max-w-xl flex-1" />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground tabular-nums">{itens.length} itens · {pecas} peças</span>
          {podeTransferir && (
            <Button
              disabled={itens.length === 0 || !origemC || !destinoC || !podeEnviar || algumInvalido || saldoQ.isLoading || transferir.isPending}
              onClick={() => transferir.mutate()}
            >
              {transferir.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {rotuloBotao}
            </Button>
          )}
        </div>
      </div>
      </>)}

      {mostrarHistorico && <div className={cn("space-y-2", mostrarFormulario && "pt-4")}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-medium">{tituloHistorico}</h2>
          <Input type="date" value={nav.de} max={nav.ate || undefined} onChange={(e) => setNav({ de: e.target.value })} className="w-[160px]" aria-label="De" />
          <span className="text-sm text-muted-foreground">até</span>
          <Input type="date" value={nav.ate} min={nav.de || undefined} onChange={(e) => setNav({ ate: e.target.value })} className="w-[160px]" aria-label="Até" />
        </div>
        {histQ.isError ? <p className="text-sm text-destructive">Falha ao carregar histórico: {formatError(histQ.error)}</p>
          : histQ.isLoading ? <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
          : grupos.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma transferência no período</div>
          : (
            <div className="rounded-md border">
              <Table className="text-[12px]">
                <TableHeader><TableRow>
                  <TableHead className={seloSemNf ? "w-[260px]" : "w-[140px]"}>Número</TableHead>
                  <TableHead className="w-[110px]">Data</TableHead>
                  <TableHead>Origem → Destino</TableHead>
                  <TableHead className="w-[80px] text-right">Itens</TableHead>
                  <TableHead className="w-[80px] text-right">Peças</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {grupos.map((g) => {
                    const aberto = abertos.has(g.numero);
                    return (
                      <Fragment key={g.numero}>
                        <TableRow className="cursor-pointer" onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(g.numero)) n.delete(g.numero); else n.add(g.numero); return n; })}>
                          <TableCell className="font-medium">
                            <span className="inline-flex items-center gap-1">
                              {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{g.numero}
                            </span>
                            {seloSemNf && <Badge variant="secondary" className="ml-2 whitespace-nowrap">Sem NF · entre CDs SP</Badge>}
                          </TableCell>
                          <TableCell>{fmtData(g.cab.data)}</TableCell>
                          <TableCell>{g.cab.origem_rotulo ?? "—"} → {g.cab.destino_rotulo ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{g.linhas.length}</TableCell>
                          <TableCell className="text-right tabular-nums">{g.pecas}</TableCell>
                          <TableCell className="text-muted-foreground">{g.cab.obs ?? ""}</TableCell>
                        </TableRow>
                        {aberto && g.linhas.map((l) => (
                          <TableRow key={`${g.numero}-${l.sku}`} className="bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={2}><CodProduto chave={l.sku} variant="compacto" /> <span className="text-muted-foreground">{l.nome_comercial ?? ""}</span></TableCell>
                            <TableCell />
                            <TableCell className="text-right tabular-nums">{l.quantidade}</TableCell>
                            <TableCell />
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
      </div>}
    </section>
  );
}

export default TransferenciaInternaPainel;
