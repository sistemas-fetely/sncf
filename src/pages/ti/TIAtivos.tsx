import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, MoreHorizontal, Search, Pencil, UserPlus, UserMinus, Trash2, Package } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import TIAtivoForm from "./TIAtivoForm";
import { useAuth } from "@/contexts/AuthContext";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

const TI_COLOR = "#3A7D6B";

interface Ativo {
  id: string;
  tipo: string;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  numero_patrimonio: string | null;
  hostname: string | null;
  status: string;
  estado: string;
  condicao: string | null;
  em_manutencao: boolean | null;
  colaborador_id: string | null;
  colaborador_tipo: string | null;
  colaborador_nome: string | null;
  localizacao: string | null;
  atribuido_em: string | null;
}

const condicaoVariant: Record<string, { label: string; className: string }> = {
  otima: { label: "Ótima", className: "bg-success/10 text-success border-0" },
  muito_boa: { label: "Muito Boa", className: "bg-info/10 text-info border-0" },
  boa: { label: "Boa", className: "bg-warning/10 text-warning border-0" },
  inativo: { label: "Inativo", className: "bg-destructive/10 text-destructive border-0" },
};

const statusVariant: Record<string, { label: string; className: string }> = {
  disponivel: { label: "Disponível", className: "bg-success/10 text-success border-0" },
  atribuido: { label: "Atribuído", className: "bg-info/10 text-info border-0" },
  descartado: { label: "Descartado", className: "bg-muted/10 text-muted-foreground border-0" },
};

export default function TIAtivos() {
  const { user } = useAuth();
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [tiposDisponiveis, setTiposDisponiveis] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ti_ativos")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar ativos", description: error.message, variant: "destructive" });
    } else if (data) {
      setAtivos(data as unknown as Ativo[]);
      const tipos = Array.from(new Set(data.map((a) => a.tipo).filter(Boolean)));
      setTiposDisponiveis(tipos);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleNovo = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const handleEditar = (id: string) => {
    setEditingId(id);
    setFormOpen(true);
  };

  const registrarHistorico = async (
    ativo_id: string,
    acao: string,
    extras: Partial<{ de_colaborador: string; para_colaborador: string; observacoes: string }> = {}
  ) => {
    await supabase.from("ti_ativos_historico").insert({
      ativo_id,
      acao,
      responsavel_id: user?.id,
      ...extras,
    });
  };

  const handleDevolver = async (ativo: Ativo) => {
    const { error } = await supabase
      .from("ti_ativos")
      .update({
        status: "disponivel",
        colaborador_id: null,
        colaborador_tipo: null,
        colaborador_nome: null,
        devolvido_em: new Date().toISOString().split("T")[0],
      })
      .eq("id", ativo.id);
    if (error) {
      toast({ title: "Erro ao devolver", description: error.message, variant: "destructive" });
      return;
    }
    await registrarHistorico(ativo.id, "devolucao", { de_colaborador: ativo.colaborador_nome || undefined });
    toast({ title: "Ativo devolvido" });
    void load();
  };

  // Manutenção é registrada via ManutencoesSection (dentro do form do ativo)

  const handleDescartar = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("ti_ativos").update({ status: "descartado" }).eq("id", deleteId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    await registrarHistorico(deleteId, "descarte");
    toast({ title: "Ativo descartado" });
    setDeleteId(null);
    void load();
  };

  const filtered = ativos.filter((a) => {
    if (filterTipo !== "todos" && a.tipo !== filterTipo) return false;
    if (filterStatus !== "todos" && a.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = [a.marca, a.modelo, a.numero_serie, a.numero_patrimonio, a.hostname, a.colaborador_nome]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <PageShell>
      <PageHeader
        titulo="Gestão de Ativos"
        estado="Inventário e movimentação de equipamentos"
        acoes={(
          <Button onClick={handleNovo} style={{ backgroundColor: TI_COLOR }} className="text-white hover:opacity-90">
            <Plus className="h-4 w-4 mr-2" />
            Novo Ativo
          </Button>
        )}
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por marca, modelo, série, patrimônio…"
                className="pl-9"
              />
            </div>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {tiposDisponiveis.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="atribuido">Atribuído</SelectItem>
                <SelectItem value="descartado">Descartado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {ativos.length === 0 ? "Nenhum ativo cadastrado. Comece adicionando o primeiro." : "Nenhum ativo encontrado com os filtros aplicados."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Marca / Modelo</TableHead>
                  <TableHead>Nº Série</TableHead>
                  <TableHead>Nº Patrimônio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const v = statusVariant[a.status] || statusVariant.disponivel;
                  const c = condicaoVariant[a.condicao || "otima"] || condicaoVariant.otima;
                  return (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleEditar(a.id)}
                    >
                      <TableCell className="capitalize font-medium">{a.tipo}</TableCell>
                      <TableCell>{[a.marca, a.modelo].filter(Boolean).join(" ") || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{a.numero_serie || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{a.numero_patrimonio || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className={v.className}>{v.label}</Badge>
                          {a.em_manutencao && (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-0 text-[10px]">
                              🔧 Manutenção
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={c.className}>{c.label}</Badge>
                      </TableCell>
                      <TableCell>{a.colaborador_nome || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.localizacao || "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditar(a.id)}>
                              <Pencil className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            {a.status === "disponivel" && (
                              <DropdownMenuItem onClick={() => handleEditar(a.id)}>
                                <UserPlus className="h-4 w-4 mr-2" /> Atribuir a colaborador
                              </DropdownMenuItem>
                            )}
                            {a.status === "atribuido" && (
                              <DropdownMenuItem onClick={() => handleDevolver(a)}>
                                <UserMinus className="h-4 w-4 mr-2" /> Devolver
                              </DropdownMenuItem>
                            )}
                            {/* Manutenção é gerenciada na ficha do ativo (seção Manutenções) */}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeleteId(a.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" /> Descartar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TIAtivoForm
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) void load();
        }}
        ativoId={editingId}
        onSaved={() => {
          setFormOpen(false);
          void load();
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar ativo?</AlertDialogTitle>
            <AlertDialogDescription>
              O ativo será marcado como descartado e não poderá mais ser atribuído. O histórico será preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDescartar} className="bg-destructive hover:bg-destructive/90">
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
