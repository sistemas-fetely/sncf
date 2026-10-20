import { useEffect, useMemo, useRef, useState } from "react";
import { CodProduto } from "@/components/produto/CodProduto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  achado?: boolean;
}
interface Divergencia { sku: string; contabil: number; contado: number; diferenca: number }
interface Resultado { ok?: boolean; itens?: number; divergencias?: Divergencia[]; erro?: string }

const CENTRO_XPM = "XPM-SC";

export function ContagemCentroPainel() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [soDiv, setSoDiv] = useState(false);
  const [achados, setAchados] = useState<Linha[]>([]);
  const [centro, setCentro] = useState("SITE-SP");
  const [data, setData] = useState(hojeISO());
  const [busca, setBusca] = useState("");
  const [colecoes, setColecoes] = useState<string[]>([]);
  const [contados, setContados] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [destaque, setDestaque] = useState<{ sku: string; t: number } | null>(null);
  const tabelaRef = useRef<HTMLDivElement>(null);

  const centrosQ = useQuery({
    queryKey: ["contagem-centros"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao").select("codigo,nome,rotulo_curto").eq("ativo", true).in("tipo", ["armazem", "showroom"]).neq("codigo", CENTRO_XPM).order("codigo");
      if (error) throw error;
      return (data ?? []) as { codigo: string; nome: string | null; rotulo_curto: string | null }[];
    },
  });

  const linhasQ = useQuery({
    queryKey: ["vw_estoque_cockpit", "contagem", centro],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_estoque_cockpit")
        .select("cod_cadastro,sku,nome_comercial,cor_nome,colecao,contabil,fisico")
        .eq("centro", centro)
        .limit(5000);
      if (error) throw error;
      return ((data ?? []) as Linha[]).filter((l) => (l.contabil ?? 0) !== 0 || l.fisico != null);
    },
  });

  const linhas = useMemo(() => {
    const base = linhasQ.data ?? [];
    const ja = new Set(base.map((l) => l.sku));
    return [...base, ...achados.filter((a) => !ja.has(a.sku))];
  }, [linhasQ.data, achados]);
  const colecoesLista = useMemo(() => {
    const m = new Map<string, number>();
    linhas.forEach((l) => { if (l.colecao) m.set(l.colecao, (m.get(l.colecao) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [linhas]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas
      .filter((l) => colecoes.length === 0 || (l.colecao != null && colecoes.includes(l.colecao)))
      .filter((l) => {
        if (!soDiv) return true;
        const v = contados[l.sku];
        return v !== undefined && v !== "" && !isNaN(Number(v)) && Number(v) - (l.contabil ?? 0) !== 0;
      })
      .filter((l) => !t || [l.cod_cadastro, l.sku, l.nome_comercial].some((v) => (v ?? "").toLowerCase().includes(t)))
      .sort((a, b) => (a.cod_cadastro ?? a.sku).localeCompare(b.cod_cadastro ?? b.sku));
  }, [linhas, busca, colecoes, soDiv, contados]);

  useEffect(() => {
    if (!destaque) return;
    const el = tabelaRef.current?.querySelector(`[data-sku="${CSS.escape(destaque.sku)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setDestaque((d) => (d?.t === destaque.t ? null : d)), 1500);
    return () => clearTimeout(t);
  }, [destaque]);

  const somarContado = (sku: string, delta: number) =>
    setContados((c) => {
      const atual = c[sku] === undefined || c[sku] === "" || isNaN(Number(c[sku])) ? 0 : Number(c[sku]);
      const novo = Math.max(0, atual + delta);
      return { ...c, [sku]: String(novo) };
    });

  async function incluirAchado(sku: string) {
    const { data: p, error } = await (supabase as any)
      .from("sncf_produtos").select("sku,cod_cadastro,nome_comercial").eq("sku", sku).maybeSingle();
    if (error || !p) {
      toast.error(error ? `Falha ao buscar produto ${sku}: ${formatError(error)}` : `SKU ${sku} não encontrado no catálogo`);
      setContados((c) => { const n = { ...c }; delete n[sku]; return n; });
      return;
    }
    setAchados((a) => a.some((x) => x.sku === sku) ? a : [...a, {
      sku: p.sku, cod_cadastro: p.cod_cadastro, nome_comercial: p.nome_comercial,
      cor_nome: null, colecao: null, contabil: 0, fisico: null, achado: true,
    }]);
    setDestaque({ sku, t: Date.now() });
  }

  function aoLer(l: LeituraCodigo) {
    if (!visiveis.some((v) => v.sku === l.sku)) { setBusca(""); setColecoes([]); setSoDiv(false); }
    if (!linhas.some((v) => v.sku === l.sku)) void incluirAchado(l.sku);
    somarContado(l.sku, l.unidades);
    setDestaque({ sku: l.sku, t: Date.now() });
  }
  function aoImportar(itens: { sku: string; qtd: number }[], modo: ModoImportacao) {
    setBusca(""); setColecoes([]);
    setContados((c) => {
      const base = modo === "substituir" ? {} : { ...c };
      itens.forEach(({ sku, qtd }) => {
        const atual = base[sku] === undefined || base[sku] === "" || isNaN(Number(base[sku])) ? 0 : Number(base[sku]);
        base[sku] = String(atual + qtd);
      });
      return base;
    });
    itens.filter((i) => !linhas.some((l) => l.sku === i.sku)).forEach((i) => void incluirAchado(i.sku));
  }
  const fotosQ = useFotosPrincipais(visiveis.map((l) => l.cod_cadastro));

  function aoDesfazer(l: LeituraCodigo) {
    somarContado(l.sku, -l.unidades);
    setDestaque({ sku: l.sku, t: Date.now() });
  }

  const preenchidos = Object.entries(contados).filter(([, v]) => v !== "" && Number(v) >= 0 && !isNaN(Number(v)));
  const n = preenchidos.length;
  const resumo = useMemo(() => {
    const contabil = new Map(linhas.map((l) => [l.sku, l.contabil ?? 0]));
    let pecas = 0, sobras = 0, faltas = 0;
    preenchidos.forEach(([sku, v]) => {
      const q = Number(v); pecas += q;
      const d = q - (contabil.get(sku) ?? 0);
      if (d > 0) sobras++; else if (d < 0) faltas++;
    });
    return { pecas, sobras, faltas };
  }, [preenchidos, linhas]);

  const registrar = useMutation({
    mutationFn: async () => {
      const itens = preenchidos.map(([sku, v]) => ({ sku, qtd: Number(v), condicao: "sadio" }));
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
      setContados({});
      setAchados([]);
      toast.success(`${res.itens ?? n} contagens registradas · ${(res.divergencias ?? []).length} com diferença`, {
        action: { label: "Ver na Conciliação", onClick: () => navigate("/vendas/produto/estoque/conciliacao") },
      });
      await qc.invalidateQueries({ queryKey: ["vw_estoque_cockpit"] });
      await qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes("estoque") });
      await linhasQ.refetch();
    },
    onError: (e) => toast.error(`Falha ao registrar contagem: ${formatError(e)}`),
  });

  const numeroInvalido = (v: string) => v !== "" && (isNaN(Number(v)) || Number(v) < 0);
  const centroRotulo = centrosQ.data?.find((c) => c.codigo === centro)?.rotulo_curto ?? centro;

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Registre o que foi contado na prateleira. A contagem não altera o saldo contábil — a diferença aparece como divergência para decisão.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={centro} onValueChange={(v) => { setCentro(v); setContados({}); setAchados([]); setResultado(null); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Centro" /></SelectTrigger>
          <SelectContent>
            {(centrosQ.data ?? []).map((c) => (
              <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo_curto ?? c.nome ?? c.codigo}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value > hojeISO() ? hojeISO() : e.target.value)} className="w-[160px]" aria-label="Data da contagem" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, SKU ou nome" className="w-[280px]" />
        <FiltroColecao colecoes={colecoesLista} selecionadas={colecoes} onChange={setColecoes} />
        <div className="flex items-center gap-2">
          <Switch id="so-div" checked={soDiv} onCheckedChange={setSoDiv} />
          <Label htmlFor="so-div" className="text-sm">Só divergências</Label>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <BotaoGuardado slug="acao.estoque_contagem_registrar" rotuloAcao="Registrar contagem" disabled={n === 0 || registrar.isPending || preenchidos.some(([, v]) => numeroInvalido(v)) || !data} onClick={() => setConfirmar(true)}>
            Registrar contagem ({n})
          </BotaoGuardado>
        </div>
      </div>

      {centrosQ.isError && <p className="text-sm text-destructive">Falha ao carregar centros: {formatError(centrosQ.error)}</p>}
      {linhasQ.isError && <p className="text-sm text-destructive">Falha ao carregar produtos: {formatError(linhasQ.error)}</p>}

      {resultado && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">
            {resultado.itens ?? 0} contagens registradas · {(resultado.divergencias ?? []).length} com diferença
          </p>
          {(resultado.divergencias ?? []).length > 0 && (
            <Table className="text-[12px]">
              <TableHeader><TableRow>
                <TableHead>Código</TableHead><TableHead className="text-right">Contábil</TableHead>
                <TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Diferença</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(resultado.divergencias ?? []).map((d) => (
                  <TableRow key={d.sku}>
                    <TableCell><CodProduto chave={d.sku} variant="compacto" /></TableCell>
                    <TableCell className="text-right tabular-nums">{d.contabil}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.contado}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{d.diferenca > 0 ? `+${d.diferenca}` : d.diferenca}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Itens contados", n, ""],
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

      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1"><LeitorCodigoBarras onLeitura={aoLer} onDesfazer={aoDesfazer} /></div>
        <ImportarContagemDialog onAplicar={aoImportar} />
      </div>

      {linhasQ.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhum produto neste recorte</div>
      ) : (
        <div className="rounded-md border" ref={tabelaRef}>
          <Table className="text-[12px]" containerClassName="max-h-[calc(100vh-22rem)] min-h-[20rem]">
            <TableHeader className="sticky top-0 z-10 bg-card"><TableRow>
              <TableHead className="w-[150px]">Código</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="w-[90px] text-right">Contábil</TableHead>
              <TableHead className="w-[130px] text-right">Última contagem</TableHead>
              <TableHead className="w-[120px] text-right">Contado</TableHead>
              <TableHead className="w-[100px] text-right">Diferença</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visiveis.map((l) => {
                const v = contados[l.sku] ?? "";
                const dif = v !== "" && !numeroInvalido(v) ? Number(v) - (l.contabil ?? 0) : null;
                return (
                  <TableRow key={l.sku} data-sku={l.sku} className={cn("transition-colors", destaque?.sku === l.sku && "bg-primary/15")}>
                    <TableCell><CodProduto chave={l.sku} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                      <MiniaturaProduto url={l.cod_cadastro ? fotosQ.data?.get(l.cod_cadastro) : null} nome={l.nome_comercial} />
                      <div className="min-w-0 max-w-[360px]">
                      <div className="flex items-center gap-2 truncate">{l.nome_comercial ?? "—"}{l.achado && <Badge variant="outline" className="border-warning text-warning">Achado</Badge>}</div>
                      {l.cor_nome && <div className="text-[11px] text-muted-foreground">{l.cor_nome}</div>}
                      </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.contabil ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.fisico ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" min={0} step={1} inputMode="numeric" value={v}
                        aria-invalid={numeroInvalido(v)}
                        onChange={(e) => setContados((c) => ({ ...c, [l.sku]: e.target.value }))}
                        className={cn("ml-auto h-8 w-24 text-right tabular-nums", numeroInvalido(v) && "border-destructive")}
                      />
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", dif === 0 && "text-success", dif != null && dif !== 0 && "text-destructive")}>
                      {dif == null ? "" : dif > 0 ? `+${dif}` : dif}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar contagem</AlertDialogTitle>
            <AlertDialogDescription>Registrar {n} contagens no {centroRotulo} em {fmtData(data)}?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => registrar.mutate()}>Registrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default ContagemCentroPainel;
