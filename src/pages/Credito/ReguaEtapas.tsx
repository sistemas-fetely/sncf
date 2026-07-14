import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import {
  useReguaEtapas,
  type ReguaEtapa,
  type PerfilCadencia,
  type CanalRegua,
} from "@/hooks/credito/useReguaFila";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

const PERFIS: PerfilCadencia[] = ["padrao", "bandeira_amarela", "vip"];
const PERFIL_LABEL: Record<PerfilCadencia, string> = {
  padrao: "Padrão",
  bandeira_amarela: "Bandeira amarela",
  vip: "VIP",
};
const CANAIS: { value: CanalRegua; label: string }[] = [
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telefone", label: "Telefone" },
  { value: "carta", label: "Carta" },
  { value: "cartorio", label: "Cartório" },
  { value: "advogado", label: "Advogado" },
];

interface FormState {
  id: string | null;
  codigo: string;
  ordem: number;
  dias_offset: number;
  perfil_cadencia: PerfilCadencia;
  canal_sugerido: CanalRegua;
  descricao_acao: string;
  template_mensagem: string;
  responsavel_default: string;
  requer_aprovacao: boolean;
  custo_externo_previsto: string;
  ativa: boolean;
}

function emptyForm(): FormState {
  return {
    id: null,
    codigo: "",
    ordem: 100,
    dias_offset: 0,
    perfil_cadencia: "padrao",
    canal_sugerido: "email",
    descricao_acao: "",
    template_mensagem: "",
    responsavel_default: "",
    requer_aprovacao: false,
    custo_externo_previsto: "",
    ativa: true,
  };
}

function fromEtapa(e: ReguaEtapa): FormState {
  return {
    id: e.id,
    codigo: e.codigo,
    ordem: e.ordem,
    dias_offset: e.dias_offset,
    perfil_cadencia: e.perfil_cadencia,
    canal_sugerido: e.canal_sugerido,
    descricao_acao: e.descricao_acao,
    template_mensagem: e.template_mensagem ?? "",
    responsavel_default: e.responsavel_default ?? "",
    requer_aprovacao: e.requer_aprovacao,
    custo_externo_previsto:
      e.custo_externo_previsto != null ? String(e.custo_externo_previsto) : "",
    ativa: e.ativa,
  };
}

