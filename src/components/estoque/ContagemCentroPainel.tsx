import { useEstadoTela, resolverAcao, lerLista, escreverLista } from "@/lib/navegacao";
import type { SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { CodProduto } from "@/components/produto/CodProduto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { FiltroColecao } from "@/components/acervo/BlingCardPainel";
import { formatError } from "@/lib/format-error";
import { hojeISO, fmtData } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useFotosPrincipais } from "@/hooks/useFotosProduto";
import { MiniaturaProduto } from "@/components/estoque/MiniaturaProduto";
import { ImportarContagemDialog, type ModoImportacao } from "@/components/estoque/ImportarContagemDialog";
import { X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { diasDesdeContagem, separarContagens, type UltimaContagem } from "@/lib/estoque/contagemValidade";
import {
  sessaoVazia, somarLeitura, definirQtd, removerItem, importarItens, preenchidos, resumoSessao,
  naoContados, itensRegistro, numeroInvalido, chaveRascunho, lerRascunho, type SessaoContagem, type ProdutoCatalogo,
} from "@/lib/estoque/contagemSessao";
import { Badge } from "@/components/ui/badge";
import { LeitorCodigoBarras, type LeituraCodigo } from "@/components/estoque/LeitorCodigoBarras";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Linha {
  cod_cadastro: string | null;
  sku: string;
  nome_comercial: string | null;
  cor_nome: string | null;
  colecao: string | null;
  contabil: number | null;
  fisico: number | null;
  virtual?: number | null;
  achado?: boolean;
}
interface Divergencia { sku: string; contabil: number; contado: number; diferenca: number }
interface Resultado { ok?: boolean; itens?: number; divergencias?: Divergencia[]; erro?: string }

const CENTRO_XPM = "XPM-SC";

// Rascunho da sessão por centro+data (decisão Flavio 09/11/2026): só para não perder a contagem num recarregamento.
function lerStorage(chave: string): SessaoContagem {
  try { return lerRascunho(window.localStorage.getItem(chave)); } catch { return sessaoVazia(); }
}
function gravarStorage(chave: string, s: SessaoContagem) {
  try {
    if (s.ordem.length === 0) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, JSON.stringify(s));
  } catch { /* armazenamento indisponível: a contagem segue só na memória */ }
}
function apagarStorage(chave: string) { try { window.localStorage.removeItem(chave); } catch { /* idem */ } }

