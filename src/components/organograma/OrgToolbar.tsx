import { Search, RotateCcw, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import type { ViewMode, OrgFilters, PosicaoNode } from "@/types/organograma";

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  filters: OrgFilters;
  onFiltersChange: (f: OrgFilters) => void;
  allNodes: PosicaoNode[];
  onCreatePosition?: () => void;
}

export function OrgToolbar({ viewMode, onViewModeChange, filters, onFiltersChange, allNodes, onCreatePosition }: Props) {
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["super_admin", "gestor_rh"]);
  const departamentos = [...new Set(allNodes.map(n => n.departamento).filter(Boolean).filter(d => d.trim() !== ""))].sort();
  const filiais = [...new Set(allNodes.map(n => n.filial).filter(Boolean).filter(f => (f as string).trim() !== ""))].sort();

  // Lideres = posicoes com pelo menos um subordinado direto
  const lideres = allNodes
    .filter(n => n.subordinados_diretos > 0)
    .sort((a, b) => {
      if (b.subordinados_totais !== a.subordinados_totais) return b.subordinados_totais - a.subordinados_totais;
      const na = a.nome_display?.trim() || a.titulo_cargo;
      const nb = b.nome_display?.trim() || b.titulo_cargo;
      return na.localeCompare(nb, "pt-BR");
    });

  const profundidadeMax = allNodes.reduce((m, n) => Math.max(m, n.depth), 0) + 1;
  const opcoesNivel = Array.from({ length: Math.max(profundidadeMax, 1) }, (_, i) => i + 1);

  const resetFilters = () => onFiltersChange({
    search: "", departamento: "todos", filial: "todos", vinculo: "todos", status: "todos", nivel: "todos", lider: "todos",
  });

  const hasFilter =
    filters.search ||
    filters.departamento !== "todos" ||
    filters.filial !== "todos" ||
    filters.vinculo !== "todos" ||
    filters.status !== "todos" ||
    filters.nivel !== "todos" ||
    filters.lider !== "todos";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Organograma</h1>
          <p className="text-sm text-muted-foreground">Estrutura organizacional da empresa</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && onCreatePosition && (
            <Button size="sm" onClick={onCreatePosition} className="h-9">
              <Plus className="h-3.5 w-3.5 mr-1" /> Nova Posição
            </Button>
          )}
          <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="visual">🌳 Visual</TabsTrigger>
              <TabsTrigger value="sintetico">📋 Sintético</TabsTrigger>
              <TabsTrigger value="analitico">📊 Analítico</TabsTrigger>
              <TabsTrigger value="lista">📄 Lista</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou cargo..."
            className="pl-9 h-9"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          />
        </div>

        <Select value={filters.lider} onValueChange={(v) => onFiltersChange({ ...filters, lider: v })}>
          <SelectTrigger className="w-[230px] h-9"><SelectValue placeholder="Ver equipe de…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Empresa toda</SelectItem>
            {lideres.map(l => (
              <SelectItem key={l.id} value={l.id}>
                {(l.nome_display?.trim() || l.titulo_cargo)} · {l.titulo_cargo} ({l.subordinados_diretos})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.nivel} onValueChange={(v) => onFiltersChange({ ...filters, nivel: v })}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Níveis" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos níveis</SelectItem>
            {opcoesNivel.map(n => (
              <SelectItem key={n} value={String(n)}>Até nível {n}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.departamento} onValueChange={(v) => onFiltersChange({ ...filters, departamento: v })}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Departamento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Deptos</SelectItem>
            {departamentos.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.filial} onValueChange={(v) => onFiltersChange({ ...filters, filial: v })}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Filial" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas Filiais</SelectItem>
            {filiais.map(f => <SelectItem key={f!} value={f!}>{f}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.vinculo} onValueChange={(v) => onFiltersChange({ ...filters, vinculo: v })}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Vínculo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="CLT">CLT</SelectItem>
            <SelectItem value="PJ">PJ</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(v) => onFiltersChange({ ...filters, status: v })}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Status</SelectItem>
            <SelectItem value="ocupado">Ocupado</SelectItem>
            <SelectItem value="vaga_aberta">Vaga Aberta</SelectItem>
            <SelectItem value="previsto">Previsto</SelectItem>
          </SelectContent>
        </Select>

        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
