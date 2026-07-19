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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, Wallet } from "lucide-react";
import { humanizeError } from "@/lib/errorMessages";

interface ExtraCatalogo {
  id: string;
  nome: string;
  natureza_padrao: "recorrente" | "pontual" | string;
  aplica_a: "clt" | "pj" | "ambos" | string;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

function useExtrasAll() {
  return useQuery({
    queryKey: ["extras-catalogo-all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("extras_catalogo")
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data || []) as ExtraCatalogo[];
    },
  });
}

const APLICA_LABEL: Record<string, string> = {
  ambos: "Ambos",
  clt: "CLT",
  pj: "PJ",
};

const NATUREZA_LABEL: Record<string, string> = {
  recorrente: "Recorrente",
  pontual: "Pontual",
};

function FormDialog({
  open, onClose, registro,
}: { open: boolean; onClose: () => void; registro: ExtraCatalogo | null }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState(registro?.nome || "");
  const [naturezaPadrao, setNaturezaPadrao] = useState<string>(registro?.natureza_padrao || "recorrente");
  const [aplicaA, setAplicaA] = useState<string>(registro?.aplica_a || "ambos");
  const [ativo, setAtivo] = useState(registro ? registro.ativo : true);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      if (registro) {
        const { error } = await (supabase as any).from("extras_catalogo").update({
          nome: nome.trim(),
          natureza_padrao: naturezaPadrao,
          aplica_a: aplicaA,
          ativo,
        }).eq("id", registro.id);
        if (error) throw error;
        toast.success("Extra atualizado!");
      } else {
        const { error } = await (supabase as any).from("extras_catalogo").insert({
          nome: nome.trim(),
          natureza_padrao: naturezaPadrao,
          aplica_a: aplicaA,
          ativo: true,
        });
        if (error) throw error;
        toast.success("Extra adicionado!");
      }
      queryClient.invalidateQueries({ queryKey: ["extras-catalogo-all"] });
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
          <DialogTitle>{registro ? "Editar" : "Novo"} Extra</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Adiantamento, Bônus, Comissão" />
          </div>
          <div className="space-y-2">
            <Label>Natureza padrão</Label>
            <Select value={naturezaPadrao} onValueChange={setNaturezaPadrao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recorrente">Recorrente</SelectItem>
                <SelectItem value="pontual">Pontual</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Sugestão padrão ao lançar em uma pessoa.</p>
          </div>
          <div className="space-y-2">
            <Label>Aplica a</Label>
            <Select value={aplicaA} onValueChange={setAplicaA}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ambos">Ambos</SelectItem>
                <SelectItem value="clt">CLT</SelectItem>
                <SelectItem value="pj">PJ</SelectItem>
              </SelectContent>
            </Select>
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

export default function ParametrosExtrasSection() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useExtrasAll();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExtraCatalogo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExtraCatalogo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleToggleAtivo = async (e: ExtraCatalogo) => {
    try {
      const { error } = await (supabase as any).from("extras_catalogo").update({ ativo: !e.ativo }).eq("id", e.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["extras-catalogo-all"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar";
      toast.error(humanizeError(message));
    }
  };

  const handleDeactivate = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await (supabase as any).from("extras_catalogo").update({ ativo: false }).eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Extra desativado");
      queryClient.invalidateQueries({ queryKey: ["extras-catalogo-all"] });
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
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Extras</CardTitle>
            <p className="text-sm text-muted-foreground">
              Catálogo de extras recorrentes e pontuais (adiantamento, bônus, comissão, etc.)
            </p>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Novo extra
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum extra cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {items.map((e) => (
              <div key={e.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Switch checked={e.ativo} onCheckedChange={() => handleToggleAtivo(e)} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{e.nome}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {NATUREZA_LABEL[e.natureza_padrao] || e.natureza_padrao}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {APLICA_LABEL[e.aplica_a] || e.aplica_a}
                      </Badge>
                      {e.ativo ? (
                        <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(e); setFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(e)} disabled={!e.ativo}>
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
            <AlertDialogTitle>Desativar extra?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.nome}" será marcado como inativo e deixará de aparecer nas listas de seleção. O histórico é preservado.
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
