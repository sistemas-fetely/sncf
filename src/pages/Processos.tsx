import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, FileText, Users, Building2, MapPin, Briefcase,
  Monitor, Filter, Loader2, Eye, AlertCircle, Sparkles, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useProcessos, type FiltrosProcessos } from "@/hooks/useProcessos";
import { useAllParametros } from "@/hooks/useParametros";
import { useUnidades } from "@/hooks/useUnidades";
import { useCargos } from "@/hooks/useCargos";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
const STATUS_COR: Record<string, string> = {
  vigente: "bg-success/10 text-success border-success/30",
  em_revisao: "bg-warning/10 text-warning border-warning/30",
  rascunho: "bg-muted text-muted-foreground border-muted-foreground/20",
  arquivado: "bg-muted/50 text-muted-foreground border-muted-foreground/20",
};

const NATUREZA_LABEL: Record<string, string> = {
  lista_tarefas: "Lista de tarefas",
  workflow: "Workflow",
  guia: "Guia/Norma",
  misto: "Misto",
};

export default function Processos() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const queryClient = useQueryClient();
  const podeEditar = roles?.some((r) => ["super_admin", "admin_rh"].includes(r));

  const [filtros, setFiltros] = useState<FiltrosProcessos>({});
  const [busca, setBusca] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const handleDeleteProcesso = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    // Cascade: filhos primeiro
    await supabase.from("processos_versoes").delete().eq("processo_id", id);
    await supabase.from("processos_tags_tipos_colaborador").delete().eq("processo_id", id);
    await supabase.from("processos_tags_areas").delete().eq("processo_id", id);
    await supabase.from("processos_tags_departamentos").delete().eq("processo_id", id);
    await supabase.from("processos_ligacoes").delete().or(`origem_id.eq.${id},destino_id.eq.${id}`);
    await supabase.from("processos_sugestoes").delete().eq("processo_id", id);
    await supabase.from("processos_log_consultas").delete().eq("processo_id", id);
    const { error } = await supabase.from("processos").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir: " + humanizeError(error.message));
    else {
      toast.success("Processo excluído");
      queryClient.invalidateQueries({ queryKey: ["processos"] });
    }
    setDeleteTarget(null);
  };

  const { data: parametros } = useAllParametros();
  const { data: unidades } = useUnidades();
  const { data: cargos } = useCargos();
  const { data: sistemas } = useQuery({
    queryKey: ["sncf-sistemas"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sncf_sistemas")
        .select("id, nome")
        .eq("ativo", true)
        .order("ordem");
      return (data as any[]) || [];
    },
  });

  const areas = (parametros || []).filter((p) => p.categoria === "area_negocio" && p.ativo);
  const departamentos = (parametros || []).filter((p) => p.categoria === "departamento" && p.ativo);
  const naturezas = (parametros || []).filter((p) => p.categoria === "natureza_processo" && p.ativo);
  const statusOpcoes = (parametros || []).filter((p) => p.categoria === "status_processo" && p.ativo);

  const filtrosFull: FiltrosProcessos = useMemo(
    () => ({ ...filtros, busca: busca.trim() || undefined }),
    [filtros, busca],
  );

  const { data: processos, isLoading } = useProcessos(filtrosFull);

  const filtrosAtivos = Object.entries(filtros).filter(
    ([, v]) => v !== undefined && v !== "",
  ).length;

  function limparFiltros() {
    setFiltros({});
    setBusca("");
  }

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        icone={FileText}
        titulo="Processos Fetely"
        estado="Como a Fetely faz o que faz. Vivos, versionados e de todos."
        acoes={podeEditar && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/processos/importar")}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5 text-info" />
              Importar de PDF
            </Button>
            <Button onClick={() => navigate("/processos/novo/editar")} className="gap-2">
              <Plus className="h-4 w-4" /> Novo processo
            </Button>
          </div>
        )}
      />

      {/* Busca + filtros */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, descrição ou conteúdo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>

        <Sheet open={filtrosAbertos} onOpenChange={setFiltrosAbertos}>
          <SheetTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
              {filtrosAtivos > 0 && (
                <Badge variant="secondary" className="ml-1">{filtrosAtivos}</Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filtrar processos</SheetTitle>
              <SheetDescription>
                Combine dimensões para encontrar o processo certo.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 mt-4">
              <FiltroSelect
                label="Área"
                icon={<Briefcase className="h-3.5 w-3.5" />}
                value={filtros.area_id}
                options={areas.map((a) => ({ id: a.id, label: a.label }))}
                onChange={(v) => setFiltros({ ...filtros, area_id: v })}
              />
              <FiltroSelect
                label="Departamento"
                icon={<Users className="h-3.5 w-3.5" />}
                value={filtros.departamento_id}
                options={departamentos.map((d) => ({ id: d.id, label: d.label }))}
                onChange={(v) => setFiltros({ ...filtros, departamento_id: v })}
              />
              <FiltroSelect
                label="Unidade"
                icon={<MapPin className="h-3.5 w-3.5" />}
                value={filtros.unidade_id}
                options={(unidades || []).map((u: any) => ({ id: u.id, label: u.nome }))}
                onChange={(v) => setFiltros({ ...filtros, unidade_id: v })}
              />
              <FiltroSelect
                label="Cargo"
                icon={<Building2 className="h-3.5 w-3.5" />}
                value={filtros.cargo_id}
                options={(cargos || []).map((c: any) => ({ id: c.id, label: c.nome }))}
                onChange={(v) => setFiltros({ ...filtros, cargo_id: v })}
              />
              <FiltroSelect
                label="Sistema"
                icon={<Monitor className="h-3.5 w-3.5" />}
                value={filtros.sistema_id}
                options={(sistemas || []).map((s: any) => ({ id: s.id, label: s.nome }))}
                onChange={(v) => setFiltros({ ...filtros, sistema_id: v })}
              />
              <FiltroSelect
                label="Tipo de colaborador"
                value={filtros.tipo_colaborador}
                options={[
                  { id: "clt", label: "CLT" },
                  { id: "pj", label: "PJ" },
                ]}
                onChange={(v) => setFiltros({ ...filtros, tipo_colaborador: v as any })}
              />

              <Separator />

              <FiltroSelect
                label="Natureza"
                value={filtros.natureza}
                options={naturezas.map((n) => ({ id: n.valor, label: n.label }))}
                onChange={(v) => setFiltros({ ...filtros, natureza: v })}
              />
              <FiltroSelect
                label="Status"
                value={filtros.status}
                options={statusOpcoes.map((s) => ({ id: s.valor, label: s.label }))}
                onChange={(v) => setFiltros({ ...filtros, status: v })}
              />

              <Separator />

              <div className="flex justify-between gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={limparFiltros}>
                  Limpar tudo
                </Button>
                <Button onClick={() => setFiltrosAbertos(false)} size="sm">
                  Aplicar
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Contador */}
      {processos && processos.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{processos.length} processo(s)</span>
          {filtrosAtivos > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={limparFiltros}>
              Limpar {filtrosAtivos} filtro(s)
            </Button>
          )}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !processos || processos.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <h3 className="font-medium">Nenhum processo encontrado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {filtrosAtivos > 0
                  ? "Tente ajustar os filtros."
                  : "Comece criando o primeiro processo."}
              </p>
            </div>
            {podeEditar && filtrosAtivos === 0 && (
              <Button
                onClick={() => navigate("/processos/novo/editar")}
                className="gap-2"
              >
                <Plus className="h-4 w-4" /> Criar primeiro processo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {processos.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
              onClick={() => navigate(`/processos/${p.id}`, { state: { from: "/processos", fromLabel: "Processos" } })}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium leading-tight truncate">{p.nome}</h3>
                    {p.area_nome && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.area_nome}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className={`${STATUS_COR[p.status_valor] || ""} text-[10px]`}>
                      {statusOpcoes.find((s) => s.valor === p.status_valor)?.label || p.status_valor}
                    </Badge>
                    {isSuperAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                        aria-label="Excluir processo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {p.descricao && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{p.descricao}</p>
                )}

                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {NATUREZA_LABEL[p.natureza_valor] || p.natureza_valor}
                  </Badge>
                  {p.tags_tipos_colaborador.map((tipo) => (
                    <Badge key={tipo} variant="outline" className="text-[10px] uppercase">
                      {tipo}
                    </Badge>
                  ))}
                  {p.versao_atual > 0 && (
                    <Badge variant="outline" className="text-[10px]">v{p.versao_atual}</Badge>
                  )}
                </div>

                {(p.tags_departamentos.length > 0 || p.tags_unidades.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {p.tags_departamentos.slice(0, 2).map((t) => (
                      <span
                        key={t.id}
                        className="text-[10px] inline-flex items-center gap-0.5 text-muted-foreground"
                      >
                        <Users className="h-2.5 w-2.5" /> {t.label}
                      </span>
                    ))}
                    {p.tags_unidades.slice(0, 2).map((t) => (
                      <span
                        key={t.id}
                        className="text-[10px] inline-flex items-center gap-0.5 text-muted-foreground"
                      >
                        <MapPin className="h-2.5 w-2.5" /> {t.label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t text-[10px] text-muted-foreground">
                  <span className="truncate">
                    {p.owner_nome ? `Owner: ${p.owner_nome.split(" ")[0]}` : "Sem dono"}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.sugestoes_pendentes > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-warning">
                        <AlertCircle className="h-2.5 w-2.5" />
                        {p.sugestoes_pendentes} sug.
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5">
                      <Eye className="h-2.5 w-2.5" /> {p.consultas_30d}
                    </span>
                    <span>
                      {formatDistanceToNow(new Date(p.updated_at), {
                        locale: ptBR,
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog excluir processo (super_admin) */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processo permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              O processo "{deleteTarget?.nome}" será excluído junto com todas as versões, tags, conexões e sugestões. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProcesso}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function FiltroSelect({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string | undefined;
  options: { id: string; label: string }[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium flex items-center gap-1 mb-1">
        {icon} {label}
      </label>
      <Select
        value={value || "__all__"}
        onValueChange={(v) => onChange(v === "__all__" ? undefined : v)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
