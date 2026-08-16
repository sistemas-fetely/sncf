import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Zap, Plus, Pencil, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { useAuth } from "@/contexts/AuthContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type TipoTransacao = "debito" | "credito" | "ambos";

type Regra = {
  id: string;
  nome: string;
  padrao_descricao: string;
  tipo_transacao: TipoTransacao;
  valor_exato: number | null;
  conta_bancaria_id: string | null;
  plano_contas_id: string;
  parceiro_id: string | null;
  descricao_override: string | null;
  ativa: boolean;
  created_at: string;
};

type Categoria = { id: string; codigo: string; nome: string; tipo: string };
type Parceiro = { id: string; razao_social: string | null; nome_fantasia: string | null };
type Conta = { id: string; nome_exibicao: string };

const TIPO_OPTIONS: { value: TipoTransacao; label: string }[] = [
  { value: "ambos", label: "Ambos (débito e crédito)" },
  { value: "debito", label: "Apenas débito" },
  { value: "credito", label: "Apenas crédito" },
];

type FormState = Omit<Regra, "id" | "created_at"> & { id?: string };

const FORM_INICIAL: FormState = {
  nome: "",
  padrao_descricao: "",
  tipo_transacao: "ambos",
  valor_exato: null,
  conta_bancaria_id: null,
  plano_contas_id: "",
  parceiro_id: null,
  descricao_override: null,
  ativa: true,
};

