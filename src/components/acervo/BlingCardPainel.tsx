import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { ResolverNomeDialog } from "@/components/acervo/ResolverNomeDialog";
import { AlertTriangle, Eye, Loader2, Send } from "lucide-react";

const LEVA = 20;

interface LinhaFila {
  cod_cadastro: string | null;
  sku: string;
  nome_comercial: string | null;
  nome_operacional: string | null;
  colecao: string | null;
  grupo: string | null;
  fase: string | null;
  ncm: string | null;
  cest: string | null;
  ean: string | null;
  peso_g: number | null;
  preco_varejo: number | null;
  eta: string | null;
  pedido_importacao: string | null;
  ncm_sugerido: string | null;
  ncm_sugerido_apoio: number | null;
  falta: string[] | null;
  situacao_nascimento: "A" | "I" | null;
  largura_cm: number | null;
  altura_cm: number | null;
  profundidade_cm: number | null;
  conflito_nome: string | null;
  avisos: string[] | null;
}

function rotuloFalta(f: string): string {
  if (f === "nome repetido" || f === "nome malformado") return f.charAt(0).toUpperCase() + f.slice(1);
  return `Falta ${f}`;
}

function formatBRL(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function med(v: number | null): string {
  return v === null || v === undefined ? "—" : String(v).replace(".", ",");
}

interface Previa {
  criar: { codigo: string; nome: string }[];
  recusados: { sku: string; motivo: string }[];
}

interface Final {
  criados: { sku: string; bling_id: string }[];
  falhas: { sku: string; status: number | null; corpo: string }[];
  recusados: { sku: string; motivo: string }[];
}

function ddmm(d: string | null): string | null {
  if (!d) return null;
  const [, m, dia] = d.slice(0, 10).split("-");
  return m && dia ? `${dia}/${m}` : null;
}

function levas<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += LEVA) out.push(arr.slice(i, i + LEVA));
  return out;
}

async function chamar(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("criar-produto-bling", { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const corpo = await ctx.json();
        if (corpo?.erro) msg = corpo.erro;
      }
    } catch { /* mantém a mensagem original */ }
    throw new Error(msg);
  }
  if (data?.ok !== true) throw new Error(data?.erro ?? "Falha sem detalhe na edge criar-produto-bling");
  return data;
}

