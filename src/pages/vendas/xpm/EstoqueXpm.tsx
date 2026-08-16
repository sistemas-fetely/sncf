import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Upload, Loader2, AlertTriangle, CheckCircle2, PackageX, RefreshCw } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
type ConciliacaoApi = {
  sku: string;
  nome_comercial: string | null;
  grupo: string | null;
  linha: string | null;
  colecao: string | null;
  descricao_xpm: string | null;
  data_hora_posicao: string | null;
  xpm_liberado: number;
  xpm_outras: number;
  xpm_total: number;
  saldo_ledger_sncf: number;
  diferenca: number;
  existe_no_catalogo: boolean;
  status_conciliacao: "ok" | "divergente" | "so_na_xpm" | "so_no_ledger";
};

type IngestResult = {
  data_snapshot: string;
  linhas: number;
  skus_fora_do_catalogo: number;
  total_normal: number;
  total_danificado: number;
  validado_contra_rodape?: boolean;
};

const STATUS_META: Record<
  ConciliacaoApi["status_conciliacao"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  ok: { label: "OK", variant: "outline" },
  divergente: { label: "Divergente", variant: "destructive" },
  so_na_xpm: { label: "Só na XPM", variant: "secondary" },
  so_no_ledger: { label: "Só no razão", variant: "secondary" },
};