export default function RegrasOFX() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);

  const { data: regras = [], isLoading } = useQuery({
    queryKey: ["regras-automaticas-ofx"],
    queryFn: async () => {
      const { data } = await sb
        .from("regras_automaticas_ofx")
        .select("*")
        .order("created_at", { ascending: true });
      return (data || []) as Regra[];
    },
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["plano-contas-folhas-todas"],
    queryFn: async () => {
      const { data } = await sb
        .from("plano_contas")
        .select("id, codigo, nome, tipo, parent_id")
        .eq("ativo", true)
        .order("codigo");
      const todas = (data || []) as Array<Categoria & { parent_id: string | null }>;
      const idsPais = new Set(todas.map((c) => c.parent_id).filter(Boolean));
      return todas.filter((c) => !idsPais.has(c.id)) as Categoria[];
    },
  });

  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros-options-regras"],
    queryFn: async () => {
      const { data } = await sb
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia")
        .eq("ativo", true)
        .order("razao_social");
      return (data || []) as Parceiro[];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ["contas-bancarias-regras"],
    queryFn: async () => {
      const { data } = await sb
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .order("nome_exibicao");
      return (data || []) as Conta[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        nome: f.nome,
        padrao_descricao: f.padrao_descricao,
        tipo_transacao: f.tipo_transacao,
        valor_exato: f.valor_exato,
        conta_bancaria_id: f.conta_bancaria_id,
        plano_contas_id: f.plano_contas_id,
        parceiro_id: f.parceiro_id,
        descricao_override: f.descricao_override,
        ativa: f.ativa,
      };
      if (f.id) {
        const { error } = await sb
          .from("regras_automaticas_ofx")
          .update(payload)
          .eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("regras_automaticas_ofx")
          .insert({ ...payload, criado_por: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Regra salva");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["regras-automaticas-ofx"] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("regras_automaticas_ofx").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra removida");
      qc.invalidateQueries({ queryKey: ["regras-automaticas-ofx"] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  function abrirNova() {
    setForm(FORM_INICIAL);
    setDialogOpen(true);
  }

  function abrirEdicao(r: Regra) {
    setForm({ ...r });
    setDialogOpen(true);
  }

  function getCategoriaLabel(id: string) {
    const c = categorias.find((c) => c.id === id);
    return c ? `${c.codigo} — ${c.nome}` : "—";
  }

  function getParceiroLabel(id: string | null) {
    if (!id) return null;
    const p = parceiros.find((p) => p.id === id);
    return p?.razao_social ?? p?.nome_fantasia ?? null;
  }

  function getContaLabel(id: string | null) {
    if (!id) return "Todas as contas";
    const c = contas.find((c) => c.id === id);
    return c?.nome_exibicao ?? "—";
  }

  const tipoSel = (() => {
    const cat = categorias.find((c) => c.id === form.plano_contas_id);
    return cat?.tipo === "receita" ? "receita" : "despesa";
  })();

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-medium flex items-center gap-2">
            <Zap className="h-6 w-6" />
            Regras automáticas OFX
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Quando o extrato OFX é importado, transações que casam com uma regra ativa viram CPR + movimentação + conciliação Stage 2 automaticamente. Regras são determinísticas — humano declara, sistema executa.
          </p>
        </div>
        <Button onClick={abrirNova} className="gap-1">
          <Plus className="h-4 w-4" />
          Nova regra
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : regras.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <p className="text-sm font-medium">Nenhuma regra cadastrada ainda.</p>
            <p className="text-xs text-muted-foreground">
              Comece criando regras para recorrências como "rendimento de aplicação", "tarifa bancária", "IOF".
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {regras.map((r) => (
            <div
              key={r.id}
              className={`flex items-center justify-between border rounded-md p-3 hover:bg-muted/30 ${!r.ativa ? "opacity-50" : ""}`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.nome}</span>
                  {!r.ativa && <Badge variant="outline" className="text-xs">Inativa</Badge>}
                  <Badge variant="secondary" className="text-xs">
                    {r.tipo_transacao === "ambos" ? "Débito + Crédito" :
                     r.tipo_transacao === "debito" ? "Débito" : "Crédito"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Quando descrição contém <code className="font-mono bg-muted px-1 rounded">{r.padrao_descricao}</code>
                  {r.valor_exato !== null ? ` e valor = ${formatBRL(r.valor_exato)}` : ""}
                  {" → "}
                  {getCategoriaLabel(r.plano_contas_id)}
                  {getParceiroLabel(r.parceiro_id) ? ` · ${getParceiroLabel(r.parceiro_id)}` : ""}
                  {" · "}
                  {getContaLabel(r.conta_bancaria_id)}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-4">
                <Button variant="ghost" size="icon" onClick={() => abrirEdicao(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Remover regra "${r.nome}"?`)) deleteMutation.mutate(r.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar regra" : "Nova regra"}</DialogTitle>
            <DialogDescription>
              Quando o OFX é importado, transações que casam com este padrão viram CPR + movimentação + Stage 2 automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome (interno)</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="ex: Rendimento poupança Itaú"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Padrão de descrição (substring case-insensitive)</Label>
              <Input
                value={form.padrao_descricao}
                onChange={(e) => setForm({ ...form, padrao_descricao: e.target.value })}
                placeholder='ex: "REND APLIC AUTOM"'
                className="h-9 font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Match: descrição do OFX contém este texto (não precisa exato).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de transação</Label>
                <Select
                  value={form.tipo_transacao}
                  onValueChange={(v) => setForm({ ...form, tipo_transacao: v as TipoTransacao })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPO_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Valor exato (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor_exato ?? ""}
                  onChange={(e) => setForm({
                    ...form,
                    valor_exato: e.target.value ? parseFloat(e.target.value) : null,
                  })}
                  placeholder="Deixe vazio = qualquer valor"
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Categoria (plano de contas)</Label>
              <Select
                value={form.plano_contas_id}
                onValueChange={(v) => setForm({ ...form, plano_contas_id: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} — {c.nome} ({c.tipo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                {tipoSel === "receita" ? "Cliente" : "Fornecedor"} (opcional)
              </Label>
              <Select
                value={form.parceiro_id ?? "_"}
                onValueChange={(v) => setForm({ ...form, parceiro_id: v === "_" ? null : v })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">— sem parceiro —</SelectItem>
                  {parceiros.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.razao_social ?? p.nome_fantasia ?? p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Conta bancária (opcional)</Label>
              <Select
                value={form.conta_bancaria_id ?? "_"}
                onValueChange={(v) => setForm({ ...form, conta_bancaria_id: v === "_" ? null : v })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">— todas as contas —</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Descrição override (opcional)</Label>
              <Input
                value={form.descricao_override ?? ""}
                onChange={(e) => setForm({
                  ...form,
                  descricao_override: e.target.value || null,
                })}
                placeholder="Sobrescreve descrição da CPR (deixe vazio = usa descrição original do OFX)"
                className="h-9"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.ativa}
                onCheckedChange={(v) => setForm({ ...form, ativa: v })}
              />
              <Label className="text-xs cursor-pointer">Regra ativa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!form.nome || !form.padrao_descricao || !form.plano_contas_id || upsertMutation.isPending}
              onClick={() => upsertMutation.mutate(form)}
              className="gap-1"
            >
              {upsertMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CheckCircle2 className="h-4 w-4" />}
              {form.id ? "Salvar" : "Criar regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
