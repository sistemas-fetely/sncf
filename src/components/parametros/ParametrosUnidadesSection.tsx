import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Building2 } from "lucide-react";
import type { Unidade, TipoUnidade } from "@/types/permissoes-v2";

const TIPOS: { value: TipoUnidade; label: string }[] = [
  { value: "matriz", label: "Matriz" },
  { value: "filial", label: "Filial" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "fabrica", label: "Fábrica" },
  { value: "externa", label: "Externa" },
];

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function maskCnpj(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function slugify(v: string) {
  return v.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function useUnidadesAll() {
  return useQuery({
    queryKey: ["unidades-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unidades").select("*").order("nome");
      if (error) throw error;
      return (data || []) as Unidade[];
    },
  });
}

function FormDialog({
  open, onClose, registro,
}: { open: boolean; onClose: () => void; registro: Unidade | null }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [codigo, setCodigo] = useState(registro?.codigo || "");
  const [nome, setNome] = useState(registro?.nome || "");
  const [tipo, setTipo] = useState<TipoUnidade>((registro?.tipo as TipoUnidade) || "filial");
  const [cnpj, setCnpj] = useState(registro?.cnpj || "");
  const [cidade, setCidade] = useState(registro?.cidade || "");
  const [estado, setEstado] = useState(registro?.estado || "");
  const [ativa, setAtiva] = useState(registro ? registro.ativa : true);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!tipo) { toast.error("Tipo é obrigatório"); return; }
    const codigoFinal = codigo.trim() || slugify(nome);
    if (!codigoFinal) { toast.error("Código inválido"); return; }

    setSaving(true);
    try {
      const payload = {
        codigo: codigoFinal,
        nome: nome.trim(),
        tipo,
        cnpj: cnpj.trim() || null,
        cidade: cidade.trim() || null,
        estado: estado || null,
        ativa,
      };
      if (registro) {
        const { error } = await supabase.from("unidades").update(payload).eq("id", registro.id);
        if (error) throw error;
        toast.success("Unidade atualizada!");
      } else {
        const { error } = await supabase.from("unidades").insert(payload);
        if (error) throw error;
        toast.success("Unidade adicionada!");
      }
      queryClient.invalidateQueries({ queryKey: ["unidades-all"] });
      queryClient.invalidateQueries({ queryKey: ["unidades-ativas"] });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{registro ? "Editar" : "Nova"} Unidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Fetely Matriz SP" />
          </div>
          <div className="space-y-2">
            <Label>Código</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Auto-gerado a partir do nome" />
            <p className="text-xs text-muted-foreground">Identificador interno único (snake_case)</p>
          </div>
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoUnidade)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input value={cnpj} onChange={(e) => setCnpj(maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Cidade</Label>
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="São Paulo" />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Select value={estado || "__none__"} onValueChange={(v) => setEstado(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Ativa</Label>
              <p className="text-xs text-muted-foreground">Disponível para seleção em parceiros e contas.</p>
            </div>
            <Switch checked={ativa} onCheckedChange={setAtiva} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ParametrosUnidadesSection() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useUnidadesAll();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Unidade | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Unidade | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleToggleAtiva = async (u: Unidade) => {
    const { error } = await supabase.from("unidades").update({ ativa: !u.ativa }).eq("id", u.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    queryClient.invalidateQueries({ queryKey: ["unidades-all"] });
    queryClient.invalidateQueries({ queryKey: ["unidades-ativas"] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Checar vínculos (contas a pagar/receber, colaboradores CLT, contratos PJ)
      const [contas, clts, pjs] = await Promise.all([
        supabase.from("contas_pagar_receber").select("id", { count: "exact", head: true }).eq("unidade_id", deleteTarget.id),
        supabase.from("colaboradores_clt").select("id", { count: "exact", head: true }).eq("unidade_id", deleteTarget.id),
        supabase.from("contratos_pj").select("id", { count: "exact", head: true }).eq("unidade_id", deleteTarget.id),
      ]);
      const totalVinculos = (contas.count || 0) + (clts.count || 0) + (pjs.count || 0);

      if (totalVinculos > 0) {
        // Inativar em vez de excluir
        const { error } = await supabase.from("unidades").update({ ativa: false }).eq("id", deleteTarget.id);
        if (error) throw error;
        toast.success(`Unidade tem ${totalVinculos} vínculo(s). Foi inativada em vez de excluída.`);
      } else {
        const { error } = await supabase.from("unidades").delete().eq("id", deleteTarget.id);
        if (error) throw error;
        toast.success("Unidade removida");
      }
      queryClient.invalidateQueries({ queryKey: ["unidades-all"] });
      queryClient.invalidateQueries({ queryKey: ["unidades-ativas"] });
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao excluir";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const tipoLabel = (t: string) => TIPOS.find((x) => x.value === t)?.label || t;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded bg-muted flex items-center justify-center flex-shrink-0">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Unidades</CardTitle>
            <p className="text-sm text-muted-foreground">
              Filiais, fábricas e canais (matriz, ecommerce, fábrica, joinville, etc.)
            </p>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma unidade cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {items.map((u) => (
              <div key={u.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Switch checked={u.ativa} onCheckedChange={() => handleToggleAtiva(u)} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{u.nome}</span>
                      <Badge variant="secondary" className="text-[10px]">{tipoLabel(u.tipo)}</Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">{u.codigo}</Badge>
                      {!u.ativa && <Badge variant="secondary" className="text-[10px]">Inativa</Badge>}
                    </div>
                    {(u.cidade || u.estado) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[u.cidade, u.estado].filter(Boolean).join(" / ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(u); setFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(u)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {formOpen && (
        <FormDialog open={formOpen} onClose={() => setFormOpen(false)} registro={editing} />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir unidade?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.nome}" será removida. Se houver parceiros ou contas vinculados, ela será apenas inativada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
