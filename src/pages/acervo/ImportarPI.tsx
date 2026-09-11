// Importacao de PI — passos 1 a 3. A tela SO orquestra: deteccao de cabecalho,
// coercao de EAN/DUN e insert vivem em src/lib/pi/*. Nada julga identidade aqui:
// quem decide se o item existe e fn_pi_conferir_lote (parte 2).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, FileSpreadsheet, Info } from "lucide-react";


import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";


import {
  lerArquivo,
  detectarCabecalho,
  extrairLinhas,
  normalizar,
  type MatchSinonimo,
  type CabecalhoDetectado,
} from "@/lib/pi/lerPlanilhaPI";
import { gravarLotePI } from "@/lib/pi/gravarLotePI";


const IGNORAR = "— ignorar —";
const CAMPOS_DESTINO = [
  "sku", "cod_cadastro", "ean", "dun", "inner_qtd", "descricao", "qtd", "peso_g",
] as const;
const CAMPOS_IDENTIDADE = ["sku", "cod_cadastro", "ean"];

type LinhaStage = {
  linha_num: number;
  sku: string | null;
  cod_cadastro: string | null;
  ean: string | null;
  dun: string | null;
  inner_qtd: number | null;
  estado: string | null;
  motivo: string | null;
};

const ORDEM_ESTADOS = ["reconhecido", "a_alocar", "erro", "ignorado"] as const;

function badgeEstado(estado: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (estado) {
    case "reconhecido": return "secondary";
    case "a_alocar":
    case "alocado": return "default";
    case "erro": return "destructive";
    default: return "outline";
  }
}

function msgErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function chaveColuna(nome: string, i: number): string {
  return nome || `coluna_${i + 1}`;
}

function textoCelula(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}


