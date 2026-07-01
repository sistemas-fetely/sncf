import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { FilterInput } from "@/components/ui/filter-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useNfsEmitidas, type NfEmitida } from "@/hooks/vendas/useNfsEmitidas";
import { useVendasProduto, type VendaProduto } from "@/hooks/vendas/useVendasProduto";
import { FileText, ExternalLink, Search, RefreshCw, Download, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatCurrency(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
  }).format(v);
}

const SITUACAO_LABELS: Record<string, string> = {
  autorizada: "Autorizada",
  cancelada: "Cancelada",
  pendente: "Pendente",
  rejeitada: "Rejeitada",
  denegada: "Denegada",
  bloqueada: "Bloqueada",
  registrada: "Registrada",
  emitida: "Emitida",
};

const SITUACAO_CLASS: Record<string, string> = {
  autorizada: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  cancelada: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  pendente: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  rejeitada: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  denegada: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  bloqueada: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  registrada: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  emitida: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
};

function getSituacaoBadge(n: NfEmitida) {
  return {
    label: SITUACAO_LABELS[n.situacao] ?? n.situacao,
    className: SITUACAO_CLASS[n.situacao] ?? "bg-muted text-muted-foreground border-muted",
  };
}

const SITUACAO_OPTIONS = ["todas", "autorizada", "cancelada"] as const;

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
    </TableRow>
  );
}

export default function NfsDeVenda() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs" },
          { label: "NFs de Venda" },
        ]}
        title="NFs de Venda"
        subtitle="Notas fiscais emitidas pelo Bling · sincronização automática a cada 10 min"
      />

      <Tabs defaultValue="nfs" className="mt-2">
        <TabsList>
          <TabsTrigger value="nfs">NFs</TabsTrigger>
          <TabsTrigger value="produto">Por Produto</TabsTrigger>
        </TabsList>

        <TabsContent value="nfs" className="mt-4">
          <AbaNFs />
        </TabsContent>

        <TabsContent value="produto" className="mt-4">
          <AbaPorProduto />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// ABA NFs — conteúdo original preservado 100%
