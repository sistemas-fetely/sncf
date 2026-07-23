import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Eraser, FileEdit } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Furo = {
  id: string;
  valor?: number | string | null;
  data_transacao?: string | null;
  contraparte_nome?: string | null;
  doc_solicitado_em?: string | null;
  doc_solicitado_nota?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  furo: Furo | null;
  onDone: () => void;
}

type Historico = {
  id: string;
  criado_em: string;
  solicitado_para_nome: string | null;
  solicitado_para_email: string | null;
  email_enviado: boolean;
  nota: string | null;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SolicitarDocumentoDialog({ open, onOpenChange, furo, onDone }: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [nota, setNota] = useState("");
  const [salvandoRegistrar, setSalvandoRegistrar] = useState(false);
  const [salvandoEnviar, setSalvandoEnviar] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const qc = useQueryClient();

  const histKey = ["solicitacoes-documento", furo?.id];
  const { data: historico = [] } = useQuery<Historico[]>({
    queryKey: histKey,
    enabled: open && !!furo?.id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("solicitacoes_documento")
        .select("id, criado_em, solicitado_para_nome, solicitado_para_email, email_enviado, nota")
        .eq("movimentacao_id", furo!.id)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data || []) as Historico[];
    },
  });

  useEffect(() => {
    if (open) {
      setNome("");
      setEmail("");
      setNota(furo?.doc_solicitado_nota || "");
    }
  }, [open, furo]);

  const emailValido = useMemo(() => emailRegex.test(email.trim()), [email]);

  function invalidarTudo() {
    qc.invalidateQueries({ queryKey: histKey });
    onDone();
  }

  async function chamarRpc(emailEnviado: boolean) {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) throw new Error("Sessão expirada — refaça o login");
    const { data, error } = await sb.rpc("solicitar_documento", {
      p_mov_id: furo!.id,
      p_nome: nome.trim() || null,
      p_email: email.trim() || null,
      p_nota: nota.trim() || null,
      p_email_enviado: emailEnviado,
      p_user_id: uid,
    });
    if (error) throw new Error(error.message);
    if (data && data.ok === false) throw new Error(data.erro || "Falha ao registrar");
    return data;
  }

  async function somenteRegistrar() {
    if (!furo) return;
    setSalvandoRegistrar(true);
    try {
      await chamarRpc(false);
      toast.success("Solicitação registrada");
      onOpenChange(false);
      invalidarTudo();
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvandoRegistrar(false);
    }
  }

  async function registrarEEnviar() {
    if (!furo || !emailValido) return;
    setSalvandoEnviar(true);
    try {
      const templateData = {
        nome: nome.trim() || undefined,
        valor_fmt: formatBRL(Number(furo.valor || 0)),
        data_fmt: furo.data_transacao ? formatDateBR(furo.data_transacao) : "—",
        favorecido: furo.contraparte_nome || "fornecedor não identificado",
        nota: nota.trim() || undefined,
      };

      const { data: sendRes, error: sendErr } = await supabase.functions.invoke(
        "send-transactional-email",
        {
          body: {
            templateName: "solicitacao-documento",
            recipientEmail: email.trim(),
            templateData,
          },
        },
      );

      if (sendErr || !sendRes || sendRes.success !== true) {
        const msg =
          sendErr?.message ||
          (sendRes && (sendRes.error || sendRes.reason)) ||
          "Falha ao enviar e-mail";
        toast.error("Falha ao enviar e-mail: " + msg);
        return;
      }

      await chamarRpc(true);
      toast.success("Solicitação registrada e e-mail enviado");
      onOpenChange(false);
      invalidarTudo();
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvandoEnviar(false);
    }
  }

  async function limpar() {
    if (!furo) return;
    setLimpando(true);
    try {
      const { error } = await sb
        .from("movimentacoes_bancarias")
        .update({
          doc_solicitado_em: null,
          doc_solicitado_por: null,
          doc_solicitado_nota: null,
        })
        .eq("id", furo.id);
      if (error) throw error;
      toast.success("Solicitação removida");
      onOpenChange(false);
      invalidarTudo();
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLimpando(false);
    }
  }

  const busy = salvandoRegistrar || salvandoEnviar || limpando;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar documento</DialogTitle>
          <DialogDescription>
            {furo?.doc_solicitado_em
              ? <>Última solicitação em {formatDateBR(furo.doc_solicitado_em)}</>
              : "Registre a solicitação e, opcionalmente, envie por e-mail ao responsável."}
          </DialogDescription>
        </DialogHeader>

        {historico.length > 0 && (
          <div className="border rounded-md bg-muted/30 p-2 max-h-40 overflow-auto space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground px-1">
              Histórico
            </div>
            {historico.map((h) => (
              <div key={h.id} className="text-xs px-1 py-1 border-b last:border-b-0 border-border/50">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground">{formatDateBR(h.criado_em)}</span>
                  <span>·</span>
                  <span className="font-medium truncate max-w-[220px]">
                    {h.solicitado_para_nome || h.solicitado_para_email || "—"}
                  </span>
                  {h.solicitado_para_email && h.solicitado_para_nome && (
                    <span className="text-muted-foreground truncate max-w-[180px]">
                      &lt;{h.solicitado_para_email}&gt;
                    </span>
                  )}
                  {h.email_enviado && (
                    <Badge variant="secondary" className="h-4 text-[10px]">e-mail enviado</Badge>
                  )}
                </div>
                {h.nota && (
                  <div className="text-muted-foreground truncate">{h.nota}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="doc-nome" className="text-xs">Nome do responsável</Label>
              <Input
                id="doc-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="opcional"
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="doc-email" className="text-xs">E-mail</Label>
              <Input
                id="doc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="opcional"
                disabled={busy}
                aria-invalid={email.length > 0 && !emailValido}
              />
              {email.length > 0 && !emailValido && (
                <div className="text-[11px] text-destructive">E-mail inválido</div>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-nota" className="text-xs">Nota</Label>
            <Textarea
              id="doc-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="fatura pedida à contabilidade"
              rows={3}
              disabled={busy}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          {furo?.doc_solicitado_em && (
            <Button
              variant="outline"
              onClick={limpar}
              disabled={busy}
              className="gap-1 mr-auto"
            >
              {limpando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
              Limpar solicitação
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={somenteRegistrar} disabled={busy} className="gap-1">
            {salvandoRegistrar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileEdit className="h-3.5 w-3.5" />}
            Somente registrar
          </Button>
          <Button
            onClick={registrarEEnviar}
            disabled={busy || !emailValido}
            className="gap-1"
          >
            {salvandoEnviar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Registrar e enviar e-mail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
