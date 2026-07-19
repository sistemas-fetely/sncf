import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, Plus, Pencil, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

function fmtBRL(n: number | string | null | undefined) {
  const v = Number(n || 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface FormState {
  beneficio_id: string;
  valor_empresa: string;
  valor_desconto: string;
  operadora: string;
  numero_cartao: string;
  data_inicio: string;
  status: string;
}

const emptyForm = (): FormState => ({
  beneficio_id: "",
  valor_empresa: "",
  valor_desconto: "0",
  operadora: "",
  numero_cartao: "",
  data_inicio: new Date().toISOString().slice(0, 10),
  status: "ativo",
});

export default function VinculoBeneficiosSection({ vinculoId }: { vinculoId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [encerrarId, setEncerrarId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: catalogo = [] } = useQuery({
    queryKey: ["beneficios-catalogo-ativos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("beneficios_catalogo")
        .select("id, beneficio")
        .eq("ativo", true)
        .order("beneficio");
      if (error) throw error;
      return (data ?? []) as { id: string; beneficio: string }[];
    },
  });

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["vinculo-beneficios", vinculoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vinculo_beneficios")
        .select("*, beneficios_catalogo(beneficio)")
        .eq("vinculo_id", vinculoId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const totalAtivos = useMemo(
    () => itens.filter((i) => i.status === "ativo").reduce((acc, i) => acc + Number(i.valor_empresa || 0), 0),
    [itens],
  );

  function abrirNovo() {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }
  function abrirEdicao(item: any) {
    setEditingId(item.id);
    setForm({
      beneficio_id: item.beneficio_id ?? "",
      valor_empresa: String(item.valor_empresa ?? ""),
      valor_desconto: String(item.valor_desconto ?? "0"),
      operadora: item.operadora ?? "",
      numero_cartao: item.numero_cartao ?? "",
      data_inicio: item.data_inicio ?? new Date().toISOString().slice(0, 10),
      status: item.status ?? "ativo",
    });
    setOpen(true);
  }

  async function salvar() {
    if (!form.beneficio_id) { toast.error("Selecione o benefício"); return; }
    if (!form.valor_empresa) { toast.error("Informe o valor da empresa"); return; }
    if (!form.data_inicio) { toast.error("Informe a data de início"); return; }
    setSaving(true);
    try {
      const payload: any = {
        vinculo_id: vinculoId,
        beneficio_id: form.beneficio_id,
        valor_empresa: Number(form.valor_empresa),
        valor_desconto: Number(form.valor_desconto || 0),
        operadora: form.operadora || null,
        numero_cartao: form.numero_cartao || null,
        data_inicio: form.data_inicio,
      };
      if (editingId) {
        payload.status = form.status;
        const { error } = await (supabase as any).from("vinculo_beneficios").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Benefício atualizado");
      } else {
        payload.status = "ativo";
        const { error } = await (supabase as any).from("vinculo_beneficios").insert(payload);
        if (error) throw error;
        toast.success("Benefício adicionado");
      }
      qc.invalidateQueries({ queryKey: ["vinculo-beneficios", vinculoId] });
      setOpen(false);
    } catch (e: any) {
      toast.error(humanizeError(e?.message));
    } finally {
      setSaving(false);
    }
  }

  async function encerrar() {
    if (!encerrarId) return;
    setSaving(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const { error } = await (supabase as any)
        .from("vinculo_beneficios")
        .update({ status: "encerrado", data_fim: hoje })
        .eq("id", encerrarId);
      if (error) throw error;
      toast.success("Benefício encerrado");
      qc.invalidateQueries({ queryKey: ["vinculo-beneficios", vinculoId] });
      setEncerrarId(null);
    } catch (e: any) {
      toast.error(humanizeError(e?.message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Heart className="h-4 w-4" /> Benefícios
        </CardTitle>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar benefício
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum benefício cadastrado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 px-2">Benefício</th>
                  <th className="text-right py-2 px-2">Valor empresa</th>
                  <th className="text-right py-2 px-2">Desconto</th>
                  <th className="text-left py-2 px-2">Operadora</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-right py-2 px-2 w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{i.beneficios_catalogo?.beneficio ?? "—"}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(i.valor_empresa)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtBRL(i.valor_desconto)}</td>
                    <td className="py-2 px-2">{i.operadora ?? "—"}</td>
                    <td className="py-2 px-2">
                      <Badge variant={i.status === "ativo" ? "default" : "secondary"}>{i.status}</Badge>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => abrirEdicao(i)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {i.status === "ativo" && (
                        <Button size="icon" variant="ghost" onClick={() => setEncerrarId(i.id)} title="Encerrar">
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="py-2 px-2">Total ativos</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(totalAtivos)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar benefício" : "Adicionar benefício"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Benefício *</Label>
              <Select value={form.beneficio_id} onValueChange={(v) => setForm({ ...form, beneficio_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {catalogo.map((c) => <SelectItem key={c.id} value={c.id}>{c.beneficio}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor empresa (R$) *</Label>
              <Input type="number" step="0.01" value={form.valor_empresa}
                onChange={(e) => setForm({ ...form, valor_empresa: e.target.value })} />
            </div>
            <div>
              <Label>Valor desconto (R$)</Label>
              <Input type="number" step="0.01" value={form.valor_desconto}
                onChange={(e) => setForm({ ...form, valor_desconto: e.target.value })} />
            </div>
            <div>
              <Label>Operadora</Label>
              <Input value={form.operadora} onChange={(e) => setForm({ ...form, operadora: e.target.value })} />
            </div>
            <div>
              <Label>Número do cartão</Label>
              <Input value={form.numero_cartao} onChange={(e) => setForm({ ...form, numero_cartao: e.target.value })} />
            </div>
            <div>
              <Label>Data início *</Label>
              <Input type="date" value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
            </div>
            {editingId && (
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="encerrado">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!encerrarId} onOpenChange={(o) => { if (!o) setEncerrarId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar benefício?</AlertDialogTitle>
            <AlertDialogDescription>
              O benefício ficará com status "encerrado" e data fim = hoje. O histórico é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void encerrar(); }} disabled={saving}>
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
