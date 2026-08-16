import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useCreatePosicao, useDeletePosicao, materializarSeVirtual } from "@/hooks/useOrgMutations";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import { useCargos } from "@/hooks/useCargos";
import { useEstruturaOrganizacional } from "@/hooks/useEstruturaOrganizacional";
import { SelectDepartamentoHierarquico } from "@/components/shared/SelectDepartamentoHierarquico";
import type { PosicaoNode } from "@/types/organograma";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  editNode?: PosicaoNode | null;
  allNodes: PosicaoNode[];
}

const nivelLabels: Record<number, string> = {
  1: "1 — C-Level",
  2: "2 — Diretoria",
  3: "3 — Gerência",
  4: "4 — Coordenação",
  5: "5 — Analistas",
  6: "6 — Assistentes",
};

export function OrgPosicaoModal({ open, onClose, editNode, allNodes }: Props) {
  const { hasAnyRole } = useAuth();
  const canSeeSalary = hasAnyRole(["super_admin", "gestor_rh", "financeiro"]);
  const qc = useQueryClient();
  const createMutation = useCreatePosicao();
  const deleteMutation = useDeletePosicao();
  const { data: cargosRaw, isLoading: loadingCargos } = useCargos();
  const cargosParam = (cargosRaw || []).map((c) => ({ id: c.id, label: c.nome }));
  const { data: estrutura } = useEstruturaOrganizacional();

  const [form, setForm] = useState({
    titulo_cargo: "",
    nivel_hierarquico: 3,
    departamento: "",
    area: "",
    filial: "Matriz",
    status: "vaga_aberta" as string,
    id_pai: "" as string,
    salario_previsto: "" as string,
    centro_custo: "",
  });

  useEffect(() => {
    if (editNode) {
      setForm({
        titulo_cargo: editNode.titulo_cargo,
        nivel_hierarquico: editNode.nivel_hierarquico,
        departamento: editNode.departamento,
        area: editNode.area || "",
        filial: editNode.filial || "Matriz",
        status: editNode.status,
        id_pai: editNode.id_pai || "",
        salario_previsto: editNode.salario_previsto ? String(editNode.salario_previsto) : "",
        centro_custo: editNode.centro_custo || "",
      });
    } else {
      setForm({
        titulo_cargo: "",
        nivel_hierarquico: 3,
        departamento: "",
        area: "",
        filial: "Matriz",
        status: "vaga_aberta",
        id_pai: "",
        salario_previsto: "",
        centro_custo: "",
      });
    }
  }, [editNode, open]);

  const parentOptions = allNodes.filter(n => !editNode || n.id !== editNode.id);

  const ehVirtual = !!editNode?.id.startsWith("virtual-");

  // O Select de cargo casa por texto exato contra cargos.nome. Em nó virtual o
  // titulo_cargo vem do cargo do vínculo; se o texto não bater (acento/caixa),
  // resolvemos aqui para o nome canônico e, em último caso, oferecemos o texto
  // original como opção para o campo obrigatório não travar o formulário.
  const normalizar = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const cargoCasado = form.titulo_cargo
    ? cargosParam.find((c) => normalizar(c.label) === normalizar(form.titulo_cargo))
    : undefined;
  const cargoValue = cargoCasado ? cargoCasado.label : form.titulo_cargo;
  const cargoOpcoes =
    form.titulo_cargo && !cargoCasado
      ? [...cargosParam, { id: `__atual__`, label: form.titulo_cargo }]
      : cargosParam;

  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async () => {
    if (!form.titulo_cargo || !form.departamento) return;

    const payload = {
      titulo_cargo: cargoValue,
      nivel_hierarquico: form.nivel_hierarquico,
      departamento: form.departamento,
      area: form.area || null,
      filial: form.filial || null,
      status: form.status,
      id_pai: form.id_pai || null,
      salario_previsto: form.salario_previsto ? Number(form.salario_previsto) : null,
      centro_custo: form.centro_custo || null,
    };

    if (!editNode) {
      createMutation.mutate(payload, { onSuccess: onClose });
      return;
    }

    setSalvando(true);
    try {
      // 1. Resolve o pai: nó virtual escolhido como gestor precisa existir de fato.
      let idPai = payload.id_pai;
      if (idPai && idPai.startsWith("virtual-")) {
        const paiNode = allNodes.find((n) => n.id === idPai);
        if (!paiNode) throw new Error("Posição superior não encontrada.");
        idPai = await materializarSeVirtual(paiNode);
      }

      // 2. Nó virtual: materializa e atualiza o id real com o formulário.
      const idReal = await materializarSeVirtual(editNode);

      const { error } = await supabase
        .from("posicoes")
        .update({ ...payload, id_pai: idPai })
        .eq("id", idReal);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["organograma"] });
      toast.success("Posição atualizada com sucesso");
      onClose();
    } catch (e) {
      toast.error(`Erro ao atualizar: ${formatError(e)}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleDelete = () => {
    if (!editNode) return;
    if (ehVirtual) return;
    if (editNode.subordinados_diretos > 0) return;
    deleteMutation.mutate(editNode.id, { onSuccess: onClose });
  };

  const isPending = createMutation.isPending || salvando;


  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editNode ? "Editar Posição" : "Nova Posição"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Cargo *</Label>
            {loadingCargos ? <Loader2 className="h-4 w-4 animate-spin mt-2" /> : (
              <Select value={cargoValue} onValueChange={(v) => setForm({ ...form, titulo_cargo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                <SelectContent>
                  {cargoOpcoes.map((c) => (
                    <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Nível Hierárquico</Label>
              <Select value={String(form.nivel_hierarquico)} onValueChange={(v) => setForm({ ...form, nivel_hierarquico: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(nivelLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ocupado">Ocupado</SelectItem>
                  <SelectItem value="vaga_aberta">Vaga Aberta</SelectItem>
                  <SelectItem value="previsto">Previsto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Departamento *</Label>
              <SelectDepartamentoHierarquico
                valueTexto={form.departamento}
                onChange={(dep) => {
                  const areaDona = (estrutura || []).find((a) => a.valor === dep?.pai_valor);
                  setForm({
                    ...form,
                    departamento: dep?.label || "",
                    area: areaDona?.label || form.area || "",
                  });
                }}
              />
              {form.area && (
                <p className="text-xs text-muted-foreground">
                  Área: <strong>{form.area}</strong>
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label>Área</Label>
              <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Ex: Vendas" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Filial</Label>
              <Input value={form.filial} onChange={(e) => setForm({ ...form, filial: e.target.value })} placeholder="Ex: Matriz" />
            </div>

            <div className="grid gap-1.5">
              <Label>Centro de Custo</Label>
              <Input value={form.centro_custo} onChange={(e) => setForm({ ...form, centro_custo: e.target.value })} placeholder="Ex: CC-100" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Posição Superior (Gestor)</Label>
            <Select value={form.id_pai || "none"} onValueChange={(v) => setForm({ ...form, id_pai: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma (posição raiz)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma (posição raiz)</SelectItem>
                {parentOptions.map(n => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.nome_display || n.titulo_cargo} — {n.titulo_cargo} ({n.departamento})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canSeeSalary && (
            <div className="grid gap-1.5">
              <Label>Salário Previsto (R$)</Label>
              <Input
                type="number"
                value={form.salario_previsto}
                onChange={(e) => setForm({ ...form, salario_previsto: e.target.value })}
                placeholder="Ex: 15000"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div>
            {editNode && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={ehVirtual || editNode.subordinados_diretos > 0 || deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir posição?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação removerá a posição "{editNode.titulo_cargo}" permanentemente. Essa ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.titulo_cargo || !form.departamento}>
              {isPending ? "Salvando..." : editNode ? "Salvar" : "Criar Posição"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
