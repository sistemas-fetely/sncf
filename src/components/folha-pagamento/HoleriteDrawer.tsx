import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Pencil, Save, X, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { calcularFolha, type DadosCalculo } from "@/lib/calculo-folha";
import { useEditarHolerite, type HoleriteComColaborador } from "@/hooks/useFolhaPagamento";
import { useParametrosFolha } from "@/hooks/useParametrosFolha";
import { SalarioMasked } from "@/components/SalarioMasked";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";

const fmt = (v: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  holerite: HoleriteComColaborador | null;
  open: boolean;
  onClose: () => void;
  competenciaId: string | null;
  canEdit: boolean; // false when competência is fechada
}

function Linha({ label, valor, tipo }: { label: string; valor: number | null; tipo?: "provento" | "desconto" | "neutro" }) {
  const color = tipo === "desconto" ? "text-destructive" : tipo === "provento" ? "text-success" : "";
  const prefix = tipo === "desconto" ? "- " : tipo === "provento" ? "+ " : "";
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${color}`}>{prefix}{fmt(valor)}</span>
    </div>
  );
}

interface EditForm {
  horasExtras50Qtd: number;
  horasExtras100Qtd: number;
  faltasDias: number;
  descontoVT: boolean;
  descontoVR: number;
  descontoPlanoSaude: number;
  outrosProventos: number;
  outrosDescontos: number;
}

function NumField({ label, value, onChange, min = 0, step = "1" }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; step?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-8 text-sm"
      />
    </div>
  );
}

export function HoleriteDrawer({ holerite, open, onClose, competenciaId, canEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const editMut = useEditarHolerite();
  const { data: parametrosFolha } = useParametrosFolha();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [form, setForm] = useState<EditForm>({
    horasExtras50Qtd: 0, horasExtras100Qtd: 0, faltasDias: 0,
    descontoVT: true, descontoVR: 0, descontoPlanoSaude: 0,
    outrosProventos: 0, outrosDescontos: 0,
  });

  const handleDeleteHolerite = async () => {
    if (!holerite) return;
    const { error } = await supabase.from("holerites").delete().eq("id", holerite.id);
    if (error) toast.error(humanizeError(error.message));
    else {
      toast.success("Holerite excluído");
      queryClient.invalidateQueries({ queryKey: ["holerites"] });
      setShowDeleteDialog(false);
      onClose();
    }
  };

  // Reset form when holerite changes
  useEffect(() => {
    if (holerite) {
      setForm({
        horasExtras50Qtd: holerite.horas_extras_50_qtd ?? 0,
        horasExtras100Qtd: holerite.horas_extras_100_qtd ?? 0,
        faltasDias: holerite.faltas_dias ?? 0,
        descontoVT: (holerite.vt_desconto ?? 0) > 0,
        descontoVR: holerite.vr_desconto ?? 0,
        descontoPlanoSaude: holerite.plano_saude ?? 0,
        outrosProventos: holerite.outros_proventos ?? 0,
        outrosDescontos: holerite.outros_descontos ?? 0,
      });
      setEditing(false);
    }
  }, [holerite]);

  // Live preview of calculation while editing
  const preview = useMemo(() => {
    if (!editing || !holerite) return null;
    const dados: DadosCalculo = {
      salarioBase: holerite.salario_base,
      horasExtras50Qtd: form.horasExtras50Qtd,
      horasExtras100Qtd: form.horasExtras100Qtd,
      faltasDias: form.faltasDias,
      jornadaMensal: (holerite.colaborador?.jornada_semanal ?? 44) * (220 / 44),
      numDependentes: 0, // will be fetched server-side on save
      descontoVT: form.descontoVT,
      descontoVR: form.descontoVR,
      descontoPlanoSaude: form.descontoPlanoSaude,
      outrosProventos: form.outrosProventos,
      outrosDescontos: form.outrosDescontos,
    };
    return calcularFolha(dados, parametrosFolha);
  }, [editing, form, holerite, parametrosFolha]);

  if (!holerite) return null;
  const h = holerite;

  const handleSave = () => {
    if (!competenciaId) return;
    editMut.mutate({
      holeriteId: h.id,
      competenciaId,
      colaboradorId: h.colaborador_id,
      salarioBase: h.salario_base,
      horasExtras50Qtd: form.horasExtras50Qtd,
      horasExtras100Qtd: form.horasExtras100Qtd,
      faltasDias: form.faltasDias,
      jornadaMensal: (h.colaborador?.jornada_semanal ?? 44) * (220 / 44),
      numDependentes: 0, // will use server-side dep count
      descontoVT: form.descontoVT,
      descontoVR: form.descontoVR,
      descontoPlanoSaude: form.descontoPlanoSaude,
      outrosProventos: form.outrosProventos,
      outrosDescontos: form.outrosDescontos,
      params: parametrosFolha,
    }, {
      onSuccess: () => {
        setEditing(false);
        onClose();
      },
    });
  };

  const upd = (key: keyof EditForm, val: any) => setForm((f) => ({ ...f, [key]: val }));

  // Display values: use preview when editing, otherwise holerite values
  const d = editing && preview ? {
    total_proventos: preview.totalProventos,
    inss: preview.inss,
    irrf: preview.irrf,
    vt_desconto: preview.vtDesconto,
    vr_desconto: preview.vrDesconto,
    plano_saude: preview.planoSaude,
    faltas_desconto: preview.faltasDesconto,
    outros_descontos: preview.outrosDescontos,
    total_descontos: preview.totalDescontos,
    salario_liquido: preview.salarioLiquido,
    fgts: preview.fgts,
    inss_patronal: preview.inssPatronal,
    total_encargos: preview.totalEncargos,
    horas_extras_50: preview.horasExtras50,
    horas_extras_100: preview.horasExtras100,
    adicional_noturno: preview.adicionalNoturno,
    outros_proventos: preview.outrosProventos,
  } : h;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { setEditing(false); onClose(); } }}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between pr-2">
            <div>
              <SheetTitle>{h.colaborador?.nome_completo}</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {h.colaborador?.cargo} — {h.colaborador?.departamento}
              </p>
            </div>
            {canEdit && !editing && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                </Button>
                {isSuperAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {/* Edit form */}
          {editing && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <h4 className="text-sm font-medium">Editar Valores</h4>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="HE 50% (horas)" value={form.horasExtras50Qtd} onChange={(v) => upd("horasExtras50Qtd", v)} step="0.5" />
                <NumField label="HE 100% (horas)" value={form.horasExtras100Qtd} onChange={(v) => upd("horasExtras100Qtd", v)} step="0.5" />
                <NumField label="Faltas (dias)" value={form.faltasDias} onChange={(v) => upd("faltasDias", v)} step="0.5" />
                <NumField label="VR Desconto (R$)" value={form.descontoVR} onChange={(v) => upd("descontoVR", v)} step="0.01" />
                <NumField label="Plano Saúde (R$)" value={form.descontoPlanoSaude} onChange={(v) => upd("descontoPlanoSaude", v)} step="0.01" />
                <NumField label="Outros Proventos (R$)" value={form.outrosProventos} onChange={(v) => upd("outrosProventos", v)} step="0.01" />
                <NumField label="Outros Descontos (R$)" value={form.outrosDescontos} onChange={(v) => upd("outrosDescontos", v)} step="0.01" />
                <div className="flex items-center gap-2 pt-4">
                  <Switch checked={form.descontoVT} onCheckedChange={(v) => upd("descontoVT", v)} />
                  <Label className="text-xs">Desconto VT (6%)</Label>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSave} disabled={editMut.isPending}>
                  <Save className="h-3.5 w-3.5 mr-1" /> {editMut.isPending ? "Salvando..." : "Salvar e Recalcular"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Proventos */}
          <div>
            <h4 className="text-sm font-medium text-success mb-2">Proventos</h4>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted-foreground">Salário Base</span>
              <span className="font-medium text-success">+ <SalarioMasked valor={h.salario_base} userId={(h.colaborador as any)?.user_id || null} contexto="holerite" /></span>
            </div>
            {(d.horas_extras_50 ?? 0) > 0 && (
              <Linha label={`Horas Extras 50% (${form.horasExtras50Qtd || h.horas_extras_50_qtd}h)`} valor={d.horas_extras_50} tipo="provento" />
            )}
            {(d.horas_extras_100 ?? 0) > 0 && (
              <Linha label={`Horas Extras 100% (${form.horasExtras100Qtd || h.horas_extras_100_qtd}h)`} valor={d.horas_extras_100} tipo="provento" />
            )}
            {(d.adicional_noturno ?? 0) > 0 && (
              <Linha label="Adicional Noturno" valor={d.adicional_noturno} tipo="provento" />
            )}
            {(d.outros_proventos ?? 0) > 0 && (
              <Linha label="Outros Proventos" valor={d.outros_proventos} tipo="provento" />
            )}
            <Separator />
            <div className="flex justify-between font-medium text-sm py-1">
              <span>Total Proventos</span>
              <span className="text-success">
                <SalarioMasked valor={d.total_proventos} userId={(h.colaborador as any)?.user_id || null} contexto="holerite" />
              </span>
            </div>
          </div>

          {/* Descontos */}
          <div>
            <h4 className="text-sm font-medium text-destructive mb-2">Descontos</h4>
            <Linha label="INSS" valor={d.inss} tipo="desconto" />
            <Linha label="IRRF" valor={d.irrf} tipo="desconto" />
            {(d.vt_desconto ?? 0) > 0 && <Linha label="Vale Transporte (6%)" valor={d.vt_desconto} tipo="desconto" />}
            {(d.vr_desconto ?? 0) > 0 && <Linha label="Vale Refeição" valor={d.vr_desconto} tipo="desconto" />}
            {(d.plano_saude ?? 0) > 0 && <Linha label="Plano de Saúde" valor={d.plano_saude} tipo="desconto" />}
            {(d.faltas_desconto ?? 0) > 0 && (
              <Linha label={`Faltas (${form.faltasDias || h.faltas_dias} dias)`} valor={d.faltas_desconto} tipo="desconto" />
            )}
            {(d.outros_descontos ?? 0) > 0 && <Linha label="Outros Descontos" valor={d.outros_descontos} tipo="desconto" />}
            <Separator />
            <div className="flex justify-between font-medium text-sm py-1">
              <span>Total Descontos</span>
              <span className="text-destructive">{fmt(d.total_descontos)}</span>
            </div>
          </div>

          {/* Líquido */}
          <div className="rounded-lg bg-muted p-4">
            <div className="flex justify-between text-base font-medium">
              <span>Salário Líquido</span>
              <SalarioMasked valor={d.salario_liquido} userId={(h.colaborador as any)?.user_id || null} contexto="holerite" />
            </div>
          </div>

          {/* Encargos */}
          <div>
            <h4 className="text-sm font-medium mb-2">Encargos Patronais</h4>
            <Linha label={`FGTS (${((parametrosFolha?.aliquotaFGTS ?? 0.08) * 100).toFixed(0)}%)`} valor={d.fgts} tipo="neutro" />
            <Linha label={`INSS Patronal (${((parametrosFolha?.aliquotaINSSPatronal ?? 0.20) * 100).toFixed(0)}%)`} valor={d.inss_patronal} tipo="neutro" />
            <Separator />
            <div className="flex justify-between font-medium text-sm py-1">
              <span>Total Encargos</span>
              <span>{fmt(d.total_encargos)}</span>
            </div>
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir holerite permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              O holerite de "{h.colaborador?.nome_completo}" será excluído. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHolerite} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
