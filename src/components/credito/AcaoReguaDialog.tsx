import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import type { ReguaEtapa, CanalRegua } from "@/hooks/credito/useReguaFila";

const CANAIS: { value: CanalRegua; label: string }[] = [
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telefone", label: "Telefone" },
  { value: "carta", label: "Carta" },
  { value: "cartorio", label: "Cartório" },
  { value: "advogado", label: "Advogado" },
];

interface Props {
  titulo: TituloCobranca;
  etapa: ReguaEtapa | null;
  modo: "enviada" | "pulada";
  open: boolean;
  onClose: () => void;
}

export function AcaoReguaDialog({ titulo, etapa, modo, open, onClose }: Props) {
  const qc = useQueryClient();
  const [canal, setCanal] = useState<CanalRegua>(etapa?.canal_sugerido ?? "email");
  const [mensagem, setMensagem] = useState<string>(etapa?.template_mensagem ?? "");
  const [observacao, setObservacao] = useState<string>("");

  useEffect(() => {
    if (open) {
      setCanal(etapa?.canal_sugerido ?? "email");
      setMensagem(etapa?.template_mensagem ?? "");
      setObservacao("");
    }
  }, [open, etapa]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!etapa) throw new Error("Nenhuma etapa aplicável ao título.");
      const { data, error } = await (supabase as any).rpc("registrar_acao_regua", {
        p_titulo_id: titulo.id,
        p_etapa_codigo: etapa.codigo,
        p_dias_offset: etapa.dias_offset,
        p_resultado: modo,
        p_canal_efetivo: modo === "enviada" ? canal : null,
        p_mensagem: modo === "enviada" ? mensagem : null,
        p_observacao: observacao || null,
      });
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao registrar ação.");
      return data;
    },
    onSuccess: () => {
      toast.success(modo === "enviada" ? "Ação registrada." : "Etapa pulada.");
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      qc.invalidateQueries({ queryKey: ["regua-log"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao registrar ação."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {modo === "enviada" ? "Registrar ação" : "Pular etapa"}
          </DialogTitle>
          <DialogDescription>
            {titulo.parceiro_razao_social} · {titulo.numero_titulo}
          </DialogDescription>
        </DialogHeader>

        {etapa ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="text-xs text-muted-foreground">Etapa</div>
              <div className="font-medium">{etapa.descricao_acao}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {etapa.perfil_cadencia} · dias_offset {etapa.dias_offset}
              </div>
            </div>

            {etapa.requer_aprovacao && (
              <Alert className="border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 !text-amber-700" />
                <AlertDescription className="text-xs text-amber-900">
                  Esta etapa requer aprovação antes da execução.
                </AlertDescription>
              </Alert>
            )}

            {modo === "enviada" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Canal efetivo</Label>
                  <Select value={canal} onValueChange={(v) => setCanal(v as CanalRegua)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CANAIS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Mensagem enviada (snapshot)</Label>
                  <Textarea
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    rows={6}
                    placeholder="Texto que foi enviado ao cliente."
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">
                Observação {modo === "pulada" ? "(recomendado)" : "(opcional)"}
              </Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder={modo === "pulada" ? "Por que a etapa está sendo pulada?" : ""}
              />
            </div>
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>
              Nenhuma etapa aplicável para este título (perfil sem cadência configurada).
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!etapa || mutation.isPending}
          >
            {mutation.isPending ? "Registrando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
