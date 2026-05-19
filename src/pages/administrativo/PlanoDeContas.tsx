import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  ListTree,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { CategoriaFormDialog } from "@/components/financeiro/CategoriaFormDialog";
import { CategoriaOption } from "@/components/financeiro/CategoriaCombobox";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Conta = {
  id: string;
  codigo: string;
  nome: string;
  parent_id: string | null;
  nivel: number;
  tipo: string;
  natureza: string | null;
  centro_custo_id: string | null;
  ativo: boolean;
};

type Node = Conta & { children: Node[] };

const TIPO_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  receita: { bg: "bg-[#1A4A3A]", text: "text-white", label: "Receita" },
  despesa: { bg: "bg-[#8B1A2F]", text: "text-white", label: "Despesa" },
  investimento: { bg: "bg-[#2563EB]", text: "text-white", label: "Investimento" },
  imposto: { bg: "bg-[#D97706]", text: "text-white", label: "Imposto" },
};

function buildTree(items: Conta[]): Node[] {
  const map = new Map<string, Node>();
  items.forEach((i) => map.set(i.id, { ...i, children: [] }));
  const roots: Node[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: Node[]) => {
    nodes.sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function filterTree(nodes: Node[], term: string, tipoFilter: string): Node[] {
  const t = term.trim().toLowerCase();
  const matches = (n: Node) =>
    (!t || n.nome.toLowerCase().includes(t) || n.codigo.toLowerCase().includes(t)) &&
    (tipoFilter === "todos" || n.tipo === tipoFilter);

  const recurse = (list: Node[]): Node[] => {
    const out: Node[] = [];
    for (const n of list) {
      const filteredChildren = recurse(n.children);
      if (matches(n) || filteredChildren.length > 0) {
        out.push({ ...n, children: filteredChildren });
      }
    }
    return out;
  };
  return recurse(nodes);
}

interface NodeItemProps {
  node: Node;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  forceOpen: boolean;
  onAddChild: (parent: Conta) => void;
  onEdit: (conta: Conta) => void;
  onDelete: (conta: Conta) => void;
  canManage: boolean;
}

function NodeItem({
  node,
  depth,
  expanded,
  toggle,
  forceOpen,
  onAddChild,
  onEdit,
  onDelete,
  canManage,
}: NodeItemProps) {
  const isOpen = forceOpen || expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const tipoStyle = TIPO_STYLES[node.tipo] || {
    bg: "bg-muted",
    text: "text-foreground",
    label: node.tipo,
  };

  return (
    <div>
      <div
        className="group flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => toggle(node.id)}
            className="p-0.5 hover:bg-muted rounded"
            aria-label={isOpen ? "Recolher" : "Expandir"}
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-5" />
        )}
        <span className="font-mono text-xs text-muted-foreground">{node.codigo}</span>
        <button
          className="flex-1 text-left text-sm hover:underline"
          onClick={() => canManage && onEdit(node)}
          disabled={!canManage}
        >
          {node.nome}
        </button>
        {hasChildren && (
          <span className="text-xs text-muted-foreground">
            {node.children.length} {node.children.length === 1 ? "filho" : "filhos"}
          </span>
        )}
        <Badge className={`${tipoStyle.bg} ${tipoStyle.text} hover:${tipoStyle.bg}`}>
          {tipoStyle.label}
        </Badge>
        {canManage && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1 hover:bg-muted rounded"
              title="Adicionar subcategoria"
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(node);
              }}
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              className="p-1 hover:bg-muted rounded"
              title="Editar"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(node);
              }}
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              className="p-1 hover:bg-destructive/10 rounded"
              title="Excluir"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          </div>
        )}
      </div>
      {isOpen &&
        node.children.map((c) => (
          <NodeItem
            key={c.id}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            forceOpen={forceOpen}
            onAddChild={onAddChild}
            onEdit={onEdit}
            onDelete={onDelete}
            canManage={canManage}
          />
        ))}
    </div>
  );
}

