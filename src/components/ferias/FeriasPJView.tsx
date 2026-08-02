import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays } from "date-fns";
import { Calendar, Plus, Check, X, Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComp } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  useFeriasPeriodosPJ, useCriarPeriodoPJ, useCriarFeriasPJ, useAtualizarStatusFeriasPJ, useEditarFeriasPJ,
  useExcluirFeriasPJ, useExcluirPeriodoPJ,
  type PeriodoPJComContrato,
} from "@/hooks/useFerias";
import type { Tables } from "@/integrations/supabase/types";
import { nomePessoaPJ } from "@/lib/parceiros/nome";

const STATUS_PERIODO: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  em_aberto: { label: "Em Aberto", variant: "outline" },
  parcial: { label: "Parcial", variant: "secondary" },
  completo: { label: "Completo", variant: "default" },
  vencido: { label: "Vencido", variant: "destructive" },
};

const STATUS_PROG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  programada: { label: "Programada", variant: "outline" },
  aprovada: { label: "Aprovada", variant: "secondary" },
  em_andamento: { label: "Em Andamento", variant: "default" },
  concluida: { label: "Concluída", variant: "default" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

interface Props { canManage: boolean; isAdmin: boolean; }

export function FeriasPJView({ canManage, isAdmin }: Props) {
  const navigate = useNavigate();
  const { data: periodos = [], isLoading } = useFeriasPeriodosPJ();
  const criarPeriodoMut = useCriarPeriodoPJ();
  const criarProgMut = useCriarFeriasPJ();
  const atualizarStatusMut = useAtualizarStatusFeriasPJ();
  const editarMut = useEditarFeriasPJ();
  const excluirProgMut = useExcluirFeriasPJ();
  const excluirPeriodoMut = useExcluirPeriodoPJ();
  const [showNovoPeriodo, setShowNovoPeriodo] = useState(false);
  const [showNovaProg, setShowNovaProg] = useState(false);
  const [showEditProg, setShowEditProg] = useState(false);
  const [selectedPeriodo, setSelectedPeriodo] = useState<PeriodoPJComContrato | null>(null);
  const [editingProg, setEditingProg] = useState<Tables<"ferias_pj"> | null>(null);
  const [busca, setBusca] = useState("");

  // Form - novo período
  const [novoContratoId, setNovoContratoId] = useState("");
  const [novoPeriodoInicio, setNovoPeriodoInicio] = useState<Date>();
  const [novoDiasDireito, setNovoDiasDireito] = useState(30);

  // Form - nova programação
  const [progDataInicio, setProgDataInicio] = useState<Date>();
  const [progDias, setProgDias] = useState(15);
  const [progTipo, setProgTipo] = useState("recesso");
  const [progObs, setProgObs] = useState("");

  const { data: contratos = [] } = useQuery({
    queryKey: ["contratos_pj_select_ferias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos_pj")
        .select("id, contato_nome, nome_fantasia, razao_social, departamento")
        .eq("status", "ativo")
        .order("contato_nome");
      if (error) throw error;
      return data;
    },
  });

  const filtered = periodos.filter((p) =>
    (p.contrato?.contato_nome ?? "").toLowerCase().includes(busca.toLowerCase()) ||
    (p.contrato?.departamento ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  const totalPeriodos = periodos.length;
  const vencidos = periodos.filter((p) => p.status === "vencido").length;
  const emAndamento = periodos.flatMap((p) => p.programacoes || []).filter((pr) => pr.status === "em_andamento").length;
  const programadas = periodos.flatMap((p) => p.programacoes || []).filter((pr) => pr.status === "programada" || pr.status === "aprovada").length;

  const handleCriarPeriodo = () => {
    if (!novoContratoId || !novoPeriodoInicio) return;
    const fim = addDays(novoPeriodoInicio, 365);
    criarPeriodoMut.mutate({
      contrato_id: novoContratoId,
      periodo_inicio: format(novoPeriodoInicio, "yyyy-MM-dd"),
      periodo_fim: format(fim, "yyyy-MM-dd"),
      dias_direito: novoDiasDireito,
    }, {
      onSuccess: () => {
        setShowNovoPeriodo(false);
        setNovoContratoId("");
        setNovoPeriodoInicio(undefined);
      },
    });
  };

  const handleCriarProg = () => {
    if (!selectedPeriodo || !progDataInicio) return;
    const dataFim = addDays(progDataInicio, progDias - 1);
    criarProgMut.mutate({
      contrato_id: selectedPeriodo.contrato_id,
      periodo_pj_id: selectedPeriodo.id,
      data_inicio: format(progDataInicio, "yyyy-MM-dd"),
      data_fim: format(dataFim, "yyyy-MM-dd"),
      dias: progDias,
      tipo: progTipo,
      observacoes: progObs || null,
    }, {
      onSuccess: () => {
        setShowNovaProg(false);
        setProgDataInicio(undefined);
        setProgDias(15);
        setProgObs("");
      },
    });
  };

  const openEdit = (pr: Tables<"ferias_pj">) => {
    setEditingProg(pr);
    setProgDataInicio(new Date(pr.data_inicio));
    setProgDias(pr.dias);
    setProgTipo(pr.tipo);
    setProgObs(pr.observacoes || "");
    setShowEditProg(true);
  };

  const handleEditProg = () => {
    if (!editingProg || !progDataInicio) return;
    const dataFim = addDays(progDataInicio, progDias - 1);
    editarMut.mutate({
      id: editingProg.id,
      data_inicio: format(progDataInicio, "yyyy-MM-dd"),
      data_fim: format(dataFim, "yyyy-MM-dd"),
      dias: progDias,
      tipo: progTipo,
      observacoes: progObs || null,
    }, {
      onSuccess: () => {
        setShowEditProg(false);
        setEditingProg(null);
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Períodos Ativos", value: totalPeriodos, color: "text-blue-600 bg-blue-50" },
          { label: "Vencidos", value: vencidos, color: "text-red-600 bg-red-50" },
          { label: "Em Andamento", value: emAndamento, color: "text-green-600 bg-green-50" },
          { label: "Programadas", value: programadas, color: "text-orange-600 bg-orange-50" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className={`rounded-lg p-2 ${k.color}`}>
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-lg font-bold">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Input placeholder="Buscar prestador..." value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        <div className="flex-1" />
        {canManage && (
          <Button size="sm" onClick={() => setShowNovoPeriodo(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo Período
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prestador</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Período Aquisitivo</TableHead>
              <TableHead className="text-center">Direito</TableHead>
              <TableHead className="text-center">Gozados</TableHead>
              <TableHead className="text-center">Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Programações</TableHead>
              {canManage && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 9 : 8} className="text-center text-muted-foreground py-8">
                  {isLoading ? "Carregando..." : "Nenhum período aquisitivo PJ encontrado"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const st = STATUS_PERIODO[p.status] || STATUS_PERIODO.em_aberto;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.contrato?.contato_nome}</TableCell>
                    <TableCell>{nomePessoaPJ(p.contrato?.contato_nome, p.contrato?.razao_social)}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(p.periodo_inicio), "dd/MM/yyyy")} — {format(new Date(p.periodo_fim), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-center">{p.dias_direito}</TableCell>
                    <TableCell className="text-center">{p.dias_gozados}</TableCell>
                    <TableCell className="text-center font-semibold">{p.saldo}</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell>
                      {(p.programacoes || []).length > 0 ? (
                        <div className="space-y-1">
                          {(p.programacoes || []).map((pr) => {
                            const pst = STATUS_PROG[pr.status] || STATUS_PROG.programada;
                            return (
                              <div key={pr.id} className="flex items-center gap-1.5 text-xs">
                                <Badge variant={pst.variant} className="text-[10px] px-1.5">{pst.label}</Badge>
                                <span>{format(new Date(pr.data_inicio), "dd/MM")} - {format(new Date(pr.data_fim), "dd/MM")} ({pr.dias}d)</span>
                                {canManage && (pr.status === "programada" || pr.status === "aprovada") && (
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEdit(pr)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                                {canManage && pr.status === "programada" && (
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => atualizarStatusMut.mutate({ id: pr.id, status: "aprovada" })}>
                                    <Check className="h-3 w-3 text-green-600" />
                                  </Button>
                                )}
                                {canManage && (pr.status === "programada" || pr.status === "aprovada") && (
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => atualizarStatusMut.mutate({ id: pr.id, status: "cancelada" })}>
                                    <X className="h-3 w-3 text-red-600" />
                                  </Button>
                                )}
                                {isAdmin && (
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => excluirProgMut.mutate(pr.id)}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nenhuma</span>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="sm" onClick={() => { setSelectedPeriodo(p); setShowNovaProg(true); }}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Programar
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => excluirPeriodoMut.mutate(p.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Novo Período */}
      <Dialog open={showNovoPeriodo} onOpenChange={setShowNovoPeriodo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo Período Aquisitivo PJ</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Contrato PJ</Label>
              <Select value={novoContratoId} onValueChange={setNovoContratoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {contratos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.contato_nome} — {c.nome_fantasia || c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <Button onClick={handleCriarPeriodo} disabled={!novoContratoId || !novoPeriodoInicio}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Programar Recesso */}
      <Dialog open={showNovaProg} onOpenChange={setShowNovaProg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Programar Recesso</DialogTitle>
            {selectedPeriodo && (
              <p className="text-sm text-muted-foreground">
                {selectedPeriodo.contrato?.contato_nome} — Saldo: {selectedPeriodo.saldo} dias
              </p>
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
                <Input type="number" value={progDias} onChange={(e) => setProgDias(Number(e.target.value))} min={1} max={selectedPeriodo?.saldo ?? 30} />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={progTipo} onValueChange={setProgTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recesso">Recesso</SelectItem>
                    <SelectItem value="ferias_contratual">Férias Contratual</SelectItem>
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

      {/* Dialog Editar Programação */}
      <Dialog open={showEditProg} onOpenChange={setShowEditProg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Programação</DialogTitle></DialogHeader>
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
                <Input type="number" value={progDias} onChange={(e) => setProgDias(Number(e.target.value))} min={1} />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={progTipo} onValueChange={setProgTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recesso">Recesso</SelectItem>
                    <SelectItem value="ferias_contratual">Férias Contratual</SelectItem>
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
            <Button variant="outline" onClick={() => setShowEditProg(false)}>Cancelar</Button>
            <Button onClick={handleEditProg} disabled={!progDataInicio || progDias < 1}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
