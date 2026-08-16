import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, CheckCircle2, UserCheck, Wrench, ClipboardList, Users, AlertTriangle, BookOpen, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const TI_COLOR = "#3A7D6B";

interface KPI {
  total: number;
  disponivel: number;
  atribuido: number;
  manutencao: number;
}

interface AtivoRecente {
  id: string;
  tipo: string;
  marca: string | null;
  modelo: string | null;
  status: string;
  colaborador_nome: string | null;
  updated_at: string;
}

interface TarefaTI {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prazo_data: string | null;
  bloqueante: boolean | null;
  motivo_bloqueio: string | null;
  colaborador_nome: string | null;
  tipo_processo: string | null;
  area_destino: string | null;
  area_nome?: string | null;
  esta_aberta?: boolean | null;
  esta_atrasada?: boolean | null;
  dias_atraso?: number | null;
  dias_restantes?: number | null;
}

const statusVariant: Record<string, { label: string; className: string }> = {
  disponivel: { label: "Disponível", className: "bg-success/10 text-success hover:bg-success/10" },
  atribuido: { label: "Atribuído", className: "bg-info/10 text-info hover:bg-info/10" },
  manutencao: { label: "Manutenção", className: "bg-warning/10 text-warning hover:bg-warning/10" },
  descartado: { label: "Descartado", className: "bg-muted/10 text-muted-foreground hover:bg-muted/10" },
};

