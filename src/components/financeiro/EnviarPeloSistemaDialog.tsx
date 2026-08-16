import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  X,
  Send,
  Mail,
  Eye,
  Info,
  CheckCircle2,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

// Tipo mínimo necessário das contas selecionadas
export interface ContaParaEnvio {
  conta_id: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contasSelecionadas: ContaParaEnvio[];
  onSuccess: () => void;
}

type Destinatario = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  propositos: string[];
};

type Etapa = "idle" | "docs" | "zip" | "upload" | "email" | "done";

const ETAPAS_LABEL: Record<Etapa, string> = {
  idle: "",
  docs: "Buscando documentos...",
  zip: "Compactando arquivos...",
  upload: "Enviando para o servidor...",
  email: "Disparando emails...",
  done: "Concluído",
};

const ETAPAS_PCT: Record<Etapa, number> = {
  idle: 0,
  docs: 15,
  zip: 45,
  upload: 75,
  email: 90,
  done: 100,
};

const CORPO_DEFAULT = `Olá,

Segue o pacote de documentos fiscais Fetely para conferência e arquivamento.

O resumo da remessa e o link de download estão abaixo.

Qualquer dúvida, fico à disposição.

Atenciosamente,
Equipe Fetely`;

export default function EnviarPeloSistemaDialog({
  open,
  onClose,
  contasSelecionadas,
  onSuccess,
}: Props) {
  const qc = useQueryClient();

  const [descricaoRemessa, setDescricaoRemessa] = useState("");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState(CORPO_DEFAULT);
  const [observacao, setObservacao] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailNovo, setEmailNovo] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("idle");
  const [processando, setProcessando] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      const d = new Date();
      const dataStr = format(d, "dd/MM/yyyy");
      const desc = `Lote ${dataStr}`;
      setDescricaoRemessa(desc);
      setAssunto(`[Fetely] Pacote fiscal — ${desc}`);
      setCorpo(CORPO_DEFAULT);
      setObservacao("");
      setEmails([]);
      setEmailNovo("");
      setEtapa("idle");
      setProcessando(false);
    }
  }, [open]);

  // Busca destinatários ativos com propósito fiscal — pré-preencher
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

  useEffect(() => {
    if (open && destinatarios.length > 0 && emails.length === 0) {
      setEmails(destinatarios.map((d) => d.email));
    }
  }, [destinatarios, open, emails.length]);

  // Atualiza assunto quando descrição muda (se ainda no template default)
  useEffect(() => {
    setAssunto((atual) => {
      // Se assunto está no padrão "[Fetely] Pacote fiscal — ...", atualiza
      if (atual.startsWith("[Fetely] Pacote fiscal — ")) {
        return `[Fetely] Pacote fiscal — ${descricaoRemessa}`;
      }
      return atual;
    });
  }, [descricaoRemessa]);

  // Cálculos derivados das contas
  const totais = useMemo(() => {
    const valor = contasSelecionadas.reduce((s, c) => s + Number(c.valor || 0), 0);
    const datas = contasSelecionadas
      .map((c) => c.data_pagamento || c.data_vencimento)
      .filter((d): d is string => !!d)
      .sort();
    return {
      valor,
      periodoInicio: datas[0] || format(new Date(), "yyyy-MM-dd"),
      periodoFim: datas[datas.length - 1] || format(new Date(), "yyyy-MM-dd"),
      qtdContas: contasSelecionadas.length,
    };
  }, [contasSelecionadas]);

  const periodoStr = useMemo(
    () => `${formatDateBR(totais.periodoInicio)} a ${formatDateBR(totais.periodoFim)}`,
    [totais.periodoInicio, totais.periodoFim],
  );

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

  // Gera ZIP em memória — delega ao helper compartilhado
  async function gerarZipBlob(contaIds: string[]): Promise<{
    blob: Blob;
    qtdDocumentos: number;
  }> {
    const { montarZipPacoteFiscal } = await import(
      "@/lib/financeiro/montar-pacote-fiscal"
    );
    const { blob, qtdDocumentos, contasSemDoc } =
      await montarZipPacoteFiscal(contaIds);
    if (contasSemDoc.length > 0) {
      toast.warning(
        `${contasSemDoc.length} conta(s) sem NF anexada foram incluídas mesmo assim: ${contasSemDoc.slice(0, 3).join(", ")}${contasSemDoc.length > 3 ? "..." : ""}. Considere marcar como 'NF não aplicável' no drawer.`,
        { duration: 6000 },
      );
    }
    return { blob, qtdDocumentos };
  }

  async function handleEnviar() {
    if (emails.length === 0) {
      toast.error("Adicione pelo menos um destinatário");
      return;
    }
    if (!descricaoRemessa.trim()) {
      toast.error("Descrição da remessa é obrigatória");
      return;
    }
    if (!assunto.trim()) {
      toast.error("Assunto do email é obrigatório");
      return;
    }
    if (contasSelecionadas.length === 0) {
      toast.error("Nenhuma conta selecionada");
      return;
    }

    setProcessando(true);
    try {
      // 1. Gerar UUID e gerar ZIP
      setEtapa("docs");
      const uuid = crypto.randomUUID();
      const storageFileName = `${uuid}.zip`;
      const storagePath = `pacotes-contador/${storageFileName}`;
      const contaIds = contasSelecionadas.map((c) => c.conta_id);

      setEtapa("zip");
      const { blob, qtdDocumentos } = await gerarZipBlob(contaIds);
      if (qtdDocumentos === 0) {
        throw new Error("Nenhum documento foi baixado para incluir no pacote");
      }

      // 2. Upload no bucket
      setEtapa("upload");
      const { error: uploadErr } = await supabase.storage
        .from("pacotes-contador")
        .upload(storageFileName, blob, {
          contentType: "application/zip",
          upsert: false,
        });
      if (uploadErr) {
        throw new Error("Falha no upload: " + uploadErr.message);
      }

      // 3. Chamar Edge Function
      setEtapa("email");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.functions.invoke<any>(
        "enviar-pacote-contador",
        {
          body: {
            storage_path: storagePath,
            descricao_remessa: descricaoRemessa.trim(),
            periodo_inicio: totais.periodoInicio,
            periodo_fim: totais.periodoFim,
            destinatarios: emails,
            observacao: observacao.trim() || null,
            conta_ids: contaIds,
            assunto: assunto.trim(),
            mensagem_personalizada: corpo.trim(),
            qtd_documentos: qtdDocumentos,
            valor_total: totais.valor,
            remetente_nome: "Equipe Fetely",
          },
        },
      );

      // invoke nunca dá throw — checa .error explicitamente
      if (error) {
        throw new Error("Falha na função: " + error.message);
      }
      if (!data?.ok) {
        throw new Error(data?.erro || "Falha desconhecida ao enviar");
      }

      setEtapa("done");

      const aviso =
        Array.isArray(data.avisos) && data.avisos.length > 0
          ? ` (avisos: ${data.avisos.join("; ")})`
          : "";
      toast.success(
        `Pacote enviado: ${data.qtd_emails_enviados} email(s)${aviso}`,
      );

      qc.invalidateQueries({ queryKey: ["docs-envio-agrupados"] });
      qc.invalidateQueries({ queryKey: ["remessas-contador"] });
      onSuccess();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
      setEtapa("idle");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && !processando && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-success" />
              Enviar pelo sistema
            </DialogTitle>
            <DialogDescription>
              O pacote será compactado em ZIP, hospedado por 30 dias, e o link
              será enviado por email aos destinatários.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Resumo */}
            <div className="rounded-lg bg-success/10 border border-success/40 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <strong>{totais.qtdContas}</strong> conta(s) — total{" "}
                  <strong>{formatBRL(totais.valor)}</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  {periodoStr}
                </span>
              </div>
            </div>

            {/* Descrição da remessa */}
            <div>
              <Label>Descrição da remessa</Label>
              <Input
                value={descricaoRemessa}
                onChange={(e) => setDescricaoRemessa(e.target.value)}
                disabled={processando}
                placeholder="Lote 02/05/2026"
              />
            </div>

            {/* Destinatários */}
            <div>
              <Label className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                Destinatários
              </Label>
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[40px]">
                {emails.length === 0 && (
                  <span className="text-[11px] text-muted-foreground italic">
                    Adicione pelo menos um email abaixo.
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
                      disabled={processando}
                      className="ml-1 hover:bg-muted rounded-sm p-0.5 disabled:opacity-50"
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
                  disabled={processando}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionarEmail();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={adicionarEmail}
                  disabled={processando}
                >
                  Adicionar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Pré-carregado com cadastros em "Email Externo" com propósito Fiscal.
              </p>
            </div>

            {/* Assunto */}
            <div>
              <Label>Assunto do email</Label>
              <Input
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                disabled={processando}
              />
            </div>

            {/* Corpo do email */}
            <div>
              <Label>Corpo do email</Label>
              <Textarea
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={8}
                disabled={processando}
                className="font-mono text-xs"
              />
              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground mt-1">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  O resumo da remessa e o link de download de 30 dias serão
                  adicionados automaticamente após o seu texto.
                </span>
              </div>
            </div>

            {/* Observação interna (não vai no email) */}
            <div>
              <Label>Observação interna (opcional, não vai no email)</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                disabled={processando}
                placeholder="ex: Reenvio após retificação"
              />
            </div>

            {/* Progress durante envio */}
            {processando && (
              <div className="rounded-lg border border-success/40 bg-success/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm text-success">
                  {etapa === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <span>{ETAPAS_LABEL[etapa]}</span>
                </div>
                <Progress value={ETAPAS_PCT[etapa]} className="h-1.5" />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={processando}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              disabled={processando || emails.length === 0 || !corpo.trim()}
              className="gap-1"
            >
              <Eye className="h-4 w-4" />
              Pré-visualizar
            </Button>
            <Button
              onClick={handleEnviar}
              disabled={
                processando ||
                emails.length === 0 ||
                !assunto.trim() ||
                !corpo.trim() ||
                !descricaoRemessa.trim()
              }
              className="gap-1 bg-success hover:bg-success text-white"
            >
              {processando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {processando ? "Enviando..." : "Enviar pelo sistema"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de pré-visualização (separado) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Pré-visualização do email
            </DialogTitle>
            <DialogDescription>
              Como o email vai aparecer pros destinatários.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Para
              </div>
              <div className="font-mono text-xs">
                {emails.length > 0 ? emails.join(", ") : "—"}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Assunto
              </div>
              <div className="font-mono text-xs">{assunto || "—"}</div>
            </div>

            <div className="border rounded-lg overflow-hidden bg-white">
              {/* Renderização visual do template */}
              <div className="px-6 py-5 max-w-[560px] mx-auto">
                <h2 className="text-xl font-medium mb-4" style={{ color: "#1a3d2b" }}>
                  Pacote Fiscal — {descricaoRemessa || "Sem descrição"}
                </h2>

                {corpo.trim() && (
                  <div className="bg-muted/10 border border-border/40 rounded-md p-3 mb-4">
                    {corpo.split("\n").map((l, i) => (
                      <p key={i} className="text-sm leading-relaxed text-muted-foreground mb-1">
                        {l || "\u00A0"}
                      </p>
                    ))}
                  </div>
                )}

                <div className="bg-muted/10 border border-border/40 rounded-md p-3 mb-4">
                  <h3 className="text-sm font-medium mb-2" style={{ color: "#1a3d2b" }}>
                    Resumo
                  </h3>
                  <div className="space-y-1 text-xs">
                    <div className="flex">
                      <span className="w-28 text-muted-foreground uppercase">Período</span>
                      <span style={{ color: "#1a3d2b" }}>{periodoStr}</span>
                    </div>
                    <div className="flex">
                      <span className="w-28 text-muted-foreground uppercase">Contas</span>
                      <span style={{ color: "#1a3d2b" }}>{totais.qtdContas}</span>
                    </div>
                    <div className="flex">
                      <span className="w-28 text-muted-foreground uppercase">Valor total</span>
                      <span className="font-medium" style={{ color: "#1a3d2b" }}>
                        {formatBRL(totais.valor)}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-md p-4 mb-4 text-center border"
                  style={{ backgroundColor: "#f0f9f4", borderColor: "#c8e6d3" }}
                >
                  <h3 className="text-sm font-medium mb-2" style={{ color: "#1a3d2b" }}>
                    Download do pacote
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    O pacote inclui todas as NFs e recibos do período em um arquivo
                    ZIP, organizados por fornecedor, com um CSV de resumo.
                  </p>
                  <div
                    className="inline-block px-6 py-2.5 rounded-md text-white text-sm font-medium"
                    style={{ backgroundColor: "#1a3d2b" }}
                  >
                    <Package className="h-4 w-4 inline mr-2" />
                    Baixar pacote (ZIP)
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    [Link real e data de validade gerados após envio]
                  </p>
                </div>

                <hr className="my-4 border-border/40" />
                <p className="text-xs text-muted-foreground">
                  Atenciosamente,
                  <br />
                  Equipe Fetely
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setPreviewOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
