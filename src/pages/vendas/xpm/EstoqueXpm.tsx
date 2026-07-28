import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Upload, Loader2, AlertTriangle, CheckCircle2, PackageX } from "lucide-react";

type ConciliacaoRow = {
  sku: string;
  nome_comercial: string | null;
  grupo: string | null;
  linha: string | null;
  colecao: string | null;
  data_snapshot: string | null;
  xpm_normal: number | null;
  xpm_truncado: number | null;
  xpm_danificado: number | null;
  saldo_ledger_sncf: number | null;
  diferenca: number | null;
  existe_no_catalogo: boolean | null;
  status_conciliacao: "ok" | "divergente" | "so_na_xpm" | "so_no_ledger" | null;
};

type IngestResult = {
  data_snapshot: string;
  linhas: number;
  skus_fora_do_catalogo: number;
  total_normal: number;
  total_danificado: number;
};

const STATUS_META: Record<
  NonNullable<ConciliacaoRow["status_conciliacao"]>,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  ok: { label: "OK", variant: "secondary" },
  divergente: { label: "Divergente", variant: "destructive" },
  so_na_xpm: { label: "Só na XPM", variant: "outline" },
  so_no_ledger: { label: "Só no razão", variant: "outline" },
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

  // Rodapé "TOTAL GERAL: N produtos"
  const bodyText = doc.body?.textContent ?? "";
  const m = bodyText.match(/TOTAL\s+GERAL\s*:\s*([\d.]+)\s*produtos/i);
  const totalDeclarado = m ? parseInt(m[1].replace(/\./g, ""), 10) : null;

  return { rows, totalDeclarado };
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

  const conciliacaoQ = useQuery({
    queryKey: ["xpm-estoque-conciliacao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_estoque_conciliacao")
        .select("*")
        .order("sku", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ConciliacaoRow[];
    },
  });

  const rows = conciliacaoQ.data ?? [];

  const kpis = useMemo(() => {
    const totalSkus = rows.length;
    const totalNormal = rows.reduce((s, r) => s + Number(r.xpm_normal ?? 0), 0);
    const totalDanificado = rows.reduce((s, r) => s + Number(r.xpm_danificado ?? 0), 0);
    const totalTruncado = rows.reduce((s, r) => s + Number(r.xpm_truncado ?? 0), 0);
    const snapshot = rows.find((r) => r.data_snapshot)?.data_snapshot ?? null;

    const porStatus: Record<string, number> = { ok: 0, divergente: 0, so_na_xpm: 0, so_no_ledger: 0 };
    let somaDif = 0;
    for (const r of rows) {
      if (r.status_conciliacao && porStatus[r.status_conciliacao] !== undefined) {
        porStatus[r.status_conciliacao]++;
      }
      somaDif += Number(r.diferenca ?? 0);
    }
    return { totalSkus, totalNormal, totalDanificado, totalTruncado, snapshot, porStatus, somaDif };
  }, [rows]);

  const rowsFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (filtroStatus !== "todos" && r.status_conciliacao !== filtroStatus) return false;
      if (!q) return true;
      return (
        r.sku.toLowerCase().includes(q) ||
        (r.nome_comercial ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, busca, filtroStatus]);

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
      const { rows: parsed, totalDeclarado } = parseArquivoXpm(html);

      if (parsed.length === 0) {
        throw new Error("Nenhuma linha reconhecida no arquivo — confira se é o export de estoque da XPM.");
      }

      const { data, error } = await (supabase as any).rpc("ingerir_estoque_xpm", {
        p_data: dataSnapshot,
        p_arquivo: file.name,
        p_rows: parsed,
        p_total_declarado: totalDeclarado,
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

  const nf = new Intl.NumberFormat("pt-BR");

  return (
    <div className="max-w-[1300px] mx-auto px-4 md:px-8 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Estoque XPM</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot do estoque no armazém XPM e conciliação com o razão do SNCF.
        </p>
      </header>

      {/* 1. IMPORTAÇÃO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            Importar estoque da XPM
          </CardTitle>
          <CardDescription>
            O arquivo é o export .xls da XPM (HTML disfarçado). A data é informada pelo operador — o arquivo não carrega data própria.
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
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Total de SKUs</div>
            <div className="text-2xl font-semibold">{nf.format(kpis.totalSkus)}</div>
            {kpis.snapshot && (
              <div className="text-xs text-muted-foreground mt-1">
                Snapshot: {kpis.snapshot}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Unidades normais</div>
            <div className="text-2xl font-semibold">{nf.format(kpis.totalNormal)}</div>
          </CardContent>
        </Card>
        <Card className={kpis.totalDanificado > 0 ? "border-amber-500/50" : undefined}>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              {kpis.totalDanificado > 0 && <AlertTriangle className="h-3 w-3 text-amber-600" />}
              Danificado
            </div>
            <div
              className={`text-2xl font-semibold ${
                kpis.totalDanificado > 0 ? "text-amber-700 dark:text-amber-500" : ""
              }`}
            >
              {nf.format(kpis.totalDanificado)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Truncado / vencido</div>
            <div className="text-2xl font-semibold">{nf.format(kpis.totalTruncado)}</div>
          </CardContent>
        </Card>
      </div>

      {/* 3. CONCILIAÇÃO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conciliação com o razão SNCF</CardTitle>
          <CardDescription>
            Distribuição dos SKUs entre XPM e razão. Diferença total ={" "}
            <span className="font-medium text-foreground">{nf.format(kpis.somaDif)}</span> un.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["ok", "divergente", "so_na_xpm", "so_no_ledger"] as const).map((s) => (
              <div key={s} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{STATUS_META[s].label}</div>
                <div className="text-xl font-semibold">
                  {nf.format(kpis.porStatus[s] ?? 0)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 4. TABELA */}
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">SKU</TableHead>
                  <TableHead>Nome comercial</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">XPM normal</TableHead>
                  <TableHead className="text-right">Danificado</TableHead>
                  <TableHead className="text-right">Razão SNCF</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conciliacaoQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : rowsFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum registro.
                    </TableCell>
                  </TableRow>
                ) : (
                  rowsFiltradas.slice(0, 500).map((r) => {
                    const fora = r.existe_no_catalogo === false;
                    const danificado = Number(r.xpm_danificado ?? 0) > 0;
                    return (
                      <TableRow key={`${r.sku}-${r.data_snapshot ?? ""}`}>
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
                          {r.nome_comercial ?? (
                            <span className="text-muted-foreground italic">sem nome</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.grupo ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {nf.format(Number(r.xpm_normal ?? 0))}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            danificado ? "text-amber-700 dark:text-amber-500 font-medium" : ""
                          }`}
                        >
                          <div className="inline-flex items-center gap-1 justify-end">
                            {danificado && <AlertTriangle className="h-3 w-3" />}
                            {nf.format(Number(r.xpm_danificado ?? 0))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {nf.format(Number(r.saldo_ledger_sncf ?? 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {nf.format(Number(r.diferenca ?? 0))}
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
          {rowsFiltradas.length > 500 && (
            <div className="text-xs text-muted-foreground mt-2">
              Exibindo 500 de {nf.format(rowsFiltradas.length)} linhas. Refine a busca ou o filtro.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
