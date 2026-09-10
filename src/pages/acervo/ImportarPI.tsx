import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { FileSpreadsheet, AlertTriangle, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Importação de PI — PARTE 1: ler a planilha, o humano confirma o mapeamento,
 * grava em estágio. Nada toca produto aqui.
 *
 * O arquivo é lido NO NAVEGADOR com SheetJS e não sobe para storage.
 *
 * ARMADILHA MEDIDA: o cabeçalho varia da linha 5 à 18 entre os 5 formatos e os
 * nomes de coluna não repetem entre fornecedores — posição fixa quebra no
 * segundo arquivo. Um formato (Rocabella/Glasses) tem cabeçalho em duas linhas
 * com células mescladas, então quando a linha vencedora tem muitas células
 * vazias tentamos concatenar com a linha seguinte.
 *
 * ARMADILHA CRÍTICA: EAN e DUN vão como TEXTO com zero à esquerda. O Excel
 * entrega número e o zero se perde — foi assim que 633 itens do XPM nasceram
 * sem o zero à esquerda.
 */

const CAMPOS = [
  "sku",
  "cod_cadastro",
  "ean",
  "dun",
  "inner_qtd",
  "descricao",
  "qtd",
  "peso_g",
] as const;
type Campo = (typeof CAMPOS)[number];
const IGNORAR = "__ignorar__";

const ROTULO: Record<Campo, string> = {
  sku: "SKU",
  cod_cadastro: "Cód. cadastro",
  ean: "EAN",
  dun: "DUN",
  inner_qtd: "Inner (qtd)",
  descricao: "Descrição",
  qtd: "Quantidade",
  peso_g: "Peso (g)",
};

interface Sinonimo {
  campo: string;
  sinonimo: string;
  formato: string | null;
}

function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Numérico ou null — nunca 0 de consolo. */
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const limpo = String(v).replace(/[^\d,.-]/g, "");
  if (!limpo) return null;
  const pt = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(pt);
  return Number.isFinite(n) ? n : null;
}

