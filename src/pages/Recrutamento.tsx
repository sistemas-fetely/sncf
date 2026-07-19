import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Briefcase, Users, Search, UserCheck, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";
import { NovaVagaDialog } from "@/components/recrutamento/NovaVagaDialog";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { useQueryClient } from "@tanstack/react-query";

const statusConfig: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  aberta: { label: "Aberta", className: "bg-success/15 text-success border-success/30" },
  em_selecao: { label: "Em seleção", className: "bg-info/15 text-info border-info/30" },
  encerrada: { label: "Encerrada", className: "bg-muted text-muted-foreground" },
  cancelada: { label: "Cancelada", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

const tipoContratoLabel: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  ambos: "CLT/PJ",
};

export default function Recrutamento() {
  const navigate = useNavigate();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const canCreate = hasPermission("recrutamento", "create");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const handleDeleteVaga = async () => {
    if (!deleteTarget) return;
    await supabase.from("candidatos").delete().eq("vaga_id", deleteTarget.id);
    const { error } = await supabase.from("vagas").delete().eq("id", deleteTarget.id);
    if (error) toast.error(humanizeError(error.message));
    else {
      toast.success("Vaga excluída");
      queryClient.invalidateQueries({ queryKey: ["vagas"] });
      queryClient.invalidateQueries({ queryKey: ["candidatos-count"] });
    }
    setDeleteTarget(null);
  };

  const { data: vagas = [], isLoading: loadingVagas } = useQuery({
    queryKey: ["vagas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vagas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: gestoresMap = {} } = useQuery({
    queryKey: ["gestores-map"],
    queryFn: async () => {
      const { data: clt } = await supabase
        .from("colaboradores_clt")
        .select("id, nome_completo")
        .eq("status", "ativo");
      const { data: pj } = await supabase
        .from("contratos_pj")
        .select("id, contato_nome")
        .eq("status", "ativo");
      const map: Record<string, string> = {};
      (clt ?? []).forEach((c: any) => { map[c.id] = c.nome_completo; });
      (pj ?? []).forEach((c: any) => { map[c.id] = c.contato_nome; });
      return map;
    },
  });

  const { data: candidatos = [] } = useQuery({
    queryKey: ["candidatos-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidatos")
        .select("id, vaga_id, status, created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const vagasAbertas = vagas
    .filter((v) => v.status === "aberta")
    .reduce((sum, v) => {
      const total = (v as any).num_vagas ?? 1;
      const preenchidas = (v as any).vagas_preenchidas ?? 0;
      return sum + Math.max(0, total - preenchidas);
    }, 0);
  const vagasEmSelecao = vagas
    .filter((v) => v.status === "em_selecao")
    .reduce((sum, v) => {
      const total = (v as any).num_vagas ?? 1;
      const preenchidas = (v as any).vagas_preenchidas ?? 0;
      return sum + Math.max(0, total - preenchidas);
    }, 0);
  const totalCandidatos = candidatos.length;
  const now = new Date();
  const contratacoesMes = candidatos.filter((c) => {
    if (c.status !== "contratado") return false;
    const d = new Date(c.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const candidatosPorVaga = candidatos.reduce<Record<string, number>>((acc, c) => {
    acc[c.vaga_id] = (acc[c.vaga_id] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recrutamento e Seleção</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de vagas e candidatos</p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Vaga
          </Button>
        )}
      </div>

      <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <strong className="text-warning">Fluxo de contratação desativado nesta tela.</strong>{" "}
        <span className="text-foreground">
          Para contratar, use <a href="/pessoas/vagas" className="underline font-medium">Pessoas → Vagas</a>.
        </span>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Vagas Abertas" value={vagasAbertas} icon={Briefcase} variant="success" />
        <StatCard title="Total de Candidatos" value={totalCandidatos} icon={Users} variant="info" />
        <StatCard title="Em Seleção" value={vagasEmSelecao} icon={Search} variant="warning" />
        <StatCard title="Contratações (mês)" value={contratacoesMes} icon={UserCheck} variant="default" />
      </div>

      {/* Lista de vagas */}
      <Card className="card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Vagas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingVagas ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : vagas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Briefcase className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhuma vaga cadastrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Área</TableHead>
                   <TableHead>Tipo</TableHead>
                   <TableHead>Vagas</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead className="text-center">Candidatos</TableHead>
                  <TableHead>Abertura</TableHead>
                  <TableHead>Gestor</TableHead>
                  {isSuperAdmin && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vagas.map((vaga) => {
                  const cfg = statusConfig[vaga.status] || statusConfig.rascunho;
                  return (
                    <TableRow key={vaga.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/recrutamento/${vaga.id}`, { state: { from: "/recrutamento", fromLabel: "Recrutamento" } })}>
                      <TableCell className="font-medium">{vaga.titulo}</TableCell>
                      <TableCell>{vaga.area}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {tipoContratoLabel[vaga.tipo_contrato] || vaga.tipo_contrato}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(vaga as any).num_vagas > 1 ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "#D8F3DC", color: "#1A4A3A" }}>
                            {(vaga as any).vagas_preenchidas ?? 0}/{(vaga as any).num_vagas}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">1</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={cfg.className}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{candidatosPorVaga[vaga.id] || 0}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {vaga.vigencia_inicio
                          ? format(new Date(vaga.vigencia_inicio), "dd/MM/yyyy")
                          : format(new Date(vaga.created_at), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {gestoresMap[(vaga as any).gestor_id] ?? "—"}
                      </TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(vaga); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <NovaVagaDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vaga permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              A vaga "{deleteTarget?.titulo}" e todos os candidatos vinculados serão excluídos. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVaga} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
