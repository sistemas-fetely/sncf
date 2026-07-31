import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, Download, FileSpreadsheet, Loader2, Upload, ExternalLink, Info,
} from "lucide-react";

const VERDE = "#1A4A3A";

const COL_NCM = "NCM";
const COL_ORIGEM = "Origem";
const COL_CODIGO = "Código";
const COL_GRUPO = "Grupo de produtos";

interface ParsedCsv {
  header: string[];
  rows: string[][];
}

/**
 * Parser de CSV do Bling: separador ';', campos entre aspas duplas,
 * CRLF, aspas escapadas como "". Devolve as células VERBATIM
 * (inclusive tabs de proteção do Excel em Código e GTIN/EAN).
 */
function parseCsvBling(text: string): ParsedCsv {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroAspas = false;
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (dentroAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        dentroAspas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }
    if (c === '"') {
      dentroAspas = true;
      i++;
      continue;
    }
    if (c === ";") {
      linha.push(campo);
      campo = "";
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      rows.push(linha);
      linha = [];
      i++;
      continue;
    }
    campo += c;
    i++;
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    rows.push(linha);
  }
  const naoVazias = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (naoVazias.length === 0) throw new Error("Arquivo vazio ou sem linhas legíveis.");
  const [header, ...resto] = naoVazias;
  return { header: header.map((h) => h.trim()), rows: resto };
}

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function gerarCsv(header: string[], rows: string[][]): Blob {
  const linhas = [header, ...rows].map((r) => r.map(csvEscape).join(";"));
  const conteudo = "\uFEFF" + linhas.join("\r\n") + "\r\n";
  return new Blob([conteudo], { type: "text/csv;charset=utf-8" });
}

function corGrupo(grupo: string) {
  if (grupo === "FISCAL-REVISAR" || grupo === "FISCAL-NAO-MERCADORIA") return "amber";
  return "ok";
}

