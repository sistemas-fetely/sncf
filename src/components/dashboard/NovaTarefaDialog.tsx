import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const AREAS = ["RH", "TI", "Gestão", "Financeiro"] as const;
type Area = (typeof AREAS)[number];

const ROLE_BY_AREA: Record<Area, string | null> = {
  RH: "admin_rh",
  TI: "admin_ti",
  "Gestão": "gestor_direto",
  Financeiro: "financeiro",
};

interface ProfileOption {
  user_id: string;
  full_name: string | null;
}

interface ColaboradorOption {
  id: string;
  nome: string;
  tipo: "clt" | "pj";
}

interface NovaTarefaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function defaultPrazo(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

export function NovaTarefaDialog({ open, onOpenChange, onCreated }: NovaTarefaDialogProps) {
  const { user } = useAuth();
  
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorOption[]>([]);

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<"urgente" | "normal" | "baixa">("normal");
  const [areaDestino, setAreaDestino] = useState<Area>("RH");
  const [responsavel, setResponsavel] = useState<string>("mim"); // "mim" | "area" | user_id
  const [accountable, setAccountable] = useState<string>("mim"); // "mim" | user_id
  const [prazoData, setPrazoData] = useState<string>(defaultPrazo());
  const [colaboradorId, setColaboradorId] = useState<string>("none");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [profRes, cltRes, pjRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").eq("approved", true).order("full_name"),
        supabase.from("colaboradores_clt").select("id, nome_completo").eq("status", "ativo").order("nome_completo"),
        supabase.from("contratos_pj").select("id, contato_nome").eq("status", "ativo").order("contato_nome"),
      ]);
      if (cancelled) return;
      setProfiles((profRes.data || []) as ProfileOption[]);
      const colabs: ColaboradorOption[] = [
        ...((cltRes.data || []).map((c: any) => ({ id: c.id, nome: c.nome_completo, tipo: "clt" as const }))),
        ...((pjRes.data || []).map((c: any) => ({ id: c.id, nome: c.contato_nome, tipo: "pj" as const }))),
      ];
      setColaboradores(colabs);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // reset on close
  useEffect(() => {
    if (!open) {
      setTitulo("");
      setDescricao("");
      setPrioridade("normal");
      setAreaDestino("RH");
      setResponsavel("mim");
      setAccountable("mim");
      setPrazoData(defaultPrazo());
      setColaboradorId("none");
    }
  }, [open]);

  const colabSelecionado = useMemo(
    () => colaboradores.find((c) => c.id === colaboradorId) || null,
    [colaboradorId, colaboradores],
  );

  const handleSubmit = async () => {
    if (!titulo.trim()) {
      toast.error("Informe o título da tarefa");
      return;
    }
    if (!user) {
      toast.error("Sessão expirada");
      return;
    }
    setSaving(true);
    try {
      const responsavel_user_id =
        responsavel === "mim"
          ? user.id
          : responsavel === "area"
            ? null
            : responsavel;
      const responsavel_role =
        responsavel === "area" ? ROLE_BY_AREA[areaDestino] : null;
      const accountable_user_id = accountable === "mim" ? user.id : accountable;

      // Link de ação gerado automaticamente: se tem colaborador, vai para o detalhe dele
      const linkAuto = colabSelecionado
        ? colabSelecionado.tipo === "clt"
          ? `/colaboradores/${colabSelecionado.id}`
          : `/contratos-pj/${colabSelecionado.id}`
        : null;

      const payload: any = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        tipo_processo: "manual",
        sistema_origem: "manual",
        prioridade,
        area_destino: areaDestino,
        responsavel_user_id,
        responsavel_role,
        accountable_user_id,
        prazo_data: prazoData || null,
        colaborador_id: colabSelecionado?.id || null,
        colaborador_tipo: colabSelecionado?.tipo || null,
        colaborador_nome: colabSelecionado?.nome || null,
        link_acao: linkAuto,
        criado_por: user.id,
        status: "pendente",
      };

      const { error } = await supabase
        .from("sncf_tarefas")
        .insert(payload);
      if (error) throw error;
      // Histórico de criação é gravado pelo gatilho trg_tarefa_historico
      toast.success("Tarefa criada");
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao criar tarefa");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>
            Crie uma tarefa manual para você, outro usuário ou uma área.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Revisar contrato de João"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes da tarefa (opcional)"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v: any) => setPrioridade(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Área destino</Label>
              <Select value={areaDestino} onValueChange={(v: any) => setAreaDestino(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Atribuir a (Execução)</Label>
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mim">Mim mesmo</SelectItem>
                <SelectItem value="area">Todos da área ({areaDestino})</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name || "Sem nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Acompanhamento (quem cobra)</Label>
            <Select value={accountable} onValueChange={setAccountable}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mim">Mim mesmo</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name || "Sem nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prazo">Prazo</Label>
              <Input
                id="prazo"
                type="date"
                value={prazoData}
                onChange={(e) => setPrazoData(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colaborador relacionado</Label>
              <Select value={colaboradorId} onValueChange={setColaboradorId}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {colaboradores.map((c) => (
                    <SelectItem key={`${c.tipo}-${c.id}`} value={c.id}>
                      {c.nome} <span className="text-xs text-muted-foreground">({c.tipo.toUpperCase()})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