function parseNumBR(raw: string): number {
  const s = (raw ?? "").trim();
  if (!s) return 0;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parseia o arquivo da XPM (HTML com extensão .xls, ISO-8859-1).
 * - Considera apenas <table> com 9 colunas.
 * - Descarta a primeira linha (cabeçalho) de cada tabela e qualquer linha
 *   cujo primeiro campo comece com "TOTAL" (subtotal do bloco).
 * - Extrai o "TOTAL GERAL: N produtos" do rodapé.
 */
function parseArquivoXpm(html: string): {
  rows: { sku: string; normal: number; truncado: number; danificado: number }[];
  totalDeclarado: number | null;
  totalNormalDeclarado: number | null;
  totalDanificadoDeclarado: number | null;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows: { sku: string; normal: number; truncado: number; danificado: number }[] = [];

  doc.querySelectorAll("table").forEach((table) => {
    const trs = Array.from(table.querySelectorAll("tr"));
    if (trs.length === 0) return;
    const firstCells = trs[0].querySelectorAll("td,th");
    if (firstCells.length !== 9) return; // só tabelas de 9 colunas

    for (let i = 1; i < trs.length; i++) {
      const cells = Array.from(trs[i].querySelectorAll("td,th")).map((c) =>
        (c.textContent ?? "").trim(),
      );
      if (cells.length !== 9) continue;
      const sku = cells[0];
      if (!sku) continue;
      if (/^total/i.test(sku)) continue; // subtotal do bloco
      rows.push({
        sku,
        normal: parseNumBR(cells[3]),
        truncado: parseNumBR(cells[4]),
        danificado: parseNumBR(cells[5]),
      });
    }
  });

  // Rodapé — "TOTAL GERAL: N produto(s)" (aceita "produtos" também)
  const bodyText = doc.body?.textContent ?? "";
  const m = bodyText.match(/TOTAL\s+GERAL\s*:\s*([\d.]+)\s*produto/i);
  const totalDeclarado = m ? parseInt(m[1].replace(/\./g, ""), 10) : null;

  const mNormal = bodyText.match(/TOTAL\s+NORMAL\s+GERAL\s*:\s*([\d.]+)/i);
  const totalNormalDeclarado = mNormal ? parseInt(mNormal[1].replace(/\./g, ""), 10) : null;

  const mDanif = bodyText.match(/TOTAL\s+DANIFICADO\s+GERAL\s*:\s*([\d.]+)/i);
  const totalDanificadoDeclarado = mDanif ? parseInt(mDanif[1].replace(/\./g, ""), 10) : null;

  return { rows, totalDeclarado, totalNormalDeclarado, totalDanificadoDeclarado };
}

const nf = new Intl.NumberFormat("pt-BR");

function fmtPosicao(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EstoqueXpm() {
  const qc = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataSnapshot, setDataSnapshot] = useState(hoje);
  const [file, setFile] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<IngestResult | null>(null);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [sincronizando, setSincronizando] = useState(false);
  const [posicaoEscolhida, setPosicaoEscolhida] = useState<string>("");

  const conciliacaoQ = useQuery({
    queryKey: ["xpm-estoque-conciliacao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_estoque_conciliacao_api")
        .select("*")
        .order("sku", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ConciliacaoApi[];
    },
  });

  const posicoesQ = useQuery({
    queryKey: ["xpm-estoque-posicoes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("xpm_estoque_posicao")
        .select("data_hora_posicao")
        .order("data_hora_posicao", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data ?? []) as { data_hora_posicao: string | null }[]) {
        if (r.data_hora_posicao) set.add(r.data_hora_posicao);
      }
      return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
    },
  });

  const posicoes = posicoesQ.data ?? [];
  const posicaoMaisRecente = posicoes[0] ?? null;
  const posicaoAtiva = posicaoEscolhida || posicaoMaisRecente || "";
  const verHistorico = !!posicaoAtiva && posicaoAtiva !== posicaoMaisRecente;

  const historicoQ = useQuery({
    queryKey: ["xpm-estoque-posicao-detalhe", posicaoAtiva],
    enabled: verHistorico,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("xpm_estoque_posicao")
        .select("sku, descricao, quantidade, situacao_estoque, lote")
        .eq("data_hora_posicao", posicaoAtiva)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as {
        sku: string;
        descricao: string | null;
        quantidade: number | null;
        situacao_estoque: string | null;
        lote: string | null;
      }[];
    },
  });

  const rows = conciliacaoQ.data ?? [];

  const kpis = useMemo(() => {
    let totalSkus = 0;
    let unidades = 0;
    const porStatus: Record<string, number> = { ok: 0, divergente: 0, so_na_xpm: 0, so_no_ledger: 0 };
    for (const r of rows) {
      const total = Number(r.xpm_total ?? 0);
      if (total > 0) totalSkus++;
      unidades += total;
      if (r.status_conciliacao && porStatus[r.status_conciliacao] !== undefined) {
        porStatus[r.status_conciliacao]++;
      }
    }
    const posicao = rows.find((r) => r.data_hora_posicao)?.data_hora_posicao ?? null;
    return { totalSkus, unidades, porStatus, posicao };
  }, [rows]);

  const rowsFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filtroStatus !== "todos" && r.status_conciliacao !== filtroStatus) return false;
        if (!q) return true;
        return (
          r.sku.toLowerCase().includes(q) || (r.nome_comercial ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => Math.abs(Number(b.diferenca ?? 0)) - Math.abs(Number(a.diferenca ?? 0)));
  }, [rows, busca, filtroStatus]);

  async function handleSincronizar() {
    setSincronizando(true);
    try {
      const { data, error } = await supabase.functions.invoke("zenlog-sync-estoque", { body: {} });
      if (error) throw error;
      const linhas =
        (data as any)?.linhas ?? (data as any)?.total ?? (data as any)?.registros ?? null;
      toast.success(
        linhas != null
          ? `Estoque sincronizado — ${nf.format(Number(linhas))} linhas de posição`
          : "Estoque sincronizado com a XPM",
      );
      qc.invalidateQueries({ queryKey: ["xpm-estoque-conciliacao"] });
      qc.invalidateQueries({ queryKey: ["xpm-estoque-posicoes"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao sincronizar estoque da XPM");
    } finally {
      setSincronizando(false);
    }
  }

  async function handleImportar() {
    if (!file) {
      toast.error("Selecione o arquivo de estoque da XPM");
      return;
    }
    if (!dataSnapshot) {
      toast.error("Informe a data do snapshot");
      return;
    }
    setImportando(true);
    setResultado(null);
    try {
      const buf = await file.arrayBuffer();
      const html = new TextDecoder("iso-8859-1").decode(buf);
      const { rows: parsed, totalDeclarado, totalNormalDeclarado, totalDanificadoDeclarado } =
        parseArquivoXpm(html);

      if (parsed.length === 0) {
        throw new Error("Nenhuma linha reconhecida no arquivo — confira se é o export de estoque da XPM.");
      }

      const { data, error } = await (supabase as any).rpc("ingerir_estoque_xpm", {
        p_data: dataSnapshot,
        p_arquivo: file.name,
        p_rows: parsed,
        p_total_declarado: totalDeclarado,
        p_total_normal: totalNormalDeclarado,
        p_total_danificado: totalDanificadoDeclarado,
      });
      if (error) throw error;

      setResultado(data as IngestResult);
      toast.success("Estoque XPM importado");
      qc.invalidateQueries({ queryKey: ["xpm-estoque-conciliacao"] });
    } catch (e: any) {
      // FAIL-LOUD: repassa a mensagem exata da RPC (inclusive divergência de total)
      toast.error(e?.message ?? "Erro ao importar estoque XPM");
    } finally {
      setImportando(false);
    }
  }

  return (
    <PageShell className="md:px-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-medium tracking-tight">Estoque XPM</h1>
          <p className="text-sm text-muted-foreground">
            Posição sincronizada direto da XPM. Atualiza sozinha todo dia às 03:25.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            posição de {fmtPosicao(kpis.posicao ?? posicaoMaisRecente)}
          </span>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleSincronizar}
            disabled={sincronizando}
          >
            {sincronizando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar agora
          </Button>
        </div>
      </header>

      {conciliacaoQ.isError && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Erro ao carregar a conciliação
            </CardTitle>
            <CardDescription className="text-destructive">
              {(conciliacaoQ.error as any)?.message ?? "Erro desconhecido"}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* 1. KPIs */}
      {conciliacaoQ.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Total de SKUs</div>
              <div className="text-2xl font-medium">{nf.format(kpis.totalSkus)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Unidades na XPM</div>
              <div className="text-2xl font-medium">{nf.format(kpis.unidades)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">SKUs conciliados</div>
              <div className="text-2xl font-medium">{nf.format(kpis.porStatus.ok ?? 0)}</div>
            </CardContent>
          </Card>
          <Card className={(kpis.porStatus.divergente ?? 0) > 0 ? "border-warning/50" : undefined}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {(kpis.porStatus.divergente ?? 0) > 0 && (
                  <AlertTriangle className="h-3 w-3 text-warning" />
                )}
                SKUs divergentes
              </div>
              <div
                className={`text-2xl font-medium ${
                  (kpis.porStatus.divergente ?? 0) > 0 ? "text-warning" : ""
                }`}
              >
                {nf.format(kpis.porStatus.divergente ?? 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Só no razão</div>
              <div className="text-2xl font-medium">
                {nf.format(kpis.porStatus.so_no_ledger ?? 0)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. AVARIAS — segue por planilha */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            Avarias — ainda por planilha
          </CardTitle>
          <CardDescription>
            A API da XPM não expõe avarias: o endpoint MovimentoAvaria retorna vazio e a posição de
            estoque traz apenas itens liberados. Enquanto isso não muda, os danificados continuam
            vindo do arquivo importado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data">Data do snapshot</Label>
              <Input
                id="data"
                type="date"
                value={dataSnapshot}
                onChange={(e) => setDataSnapshot(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="arquivo-xpm">Arquivo (.xls)</Label>
              <Input
                id="arquivo-xpm"
                type="file"
                accept=".xls,.html,.htm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <Button onClick={handleImportar} disabled={!file || importando} className="gap-2">
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar estoque
          </Button>

          {resultado && (
            <div className="mt-2 rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Snapshot de {resultado.data_snapshot} salvo — {nf.format(resultado.linhas)} linhas
              </div>
              <div className="text-muted-foreground">
                Normal: {nf.format(resultado.total_normal)} · Danificado:{" "}
                {nf.format(resultado.total_danificado)}
              </div>
              {resultado.skus_fora_do_catalogo > 0 && (
                <div className="flex items-center gap-2 text-destructive font-medium">
                  <PackageX className="h-4 w-4" />
                  {nf.format(resultado.skus_fora_do_catalogo)} SKUs no armazém não existem no cadastro SNCF
                </div>
              )}
              {resultado.validado_contra_rodape === false && (
                <div className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  Rodapé do arquivo não reconhecido — importado sem conferência de totais
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. TABELA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhe por SKU</CardTitle>
          <div className="flex flex-col md:flex-row gap-3 pt-2">
            <Input
              placeholder="Buscar por SKU ou nome…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="md:max-w-sm"
            />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="md:max-w-[220px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
                <SelectItem value="divergente">Divergente</SelectItem>
                <SelectItem value="so_na_xpm">Só na XPM</SelectItem>
                <SelectItem value="so_no_ledger">Só no razão</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {conciliacaoQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">SKU</TableHead>
                    <TableHead>Nome comercial</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead className="text-right">XPM</TableHead>
                    <TableHead className="text-right">Razão SNCF</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhum registro.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rowsFiltradas.slice(0, 500).map((r) => {
                      const fora = r.existe_no_catalogo === false;
                      const dif = Number(r.diferenca ?? 0);
                      const corDif =
                        dif < 0
                          ? "text-destructive font-medium"
                          : dif > 0
                            ? "text-success font-medium"
                            : "text-muted-foreground";
                      return (
                        <TableRow key={r.sku}>
                          <TableCell className="font-mono text-xs">
                            <div className="flex items-center gap-1">
                              {fora && (
                                <PackageX
                                  className="h-3.5 w-3.5 text-destructive"
                                  aria-label="SKU não existe no cadastro SNCF"
                                />
                              )}
                              {r.sku}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate">
                            {r.nome_comercial ?? r.descricao_xpm ?? (
                              <span className="text-muted-foreground italic">sem nome</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{r.grupo ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {nf.format(Number(r.xpm_total ?? 0))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {nf.format(Number(r.saldo_ledger_sncf ?? 0))}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${corDif}`}>
                            {nf.format(dif)}
                          </TableCell>
                          <TableCell>
                            {r.status_conciliacao && (
                              <Badge variant={STATUS_META[r.status_conciliacao].variant}>
                                {STATUS_META[r.status_conciliacao].label}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {rowsFiltradas.length > 500 && (
            <div className="text-xs text-muted-foreground mt-2">
              Exibindo 500 de {nf.format(rowsFiltradas.length)} linhas. Refine a busca ou o filtro.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. HISTÓRICO DA POSIÇÃO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico da posição</CardTitle>
          <CardDescription>
            {posicoesQ.isError ? (
              <span className="text-destructive">
                {(posicoesQ.error as any)?.message ?? "Erro ao carregar as posições"}
              </span>
            ) : posicoes.length === 0 ? (
              "Nenhuma posição sincronizada ainda."
            ) : (
              <>
                {nf.format(posicoes.length)} posições disponíveis, de{" "}
                {fmtPosicao(posicoes[posicoes.length - 1])} a {fmtPosicao(posicoes[0])}.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {posicoesQ.isLoading ? (
            <Skeleton className="h-9 w-[320px]" />
          ) : (
            posicoes.length > 0 && (
              <Select value={posicaoAtiva} onValueChange={setPosicaoEscolhida}>
                <SelectTrigger className="md:max-w-[320px]">
                  <SelectValue placeholder="Escolha a posição" />
                </SelectTrigger>
                <SelectContent>
                  {posicoes.map((p) => (
                    <SelectItem key={p} value={p}>
                      {fmtPosicao(p)}
                      {p === posicaoMaisRecente ? " (mais recente)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          )}

          {verHistorico && (
            <>
              {historicoQ.isError && (
                <div className="rounded-md border border-destructive p-3 text-sm text-destructive">
                  {(historicoQ.error as any)?.message ?? "Erro ao carregar a posição"}
                </div>
              )}
              {historicoQ.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">SKU</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Lote</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(historicoQ.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Nenhuma linha nessa posição.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (historicoQ.data ?? []).slice(0, 500).map((r, i) => (
                          <TableRow key={`${r.sku}-${r.lote ?? ""}-${i}`}>
                            <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                            <TableCell className="max-w-[320px] truncate">
                              {r.descricao ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {r.situacao_estoque ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{r.lote ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {nf.format(Number(r.quantidade ?? 0))}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