export default function DestinosCadastro() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [grupos, setGrupos] = useState<string[] | null>(null); // por linha
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  const idx = useMemo(() => {
    if (!parsed) return null;
    const find = (nome: string) => parsed.header.findIndex((h) => h === nome);
    return {
      ncm: find(COL_NCM),
      origem: find(COL_ORIGEM),
      codigo: find(COL_CODIGO),
      grupo: find(COL_GRUPO),
      descricao: parsed.header.findIndex((h) => h === "Descrição"),
    };
  }, [parsed]);

  const resetar = () => {
    setParsed(null);
    setGrupos(null);
    setErro(null);
    setArquivoNome(null);
  };

  const handleArquivo = async (file: File) => {
    resetar();
    setProcessando(true);
    setArquivoNome(file.name);
    try {
      const texto = await file.text();
      const p = parseCsvBling(texto);

      const faltando = [COL_NCM, COL_ORIGEM, COL_CODIGO, COL_GRUPO].filter(
        (c) => !p.header.includes(c),
      );
      if (faltando.length > 0) {
        throw new Error(
          `CSV inválido: coluna${faltando.length > 1 ? "s" : ""} obrigatória${faltando.length > 1 ? "s" : ""} não encontrada${faltando.length > 1 ? "s" : ""}: ${faltando.join(", ")}. Use o export original do Bling, sem editar o cabeçalho.`,
        );
      }

      const iNcm = p.header.indexOf(COL_NCM);
      const iOrigem = p.header.indexOf(COL_ORIGEM);

      // Pares distintos NCM+Origem — no máximo ~15, uma chamada por par distinto.
      const pares = new Map<string, { ncm: string; origem: string }>();
      for (const r of p.rows) {
        const ncm = (r[iNcm] ?? "").trim();
        const origem = (r[iOrigem] ?? "").trim();
        pares.set(`${ncm}|${origem}`, { ncm, origem });
      }

      // Uma chamada por par distinto (~15), todas em paralelo — nunca por linha.
      const entradas = [...pares.entries()];
      const respostas = await Promise.all(
        entradas.map(async ([, par]) => {
          const { data, error } = await (supabase as any).rpc("fn_grupo_fiscal", {
            p_ncm: par.ncm,
            p_origem: par.origem,
          });
          if (error) throw error;
          return (data as string) ?? "FISCAL-REVISAR";
        }),
      );
      const resolvidos = new Map<string, string>();
      entradas.forEach(([chave], i) => resolvidos.set(chave, respostas[i]));

      const porLinha = p.rows.map((r) => {
        const chave = `${(r[iNcm] ?? "").trim()}|${(r[iOrigem] ?? "").trim()}`;
        return resolvidos.get(chave) ?? "FISCAL-REVISAR";
      });

      setParsed(p);
      setGrupos(porLinha);
      toast.success(`${p.rows.length} produto(s) lido(s) · ${pares.size} par(es) NCM+Origem`);
    } catch (e) {
      const msg = formatError(e);
      setErro(msg);
      setParsed(null);
      setGrupos(null);
      toast.error(msg);
    } finally {
      setProcessando(false);
    }
  };

  const contagem = useMemo(() => {
    if (!grupos) return [];
    const m = new Map<string, number>();
    for (const g of grupos) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [grupos]);

  const paraRevisar = useMemo(() => {
    if (!parsed || !grupos || !idx) return [];
    return parsed.rows
      .map((r, i) => ({ r, grupo: grupos[i] }))
      .filter((x) => x.grupo === "FISCAL-REVISAR" || x.grupo === "FISCAL-NAO-MERCADORIA")
      .map((x) => ({
        codigo: x.r[idx.codigo] ?? "",
        descricao: idx.descricao >= 0 ? x.r[idx.descricao] ?? "" : "",
        grupo: x.grupo,
      }));
  }, [parsed, grupos, idx]);

  const semNcm = useMemo(() => {
    if (!parsed || !idx) return [];
    return parsed.rows
      .filter((r) => (r[idx.ncm] ?? "").trim() === "")
      .map((r) => ({
        codigo: r[idx.codigo] ?? "",
        descricao: idx.descricao >= 0 ? r[idx.descricao] ?? "" : "",
      }));
  }, [parsed, idx]);

  const baixar = () => {
    if (!parsed || !grupos || !idx) return;
    try {
      const rows = parsed.rows.map((r, i) => {
        const copia = [...r];
        while (copia.length < parsed.header.length) copia.push("");
        copia[idx.grupo] = grupos[i];
        return copia;
      });
      const blob = gerarCsv(parsed.header, rows);
      const hoje = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bling_produtos_grupos_${hoje}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo gerado");
    } catch (e) {
      toast.error(formatError(e));
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Destinos de Cadastro</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prepara arquivos de cadastro para os sistemas de destino. Nada é gravado no banco nesta
          tela — ela lê o arquivo, calcula e devolve outro arquivo.
        </p>
      </div>

      <Tabs defaultValue="bling">
        <TabsList>
          <TabsTrigger value="bling">Bling</TabsTrigger>
          <TabsTrigger value="xpm">XPM</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
        </TabsList>

        <TabsContent value="bling" className="mt-4 space-y-4">
          {/* PASSO 1 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" /> 1. Subir o export do Bling
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Gere o arquivo em{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  Bling &gt; Cadastros &gt; Produtos &gt; Exportar dados para planilha
                </code>{" "}
                e suba o <strong>.csv</strong> sem editar nada.
              </p>
              <div className="flex items-center gap-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleArquivo(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  onClick={() => inputRef.current?.click()}
                  disabled={processando}
                  style={{ backgroundColor: VERDE }}
                  className="text-white hover:opacity-90 gap-2"
                >
                  {processando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  Escolher arquivo
                </Button>
                {arquivoNome && (
                  <span className="text-xs text-muted-foreground truncate">{arquivoNome}</span>
                )}
                {parsed && (
                  <Button variant="ghost" size="sm" onClick={resetar}>
                    Limpar
                  </Button>
                )}
              </div>

              {erro && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Não foi possível processar o arquivo</AlertTitle>
                  <AlertDescription className="text-xs break-words">{erro}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* PASSO 2 */}
          {parsed && grupos && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  2. Prévia
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {parsed.rows.length} produto(s) · {parsed.header.length} colunas
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    As outras 58 colunas voltam idênticas. Só o Grupo de Produtos é preenchido.
                  </AlertDescription>
                </Alert>

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grupo de Produtos</TableHead>
                        <TableHead className="text-right">Produtos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contagem.map(([grupo, qtd]) => (
                        <TableRow
                          key={grupo}
                          className={
                            corGrupo(grupo) === "amber"
                              ? "bg-amber-50 dark:bg-amber-950/20"
                              : undefined
                          }
                        >
                          <TableCell className="font-mono text-xs">{grupo}</TableCell>
                          <TableCell className="text-right font-medium">{qtd}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {semNcm.length > 0 && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-2">
                    <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {semNcm.length} produto(s) com NCM vazio — essas linhas falham na emissão de
                      NF no Bling
                    </p>
                    <div className="max-h-56 overflow-auto text-xs space-y-1">
                      {semNcm.map((l, i) => (
                        <div key={`${l.codigo}-${i}`} className="flex gap-2">
                          <span className="font-mono shrink-0">{l.codigo.trim()}</span>
                          <span className="text-muted-foreground truncate">{l.descricao}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {paraRevisar.length > 0 && (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {paraRevisar.length} produto(s) exigem decisão humana (FISCAL-REVISAR /
                      FISCAL-NAO-MERCADORIA)
                    </p>
                    <div className="max-h-72 overflow-auto text-xs space-y-1">
                      {paraRevisar.map((l, i) => (
                        <div key={`${l.codigo}-${i}`} className="flex gap-2">
                          <span className="font-mono shrink-0">{l.codigo.trim()}</span>
                          <span className="text-muted-foreground truncate flex-1">
                            {l.descricao}
                          </span>
                          <span className="font-mono shrink-0 text-amber-700 dark:text-amber-400">
                            {l.grupo}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* PASSO 3 */}
          {parsed && grupos && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">3. Baixar para reimportar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={baixar}
                  style={{ backgroundColor: VERDE }}
                  className="text-white hover:opacity-90 gap-2"
                >
                  <Download className="h-4 w-4" />
                  Baixar CSV enriquecido
                </Button>
                <p className="text-sm text-muted-foreground">
                  Importe em{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    Bling &gt; Todas as configurações &gt; Importações de Dados &gt; Importar e
                    atualizar produtos
                  </code>
                  , modo <strong>Atualizar</strong>. Máximo 1.000 produtos por arquivo.
                </p>
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Faça backup no Bling antes de atualizar em massa.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="xpm" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Em construção</p>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/vendas/xpm">
                  Ir para XPM <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shopify" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Em construção</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