export function BlingCardPainel() {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [origem, setOrigem] = useState<string>("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [criando, setCriando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["bling-card-fila"],
    queryFn: async (): Promise<LinhaFila[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_bling_card_fila")
        .select("*")
        .order("eta", { ascending: true, nullsFirst: false })
        .order("cod_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaFila[];
    },
  });

  const linhas = q.data ?? [];
  const [resolver, setResolver] = useState<LinhaFila[] | null>(null);

  // Origem fiscal padrão do catálogo: mais frequente entre os ativos.
  const qOrigem = useQuery({
    queryKey: ["sncf-produtos-origem-padrao"],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from("sncf_produtos")
        .select("origem_fisc")
        .eq("fase", "ativo")
        .not("origem_fisc", "is", null)
        .limit(1000);
      if (error) throw error;
      const cont = new Map<string, number>();
      for (const r of (data ?? []) as any[]) {
        const o = String(r.origem_fisc);
        cont.set(o, (cont.get(o) ?? 0) + 1);
      }
      let melhor: string | null = null;
      let melhorN = -1;
      for (const [o, n] of cont) {
        if (n > melhorN) {
          melhor = o;
          melhorN = n;
        }
      }
      return melhor;
    },
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (qOrigem.data) setOrigem((prev) => (prev === "" ? qOrigem.data! : prev));
  }, [qOrigem.data]);

  const abrirResolver = (l: LinhaFila) => {
    const trecho = (l.conflito_nome ?? "").match(/SNCF:\s*([^;|]*)/i)?.[1] ?? "";
    const cods: string[] = trecho.match(/[A-Za-z0-9-]+/g) ?? [];
    const outras = linhas.filter((x) => x.sku !== l.sku && x.cod_cadastro && cods.includes(x.cod_cadastro));
    setResolver([l, ...outras]);
  };
  const [filtro, setFiltro] = useState<string>("todos");

  const cartoes = useMemo(() => {
    const out: { chave: string; rotulo: string; qtd: number; tom?: "erro" | "aviso" | "ok" }[] = [];
    out.push({ chave: "todos", rotulo: "Todos", qtd: linhas.length });
    const nProntos = linhas.filter((l) => (l.falta ?? []).length === 0).length;
    if (nProntos > 0) out.push({ chave: "prontos", rotulo: "Prontos", qtd: nProntos, tom: "ok" });
    const cont = new Map<string, number>();
    for (const l of linhas) for (const f of l.falta ?? []) cont.set(f, (cont.get(f) ?? 0) + 1);
    for (const [f, n] of cont) out.push({ chave: `falta:${f}`, rotulo: rotuloFalta(f), qtd: n, tom: "erro" });
    const nAviso = linhas.filter((l) => (l.avisos ?? []).length > 0).length;
    if (nAviso > 0) out.push({ chave: "aviso", rotulo: "Com aviso", qtd: nAviso, tom: "aviso" });
    return out;
  }, [linhas]);

  const filtradas = useMemo(() => {
    if (filtro === "todos") return linhas;
    if (filtro === "prontos") return linhas.filter((l) => (l.falta ?? []).length === 0);
    if (filtro === "aviso") return linhas.filter((l) => (l.avisos ?? []).length > 0);
    if (filtro.startsWith("falta:")) {
      const f = filtro.slice(6);
      return linhas.filter((l) => (l.falta ?? []).includes(f));
    }
    return linhas;
  }, [linhas, filtro]);

  const prontos = useMemo(() => filtradas.filter((l) => (l.falta ?? []).length === 0), [filtradas]);

  function mudouSelecao(fn: (prev: string[]) => string[]) {
    setPrevia(null);
    setFinal(null);
    setSelecionados(fn);
  }

  function alternar(sku: string) {
    mudouSelecao((prev) => (prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]));
  }

  const todosProntosMarcados = prontos.length > 0 && prontos.every((l) => selecionados.includes(l.sku));

  async function fazerPrevia() {
    setCarregandoPrevia(true);
    setFinal(null);
    try {
      const acc: Previa = { criar: [], recusados: [] };
      for (const leva of levas(selecionados)) {
        const d = await chamar({ skus: leva, executar: false });
        acc.criar.push(...((d.criar ?? []) as Previa["criar"]));
        acc.recusados.push(...((d.recusados ?? []) as Previa["recusados"]));
      }
      setPrevia(acc);
      toast.success(`Prévia: ${acc.criar.length} a criar · ${acc.recusados.length} recusado(s)`);
    } catch (e) {
      setPrevia(null);
      toast.error(formatError(e));
    } finally {
      setCarregandoPrevia(false);
    }
  }

  async function criar() {
    if (!previa || !origem) return;
    const skus = previa.criar.map((c) => c.codigo);
    const lotes = levas(skus);
    setCriando(true);
    const acc: Final = { criados: [], falhas: [], recusados: [] };
    try {
      for (let i = 0; i < lotes.length; i++) {
        setProgresso(`leva ${i + 1} de ${lotes.length}`);
        const d = await chamar({ skus: lotes[i], executar: true, origem_fiscal: origem });
        acc.criados.push(...(d.criados ?? []));
        acc.falhas.push(...(d.falhas ?? []));
        acc.recusados.push(...(d.recusados ?? []));
      }
      setFinal(acc);
      setPrevia(null);
      setSelecionados([]);
      if (acc.falhas.length > 0) toast.error(`${acc.criados.length} criado(s) · ${acc.falhas.length} falha(s)`);
      else toast.success(`${acc.criados.length} card(s) criado(s) no Bling`);
    } catch (e) {
      setFinal(acc);
      toast.error(formatError(e));
    } finally {
      setCriando(false);
      setProgresso(null);
      void q.refetch();
    }
  }

  const podeCriar = !!previa && previa.criar.length > 0 && !!origem && !criando;

  return (
    <Card>
      <CardHeader className="pb-3 space-y-1">
        <CardTitle className="text-base">Criar card no Bling</CardTitle>
        <p className="text-sm text-muted-foreground">
          Produtos ativos e de pré-venda que ainda não têm card no Bling. O card nasce com a situação da fase
          (pré-venda = inativo). Sem NCM não cria.
        </p>
        {!q.isLoading && !q.isError && linhas.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {cartoes.map((c) => {
              const ativo = filtro === c.chave;
              const cor =
                c.tom === "erro" ? "text-destructive" : c.tom === "aviso" ? "text-warning" : c.tom === "ok" ? "text-success" : "";
              return (
                <button
                  key={c.chave}
                  type="button"
                  onClick={() => setFiltro(ativo || c.chave === "todos" ? "todos" : c.chave)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
                    ativo ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className={`text-xl font-semibold tabular-nums ${cor}`}>{c.qtd}</div>
                  <div className="text-[11px] text-muted-foreground">{c.rotulo}</div>
                </button>
              );
            })}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Não foi possível carregar a fila</AlertTitle>
            <AlertDescription className="text-xs">{formatError(q.error)}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium">Origem fiscal *</p>
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger className="w-[340px]">
                <SelectValue placeholder="Escolha a origem fiscal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 — Estrangeira, adquirida no mercado interno</SelectItem>
                <SelectItem value="1">1 — Estrangeira, importação direta</SelectItem>
                <SelectItem value="0">0 — Nacional</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Padrão do catálogo: {qOrigem.data ?? "—"} (a Fetely compra de importadora). Mude só se o contador indicar.
            </p>
            {origem && qOrigem.data && origem !== qOrigem.data && (
              <p className="text-[11px] text-warning">Diferente do padrão do catálogo ({qOrigem.data})</p>
            )}
          </div>
          <Badge variant="outline">{selecionados.length} selecionado(s)</Badge>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={selecionados.length === 0 || carregandoPrevia || criando}
            onClick={() => void fazerPrevia()}
          >
            {carregandoPrevia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            Prévia
          </Button>
          <BotaoGuardado
            slug="acao.produto_corrigir_externo"
            rotuloAcao="Criar card no Bling"
            size="sm"
            className="gap-2"
            disabled={!podeCriar}
            onClick={() => void criar()}
          >
            {criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Criar {previa?.criar.length ?? 0} card(s)
          </BotaoGuardado>
          {progresso && <span className="text-xs text-muted-foreground">{progresso}</span>}
          {previa && !origem && <span className="text-xs text-warning">Escolha a origem fiscal para criar.</span>}
        </div>

        {previa && (
          <div className="rounded-md border p-3 space-y-2 text-xs">
            <p className="font-medium">
              Prévia: {previa.criar.length} a criar · {previa.recusados.length} recusado(s)
            </p>
            {previa.criar.length > 0 && (
              <div className="max-h-40 overflow-auto space-y-0.5">
                {previa.criar.map((c) => (
                  <div key={c.codigo} className="flex gap-2">
                    <span className="font-mono shrink-0">{c.codigo}</span>
                    <span className="text-muted-foreground truncate">{c.nome}</span>
                  </div>
                ))}
              </div>
            )}
            {previa.recusados.length > 0 && (
              <div className="max-h-40 overflow-auto space-y-0.5 text-destructive">
                {previa.recusados.map((r) => (
                  <div key={r.sku} className="flex gap-2">
                    <span className="font-mono shrink-0">{r.sku}</span>
                    <span>{r.motivo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {final && (
          <div className="rounded-md border p-3 space-y-2 text-xs">
            <p className="font-medium">
              Resultado: {final.criados.length} criado(s) · {final.falhas.length} falha(s)
              {final.recusados.length > 0 ? ` · ${final.recusados.length} recusado(s)` : ""}
            </p>
            {final.falhas.map((f) => (
              <div key={f.sku} className="text-destructive break-words">
                <span className="font-mono">{f.sku}</span> ({f.status ?? "—"}): {f.corpo}
              </div>
            ))}
            {final.recusados.map((r) => (
              <div key={r.sku} className="text-destructive">
                <span className="font-mono">{r.sku}</span>: {r.motivo}
              </div>
            ))}
          </div>
        )}

        {q.isLoading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando a fila…
          </div>
        ) : linhas.length === 0 && !q.isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Todos os produtos ativos e de pré-venda têm card no Bling.</p>
        ) : (
          <TooltipProvider>
            <div className="rounded-md border max-h-[calc(100vh-22rem)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={todosProntosMarcados}
                        disabled={prontos.length === 0}
                        onCheckedChange={() =>
                          mudouSelecao(() => (todosProntosMarcados ? [] : prontos.map((l) => l.sku)))
                        }
                        aria-label="Selecionar todos os prontos"
                      />
                    </TableHead>
                    <TableHead>Cód.</TableHead>
                    <TableHead>Nome no Bling</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Nasce como</TableHead>
                    <TableHead>Chegada</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead>NCM</TableHead>
                    <TableHead>CEST</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                    <TableHead>Medidas</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead>Pendências</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((l) => {
                    const falta = l.falta ?? [];
                    const avisos = l.avisos ?? [];
                    const vazio = "bg-destructive/10";
                    const pronto = falta.length === 0;
                    return (
                      <TableRow key={l.sku}>
                        <TableCell>
                          <Checkbox
                            checked={selecionados.includes(l.sku)}
                            disabled={!pronto}
                            onCheckedChange={() => alternar(l.sku)}
                            aria-label={`Selecionar ${l.sku}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">{l.cod_cadastro ?? l.sku}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{l.nome_operacional ?? "—"}</div>
                          {l.nome_comercial && (
                            <div className="text-[11px] text-muted-foreground">{l.nome_comercial}</div>
                          )}
                          {l.conflito_nome && (
                            <div className="text-[11px] text-destructive">igual a: {l.conflito_nome}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{l.grupo ?? "—"}</TableCell>
                        <TableCell>
                          {l.situacao_nascimento ? (
                            <Badge variant="outline" className="text-[10px]">
                              {l.situacao_nascimento === "I" ? "Inativo" : "Ativo"}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ddmm(l.eta) ?? "—"}
                          {l.pedido_importacao && (
                            <div className="text-[11px] text-muted-foreground">{l.pedido_importacao}</div>
                          )}
                        </TableCell>
                        <TableCell className={`font-mono text-xs ${l.ean ? "" : vazio}`}>{l.ean ?? "—"}</TableCell>
                        <TableCell className={`text-xs ${l.ncm ? "" : vazio}`}>
                          {l.ncm ? (
                            <span className="font-mono">{l.ncm}</span>
                          ) : l.ncm_sugerido ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[10px] border-warning/60 text-warning">
                                  sugerido {l.ncm_sugerido}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                unânime em {l.ncm_sugerido_apoio ?? 0} produtos do grupo — confirme na ficha
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">falta NCM</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{l.cest ?? "—"}</TableCell>
                        <TableCell className={`text-right text-xs tabular-nums ${l.peso_g ? "" : vazio}`}>
                          {l.peso_g ? `${l.peso_g} g` : "—"}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums whitespace-nowrap">
                          {med(l.largura_cm)} × {med(l.altura_cm)} × {med(l.profundidade_cm)} cm
                        </TableCell>
                        <TableCell className={`text-right text-xs tabular-nums ${l.preco_varejo ? "" : vazio}`}>
                          {formatBRL(l.preco_varejo)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {pronto && (
                              <Badge variant="outline" className="text-[10px] border-success/60 text-success">pronto</Badge>
                            )}
                            {falta.map((f) => (
                              <Badge key={f} variant="destructive" className="text-[10px]">{f}</Badge>
                            ))}
                            {falta.includes("nome repetido") && (
                              <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => abrirResolver(l)}>
                                Resolver
                              </Button>
                            )}
                            {avisos.map((a) => (
                              <Badge key={a} variant="outline" className="text-[10px] border-warning/60 text-warning">{a}</Badge>
                            ))}
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
      </CardContent>
      <ResolverNomeDialog
        aberto={!!resolver}
        onFechar={() => setResolver(null)}
        linhas={resolver ?? []}
        onResolvido={() => void q.refetch()}
      />
    </Card>
  );
}