export default function TIDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<KPI>({ total: 0, disponivel: 0, atribuido: 0, manutencao: 0 });
  const [recentes, setRecentes] = useState<AtivoRecente[]>([]);
  const [tarefasTI, setTarefasTI] = useState<TarefaTI[]>([]);
  const [docsCount, setDocsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [concluirTarefa, setConcluirTarefa] = useState<TarefaTI | null>(null);
  const [evidenciaTexto, setEvidenciaTexto] = useState("");
  const [evidenciaUrl, setEvidenciaUrl] = useState("");
  const [salvando, setSalvando] = useState(false);

  const loadTarefas = async () => {
    const { data: tarefas, error } = await (supabase as any)
      .from("vw_tarefas")
      .select("*")
      .eq("area_nome", "Tecnologia da Informação")
      .eq("esta_aberta", true)
      .order("prazo_data", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar tarefas de TI: " + error.message);
      setTarefasTI([]);
      return;
    }

    setTarefasTI((tarefas || []) as TarefaTI[]);
  };

  const load = async () => {
    setLoading(true);
    const [{ data: ativos }, { data: ultimos }, { count: docsTotal }] = await Promise.all([
      supabase.from("ti_ativos").select("status, em_manutencao" as any),
      supabase
        .from("ti_ativos")
        .select("id, tipo, marca, modelo, status, colaborador_nome, updated_at, em_manutencao" as any)
        .order("updated_at", { ascending: false })
        .limit(8),
      (supabase as any)
        .from("sncf_documentacao")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true),
    ]);

    if (ativos) {
      setKpi({
        total: ativos.length,
        disponivel: ativos.filter((a: any) => a.status === "disponivel").length,
        atribuido: ativos.filter((a: any) => a.status === "atribuido").length,
        manutencao: ativos.filter((a: any) => a.em_manutencao === true).length,
      });
    }
    if (ultimos) setRecentes(ultimos as unknown as AtivoRecente[]);
    setDocsCount(docsTotal || 0);

    await loadTarefas();
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConcluirTarefa = (tarefa: TarefaTI) => {
    setConcluirTarefa(tarefa);
    setEvidenciaTexto("");
    setEvidenciaUrl("");
  };

  const confirmarConclusao = async () => {
    if (!concluirTarefa || evidenciaTexto.trim().length < 5) {
      toast.error("Descreva brevemente o que foi feito (mínimo 5 caracteres)");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.rpc("concluir_tarefa", {
      p_tarefa_id: concluirTarefa.id,
      p_evidencia_texto: evidenciaTexto.trim(),
      p_evidencia_url: evidenciaUrl.trim() || undefined,
    });

    if (error) {
      toast.error("Erro: " + error.message);
    } else {
      toast.success("Tarefa concluída!");
      setConcluirTarefa(null);
      await loadTarefas();
    }
    setSalvando(false);
  };

  const tarefasPendentesCount = tarefasTI.filter((t) => t.status !== "concluida").length;

  const cards = [
    { label: "Total de Ativos", value: kpi.total, icon: Package, color: TI_COLOR },
    { label: "Disponíveis", value: kpi.disponivel, icon: CheckCircle2, color: "#16A34A" },
    { label: "Atribuídos", value: kpi.atribuido, icon: UserCheck, color: TI_COLOR },
    { label: "Em Manutenção", value: kpi.manutencao, icon: Wrench, color: "#CA8A04" },
    { label: "Tarefas Pendentes", value: tarefasPendentesCount, icon: ClipboardList, color: TI_COLOR },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: TI_COLOR }}>
          TI Fetély — Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do inventário de TI</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-l-4" style={{ borderLeftColor: c.color }}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{c.label}</p>
                  <p className="text-3xl font-medium mt-1">{loading ? "—" : c.value}</p>
                </div>
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${c.color}15` }}
                >
                  <c.icon className="h-6 w-6" style={{ color: c.color }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Documentação Viva — atalho */}
      <Card className="border-l-4 cursor-pointer hover:shadow-md transition-shadow" style={{ borderLeftColor: TI_COLOR }} onClick={() => navigate("/ti/documentacao")}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
                style={{ backgroundColor: `${TI_COLOR}15` }}
              >
                <BookOpen className="h-6 w-6" style={{ color: TI_COLOR }} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                  Documentação Viva
                </p>
                <h3 className="text-lg font-medium mt-0.5">
                  {docsCount} {docsCount === 1 ? "documento ativo" : "documentos ativos"}
                </h3>
                <p className="text-sm text-muted-foreground">RunBook, guias, roadmap e estado atual</p>
              </div>
            </div>
            <Button variant="outline" className="gap-2">
              Acessar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tarefas Pendentes de TI */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Tarefas Pendentes de TI
            {tarefasTI.length > 0 && (
              <Badge variant="outline" className="ml-2">{tarefasTI.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tarefasTI.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
              <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tarefasTI.map((tarefa) => {
                const diasAtraso = tarefa.dias_atraso ?? 0;
                return (
                  <div
                    key={tarefa.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      tarefa.esta_atrasada
                        ? "bg-destructive/10 border-destructive/40"
                        : tarefa.bloqueante
                        ? "bg-warning/10 border-warning/40"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <button
                      onClick={() => handleConcluirTarefa(tarefa)}
                      className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-border/40 hover:border-success/40 flex items-center justify-center"
                      title="Concluir tarefa"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{tarefa.titulo}</p>
                        {tarefa.bloqueante && (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" /> Legal
                          </Badge>
                        )}
                        {tarefa.status === "em_andamento" && (
                          <Badge className="text-[10px] bg-info hover:bg-info">Em andamento</Badge>
                        )}
                        {tarefa.esta_atrasada && (
                          <Badge variant="destructive" className="text-[10px]">
                            Atrasada {diasAtraso > 0 ? `há ${diasAtraso} dias` : ""}
                          </Badge>
                        )}
                      </div>
                      {tarefa.descricao && (
                        <p className="text-xs text-muted-foreground mt-0.5">{tarefa.descricao}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        {tarefa.colaborador_nome && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {tarefa.colaborador_nome}
                          </span>
                        )}
                        <span>
                          Prazo:{" "}
                          {tarefa.prazo_data
                            ? new Date(tarefa.prazo_data + "T00:00:00").toLocaleDateString("pt-BR")
                            : "—"}
                        </span>
                        {tarefa.tipo_processo === "onboarding" && (
                          <Badge variant="outline" className="text-[10px]">Onboarding</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos ativos movimentados</CardTitle>
        </CardHeader>
        <CardContent>
          {recentes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum ativo cadastrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Marca / Modelo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Atualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentes.map((a) => {
                  const v = statusVariant[a.status] || statusVariant.disponivel;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="capitalize">{a.tipo}</TableCell>
                      <TableCell>{[a.marca, a.modelo].filter(Boolean).join(" ") || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={v.className}>{v.label}</Badge>
                      </TableCell>
                      <TableCell>{a.colaborador_nome || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(a.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!concluirTarefa} onOpenChange={(open) => { if (!open) setConcluirTarefa(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir: {concluirTarefa?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>
              {concluirTarefa?.colaborador_nome ? `Colaborador: ${concluirTarefa.colaborador_nome}` : "Registre a evidência de conclusão."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-sm">O que foi feito? *</Label>
              <Textarea
                value={evidenciaTexto}
                onChange={(e) => setEvidenciaTexto(e.target.value)}
                placeholder="Ex: Notebook configurado e entregue, acesso ao Google Workspace criado..."
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Link de evidência (opcional)</Label>
              <Input
                value={evidenciaUrl}
                onChange={(e) => setEvidenciaUrl(e.target.value)}
                placeholder="URL de comprovação"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmarConclusao(); }}
              disabled={salvando || evidenciaTexto.trim().length < 5}
            >
              {salvando ? "Salvando..." : "Concluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
