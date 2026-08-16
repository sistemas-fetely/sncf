import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Wrench, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Manutencao {
  id: string;
  ativo_id: string;
  acao: string;
  tipo_manutencao: string | null;
  observacoes: string | null;
  fornecedor: string | null;
  valor: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  garantia_servico_ate: string | null;
  status_anterior: string | null;
  created_at: string;
}

interface ManutencoesSectionProps {
  ativoId: string;
  ativoStatus: string;
  onStatusChange?: (newStatus: string) => void;
}

const tipoVariant: Record<string, { label: string; className: string }> = {
  preventiva: { label: "Preventiva", className: "bg-success/10 text-success border-0" },
  corretiva: { label: "Corretiva", className: "bg-destructive/10 text-destructive border-0" },
  upgrade: { label: "Upgrade", className: "bg-info/10 text-info border-0" },
  garantia: { label: "Garantia", className: "bg-info/10 text-info border-0" },
  formatacao: { label: "Formatação", className: "bg-muted/10 text-muted-foreground border-0" },
};

const formatBRL = (n: number | null) =>
  n == null ? "—" : `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const formatDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const today = () => new Date().toISOString().split("T")[0];

export default function ManutencoesSection({ ativoId, ativoStatus, onStatusChange }: ManutencoesSectionProps) {
  const { user } = useAuth();
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [concluirTarget, setConcluirTarget] = useState<Manutencao | null>(null);
  const [dataFimConcluir, setDataFimConcluir] = useState(today());

  const [form, setForm] = useState({
    tipo_manutencao: "preventiva",
    observacoes: "",
    fornecedor: "",
    valor: "",
    data_inicio: today(),
    data_fim: "",
    garantia_servico_ate: "",
  });

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ti_ativos_historico")
      .select("*")
      .eq("ativo_id", ativoId)
      .not("tipo_manutencao", "is", null)
      .order("created_at", { ascending: false });
    setManutencoes((data as any) || []);
    setLoading(false);
  }, [ativoId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resetForm = () => {
    setForm({
      tipo_manutencao: "preventiva",
      observacoes: "",
      fornecedor: "",
      valor: "",
      data_inicio: today(),
      data_fim: "",
      garantia_servico_ate: "",
    });
  };

  const handleRegistrar = async () => {
    if (!form.tipo_manutencao || !form.observacoes.trim() || !form.data_inicio) {
      toast.error("Preencha tipo, descrição e data de início");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("ti_ativos_historico").insert({
        ativo_id: ativoId,
        acao: "manutencao",
        tipo_manutencao: form.tipo_manutencao,
        observacoes: form.observacoes.trim(),
        fornecedor: form.fornecedor.trim() || null,
        valor: form.valor ? Number(form.valor) : null,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim || null,
        garantia_servico_ate: form.garantia_servico_ate || null,
        status_anterior: ativoStatus,
        responsavel_id: user?.id,
      } as any);
      if (error) {
        toast.error("Erro ao registrar: " + error.message);
        return;
      }

      // Se manutenção em andamento (sem data_fim), marcar flag em_manutencao
      if (!form.data_fim) {
        const { error: upErr } = await supabase
          .from("ti_ativos")
          .update({ em_manutencao: true } as any)
          .eq("id", ativoId);
        if (!upErr) {
          onStatusChange?.(ativoStatus);
        }
      }

      toast.success("Manutenção registrada");
      setDialogOpen(false);
      resetForm();
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleConcluir = async () => {
    if (!concluirTarget || !dataFimConcluir) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ti_ativos_historico")
        .update({ data_fim: dataFimConcluir })
        .eq("id", concluirTarget.id);
      if (error) {
        toast.error("Erro: " + error.message);
        return;
      }

      // Limpar a flag em_manutencao do ativo
      const { error: upErr } = await supabase
        .from("ti_ativos")
        .update({ em_manutencao: false } as any)
        .eq("id", ativoId);
      if (!upErr) {
        onStatusChange?.(ativoStatus);
      }

      toast.success("Manutenção concluída");
      setConcluirTarget(null);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="col-span-2 space-y-3 pt-3 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Histórico de Manutenções</Label>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Registrar Manutenção
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : manutencoes.length === 0 ? (
        <div className="border border-dashed rounded-lg py-8 text-center text-sm text-muted-foreground">
          <Wrench className="h-6 w-6 mx-auto mb-2 opacity-40" />
          Nenhuma manutenção registrada
        </div>
      ) : (
        <div className="space-y-2">
          {manutencoes.map((m) => {
            const variant = tipoVariant[m.tipo_manutencao || ""] || { label: m.tipo_manutencao || "—", className: "bg-muted/10 text-muted-foreground border-0" };
            const emAndamento = !m.data_fim;
            return (
              <div key={m.id} className="border rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={variant.className}>{variant.label}</Badge>
                    {emAndamento && (
                      <Badge variant="outline" className="bg-warning/10 text-warning border-0">Em andamento</Badge>
                    )}
                  </div>
                  {emAndamento && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => { setConcluirTarget(m); setDataFimConcluir(today()); }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
                    </Button>
                  )}
                </div>
                {m.observacoes && <p className="text-sm">{m.observacoes}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Fornecedor:</span>
                    <div className="font-medium">{m.fornecedor || "—"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor:</span>
                    <div className="font-medium">{formatBRL(m.valor)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Período:</span>
                    <div className="font-medium">
                      {formatDate(m.data_inicio)}
                      {m.data_fim ? ` → ${formatDate(m.data_fim)}` : " → em andamento"}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Garantia até:</span>
                    <div className="font-medium">{formatDate(m.garantia_servico_ate)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog Registrar Manutenção */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Manutenção</DialogTitle>
            <DialogDescription>Registre detalhes do serviço de manutenção do ativo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Tipo de Manutenção *</Label>
              <Select value={form.tipo_manutencao} onValueChange={(v) => setForm({ ...form, tipo_manutencao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventiva">Preventiva</SelectItem>
                  <SelectItem value="corretiva">Corretiva</SelectItem>
                  <SelectItem value="upgrade">Upgrade</SelectItem>
                  <SelectItem value="garantia">Garantia (acionamento fabricante)</SelectItem>
                  <SelectItem value="formatacao">Formatação / Reinstalação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição do Serviço *</Label>
              <Textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Ex: Troca de SSD por modelo NVMe 1TB"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fornecedor</Label>
                <Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} placeholder="Nome do prestador" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data Início *</Label>
                <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data Fim</Label>
                <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Garantia do Serviço até</Label>
                <Input type="date" value={form.garantia_servico_ate} onChange={(e) => setForm({ ...form, garantia_servico_ate: e.target.value })} />
              </div>
            </div>
            {!form.data_fim && (
              <p className="text-xs text-muted-foreground">
                Sem data fim → o ativo será marcado como "Em Manutenção" (sem alterar o status atual).
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleRegistrar} disabled={saving} style={{ backgroundColor: "#3A7D6B" }} className="text-white hover:opacity-90">
              {saving ? "Salvando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Concluir */}
      <Dialog open={!!concluirTarget} onOpenChange={(o) => !o && setConcluirTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Concluir Manutenção</DialogTitle>
            <DialogDescription>Informe a data de conclusão do serviço.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1">
            <Label className="text-xs">Data Fim *</Label>
            <Input type="date" value={dataFimConcluir} onChange={(e) => setDataFimConcluir(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConcluirTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleConcluir} disabled={saving || !dataFimConcluir} style={{ backgroundColor: "#3A7D6B" }} className="text-white hover:opacity-90">
              {saving ? "Salvando…" : "Concluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
