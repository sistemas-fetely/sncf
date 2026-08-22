import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Plus, Search, MoreHorizontal, Eye, Edit, Trash2,
  UserCheck, Briefcase, DollarSign,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useParametrosFolha } from "@/hooks/useParametrosFolha";
import { SalarioMasked } from "@/components/SalarioMasked";

type ColaboradorRow = Tables<"colaboradores_clt">;
import { format, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

const statusMap: Record<string, string> = {
  ativo: "Ativo",
  ferias: "Férias",
  afastado: "Afastado",
  experiencia: "Experiência",
  desligado: "Desligado",
};

const statusStyles: Record<string, string> = {
  ativo: "bg-success/10 text-success border-0",
  ferias: "bg-info/10 text-info border-0",
  afastado: "bg-warning/10 text-warning border-0",
  experiencia: "bg-info/10 text-info border-0",
  desligado: "bg-destructive/10 text-destructive border-0",
};

export default function Colaboradores() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterDept, setFilterDept] = useState("todos");
  const [colaboradores, setColaboradores] = useState<ColaboradorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ColaboradorRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const { data: cols } = await supabase
        .from("colaboradores_clt")
        .select("*")
        .order("nome_completo");
      if (cols) {
        setColaboradores(cols);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Delete related records first, then the collaborator
      await supabase.from("colaborador_departamentos").delete().eq("colaborador_id", deleteTarget.id);
      await supabase.from("dependentes").delete().eq("colaborador_id", deleteTarget.id);
      const { error } = await supabase.from("colaboradores_clt").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setColaboradores((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success(`${deleteTarget.nome_completo} foi excluído com sucesso.`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir colaborador");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const allDepartamentos = Array.from(
    new Set(colaboradores.map((c) => c.departamento).filter(Boolean))
  ).sort();

  const filtered = colaboradores.filter((c) => {
    const matchSearch =
      c.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
      c.cargo.toLowerCase().includes(search.toLowerCase()) ||
      c.departamento.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || c.status === filterStatus;
    const matchDept = filterDept === "todos" || c.departamento === filterDept;
    return matchSearch && matchStatus && matchDept;
  });

  const ativos = colaboradores.filter((c) => c.status !== "desligado");
  const totalAtivos = ativos.length;
  const totalInativos = colaboradores.filter((c) => c.status === "desligado").length;

  const { data: parametrosFolha } = useParametrosFolha();
  const ENCARGOS_RATE = (parametrosFolha?.aliquotaFGTS ?? 0.08) + (parametrosFolha?.aliquotaINSSPatronal ?? 0.20);
  const totalSalarios = ativos.reduce((s, c) => s + (c.salario_base || 0), 0);
  const totalEncargos = totalSalarios * ENCARGOS_RATE;
  const totalCustoMensal = totalSalarios + totalEncargos;

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <PageShell>
      <PageHeader
        titulo="Colaboradores"
        estado="Gerenciamento de colaboradores CLT e PJ"
        acoes={
          <Button className="gap-2" onClick={() => navigate("/colaboradores/novo")}>
            <Plus className="h-4 w-4" />
            Novo Colaborador
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-medium">{colaboradores.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-medium">{totalAtivos}</p>
              <p className="text-xs text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-medium">{totalInativos}</p>
              <p className="text-xs text-muted-foreground">Inativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-medium">{fmtBRL(totalCustoMensal)}</p>
              <p className="text-xs text-muted-foreground">Custo mensal (salário + encargos)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, cargo ou departamento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="ferias">Férias</SelectItem>
                <SelectItem value="afastado">Afastado</SelectItem>
                <SelectItem value="experiencia">Experiência</SelectItem>
                <SelectItem value="desligado">Desligado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os departamentos</SelectItem>
                {allDepartamentos.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-medium">Nome</TableHead>
                  <TableHead className="font-medium">Cargo</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">Departamento</TableHead>
                  <TableHead className="font-medium">Contrato</TableHead>
                  <TableHead className="font-medium">Status</TableHead>
                   <TableHead className="font-medium hidden lg:table-cell">Admissão</TableHead>
                   <TableHead className="font-medium hidden lg:table-cell text-right">Salário</TableHead>
                   <TableHead className="font-medium hidden xl:table-cell text-right">Sal. + Encargos</TableHead>
                   <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                     <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                     <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhum colaborador encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/colaboradores/${c.id}`, { state: { from: "/colaboradores" } })}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={c.foto_url || undefined} alt={c.nome_completo} className="object-cover" />
                            <AvatarFallback className="bg-muted text-foreground text-xs font-medium">
                              {initials(c.nome_completo)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{c.nome_completo}</p>
                            <p className="text-xs text-muted-foreground md:hidden">{c.departamento}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{c.cargo}</TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        {c.departamento}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-muted text-foreground border-0 capitalize">
                          {c.tipo_contrato}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusStyles[c.status] || ""}>
                          {statusMap[c.status] || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                        {format(parseISO(c.data_admissao), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-sm font-mono text-right hidden lg:table-cell">
                        <SalarioMasked
                          valor={c.salario_base}
                          userId={(c as any).user_id}
                          contexto="admissao"
                        />
                      </TableCell>
                      <TableCell className="text-sm font-mono text-right hidden xl:table-cell">
                        <SalarioMasked
                          valor={c.salario_base * (1 + ENCARGOS_RATE)}
                          userId={(c as any).user_id}
                          contexto="admissao"
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/colaboradores/${c.id}`, { state: { from: "/colaboradores" } })}><Eye className="mr-2 h-4 w-4" /> Visualizar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/colaboradores/${c.id}?edit=true`, { state: { from: "/colaboradores" } })}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-muted-foreground">
              Mostrando {filtered.length} de {colaboradores.length} colaboradores
            </p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.nome_completo}</strong>?
              Esta ação não pode ser desfeita. Todos os dados do colaborador, departamentos e dependentes serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
