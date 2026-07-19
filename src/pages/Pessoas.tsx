import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Users, Search, MoreHorizontal, Eye, Edit, Plus, UserCheck, Briefcase, Building2, UserMinus, BarChart3, ClipboardList, AlertTriangle, Wallet, CalendarDays, Network,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { humanizeError } from "@/lib/errorMessages";

interface PessoaLinha {
  pessoa_id: string;
  nome: string;
  foto_url: string | null;
  cpf: string | null;
  vinculo_id: string | null;
  tipo_vinculo: "CLT" | "PJ" | null;
  status: "ativo" | "desligado" | null;
  cargo: string | null;
  departamento: string | null;
  centro_custo_id: string | null;
  centro_custo: string | null;
  data_inicio: string | null;
  incompleto: boolean;
  motivos: string[];
}

const statusStyles: Record<string, string> = {
  ativo: "bg-success/10 text-success border-0",
  desligado: "bg-destructive/10 text-destructive border-0",
};

export default function Pessoas() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tipoFromQuery = searchParams.get("tipo");

  const [linhas, setLinhas] = useState<PessoaLinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>(
    tipoFromQuery === "CLT" || tipoFromQuery === "PJ" ? tipoFromQuery : "todos"
  );
  const [filterStatus, setFilterStatus] = useState("todos");
  const [desligarTarget, setDesligarTarget] = useState<PessoaLinha | null>(null);
  const [dataFim, setDataFim] = useState<string>(new Date().toISOString().slice(0, 10));
  const [desligando, setDesligando] = useState(false);
  const [soloIncompletos, setSoloIncompletos] = useState(false);
  const [filterCC, setFilterCC] = useState("todos");
  const [centrosCusto, setCentrosCusto] = useState<{ id: string; codigo: string; nome: string }[]>([]);

  async function fetchData() {
    setLoading(true);
    try {
      const [{ data: pessoas, error: e1 }, { data: vinculos, error: e2 }, { data: cargos }, { data: deps }] = await Promise.all([
        (supabase as any).from("pessoas").select("id, nome_completo, foto_url, cpf").order("nome_completo"),
        (supabase as any).from("vinculos").select("id, pessoa_id, tipo_vinculo, status, cargo_id, departamento_id, data_inicio").order("data_inicio", { ascending: false }),
        (supabase as any).from("cargos").select("id, nome"),
        (supabase as any).from("departamentos").select("id, nome"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const cargoMap = new Map<string, string>((cargos || []).map((c: any) => [c.id, c.nome]));
      const depMap = new Map<string, string>((deps || []).map((d: any) => [d.id, d.nome]));

      // Escolhe vínculo ativo se existir; senão o mais recente
      const vincPorPessoa = new Map<string, any>();
      for (const v of (vinculos || []) as any[]) {
        const atual = vincPorPessoa.get(v.pessoa_id);
        if (!atual) { vincPorPessoa.set(v.pessoa_id, v); continue; }
        if (atual.status !== "ativo" && v.status === "ativo") vincPorPessoa.set(v.pessoa_id, v);
      }

      const rows: PessoaLinha[] = ((pessoas || []) as any[]).map((p) => {
        const v = vincPorPessoa.get(p.id);
        const cargoResolvido = v?.cargo_id ? cargoMap.get(v.cargo_id) ?? null : null;
        const motivos: string[] = [];
        if (!p.cpf || String(p.cpf).trim() === "") motivos.push("Sem CPF");
        if (!cargoResolvido) motivos.push("Sem cargo");
        return {
          pessoa_id: p.id,
          nome: p.nome_completo,
          foto_url: p.foto_url,
          cpf: p.cpf ?? null,
          vinculo_id: v?.id ?? null,
          tipo_vinculo: v?.tipo_vinculo ?? null,
          status: v?.status ?? null,
          cargo: cargoResolvido,
          departamento: v?.departamento_id ? depMap.get(v.departamento_id) ?? null : null,
          data_inicio: v?.data_inicio ?? null,
          incompleto: motivos.length > 0,
          motivos,
        };
      });
      setLinhas(rows);
    } catch (err: any) {
      toast.error(humanizeError(err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchData(); }, []);

  const totalPessoas = linhas.length;
  const totalAtivos = linhas.filter((l) => l.status === "ativo").length;
  const totalCLT = linhas.filter((l) => l.status === "ativo" && l.tipo_vinculo === "CLT").length;
  const totalPJ = linhas.filter((l) => l.status === "ativo" && l.tipo_vinculo === "PJ").length;
  const totalIncompletos = linhas.filter((l) => l.incompleto).length;

  const filtered = useMemo(() => linhas.filter((l) => {
    const s = search.toLowerCase();
    const matchSearch = !s ||
      l.nome.toLowerCase().includes(s) ||
      (l.cargo || "").toLowerCase().includes(s) ||
      (l.departamento || "").toLowerCase().includes(s);
    const matchTipo = filterTipo === "todos" || l.tipo_vinculo === filterTipo;
    const matchStatus = filterStatus === "todos" ||
      (filterStatus === "ativo" && l.status === "ativo") ||
      (filterStatus === "desligado" && l.status !== "ativo");
    const matchIncompleto = !soloIncompletos || l.incompleto;
    return matchSearch && matchTipo && matchStatus && matchIncompleto;
  }), [linhas, search, filterTipo, filterStatus, soloIncompletos]);



  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  async function confirmarDesligamento() {
    if (!desligarTarget?.vinculo_id) return;
    setDesligando(true);
    try {
      const { error } = await (supabase as any)
        .from("vinculos")
        .update({ status: "desligado", data_fim: dataFim })
        .eq("id", desligarTarget.vinculo_id);
      if (error) throw error;
      toast.success(`${desligarTarget.nome} foi desligado`);
      setDesligarTarget(null);
      void fetchData();
    } catch (err: any) {
      toast.error(humanizeError(err?.message || String(err)));
    } finally {
      setDesligando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pessoas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cadastro unificado de pessoas e seus vínculos com a Fetely
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => navigate("/pessoas/panorama")}>
            <BarChart3 className="h-4 w-4" /> Panorama de Áreas
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => navigate("/pessoas/vagas")}>
            <ClipboardList className="h-4 w-4" /> Vagas
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => navigate("/pessoas/custo")}>
            <Wallet className="h-4 w-4" /> Custo
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => navigate("/pessoas/folha")}>
            <CalendarDays className="h-4 w-4" /> Folha
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => navigate("/pessoas/organograma")}>
            <Network className="h-4 w-4" /> Organograma
          </Button>
          <Button className="gap-2" onClick={() => navigate("/pessoas/novo")}>
            <Plus className="h-4 w-4" /> Nova Pessoa
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-4">
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{totalPessoas}</p><p className="text-xs text-muted-foreground">Total de pessoas</p></div>
        </CardContent></Card>
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success"><UserCheck className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{totalAtivos}</p><p className="text-xs text-muted-foreground">Ativos</p></div>
        </CardContent></Card>
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info"><Building2 className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{totalCLT}</p><p className="text-xs text-muted-foreground">CLT</p></div>
        </CardContent></Card>
        <Card className="card-shadow"><CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning"><Briefcase className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{totalPJ}</p><p className="text-xs text-muted-foreground">PJ</p></div>
        </CardContent></Card>
      </div>

      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, cargo ou departamento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="CLT">CLT</SelectItem>
                <SelectItem value="PJ">PJ</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="desligado">Desligado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {totalIncompletos > 0 && (
            <div className="mb-4">
              <Button
                type="button"
                size="sm"
                variant={soloIncompletos ? "default" : "outline"}
                onClick={() => setSoloIncompletos((v) => !v)}
                className={soloIncompletos ? "gap-2 bg-warning text-warning-foreground hover:bg-warning/90" : "gap-2 border-warning/40 text-warning hover:bg-warning/10"}
              >
                <AlertTriangle className="h-4 w-4" />
                {totalIncompletos} cadastro(s) incompleto(s)
                {soloIncompletos && <span className="text-xs opacity-80">· filtrando</span>}
              </Button>
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Nome</TableHead>
                  <TableHead className="font-semibold">Tipo</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">Cargo</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Departamento</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Início</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma pessoa encontrada.</TableCell></TableRow>
                ) : filtered.map((p) => (
                  <TableRow key={p.pessoa_id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/pessoas/${p.pessoa_id}/editar`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={p.foto_url || undefined} alt={p.nome} className="object-cover" />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials(p.nome)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{p.nome}</span>
                        {p.incompleto && (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className="border-warning/40 bg-warning/10 text-warning gap-1 h-5 px-1.5 text-[10px] font-semibold"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Incompleto
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>{p.motivos.join(", ")}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.tipo_vinculo ? (
                        <Badge className={p.tipo_vinculo === "CLT"
                          ? "bg-info text-info-foreground hover:bg-info/90 font-bold border-0"
                          : "bg-warning text-warning-foreground hover:bg-warning/90 font-bold border-0"}>
                          {p.tipo_vinculo}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{p.cargo || "—"}</TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">{p.departamento || "—"}</TableCell>
                    <TableCell>
                      {p.status ? (
                        <Badge variant="outline" className={statusStyles[p.status] || ""}>
                          {p.status === "ativo" ? "Ativo" : "Desligado"}
                        </Badge>
                      ) : <Badge variant="outline" className="bg-muted text-muted-foreground border-0">Sem vínculo</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                      {p.data_inicio ? format(parseISO(p.data_inicio), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/pessoas/${p.pessoa_id}/editar`)}>
                            <Eye className="mr-2 h-4 w-4" /> Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/pessoas/${p.pessoa_id}/editar`)}>
                            <Edit className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          {p.status === "ativo" && p.vinculo_id && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => { e.stopPropagation(); setDesligarTarget(p); setDataFim(new Date().toISOString().slice(0, 10)); }}
                            >
                              <UserMinus className="mr-2 h-4 w-4" /> Desligar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-muted-foreground">Mostrando {filtered.length} de {linhas.length} pessoas</p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!desligarTarget} onOpenChange={(open) => { if (!open && !desligando) setDesligarTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar {desligarTarget?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O vínculo ativo será marcado como <strong>desligado</strong> e a pessoa continuará na base como histórico. Esta ação não apaga dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="data-fim">Data do desligamento</Label>
            <Input id="data-fim" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desligando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmarDesligamento(); }}
              disabled={desligando || !dataFim}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {desligando ? "Desligando..." : "Confirmar desligamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
