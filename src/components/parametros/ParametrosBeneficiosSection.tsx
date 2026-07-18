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
import { Plus, Pencil, Trash2, Loader2, Heart } from "lucide-react";
import { humanizeError } from "@/lib/errorMessages";

interface BeneficioCatalogo {
  id: string;
  beneficio: string;
  tipo: string | null;
  ativo: boolean;
  criado_por: string | null;
  created_at?: string;
  updated_at?: string;
}

function useBeneficiosAll() {
  return useQuery({
    queryKey: ["beneficios-catalogo-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beneficios_catalogo")
        .select("*")
        .order("beneficio");
      if (error) throw error;
      return (data || []) as BeneficioCatalogo[];
    },
  });
}

function FormDialog({
  open, onClose, registro,
}: { open: boolean; onClose: () => void; registro: BeneficioCatalogo | null }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [beneficio, setBeneficio] = useState(registro?.beneficio || "");
  const [tipo, setTipo] = useState(registro?.tipo || "");
  const [ativo, setAtivo] = useState(registro ? registro.ativo : true);

  const handleSave = async () => {
    if (!beneficio.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      if (registro) {
        const { error } = await supabase.from("beneficios_catalogo").update({
          beneficio: beneficio.trim(),
          tipo: tipo.trim() || "todos",
          ativo,
        }).eq("id", registro.id);
        if (error) throw error;
        toast.success("Benefício atualizado!");
      } else {
        const { error } = await supabase.from("beneficios_catalogo").insert({
          beneficio: beneficio.trim(),
          tipo: tipo.trim() || "todos",
          ativo: true,
          criado_por: "usuario",
        });
        if (error) throw error;
        toast.success("Benefício adicionado!");
      }
      queryClient.invalidateQueries({ queryKey: ["beneficios-catalogo-all"] });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(humanizeError(message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{registro ? "Editar" : "Novo"} Benefício</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={beneficio} onChange={(e) => setBeneficio(e.target.value)} placeholder="Ex: Vale Refeição" />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="todos / clt / pj / categoria" />
            <p className="text-xs text-muted-foreground">Escopo ou categoria do benefício (campo livre). Padrão: "todos".</p>
          </div>
          {registro && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Ativo</Label>
                <p className="text-xs text-muted-foreground">Disponível para vinculação a pessoas.</p>
              </div>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </div>
          )}
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

export default function ParametrosBeneficiosSection() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useBeneficiosAll();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BeneficioCatalogo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BeneficioCatalogo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleToggleAtivo = async (b: BeneficioCatalogo) => {
    try {
      const { error } = await supabase.from("beneficios_catalogo").update({ ativo: !b.ativo }).eq("id", b.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["beneficios-catalogo-all"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar";
      toast.error(humanizeError(message));
    }
  };

  const handleDeactivate = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("beneficios_catalogo").update({ ativo: false }).eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Benefício desativado");
      queryClient.invalidateQueries({ queryKey: ["beneficios-catalogo-all"] });
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao desativar";
      toast.error(humanizeError(message));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded bg-muted flex items-center justify-center flex-shrink-0">
            <Heart className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Benefícios</CardTitle>
            <p className="text-sm text-muted-foreground">
              Catálogo de tipos de benefícios oferecidos pela empresa
            </p>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Novo benefício
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum benefício cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {items.map((b) => (
              <div key={b.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Switch checked={b.ativo} onCheckedChange={() => handleToggleAtivo(b)} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{b.beneficio}</span>
                      {b.tipo && <Badge variant="outline" className="text-[10px]">{b.tipo}</Badge>}
                      {b.ativo ? (
                        <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(b); setFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(b)} disabled={!b.ativo}>
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
            <AlertDialogTitle>Desativar benefício?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.beneficio}" será marcado como inativo e deixará de aparecer nas listas de seleção. O histórico é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
