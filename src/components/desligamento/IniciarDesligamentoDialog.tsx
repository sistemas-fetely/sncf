import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { Loader2, UserX } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { hojeISO } from "@/lib/data";

/** Data pura N dias após uma data pura "YYYY-MM-DD" (aritmética UTC, sem drift de fuso). */
function isoMaisDias(baseISO: string, dias: number): string {
  const [a, m, d] = baseISO.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  colaboradorId: string;
  colaboradorTipo: "clt" | "pj";
  colaboradorNome: string;
  onSuccess?: () => void;
}

const MOTIVOS_CLT = [
  { value: "sem_justa_causa", label: "Sem justa causa (empresa)" },
  { value: "com_justa_causa", label: "Com justa causa" },
  { value: "pedido_demissao", label: "Pedido de demissão" },
  { value: "acordo", label: "Acordo (Lei 13.467)" },
  { value: "fim_contrato", label: "Fim de contrato (experiência/determinado)" },
];

const MOTIVOS_PJ = [
  { value: "fim_contrato_pj", label: "Fim do contrato" },
  { value: "rescisao_empresa", label: "Rescisão pela empresa" },
  { value: "rescisao_prestador", label: "Rescisão pelo prestador" },
  { value: "acordo", label: "Acordo entre as partes" },
];

export default function IniciarDesligamentoDialog({
  open, onOpenChange, colaboradorId, colaboradorTipo, colaboradorNome, onSuccess,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dataDesligamento, setDataDesligamento] = useState(() => hojeISO());
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [avisoPrevio, setAvisoPrevio] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const motivos = colaboradorTipo === "clt" ? MOTIVOS_CLT : MOTIVOS_PJ;

  const iniciar = async () => {
    if (!motivo) {
      toast.error("Selecione o motivo do desligamento");
      return;
    }
    setSalvando(true);
    try {
      // 1) Buscar template
      const { data: template, error: errT } = await supabase
        .from("sncf_templates_processos")
        .select("id")
        .eq("tipo_processo", "offboarding")
        .or(`tipo_colaborador.eq.${colaboradorTipo},tipo_colaborador.eq.ambos`)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      if (errT) throw errT;
      if (!template) throw new Error("Nenhum template de offboarding configurado");

      // 2) Tarefas do template
      const { data: tarefasTpl, error: errTpl } = await supabase
        .from("sncf_templates_tarefas")
        .select("*")
        .eq("template_id", template.id)
        .order("ordem");
      if (errTpl) throw errTpl;

      // 3) Criar checklist
      const { data: checklist, error: errC } = await supabase
        .from("onboarding_checklists")
        .insert({
          colaborador_id: colaboradorId,
          colaborador_tipo: colaboradorTipo,
          tipo_processo: "offboarding",
          status: "em_andamento",
          motivo,
          observacoes: observacoes || null,
          data_efetivacao: dataDesligamento,
          aviso_previo: avisoPrevio,
          coordenador_user_id: user?.id ?? null,
        })
        .select("id")
        .single();
      if (errC) throw errC;

      // 4) Inserir tarefas em sncf_tarefas
      const tarefasInsert = (tarefasTpl ?? []).map((t) => {
        const prazoStr = isoMaisDias(dataDesligamento, t.prazo_dias ?? 0);
        return {
          tipo_processo: "offboarding",
          sistema_origem: t.sistema_origem ?? "people",
          processo_id: checklist.id,
          processo_tipo: "offboarding",
          colaborador_id: colaboradorId,
          colaborador_tipo: colaboradorTipo,
          colaborador_nome: colaboradorNome,
          titulo: t.titulo,
          descricao: t.descricao,
          prioridade: t.prioridade ?? "normal",
          area_destino: t.area_destino,
          responsavel_role: t.responsavel_role,
          accountable_role: t.accountable_role,
          prazo_dias: t.prazo_dias ?? 0,
          prazo_data: prazoStr,
          status: "pendente",
          bloqueante: t.bloqueante ?? false,
          motivo_bloqueio: t.motivo_bloqueio,
          criado_por: user?.id,
        };
      });

      if (tarefasInsert.length > 0) {
        const { error: errIns } = await supabase.from("sncf_tarefas").insert(tarefasInsert);
        if (errIns) throw errIns;
      }

      // 5) Atualizar status do colaborador
      if (colaboradorTipo === "clt") {
        await supabase
          .from("colaboradores_clt")
          .update({ status: "desligamento_em_andamento", data_desligamento: dataDesligamento })
          .eq("id", colaboradorId);
      } else {
        await supabase
          .from("contratos_pj")
          .update({ status: "desligamento_em_andamento", data_fim: dataDesligamento })
          .eq("id", colaboradorId);
      }

      toast.success("Processo de desligamento iniciado");
      onOpenChange(false);
      onSuccess?.();
      navigate(`/desligamento/${checklist.id}`, { state: { from: "/pessoas", fromLabel: "Pessoas" } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error("Erro ao iniciar: " + msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <UserX className="h-5 w-5" /> Iniciar desligamento
          </DialogTitle>
          <DialogDescription>
            {colaboradorNome} — Esta ação cria todas as tarefas do processo de desligamento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Data de desligamento *</Label>
            <Input
              type="date"
              value={dataDesligamento}
              onChange={(e) => setDataDesligamento(e.target.value)}
            />
          </div>
          <div>
            <Label>Motivo *</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {motivos.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {colaboradorTipo === "clt" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="aviso"
                checked={avisoPrevio}
                onCheckedChange={(v) => setAvisoPrevio(!!v)}
              />
              <Label htmlFor="aviso" className="cursor-pointer text-sm font-normal">
                Tem aviso prévio de 30 dias
              </Label>
            </div>
          )}
          <div>
            <Label>Observações</Label>
            <Textarea
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Contexto, instruções para o time..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={iniciar} disabled={salvando} variant="destructive" className="gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
            Iniciar desligamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