export function ContagemCentroPainel() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // TELA-LEMBRA-ONDE-EU-ESTAVA: centro, busca e lista de não contados na URL.
  const [nav, setNav] = useEstadoTela({ centro: "SITE-SP", busca: "", aba: "pendentes", colecoes: "" }, { prefixo: "ct", replaceKeys: ["busca"] });
  const centro = nav.centro;
  const busca = nav.busca; const setBusca = (v: SetStateAction<typeof busca>) => setNav({ busca: resolverAcao(v, busca) as never });
  const [data, setDataRaw] = useState(hojeISO());
  const colecoes = lerLista(nav.colecoes);
  const setColecoes = (v: string[]) => setNav({ colecoes: escreverLista(v) as never });
  const [sess, setSess] = useState<{ chave: string; s: SessaoContagem }>(() => {
    const k = chaveRascunho(centro, hojeISO());
    return { chave: k, s: lerStorage(k) };
  });
  const sessao = sess.s;
  const setSessao = (f: (s: SessaoContagem) => SessaoContagem) => setSess((x) => ({ ...x, s: f(x.s) }));
  const [confirmar, setConfirmar] = useState(false);
  const [trocaCentro, setTrocaCentro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [destaque, setDestaque] = useState<{ sku: string; t: number } | null>(null);

  // Centro vindo da URL (ex.: voltar/avançar) carrega o rascunho dele.
  useEffect(() => {
    const k = chaveRascunho(centro, data);
    setSess((x) => (x.chave === k ? x : { chave: k, s: lerStorage(k) }));
  }, [centro, data]);
  useEffect(() => { gravarStorage(sess.chave, sess.s); }, [sess]);

  const setData = (d: string) => {
    // Mudar a data leva a contagem em andamento junto (rascunho muda de chave).
    const k = chaveRascunho(centro, d);
    apagarStorage(sess.chave);
    setSess((x) => ({ chave: k, s: x.s }));
    setDataRaw(d);
  };
  const aplicarCentro = (c: string) => {
    apagarStorage(sess.chave);
    const k = chaveRascunho(c, data);
    apagarStorage(k);
    setSess({ chave: k, s: sessaoVazia() });
    setResultado(null);
    setNav({ centro: c as never });
  };
  const pedirCentro = (c: string) => {
    if (c === centro) return;
    if (sessao.ordem.length > 0) setTrocaCentro(c); else aplicarCentro(c);
  };

  const centrosQ = useQuery({
    queryKey: ["contagem-centros"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao").select("id,codigo,nome,rotulo_curto").eq("ativo", true).in("tipo", ["armazem", "showroom"]).neq("codigo", CENTRO_XPM).order("codigo");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string | null; rotulo_curto: string | null }[];
    },
  });

  const linhasQ = useQuery({
    queryKey: ["vw_estoque_cockpit", "contagem", centro],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_estoque_cockpit")
        .select("cod_cadastro,sku,nome_comercial,cor_nome,colecao,contabil,fisico,virtual")
        .eq("centro", centro)
        .limit(5000);
      if (error) throw error;
      return ((data ?? []) as Linha[]).filter((l) => (l.contabil ?? 0) !== 0 || l.fisico != null);
    },
  });

  // Catálogo inteiro: sugestões por nome e dados de itens contados fora do centro.
  const catalogoQ = useQuery({
    queryKey: ["sncf_produtos", "contagem-catalogo"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const r: ProdutoCatalogo[] = [];
      const passo = 1000;
      for (let de = 0; ; de += passo) {
        const { data, error } = await (supabase as any)
          .from("sncf_produtos").select("sku,cod_cadastro,nome_comercial,cor_nome,colecao").order("cod_cadastro").range(de, de + passo - 1);
        if (error) throw error;
        r.push(...((data ?? []) as ProdutoCatalogo[]).filter((p) => p.sku));
        if (!data || data.length < passo) break;
      }
      return r;
    },
  });

  const validadeQ = useQuery({
    queryKey: ["estoque_parametro", "contagem_validade_dias"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque_parametro").select("valor").eq("chave", "contagem_validade_dias").single();
      if (error) throw error;
      const dias = Number(data.valor);
      if (!String(data.valor).trim() || !Number.isInteger(dias) || dias < 0) throw new Error("Prazo de validade da contagem inválido.");
      return dias;
    },
  });
  const centroId = centrosQ.data?.find((c) => c.codigo === centro)?.id;
  // Consulta paginada: a primeira linha de cada SKU é sua contagem mais recente.
  const ultimaQ = useQuery({
    queryKey: ["contagem_estoque", "ultima_contagem", centroId],
    enabled: !!centroId,
    queryFn: async () => {
      if (!centroId) throw new Error("Centro da contagem não encontrado.");
      const m = new Map<string, UltimaContagem>();
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("contagem_estoque")
          .select("sku,qtd_contada,data_contagem,criado_por")
          .eq("centro_id", centroId).order("data_contagem", { ascending: false }).order("criado_em", { ascending: false }).order("id").range(de, de + 999);
        if (error) throw error;
        for (const r of data ?? []) if (!m.has(r.sku)) m.set(r.sku, { sku: r.sku, qtd: Number(r.qtd_contada), em: r.data_contagem, criadoPor: r.criado_por, quem: null });
        if (!data || data.length < 1000) break;
      }
      const ids = [...new Set([...m.values()].flatMap((r) => r.criadoPor ? [r.criadoPor] : []))];
      const nomes = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from("profiles").select("user_id,full_name").in("user_id", ids.slice(i, i + 200));
        if (error) throw error;
        for (const p of data ?? []) if (p.user_id && p.full_name) nomes.set(p.user_id, p.full_name);
      }
      for (const u of m.values()) u.quem = u.criadoPor ? nomes.get(u.criadoPor) ?? null : null;
      return m;
    },
  });

  const porSkuCentro = useMemo(() => new Map((linhasQ.data ?? []).map((l) => [l.sku, l])), [linhasQ.data]);
  const porSkuCatalogo = useMemo(() => new Map((catalogoQ.data ?? []).map((p) => [p.sku, p])), [catalogoQ.data]);
  const linhaDe = (sku: string): Linha => {
    const c = porSkuCentro.get(sku);
    if (c) return c;
    const p = porSkuCatalogo.get(sku);
    return { sku, cod_cadastro: p?.cod_cadastro ?? null, nome_comercial: p?.nome_comercial ?? null, cor_nome: p?.cor_nome ?? null, colecao: p?.colecao ?? null, contabil: 0, fisico: null, virtual: 0, achado: true };
  };
  const contadas = sessao.ordem.map(linhaDe);

  const naoContadosSessao = useMemo(() => naoContados(linhasQ.data ?? [], sessao), [linhasQ.data, sessao]);
  const hoje = hojeISO();
  const { pendentes, noPrazo } = useMemo(() => validadeQ.data == null || !ultimaQ.data ? { pendentes: [] as Linha[], noPrazo: [] as UltimaContagem[] } : separarContagens(linhasQ.data ?? [], ultimaQ.data, new Set(sessao.ordem), validadeQ.data, hoje), [linhasQ.data, ultimaQ.data, sessao.ordem, validadeQ.data, hoje]);
  const colecoesLista = useMemo(() => {
    const m = new Map<string, number>();
    pendentes.forEach((l) => { if (l.colecao) m.set(l.colecao, (m.get(l.colecao) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pendentes]);
  const pendentesVisiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return pendentes
      .filter((l) => colecoes.length === 0 || (l.colecao != null && colecoes.includes(l.colecao)))
      .filter((l) => !t || [l.cod_cadastro, l.sku, l.nome_comercial].some((v) => (v ?? "").toLowerCase().includes(t)));
  }, [pendentes, busca, colecoes]);

  useEffect(() => {
    if (!destaque) return;
    const t = setTimeout(() => setDestaque((d) => (d?.t === destaque.t ? null : d)), 1500);
    return () => clearTimeout(t);
  }, [destaque]);

  function aoLer(l: LeituraCodigo) {
    setSessao((s) => somarLeitura(s, l.sku, l.unidades));
    setDestaque({ sku: l.sku, t: Date.now() });
  }
  function aoDesfazer(l: LeituraCodigo) {
    setSessao((s) => somarLeitura(s, l.sku, -l.unidades));
    setDestaque({ sku: l.sku, t: Date.now() });
  }
  function aoImportar(itens: { sku: string; qtd: number }[], modo: ModoImportacao) {
    setSessao((s) => importarItens(s, itens, modo === "substituir" ? "substituir" : "somar"));
    const fora = itens.filter((i) => !porSkuCentro.has(i.sku) && !porSkuCatalogo.has(i.sku)).map((i) => i.sku);
    if (fora.length > 0 && catalogoQ.data) toast.warning(`${fora.length} SKU(s) não encontrados no catálogo: ${fora.slice(0, 5).join(", ")}${fora.length > 5 ? "…" : ""}`);
  }

  const fotosQ = useFotosPrincipais([...contadas, ...(nav.aba === "prazo" ? noPrazo.map((u) => linhaDe(u.sku)) : pendentesVisiveis)].map((l) => l.cod_cadastro));

  const validos = preenchidos(sessao);
  const n = validos.length;
  const resumo = useMemo(() => resumoSessao(sessao, new Map((linhasQ.data ?? []).map((l) => [l.sku, l.contabil ?? 0]))), [sessao, linhasQ.data]);
  const invalidos = sessao.ordem.some((k) => numeroInvalido(sessao.qtd[k] ?? ""));

  const registrar = useMutation({
    mutationFn: async (modo: "total" | "parcial") => {
      const itens = itensRegistro(sessao, naoContadosSessao.map((l) => l.sku), modo);
      const { data: r, error } = await (supabase as any).rpc("fn_registrar_contagem", {
        p_centro_codigo: centro, p_data: data, p_itens: itens,
      });
      if (error) throw error;
      const res = (r ?? {}) as Resultado;
      if (res.ok === false) throw new Error(res.erro ?? "A contagem não foi registrada.");
      return res;
    },
    onSuccess: async (res) => {
      setResultado(res);
      apagarStorage(sess.chave);
      setSessao(() => sessaoVazia());
      toast.success(`${res.itens ?? n} contagens registradas · ${(res.divergencias ?? []).length} com diferença`, {
        action: { label: "Ver na Conciliação", onClick: () => navigate("/vendas/produto/estoque/conciliacao") },
      });
      await qc.invalidateQueries({ queryKey: ["vw_estoque_cockpit"] });
      await qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes("estoque") });
      await linhasQ.refetch();
      await ultimaQ.refetch();
    },
    onError: (e) => toast.error(`Falha ao registrar contagem: ${formatError(e)}`),
  });

  const centroRotulo = (c: string) => centrosQ.data?.find((x) => x.codigo === c)?.rotulo_curto ?? c;
  const nPend = naoContadosSessao.length;

  const celulaProduto = (l: Linha) => (
    <div className="flex items-center gap-2">
      <MiniaturaProduto url={l.cod_cadastro ? fotosQ.data?.get(l.cod_cadastro) : null} nome={l.nome_comercial} />
      <div className="min-w-0 max-w-[360px]">
        <div className="flex items-center gap-2 truncate">{l.nome_comercial ?? "—"}{l.achado && <Badge variant="outline" className="border-warning text-warning">Achado</Badge>}</div>
        {l.cor_nome && <div className="text-[11px] text-muted-foreground">{l.cor_nome}</div>}
      </div>
    </div>
  );
  const celulaUltima = (sku: string) => {
    const u = ultimaQ.data?.get(sku);
    if (!u) return <span className="text-muted-foreground">—</span>;
    return <>{u.qtd}<div className="text-[10px] text-muted-foreground">{fmtData(u.em)}</div></>;
  };
  const cabecalho = (comRemover: boolean) => (
    <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>
      <TableHead className="w-[150px]">Código</TableHead>
      <TableHead>Produto</TableHead>
      <TableHead className="w-[90px] text-right">Contábil</TableHead>
      <TableHead className="w-[90px] text-right">Disponível</TableHead>
      <TableHead className="w-[130px] text-right">Última contagem</TableHead>
      <TableHead className="w-[120px] text-right">Contado</TableHead>
      <TableHead className="w-[100px] text-right">Diferença</TableHead>
      {comRemover && <TableHead className="w-[48px]" />}
    </TableRow></TableHeader>
  );
  const linhaTabela = (l: Linha, contada: boolean, topo: boolean) => {
    const v = sessao.qtd[l.sku] ?? "";
    const dif = v !== "" && !numeroInvalido(v) ? Number(v) - (l.contabil ?? 0) : null;
    return (
      <TableRow key={l.sku} data-sku={l.sku} className={cn("bg-card transition-colors hover:bg-muted/50", (destaque?.sku === l.sku || topo) && "bg-primary/15")}>
        <TableCell><CodProduto chave={l.sku} /></TableCell>
        <TableCell>{celulaProduto(l)}</TableCell>
        <TableCell className="text-right tabular-nums">{l.contabil ?? 0}</TableCell>
        <TableCell className={cn("text-right tabular-nums font-medium", (l.virtual ?? 0) < 0 && "text-destructive")}>{l.virtual ?? 0}</TableCell>
        <TableCell className="text-right tabular-nums">{contada ? celulaUltima(l.sku) : ultimaQ.data?.get(l.sku) ? <>{fmtData(ultimaQ.data.get(l.sku)?.em)}<div className="text-[10px] text-muted-foreground">há {diasDesdeContagem(ultimaQ.data.get(l.sku)?.em ?? hoje, hoje)} dias</div></> : <span className="text-muted-foreground">Nunca contado</span>}</TableCell>
        <TableCell className="text-right">
          <Input
            type="number" min={0} step={1} inputMode="numeric" value={v}
            aria-label={`Contado ${l.cod_cadastro ?? l.sku}`}
            aria-invalid={numeroInvalido(v)}
            onChange={(e) => { const val = e.target.value; setSessao((s) => definirQtd(s, l.sku, val)); }}
            className={cn("ml-auto h-8 w-24 text-right tabular-nums", numeroInvalido(v) && "border-destructive")}
          />
        </TableCell>
        <TableCell className={cn("text-right tabular-nums font-medium", dif === 0 && "text-success", dif != null && dif !== 0 && "text-destructive")}>
          {dif == null ? "" : dif > 0 ? `+${dif}` : dif}
        </TableCell>
        {contada && (
          <TableCell>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remover ${l.cod_cadastro ?? l.sku} da contagem`} onClick={() => setSessao((s) => removerItem(s, l.sku))}>
              <X className="h-4 w-4" />
            </Button>
          </TableCell>
        )}
      </TableRow>
    );
  };

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bipe ou digite cada produto contado. A contagem não altera o saldo contábil — a diferença aparece como divergência para decisão.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={centro} onValueChange={pedirCentro}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Centro" /></SelectTrigger>
          <SelectContent>
            {(centrosQ.data ?? []).map((c) => (
              <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo_curto ?? c.nome ?? c.codigo}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value > hojeISO() ? hojeISO() : e.target.value)} className="w-[160px]" aria-label="Data da contagem" />
        <ImportarContagemDialog onAplicar={aoImportar} />
        <div className="ml-auto flex items-center gap-3">
          <BotaoGuardado slug="acao.estoque_contagem_registrar" rotuloAcao="Registrar contagem" disabled={n === 0 || registrar.isPending || invalidos || !data} onClick={() => setConfirmar(true)}>
            Registrar contagem ({n})
          </BotaoGuardado>
        </div>
      </div>

      {centrosQ.isError && <p className="text-sm text-destructive">Falha ao carregar centros: {formatError(centrosQ.error)}</p>}
      {ultimaQ.isError && <p className="text-sm text-destructive">Falha ao carregar últimas contagens: {formatError(ultimaQ.error)}</p>}
      {validadeQ.isError && <p className="text-sm text-destructive">Falha ao carregar validade: {formatError(validadeQ.error)}</p>}
      {linhasQ.isError && <p className="text-sm text-destructive">Falha ao carregar produtos: {formatError(linhasQ.error)}</p>}
      {catalogoQ.isError && <p className="text-sm text-destructive">Falha ao carregar catálogo: {formatError(catalogoQ.error)}</p>}

      <LeitorCodigoBarras
        onLeitura={aoLer} onDesfazer={aoDesfazer} grande
        catalogo={catalogoQ.data} placeholder="Bipar ou digitar código, SKU ou nome"
      />

      {resultado && (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <p className="text-sm font-medium">
            {resultado.itens ?? 0} contagens registradas · {(resultado.divergencias ?? []).length} com diferença
          </p>
          {(resultado.divergencias ?? []).length > 0 && (
            <div className="overflow-hidden rounded-md border bg-card" style={{ ["--fila-topo-colado" as string]: "0px" }}>
            <Table className="text-[12px]" containerClassName="max-h-[calc(100vh-22rem)]">
              <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>
                <TableHead className="w-[150px]">Código</TableHead><TableHead>Produto</TableHead>
                <TableHead className="w-[90px] text-right">Contábil</TableHead>
                <TableHead className="w-[90px] text-right">Contado</TableHead><TableHead className="w-[100px] text-right">Diferença</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(resultado.divergencias ?? []).map((d) => (
                  <TableRow key={d.sku} className="bg-card hover:bg-muted/50">
                    <TableCell><CodProduto chave={d.sku} /></TableCell>
                    <TableCell>{celulaProduto(linhaDe(d.sku))}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.contabil}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.contado}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", d.diferenca < 0 && "text-destructive", d.diferenca > 0 && "text-warning")}>{d.diferenca > 0 ? `+${d.diferenca}` : d.diferenca}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Itens contados", resumo.itens, ""],
          ["Peças contadas", resumo.pecas, ""],
          ["Sobras", resumo.sobras, resumo.sobras > 0 ? "text-warning" : ""],
          ["Faltas", resumo.faltas, resumo.faltas > 0 ? "text-destructive" : ""],
        ].map(([r, v, c]) => (
          <div key={r as string} className="rounded-md border bg-card px-3 py-2">
            <div className="text-xs text-muted-foreground">{r}</div>
            <div className={cn("text-lg font-medium tabular-nums", c as string)}>{v}</div>
          </div>
        ))}
      </div>

      {contadas.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card py-10 text-center text-sm text-muted-foreground">
          Nenhum item contado ainda. Bipe o primeiro produto.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-card" style={{ ["--fila-topo-colado" as string]: "0px" }}>
          <Table className="text-[12px]" containerClassName="max-h-[calc(100vh-22rem)]">
            {cabecalho(true)}
            <TableBody>{contadas.map((l, i) => linhaTabela(l, true, i === 0))}</TableBody>
          </Table>
        </div>
      )}

      <Tabs value={nav.aba === "prazo" ? "prazo" : "pendentes"} onValueChange={(v) => setNav({ aba: v as never })} className="space-y-3">
        <p className="text-xs text-muted-foreground">{validadeQ.data == null ? "Carregando validade da contagem…" : `Contagem vale ${validadeQ.data} dias`}</p>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="pendentes">Pendentes de contagem ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="prazo">Contados no prazo ({noPrazo.length})</TabsTrigger>
        </TabsList>
        {linhasQ.isLoading || ultimaQ.isLoading || validadeQ.isLoading ? <p className="text-sm text-muted-foreground">Carregando contagens…</p> : ultimaQ.isError || validadeQ.isError || linhasQ.isError ? <p className="text-sm text-destructive">Não foi possível calcular as listas de contagem.</p> : <>
        <TabsContent value="pendentes" className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, SKU ou nome" aria-label="Buscar pendentes de contagem" className="w-full sm:w-[280px]" />
              <FiltroColecao colecoes={colecoesLista} selecionadas={colecoes} onChange={setColecoes} />
            </div>
            {pendentesVisiveis.length === 0 ? (
              <div className="rounded-md border bg-card py-6 text-center text-sm text-muted-foreground">Nenhum produto pendente de contagem neste recorte</div>
            ) : (
              <div className="overflow-hidden rounded-md border bg-card" style={{ ["--fila-topo-colado" as string]: "0px" }}>
                <Table className="text-[12px]" containerClassName="max-h-[calc(100vh-22rem)] min-h-[12rem]">
                  {cabecalho(false)}
                  <TableBody>{pendentesVisiveis.map((l) => linhaTabela(l, false, false))}</TableBody>
                </Table>
              </div>
            )}
        </TabsContent>
        <TabsContent value="prazo">
          {noPrazo.length === 0 ? <div className="rounded-md border bg-card py-6 text-center text-sm text-muted-foreground">Nenhum produto contado no prazo</div> :
          <div className="overflow-hidden rounded-md border bg-card" style={{ ["--fila-topo-colado" as string]: "0px" }}>
            <Table className="text-[12px]" containerClassName="max-h-[calc(100vh-22rem)]">
              <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>
                <TableHead>Código</TableHead><TableHead>Produto</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Contábil no momento</TableHead><TableHead className="text-right">Diferença</TableHead><TableHead>Quem contou</TableHead>
              </TableRow></TableHeader>
              <TableBody>{noPrazo.map((u) => {
                const l = linhaDe(u.sku);
                const contabil = u.contabil ?? l.contabil ?? 0;
                const dif = u.qtd - contabil;
                return <TableRow key={u.sku} className="bg-card hover:bg-muted/50">
                  <TableCell><CodProduto chave={u.sku} /></TableCell><TableCell>{celulaProduto(l)}</TableCell><TableCell className="whitespace-nowrap">{fmtData(u.em)}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.qtd}</TableCell><TableCell className="text-right tabular-nums">{contabil}{u.contabil == null && <div className="text-[10px] text-muted-foreground">atual</div>}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", dif < 0 && "text-destructive", dif > 0 && "text-warning")}>{dif > 0 ? `+${dif}` : dif}</TableCell><TableCell>{u.quem ?? "—"}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </div>}
        </TabsContent>
        </>}
      </Tabs>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar contagem</AlertDialogTitle>
            <AlertDialogDescription>
              {nPend > 0
                ? `Você contou ${n} itens no ${centroRotulo(centro)} em ${fmtData(data)}. Há ${nPend} itens com saldo no centro que não foram contados.`
                : `Registrar ${n} contagens no ${centroRotulo(centro)} em ${fmtData(data)}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={cn(nPend > 0 && "flex-col gap-2 sm:flex-col sm:space-x-0")}>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {nPend > 0 ? (
              <>
                <AlertDialogAction className={cn(buttonVariants({ variant: "outline" }), "text-foreground")} onClick={() => registrar.mutate("parcial")}>
                  Contagem parcial — registrar só os {n} contados
                </AlertDialogAction>
                <AlertDialogAction onClick={() => registrar.mutate("total")}>
                  Contagem total do centro — lançar os {nPend} não contados como zero
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => registrar.mutate("parcial")}>Registrar</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!trocaCentro} onOpenChange={(o) => { if (!o) setTrocaCentro(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar de centro?</AlertDialogTitle>
            <AlertDialogDescription>
              A contagem em andamento no {centroRotulo(centro)} ({sessao.ordem.length} itens) será descartada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (trocaCentro) aplicarCentro(trocaCentro); setTrocaCentro(null); }}>Descartar e trocar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default ContagemCentroPainel;
