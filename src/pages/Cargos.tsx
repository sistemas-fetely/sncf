import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAllCargos, type Cargo } from "@/hooks/useCargos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock, Plus, Search, Pencil, Sparkles, MoreHorizontal, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
const nivelLabels: Record<string, string> = {
  jr: "Júnior", pl: "Pleno", sr: "Sênior",
  coordenacao: "Coordenação", especialista: "Especialista", c_level: "C-Level",
};
const tipoLabels: Record<string, string> = {
  clt: "CLT", pj: "PJ", ambos: "CLT + PJ",
};

function fmt(val: number | null) {
  if (val == null) return "—";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

const SKILLS_CATALOGO = [
  "React / TypeScript","Node.js","Python","SQL / PostgreSQL","APIs REST","Git",
  "Design Gráfico","UX/UI","Motion Design","Design de Produto",
  "Identidade Visual","Design de Embalagem","Direção de Arte",
  "Marketing Digital","SEO","Copywriting","Gestão de Mídias Sociais",
  "Tráfego Pago","Branding","Email Marketing",
  "Vendas B2B","Negociação","Key Account Management","Trade Marketing",
  "Supply Chain","Logística","Importação / Exportação","Gestão de Estoque",
  "Controle de Qualidade","Gestão de Times","Planejamento Estratégico",
  "Análise de Dados","Recrutamento & Seleção","Folha de Pagamento",
  "Legislação CLT","eSocial","HRBP","Gestão de Projetos","OKRs / KPIs",
];

const FERRAMENTAS_CATALOGO = [
  "Figma","Adobe Creative Suite","Slack","Jira","Confluence","Google Workspace",
  "Microsoft 365","Notion","Miro","Trello","HubSpot","Salesforce","SAP",
  "TOTVS","Power BI","Tableau","Excel Avançado","VS Code","GitHub","Docker",
];

/* ─── Drawer Component ─── */
function CargoDrawer({ cargo, onClose }: { cargo: Cargo; onClose: () => void }) {
  const navigate = useNavigate();

  const faixas = [
    { key: "F1", label: "Entrada" },
    { key: "F2", label: "Desenvolvimento" },
    { key: "F3", label: "Pleno" },
    { key: "F4", label: "Sênior" },
    { key: "F5", label: "Referência" },
  ];

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {cargo.nome}
            {cargo.protege_salario && (
              <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
                <Lock className="h-3 w-3" /> Protegido
              </Badge>
            )}
          </SheetTitle>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{nivelLabels[cargo.nivel] || cargo.nivel}</Badge>
            <Badge variant="secondary" className="text-xs">{cargo.departamento || "—"}</Badge>
            <Badge variant="secondary" className="text-xs">{tipoLabels[cargo.tipo_contrato]}</Badge>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-0">
          {/* Remuneração */}
          {cargo.tipo_contrato !== "pj" && (
            <div className="py-4">
              <h4 className="text-sm font-medium mb-2">Faixas CLT</h4>
              <div className="border rounded-md divide-y text-sm">
                {faixas.map((f) => {
                  const min = (cargo as any)[`faixa_clt_${f.key.toLowerCase()}_min`];
                  const max = (cargo as any)[`faixa_clt_${f.key.toLowerCase()}_max`];
                  return (
                    <div key={f.key} className="flex items-center px-3 py-2 gap-2">
                      <span className="font-medium w-8 text-xs">{f.key}</span>
                      <span className="text-muted-foreground text-xs w-28">{f.label}</span>
                      <span className="text-xs tabular-nums">{fmt(min)} – {fmt(max)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {cargo.tipo_contrato !== "clt" && (
            <div className="py-4">
              <h4 className="text-sm font-medium mb-2">Faixas PJ</h4>
              <div className="border rounded-md divide-y text-sm">
                {faixas.map((f) => {
                  const min = (cargo as any)[`faixa_pj_${f.key.toLowerCase()}_min`];
                  const max = (cargo as any)[`faixa_pj_${f.key.toLowerCase()}_max`];
                  return (
                    <div key={f.key} className="flex items-center px-3 py-2 gap-2">
                      <span className="font-medium w-8 text-xs">{f.key}</span>
                      <span className="text-muted-foreground text-xs w-28">{f.label}</span>
                      <span className="text-xs tabular-nums">{fmt(min)} – {fmt(max)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Missão */}
          {cargo.missao && (
            <div className="pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1">Missão</p>
              <p className="text-sm">{cargo.missao}</p>
            </div>
          )}

          {/* Responsabilidades */}
          {cargo.responsabilidades?.length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Responsabilidades</p>
              <ul className="space-y-1">
                {cargo.responsabilidades.map((r: string, i: number) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">·</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skills Obrigatórias */}
          {cargo.skills_obrigatorias?.length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Skills obrigatórias</p>
              <div className="flex flex-wrap gap-1">
                {cargo.skills_obrigatorias.map((s: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-success text-white text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Skills Desejadas */}
          {cargo.skills_desejadas?.length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Skills desejadas</p>
              <div className="flex flex-wrap gap-1">
                {cargo.skills_desejadas.map((s: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-info/10 text-info text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ferramentas */}
          {cargo.ferramentas?.length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Ferramentas e sistemas</p>
              <div className="flex flex-wrap gap-1">
                {cargo.ferramentas.map((s: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-info/10 text-info text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Botão editar */}
          <div className="pt-4 border-t">
            <Button
              className="w-full"
              variant="outline"
              onClick={() => navigate(`/cargos/${cargo.id}`, { state: { from: "/admin/cargos", fromLabel: "Cargos" } })}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar cargo completo
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Main Page ─── */
export default function Cargos() {
  const navigate = useNavigate();
  const { data: cargos, isLoading } = useAllCargos();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const isAdminRH = (authRoles ?? []).includes("admin_rh") || (authRoles ?? []).includes("rh" as never);
  const [search, setSearch] = useState("");
  const [filtroDepartamento, setFiltroDepartamento] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [deleteTarget, setDeleteTarget] = useState<Cargo | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const checks = await Promise.all([
        supabase.from("colaboradores_clt").select("id", { count: "exact", head: true }).eq("cargo", deleteTarget.nome),
        supabase.from("contratos_pj").select("id", { count: "exact", head: true }).eq("tipo_servico", deleteTarget.nome),
        supabase.from("vagas").select("id", { count: "exact", head: true }).eq("titulo", deleteTarget.nome),
        supabase.from("convites_cadastro").select("id", { count: "exact", head: true }).eq("cargo", deleteTarget.nome),
      ]);
      const [clt, pj, vagas, convites] = checks;
      const usos: string[] = [];
      if ((clt.count || 0) > 0) usos.push(`${clt.count} colaborador(es) CLT`);
      if ((pj.count || 0) > 0) usos.push(`${pj.count} contrato(s) PJ`);
      if ((vagas.count || 0) > 0) usos.push(`${vagas.count} vaga(s)`);
      if ((convites.count || 0) > 0) usos.push(`${convites.count} convite(s)`);

      if (usos.length > 0) {
        setDeleteError(`Este cargo está vinculado a: ${usos.join(", ")}. Não é possível excluir. Desative-o se não quiser que apareça em novos cadastros.`);
        setDeleting(false);
        return;
      }

      const { error } = await supabase.from("cargos").delete().eq("id", deleteTarget.id);
      if (error) throw error;

      toast.success(`Cargo "${deleteTarget.nome}" excluído com sucesso.`);
      setDeleteTarget(null);
      window.location.reload();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const [selected, setSelected] = useState<Cargo | null>(null);

  const departamentos = useMemo(() => {
    if (!cargos) return [];
    const set = new Set(cargos.map((c) => c.departamento).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [cargos]);

  const filtered = useMemo(() => {
    if (!cargos) return [];
    return cargos.filter((c) => {
      if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false;
      if (filtroDepartamento !== "todos" && c.departamento !== filtroDepartamento) return false;
      if (filtroTipo !== "todos" && c.tipo_contrato !== filtroTipo) return false;
      return true;
    });
  }, [cargos, search, filtroDepartamento, filtroTipo]);

  return (
    <PageShell>
      <PageHeader
        titulo="Cargos e Salários"
        estado="Plano de Posições e Remuneração"
        acoes={
          <div className="flex gap-2">
            {(isSuperAdmin || isAdminRH) && (
              <Button variant="outline" onClick={() => navigate("/cargos/enriquecimento")}>
                <Sparkles className="h-4 w-4 mr-2" />
                Enriquecer em lote
              </Button>
            )}
            <Button className="gap-2" onClick={() => navigate("/cargos/novo", { state: { from: "/admin/cargos", fromLabel: "Cargos" } })}>
              <Plus className="h-4 w-4" /> Novo Cargo
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cargo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroDepartamento} onValueChange={setFiltroDepartamento}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Departamento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {departamentos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="clt">CLT</SelectItem>
            <SelectItem value="pj">PJ</SelectItem>
            <SelectItem value="ambos">Ambos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Faixa F1 (CLT)</TableHead>
              <TableHead className="text-right">Faixa F1 (PJ)</TableHead>
              <TableHead className="text-center">C-Level</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhum cargo encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((cargo) => (
                <TableRow key={cargo.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(cargo)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {cargo.nome}
                      {cargo.protege_salario && (
                        <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
                          <Lock className="h-3 w-3" /> Protegido
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{nivelLabels[cargo.nivel] || cargo.nivel}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{cargo.departamento || "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{tipoLabels[cargo.tipo_contrato] || cargo.tipo_contrato}</Badge></TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {cargo.faixa_clt_f1_min != null ? `${fmt(cargo.faixa_clt_f1_min)} – ${fmt(cargo.faixa_clt_f1_max)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {cargo.faixa_pj_f1_min != null ? `${fmt(cargo.faixa_pj_f1_min)} – ${fmt(cargo.faixa_pj_f1_max)}` : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {cargo.is_clevel ? (
                      <Badge className="bg-warning/10 text-warning border-warning/40 text-[10px]">C-Level</Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={cargo.ativo ? "default" : "secondary"} className="text-[10px]">
                      {cargo.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/cargos/${cargo.id}`, { state: { from: "/admin/cargos", fromLabel: "Cargos" } })} className="gap-2">
                          <Pencil className="h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        {(isSuperAdmin || isAdminRH) && (
                          <DropdownMenuItem
                            onClick={() => { setDeleteTarget(cargo); setDeleteError(null); }}
                            className="gap-2 text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} cargo{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
      </p>

      {selected && <CargoDrawer cargo={selected} onClose={() => setSelected(null)} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cargo: {deleteTarget?.nome}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ? (
                <span className="text-destructive">{deleteError}</span>
              ) : (
                "Tem certeza que deseja excluir este cargo? Esta ação não pode ser desfeita."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {!deleteError && (
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
                {deleting ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
