import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, MoreHorizontal, Edit, PlayCircle, CheckCircle2, XCircle, UserPlus } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";
import { PreencherVagaDialog } from "@/components/vagas/PreencherVagaDialog";

type StatusVaga = "aberta" | "em_processo" | "preenchida" | "cancelada";
type StatusFiltro = "vivas" | "todas" | StatusVaga;

interface Vaga {
  id: string;
  titulo: string;
  departamento_id: string | null;
  unidade_id: string | null;
  cargo_id: string | null;
  tipo_vinculo: string | null;
  senioridade: string | null;
  descricao: string | null;
  status: StatusVaga;
  data_prevista_ocupacao: string | null;
  data_abertura: string | null;
  observacoes: string | null;
}

interface FormState {
  titulo: string;
  departamento_id: string;
  unidade_id: string;
  cargo_id: string;
  tipo_vinculo: string;
  senioridade: string;
  descricao: string;
  data_prevista_ocupacao: string;
  observacoes: string;
  status: StatusVaga;
}

const emptyForm: FormState = {
  titulo: "",
  departamento_id: "",
  unidade_id: "",
  cargo_id: "",
  tipo_vinculo: "qualquer",
  senioridade: "",
  descricao: "",
  data_prevista_ocupacao: "",
  observacoes: "",
  status: "aberta",
};

const NENHUM = "__nenhum__";

const statusLabel: Record<StatusVaga, string> = {
  aberta: "Aberta",
  em_processo: "Em processo",
  preenchida: "Preenchida",
  cancelada: "Cancelada",
};

const statusStyle: Record<StatusVaga, string> = {
  aberta: "bg-info/10 text-info border-0",
  em_processo: "bg-warning/10 text-warning border-0",
  preenchida: "bg-success/10 text-success border-0",
  cancelada: "bg-muted text-muted-foreground border-0",
};

