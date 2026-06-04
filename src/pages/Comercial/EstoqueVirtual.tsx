import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelectTrigger } from "@/components/ui/filter-select-trigger";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableTableHead, type SortState, ordenarPor } from "@/components/shared/SortableTableHead";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProdutoEstoqueVirtual {
  codigo: string;
  nome: string;
  ativo: boolean;
  estoque_real: number;
  reservado: number;
  estoque_virtual: number;
  estoque_minimo: number;
  status_venda: "disponivel" | "baixo" | "indisponivel";
}

type Col = "codigo" | "nome" | "real" | "reservado" | "virtual" | "status";

const STATUS_LABEL: Record<string, string> = {
  disponivel: "Disponível",
  baixo: "Baixo",
  indisponivel: "Indisponível",
};

const STATUS_CLASS: Record<string, string> = {
  disponivel: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  baixo: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  indisponivel: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const;
const DEFAULT_PAGE_SIZE = 100;

function buildPageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function formatNum(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("pt-BR").format(v);
}

function formatHora(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function EstoqueVirtual() {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [sort, setSort] = useState<SortState<Col> | null>({
    column: "virtual",
    direction: "asc",
  });
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const produtosQuery = useQuery({
    queryKey: ["vw_produtos_estoque_virtual"],
    queryFn: async (): Promise<ProdutoEstoqueVirtual[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_produtos_estoque_virtual")
        .select("codigo,nome,ativo,estoque_real,reservado,estoque_virtual,estoque_minimo,status_venda")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as ProdutoEstoqueVirtual[];
    },
  });

  const syncQuery = useQuery({
    queryKey: ["sync-cursor-bling-estoque"],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from("integracoes_sync_cursor")
        .select("updated_at")
        .eq("sistema", "bling")
        .in("entidade", ["produtos", "estoques"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data?.updated_at ?? null;
    },
  });

  const filtrados = useMemo(() => {
    const lista = produtosQuery.data ?? [];
    const q = busca.trim().toLowerCase();
    const base = lista.filter((p) => {
      if (statusFiltro !== "todos" && p.status_venda !== statusFiltro) return false;
      if (!q) return true;
      return (
        p.codigo?.toLowerCase().includes(q) ||
        p.nome?.toLowerCase().includes(q)
      );
    });
    return ordenarPor<ProdutoEstoqueVirtual, Col>(base, sort, {
      codigo: (p) => p.codigo,
      nome: (p) => p.nome,
      real: (p) => Number(p.estoque_real ?? 0),
      reservado: (p) => Number(p.reservado ?? 0),
      virtual: (p) => Number(p.estoque_virtual ?? 0),
      status: (p) => p.status_venda,
    });
  }, [produtosQuery.data, busca, statusFiltro, sort]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = filtrados.slice(
    (paginaAtual - 1) * pageSize,
    paginaAtual * pageSize,
  );
  const inicioRange = filtrados.length === 0 ? 0 : (paginaAtual - 1) * pageSize + 1;
  const fimRange = Math.min(paginaAtual * pageSize, filtrados.length);
  const pageRange = buildPageRange(paginaAtual, totalPaginas);

  function handleAtualizar() {
    produtosQuery.refetch();
    syncQuery.refetch();
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Comercial" },
          { label: "Estoque Virtual" },
        ]}
        title="Estoque Virtual"
        subtitle={`Estoque sincronizado em: ${formatHora(syncQuery.data)}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleAtualizar}
            disabled={produtosQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", produtosQuery.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <FilterInput
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por código ou nome"
            className="pl-9"
          />
        </div>
        <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={statusFiltro !== "todos"} className="w-[200px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="disponivel">Disponível</SelectItem>
            <SelectItem value="baixo">Baixo</SelectItem>
            <SelectItem value="indisponivel">Indisponível</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtrados.length} {filtrados.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="codigo" sort={sort} onSort={setSort} className="w-[120px]">
                Código
              </SortableTableHead>
              <SortableTableHead column="nome" sort={sort} onSort={setSort}>
                Produto
              </SortableTableHead>
              <SortableTableHead column="real" sort={sort} onSort={setSort} align="right" className="w-[110px]">
                Real
              </SortableTableHead>
              <SortableTableHead column="reservado" sort={sort} onSort={setSort} align="right" className="w-[110px]">
                Reservado
              </SortableTableHead>
              <SortableTableHead column="virtual" sort={sort} onSort={setSort} align="right" className="w-[110px]">
                Virtual
              </SortableTableHead>
              <SortableTableHead column="status" sort={sort} onSort={setSort} className="w-[140px]">
                Status
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produtosQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : pageItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((p) => {
                const virtual = Number(p.estoque_virtual ?? 0);
                return (
                  <TableRow key={p.codigo}>
                    <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNum(p.estoque_real)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNum(p.reservado)}</TableCell>
                    <TableCell className={cn(
                      "text-right tabular-nums font-medium",
                      virtual < 0 && "text-red-600 dark:text-red-400",
                    )}>
                      {formatNum(virtual)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-normal", STATUS_CLASS[p.status_venda])}>
                        {STATUS_LABEL[p.status_venda] ?? p.status_venda}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>
            {filtrados.length === 0
              ? "Nenhum resultado"
              : <>Mostrando <span className="font-medium text-foreground tabular-nums">{inicioRange}</span>–<span className="font-medium text-foreground tabular-nums">{fimRange}</span> de <span className="font-medium text-foreground tabular-nums">{filtrados.length}</span></>}
          </span>
          <span className="hidden sm:inline">·</span>
          <div className="hidden sm:flex items-center gap-1.5">
            <span>Por página:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPagina(1); }}
            >
              <FilterSelectTrigger className="h-8 w-[80px]">
                <SelectValue />
              </FilterSelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina(1)}
              aria-label="Primeira página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {pageRange.map((p, idx) =>
              p === "…" ? (
                <span key={`e-${idx}`} className="px-2 text-muted-foreground select-none">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === paginaAtual ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 min-w-8 px-2 tabular-nums",
                    p === paginaAtual && "pointer-events-none",
                  )}
                  onClick={() => setPagina(p)}
                  aria-current={p === paginaAtual ? "page" : undefined}
                >
                  {p}
                </Button>
              ),
            )}

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina(totalPaginas)}
              aria-label="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