// ============================================================
function AbaNFs() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const [busca, setBusca] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState<string>("todas");
  const [syncing, setSyncing] = useState(false);
  const { data: nfs = [], isLoading, refetch } = useNfsEmitidas();

  async function handleSincronizar() {
    setSyncing(true);
    try {
      if (isSuperAdmin) {
        const { data, error } = await supabase.functions.invoke("sync-bling-financeiro", {
          body: { tipo: "sync", entidades: ["nfe"] },
        });
        if (error) throw error;
        const msg = `${data?.criados || 0} novas · ${data?.atualizados || 0} atualizadas`;
        toast.success(`Sincronizado: ${msg}${data?.continuar ? " (continua)" : ""}`);
      }
      await refetch();
    } catch (e: any) {
      toast.error("Falha na sincronização: " + (e?.message || String(e)));
    } finally {
      setSyncing(false);
    }
  }

  function handleExportXLSX() {
    const linhas = filtrados.map((n) => {
      const dataRaw = n.data_emissao;
      let dataStr = "";
      if (dataRaw) {
        const d = new Date(dataRaw);
        if (!isNaN(d.getTime())) {
          dataStr = d.toLocaleDateString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric",
          });
        }
      }
      return {
        "NF": n.serie && n.numero ? `${n.serie}-${n.numero}` : (n.numero ?? ""),
        "Data": dataStr,
        "Parceiro": n.parceiro?.razao_social ?? "",
        "CNPJ": n.parceiro?.cnpj ?? "",
        "Valor": Number(n.valor_nota ?? 0),
        "Frete": Number(n.valor_frete ?? 0),
        "Nº Pedido (Bling)": n.bling_pedido_venda_numero ?? "",
        "Pedido": n.pedido_ref ?? "",
        "Canal": n.canal ?? "",
        "Situação": SITUACAO_LABELS[n.situacao] ?? n.situacao ?? "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NFs de Venda");
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `nfs-de-venda-${hoje}.xlsx`);
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtered = nfs.filter((n) => {
      if (situacaoFiltro !== "todas") {
        const badge = getSituacaoBadge(n);
        if (badge.label.toLowerCase() !== situacaoFiltro) return false;
      }
      if (!q) return true;
      const nfText = `${n.serie ?? ""}-${n.numero ?? ""}`.toLowerCase();
      const parceiroText = n.parceiro?.razao_social?.toLowerCase() ?? "";
      return nfText.includes(q) || parceiroText.includes(q);
    });
    return [...filtered].sort((a, b) => {
      const na = parseInt(a.numero ?? "", 10);
      const nb = parseInt(b.numero ?? "", 10);
      const aNum = isNaN(na) ? 0 : na;
      const bNum = isNaN(nb) ? 0 : nb;
      if (bNum !== aNum) return bNum - aNum;
      return (a.serie ?? "").localeCompare(b.serie ?? "") || (b.data_emissao ?? "").localeCompare(a.data_emissao ?? "");
    });
  }, [nfs, busca, situacaoFiltro]);

  const totalValor = useMemo(
    () => filtrados.reduce((sum, n) => sum + Number(n.valor_nota ?? 0), 0),
    [filtrados],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <FilterInput
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por razão social ou número NF"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {SITUACAO_OPTIONS.map((s) => (
            <Button
              key={s}
              variant={situacaoFiltro === s ? "default" : "outline"}
              size="sm"
              className="h-8 capitalize"
              onClick={() => setSituacaoFiltro(s)}
            >
              {s === "todas" ? "Todas" : SITUACAO_LABELS[s] ?? s}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtrados.length} {filtrados.length === 1 ? "NF" : "NFs"}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={filtrados.length === 0}
          onClick={handleExportXLSX}
        >
          <Download className="h-4 w-4 mr-1.5" />
          Exportar XLSX
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={syncing}
          onClick={handleSincronizar}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando…" : "Sincronizar"}
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="w-[110px]">NF</TableHead>
              <TableHead className="w-[120px]">Data</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead className="w-[140px] text-right">Valor</TableHead>
              <TableHead className="w-[120px] text-right">Frete</TableHead>
              <TableHead className="w-[140px]">Nº Pedido (Bling)</TableHead>
              <TableHead className="w-[140px]">Pedido</TableHead>
              <TableHead className="w-[120px]">Situação</TableHead>
              <TableHead className="w-[100px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  Nenhuma NF encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono text-xs">
                    {n.serie && n.numero ? `${n.serie}-${n.numero}` : (n.numero ?? "—")}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(n.data_emissao)}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate" title={n.parceiro?.razao_social ?? undefined}>
                    {n.parceiro?.razao_social ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatCurrency(n.valor_nota)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {n.valor_frete ? formatCurrency(n.valor_frete) : "—"}
                  </TableCell>
                  <TableCell
                    className="text-sm font-mono text-xs"
                    title={`numeroPedidoLoja: ${n.numero_pedido_loja ?? ""}\npedidoVenda.numero: ${n.bling_pedido_venda_numero ?? ""}\npedidoVenda.id: ${n.bling_pedido_venda_id ?? ""}`}
                  >
                    {n.numero_pedido_loja || n.bling_pedido_venda_numero || (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {n.pedido_ref ? (
                      <div className="flex items-center gap-2">
                        {n.pedido_venda_id ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 font-mono text-xs"
                            onClick={() => navigate(`/vendas/pedidos/${n.pedido_venda_id}`)}
                          >
                            {n.pedido_ref}
                          </Button>
                        ) : (
                          <span className="font-mono text-xs">{n.pedido_ref}</span>
                        )}
                        {n.canal && (
                          <Badge variant="outline" className="font-normal text-xs">
                            {n.canal}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {n.situacao ? (
                      <Badge variant="outline" className={cn("font-normal", getSituacaoBadge(n).className)}>
                        {getSituacaoBadge(n).label}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {n.pdf_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => window.open(n.pdf_url!, "_blank")}
                          title="Abrir PDF"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                      {n.pedido_venda_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => navigate(`/pedidos/${n.pedido_venda_id}`)}
                          title="Ver pedido"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
        <span>
          {filtrados.length} {filtrados.length === 1 ? "NF" : "NFs"}
          {filtrados.length > 0 && (
            <>
              {" "}·{" "}
              <span className="text-foreground font-medium tabular-nums">
                Total {formatCurrency(totalValor)}
              </span>
            </>
          )}
        </span>
      </div>
    </>
  );
}

// ============================================================
// ABA POR PRODUTO
// ============================================================
type SortCol = "qtd" | "valor" | "sku" | "produto" | "colecao" | "nfs";
type SortDir = "asc" | "desc";

function formatMesLabel(mes: string): string {
  // mes = 'YYYY-MM-01'
  const [y, m] = mes.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  // "junho de 2026" → "junho/2026"
  return label.replace(" de ", "/");
}

function AbaPorProduto() {
  const { data: rows = [], isLoading } = useVendasProduto();
  const [incluirOutros, setIncluirOutros] = useState(false);
  const [busca, setBusca] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("valor");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.mes) set.add(r.mes);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const [mesSelecionado, setMesSelecionado] = useState<string>("");
  const mesEfetivo = mesSelecionado || mesesDisponiveis[0] || "";

  const doMes = useMemo(
    () => rows.filter((r) => r.mes === mesEfetivo),
    [rows, mesEfetivo],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let list = doMes;
    if (!incluirOutros) {
      list = list.filter((r) => Number(r.valor_venda ?? 0) > 0);
    }
    if (q) {
      list = list.filter(
        (r) =>
          (r.sku ?? "").toLowerCase().includes(q) ||
          (r.nome_produto ?? "").toLowerCase().includes(q),
      );
    }
    const getValor = (r: VendaProduto) =>
      Number((incluirOutros ? r.valor_total : r.valor_venda) ?? 0);
    const getQtd = (r: VendaProduto) =>
      Number((incluirOutros ? r.quantidade_total : r.quantidade_venda) ?? 0);
    const mult = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortCol) {
        case "valor": return (getValor(a) - getValor(b)) * mult;
        case "qtd": return (getQtd(a) - getQtd(b)) * mult;
        case "nfs": return ((a.nfs_distintas ?? 0) - (b.nfs_distintas ?? 0)) * mult;
        case "sku": return (a.sku ?? "").localeCompare(b.sku ?? "", "pt-BR") * mult;
        case "produto": return (a.nome_produto ?? "").localeCompare(b.nome_produto ?? "", "pt-BR") * mult;
        case "colecao": return (a.colecao ?? "").localeCompare(b.colecao ?? "", "pt-BR") * mult;
        default: return 0;
      }
    });
  }, [doMes, busca, incluirOutros, sortCol, sortDir]);

  const resumo = useMemo(() => {
    let totalValor = 0;
    let totalQtd = 0;
    let somaNfs = 0;
    for (const r of filtradas) {
      totalValor += Number((incluirOutros ? r.valor_total : r.valor_venda) ?? 0);
      totalQtd += Number((incluirOutros ? r.quantidade_total : r.quantidade_venda) ?? 0);
      somaNfs += Number(r.nfs_distintas ?? 0);
    }
    return { totalValor, totalQtd, produtos: filtradas.length, somaNfs };
  }, [filtradas, incluirOutros]);

  const alertaCount = useMemo(
    () => doMes.filter((r) => r.tem_cfop_nao_classificado || r.sku_sem_cadastro).length,
    [doMes],
  );

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "sku" || col === "produto" || col === "colecao" ? "asc" : "desc");
    }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 opacity-40 inline ml-1" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3.5 w-3.5 inline ml-1 text-admin" />
      : <ArrowDown className="h-3.5 w-3.5 inline ml-1 text-admin" />;
  }

  function natureza(r: VendaProduto): string {
    const v = Number(r.valor_venda ?? 0);
    const o = Number(r.valor_outros ?? 0);
    if (v > 0 && o > 0) return "Misto";
    if (v > 0) return "Venda";
    if (o > 0) return "Remessa/Bonif.";
    return "—";
  }

  function handleExportXLSX() {
    const linhas = filtradas.map((r) => {
      const base: Record<string, any> = {
        "Mês": r.mes ? r.mes.slice(0, 7) : "",
        "SKU": r.sku ?? "",
        "Produto": r.nome_produto ?? "",
        "Coleção": r.colecao ?? "",
      };
      if (incluirOutros) base["Natureza"] = natureza(r);
      base["Qtd"] = Number((incluirOutros ? r.quantidade_total : r.quantidade_venda) ?? 0);
      base["Valor"] = Number((incluirOutros ? r.valor_total : r.valor_venda) ?? 0);
      base["Nº NFs"] = Number(r.nfs_distintas ?? 0);
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas por Produto");
    const nome = mesEfetivo ? mesEfetivo.slice(0, 7) : "sem-mes";
    XLSX.writeFile(wb, `vendas-por-produto-${nome}.xlsx`);
  }

  return (
    <>
      {/* Header da aba */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Mês</Label>
          <Select
            value={mesEfetivo}
            onValueChange={(v) => setMesSelecionado(v)}
            disabled={mesesDisponiveis.length === 0}
          >
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Selecione o mês" />
            </SelectTrigger>
            <SelectContent>
              {mesesDisponiveis.map((m) => (
                <SelectItem key={m} value={m} className="capitalize">
                  {formatMesLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 h-9">
          <Switch
            id="incluir-outros"
            checked={incluirOutros}
            onCheckedChange={setIncluirOutros}
          />
          <Label htmlFor="incluir-outros" className="text-sm cursor-pointer">
            Incluir remessas e bonificações
          </Label>
        </div>

        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <FilterInput
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por SKU ou produto"
            className="pl-9 h-9"
          />
        </div>

        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={filtradas.length === 0}
            onClick={handleExportXLSX}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Exportar XLSX
          </Button>
        </div>
      </div>

      {/* Alerta fail-loud */}
      {alertaCount > 0 && (
        <Alert className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 !text-amber-600" />
          <AlertDescription>
            Atenção: {alertaCount} produto(s) com CFOP não classificado ou SKU sem cadastro
            neste mês. Verifique a dimensão <code>cfop_natureza</code> / o catálogo.
          </AlertDescription>
        </Alert>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <ResumoCard label="Total" value={formatCurrency(resumo.totalValor)} />
        <ResumoCard label="Unidades" value={resumo.totalQtd.toLocaleString("pt-BR")} />
        <ResumoCard label="Produtos distintos" value={String(resumo.produtos)} />
        <ResumoCard label="NFs (soma por produto)" value={resumo.somaNfs.toLocaleString("pt-BR")} />
      </div>

      {/* Tabela */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="w-[130px] cursor-pointer select-none" onClick={() => toggleSort("sku")}>
                SKU<SortIcon col="sku" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("produto")}>
                Produto<SortIcon col="produto" />
              </TableHead>
              <TableHead className="w-[140px] cursor-pointer select-none" onClick={() => toggleSort("colecao")}>
                Coleção<SortIcon col="colecao" />
              </TableHead>
              {incluirOutros && (
                <TableHead className="w-[130px]">Natureza</TableHead>
              )}
              <TableHead className="w-[100px] text-right cursor-pointer select-none" onClick={() => toggleSort("qtd")}>
                Qtd<SortIcon col="qtd" />
              </TableHead>
              <TableHead className="w-[140px] text-right cursor-pointer select-none" onClick={() => toggleSort("valor")}>
                Valor (R$)<SortIcon col="valor" />
              </TableHead>
              <TableHead className="w-[90px] text-right cursor-pointer select-none" onClick={() => toggleSort("nfs")}>
                Nº NFs<SortIcon col="nfs" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={incluirOutros ? 7 : 6} className="py-8">
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ) : filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={incluirOutros ? 7 : 6} className="text-center py-12 text-muted-foreground">
                  {mesesDisponiveis.length === 0
                    ? "Nenhum dado disponível na view."
                    : "Nenhum produto encontrado para o mês/filtro selecionado."}
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((r) => {
                const alerta = r.tem_cfop_nao_classificado || r.sku_sem_cadastro;
                const qtd = Number((incluirOutros ? r.quantidade_total : r.quantidade_venda) ?? 0);
                const valor = Number((incluirOutros ? r.valor_total : r.valor_venda) ?? 0);
                return (
                  <TableRow key={`${r.mes}-${r.sku}`}>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        {alerta && (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-amber-500 shrink-0"
                            aria-label="CFOP ou SKU sem classificação"
                          />
                        )}
                        {r.sku}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-md truncate" title={r.nome_produto ?? undefined}>
                      {r.nome_produto ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.colecao ?? "—"}
                    </TableCell>
                    {incluirOutros && (
                      <TableCell className="text-sm">
                        <Badge variant="outline" className="font-normal text-xs">
                          {natureza(r)}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums text-sm">
                      {qtd.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatCurrency(valor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {Number(r.nfs_distintas ?? 0).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function ResumoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