export default function Vagas() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFiltro>("vivas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vaga | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Vaga | null>(null);
  const [preencherTarget, setPreencherTarget] = useState<Vaga | null>(null);

  // Dimensões
  const { data: dims } = useQuery({
    queryKey: ["vagas-dimensoes"],
    queryFn: async () => {
      const [c, d, u] = await Promise.all([
        (supabase as any).from("cargos").select("id, nome").eq("ativo", true).order("nome"),
        (supabase as any).from("departamentos").select("id, nome").eq("ativo", true).order("nome"),
        (supabase as any).from("unidades").select("id, nome").order("nome"),
      ]);
      if (c.error) throw c.error;
      if (d.error) throw d.error;
      if (u.error) throw u.error;
      return {
        cargos: (c.data || []) as { id: string; nome: string }[],
        departamentos: (d.data || []) as { id: string; nome: string }[],
        unidades: (u.data || []) as { id: string; nome: string }[],
      };
    },
  });

  const cargoMap = useMemo(
    () => new Map((dims?.cargos || []).map((x) => [x.id, x.nome])),
    [dims],
  );
  const depMap = useMemo(
    () => new Map((dims?.departamentos || []).map((x) => [x.id, x.nome])),
    [dims],
  );
  const uniMap = useMemo(
    () => new Map((dims?.unidades || []).map((x) => [x.id, x.nome])),
    [dims],
  );

  const { data: vagas, isLoading } = useQuery({
    queryKey: ["posicoes-planejadas", statusFilter],
    queryFn: async (): Promise<Vaga[]> => {
      let q = (supabase as any)
        .from("posicoes_planejadas")
        .select("*")
        .order("data_abertura", { ascending: false });

      if (statusFilter === "vivas") {
        q = q.in("status", ["aberta", "em_processo"]);
      } else if (statusFilter !== "todas") {
        q = q.eq("status", statusFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Vaga[];
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(v: Vaga) {
    setEditing(v);
    setForm({
      titulo: v.titulo || "",
      departamento_id: v.departamento_id || "",
      unidade_id: v.unidade_id || "",
      cargo_id: v.cargo_id || "",
      tipo_vinculo: v.tipo_vinculo || "qualquer",
      senioridade: v.senioridade || "",
      descricao: v.descricao || "",
      data_prevista_ocupacao: v.data_prevista_ocupacao || "",
      observacoes: v.observacoes || "",
      status: v.status,
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim()) {
        throw new Error("Título é obrigatório.");
      }
      const payload: any = {
        titulo: form.titulo.trim(),
        departamento_id: form.departamento_id || null,
        unidade_id: form.unidade_id || null,
        cargo_id: form.cargo_id || null,
        tipo_vinculo: form.tipo_vinculo || null,
        senioridade: form.senioridade.trim() || null,
        descricao: form.descricao.trim() || null,
        data_prevista_ocupacao: form.data_prevista_ocupacao || null,
        observacoes: form.observacoes.trim() || null,
      };

      if (editing) {
        payload.status = form.status;
        const { error } = await (supabase as any)
          .from("posicoes_planejadas")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        payload.status = "aberta";
        const { error } = await (supabase as any)
          .from("posicoes_planejadas")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Vaga atualizada" : "Vaga criada");
      qc.invalidateQueries({ queryKey: ["posicoes-planejadas"] });
      qc.invalidateQueries({ queryKey: ["dimensionamento-areas"] });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      toast.error(humanizeError(err?.message || String(err)));
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusVaga }) => {
      const { error } = await (supabase as any)
        .from("posicoes_planejadas")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success(`Status alterado para ${statusLabel[vars.status]}`);
      qc.invalidateQueries({ queryKey: ["posicoes-planejadas"] });
      qc.invalidateQueries({ queryKey: ["dimensionamento-areas"] });
    },
    onError: (err: any) => {
      toast.error(humanizeError(err?.message || String(err)));
    },
  });

  async function handleSave() {
    setSaving(true);
    try {
      await saveMutation.mutateAsync();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vagas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Posições planejadas por área
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/pessoas")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nova vaga
          </Button>
        </div>
      </div>

      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFiltro)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vivas">Abertas + em processo</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="aberta">Abertas</SelectItem>
                <SelectItem value="em_processo">Em processo</SelectItem>
                <SelectItem value="preenchida">Preenchidas</SelectItem>
                <SelectItem value="cancelada">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Título</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">Área</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Cargo</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">Tipo</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Senioridade</TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Prevista p/</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10">
                    <div className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  </TableCell></TableRow>
                ) : (vagas || []).length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    Nenhuma vaga neste filtro.
                  </TableCell></TableRow>
                ) : (vagas || []).map((v) => (
                  <TableRow key={v.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-sm">{v.titulo}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      {v.departamento_id ? depMap.get(v.departamento_id) || "—" : "—"}
                    </TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">
                      {v.cargo_id ? cargoMap.get(v.cargo_id) || "—" : "—"}
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      {v.tipo_vinculo || "—"}
                    </TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">
                      {v.senioridade || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                      {v.data_prevista_ocupacao
                        ? format(parseISO(v.data_prevista_ocupacao), "dd/MM/yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyle[v.status]}>
                        {statusLabel[v.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(v)}>
                            <Edit className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          {v.status === "aberta" && (
                            <DropdownMenuItem
                              onClick={() => statusMutation.mutate({ id: v.id, status: "em_processo" })}
                            >
                              <PlayCircle className="mr-2 h-4 w-4" /> Marcar em processo
                            </DropdownMenuItem>
                          )}
                          {(v.status === "aberta" || v.status === "em_processo") && (
                            <DropdownMenuItem
                              onClick={() => statusMutation.mutate({ id: v.id, status: "preenchida" })}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar preenchida
                            </DropdownMenuItem>
                          )}
                          {v.status !== "cancelada" && v.status !== "preenchida" && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setCancelTarget(v)}
                            >
                              <XCircle className="mr-2 h-4 w-4" /> Cancelar vaga
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
        </CardContent>
      </Card>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) setDialogOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar vaga" : "Nova vaga"}</DialogTitle>
            <DialogDescription>
              Cadastro de posição planejada. Vagas abertas ou em processo aparecem no Panorama de Áreas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título *</Label>
              <Input
                id="titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex: Analista de Operações Sênior"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Departamento</Label>
                <Select
                  value={form.departamento_id || NENHUM}
                  onValueChange={(v) => setForm({ ...form, departamento_id: v === NENHUM ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>— nenhum —</SelectItem>
                    {(dims?.departamentos || []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select
                  value={form.unidade_id || NENHUM}
                  onValueChange={(v) => setForm({ ...form, unidade_id: v === NENHUM ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>— nenhum —</SelectItem>
                    {(dims?.unidades || []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Select
                  value={form.cargo_id || NENHUM}
                  onValueChange={(v) => setForm({ ...form, cargo_id: v === NENHUM ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>— nenhum —</SelectItem>
                    {(dims?.cargos || []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de vínculo</Label>
                <Select
                  value={form.tipo_vinculo}
                  onValueChange={(v) => setForm({ ...form, tipo_vinculo: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualquer">Qualquer</SelectItem>
                    <SelectItem value="CLT">CLT</SelectItem>
                    <SelectItem value="PJ">PJ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="senioridade">Senioridade</Label>
                <Input
                  id="senioridade"
                  value={form.senioridade}
                  onChange={(e) => setForm({ ...form, senioridade: e.target.value })}
                  placeholder="júnior / pleno / sênior / especialista"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="data_prevista">Data prevista de ocupação</Label>
                <Input
                  id="data_prevista"
                  type="date"
                  value={form.data_prevista_ocupacao}
                  onChange={(e) => setForm({ ...form, data_prevista_ocupacao: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                rows={3}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>

            {editing && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as StatusVaga })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="em_processo">Em processo</SelectItem>
                    <SelectItem value="preenchida">Preenchida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.titulo.trim()}>
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar vaga"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm cancel */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar vaga "{cancelTarget?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A vaga será marcada como <strong>cancelada</strong> e sairá do Panorama de Áreas.
              Nenhum dado é apagado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (cancelTarget) {
                  statusMutation.mutate({ id: cancelTarget.id, status: "cancelada" });
                  setCancelTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
