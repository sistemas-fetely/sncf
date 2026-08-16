import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatBRL } from "@/lib/format-currency";

interface Props {
  open: boolean;
  onClose: () => void;
  contasIds: string[];
  totalValor: number;
  onSuccess: () => void;
}

type Destinatario = {
  id: string;
  nome: string;
  email: string;
  papel?: "principal" | "copia";
  ativo: boolean;
  propositos: string[];
};

export default function MarcarEnviadasDialog({
  open,
  onClose,
  contasIds,
  totalValor,
  onSuccess,
}: Props) {
  const qc = useQueryClient();

  const [dataEnvio, setDataEnvio] = useState(format(new Date(), "yyyy-MM-dd"));
  const [descricao, setDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailNovo, setEmailNovo] = useState("");

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      const d = new Date();
      setDataEnvio(format(d, "yyyy-MM-dd"));
      setDescricao(`Lote ${format(d, "dd/MM/yyyy")}`);
      setObservacao("");
      setEmails([]);
      setEmailNovo("");
    }
  }, [open]);

  // Destinatários ativos com propósito fiscal — pré-preenchimento
  const { data: destinatarios = [] } = useQuery({
    queryKey: ["destinatarios-fiscais"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config_financeiro_externo")
        .select("*")
        .eq("ativo", true);
      if (error) throw error;
      return ((data as Destinatario[]) || []).filter(
        (d) => Array.isArray(d.propositos) && d.propositos.includes("fiscal"),
      );
    },
  });

  // Preencher emails iniciais ao carregar destinatários
  useEffect(() => {
    if (open && destinatarios.length > 0 && emails.length === 0) {
      setEmails(destinatarios.map((d) => d.email));
    }
  }, [destinatarios, open, emails.length]);

  function adicionarEmail() {
    const e = emailNovo.trim().toLowerCase();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error("Email inválido");
      return;
    }
    if (emails.includes(e)) {
      toast.info("Email já adicionado");
      return;
    }
    setEmails([...emails, e]);
    setEmailNovo("");
  }

  function removerEmail(email: string) {
    setEmails(emails.filter((e) => e !== email));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "marcar_remessa_manual_em_lote",
        {
          p_descricao: descricao.trim(),
          p_periodo_inicio: dataEnvio,
          p_periodo_fim: dataEnvio,
          p_destinatarios: emails,
          p_observacao: observacao.trim() || null,
          p_conta_ids: contasIds,
        },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || "Erro ao marcar remessa");
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Remessa criada: ${data.qtd_contas} conta(s), ${data.qtd_documentos} documento(s)`,
      );
      qc.invalidateQueries({ queryKey: ["docs-envio-agrupados"] });
      qc.invalidateQueries({ queryKey: ["remessas-contador"] });
      onSuccess();
      onClose();
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Marcar como enviadas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-success/10 border border-success/40 px-3 py-2 text-sm">
            <strong>{contasIds.length}</strong> conta(s) selecionadas — total{" "}
            <strong>{formatBRL(totalValor)}</strong>
          </div>

          <div>
            <Label>Data do envio</Label>
            <Input
              type="date"
              value={dataEnvio}
              onChange={(e) => setDataEnvio(e.target.value)}
            />
          </div>

          <div>
            <Label>Descrição da remessa</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Lote 02/05/2026"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Identifica essa remessa no histórico (aba Enviado).
            </p>
          </div>

          <div>
            <Label className="flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              Destinatários (snapshot deste envio)
            </Label>
            <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[40px]">
              {emails.length === 0 && (
                <span className="text-[11px] text-muted-foreground italic">
                  Nenhum email — adicione abaixo.
                </span>
              )}
              {emails.map((email) => (
                <Badge
                  key={email}
                  variant="secondary"
                  className="gap-1 pr-1 text-[11px]"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removerEmail(email)}
                    className="ml-1 hover:bg-muted rounded-sm p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={emailNovo}
                onChange={(e) => setEmailNovo(e.target.value)}
                placeholder="adicionar email..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarEmail();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={adicionarEmail}>
                Adicionar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pré-carregado com cadastrados em "Email Externo" com propósito Fiscal. Edite à vontade — é só snapshot deste envio.
            </p>
          </div>

          <div>
            <Label>Observação (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="ex: Remessa parcial — restante na varredura final"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              contasIds.length === 0 ||
              !descricao.trim()
            }
            className="bg-success hover:bg-success text-white"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
