import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Pencil, Trash2, Loader2, Zap } from "lucide-react";
import { CategoriaCombobox } from "@/components/financeiro/CategoriaCombobox";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";
import { useCentrosCusto } from "@/hooks/financeiro/useCentrosCusto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Regra = {
  id: string;
  nome: string;
  pattern: string;
  acao: "lancar" | "ignorar";
  conta_bancaria_id: string | null;
  conta_plano_id: string;
  centro_custo_id: string | null;
  descricao_override: string | null;
  ativo: boolean;
  conta_plano?: { nome: string; codigo: string } | null;
  centro_custo?: { nome: string } | null;
};

type ContaBancaria = { id: string; nome_exibicao: string };

type FormState = {
  nome: string;
  pattern: string;
  acao: "lancar" | "ignorar";
  conta_bancaria_id: string | null;
  conta_plano_id: string;
  centro_custo_id: string | null;
  descricao_override: string | null;
  ativo: boolean;
};

const EMPTY: FormState = {
  nome: "", pattern: "", acao: "lancar", conta_bancaria_id: null,
  conta_plano_id: "", centro_custo_id: null, descricao_override: null, ativo: true,
};

export function OFXRegrasPanel() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Regra | null>(null);
  const [editing, setEditing] = useState<Regra | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });

  const { data: categorias = [] } = useCategoriasPlano();
  const { data: centrosCusto = [] } = useCentrosCusto();

  const { data: contas = [] } = useQuery({
    queryKey: ["contas-bancarias-regras"],
    queryFn: async () => {
      const { data } = await sb.from("contas_bancarias")
        .select("id, nome_exibicao").eq("ativo", true).order("nome_exibicao");
      return (data || []) as ContaBancaria[];
    },
  });

  const { data: regras = [], isLoading } = useQuery({
    queryKey: ["ofx-regras"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("ofx_regras_automaticas")
        .select("id, nome, pattern, acao, conta_bancaria_id, conta_plano_id, centro_custo_id, descricao_override, ativo, conta_plano:conta_plano_id(nome, codigo), centro_custo:centro_custo_id(nome)")
        .order("nome");
      if (error) throw error;
      return (data || []) as Regra[];
    },
  });

  function abrirNova() {
    setEditing(null);
    setForm({ ...EMPTY });
    setDialogOpen(true);
  }

  function abrirEditar(r: Regra) {
    setEditing(r);
    setForm({
      nome: r.nome, pattern: r.pattern, acao: r.acao ?? "lancar",
      conta_bancaria_id: r.conta_bancaria_id,
      conta_plano_id: r.conta_plano_id,
      centro_custo_id: r.centro_custo_id,
      descricao_override: r.descricao_override,
      ativo: r.ativo,
    });
    setDialogOpen(true);
  }

  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Nome obrigatório");
      if (!form.pattern.trim()) throw new Error("Padrão obrigatório");
      if (form.acao === "lancar" && !form.conta_plano_id) throw new Error("Conta do plano obrigatória para ação Lançar");

      const payload = {
        nome: form.nome.trim(),
        pattern: form.pattern.trim().toLowerCase(),
        acao: form.acao,
        conta_bancaria_id: form.conta_bancaria_id || null,
        conta_plano_id: form.conta_plano_id || null,
        centro_custo_id: form.centro_custo_id || null,
        descricao_override: form.descricao_override?.trim() || null,
        ativo: form.ativo,
      };

      if (editing) {
        const { error } = await sb.from("ofx_regras_automaticas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("ofx_regras_automaticas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Regra atualizada" : "Regra criada");
      qc.invalidateQueries({ queryKey: ["ofx-regras"] });
      setDialogOpen(false);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const deletarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("ofx_regras_automaticas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra removida");
      qc.invalidateQueries({ queryKey: ["ofx-regras"] });
      setDeleteTarget(null);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await sb.from("ofx_regras_automaticas").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ofx-regras"] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Regras Automáticas OFX
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Quando o OFX contém o padrão, a movimentação é criada automaticamente com a categoria configurada.
          </p>
        </div>
        <Button onClick={abrirNova} size="sm" className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Nova Regra
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : regras.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
          Nenhuma regra cadastrada. Crie a primeira para automatizar lançamentos recorrentes.
        </p>
      ) : (
        <div className="space-y-2">
          {regras.map((r) => (
            <div key={r.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.nome}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">{r.pattern}</Badge>
                  {r.acao === "ignorar" && (
                    <Badge variant="outline" className="text-[10px] text-zinc-500">Ignorar</Badge>
                  )}
                  {!r.ativo && <Badge variant="secondary" className="text-[10px]">Inativa</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {r.conta_plano?.codigo} {r.conta_plano?.nome}
                  {r.centro_custo && ` · ${r.centro_custo.nome}`}
                  {r.descricao_override && ` · "${r.descricao_override}"`}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <Switch
                  checked={r.ativo}
                  onCheckedChange={(v) => toggleAtivoMutation.mutate({ id: r.id, ativo: v })}
                  className="scale-75"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEditar(r)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Regra" : "Nova Regra OFX"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da regra</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Tarifa SISPAG" />
            </div>
            <div className="space-y-2">
              <Label>Padrão (substring da descrição OFX)</Label>
              <Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="Ex: tar sispag" />
              <p className="text-xs text-muted-foreground">
                Case-insensitive. O sistema verifica se a descrição do OFX contém esse texto.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Conta bancária (opcional — vazio = todas)</Label>
              <Select
                value={form.conta_bancaria_id ?? "__todas__"}
                onValueChange={(v) => setForm({ ...form, conta_bancaria_id: v === "__todas__" ? null : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas as contas</SelectItem>
                  {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ação</Label>
              <Select value={form.acao}
                onValueChange={(v: "lancar" | "ignorar") => setForm({ ...form, acao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lancar">⚡ Lançar movimentação — cria lançamento no DRE</SelectItem>
                  <SelectItem value="ignorar">✕ Ignorar automaticamente — não cria lançamento</SelectItem>
                </SelectContent>
              </Select>
              {form.acao === "ignorar" && (
                <p className="text-[11px] text-muted-foreground">
                  Use para APL/RES de aplicação financeira e outras transferências que não vão para o DRE.
                </p>
              )}
            </div>
            {form.acao === "lancar" && (
            <div className="space-y-2">
              <Label>Conta do Plano de Contas *</Label>
              <CategoriaCombobox
                options={categorias}
                value={form.conta_plano_id || null}
                onChange={(v) => setForm({ ...form, conta_plano_id: v ?? "" })}
                placeholder="Selecione a conta..."
              />
            </div>
            )}
            <div className="space-y-2">
              <Label>Centro de Custo (opcional)</Label>
              <Select
                value={form.centro_custo_id ?? "__none__"}
                onValueChange={(v) => setForm({ ...form, centro_custo_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {centrosCusto.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição override (opcional)</Label>
              <Input
                value={form.descricao_override ?? ""}
                onChange={(e) => setForm({ ...form, descricao_override: e.target.value || null })}
                placeholder="Sobrescreve a descrição original do OFX"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Regra ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => salvarMutation.mutate()} disabled={salvarMutation.isPending} className="gap-2">
              {salvarMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover regra?</AlertDialogTitle>
            <AlertDialogDescription>
              A regra <strong>{deleteTarget?.nome}</strong> será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deletarMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
