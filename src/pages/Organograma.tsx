import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/layout/PageShell";
import { useOrganograma } from "@/hooks/useOrganograma";
import { OrgToolbar } from "@/components/organograma/OrgToolbar";
import { OrgVisualView } from "@/components/organograma/OrgVisualView";
import { OrgSyntheticView } from "@/components/organograma/OrgSyntheticView";
import { OrgAnalyticView } from "@/components/organograma/OrgAnalyticView";
import { OrgNodeDrawer } from "@/components/organograma/OrgNodeDrawer";
import { OrgPosicaoModal } from "@/components/organograma/OrgPosicaoModal";
import { OrgMoveConfirmDialog } from "@/components/organograma/OrgMoveConfirmDialog";
import { OrgListaView } from "@/components/organograma/OrgListaView";
import { OrgLenteBreadcrumb } from "@/components/organograma/OrgLenteBreadcrumb";
import type { ViewMode, OrgFilters, PosicaoNode } from "@/types/organograma";

function filterTree(nodes: PosicaoNode[], filters: OrgFilters): PosicaoNode[] {
  function matchNode(n: PosicaoNode): boolean {
    if (filters.departamento !== "todos" && n.departamento !== filters.departamento) return false;
    if (filters.filial !== "todos" && n.filial !== filters.filial) return false;
    if (filters.vinculo !== "todos" && n.vinculo !== filters.vinculo) return false;
    if (filters.status !== "todos" && n.status !== filters.status) return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const match = n.nome_display.toLowerCase().includes(s) || n.titulo_cargo.toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  }

  function filterNode(node: PosicaoNode): PosicaoNode | null {
    const filteredChildren = node.children.map(filterNode).filter(Boolean) as PosicaoNode[];
    if (matchNode(node) || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  return nodes.map(filterNode).filter(Boolean) as PosicaoNode[];
}

function podarNivel(nodes: PosicaoNode[], maxNiveis: number, baseDepth: number): PosicaoNode[] {
  function walk(node: PosicaoNode): PosicaoNode | null {
    if (node.depth - baseDepth >= maxNiveis) return null;
    return { ...node, children: node.children.map(walk).filter(Boolean) as PosicaoNode[] };
  }
  return nodes.map(walk).filter(Boolean) as PosicaoNode[];
}

function flattenFiltered(nodes: PosicaoNode[]): PosicaoNode[] {
  const result: PosicaoNode[] = [];
  function walk(n: PosicaoNode) { result.push(n); n.children.forEach(walk); }
  nodes.forEach(walk);
  return result;
}

export default function Organograma() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewMode = (searchParams.get("view") as ViewMode) || "visual";
  const { data, isLoading } = useOrganograma();

  const [filters, setFilters] = useState<OrgFilters>({
    search: searchParams.get("search") || "",
    departamento: searchParams.get("dept") || "todos",
    filial: searchParams.get("filial") || "todos",
    vinculo: searchParams.get("vinculo") || "todos",
    status: searchParams.get("status") || "todos",
    nivel: searchParams.get("nivel") || "todos",
    lider: searchParams.get("lider") || "todos",
  });

  const [selectedNode, setSelectedNode] = useState<PosicaoNode | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editNode, setEditNode] = useState<PosicaoNode | null>(null);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movedNode, setMovedNode] = useState<PosicaoNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<PosicaoNode | null>(null);

  // Espelha filtros na URL (link compartilhavel). Preserva "view".
  useEffect(() => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      const aplicar = (chave: string, valor: string, padrao: string) => {
        if (valor && valor !== padrao) p.set(chave, valor);
        else p.delete(chave);
      };
      aplicar("search", filters.search, "");
      aplicar("dept", filters.departamento, "todos");
      aplicar("filial", filters.filial, "todos");
      aplicar("vinculo", filters.vinculo, "todos");
      aplicar("status", filters.status, "todos");
      aplicar("nivel", filters.nivel, "todos");
      aplicar("lider", filters.lider, "todos");
      return p;
    }, { replace: true });
  }, [filters, setSearchParams]);

  const setViewMode = (v: ViewMode) => {
    setSearchParams(prev => { prev.set("view", v); return prev; });
  };

  const handleNodeClick = useCallback((node: PosicaoNode) => {
    setSelectedNode(node);
    setDrawerOpen(true);
  }, []);

  const handleCreatePosition = () => {
    setEditNode(null);
    setModalOpen(true);
  };

  const handleEditPosition = useCallback((node: PosicaoNode) => {
    setEditNode(node);
    setModalOpen(true);
    setDrawerOpen(false);
  }, []);

  const handleMoveRequest = useCallback((movedId: string, newParentId: string) => {
    if (!data) return;
    const moved = data.flat.find(n => n.id === movedId);
    const target = data.flat.find(n => n.id === newParentId);
    if (moved && target && moved.id_pai !== target.id) {
      setMovedNode(moved);
      setMoveTarget(target);
      setMoveDialogOpen(true);
    }
  }, [data]);

  // LENTE: re-enraiza a arvore no lider escolhido (nao e filtro, e troca de raiz)
  const lenteNode = useMemo(() => {
    if (!data || filters.lider === "todos") return null;
    return data.flat.find(n => n.id === filters.lider) || null;
  }, [data, filters.lider]);

  // Se o lider da URL nao existe mais, limpa a lente
  useEffect(() => {
    if (data && filters.lider !== "todos" && !lenteNode) {
      setFilters(f => ({ ...f, lider: "todos" }));
    }
  }, [data, filters.lider, lenteNode]);

  const trilhaLente = useMemo(() => {
    if (!data || !lenteNode) return [] as PosicaoNode[];
    const porId = new Map(data.flat.map(n => [n.id, n]));
    const cadeia: PosicaoNode[] = [];
    const vistos = new Set<string>();
    let atual = lenteNode.id_pai ? porId.get(lenteNode.id_pai) : undefined;
    while (atual && !vistos.has(atual.id)) {
      vistos.add(atual.id);
      cadeia.unshift(atual);
      atual = atual.id_pai ? porId.get(atual.id_pai) : undefined;
    }
    return cadeia;
  }, [data, lenteNode]);

  const filteredTree = useMemo(() => {
    if (!data) return [];
    const baseTree = lenteNode ? [lenteNode] : data.tree;
    const baseDepth = lenteNode ? lenteNode.depth : 0;

    const temFiltroAtributo =
      filters.search ||
      filters.departamento !== "todos" ||
      filters.filial !== "todos" ||
      filters.vinculo !== "todos" ||
      filters.status !== "todos";

    let resultado = temFiltroAtributo ? filterTree(baseTree, filters) : baseTree;

    if (filters.nivel !== "todos") {
      const maxNiveis = parseInt(filters.nivel, 10);
      if (!Number.isNaN(maxNiveis) && maxNiveis > 0) {
        resultado = podarNivel(resultado, maxNiveis, baseDepth);
      }
    }

    return resultado;
  }, [data, filters, lenteNode]);

  const filteredFlat = useMemo(() => flattenFiltered(filteredTree), [filteredTree]);

  const setLider = useCallback((id: string) => {
    setFilters(f => ({ ...f, lider: id }));
  }, []);

  if (isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <OrgToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filters={filters}
        onFiltersChange={setFilters}
        allNodes={data?.flat || []}
        onCreatePosition={handleCreatePosition}
      />

      {lenteNode && (
        <OrgLenteBreadcrumb
          no={lenteNode}
          trilha={trilhaLente}
          onSelecionar={setLider}
          onLimpar={() => setLider("todos")}
        />
      )}

      {viewMode === "visual" && (
        <OrgVisualView
          tree={filteredTree}
          filters={filters}
          onNodeClick={handleNodeClick}
          onMoveRequest={handleMoveRequest}
        />
      )}
      {viewMode === "sintetico" && (
        <OrgSyntheticView tree={filteredTree} flat={filteredFlat} filters={filters} onNodeClick={handleNodeClick} />
      )}
      {viewMode === "analitico" && (
        <OrgAnalyticView flat={filteredFlat} filters={filters} />
      )}
      {viewMode === "lista" && (
        <OrgListaView tree={filteredTree} onNodeClick={handleNodeClick} />
      )}

      <OrgNodeDrawer
        node={selectedNode}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        allNodes={data?.flat || []}
        onEditPosition={handleEditPosition}
      />

      <OrgPosicaoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editNode={editNode}
        allNodes={data?.flat || []}
      />

      <OrgMoveConfirmDialog
        open={moveDialogOpen}
        onClose={() => setMoveDialogOpen(false)}
        movedNode={movedNode}
        newParent={moveTarget}
        allNodes={data?.flat || []}
      />
    </PageShell>
  );
}