export default function ImportarPI() {
  const queryClient = useQueryClient();
  const [arquivoOriginal, setArquivoOriginal] = useState<File | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);

  const [abas, setAbas] = useState<string[]>([]);
  const [matrizPorAba, setMatrizPorAba] = useState<Record<string, unknown[][]>>({});
  const [aba, setAba] = useState<string>("");
  const [lendo, setLendo] = useState(false);

  const [cabecalho, setCabecalho] = useState<CabecalhoDetectado | null>(null);
  const [semMatch, setSemMatch] = useState(false);
  const [linhaManual, setLinhaManual] = useState<string>("");

  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [fornecedor, setFornecedor] = useState("");
  const [piNumero, setPiNumero] = useState("");

  const [gravando, setGravando] = useState(false);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [gravadas, setGravadas] = useState<number>(0);

  // passo 4
  const [conferindo, setConferindo] = useState(false);
  const [contagens, setContagens] = useState<Record<string, number> | null>(null);


  const sinonimosQuery = useQuery({
    queryKey: ["pi-coluna-sinonimo"],
    queryFn: async (): Promise<MatchSinonimo[]> => {
      const { data, error } = await supabase
        .from("pi_coluna_sinonimo")
        .select("campo, sinonimo, formato");
      if (error) throw new Error(error.message);
      return (data ?? []) as MatchSinonimo[];
    },
  });

  const sinonimos = sinonimosQuery.data ?? [];
  const matriz = aba ? (matrizPorAba[aba] ?? []) : [];

  function aplicarDeteccao(m: unknown[][]) {
    const det = detectarCabecalho(m, sinonimos);
    setCabecalho(det);
    setSemMatch(det === null);
    setMapeamento(det?.mapeamentoSugerido ?? {});
    setLinhaManual(det ? String(det.linhaCabecalho) : "");
    setLoteId(null);
    if (det) {
      toast.success(
        `Cabeçalho na linha ${det.linhaCabecalho} — ${det.camposCasados} de ${det.colunas.length} colunas reconhecidas`,
      );
    } else {
      toast.error("Nenhuma coluna casou com os sinônimos conhecidos — informe a linha do cabeçalho à mão");
    }
  }

  async function onArquivo(file: File | undefined) {
    if (!file) return;
    if (sinonimosQuery.isPending) {
      toast.error("Sinônimos de coluna ainda carregando — tente de novo em um instante");
      return;
    }
    setLendo(true);
    try {
      const { abas: as, matrizPorAba: mpa } = await lerArquivo(file);
      if (as.length === 0) throw new Error("planilha sem abas");
      setArquivoOriginal(file);
      setArquivoNome(file.name);

      setAbas(as);
      setMatrizPorAba(mpa);
      setAba(as[0]);
      aplicarDeteccao(mpa[as[0]] ?? []);
      // pre-preenche PI varrendo as primeiras linhas
      const alvo = (mpa[as[0]] ?? []).slice(0, 25);
      for (const linha of alvo) {
        for (const cel of linha ?? []) {
          const m = /\bp\.?\s*i\.?\s*[:#nº ]*([a-z0-9-]{2,})/i.exec(textoCelula(cel));
          if (m) { setPiNumero(m[1]); break; }
        }
      }
      toast.success(`${file.name} lido — ${as.length} aba(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLendo(false);
    }
  }

  function trocarAba(nome: string) {
    setAba(nome);
    aplicarDeteccao(matrizPorAba[nome] ?? []);
  }

  function reprocessar() {
    const n = Number(linhaManual);
    if (!Number.isInteger(n) || n < 1 || n > matriz.length) {
      toast.error(`Linha de cabeçalho inválida — a planilha tem ${matriz.length} linhas`);
      return;
    }
    const largura = matriz.reduce((w, l) => Math.max(w, l?.length ?? 0), 1);
    const colunas = Array.from({ length: largura }, (_, i) =>
      textoCelula((matriz[n - 1] ?? [])[i]).trim(),
    );
    const indice = new Map<string, MatchSinonimo>();
    for (const s of sinonimos) {
      const k = normalizar(s.sinonimo);
      if (k && !indice.has(k)) indice.set(k, s);
    }
    const sugerido: Record<string, string> = {};
    const porFormato = new Map<string, number>();
    let casados = 0;
    colunas.forEach((c, i) => {
      const s = indice.get(normalizar(c));
      if (!s) return;
      casados += 1;
      sugerido[chaveColuna(c, i)] = s.campo;
      if (s.formato) porFormato.set(s.formato, (porFormato.get(s.formato) ?? 0) + 1);
    });
    let formatoProvavel: string | null = null;
    let maior = 0;
    porFormato.forEach((q, f) => { if (q > maior) { maior = q; formatoProvavel = f; } });

    setCabecalho({
      linhaCabecalho: n,
      colunas,
      camposCasados: casados,
      mapeamentoSugerido: sugerido,
      formatoProvavel,
      usouDuasLinhas: false,
    });
    setSemMatch(casados === 0);
    setMapeamento(sugerido);
    setLoteId(null);
    toast.success(`Reprocessado com cabeçalho na linha ${n} — ${casados} colunas reconhecidas`);
  }

  const linhas = useMemo(() => {
    if (!cabecalho) return [];
    return extrairLinhas(matriz, cabecalho.linhaCabecalho, mapeamento, cabecalho.colunas);
  }, [matriz, cabecalho, mapeamento]);

  const exemplos = useMemo(() => {
    if (!cabecalho) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    cabecalho.colunas.forEach((nome, c) => {
      const chave = chaveColuna(nome, c);
      for (let i = cabecalho.linhaCabecalho; i < matriz.length; i++) {
        const v = textoCelula((matriz[i] ?? [])[c]).trim();
        if (v !== "") { out[chave] = v; break; }
      }
    });
    return out;
  }, [cabecalho, matriz]);

  const camposUsados = useMemo(
    () => Array.from(new Set(Object.values(mapeamento).filter((c) => c && c !== IGNORAR))),
    [mapeamento],
  );
  const temIdentidade = camposUsados.some((c) => CAMPOS_IDENTIDADE.includes(c));

  async function gravar() {
    if (!cabecalho) return;
    setGravando(true);
    try {
      const r = await gravarLotePI(
        {
          arquivoNome: arquivoNome ?? "sem-nome",
          formato: cabecalho.formatoProvavel,
          fornecedor: fornecedor.trim() || null,
          piNumero: piNumero.trim() || null,
          linhaCabecalho: cabecalho.linhaCabecalho,
          mapeamento,
        },
        linhas,
      );
      setLoteId(r.loteId);
      setGravadas(r.gravadas);
      setContagens(null);
      toast.success(`${r.gravadas} linha(s) gravada(s) em estágio`);
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setGravando(false);
    }
  }

  // ---------- PASSO 4 ----------
  const stageQuery = useQuery({
    queryKey: ["pi-import-stage", loteId],
    enabled: !!loteId,
    queryFn: async (): Promise<LinhaStage[]> => {
      const { data, error } = await supabase
        .from("pi_import_stage")
        .select("linha_num, sku, cod_cadastro, ean, dun, inner_qtd, estado, motivo")
        .eq("lote_id", loteId!)
        .order("linha_num");
      if (error) throw new Error(error.message);
      return (data ?? []) as LinhaStage[];
    },
  });

  const linhasStage = stageQuery.data ?? [];

  async function conferir() {
    if (!loteId) return;
    setConferindo(true);
    try {
      const { data, error } = await supabase.rpc("fn_pi_conferir_lote", { p_lote_id: loteId });
      if (error) throw new Error(error.message);
      const obj = (data ?? {}) as Record<string, number>;
      setContagens(obj);
      await queryClient.invalidateQueries({ queryKey: ["pi-import-stage", loteId] });
      const partes = ORDEM_ESTADOS.filter((e) => obj[e] !== undefined).map((e) => `${e}: ${obj[e]}`);
      toast.success(`Lote conferido — ${partes.join(", ")}`);
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setConferindo(false);
    }
  }


  return (
    <PageShell>
      <PageHeader
        titulo="Importação de PI"
        estado="Lê a proforma da fábrica no navegador, o humano confirma o mapeamento e o lote nasce em estágio."
        breadcrumb={[
          { label: "Produto", to: "/vendas/produto" },
          { label: "Importação de PI" },
        ]}
      />

      {sinonimosQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Falha ao carregar os sinônimos de coluna:{" "}
            {sinonimosQuery.error instanceof Error ? sinonimosQuery.error.message : "erro desconhecido"}
          </AlertDescription>
        </Alert>
      )}

      {/* PASSO 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Arquivo</CardTitle>
          <CardDescription>
            .xlsx ou .xls, lido no navegador. O arquivo não sobe para o storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sinonimosQuery.isPending ? (
            <Skeleton className="h-10 w-full max-w-sm" />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept=".xlsx,.xls"
                className="max-w-sm"
                onChange={(e) => onArquivo(e.target.files?.[0])}
              />
              {lendo && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> lendo planilha…
                </span>
              )}
            </div>
          )}

          {arquivoNome && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                {abas.length > 1 && (
                  <div className="space-y-1">
                    <Label>Aba</Label>
                    <Select value={aba} onValueChange={trocarAba}>
                      <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {abas.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="linha-cab">Linha do cabeçalho</Label>
                  <Input
                    id="linha-cab"
                    type="number"
                    min={1}
                    className="w-32"
                    value={linhaManual}
                    onChange={(e) => setLinhaManual(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={reprocessar} disabled={!matriz.length}>
                  Reprocessar
                </Button>
              </div>

              <div className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Arquivo</div>
                  <div className="flex items-center gap-2 font-medium">
                    <FileSpreadsheet className="h-4 w-4" /> {arquivoNome}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Aba</div>
                  <div className="font-medium">{aba || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Cabeçalho / colunas reconhecidas</div>
                  <div className="font-medium">
                    linha {cabecalho?.linhaCabecalho ?? "—"} · {cabecalho?.camposCasados ?? 0} de{" "}
                    {cabecalho?.colunas.length ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Linhas de dado</div>
                  <div className="font-medium">{linhas.length}</div>
                </div>
                {cabecalho?.usouDuasLinhas && (
                  <div><Badge variant="secondary">cabeçalho em 2 linhas</Badge></div>
                )}
                {cabecalho?.formatoProvavel && (
                  <div>
                    <div className="text-xs text-muted-foreground">Formato provável</div>
                    <div className="font-medium">{cabecalho.formatoProvavel}</div>
                  </div>
                )}
              </div>

              {semMatch && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Nenhuma coluna casou com os sinônimos conhecidos. Informe a linha do cabeçalho
                    acima e clique em Reprocessar.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PASSO 2 */}
      {cabecalho && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Mapeamento</CardTitle>
            <CardDescription>
              Confirme como cada coluna foi entendida. Confira os zeros à esquerda de EAN e DUN na prévia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="fornecedor">Fornecedor</Label>
                <Input id="fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pi-numero">Número da PI</Label>
                <Input id="pi-numero" value={piNumero} onChange={(e) => setPiNumero(e.target.value)} />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coluna na planilha</TableHead>
                    <TableHead className="w-56">Campo destino</TableHead>
                    <TableHead>Exemplo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cabecalho.colunas.map((nome, i) => {
                    const chave = chaveColuna(nome, i);
                    return (
                      <TableRow key={chave}>
                        <TableCell className="font-medium">{nome || <span className="text-muted-foreground">{chave}</span>}</TableCell>
                        <TableCell>
                          <Select
                            value={mapeamento[chave] ?? IGNORAR}
                            onValueChange={(v) =>
                              setMapeamento((prev) => {
                                const next = { ...prev };
                                if (v === IGNORAR) delete next[chave];
                                else next[chave] = v;
                                return next;
                              })
                            }
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={IGNORAR}>{IGNORAR}</SelectItem>
                              {CAMPOS_DESTINO.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{exemplos[chave] ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Prévia — 5 primeiras linhas</div>
              {camposUsados.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma coluna mapeada ainda.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Linha</TableHead>
                        {camposUsados.map((c) => (
                          <TableHead key={c}>{c}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhas.slice(0, 5).map((l) => (
                        <TableRow key={l.linhaNum}>
                          <TableCell className="text-muted-foreground">{l.linhaNum}</TableCell>
                          {camposUsados.map((c) => (
                            <TableCell key={c} className="font-mono text-xs">
                              {l.campos[c] === null || l.campos[c] === undefined
                                ? "—"
                                : String(l.campos[c])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {linhas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={camposUsados.length + 1} className="text-muted-foreground">
                            Nenhuma linha de dado abaixo do cabeçalho informado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* PASSO 3 */}
      {cabecalho && camposUsados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Gravar</CardTitle>
            <CardDescription>
              O lote nasce em estágio. Identidade e alocação de código ficam para a conferência.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!temIdentidade && (
              <Alert>
                <AlertDescription>
                  Mapeie ao menos uma coluna para <strong>sku</strong>, <strong>cod_cadastro</strong> ou{" "}
                  <strong>ean</strong> — sem nenhum dos três não há como identificar o item.
                </AlertDescription>
              </Alert>
            )}
            <Button onClick={gravar} disabled={!temIdentidade || gravando || linhas.length === 0}>
              {gravando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gravar lote em estágio
            </Button>

            {loteId && (
              <div className="rounded-md border p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Info className="h-4 w-4" /> Lote em estágio
                </div>
                <div className="mt-1 text-muted-foreground">
                  Lote <span className="font-mono">{loteId}</span> · {gravadas} linha(s) em estágio.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PASSO 4 — CONFERIR */}
      {loteId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Conferir</CardTitle>
            <CardDescription>
              O banco decide o que já existe, o que precisa de código e o que não dá para ler.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={conferir} disabled={conferindo}>
              {conferindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Conferir lote
            </Button>

            {contagens && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ORDEM_ESTADOS.filter((e) => contagens[e] !== undefined).map((e) => (
                  <div key={e} className="rounded-md border p-4">
                    <div className="text-xs text-muted-foreground">{e}</div>
                    <div className="text-2xl font-semibold">{contagens[e]}</div>
                  </div>
                ))}
              </div>
            )}

            {stageQuery.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Falha ao carregar as linhas do lote: {msgErro(stageQuery.error)}
                </AlertDescription>
              </Alert>
            )}

            {contagens && stageQuery.isPending && <Skeleton className="h-40 w-full" />}

            {contagens && !stageQuery.isPending && !stageQuery.isError && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Linha</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>cod_cadastro</TableHead>
                      <TableHead>EAN</TableHead>
                      <TableHead>DUN</TableHead>
                      <TableHead>Inner</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasStage.map((l) => (
                      <TableRow key={l.linha_num}>
                        <TableCell className="text-muted-foreground">{l.linha_num}</TableCell>
                        <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.cod_cadastro ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.ean ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.dun ?? "—"}</TableCell>
                        <TableCell>{l.inner_qtd ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={badgeEstado(l.estado)}>{l.estado ?? "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.motivo ?? ""}</TableCell>
                      </TableRow>
                    ))}
                    {linhasStage.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-muted-foreground">
                          Nenhuma linha no estágio deste lote.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Linha com erro não bloqueia o lote.</p>

            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              Alocação e registro — próximo passo.
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
