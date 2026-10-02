import { Fragment, useEffect, useMemo, useState } from "react";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { invalidarCompras } from "@/lib/compras/invalidar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Layers,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { ParaQueServe } from "@/components/compras/ParaQueServe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Selo } from "@/components/ui/selo";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const NUM = new Intl.NumberFormat("pt-BR");

function fmtQtd(v: number | null | undefined): string {
  if (v == null) return "—";
  return NUM.format(Number(v));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface NfPendencia {
  id: number;
  numero: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  fornecedor_id: string | null;
  linhas: number;
  alocadas: number;
}

interface Sugestao {
  sku: string;
  nome_comercial: string | null;
  grupo: string | null;
  tipo: string | null;
  tamanho_numero: string | number | null;
  score: number | null;
  motivos: string | null;
  no_pedido: boolean | null;
}

interface WorklistLinha {
  nf_linha_id: string;
  item_seq: number | null;
  codigo_nf: string | null;
  descricao: string | null;
  ncm: string | null;
  quantidade: number | null;
  valor_unit: number | null;
  valor_total: number | null;
  skus_ja_mapeados: number | null;
  alocada: boolean | null;
  sugestoes: Sugestao[] | null;
}

interface SkuSelecionado {
  sku: string;
  nome_comercial: string | null;
  rateio_pct: string;
}

type Previa = Record<string, unknown> | null;

function PreviaLista({ dados }: { dados: Previa }) {
  if (!dados) return null;
  const entradas = Object.entries(dados).filter(
    ([, v]) => v == null || typeof v !== "object",
  );
  return (
    <div className="space-y-1">
      {entradas.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
          <span className="tabular-nums">{v == null ? "—" : String(v)}</span>
        </div>
      ))}
      {entradas.length === 0 && (
        <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-2 text-[11px]">
          {JSON.stringify(dados, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nivel 1 — lista de NFs                                             */
/* ------------------------------------------------------------------ */

function useNfsPendencia() {
  return useQuery({
    queryKey: ["rateio-nf-lista"],
    queryFn: async (): Promise<NfPendencia[]> => {
      const { data: nfs, error } = await db
        .from("importacao_nf")
        .select("id, numero, data_emissao, valor_total, fornecedor_id")
        .order("data_emissao", { ascending: false })
        .limit(300);
      if (error) throw error;
      const lista = (nfs ?? []) as NfPendencia[];
      const ids = lista.map((n) => n.id);
      if (ids.length === 0) return [];

      const { data: linhas, error: e2 } = await db
        .from("importacao_nf_linha")
        .select("id, nf_id")
        .in("nf_id", ids);
      if (e2) throw e2;

      const linhaIds = ((linhas ?? []) as { id: string; nf_id: number }[]).map((l) => l.id);
      const alocadasSet = new Set<string>();
      if (linhaIds.length > 0) {
        for (let i = 0; i < linhaIds.length; i += 500) {
          const fatia = linhaIds.slice(i, i + 500);
          const { data: vinc, error: e3 } = await db
            .from("importacao_nf_linha_sku")
            .select("nf_linha_id")
            .in("nf_linha_id", fatia);
          if (e3) throw e3;
          ((vinc ?? []) as { nf_linha_id: string }[]).forEach((v) =>
            alocadasSet.add(v.nf_linha_id),
          );
        }
      }

      const porNf = new Map<number, { linhas: number; alocadas: number }>();
      ((linhas ?? []) as { id: string; nf_id: number }[]).forEach((l) => {
        const atual = porNf.get(l.nf_id) ?? { linhas: 0, alocadas: 0 };
        atual.linhas += 1;
        if (alocadasSet.has(l.id)) atual.alocadas += 1;
        porNf.set(l.nf_id, atual);
      });

      return lista
        .map((n) => ({
          ...n,
          linhas: porNf.get(n.id)?.linhas ?? 0,
          alocadas: porNf.get(n.id)?.alocadas ?? 0,
        }))
        .sort((a, b) => b.linhas - b.alocadas - (a.linhas - a.alocadas));
    },
  });
}

function ListaNfs({ aoAbrir }: { aoAbrir: (nf: NfPendencia) => void }) {
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"pendentes" | "todas">("pendentes");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const q = useNfsPendencia();
  const todasNfs = q.data ?? [];
  const pendentesNfs = useMemo(() => todasNfs.filter((n) => n.linhas - n.alocadas > 0), [todasNfs]);
  const todas = modo === "pendentes" ? pendentesNfs : todasNfs;

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return todas;
    return todas.filter((n) => (n.numero ?? "").toLowerCase().includes(t));
  }, [todas, busca]);
  useEffect(() => setPagina(1), [busca, modo, tamanho]);
  const fatia = filtradas.slice((pagina - 1) * tamanho, pagina * tamanho);

  return (
    <div className="space-y-3">
      <FiltroDuplo
        opcoes={[
          { valor: "pendentes", rotulo: "Pendentes", n: pendentesNfs.length },
          { valor: "todas", rotulo: "Todas", n: todasNfs.length },
        ]}
        atual={modo}
        aoMudar={(v) => setModo(v as "pendentes" | "todas")}
      />
      {modo === "pendentes" && !q.isLoading && !q.isError && todasNfs.length > 0 && pendentesNfs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border p-8 text-center text-sm text-muted-foreground">
          Nenhuma NF com linha a ratear — todas as linhas de NF já estão alocadas.
          <Button variant="outline" size="sm" onClick={() => setModo("todas")}>Ver todas</Button>
        </div>
      ) : (
    <TabelaFetely
      busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar número da NF…" }}
      carregando={q.isLoading}
      erro={q.isError ? formatError(q.error) : null}
      aoTentarNovamente={() => q.refetch()}
      vazio={{
        mensagem:
          "Nenhuma NF de importação lançada. Importe a nota do fornecedor para ratear as linhas por SKU.",
      }}

      semResultado="Nenhuma NF para essa busca."
      total={todas.length}
      exibidos={filtradas.length}
      rotulo="NFs"
    >
      <div className="overflow-auto max-h-[calc(100vh-18rem)] rounded-md border">
        <Table containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>NF</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Linhas</TableHead>
              <TableHead className="text-right">Alocadas</TableHead>
              <TableHead className="text-right">Pendentes</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fatia.map((n) => {
              const pendentes = n.linhas - n.alocadas;
              return (
                <TableRow
                  key={n.id}
                  className="cursor-pointer"
                  onClick={() => aoAbrir(n)}
                >
                  <TableCell className="font-medium">{n.numero ?? `#${n.id}`}</TableCell>
                  <TableCell>{formatDateBR(n.data_emissao)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBRL(n.valor_total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{n.linhas}</TableCell>
                  <TableCell className="text-right tabular-nums">{n.alocadas}</TableCell>
                  <TableCell className="text-right">
                    {pendentes > 0 ? (
                      <Selo estado="warning">{pendentes}</Selo>
                    ) : (
                      <Selo estado="success">0</Selo>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <RodapePaginacao
        total={filtradas.length}
        pagina={pagina}
        tamanhoPagina={tamanho}
        tela="rateio_nfs"
        onPagina={setPagina}
        onTamanhoPagina={setTamanho}
      />
    </TabelaFetely>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Painel de mapeamento de uma linha                                  */
/* ------------------------------------------------------------------ */

function PainelMapeamento({
  nf,
  linha,
  aoSalvo,
}: {
  nf: NfPendencia;
  linha: WorklistLinha;
  aoSalvo: () => void;
}) {
  const [selecionados, setSelecionados] = useState<SkuSelecionado[]>([]);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<Previa>(null);
  const [gravando, setGravando] = useState(false);
  const [addFamilia, setAddFamilia] = useState(false);

  const sugestoes = useMemo<Sugestao[]>(() => {
    const s = linha.sugestoes;
    if (!s) return [];
    return Array.isArray(s) ? s : [];
  }, [linha.sugestoes]);

  const buscaQ = useQuery({
    queryKey: ["rateio-nf-busca-sku", busca],
    enabled: busca.trim().length >= 2,
    queryFn: async () => {
      const t = busca.trim();
      const { data, error } = await db
        .from("sncf_produtos")
        .select("sku, nome_comercial")
        .eq("ativo", true)
        .or(`sku.ilike.%${t}%,nome_comercial.ilike.%${t}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as { sku: string; nome_comercial: string | null }[];
    },
  });

  function adicionar(sku: string, nome: string | null): boolean {
    let novo = false;
    setSelecionados((prev) => {
      if (prev.some((p) => p.sku === sku)) return prev;
      novo = true;
      return [...prev, { sku, nome_comercial: nome, rateio_pct: "" }];
    });
    return novo;
  }

  async function adicionarFamilia(skuBase: string) {
    const prefixo = skuBase.split(".")[0];
    if (!prefixo) return;
    setAddFamilia(true);
    try {
      const { data: vinc, error: e1 } = await db
        .from("importacao_nf_pedido")
        .select("importacao_pedido_id")
        .eq("nf_id", nf.id);
      if (e1) throw e1;
      const pedidoIds = ((vinc ?? []) as { importacao_pedido_id: number }[]).map(
        (v) => v.importacao_pedido_id,
      );
      if (pedidoIds.length === 0) {
        toast.error("Esta NF não tem pedido de importação vinculado.");
        return;
      }
      const { data: linhas, error: e2 } = await db
        .from("importacao_linha")
        .select("sku")
        .in("importacao_pedido_id", pedidoIds)
        .like("sku", `${prefixo}.%`);
      if (e2) throw e2;
      const skus = Array.from(
        new Set(((linhas ?? []) as { sku: string | null }[]).map((l) => l.sku).filter(Boolean)),
      ) as string[];
      if (skus.length === 0) {
        toast.error(`Nenhum SKU da família ${prefixo} nos pedidos desta NF.`);
        return;
      }
      const { data: prods, error: e3 } = await db
        .from("sncf_produtos")
        .select("sku, nome_comercial")
        .eq("ativo", true)
        .in("sku", skus);
      if (e3) throw e3;
      const ativos = (prods ?? []) as { sku: string; nome_comercial: string | null }[];
      let adicionados = 0;
      ativos.forEach((p) => {
        if (adicionar(p.sku, p.nome_comercial)) adicionados += 1;
      });
      toast.success(
        `Família ${prefixo}: ${adicionados} SKU${adicionados === 1 ? "" : "s"} adicionado${adicionados === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setAddFamilia(false);
    }
  }

  const somaRateio = selecionados.reduce(
    (acc, s) => acc + (s.rateio_pct.trim() ? Number(s.rateio_pct.replace(",", ".")) || 0 : 0),
    0,
  );
  const algumRateio = selecionados.some((s) => s.rateio_pct.trim() !== "");
  const rateioInvalido = algumRateio && Math.abs(somaRateio - 100) > 0.01;

  function payloadSkus() {
    return selecionados.map((s) => ({
      sku: s.sku,
      rateio_pct: s.rateio_pct.trim() ? Number(s.rateio_pct.replace(",", ".")) : null,
    }));
  }

  async function salvar() {
    if (!nf.fornecedor_id) {
      toast.error("NF sem fornecedor — não é possível gravar de-para.");
      return;
    }
    if (selecionados.length === 0) {
      toast.error("Selecione ao menos um SKU.");
      return;
    }
    if (rateioInvalido) {
      toast.error("Os rateios preenchidos precisam somar 100%.");
      return;
    }
    setSalvando(true);
    try {
      const { data, error } = await db.rpc("confirmar_depara_fornecedor", {
        p_fornecedor_id: nf.fornecedor_id,
        p_codigo: linha.codigo_nf,
        p_skus: payloadSkus(),
        p_descricao_fornecedor: linha.descricao,
        p_confirmar: false,
      });
      if (error) throw error;
      setPrevia((Array.isArray(data) ? data[0] : data) ?? {});
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  async function gravar() {
    if (!nf.fornecedor_id) return;
    setGravando(true);
    try {
      const { error } = await db.rpc("confirmar_depara_fornecedor", {
        p_fornecedor_id: nf.fornecedor_id,
        p_codigo: linha.codigo_nf,
        p_skus: payloadSkus(),
        p_descricao_fornecedor: linha.descricao,
        p_confirmar: true,
      });
      if (error) throw error;
      toast.success("De-para gravado.");
      setPrevia(null);
      aoSalvo();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setGravando(false);
    }
  }

  return (
    <div className="space-y-4 rounded-md border bg-muted/40 p-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Candidatos calculados por: está no pedido · mesmo NCM · já comprado deste fornecedor.
          Confira o produto antes de adicionar — mesmo NCM não significa mesmo produto.
        </p>
        <Label>Sugestões do sistema</Label>
        {sugestoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem sugestões automáticas. Use a busca abaixo.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {sugestoes.map((s) => {
              const jaTem = selecionados.some((p) => p.sku === s.sku);
              return (
                <div
                  key={s.sku}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-md border p-2",
                    s.no_pedido && "border-success/40 bg-success/10",
                  )}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.sku}</span>
                      {s.no_pedido && <Selo estado="success">No pedido</Selo>}
                      {s.score != null && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          score {s.score}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {s.nome_comercial ?? "—"}
                    </div>
                    {s.motivos && (
                      <div className="text-[11px] text-muted-foreground">{s.motivos}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      size="sm"
                      variant={jaTem ? "secondary" : "outline"}
                      disabled={jaTem}
                      onClick={() => adicionar(s.sku, s.nome_comercial)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      {jaTem ? "Adicionado" : "Adicionar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={addFamilia}
                      onClick={() => void adicionarFamilia(s.sku)}
                    >
                      {addFamilia ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Layers className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Adicionar família {s.sku.split(".")[0]}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Adicionar SKU manualmente</Label>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar SKU ou nome comercial…"
        />
        {busca.trim().length >= 2 && (
          <div className="max-h-48 divide-y overflow-auto rounded-md border">
            {buscaQ.isLoading && (
              <div className="p-2 text-sm text-muted-foreground">Buscando…</div>
            )}
            {buscaQ.isError && (
              <div className="p-2 text-sm text-destructive">{formatError(buscaQ.error)}</div>
            )}
            {(buscaQ.data ?? []).map((p) => (
              <button
                key={p.sku}
                type="button"
                className="flex w-full items-center justify-between gap-3 p-2 text-left hover:bg-muted"
                onClick={() => adicionar(p.sku, p.nome_comercial)}
              >
                <span className="text-sm">{p.sku}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {p.nome_comercial ?? "—"}
                </span>
              </button>
            ))}
            {!buscaQ.isLoading && !buscaQ.isError && (buscaQ.data ?? []).length === 0 && (
              <div className="p-2 text-sm text-muted-foreground">Nenhum produto ativo.</div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>SKUs selecionados ({selecionados.length})</Label>
        {selecionados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum SKU selecionado ainda.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {selecionados.map((s, i) => (
              <div key={s.sku} className="flex items-center gap-3 p-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{s.sku}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {s.nome_comercial ?? "—"}
                  </div>
                </div>
                <Input
                  value={s.rateio_pct}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelecionados((prev) =>
                      prev.map((p, j) => (j === i ? { ...p, rateio_pct: v } : p)),
                    );
                  }}
                  inputMode="decimal"
                  placeholder="% (opcional)"
                  className="h-8 w-[130px]"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover ${s.sku}`}
                  onClick={() =>
                    setSelecionados((prev) => prev.filter((p) => p.sku !== s.sku))
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Em branco, o sistema distribui proporcionalmente à quantidade do pedido.
        </p>
        {algumRateio && (
          <p
            className={cn(
              "text-[11px] tabular-nums",
              rateioInvalido ? "text-destructive" : "text-success",
            )}
          >
            Soma atual: {somaRateio.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
            {rateioInvalido ? " — precisa somar 100%." : ""}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => void salvar()}
          disabled={salvando || selecionados.length === 0}
        >

          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Salvar de-para
        </Button>
      </div>

      <Dialog open={previa !== null} onOpenChange={(v) => !v && setPrevia(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prévia do de-para</DialogTitle>
            <DialogDescription>
              Código {linha.codigo_nf ?? "—"} · {selecionados.length} SKU(s). Nada foi gravado
              ainda.
            </DialogDescription>
          </DialogHeader>
          <PreviaLista dados={previa} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrevia(null)} disabled={gravando}>
              Cancelar
            </Button>
            <Button onClick={() => void gravar()} disabled={gravando}>
              {gravando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar e gravar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Linha expandida: destino + de-para                                */
/* ------------------------------------------------------------------ */

interface RateioAlocacao {
  sku: string | null;
  cod_cadastro: string | null;
  produto: string | null;
  quantidade: number | null;
  valor: number | null;
  base_rateio: string | null;
  origem: string | null;
  pedido: string | null;
}
interface RateioDepara {
  sku: string | null;
  cod_cadastro: string | null;
  produto: string | null;
  rateio_pct: number | null;
  usado_nesta_nf: boolean | null;
}
interface RateioLinha {
  nf_linha_id: string;
  alocacoes: RateioAlocacao[] | null;
  depara: RateioDepara[] | null;
}

const ROTULO_BASE: Record<string, string> = {
  proporcional_ao_pedido: "Proporcional ao pedido",
  quantidade: "Por quantidade",
  valor: "Por valor",
  rateio_declarado: "% declarado no de-para",
};

function rotuloRegra(a: RateioAlocacao): string {
  const base = a.base_rateio ? (ROTULO_BASE[a.base_rateio] ?? a.base_rateio) : "Direto";
  return a.origem === "romaneio" ? `${base} (romaneio)` : base;
}

function FiltroDuplo({
  opcoes,
  atual,
  aoMudar,
}: {
  opcoes: { valor: string; rotulo: string; n: number }[];
  atual: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <Button
          key={o.valor}
          size="sm"
          variant={atual === o.valor ? "default" : "outline"}
          onClick={() => aoMudar(o.valor)}
        >
          {o.rotulo} · {o.n}
        </Button>
      ))}
    </div>
  );
}

function CodCadastro({ cod, sku }: { cod: string | null; sku: string | null }) {
  return (
    <div>
      <div className="font-mono text-xs">{cod ?? sku ?? "—"}</div>
      {cod && sku && <div className="text-xs text-muted-foreground">{sku}</div>}
    </div>
  );
}

function BlocoDepara({ depara }: { depara: RateioDepara[] }) {
  const naoUsados = depara.filter((d) => !d.usado_nesta_nf).length;
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label>De-para deste código</Label>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cód. cadastro</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead className="text-right">% rateio</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {depara.map((d, i) => (
            <TableRow key={`${d.sku}-${i}`}>
              <TableCell><CodCadastro cod={d.cod_cadastro} sku={d.sku} /></TableCell>
              <TableCell>{d.produto ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {d.rateio_pct != null ? `${NUM.format(Number(d.rateio_pct))}%` : "—"}
              </TableCell>
              <TableCell>{d.usado_nesta_nf && <Selo estado="success">Usado nesta NF</Selo>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {depara.length > 1 && naoUsados > 0 && (
        <p className="rounded-md border border-info/40 bg-info/10 p-2 text-xs text-info">
          Este código do fornecedor está ligado a {depara.length} produtos. Nesta NF só entraram
          os que estão no pedido.
        </p>
      )}
    </div>
  );
}

function LinhaExpandida({
  nf,
  linha,
  destino,
  aoSalvo,
}: {
  nf: NfPendencia;
  linha: WorklistLinha;
  destino: RateioLinha | undefined;
  aoSalvo: () => void;
}) {
  const [revisar, setRevisar] = useState(false);
  const alocs = destino?.alocacoes ?? [];
  const depara = destino?.depara ?? [];

  if (!linha.alocada) {
    return (
      <div className="space-y-3">
        {depara.length > 0 && <BlocoDepara depara={depara} />}
        <PainelMapeamento nf={nf} linha={linha} aoSalvo={aoSalvo} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border p-3">
        <Label>Para onde foi</Label>
        {alocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Destino ainda não carregado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cód. cadastro</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor (R$)</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead>Pedido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alocs.map((a, i) => (
                <TableRow key={`${a.sku}-${i}`}>
                  <TableCell><CodCadastro cod={a.cod_cadastro} sku={a.sku} /></TableCell>
                  <TableCell>{a.produto ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQtd(a.quantidade)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(a.valor)}</TableCell>
                  <TableCell>{rotuloRegra(a)}</TableCell>
                  <TableCell>{a.pedido ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {depara.length > 0 && <BlocoDepara depara={depara} />}
      {!revisar ? (
        <Button variant="outline" size="sm" onClick={() => setRevisar(true)}>
          Revisar de-para
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm text-warning">
            Alterar o de-para muda como as PRÓXIMAS NFs com este código serão rateadas. Esta NF não
            é re-rateada automaticamente.
          </p>
          <PainelMapeamento nf={nf} linha={linha} aoSalvo={aoSalvo} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nivel 2 — worklist                                                 */
/* ------------------------------------------------------------------ */

function WorklistNf({ nf, aoVoltar }: { nf: NfPendencia; aoVoltar: () => void }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [previaAloc, setPreviaAloc] = useState<Previa>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [alocando, setAlocando] = useState(false);

  const q = useQuery({
    queryKey: ["rateio-nf-worklist", nf.id],
    queryFn: async (): Promise<WorklistLinha[]> => {
      const { data, error } = await db.rpc("fn_worklist_depara_nf", {
        p_nf_id: nf.id,
        p_sugestoes: 5,
      });
      if (error) throw error;
      return (data ?? []) as WorklistLinha[];
    },
  });

  const destinoQ = useQuery({
    queryKey: ["vw_rateio_nf_linha", nf.id],
    queryFn: async (): Promise<Map<string, RateioLinha>> => {
      const { data, error } = await db
        .from("vw_rateio_nf_linha")
        .select("nf_linha_id, alocacoes, depara")
        .eq("nf_id", nf.id);
      if (error) throw error;
      const m = new Map<string, RateioLinha>();
      ((data ?? []) as RateioLinha[]).forEach((r) => m.set(r.nf_linha_id, r));
      return m;
    },
  });
  useEffect(() => {
    if (destinoQ.error) toast.error(formatError(destinoQ.error));
  }, [destinoQ.error]);

  const [modo, setModo] = useState<"nao_alocadas" | "todas" | null>(null);
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const todasLinhas = q.data ?? [];
  const naoAlocadas = useMemo(() => todasLinhas.filter((l) => !l.alocada), [todasLinhas]);
  const modoEf = modo ?? (naoAlocadas.length > 0 ? "nao_alocadas" : "todas");
  const todas = modoEf === "nao_alocadas" ? naoAlocadas : todasLinhas;
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return todas;
    return todas.filter(
      (l) =>
        (l.codigo_nf ?? "").toLowerCase().includes(t) ||
        (l.descricao ?? "").toLowerCase().includes(t),
    );
  }, [todas, busca]);
  useEffect(() => setPagina(1), [busca, modoEf, tamanho]);
  const fatia = filtradas.slice((pagina - 1) * tamanho, pagina * tamanho);

  function invalidar() {
    invalidarCompras(qc);
    void qc.invalidateQueries({ queryKey: ["vw_rateio_nf_linha", nf.id] });
    void qc.invalidateQueries({ queryKey: ["pedido-mercadoria-diag-alocacao"] });
  }

  async function previewAlocar() {
    setCarregandoPrevia(true);
    try {
      const { data, error } = await db.rpc("alocar_nf_linhas", {
        p_nf_id: nf.id,
        p_confirmar: false,
      });
      if (error) throw error;
      setPreviaAloc((Array.isArray(data) ? data[0] : data) ?? {});
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setCarregandoPrevia(false);
    }
  }

  async function confirmarAlocar() {
    setAlocando(true);
    try {
      const { error } = await db.rpc("alocar_nf_linhas", {
        p_nf_id: nf.id,
        p_confirmar: true,
      });
      if (error) throw error;
      toast.success("NF alocada.");
      setPreviaAloc(null);
      invalidar();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setAlocando(false);
    }
  }

  const semDepara = Number((previaAloc?.sem_depara as number) ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={aoVoltar}>
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            NFs
          </Button>
          <div>
            <div className="text-sm">NF {nf.numero ?? `#${nf.id}`}</div>
            <div className="text-[11px] text-muted-foreground">
              {formatDateBR(nf.data_emissao)} · {formatBRL(nf.valor_total)} · {nf.linhas} linha
              {nf.linhas === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <Button onClick={() => void previewAlocar()} disabled={carregandoPrevia}>
          {carregandoPrevia && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Alocar NF
        </Button>
      </div>

      <FiltroDuplo
        opcoes={[
          { valor: "nao_alocadas", rotulo: "Não alocadas", n: naoAlocadas.length },
          { valor: "todas", rotulo: "Todas", n: todasLinhas.length },
        ]}
        atual={modoEf}
        aoMudar={(v) => setModo(v as "nao_alocadas" | "todas")}
      />
      <TabelaFetely
        busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar código ou descrição…" }}
        carregando={q.isLoading}
        erro={q.isError ? formatError(q.error) : null}
        aoTentarNovamente={() => q.refetch()}
        vazio={{
          mensagem:
            "Esta NF não tem linha pendente de rateio. Todo item já tem de-para e destino — nada a fazer aqui.",
        }}

        semResultado="Nenhum item para essa busca."
        total={todas.length}
        exibidos={filtradas.length}
        rotulo="itens"
      >
        <div className="overflow-auto max-h-[calc(100vh-18rem)] rounded-md border">
          <Table containerClassName="overflow-visible">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-[40px]" />
                <TableHead className="text-right">Item</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>NCM</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor total</TableHead>
                <TableHead>Foi para</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fatia.map((l) => {
                const expandida = aberta === l.nf_linha_id;
                const destino = destinoQ.data?.get(l.nf_linha_id);
                const alocs = destino?.alocacoes ?? [];
                const mapeados = Number(l.skus_ja_mapeados ?? 0);
                const selo = l.alocada ? (
                  <Selo estado="success">Alocada</Selo>
                ) : mapeados > 0 ? (
                  <Selo estado="info">De-para pronto, falta alocar</Selo>
                ) : (
                  <Selo estado="warning">Sem de-para</Selo>
                );
                return (
                  <Fragment key={l.nf_linha_id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setAberta(expandida ? null : l.nf_linha_id)}
                    >
                      <TableCell>
                        {expandida ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.item_seq ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">{l.codigo_nf ?? "—"}</TableCell>
                      <TableCell className="max-w-[320px] truncate">
                        {l.descricao ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">{l.ncm ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtQtd(l.quantidade)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(l.valor_total)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {alocs.length > 0
                          ? `${alocs[0].cod_cadastro ?? alocs[0].sku ?? "—"}${alocs.length > 1 ? ` +${alocs.length - 1}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>{selo}</TableCell>
                    </TableRow>
                    {expandida && (
                      <TableRow>
                        <TableCell colSpan={9} className="p-3">
                          <LinhaExpandida
                            nf={nf}
                            linha={l}
                            destino={destino}
                            aoSalvo={invalidar}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <RodapePaginacao
          total={filtradas.length}
          pagina={pagina}
          tamanhoPagina={tamanho}
          tela="rateio_nf_linhas"
          onPagina={setPagina}
          onTamanhoPagina={setTamanho}
        />
      </TabelaFetely>

      <Dialog open={previaAloc !== null} onOpenChange={(v) => !v && setPreviaAloc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prévia da alocação</DialogTitle>
            <DialogDescription>
              Nada foi gravado ainda. Confira os números antes de confirmar.
            </DialogDescription>
          </DialogHeader>
          <PreviaLista dados={previaAloc} />
          {semDepara > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm text-warning">
              {semDepara} linha(s) sem de-para ficarão de fora desta alocação.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviaAloc(null)} disabled={alocando}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarAlocar()} disabled={alocando}>
              {alocando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar alocação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function RateioNfTab() {
  const [nf, setNf] = useState<NfPendencia | null>(null);

  return (
    <div className="space-y-4">
      <ParaQueServe>
        Traduz cada linha da NF (código do fornecedor) para os nossos SKUs e reparte quantidade e
        valor — é o que dá custo ao produto e permite a entrada no estoque. Abra uma NF pendente,
        confira o de-para e aloque.
      </ParaQueServe>
      <Card>
        <CardContent className="pt-6">
          {nf ? (
            <WorklistNf nf={nf} aoVoltar={() => setNf(null)} />
          ) : (
            <ListaNfs aoAbrir={setNf} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
