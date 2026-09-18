import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CabecalhoOrdenavel, LINHA_CABECALHO_COLADO,
  type DirecaoOrdenacao,
} from "@/components/tabela/CabecalhoOrdenavel";
import {
  RodapePaginacao, lerTamanhoPaginaSalvo, type PageSizeOption,
} from "@/components/tabela/RodapePaginacao";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { FilterInput } from "@/components/ui/filter-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useNfsEmitidas, type NfEmitida } from "@/hooks/vendas/useNfsEmitidas";
import { FileText, ExternalLink, Search, RefreshCw, Download, Loader2, AlertCircle } from "lucide-react";
import { formatError } from "@/lib/format-error";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";
import { nomeArquivoNf } from "@/lib/nf/nome-arquivo";
import { cn } from "@/lib/utils";
import { apelidoParceiro } from "@/lib/parceiros/nome";
import { useAuth } from "@/contexts/AuthContext";
import { useNivel } from "@/hooks/useNivel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { PageShell } from "@/components/layout/PageShell";
import { fmtData, hojeISO } from "@/lib/data";


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
  autorizada: "bg-success/10 text-success border-success/20",
  cancelada: "bg-destructive/10 text-destructive border-destructive/20",
  pendente: "bg-warning/10 text-warning border-warning/20",
  rejeitada: "bg-destructive/10 text-destructive border-destructive/20",
  denegada: "bg-destructive/10 text-destructive border-destructive/20",
  bloqueada: "bg-warning/10 text-warning border-warning/20",
  registrada: "bg-info/10 text-info border-info/20",
  emitida: "bg-success/10 text-success border-success/20",
};

function getSituacaoBadge(n: NfEmitida) {
  return {
    label: SITUACAO_LABELS[n.situacao] ?? n.situacao,
    className: SITUACAO_CLASS[n.situacao] ?? "bg-muted text-muted-foreground border-muted",
  };
}

const SITUACAO_OPTIONS = ["todas", "autorizada", "cancelada"] as const;

type ColunaNf =
  | "nf" | "data" | "parceiro" | "valor" | "frete"
  | "pedido_bling" | "pedido" | "situacao";

type OrdenacaoNf = { coluna: ColunaNf; dir: DirecaoOrdenacao };

/** Padrao da tela: NF mais recente primeiro — a mesma ordem de hoje. */
const ORDEM_PADRAO_NF: OrdenacaoNf = { coluna: "nf", dir: "desc" };

/** Texto sobe; numero, data e dinheiro descem. */
const DIR_INICIAL_NF: Record<ColunaNf, DirecaoOrdenacao> = {
  nf: "desc", data: "desc", parceiro: "asc", valor: "desc",
  frete: "desc", pedido_bling: "asc", pedido: "asc", situacao: "desc",
};

/** Gravidade fiscal: o que deu errado vem primeiro no decrescente. */
const GRAVIDADE_SITUACAO: Record<string, number> = {
  rejeitada: 4, denegada: 4, cancelada: 3,
  bloqueada: 2, pendente: 2, registrada: 1,
  autorizada: 0, emitida: 0,
};

const CHAVE_PAGINA_NFS = "fetely:vendas:nfs:page-size";

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
      <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
    </TableRow>
  );
}

export default function NfsDeVenda() {
  return (
    <PageShell className="md:px-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs" },
          { label: "NFs de Venda" },
        ]}
        title="NFs de Venda"
        subtitle="Notas fiscais emitidas pelo Bling · sincronização automática a cada 10 min"
      />

      <div className="mt-4">
        <AbaNFs />
      </div>
    </PageShell>
  );
}

