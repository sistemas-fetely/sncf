import { useParams, useNavigate } from "react-router-dom";
import { format, addDays } from "date-fns";
import { ArrowLeft, Calendar, Plus, Check, X, UserCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComp } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNivel } from "@/hooks/useNivel";
import {
  useCriarPeriodo, useCriarProgramacao, useAtualizarStatusProgramacao,
  type PeriodoComColaborador,
} from "@/hooks/useFerias";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

const STATUS_PERIODO: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  em_aberto: { label: "Em Aberto", variant: "outline" },
  parcial: { label: "Parcial", variant: "secondary" },
  completo: { label: "Completo", variant: "default" },
  vencido: { label: "Vencido", variant: "destructive" },
  perdido: { label: "Perdido", variant: "destructive" },
};

const STATUS_PROG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  programada: { label: "Programada", variant: "outline" },
  aprovada: { label: "Aprovada", variant: "secondary" },
  em_gozo: { label: "Em Gozo", variant: "default" },
  concluida: { label: "Concluída", variant: "default" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

export default function FeriasColaborador() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { temNivel } = useNivel();
  const canManage = temNivel(5);

  const criarPeriodoMut = useCriarPeriodo();
  const criarProgMut = useCriarProgramacao();
  const atualizarStatusMut = useAtualizarStatusProgramacao();

  const [showNovoPeriodo, setShowNovoPeriodo] = useState(false);
  const [showNovaProg, setShowNovaProg] = useState(false);
  const [selectedPeriodo, setSelectedPeriodo] = useState<PeriodoComColaborador | null>(null);

  // Form state
  const [novoPeriodoInicio, setNovoPeriodoInicio] = useState<Date>();
  const [novoDiasDireito, setNovoDiasDireito] = useState(30);
  const [progDataInicio, setProgDataInicio] = useState<Date>();
  const [progDias, setProgDias] = useState(30);
  const [progTipo, setProgTipo] = useState("gozo");
  const [progObs, setProgObs] = useState("");

  // Fetch colaborador info
  const { data: colaborador } = useQuery({
    queryKey: ["colaborador_ferias", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores_clt")
        .select("id, nome_completo, cargo, departamento, data_admissao, status")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch periodos for this colaborador
  const { data: periodos = [], isLoading } = useQuery({
    queryKey: ["ferias_periodos_colaborador", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ferias_periodos")
        .select("*, colaboradores_clt!inner(nome_completo, cargo, departamento, data_admissao), ferias_programacoes(*)")
        .eq("colaborador_id", id!)
        .order("periodo_inicio", { ascending: false });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        colaborador: p.colaboradores_clt,
        programacoes: p.ferias_programacoes || [],
      })) as PeriodoComColaborador[];
    },
    enabled: !!id,
  });

  const totalDireito = periodos.reduce((s, p) => s + p.dias_direito, 0);
  const totalGozados = periodos.reduce((s, p) => s + p.dias_gozados, 0);
  const totalVendidos = periodos.reduce((s, p) => s + p.dias_vendidos, 0);
  const totalSaldo = periodos.reduce((s, p) => s + (p.saldo ?? 0), 0);

  const handleCriarPeriodo = () => {
    if (!id || !novoPeriodoInicio) return;
    const fim = addDays(novoPeriodoInicio, 365);
    criarPeriodoMut.mutate({
      colaborador_id: id,
      periodo_inicio: format(novoPeriodoInicio, "yyyy-MM-dd"),
      periodo_fim: format(fim, "yyyy-MM-dd"),
      dias_direito: novoDiasDireito,
    }, {
      onSuccess: () => {
        setShowNovoPeriodo(false);
        setNovoPeriodoInicio(undefined);
      },
    });
  };

  const handleCriarProg = () => {
    if (!selectedPeriodo || !progDataInicio) return;
    const dataFim = addDays(progDataInicio, progDias - 1);
    criarProgMut.mutate({
      periodo_id: selectedPeriodo.id,
      colaborador_id: selectedPeriodo.colaborador_id,
      data_inicio: format(progDataInicio, "yyyy-MM-dd"),
      data_fim: format(dataFim, "yyyy-MM-dd"),
      dias: progDias,
      tipo: progTipo,
      observacoes: progObs || null,
    }, {
      onSuccess: () => {
        setShowNovaProg(false);
        setProgDataInicio(undefined);
        setProgDias(30);
        setProgObs("");
      },
    });
  };

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ferias")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          className="flex-1 mb-0"
          icone={UserCircle}
          titulo={colaborador?.nome_completo ?? "Carregando..."}
          estado={colaborador && `${colaborador.cargo} — ${colaborador.departamento} · Admissão: ${format(new Date(colaborador.data_admissao), "dd/MM/yyyy")}`}
          acoes={canManage && (
            <Button size="sm" onClick={() => setShowNovoPeriodo(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo Período
            </Button>
          )}
        />
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Direito", value: `${totalDireito} dias`, color: "text-info bg-info/10" },
          { label: "Gozados", value: `${totalGozados} dias`, color: "text-success bg-success/10" },
          { label: "Vendidos", value: `${totalVendidos} dias`, color: "text-warning bg-warning/10" },
          { label: "Saldo Total", value: `${totalSaldo} dias`, color: "text-info bg-info/10" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className={`rounded-lg p-2 ${k.color}`}>
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-lg font-medium">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Periodos */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Carregando períodos...</p>
      ) : periodos.length === 0 ? (
        <Card>
          <CardContent className="text-center text-muted-foreground py-8">
            Nenhum período aquisitivo encontrado para este colaborador.
          </CardContent>
        </Card>
      ) : (
        periodos.map((p) => {
          const st = STATUS_PERIODO[p.status] || STATUS_PERIODO.em_aberto;
          const pct = p.dias_direito > 0 ? Math.round(((p.dias_gozados + p.dias_vendidos) / p.dias_direito) * 100) : 0;
          return (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Período {format(new Date(p.periodo_inicio), "dd/MM/yyyy")} — {format(new Date(p.periodo_fim), "dd/MM/yyyy")}
                  </CardTitle>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Utilizado: {p.dias_gozados + p.dias_vendidos} / {p.dias_direito} dias</span>
                    <span>Saldo: {p.saldo} dias</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Direito:</span> <strong>{p.dias_direito}d</strong></div>
                  <div><span className="text-muted-foreground">Gozados:</span> <strong>{p.dias_gozados}d</strong></div>
                  <div><span className="text-muted-foreground">Vendidos:</span> <strong>{p.dias_vendidos}d</strong></div>
                </div>

                {/* Programações */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Programações</h4>
                    {canManage && (p.saldo ?? 0) > 0 && (
                      <Button variant="outline" size="sm" onClick={() => { setSelectedPeriodo(p); setShowNovaProg(true); }}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Programar
                      </Button>
                    )}
                  </div>
                  {(p.programacoes || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma programação registrada.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Período</TableHead>
                          <TableHead className="text-center">Dias</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Observações</TableHead>
                          {canManage && <TableHead className="text-right">Ações</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(p.programacoes || []).map((pr) => {
                          const pst = STATUS_PROG[pr.status] || STATUS_PROG.programada;
                          return (
                            <TableRow key={pr.id}>
                              <TableCell className="text-sm">
                                {format(new Date(pr.data_inicio), "dd/MM/yyyy")} — {format(new Date(pr.data_fim), "dd/MM/yyyy")}
                              </TableCell>
                              <TableCell className="text-center">{pr.dias}</TableCell>
                              <TableCell className="capitalize text-sm">{pr.tipo === "abono_pecuniario" ? "Abono Pecuniário" : "Gozo"}</TableCell>
                              <TableCell><Badge variant={pst.variant}>{pst.label}</Badge></TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{pr.observacoes || "—"}</TableCell>
                              {canManage && (
                                <TableCell className="text-right space-x-1">
                                  {pr.status === "programada" && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => atualizarStatusMut.mutate({ id: pr.id, status: "aprovada" })}>
                                      <Check className="h-4 w-4 text-success" />
                                    </Button>
                                  )}
                                  {(pr.status === "programada" || pr.status === "aprovada") && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => atualizarStatusMut.mutate({ id: pr.id, status: "cancelada" })}>
                                      <X className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Dialog Novo Período */}
      <Dialog open={showNovoPeriodo} onOpenChange={setShowNovoPeriodo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo Período Aquisitivo</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Início do Período</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start", !novoPeriodoInicio && "text-muted-foreground")}>
                    <Calendar className="mr-2 h-4 w-4" />
                    {novoPeriodoInicio ? format(novoPeriodoInicio, "dd/MM/yyyy") : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComp mode="single" selected={novoPeriodoInicio} onSelect={setNovoPeriodoInicio} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label>Dias de Direito</Label>
              <Input type="number" value={novoDiasDireito} onChange={(e) => setNovoDiasDireito(Number(e.target.value))} min={1} max={30} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovoPeriodo(false)}>Cancelar</Button>
            <Button onClick={handleCriarPeriodo} disabled={!novoPeriodoInicio}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Programar Férias */}
      <Dialog open={showNovaProg} onOpenChange={setShowNovaProg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Programar Férias</DialogTitle>
            {selectedPeriodo && (
              <p className="text-sm text-muted-foreground">Saldo disponível: {selectedPeriodo.saldo} dias</p>
            )}
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Data Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start", !progDataInicio && "text-muted-foreground")}>
                    <Calendar className="mr-2 h-4 w-4" />
                    {progDataInicio ? format(progDataInicio, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComp mode="single" selected={progDataInicio} onSelect={setProgDataInicio} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Dias</Label>
                <Input type="number" value={progDias} onChange={(e) => setProgDias(Number(e.target.value))} min={5} max={selectedPeriodo?.saldo ?? 30} />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={progTipo} onValueChange={setProgTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gozo">Gozo</SelectItem>
                    <SelectItem value="abono_pecuniario">Abono Pecuniário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={progObs} onChange={(e) => setProgObs(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovaProg(false)}>Cancelar</Button>
            <Button onClick={handleCriarProg} disabled={!progDataInicio || progDias < 1}>Programar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
