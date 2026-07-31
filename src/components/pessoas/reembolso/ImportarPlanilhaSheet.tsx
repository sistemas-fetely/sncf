import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle, FileSpreadsheet, Loader2, ArrowLeft, Upload, Info,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { validateCNPJ } from "@/lib/cnpj";
import { formatError } from "@/lib/format-error";
import {
  useCategorias, useVinculosAtivos, useLancarSolicitacao, useReembolsoParametros,
  formatarBRL, type Categoria, type VinculoAtivo,
} from "@/hooks/useReembolso";

// ---------------------------------------------------------------------------
// Helpers de parse
// ---------------------------------------------------------------------------

function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Nome de categoria sem o prefixo numérico ("1 Alimentação..." -> "alimentacao..."). */
function normalizarCategoria(v: unknown): string {
  return normalizar(v).replace(/^\d+\s*[-.)]?\s*/, "").replace(/\s+/g, " ");
}

function textoCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Aceita serial do Excel e texto dd/mm/aaaa (ou aaaa-mm-dd). Devolve ISO ou null. */
function parseDataPlanilha(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()))
      .toISOString()
      .slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v <= 0) return null;
    // Serial do Excel: dia 1 = 1900-01-01, com o bug do ano 1900 (epoch 1899-12-30).
    const ms = Math.round(v) * 86400000 + Date.UTC(1899, 11, 30);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (br) {
    const dia = br[1].padStart(2, "0");
    const mes = br[2].padStart(2, "0");
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3].padStart(4, "0");
    const iso = `${ano}-${mes}-${dia}`;
    return Number.isNaN(new Date(`${iso}T00:00:00`).getTime()) ? null : iso;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

