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
import { useNfsEmitidas, type NfEmitida } from "@/hooks/vendas/useNfsEmitidas";
import { FileText, ExternalLink, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  emitida: "Emitida",
  autorizada: "Autorizada",
  cancelada: "Cancelada",
};

const SITUACAO_CLASS: Record<string, string> = {
  emitida: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  autorizada: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  cancelada: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

function getSituacaoBadge(n: NfEmitida) {
  const valorZero = n.valor_nota === 0 || n.valor_nota === null;
  if (n.situacao === "autorizada" && valorZero) {
    return { label: "Cancelada", className: SITUACAO_CLASS.cancelada };
  }
  if (n.situacao === "pendente" || n.situacao === "emitida") {
    return { label: "Autorizada", className: SITUACAO_CLASS.autorizada };
  }
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
    </div>
  );
}