// ============================================================
// ABA NFs — conteúdo original preservado 100%
// ============================================================
function AbaNFs() {
  const navigate = useNavigate();
  const { baixar, baixando, nfEmDownload } = useDownloadNfPdf();
  const { roles } = useAuth();
  const { temNivel } = useNivel();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const [busca, setBusca] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState<string>("todas");
  const [mesFiltro, setMesFiltro] = useState<string>("todos");
  const [syncing, setSyncing] = useState(false);
  const { data: nfs = [], isLoading, isError, error, refetch } = useNfsEmitidas();
  const [ordenacao, setOrdenacao] = useState<OrdenacaoNf>(ORDEM_PADRAO_NF);
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(() =>
    lerTamanhoPaginaSalvo(CHAVE_PAGINA_NFS),
  );

  const ordenarPor = (coluna: ColunaNf) => {
    setOrdenacao((atual) => {
      if (atual.coluna !== coluna) return { coluna, dir: DIR_INICIAL_NF[coluna] };
      const invertida: DirecaoOrdenacao = atual.dir === "asc" ? "desc" : "asc";
      // Fechou o ciclo: volta ao padrao da tela (NF mais recente primeiro).
      return invertida === DIR_INICIAL_NF[coluna] ? ORDEM_PADRAO_NF : { coluna, dir: invertida };
    });
  };

  useEffect(() => {
    setPagina(1);
  }, [busca, situacaoFiltro, mesFiltro, ordenacao]);

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
    } catch (e) {
      toast.error("Falha na sincronização: " + formatError(e));
    } finally {
      setSyncing(false);
    }
  }

  function handleExportXLSX() {
    const linhas = filtrados.map((n) => ({
      "NF": n.serie && n.numero ? `${n.serie}-${n.numero}` : (n.numero ?? ""),
      "Data": fmtData(n.data_emissao, ""),
      "Parceiro": n.parceiro?.razao_social ?? "",
      "Nome fantasia": apelidoParceiro(n.parceiro?.razao_social, n.parceiro?.nome_fantasia) ?? "",
      "CNPJ": n.parceiro?.cnpj ?? "",
      "Valor": Number(n.valor_nota ?? 0),
      "Frete": Number(n.valor_frete ?? 0),
      "Nº Pedido (Bling)": n.bling_pedido_venda_numero ?? "",
      "Pedido": n.pedido_ref ?? "",
      "Canal": n.canal ?? "",
      "Situação": SITUACAO_LABELS[n.situacao] ?? n.situacao ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NFs de Venda");
    const sufixo = mesFiltro !== "todos" ? mesFiltro : hojeISO();
    XLSX.writeFile(wb, `nfs-de-venda-${sufixo}.xlsx`);
  }

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const n of nfs) {
      if (n.data_emissao) set.add(n.data_emissao.slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [nfs]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtered = nfs.filter((n) => {
      if (mesFiltro !== "todos") {
        if (!n.data_emissao || n.data_emissao.slice(0, 7) !== mesFiltro) return false;
      }
      if (situacaoFiltro !== "todas") {
        const badge = getSituacaoBadge(n);
        if (badge.label.toLowerCase() !== situacaoFiltro) return false;
      }
      if (!q) return true;
      const nfText = `${n.serie ?? ""}-${n.numero ?? ""}`.toLowerCase();
      const parceiroText = n.parceiro?.razao_social?.toLowerCase() ?? "";
      const fantasiaText = n.parceiro?.nome_fantasia?.toLowerCase() ?? "";
      return nfText.includes(q) || parceiroText.includes(q) || fantasiaText.includes(q);
    });
    const dir = ordenacao.dir === "asc" ? 1 : -1;
    const valorDe = (n: NfEmitida): string | number | null => {
      switch (ordenacao.coluna) {
        case "nf": {
          const num = parseInt(n.numero ?? "", 10);
          return Number.isNaN(num) ? null : num;
        }
        case "data": {
          const t = n.data_emissao ? Date.parse(n.data_emissao) : NaN;
          return Number.isNaN(t) ? null : t;
        }
        case "parceiro": return n.parceiro?.razao_social ?? null;
        case "valor": return Number(n.valor_nota ?? 0);
        // Frete zerado aparece como "—" na celula, entao e ausencia, nao zero.
        case "frete": return n.valor_frete ? Number(n.valor_frete) : null;
        case "pedido_bling":
          return n.numero_pedido_loja || n.bling_pedido_venda_numero || null;
        case "pedido": return n.pedido_ref ?? null;
        case "situacao": return n.situacao ? GRAVIDADE_SITUACAO[n.situacao] ?? null : null;
        default: return null;
      }
    };
    // VAZIO-VAI-PRO-FIM: celula sem dado nunca ganha primeiro lugar, nos dois sentidos.
    return [...filtered].sort((a, b) => {
      const va = valorDe(a);
      const vb = valorDe(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
  }, [nfs, busca, situacaoFiltro, mesFiltro, ordenacao]);

  const totalPaginasNf = Math.max(1, Math.ceil(filtrados.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginasNf);
  const paginaItens = filtrados.slice(
    (paginaAtual - 1) * tamanhoPagina,
    paginaAtual * tamanhoPagina,
  );

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
            placeholder="Buscar por razão social, nome fantasia ou número NF"
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
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="h-8 w-[170px]">
            <SelectValue placeholder="Todos os meses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {mesesDisponiveis.map((m) => (
              <SelectItem key={m} value={m}>
                {new Date(m + "-01T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", "/")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtrados.length} {filtrados.length === 1 ? "NF" : "NFs"}
        </span>
        {/* Exportação leva a base para fora: nível 3 (Coordenador) para cima. */}
        {temNivel(3) && (
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
        )}
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
        <Table containerClassName="overflow-visible">
          <TableHeader>
            <TableRow className={LINHA_CABECALHO_COLADO}>
              <CabecalhoOrdenavel rotulo="NF" className="w-[110px]" dir={ordenacao.coluna === "nf" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("nf")} />
              <CabecalhoOrdenavel rotulo="Data" className="w-[120px]" dir={ordenacao.coluna === "data" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("data")} />
              <CabecalhoOrdenavel rotulo="Parceiro" dir={ordenacao.coluna === "parceiro" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("parceiro")} />
              <CabecalhoOrdenavel rotulo="Valor" className="w-[140px] text-right" alinharDireita dir={ordenacao.coluna === "valor" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("valor")} />
              <CabecalhoOrdenavel rotulo="Frete" className="w-[120px] text-right" alinharDireita dir={ordenacao.coluna === "frete" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("frete")} />
              <CabecalhoOrdenavel rotulo="Nº Pedido (Bling)" className="w-[140px]" dir={ordenacao.coluna === "pedido_bling" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("pedido_bling")} />
              <CabecalhoOrdenavel rotulo="Pedido" className="w-[140px]" dir={ordenacao.coluna === "pedido" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("pedido")} />
              <CabecalhoOrdenavel rotulo="Situação" className="w-[120px]" dir={ordenacao.coluna === "situacao" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("situacao")} />
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
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <span className="inline-flex items-center gap-2 text-destructive text-sm" title={formatError(error)}>
                    <AlertCircle className="h-4 w-4" />
                    Não foi possível carregar as NFs — {formatError(error)}
                  </span>
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  Nenhuma NF encontrada.
                </TableCell>
              </TableRow>
            ) : (
              paginaItens.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono text-xs">
                    {n.serie && n.numero ? `${n.serie}-${n.numero}` : (n.numero ?? "—")}
                  </TableCell>
                  <TableCell className="text-sm">{fmtData(n.data_emissao)}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate" title={n.parceiro?.razao_social ?? undefined}>
                    {n.parceiro?.razao_social ?? "—"}
                    {apelidoParceiro(n.parceiro?.razao_social, n.parceiro?.nome_fantasia) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {apelidoParceiro(n.parceiro?.razao_social, n.parceiro?.nome_fantasia)}
                      </p>
                    )}
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
                      {(n.pdf_url || n.bling_id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={baixando && nfEmDownload === n.id}
                          onClick={() =>
                            baixar({
                              nf_id: n.id,
                              nome: nomeArquivoNf({
                                pedidoRef: n.pedido?.id_externo ?? n.pedido_ref,
                                numero: n.numero,
                                serie: n.serie,
                                fallbackId: n.id,
                              }),
                            })
                          }
                          title="Baixar PDF da NF"
                        >
                          {baixando && nfEmDownload === n.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
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

      <RodapePaginacao
        total={filtrados.length}
        pagina={paginaAtual}
        tamanhoPagina={tamanhoPagina}
        chavePreferencia={CHAVE_PAGINA_NFS}
        onPagina={setPagina}
        onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)}
      />

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