/** Aceita 1.234,56 e 1234.56. Devolve NaN quando não é número. */
function parseValorPlanilha(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = String(v).trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function vazio(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Score simples de semelhança por sobreposição de tokens do nome. */
function scoreNome(alvo: string, candidato: string): number {
  const a = normalizar(alvo).split(/\s+/).filter(Boolean);
  const b = normalizar(candidato).split(/\s+/).filter(Boolean);
  if (a.length === 0 || b.length === 0) return 0;
  if (a.join(" ") === b.join(" ")) return 1000;
  let comuns = 0;
  for (const t of a) if (t.length > 2 && b.includes(t)) comuns += 1;
  return comuns * 10 - Math.abs(a.length - b.length);
}

// ---------------------------------------------------------------------------
// Modelo da prévia
// ---------------------------------------------------------------------------

interface LinhaPlanilha {
  uid: string;
  linhaPlanilha: number;
  dataBruta: string;
  dataIso: string | null;
  categoriaTexto: string;
  categoriaCodigo: string;
  descricao: string;
  estabelecimento: string;
  cnpj: string;
  numeroComprovante: string;
  eventoGerador: string;
  valorBruto: string;
  valor: number;
  problemas: string[];
}

interface Cabecalho {
  nomeColaborador: string;
  unidade: string;
  projetoEvento: string;
  dataRecebimento: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCriado: (solicitacaoId: string) => void;
}

const NOME_ABA = "Solicitação";
const CHAVES_PARAMETROS = [
  "teto_por_ocorrencia",
  "teto_mensal_por_pessoa",
  "teto_refeicao_servico",
  "teto_categoria_5_urgencia",
  "valor_por_km",
  "prazo_maximo_envio_dias",
] as const;

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ImportarPlanilhaSheet({ open, onOpenChange, onCriado }: Props) {
  const vinculosQ = useVinculosAtivos();
  const categoriasQ = useCategorias();
  const lancar = useLancarSolicitacao();

  const [passo, setPasso] = useState<"arquivo" | "previa">("arquivo");
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [cabecalho, setCabecalho] = useState<Cabecalho | null>(null);
  const [linhas, setLinhas] = useState<LinhaPlanilha[]>([]);
  const [ignoradas, setIgnoradas] = useState(0);
  const [vinculoId, setVinculoId] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(hojeIso());
  const [projetoEvento, setProjetoEvento] = useState("");
  const [lendo, setLendo] = useState(false);

  const categorias = categoriasQ.data ?? [];
  const vinculos = vinculosQ.data ?? [];
  const vinculo = vinculos.find((v) => v.vinculo_id === vinculoId) ?? null;

  const pendenciasCadastro = useMemo(() => {
    if (!vinculo) return [] as string[];
    const lista: string[] = [];
    if (vinculo.falta_email) lista.push("sem e-mail corporativo");
    if (vinculo.falta_pix) lista.push("sem chave PIX");
    if (vinculo.falta_gestor) lista.push("sem gestor");
    if (vinculo.falta_centro_custo) lista.push("sem centro de custo");
    if (vinculo.falta_previsao_contratual) lista.push("sem previsão contratual de reembolso");
    return lista;
  }, [vinculo]);

  function resetar() {
    setPasso("arquivo");
    setNomeArquivo(null);
    setCabecalho(null);
    setLinhas([]);
    setIgnoradas(0);
    setVinculoId("");
    setProjetoEvento("");
    setDataRecebimento(hojeIso());
  }

  function resolverCategoria(texto: string, lista: Categoria[]): string {
    const alvo = normalizarCategoria(texto);
    if (!alvo) return "";
    const exata = lista.find((c) => normalizarCategoria(c.nome) === alvo);
    if (exata) return String(exata.codigo);
    const porCodigo = lista.find((c) => normalizar(texto).startsWith(String(c.codigo)));
    if (porCodigo && normalizarCategoria(porCodigo.nome) === alvo) return String(porCodigo.codigo);
    return "";
  }

  function sugerirVinculo(nome: string, lista: VinculoAtivo[]): string {
    if (!nome.trim()) return "";
    let melhor = "";
    let melhorScore = 0;
    for (const v of lista) {
      const s = scoreNome(nome, v.nome_completo ?? "");
      if (s > melhorScore) {
        melhorScore = s;
        melhor = v.vinculo_id;
      }
    }
    return melhorScore >= 10 ? melhor : "";
  }

  async function lerArquivo(file: File) {
    setLendo(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const nomeAba =
        wb.SheetNames.find((n) => normalizar(n) === normalizar(NOME_ABA)) ?? null;
      if (!nomeAba) {
        toast.error(
          "Esta planilha não parece ser o formulário de reembolso da Fetely — não encontrei a aba 'Solicitação'.",
        );
        return;
      }
      const ws = wb.Sheets[nomeAba];
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      });

      const cel = (linha: number, coluna: number): unknown => matriz[linha - 1]?.[coluna] ?? null;

      const cab: Cabecalho = {
        nomeColaborador: textoCelula(cel(7, 2)),
        // C9 é a UNIDADE (define o CNPJ da nota) — nunca vira centro_custo_id.
        unidade: textoCelula(cel(9, 2)),
        projetoEvento: textoCelula(cel(10, 2)),
        dataRecebimento: parseDataPlanilha(cel(12, 2)) ?? hojeIso(),
      };

      // Dados de despesa: cabeçalho na linha 15, dados da 16 em diante.
      // Não paramos em linha fixa: a planilha pode ter sido esticada.
      const brutas: LinhaPlanilha[] = [];
      let ignoradasContagem = 0;
      let pendentesEmBranco = 0;
      for (let linha = 16; linha <= matriz.length; linha += 1) {
        const dataCel = cel(linha, 0);
        const valorCel = cel(linha, 6);
        const outras = [1, 2, 3, 4, 5, 7].map((c) => cel(linha, c));
        if (vazio(dataCel) && vazio(valorCel)) {
          if (outras.every(vazio)) pendentesEmBranco += 1;
          else pendentesEmBranco += 1;
          continue;
        }
        ignoradasContagem += pendentesEmBranco;
        pendentesEmBranco = 0;

        const dataIso = parseDataPlanilha(dataCel);
        const categoriaTexto = textoCelula(cel(linha, 1));
        const categoriaCodigo = resolverCategoria(categoriaTexto, categorias);
        const cnpj = soDigitos(cel(linha, 4));
        const valor = parseValorPlanilha(valorCel);

        const problemas: string[] = [];
        if (!dataIso) problemas.push("data inválida");
        if (!Number.isFinite(valor) || valor <= 0) problemas.push("valor não numérico ou zero");
        if (!categoriaCodigo) problemas.push("categoria não reconhecida");
        if (cnpj && !validateCNPJ(cnpj)) problemas.push("CNPJ com dígito verificador inválido");

        brutas.push({
          uid: crypto.randomUUID(),
          linhaPlanilha: linha,
          dataBruta: textoCelula(dataCel),
          dataIso,
          categoriaTexto,
          categoriaCodigo,
          descricao: textoCelula(cel(linha, 2)),
          estabelecimento: textoCelula(cel(linha, 3)),
          cnpj,
          numeroComprovante: textoCelula(cel(linha, 5)),
          eventoGerador: textoCelula(cel(linha, 7)),
          valorBruto: textoCelula(valorCel),
          valor: Number.isFinite(valor) ? valor : 0,
          problemas,
        });
      }

      if (brutas.length === 0) {
        toast.error("Não encontrei nenhuma linha de despesa preenchida na aba 'Solicitação'.");
        return;
      }

      setNomeArquivo(file.name);
      setCabecalho(cab);
      setLinhas(brutas);
      setIgnoradas(ignoradasContagem);
      setProjetoEvento(cab.projetoEvento);
      setDataRecebimento(cab.dataRecebimento);
      setVinculoId(sugerirVinculo(cab.nomeColaborador, vinculos));
      setPasso("previa");
    } catch (err) {
      toast.error("Não foi possível ler a planilha.", { description: formatError(err) });
    } finally {
      setLendo(false);
    }
  }

  function atualizarLinha(uid: string, patch: Partial<LinhaPlanilha>) {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l.uid !== uid) return l;
        const atualizada = { ...l, ...patch };
        const problemas = atualizada.problemas.filter((p) => p !== "categoria não reconhecida");
        if (!atualizada.categoriaCodigo) problemas.push("categoria não reconhecida");
        return { ...atualizada, problemas };
      }),
    );
  }

  const prontas = linhas.filter((l) => l.problemas.length === 0);
  const comProblema = linhas.filter((l) => l.problemas.length > 0);
  const totalProntas = prontas.reduce((s, l) => s + l.valor, 0);

  async function importar() {
    if (!vinculoId) {
      toast.error("Confirme a pessoa do reembolso antes de importar.");
      return;
    }
    if (prontas.length === 0) {
      toast.error("Nenhuma linha está pronta para importar.");
      return;
    }

    const payload = {
      vinculo_id: vinculoId,
      origem: "planilha",
      data_recebimento: dataRecebimento,
      projeto_evento: projetoEvento.trim() || null,
      itens: prontas.map((l) => ({
        categoria_codigo: Number(l.categoriaCodigo),
        data_despesa: l.dataIso,
        descricao: l.descricao || null,
        estabelecimento: l.estabelecimento || null,
        cnpj_emitente: l.cnpj || null,
        numero_comprovante: l.numeroComprovante || null,
        valor_solicitado: l.valor,
        evento_gerador: l.eventoGerador || null,
        projeto_evento: projetoEvento.trim() || null,
      })),
    };

    try {
      // Uma única chamada: é uma solicitação, um número, uma transação.
      const r = await lancar.mutateAsync(payload);
      const pend = r?.apontamentos ?? 0;
      toast.success(
        pend > 0
          ? `${r.numero} importado com ${prontas.length} linha(s). ${pend} pendência${pend === 1 ? "" : "s"} para resolver.`
          : `${r.numero} importado com ${prontas.length} linha(s), sem pendências.`,
      );
      const id = r.id;
      resetar();
      onOpenChange(false);
      onCriado(id);
    } catch {
      // erro já exibido pelo hook
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) resetar();
        onOpenChange(v);
      }}
    >
      <SheetContent className="w-full sm:max-w-5xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Importar planilha de reembolso</SheetTitle>
          <SheetDescription>
            Formulário F-POP-001. Os comprovantes não vêm na planilha — anexe depois pelo detalhe
            da solicitação.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {vinculosQ.isError && (
            <BlocoErro
              mensagem={`Não foi possível carregar as pessoas. ${formatError(vinculosQ.error)}`}
              onRetry={() => vinculosQ.refetch()}
            />
          )}
          {categoriasQ.isError && (
            <BlocoErro
              mensagem={`Não foi possível carregar as categorias. ${formatError(categoriasQ.error)}`}
              onRetry={() => categoriasQ.refetch()}
            />
          )}

          {passo === "arquivo" ? (
            <Card className="card-shadow">
              <CardContent className="space-y-3 py-6">
                <Label className="text-xs">Arquivo do formulário (.xlsx)</Label>
                <Input
                  type="file"
                  accept=".xlsx"
                  disabled={lendo || categoriasQ.isLoading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void lerArquivo(f);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  A leitura acontece no seu navegador. Dados bancários e o bloco de uso interno da
                  planilha não são lidos: a chave PIX vem do cadastro e a validação vive no SNCF.
                </p>
                {lendo && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Lendo a planilha…
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="card-shadow">
                <CardContent className="space-y-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FileSpreadsheet className="h-4 w-4" />
                    {nomeArquivo}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Pessoa (a planilha diz “{cabecalho?.nomeColaborador || "—"}”)
                      </Label>
                      <Select value={vinculoId} onValueChange={setVinculoId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Confirme a pessoa" />
                        </SelectTrigger>
                        <SelectContent>
                          {vinculos.map((v) => (
                            <SelectItem key={v.vinculo_id} value={v.vinculo_id}>
                              {v.nome_completo ?? v.vinculo_id} · {v.tipo_vinculo ?? "—"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Data de recebimento</Label>
                      <Input
                        type="date"
                        value={dataRecebimento}
                        onChange={(e) => setDataRecebimento(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Projeto / evento</Label>
                      <Input
                        value={projetoEvento}
                        onChange={(e) => setProjetoEvento(e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unidade (informação da planilha)</Label>
                      <Input value={cabecalho?.unidade || "—"} readOnly className="bg-muted/40" />
                      <p className="text-[11px] text-muted-foreground">
                        Define de qual CNPJ pedir a nota. Não é centro de custo e não é importada.
                      </p>
                    </div>
                  </div>

                  {vinculo && pendenciasCadastro.length > 0 && (
                    <div className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        Cadastro incompleto ({pendenciasCadastro.join(", ")}). Dá para lançar assim.
                        O que faltar vai aparecer como pendência resolvível depois de lançar.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span>
                      <strong className="tabular-nums">{prontas.length}</strong> linha(s) pronta(s)
                    </span>
                    <span className={cn(comProblema.length > 0 && "text-warning")}>
                      <strong className="tabular-nums">{comProblema.length}</strong> com problema
                    </span>
                    <span className="text-muted-foreground">
                      <strong className="tabular-nums">{ignoradas}</strong> ignorada(s) em branco
                    </span>
                    <span className="ml-auto font-semibold tabular-nums">
                      Total pronto: {formatarBRL(totalProntas)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Linha</TableHead>
                      <TableHead className="w-28">Data</TableHead>
                      <TableHead className="w-56">Categoria</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Estabelecimento</TableHead>
                      <TableHead className="w-36">CNPJ</TableHead>
                      <TableHead className="w-24">Nº doc.</TableHead>
                      <TableHead className="w-28 text-right">Valor</TableHead>
                      <TableHead className="w-48">Problemas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l) => (
                      <TableRow key={l.uid} className={cn(l.problemas.length > 0 && "bg-warning/5")}>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {l.linhaPlanilha}
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.dataIso
                            ? new Date(`${l.dataIso}T00:00:00`).toLocaleDateString("pt-BR")
                            : l.dataBruta || "—"}
                        </TableCell>
                        <TableCell>
                          {l.categoriaCodigo ? (
                            <span className="text-xs">
                              {categorias.find((c) => String(c.codigo) === l.categoriaCodigo)?.nome ??
                                l.categoriaTexto}
                            </span>
                          ) : (
                            <Select
                              value={l.categoriaCodigo}
                              onValueChange={(v) => atualizarLinha(l.uid, { categoriaCodigo: v })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue
                                  placeholder={l.categoriaTexto ? `“${l.categoriaTexto}”` : "Escolher"}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {categorias.map((c) => (
                                  <SelectItem key={c.id} value={String(c.codigo)}>
                                    {c.codigo} · {c.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{l.descricao || "—"}</TableCell>
                        <TableCell className="text-xs">{l.estabelecimento || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.cnpj || "—"}</TableCell>
                        <TableCell className="text-xs">{l.numeroComprovante || "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {l.valor > 0 ? formatarBRL(l.valor) : l.valorBruto || "—"}
                        </TableCell>
                        <TableCell>
                          {l.problemas.length === 0 ? (
                            <Badge className="bg-success/10 text-success hover:bg-success/10">
                              Pronta
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-warning">
                              {l.problemas.join(" · ")}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {comProblema.length > 0 && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Linhas com problema ficam fora da importação. Escolha a categoria onde faltar; o
                  resto se corrige na planilha e importa de novo.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" onClick={resetar}>
                  <ArrowLeft className="h-4 w-4" /> Trocar arquivo
                </Button>
                <Button onClick={importar} disabled={lancar.isPending || prontas.length === 0}>
                  {lancar.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Importar {prontas.length} linha{prontas.length === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BlocoErro({ mensagem, onRetry }: { mensagem: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-2">
      <p className="break-words">{mensagem}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Botão de template — gera o XLSX na hora, com categorias e tetos vivos
// ---------------------------------------------------------------------------

export function BotaoBaixarTemplate() {
  const categoriasQ = useCategorias();
  const parametrosQ = useReembolsoParametros();
  const [gerando, setGerando] = useState(false);

  function gerar() {
    setGerando(true);
    try {
      const categorias = categoriasQ.data ?? [];
      const parametros = parametrosQ.data ?? {};
      if (categorias.length === 0) {
        toast.error("Não consegui ler as categorias do sistema. Tente de novo em instantes.");
        return;
      }

      const exemploCategoria = categorias[0];
      const solicitacao: unknown[][] = [];
      const set = (linha: number, coluna: number, valor: unknown) => {
        while (solicitacao.length < linha) solicitacao.push([]);
        const l = solicitacao[linha - 1];
        while (l.length < coluna) l.push(null);
        l[coluna] = valor;
      };

      set(1, 0, "Fetely — Formulário de Reembolso (F-POP-001)");
      set(3, 0, "Preencha o cabeçalho e as linhas de despesa. Não altere a posição das colunas.");
      set(5, 0, "IDENTIFICAÇÃO");
      set(7, 0, "Nome do colaborador");
      set(7, 2, "Nome completo como está no cadastro");
      set(8, 0, "Vínculo (CLT/PJ)");
      set(8, 2, "CLT");
      set(9, 0, "Centro de custo (unidade)");
      set(9, 2, "São Paulo (Matriz)");
      set(10, 0, "Projeto / evento");
      set(10, 2, "");
      set(11, 0, "Período das despesas");
      set(11, 2, "");
      set(12, 0, "Data da solicitação");
      set(12, 2, new Date().toLocaleDateString("pt-BR"));

      set(14, 0, "DESPESAS");
      const colunas = [
        "Data",
        "Categoria",
        "Descrição da despesa",
        "Estabelecimento",
        "CNPJ do estabelecimento",
        "Nº do comprovante",
        "Valor (R$)",
        "Evento gerador / observação",
      ];
      colunas.forEach((c, i) => set(15, i, c));

      const exemplo = [
        new Date().toLocaleDateString("pt-BR"),
        exemploCategoria.nome,
        "Almoço com fornecedor durante visita à fábrica",
        "Restaurante Bella Massa",
        "12.345.678/0001-95",
        "000123",
        "48,90",
        "Visita técnica ao fornecedor de velas",
      ];
      exemplo.forEach((v, i) => set(16, i, v));
      for (let linha = 17; linha <= 40; linha += 1) colunas.forEach((_, i) => set(linha, i, null));

      const wsSolicitacao = XLSX.utils.aoa_to_sheet(solicitacao);
      wsSolicitacao["!cols"] = [
        { wch: 14 }, { wch: 30 }, { wch: 42 }, { wch: 26 },
        { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 38 },
      ];

      const instrucoes: unknown[][] = [
        ["Instruções — Reembolso Fetely"],
        [],
        ["Categorias aceitas (use o nome exato na coluna Categoria)"],
        ["Código", "Nome"],
        ...categorias.map((c) => [c.codigo, c.nome]),
        [],
        ["Parâmetros vigentes"],
        ["Parâmetro", "Valor", "Unidade", "Descrição"],
        ...CHAVES_PARAMETROS.map((chave) => {
          const p = parametros[chave];
          return [
            chave,
            p ? (p.valor_numerico ?? p.valor_texto ?? "—") : "—",
            p?.unidade ?? "—",
            p?.descricao ?? "—",
          ];
        }),
        [],
        [
          "Canal de envio",
          parametros["email_canal_reembolso"]?.valor_texto ??
            parametros["email_canal_reembolso"]?.valor_numerico ??
            "—",
        ],
        [],
        ["Comprovantes não vão nesta planilha — envie os arquivos junto no e-mail."],
        ["Dados bancários vêm do cadastro: a chave PIX do pagamento é a do seu cadastro no SNCF."],
      ];
      const wsInstrucoes = XLSX.utils.aoa_to_sheet(instrucoes);
      wsInstrucoes["!cols"] = [{ wch: 30 }, { wch: 34 }, { wch: 14 }, { wch: 50 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSolicitacao, NOME_ABA);
      XLSX.utils.book_append_sheet(wb, wsInstrucoes, "Instruções");
      XLSX.writeFile(wb, `Fetely_Reembolso_Formulario_${hojeIso()}.xlsx`);
      toast.success("Template gerado com as categorias e os tetos vigentes.");
    } catch (err) {
      toast.error("Não foi possível gerar o template.", { description: formatError(err) });
    } finally {
      setGerando(false);
    }
  }

  const carregando = categoriasQ.isLoading || parametrosQ.isLoading;

  return (
    <Button variant="outline" onClick={gerar} disabled={gerando || carregando}>
      {gerando || carregando ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4" />
      )}
      Baixar template
    </Button>
  );
}
