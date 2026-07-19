import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Plus, Pencil, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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

type Natureza = "recorrente" | "pontual";

interface FormState {
  extra_id: string;
  natureza: Natureza;
  valor: string;
  competencia_ym: string; // YYYY-MM
  data_inicio: string;
  data_fim: string;
  observacoes: string;
  status: string;
}

const emptyForm = (): FormState => ({
  extra_id: "",
  natureza: "recorrente",
  valor: "",
  competencia_ym: new Date().toISOString().slice(0, 7),
  data_inicio: new Date().toISOString().slice(0, 10),
  data_fim: "",
  observacoes: "",
  status: "ativo",
});

function fmtCompetencia(iso: string | null): string {
  if (!iso) return "—";
  const [y, m] = iso.slice(0, 10).split("-");
  return `${m}/${y}`;
}
function fmtRange(ini: string | null, fim: string | null): string {
  const a = ini ? new Date(ini + "T00:00:00").toLocaleDateString("pt-BR") : "—";
  const b = fim ? new Date(fim + "T00:00:00").toLocaleDateString("pt-BR") : "vigente";
  return `${a} → ${b}`;
}

export default function VinculoExtrasSection({ vinculoId }: { vinculoId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [encerrarId, setEncerrarId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: catalogo = [] } = useQuery({
    queryKey: ["extras-catalogo-ativos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("extras_catalogo")
        .select("id, nome, natureza_padrao, aplica_a")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; natureza_padrao: string; aplica_a: string }[];
    },
  });

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["vinculo-extras", vinculoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vinculo_extras")
        .select("*, extras_catalogo(nome)")
        .eq("vinculo_id", vinculoId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const totalRecorrentes = useMemo(
    () => itens
      .filter((i) => i.status === "ativo" && i.natureza === "recorrente")
      .reduce((acc, i) => acc + Number(i.valor || 0), 0),
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
      extra_id: item.extra_id ?? "",
      natureza: (item.natureza ?? "recorrente") as Natureza,
      valor: String(item.valor ?? ""),
      competencia_ym: item.competencia ? String(item.competencia).slice(0, 7) : new Date().toISOString().slice(0, 7),
      data_inicio: item.data_inicio ?? "",
      data_fim: item.data_fim ?? "",
      observacoes: item.observacoes ?? "",
      status: item.status ?? "ativo",
    });
    setOpen(true);
  }

  function onSelectExtra(id: string) {
    const it = catalogo.find((c) => c.id === id);
    setForm((f) => ({
      ...f,
      extra_id: id,
      natureza: (it?.natureza_padrao as Natureza) || f.natureza,
    }));
  }

  async function salvar() {
    if (!form.extra_id) { toast.error("Selecione o extra"); return; }
    if (!form.valor) { toast.error("Informe o valor"); return; }

    // Coerência natureza ↔ datas
    const payload: any = {
      vinculo_id: vinculoId,
      extra_id: form.extra_id,
      valor: Number(form.valor),
      natureza: form.natureza,
      observacoes: form.observacoes || null,
    };
    if (form.natureza === "pontual") {
      if (!form.competencia_ym) { toast.error("Informe a competência"); return; }
      payload.competencia = `${form.competencia_ym}-01`;
      payload.data_inicio = null;
      payload.data_fim = null;
    } else {
      if (!form.data_inicio) { toast.error("Informe a data de início"); return; }
      payload.data_inicio = form.data_inicio;
      payload.data_fim = form.data_fim || null;
      payload.competencia = null;
    }

    setSaving(true);
    try {
      if (editingId) {
        payload.status = form.status;
        const { error } = await (supabase as any).from("vinculo_extras").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Extra atualizado");
      } else {
        payload.status = "ativo";
        const { error } = await (supabase as any).from("vinculo_extras").insert(payload);
        if (error) throw error;
        toast.success("Extra adicionado");
      }
      qc.invalidateQueries({ queryKey: ["vinculo-extras", vinculoId] });
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
      const { error } = await (supabase as any)
        .from("vinculo_extras")
        .update({ status: "encerrado" })
        .eq("id", encerrarId);
      if (error) throw error;
      toast.success("Extra encerrado");
      qc.invalidateQueries({ queryKey: ["vinculo-extras", vinculoId] });
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
          <Coins className="h-4 w-4" /> Extras
        </CardTitle>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar extra
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum extra cadastrado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 px-2">Extra</th>
                  <th className="text-left py-2 px-2">Natureza</th>
                  <th className="text-right py-2 px-2">Valor</th>
                  <th className="text-left py-2 px-2">Período / Competência</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-right py-2 px-2 w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{i.extras_catalogo?.nome ?? "—"}</td>
                    <td className="py-2 px-2">
                      <Badge variant="outline">{i.natureza}</Badge>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(i.valor)}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {i.natureza === "pontual" ? fmtCompetencia(i.competencia) : fmtRange(i.data_inicio, i.data_fim)}
                    </td>
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
                  <td className="py-2 px-2">Extras recorrentes/mês</td>
                  <td></td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(totalRecorrentes)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar extra" : "Adicionar extra"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Extra *</Label>
              <Select value={form.extra_id} onValueChange={onSelectExtra}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {catalogo.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} <span className="text-xs text-muted-foreground ml-2">({c.natureza_padrao})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Natureza *</Label>
              <Select value={form.natureza} onValueChange={(v) => setForm({ ...form, natureza: v as Natureza })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recorrente">Recorrente</SelectItem>
                  <SelectItem value="pontual">Pontual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>

            {form.natureza === "pontual" ? (
              <div className="md:col-span-2">
                <Label>Competência *</Label>
                <Input type="month" value={form.competencia_ym}
                  onChange={(e) => setForm({ ...form, competencia_ym: e.target.value })} />
              </div>
            ) : (
              <>
                <div>
                  <Label>Data início *</Label>
                  <Input type="date" value={form.data_inicio}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
                </div>
                <div>
                  <Label>Data fim (opcional)</Label>
                  <Input type="date" value={form.data_fim}
                    onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
                </div>
              </>
            )}

            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
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
            <AlertDialogTitle>Encerrar extra?</AlertDialogTitle>
            <AlertDialogDescription>
              O extra ficará com status "encerrado". O histórico é preservado.
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
