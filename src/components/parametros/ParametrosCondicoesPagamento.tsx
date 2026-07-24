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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Pencil, Plus } from "lucide-react";

interface CondicaoPagamento {
  id: string;
  slug: string;
  rotulo: string;
  forma: "pix" | "cartao" | "boleto";
  condicao_canonica: string;
  regra_codigo: string;
  ativo: boolean;
  ordem: number;
  descricao: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const FORMAS: Array<{ value: "pix" | "cartao" | "boleto"; label: string }> = [
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão" },
  { value: "boleto", label: "Boleto" },
];

function FormDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: CondicaoPagamento | null;
}) {
  const qc = useQueryClient();
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [rotulo, setRotulo] = useState(editing?.rotulo ?? "");
  const [forma, setForma] = useState<"pix" | "cartao" | "boleto">(editing?.forma ?? "pix");
  const [condicao, setCondicao] = useState(editing?.condicao_canonica ?? "");
  const [regraCodigo, setRegraCodigo] = useState(editing?.regra_codigo ?? "");
  const [ordem, setOrdem] = useState(editing?.ordem ?? 0);
  const [ativo, setAtivo] = useState(editing?.ativo ?? true);
  const [descricao, setDescricao] = useState(editing?.descricao ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!slug.trim() || !rotulo.trim() || !condicao.trim() || !regraCodigo.trim()) {
      toast.error("Preencha slug, rótulo, condição canônica e código da regra.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await sb.rpc("condicao_pagamento_salvar", {
        p_slug: slug.trim(),
        p_rotulo: rotulo.trim(),
        p_forma: forma,
        p_condicao_canonica: condicao.trim(),
        p_regra_codigo: regraCodigo.trim(),
        p_ativo: ativo,
        p_ordem: ordem,
        p_descricao: descricao.trim() || null,
      });
      if (error) throw error;
      toast.success(editing ? "Condição atualizada" : "Condição cadastrada");
      qc.invalidateQueries({ queryKey: ["condicoes-pagamento-admin"] });
      qc.invalidateQueries({ queryKey: ["condicoes-pagamento-ativas"] });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar" : "Nova"} condição de pagamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={!!editing}
                placeholder="ex: boleto_30_60_90"
              />
            </div>
            <div className="space-y-1">
              <Label>Rótulo</Label>
              <Input value={rotulo} onChange={(e) => setRotulo(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Forma</Label>
              <Select value={forma} onValueChange={(v) => setForma(v as "pix" | "cartao" | "boleto")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={ordem}
                onChange={(e) => setOrdem(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Condição canônica</Label>
            <Input
              value={condicao}
              onChange={(e) => setCondicao(e.target.value)}
              placeholder='ex: "30/60/90" ou "PIX"'
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label>Código da regra</Label>
            <Input
              value={regraCodigo}
              onChange={(e) => setRegraCodigo(e.target.value)}
              placeholder="ex: boleto_sem_entrada"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label>Descrição (opcional)</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} id="cond-ativo" />
            <Label htmlFor="cond-ativo" className="cursor-pointer">Ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ParametrosCondicoesPagamento() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CondicaoPagamento | null>(null);

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["condicoes-pagamento-admin"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("condicoes_pagamento")
        .select("id, slug, rotulo, forma, condicao_canonica, regra_codigo, ativo, ordem, descricao")
        .order("forma")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CondicaoPagamento[];
    },
  });

  async function handleToggleAtivo(row: CondicaoPagamento) {
    try {
      const { error } = await sb.rpc("condicao_pagamento_salvar", {
        p_slug: row.slug,
        p_rotulo: row.rotulo,
        p_forma: row.forma,
        p_condicao_canonica: row.condicao_canonica,
        p_regra_codigo: row.regra_codigo,
        p_ativo: !row.ativo,
        p_ordem: row.ordem,
        p_descricao: row.descricao,
      });
      if (error) throw error;
      toast.success(row.ativo ? "Condição desativada" : "Condição ativada");
      qc.invalidateQueries({ queryKey: ["condicoes-pagamento-admin"] });
      qc.invalidateQueries({ queryKey: ["condicoes-pagamento-ativas"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function openNew() { setEditing(null); setFormOpen(true); }
  function openEdit(row: CondicaoPagamento) { setEditing(row); setFormOpen(true); }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg">Condições de Pagamento</CardTitle>
          <p className="text-sm text-muted-foreground">
            Modelos canônicos apresentados no editor de condição do pedido. Apenas Super Admin.
          </p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova condição
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma condição cadastrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rótulo</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Condição canônica</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead className="text-right">Ordem</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((r) => (
                <TableRow key={r.id} className={!r.ativo ? "opacity-60" : ""}>
                  <TableCell>
                    <div className="text-sm font-medium">{r.rotulo}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{r.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">{r.forma}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.condicao_canonica}</TableCell>
                  <TableCell className="font-mono text-xs">{r.regra_codigo}</TableCell>
                  <TableCell className="text-right">{r.ordem}</TableCell>
                  <TableCell>
                    <Switch checked={r.ativo} onCheckedChange={() => handleToggleAtivo(r)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {formOpen && (
        <FormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          editing={editing}
        />
      )}
    </Card>
  );
}