/** Texto com zeros à esquerda preservados. */
function codigoBarras(v: unknown, tamanho: number): string | null {
  if (v === null || v === undefined || v === "") return null;
  const bruto = typeof v === "number" ? String(Math.round(v)) : String(v).trim();
  const so = bruto.replace(/\D/g, "");
  if (!so) return null;
  return so.length >= tamanho ? so : so.padStart(tamanho, "0");
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

type Matriz = unknown[][];

export default function ImportarPI() {
  const [arquivoNome, setArquivoNome] = useState("");
  const [abas, setAbas] = useState<string[]>([]);
  const [aba, setAba] = useState("");
  const [matriz, setMatriz] = useState<Matriz>([]);
  const [linhaCabecalho, setLinhaCabecalho] = useState(0); // índice 0-based
  const [lendo, setLendo] = useState(false);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);

  const [mapa, setMapa] = useState<Record<number, string>>({});
  const [mapeamentoConfirmado, setMapeamentoConfirmado] = useState(false);
  const [fornecedor, setFornecedor] = useState("");
  const [piNumero, setPiNumero] = useState("");

  const [gravando, setGravando] = useState(false);
  const [loteId, setLoteId] = useState<string | null>(null);

  const sinonimos = useQuery({
    queryKey: ["pi_coluna_sinonimo"],
    queryFn: async (): Promise<Sinonimo[]> => {
      const { data, error } = await supabase
        .from("pi_coluna_sinonimo")
        .select("campo, sinonimo, formato");
      if (error) throw error;
      return (data ?? []) as Sinonimo[];
    },
  });

  const indice = useMemo(() => {
    const m = new Map<string, Sinonimo>();
    for (const s of sinonimos.data ?? []) m.set(normalizar(s.sinonimo), s);
    return m;
  }, [sinonimos.data]);

  /** Quantas células da linha casam com algum sinônimo. */
  function pontuar(linha: unknown[]): number {
    let n = 0;
    for (const c of linha) {
      const k = normalizar(c);
      if (k && indice.has(k)) n++;
    }
    return n;
  }

  function detectarCabecalho(m: Matriz): number {
    let melhor = 0;
    let pontos = -1;
    const teto = Math.min(25, m.length);
    for (let i = 0; i < teto; i++) {
      const p = pontuar(m[i] ?? []);
      if (p > pontos) {
        pontos = p;
        melhor = i;
      }
    }
    return melhor;
  }

  /** Cabeçalho de duas linhas mescladas: concatena com a linha seguinte. */
  function montarCabecalho(m: Matriz, idx: number): string[] {
    const linha = (m[idx] ?? []).map((c) => texto(c) ?? "");
    const largura = Math.max(linha.length, ...m.slice(idx, idx + 6).map((r) => r?.length ?? 0));
    const atual = Array.from({ length: largura }, (_, i) => linha[i] ?? "");
    const vazias = atual.filter((c) => c === "").length;

    if (vazias > atual.length / 3) {
      const proxima = (m[idx + 1] ?? []).map((c) => texto(c) ?? "");
      const juntas = atual.map((c, i) => [c, proxima[i] ?? ""].filter(Boolean).join(" ").trim());
      if (pontuar(juntas) > pontuar(atual)) return juntas;
    }
    return atual;
  }

  const cabecalho = useMemo(
    () => (matriz.length ? montarCabecalho(matriz, linhaCabecalho) : []),
    [matriz, linhaCabecalho, indice],
  );

  const colunasCasadas = useMemo(
    () => cabecalho.filter((c) => indice.has(normalizar(c))).length,
    [cabecalho, indice],
  );

  /** Linhas de dado com o número REAL da linha na planilha. */
  const linhasDado = useMemo(() => {
    const inicio = linhaCabecalho + 1;
    return matriz
      .slice(inicio)
      .map((valores, i) => ({ linha_num: inicio + i + 1, valores: valores ?? [] }))
      .filter((r) => r.valores.some((c) => texto(c) !== null));
  }, [matriz, linhaCabecalho]);

  function aplicarPreSelecao(cab: string[]) {
    const novo: Record<number, string> = {};
    cab.forEach((c, i) => {
      const s = indice.get(normalizar(c));
      novo[i] = s && (CAMPOS as readonly string[]).includes(s.campo) ? s.campo : IGNORAR;
    });
    setMapa(novo);
  }

  function carregarAba(wb: XLSX.WorkBook, nome: string) {
    const folha = wb.Sheets[nome];
    const m = XLSX.utils.sheet_to_json<unknown[]>(folha, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    }) as Matriz;
    const idx = detectarCabecalho(m);
    setMatriz(m);
    setLinhaCabecalho(idx);
    aplicarPreSelecao(montarCabecalho(m, idx));
    setMapeamentoConfirmado(false);
    setLoteId(null);

    // pré-preenche PI varrendo as primeiras linhas
    const alvo = m
      .slice(0, Math.max(idx, 10))
      .flat()
      .map((c) => texto(c))
      .filter(Boolean) as string[];
    const achou = alvo.find((s) => /p\.?\s?i\.?\s*[:#-]?\s*\d+/i.test(s));
    if (achou) {
      const n = achou.match(/(\d[\d./-]*)/);
      if (n) setPiNumero(n[1]);
    }
  }

  async function escolherArquivo(file: File | undefined) {
    if (!file) return;
    if (indice.size === 0) {
      toast.error("Sinônimos de coluna ainda não carregaram. Aguarde e tente de novo.");
      return;
    }
    setLendo(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (!wb.SheetNames.length) throw new Error("A planilha não tem nenhuma aba.");
      setWorkbook(wb);
      setAbas(wb.SheetNames);
      setArquivoNome(file.name);
      const primeira = wb.SheetNames[0];
      setAba(primeira);
      carregarAba(wb, primeira);
      toast.success(`${file.name} lido no navegador`);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setLendo(false);
    }
  }

  function trocarAba(nome: string) {
    if (!workbook) return;
    setAba(nome);
    try {
      carregarAba(workbook, nome);
      toast.success(`Aba "${nome}" carregada`);
    } catch (e) {
      toast.error(formatError(e));
    }
  }

  function corrigirLinha(valor: string) {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 1 || n > matriz.length) return;
    const idx = n - 1;
    setLinhaCabecalho(idx);
    aplicarPreSelecao(montarCabecalho(matriz, idx));
    setMapeamentoConfirmado(false);
  }

  const camposEscolhidos = useMemo(() => {
    const pares: { indiceColuna: number; campo: Campo }[] = [];
    Object.entries(mapa).forEach(([i, campo]) => {
      if (campo !== IGNORAR) pares.push({ indiceColuna: Number(i), campo: campo as Campo });
    });
    return pares.sort((a, b) => CAMPOS.indexOf(a.campo) - CAMPOS.indexOf(b.campo));
  }, [mapa]);

  function valorCampo(valores: unknown[], campo: Campo, indiceColuna: number) {
    const cru = valores[indiceColuna];
    if (campo === "ean") return codigoBarras(cru, 13);
    if (campo === "dun") return codigoBarras(cru, 14);
    if (campo === "inner_qtd" || campo === "qtd" || campo === "peso_g") return numero(cru);
    return texto(cru);
  }

  function exemploColuna(i: number): string {
    for (const r of linhasDado) {
      const v = texto(r.valores[i]);
      if (v) return v;
    }
    return "—";
  }

  function confirmarMapeamento() {
    if (camposEscolhidos.length === 0) {
      toast.error("Escolha ao menos uma coluna de destino.");
      return;
    }
    const vistos = new Set<string>();
    for (const p of camposEscolhidos) {
      if (vistos.has(p.campo)) {
        toast.error(`O campo ${ROTULO[p.campo]} foi apontado por mais de uma coluna.`);
        return;
      }
      vistos.add(p.campo);
    }
    setMapeamentoConfirmado(true);
    toast.success("Mapeamento confirmado");
  }

  const formatoLote = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const c of cabecalho) {
      const s = indice.get(normalizar(c));
      if (s?.formato) contagem.set(s.formato, (contagem.get(s.formato) ?? 0) + 1);
    }
    let vencedor: string | null = null;
    let max = 0;
    contagem.forEach((n, f) => {
      if (n > max) {
        max = n;
        vencedor = f;
      }
    });
    return vencedor;
  }, [cabecalho, indice]);

  async function gravarLote() {
    setGravando(true);
    try {
      const mapeamento: Record<string, string> = {};
      camposEscolhidos.forEach((p) => {
        mapeamento[cabecalho[p.indiceColuna] || `coluna_${p.indiceColuna + 1}`] = p.campo;
      });

      const { data: lote, error: erroLote } = await supabase
        .from("pi_import_lote")
        .insert({
          arquivo_nome: arquivoNome,
          formato: formatoLote,
          fornecedor: fornecedor.trim() || null,
          pi_numero: piNumero.trim() || null,
          linha_cabecalho: linhaCabecalho + 1,
          total_linhas: linhasDado.length,
          mapeamento,
        })
        .select("id")
        .single();
      if (erroLote) throw erroLote;

      const linhas = linhasDado.map((r) => {
        const bruto: Record<string, unknown> = {};
        cabecalho.forEach((nome, i) => {
          bruto[nome || `coluna_${i + 1}`] = r.valores[i] ?? null;
        });
        const campos: Record<string, unknown> = {};
        camposEscolhidos.forEach((p) => {
          campos[p.campo] = valorCampo(r.valores, p.campo, p.indiceColuna);
        });
        return { lote_id: lote.id, linha_num: r.linha_num, bruto: bruto as never, ...campos };
      });

      for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await supabase.from("pi_import_stage").insert(linhas.slice(i, i + 500));
        if (error) throw error;
      }

      setLoteId(lote.id);
      toast.success(`${linhas.length} linhas gravadas em estágio`);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setGravando(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Importação de PI"
        icone={FileSpreadsheet}
        breadcrumb={[
          { label: "Produto", to: "/vendas/produto" },
          { label: "Importação de PI" },
        ]}
        estado="A planilha é lida no navegador e não sobe para o servidor · parte 1: leitura e estágio"
      />

      {sinonimos.isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Não foi possível carregar os sinônimos de coluna. {formatError(sinonimos.error)}
          </AlertDescription>
        </Alert>
      )}

      {/* ── PASSO 1 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1 · Planilha e cabeçalho</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sinonimos.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label>Arquivo (.xlsx / .xls)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => void escolherArquivo(e.target.files?.[0])}
                />
              </div>
              {lendo && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Upload className="h-4 w-4 animate-pulse" /> Lendo a planilha...
                </span>
              )}
            </div>
          )}

          {matriz.length > 0 && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                {abas.length > 1 && (
                  <div className="space-y-1.5">
                    <Label>Aba ({abas.length})</Label>
                    <Select value={aba} onValueChange={trocarAba}>
                      <SelectTrigger className="w-[240px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {abas.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Linha do cabeçalho</Label>
                  <Input
                    type="number"
                    min={1}
                    max={matriz.length}
                    className="w-[140px]"
                    value={linhaCabecalho + 1}
                    onChange={(e) => corrigirLinha(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{arquivoNome}</Badge>
                <Badge variant="outline">aba: {aba}</Badge>
                <Badge variant="outline">cabeçalho na linha {linhaCabecalho + 1}</Badge>
                <Badge variant={colunasCasadas > 0 ? "secondary" : "destructive"}>
                  {colunasCasadas} colunas reconhecidas
                </Badge>
                <Badge variant="outline">{linhasDado.length} linhas de dado</Badge>
                {formatoLote && <Badge variant="outline">formato: {formatoLote}</Badge>}
              </div>

              {colunasCasadas === 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Nenhuma coluna foi reconhecida nesta linha. Corrija a linha do cabeçalho
                    acima ou aponte os campos à mão no passo 2.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── PASSO 2 */}
      {matriz.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2 · Como as colunas foram entendidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Número da PI</Label>
                <Input value={piNumero} onChange={(e) => setPiNumero(e.target.value)} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coluna da planilha</TableHead>
                    <TableHead>Campo destino</TableHead>
                    <TableHead>Exemplo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cabecalho.map((nome, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">
                        {nome || (
                          <span className="text-muted-foreground">coluna {i + 1}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapa[i] ?? IGNORAR}
                          onValueChange={(v) => {
                            setMapa((m) => ({ ...m, [i]: v }));
                            setMapeamentoConfirmado(false);
                          }}
                        >
                          <SelectTrigger className="w-[190px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={IGNORAR}>— ignorar —</SelectItem>
                            {CAMPOS.map((c) => (
                              <SelectItem key={c} value={c}>
                                {ROTULO[c]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                        {exemploColuna(i)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {camposEscolhidos.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Prévia com o mapeamento aplicado</p>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Linha</TableHead>
                        {camposEscolhidos.map((p) => (
                          <TableHead key={p.campo}>{ROTULO[p.campo]}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhasDado.slice(0, 5).map((r) => (
                        <TableRow key={r.linha_num}>
                          <TableCell className="text-xs tabular-nums text-muted-foreground">
                            {r.linha_num}
                          </TableCell>
                          {camposEscolhidos.map((p) => (
                            <TableCell key={p.campo} className="font-mono text-xs">
                              {String(valorCampo(r.valores, p.campo, p.indiceColuna) ?? "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={confirmarMapeamento}>Confirmar mapeamento</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PASSO 3 */}
      {mapeamentoConfirmado && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3 · Gravar o lote em estágio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {linhasDado.length} linhas serão gravadas. EAN e DUN vão como texto, com o zero à
              esquerda preservado. Nada toca produto nesta etapa.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => void gravarLote()} disabled={gravando}>
                {gravando ? "Gravando..." : "Gravar lote em estágio"}
              </Button>
            </div>

            {loteId && (
              <Alert>
                <AlertDescription className="space-y-1">
                  <div>
                    Lote gravado: <span className="font-mono text-xs">{loteId}</span>
                  </div>
                  <div className="text-muted-foreground">Conferência — parte 2</div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