export default function PlanoDeContas() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = roles.includes("super_admin");

  const [busca, setBusca] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Conta | null>(null);
  const [defaultParent, setDefaultParent] = useState<string | null>(null);

  // Delete confirm
  const [deleting, setDeleting] = useState<Conta | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["plano-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plano_contas")
        .select("id,codigo,nome,parent_id,nivel,tipo,natureza,centro_custo_id,ativo")
        .order("codigo");
      if (error) throw error;
      return data as Conta[];
    },
  });

  const tree = useMemo(() => buildTree(data || []), [data]);
  const filtered = useMemo(
    () => filterTree(tree, busca, tipoFilter),
    [tree, busca, tipoFilter]
  );

  const options: CategoriaOption[] = useMemo(
    () =>
      (data || []).map((d) => ({
        id: d.id,
        codigo: d.codigo,
        nome: d.nome,
        nivel: d.nivel,
        parent_id: d.parent_id,
      })),
    [data]
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNew = () => {
    setEditing(null);
    setDefaultParent(null);
    setFormOpen(true);
  };

  const handleAddChild = (parent: Conta) => {
    setEditing(null);
    setDefaultParent(parent.id);
    setFormOpen(true);
  };

  const handleEdit = (conta: Conta) => {
    setEditing(conta);
    setDefaultParent(null);
    setFormOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleting) return;
      // 1) Block if has children
      const hasChildren = (data || []).some((c) => c.parent_id === deleting.id);
      if (hasChildren) {
        throw new Error("Esta categoria tem subcategorias. Remova-as antes de excluir.");
      }
      // 2) Block if has lancamentos linked
      const { count, error: countErr } = await supabase
        .from("contas_pagar_receber")
        .select("id", { count: "exact", head: true })
        .eq("plano_contas_id", deleting.id);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) {
        throw new Error(`Esta categoria tem ${count} lançamento(s) vinculado(s). Remova-os antes de excluir.`);
      }
      const { error } = await supabase.from("plano_contas").delete().eq("id", deleting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria excluída");
      qc.invalidateQueries({ queryKey: ["plano-contas"] });
      setDeleting(null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const isSearching = busca.trim().length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ListTree className="h-6 w-6 text-admin" />
            Plano de Contas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Estrutura hierárquica de receitas, custos e despesas da Fetely.
          </p>
        </div>
        {canManage && (
          <Button onClick={handleNew} className="gap-2 bg-admin hover:bg-admin/90 text-admin-foreground">
            <Plus className="h-4 w-4" />
            Nova categoria
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou código..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1">
              {(["todos", "receita", "despesa", "investimento", "imposto"] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={tipoFilter === t ? "default" : "outline"}
                  onClick={() => setTipoFilter(t)}
                  className="capitalize"
                >
                  {t === "todos" ? "Todos" : t}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (data || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-admin-muted">
                <Upload className="h-8 w-8 text-admin" />
              </div>
              <div className="max-w-md">
                <p className="text-lg font-semibold">Sem plano de contas cadastrado</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Crie sua primeira categoria ou sincronize com o Bling.
                </p>
              </div>
              <div className="flex gap-2">
                {canManage && (
                  <Button onClick={handleNew} className="bg-admin hover:bg-admin/90 text-admin-foreground">
                    <Plus className="h-4 w-4 mr-2" />
                    Nova categoria
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link to="/administrativo/importar">
                    <Upload className="h-4 w-4 mr-2" />
                    Importar
                  </Link>
                </Button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma conta encontrada para os filtros aplicados.
            </div>
          ) : (
            <div className="border rounded-md divide-y">
              {filtered.map((n) => (
                <NodeItem
                  key={n.id}
                  node={n}
                  depth={0}
                  expanded={expanded}
                  toggle={toggle}
                  forceOpen={isSearching}
                  onAddChild={handleAddChild}
                  onEdit={handleEdit}
                  onDelete={setDeleting}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CategoriaFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        options={options}
        defaultParentId={defaultParent}
        editing={editing}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  Tem certeza que deseja excluir <strong>{deleting.codigo} — {deleting.nome}</strong>?
                  <br />
                  Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
