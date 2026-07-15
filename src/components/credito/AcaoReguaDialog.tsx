import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  titulo: TituloCobranca;
  etapa: ReguaEtapa | null;
  modo: "enviada" | "pulada";
  open: boolean;
  onClose: () => void;
}

function interpolar(tpl: string, titulo: TituloCobranca): string {
  const cliente = titulo.parceiro_nome_fantasia || titulo.parceiro_razao_social || "";
  const map: Record<string, string> = {
    "{cliente}": cliente,
    "{valor}": formatBRL(titulo.valor_efetivo),
    "{vencimento}": formatDateBR(titulo.data_vencimento_atual),
    "{titulo}": titulo.numero_titulo ?? "",
    "{cnpj}": titulo.parceiro_cnpj ?? "",
  };
  return (tpl ?? "").replace(/\{cliente\}|\{valor\}|\{vencimento\}|\{titulo\}|\{cnpj\}/g, (m) => map[m] ?? m);
}

function formatDiasOffset(dias: number): string {
  if (dias === 0) return "D+0";
  return dias > 0 ? `D+${dias}` : `D${dias}`;
}

export function AcaoReguaDialog({ titulo, etapa, modo, open, onClose }: Props) {
  const qc = useQueryClient();
  const [canal, setCanal] = useState<CanalRegua>(etapa?.canal_sugerido ?? "email");
  const [mensagem, setMensagem] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");
  const [obsAberta, setObsAberta] = useState<boolean>(false);
  const [destinatarios, setDestinatarios] = useState<string>("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  useEffect(() => {
    if (open) {
      setCanal(etapa?.canal_sugerido ?? "email");
      setMensagem(interpolar(etapa?.template_mensagem ?? "", titulo));
      setObservacao("");
      setObsAberta(modo === "pulada");
      setDestinatarios(titulo.parceiro_email_cobranca || titulo.parceiro_email || "");
    }
  }, [open, etapa, titulo, modo]);

  const emails = useMemo(
    () => destinatarios.split(/[,;]/).map((e) => e.trim()).filter(Boolean),
    [destinatarios],
  );
  const invalidos = emails.filter((e) => !EMAIL_RE.test(e));
  const podeEnviarEmail =
    canal === "email" && emails.length > 0 && invalidos.length === 0 && mensagem.trim().length > 0;

  const removerEmail = (email: string) => {
    setDestinatarios(emails.filter((e) => e !== email).join(", "));
  };

  const registrar = async (canalEfetivo: CanalRegua | null, mensagemSnap: string | null) => {
    if (!etapa) throw new Error("Nenhuma etapa aplicável ao título.");
    const { data, error } = await (supabase as any).rpc("registrar_acao_regua", {
      p_titulo_id: titulo.id,
      p_etapa_codigo: etapa.codigo,
      p_dias_offset: etapa.dias_offset,
      p_resultado: modo,
      p_canal_efetivo: modo === "enviada" ? canalEfetivo : null,
      p_mensagem: modo === "enviada" ? mensagemSnap : null,
      p_observacao: observacao || null,
    });
    if (error) throw new Error(error.message);
    if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao registrar ação.");
    return data;
  };

  const registrarForaMutation = useMutation({
    mutationFn: () => registrar(modo === "enviada" ? canal : null, modo === "enviada" ? mensagem : null),
    onSuccess: () => {
      toast.success(modo === "enviada" ? "Ação registrada." : "Etapa pulada.");
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      qc.invalidateQueries({ queryKey: ["regua-log"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao registrar ação."),
  });

  const enviarEmailERegistrar = async () => {
    if (!etapa) return;
    setEnviandoEmail(true);
    try {
      let attachments: Array<{ filename: string; content: string }> | undefined;
      if ((titulo as any).boleto_status === "registrado") {
        const { data: pdfResp, error: errPdf } = await supabase.functions.invoke(
          "gerar-boleto-pdf",
          { body: { titulo_id: titulo.id } },
        );
        if (errPdf || !pdfResp?.ok) {
          throw new Error(
            `Falha ao gerar PDF do boleto: ${pdfResp?.erro ?? errPdf?.message ?? "erro desconhecido"}`,
          );
        }
        attachments = [{ filename: pdfResp.nome_arquivo, content: pdfResp.pdf_base64 }];
      }

      const assunto = `Fetély · Título ${titulo.numero_titulo ?? ""} — Vencimento ${formatDateBR(titulo.data_vencimento_atual)}`;
      const { error: errEmail } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "regua-cobranca",
          recipientEmail: emails[0],
          cc: emails.slice(1),
          idempotencyKey: `regua-${titulo.id}-${etapa.codigo}-${etapa.dias_offset}`,
          templateData: { corpo: mensagem, assunto },
          ...(attachments ? { attachments } : {}),
        },
      });
      if (errEmail) throw new Error(`Falha ao enviar e-mail: ${errEmail.message}`);

      await registrar("email", mensagem);

      toast.success("E-mail enviado e ação registrada.");
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      qc.invalidateQueries({ queryKey: ["regua-log"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao enviar e-mail.");
    } finally {
      setEnviandoEmail(false);
    }
  };

  const isPending = registrarForaMutation.isPending || enviandoEmail;
  const clienteNome = titulo.parceiro_nome_fantasia || titulo.parceiro_razao_social || "—";
  const vencCurto = titulo.data_vencimento_atual
    ? formatDateBR(titulo.data_vencimento_atual).slice(0, 5)
    : "—";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isPending && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b space-y-1.5">
          <DialogTitle className="text-base font-semibold">
            {modo === "enviada" ? "Registrar ação" : "Pular etapa"}
          </DialogTitle>
          <div className="text-sm font-medium text-foreground">{clienteNome}</div>
          <div className="text-xs text-muted-foreground">
            {titulo.numero_titulo ?? "—"} · {formatBRL(titulo.valor_efetivo)} · vence {vencCurto}
          </div>
        </DialogHeader>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {etapa ? (
            <div className="space-y-4">
              {/* Chip etapa */}
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="font-mono shrink-0">
                  {formatDiasOffset(etapa.dias_offset)}
                </Badge>
                <span className="text-sm text-foreground leading-relaxed">
                  {etapa.descricao_acao}
                </span>
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
                  <div className="space-y-2">
                    <Label>Canal efetivo</Label>
                    <Select value={canal} onValueChange={(v) => setCanal(v as CanalRegua)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CANAIS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {canal === "email" && (
                    <div className="space-y-2">
                      <Label>Destinatários</Label>
                      <Input
                        value={destinatarios}
                        onChange={(e) => setDestinatarios(e.target.value)}
                        placeholder="email1@dominio.com, email2@dominio.com"
                      />
                      {emails.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {emails.map((email) => {
                            const invalido = !EMAIL_RE.test(email);
                            return (
                              <Badge
                                key={email}
                                variant={invalido ? "destructive" : "secondary"}
                                className="gap-1 pr-1"
                              >
                                <span className="text-xs">{email}</span>
                                <button
                                  type="button"
                                  onClick={() => removerEmail(email)}
                                  className="rounded-full hover:bg-black/10 p-0.5"
                                  aria-label={`Remover ${email}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>
                      {canal === "email" ? "Corpo do e-mail" : "Mensagem enviada (snapshot)"}
                    </Label>
                    <Textarea
                      value={mensagem}
                      onChange={(e) => setMensagem(e.target.value)}
                      rows={7}
                      className="text-[13px] resize-y"
                      placeholder="Texto que foi enviado ao cliente."
                    />
                    <p className="text-[11px] text-muted-foreground truncate">
                      Os campos {"{cliente} {valor} {vencimento}"} são preenchidos automaticamente
                    </p>
                  </div>
                </>
              )}

              {/* Observação */}
              {!obsAberta ? (
                <button
                  type="button"
                  onClick={() => setObsAberta(true)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  + adicionar observação
                </button>
              ) : (
                <div className="space-y-2">
                  <Label>
                    Observação {modo === "pulada" ? "(recomendado)" : "(opcional)"}
                  </Label>
                  <Textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={3}
                    placeholder={modo === "pulada" ? "Por que a etapa está sendo pulada?" : ""}
                  />
                </div>
              )}
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>
                Nenhuma etapa aplicável para este título (perfil sem cadência configurada).
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t flex-row items-center justify-between sm:justify-between gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <div className="flex items-center gap-2">
            {modo === "enviada" && canal === "email" && (
              <Button
                variant="outline"
                onClick={() => registrarForaMutation.mutate()}
                disabled={!etapa || isPending}
              >
                {registrarForaMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Registrar (enviei por fora)
              </Button>
            )}
            {modo === "enviada" && canal === "email" ? (
              <Button
                onClick={enviarEmailERegistrar}
                disabled={!etapa || !podeEnviarEmail || isPending}
              >
                {enviandoEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar e enviar e-mail
              </Button>
            ) : (
              <Button
                onClick={() => registrarForaMutation.mutate()}
                disabled={!etapa || isPending}
              >
                {registrarForaMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {modo === "enviada" ? "Registrar" : "Confirmar"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
