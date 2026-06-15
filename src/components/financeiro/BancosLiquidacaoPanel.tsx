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
import { Plus, Pencil, Trash2, Loader2, ChevronRight } from "lucide-react";

interface Banco {
  id: string;
  nome: string;
  ativo: boolean | null;
}

interface Regra {
  id: string;
  banco_id: string;
  meio_pagamento: string;
  offset_primeira_dias: number | null;
  offset_entre_parcelas_dias: number | null;
  usa_vencimento: boolean | null;
  ativo: boolean | null;
}

const MEIOS = [
  { value: "boleto", label: "Boleto" },
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão" },
  { value: "troca_mercadoria", label: "Troca de mercadoria" },
];

const meioLabel = (m: string) => MEIOS.find((x) => x.value === m)?.label ?? m;

function BancoDialog({
  open, onClose, banco,
}: { open: boolean; onClose: () => void; banco: Banco | null }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(banco?.nome || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      if (banco) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("banco_recebimento") as any)
          .update({ nome: nome.trim() }).eq("id", banco.id);
        if (error) throw error;
        toast.success("Atualizado!");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("banco_recebimento") as any)
          .insert({ nome: nome.trim(), ativo: true });
        if (error) throw error;
        toast.success("Banco adicionado!");
      }
      qc.invalidateQueries({ queryKey: ["banco-recebimento"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{banco ? "Editar banco" : "Novo banco"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Safra" />
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

function RegraDialog({
  open, onClose, bancoId, regra,
}: { open: boolean; onClose: () => void; bancoId: string; regra: Regra | null }) {
  const qc = useQueryClient();
  const [meio, setMeio] = useState(regra?.meio_pagamento || "pix");
  const [usaVenc, setUsaVenc] = useState<boolean>(!!regra?.usa_vencimento);
  const [offset1, setOffset1] = useState<number>(regra?.offset_primeira_dias ?? 0);
  const [offsetN, setOffsetN] = useState<string>(
    regra?.offset_entre_parcelas_dias != null ? String(regra.offset_entre_parcelas_dias) : ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        banco_id: bancoId,
        meio_pagamento: meio,
        usa_vencimento: usaVenc,
        offset_primeira_dias: usaVenc ? 0 : Number(offset1) || 0,
        offset_entre_parcelas_dias: usaVenc || offsetN === "" ? null : Number(offsetN),
      };
      if (regra) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("prazo_liquidacao") as any)
          .update(payload).eq("id", regra.id);
        if (error) throw error;
        toast.success("Regra atualizada!");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("prazo_liquidacao") as any)
          .insert({ ...payload, ativo: true });
        if (error) {
          if ((error as { code?: string }).code === "23505" || /duplicate|unique/i.test(error.message)) {
            toast.error("Já existe regra para esse meio neste banco.");
          } else {
            throw error;
          }
          return;
        }
        toast.success("Regra adicionada!");
      }
      qc.invalidateQueries({ queryKey: ["prazo-liquidacao", bancoId] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{regra ? "Editar regra" : "Nova regra de liquidação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Meio de pagamento *</Label>
            <Select value={meio} onValueChange={setMeio} disabled={!!regra}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEIOS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <Label className="text-sm">Usa data de vencimento</Label>
              <p className="text-xs text-muted-foreground">Liquidação = vencimento (ex: boleto)</p>
            </div>
            <Switch checked={usaVenc} onCheckedChange={setUsaVenc} />
          </div>
          <div className="space-y-2">
            <Label>D+N da 1ª parcela</Label>
            <Input
              type="number"
              value={offset1}
              onChange={(e) => setOffset1(Number(e.target.value))}
              disabled={usaVenc}
            />
          </div>
          <div className="space-y-2">
            <Label>Dias entre parcelas (opcional)</Label>
            <Input
              type="number"
              value={offsetN}
              onChange={(e) => setOffsetN(e.target.value)}
              disabled={usaVenc}
              placeholder="Ex: 30"
            />
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

function regraTexto(r: Regra): string {
  if (r.usa_vencimento) return "= data de vencimento";
  let t = `D+${r.offset_primeira_dias ?? 0}`;
  if (r.offset_entre_parcelas_dias != null) t += ` (+${r.offset_entre_parcelas_dias} entre parcelas)`;
  return t;
}

function RegrasPanel({ banco }: { banco: Banco }) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Regra | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Regra | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: regras, isLoading } = useQuery({
    queryKey: ["prazo-liquidacao", banco.id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("prazo_liquidacao") as any)
        .select("*").eq("banco_id", banco.id).order("meio_pagamento");
      if (error) throw error;
      return (data || []) as Regra[];
    },
  });

  const handleToggle = async (r: Regra) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("prazo_liquidacao") as any)
      .update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    qc.invalidateQueries({ queryKey: ["prazo-liquidacao", banco.id] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("prazo_liquidacao").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else toast.success("Regra removida");
    qc.invalidateQueries({ queryKey: ["prazo-liquidacao", banco.id] });
    setDeleteTarget(null);
    setDeleting(false);
  };

  return (
    <div className="border-t bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Regras de liquidação — {banco.nome}</h4>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Adicionar regra
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !regras || regras.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma regra cadastrada.</p>
      ) : (
        <div className="space-y-2">
          {regras.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-background border rounded-lg p-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Switch checked={!!r.ativo} onCheckedChange={() => handleToggle(r)} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{meioLabel(r.meio_pagamento)}</Badge>
                    <span className="text-sm font-mono">{regraTexto(r)}</span>
                    {!r.ativo && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(r); setFormOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <RegraDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          bancoId={banco.id}
          regra={editing}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
            <AlertDialogDescription>
              A regra de {deleteTarget && meioLabel(deleteTarget.meio_pagamento)} será removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const BancosLiquidacaoPanel = () => {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Banco | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Banco | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: bancos, isLoading } = useQuery({
    queryKey: ["banco-recebimento"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("banco_recebimento") as any)
        .select("*").order("nome");
      if (error) throw error;
      return (data || []) as Banco[];
    },
  });

  const handleToggle = async (b: Banco) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("banco_recebimento") as any)
      .update({ ativo: !b.ativo }).eq("id", b.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    qc.invalidateQueries({ queryKey: ["banco-recebimento"] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("banco_recebimento").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else toast.success("Banco removido");
    qc.invalidateQueries({ queryKey: ["banco-recebimento"] });
    setDeleteTarget(null);
    setDeleting(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg">Bancos &amp; Liquidação</CardTitle>
          <p className="text-sm text-muted-foreground">
            Adquirentes/bancos que liquidam recebíveis e as regras de liquidação por meio de pagamento.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Adicionar banco
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !bancos || bancos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum banco cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {bancos.map((b) => {
              const expanded = expandedId === b.id;
              return (
                <div key={b.id} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Switch checked={!!b.ativo} onCheckedChange={() => handleToggle(b)} />
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : b.id)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                        <span className="font-medium text-sm">{b.nome}</span>
                        {!b.ativo && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(b); setFormOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(b)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {expanded && <RegrasPanel banco={b} />}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {formOpen && (
        <BancoDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          banco={editing}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir banco?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.nome}" e todas as suas regras serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