export default function ReguaEtapas() {
  const qc = useQueryClient();
  const { data: etapas = [], isLoading } = useReguaEtapas();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const salvar = useMutation({
    mutationFn: async (f: FormState) => {
      if (!f.codigo.trim()) throw new Error("Código obrigatório.");
      if (!f.descricao_acao.trim()) throw new Error("Descrição obrigatória.");
      const payload = {
        codigo: f.codigo.trim(),
        ordem: f.ordem,
        dias_offset: f.dias_offset,
        perfil_cadencia: f.perfil_cadencia,
        canal_sugerido: f.canal_sugerido,
        descricao_acao: f.descricao_acao.trim(),
        template_mensagem: f.template_mensagem.trim() || null,
        responsavel_default: f.responsavel_default.trim() || null,
        requer_aprovacao: f.requer_aprovacao,
        custo_externo_previsto: f.custo_externo_previsto
          ? parseFloat(f.custo_externo_previsto.replace(",", "."))
          : null,
        ativa: f.ativa,
      };
      if (f.id) {
        const { error } = await (supabase as any)
          .from("regua_cobranca_etapas")
          .update(payload)
          .eq("id", f.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await (supabase as any)
          .from("regua_cobranca_etapas")
          .insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Etapa salva.");
      qc.invalidateQueries({ queryKey: ["regua-etapas"] });
      setDialogOpen(false);
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao salvar."),
  });

  const toggleAtiva = useMutation({
    mutationFn: async (e: ReguaEtapa) => {
      const { error } = await (supabase as any)
        .from("regua_cobranca_etapas")
        .update({ ativa: !e.ativa })
        .eq("id", e.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regua-etapas"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao atualizar."),
  });

  const abrirNovo = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };
  const editar = (e: ReguaEtapa) => {
    setForm(fromEtapa(e));
    setDialogOpen(true);
  };

  const porPerfil = useMemo(() => {
    const g: Record<PerfilCadencia, ReguaEtapa[]> = {
      padrao: [], bandeira_amarela: [], vip: [],
    };
    for (const e of etapas) g[e.perfil_cadencia].push(e);
    return g;
  }, [etapas]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in space-y-6">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Crédito", to: "/credito" },
          { label: "Régua de Cobrança" },
        ]}
        title="Régua de Cobrança"
        subtitle="Etapas de cadência — a régua é uma dimensão editável, não código"
        actions={
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" /> Nova etapa
          </Button>
        }
      />

      {isLoading && <Skeleton className="h-40 w-full" />}

      {!isLoading && PERFIS.map((perfil) => {
        const lista = porPerfil[perfil];
        return (
          <section key={perfil} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {PERFIL_LABEL[perfil]} · {lista.length} etapa{lista.length !== 1 ? "s" : ""}
            </h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Aprov.</TableHead>
                    <TableHead>Ativa</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-6 text-sm">
                        Nenhuma etapa neste perfil.
                      </TableCell>
                    </TableRow>
                  )}
                  {lista.map((e) => (
                    <TableRow key={e.id} className={cn(!e.ativa && "opacity-50")}>
                      <TableCell className="font-mono text-xs">{e.ordem}</TableCell>
                      <TableCell className="font-mono text-xs">{e.codigo}</TableCell>
                      <TableCell className="text-xs">{e.dias_offset > 0 ? `+${e.dias_offset}` : e.dias_offset}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {CANAIS.find((c) => c.value === e.canal_sugerido)?.label ?? e.canal_sugerido}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{e.descricao_acao}</TableCell>
                      <TableCell className="text-xs">
                        {e.custo_externo_previsto != null ? formatBRL(e.custo_externo_previsto) : "—"}
                      </TableCell>
                      <TableCell>
                        {e.requer_aprovacao ? (
                          <Badge variant="outline" className="text-[10px]">Sim</Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Switch checked={e.ativa} onCheckedChange={() => toggleAtiva.mutate(e)} />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => editar(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Código *</Label>
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ordem</Label>
              <Input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dias offset (negativo = pré-vencimento)</Label>
              <Input type="number" value={form.dias_offset} onChange={(e) => setForm({ ...form, dias_offset: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Perfil</Label>
              <Select value={form.perfil_cadencia} onValueChange={(v) => setForm({ ...form, perfil_cadencia: v as PerfilCadencia })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERFIS.map((p) => <SelectItem key={p} value={p}>{PERFIL_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Canal sugerido</Label>
              <Select value={form.canal_sugerido} onValueChange={(v) => setForm({ ...form, canal_sugerido: v as CanalRegua })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CANAIS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável default</Label>
              <Input value={form.responsavel_default} onChange={(e) => setForm({ ...form, responsavel_default: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Descrição da ação *</Label>
              <Input value={form.descricao_acao} onChange={(e) => setForm({ ...form, descricao_acao: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Template de mensagem</Label>
              <Textarea value={form.template_mensagem} onChange={(e) => setForm({ ...form, template_mensagem: e.target.value })} rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Custo externo previsto (R$)</Label>
              <Input type="number" step="0.01" value={form.custo_externo_previsto} onChange={(e) => setForm({ ...form, custo_externo_previsto: e.target.value })} />
            </div>
            <div className="flex items-center gap-6 pt-6">
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={form.requer_aprovacao} onCheckedChange={(v) => setForm({ ...form, requer_aprovacao: v })} />
                Requer aprovação
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={form.ativa} onCheckedChange={(v) => setForm({ ...form, ativa: v })} />
                Ativa
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => salvar.mutate(form)} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
