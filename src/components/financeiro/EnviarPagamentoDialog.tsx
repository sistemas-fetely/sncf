import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, Send, Info } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { useContaWorkflow } from "@/hooks/useContaWorkflow";

const TIPO_DOC_LABEL: Record<string, string> = {
  nf: "NF",
  recibo: "Recibo",
  boleto: "Boleto",
  ticket_cartao: "Ticket cartão",
  comprovante: "Comprovante",
  contrato: "Contrato",
  outro: "Outro",
};

interface DocAnexo {
  id: string;
  tipo: string;
  nome_arquivo: string;
  storage_path: string;
}

type Conta = {
  id: string;
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  valor: number;
  data_vencimento: string | null;
  status: string;
  nf_numero?: string | null;
  nf_chave_acesso?: string | null;
  nf_pdf_url?: string | null;
  nf_xml_url?: string | null;
  forma_pagamento_id?: string | null;
  numero_parcela?: number | null;
  plano_contas?: { codigo?: string | null; nome?: string | null } | null;
  parceiros_comerciais?: { razao_social?: string | null } | null;
  dados_pagamento_fornecedor?: {
    banco?: string;
    agencia?: string;
    conta?: string;
    pix?: string;
  } | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conta: Conta;
  onDone: () => void;
}

export default function EnviarPagamentoDialog({ open, onOpenChange, conta, onDone }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { mudarStatus } = useContaWorkflow();
  const [enviando, setEnviando] = useState(false);

  const [dadosPgto, setDadosPgto] = useState({
    banco: "",
    agencia: "",
    conta: "",
    pix: "",
  });
  const [emailDestinatario, setEmailDestinatario] = useState("");
  const [obsEnvio, setObsEnvio] = useState("");
  const [mensagemEmail, setMensagemEmail] = useState("");
  const [docsSelecionados, setDocsSelecionados] = useState<Set<string>>(new Set());
  const [formaPagamentoId, setFormaPagamentoId] = useState<string>("");
  const [editandoFormaPgto, setEditandoFormaPgto] = useState(false);
  const [parcelas, setParcelas] = useState<number>(conta.numero_parcela || 1);

  // Buscar formas de pagamento ativas
  const { data: formasPagamento } = useQuery({
    queryKey: ["formas-pagamento-ativas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("formas_pagamento")
        .select("id, nome, codigo")
        .eq("ativo", true)
        .order("nome");
      return data || [];
    },
  });

  // Buscar documentos anexados à conta
  const { data: documentos } = useQuery({
    queryKey: ["envio-pagto-docs", conta.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar_documentos")
        .select("id, tipo, nome_arquivo, storage_path")
        .eq("conta_id", conta.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DocAnexo[];
    },
  });

  // Buscar últimos dados bancários usados pra esse parceiro
  const { data: ultimosDados } = useQuery({
    queryKey: ["ultimos-dados-pgto", conta.parceiro_id, conta.fornecedor_cliente],
    enabled: open,
    queryFn: async () => {
      const query = supabase
        .from("contas_pagar_receber")
        .select("dados_pagamento_fornecedor")
        .not("dados_pagamento_fornecedor", "is", null)
        .order("enviado_pagamento_em", { ascending: false })
        .limit(1);

      if (conta.parceiro_id) {
        query.eq("parceiro_id", conta.parceiro_id);
      } else if (conta.fornecedor_cliente) {
        query.eq("fornecedor_cliente", conta.fornecedor_cliente);
      }

      const { data } = await query.maybeSingle();
      return (data?.dados_pagamento_fornecedor as typeof dadosPgto | null) || null;
    },
  });

  // Destinatários financeiros
  const { data: destinatarios } = useQuery({
    queryKey: ["config-financeiro-externo"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("config_financeiro_externo")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      return data || [];
    },
  });

  // Buscar dados bancários cadastrados no parceiro
  const { data: parceiroDadosBancarios } = useQuery({
    queryKey: ["parceiro-dados-bancarios", conta.parceiro_id],
    enabled: !!conta.parceiro_id && open,
    queryFn: async () => {
      if (!conta.parceiro_id) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("dados_bancarios")
        .eq("id", conta.parceiro_id)
        .single();
      return (data?.dados_bancarios as { banco?: string; agencia?: string; conta?: string; pix?: string } | null) || null;
    },
  });

  useEffect(() => {
    if (!open) return;
    if (conta.dados_pagamento_fornecedor) {
      setDadosPgto({
        banco: conta.dados_pagamento_fornecedor.banco || "",
        agencia: conta.dados_pagamento_fornecedor.agencia || "",
        conta: conta.dados_pagamento_fornecedor.conta || "",
        pix: conta.dados_pagamento_fornecedor.pix || "",
      });
    } else if (ultimosDados) {
      setDadosPgto({
        banco: ultimosDados.banco || "",
        agencia: ultimosDados.agencia || "",
        conta: ultimosDados.conta || "",
        pix: ultimosDados.pix || "",
      });
    }
  }, [open, ultimosDados, conta.dados_pagamento_fornecedor]);

  // Auto-preencher dados bancários a partir do cadastro do parceiro
  useEffect(() => {
    if (parceiroDadosBancarios && Object.keys(parceiroDadosBancarios).length > 0) {
      setDadosPgto((prev) => ({
        banco: prev.banco || parceiroDadosBancarios.banco || "",
        agencia: prev.agencia || parceiroDadosBancarios.agencia || "",
        conta: prev.conta || parceiroDadosBancarios.conta || "",
        pix: prev.pix || parceiroDadosBancarios.pix || "",
      }));
    }
  }, [parceiroDadosBancarios]);

  useEffect(() => {
    if (destinatarios && destinatarios.length > 0 && !emailDestinatario) {
      setEmailDestinatario(destinatarios[0].email);
    }
  }, [destinatarios, emailDestinatario]);

  // Inicializar mensagem padrão e selecionar todos os docs ao abrir
  useEffect(() => {
    if (!open) return;
    const fornecedor =
      conta.parceiros_comerciais?.razao_social ||
      conta.fornecedor_cliente ||
      "Fornecedor";
    const msgPadrao =
      `Olá,\n\n` +
      `Segue solicitação de pagamento ao fornecedor ${fornecedor} no valor de ${formatBRL(conta.valor)}, ` +
      `com vencimento em ${formatDateBR(conta.data_vencimento)}.\n\n` +
      `${conta.nf_numero ? `Nota Fiscal nº ${conta.nf_numero}.\n\n` : ""}` +
      `Os dados bancários e documentos relacionados seguem anexos abaixo.\n\n` +
      `Qualquer dúvida, estou à disposição.\n\n` +
      `Obrigado.`;
    setMensagemEmail(msgPadrao);
    setFormaPagamentoId(conta.forma_pagamento_id || "");
  }, [open, conta]);

  // Selecionar todos os documentos por default quando carregam
  useEffect(() => {
    if (documentos && documentos.length > 0 && docsSelecionados.size === 0) {
      setDocsSelecionados(new Set(documentos.map((d) => d.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentos]);

  const fornecedorNome = useMemo(
    () =>
      conta.parceiros_comerciais?.razao_social ||
      conta.fornecedor_cliente ||
      "Fornecedor",
    [conta],
  );

  const categoriaTxt = conta.plano_contas
    ? `${conta.plano_contas.codigo || ""} ${conta.plano_contas.nome || ""}`.trim()
    : "—";

  const formaPagamentoLabel =
    (formasPagamento || []).find((fp) => fp.id === formaPagamentoId)?.nome || "";

  const formaEhCartao =
    formaPagamentoLabel.toLowerCase().includes("cartão") ||
    formaPagamentoLabel.toLowerCase().includes("cartao") ||
    formaPagamentoLabel.toLowerCase().includes("crédito") ||
    formaPagamentoLabel.toLowerCase().includes("credito");

  const semDadosBancariosCadastrados =
    !parceiroDadosBancarios || Object.keys(parceiroDadosBancarios).length === 0;

  async function handleEnviar() {
    if (!emailDestinatario) {
      toast.error("Selecione um destinatário");
      return;
    }
    if (!formaPagamentoId) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    if (formaEhCartao && (!parcelas || parcelas < 1)) {
      toast.error("Informe o número de parcelas");
      return;
    }
    setEnviando(true);
    try {
      // 1) RPC executar_pagamento (B1) — encapsula:
      //    - status → aguardando_pagamento + dados bancários + parcela + audit
      //    - histórico (insert em contas_pagar_historico)
      //    - enriquecimento silencioso do parceiro
      //    - flag pagamento_com_pendencia + pendencias_no_envio
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        "executar_pagamento",
        {
          p_cpr_id: conta.id,
          p_dados_pagamento: dadosPgto,
          p_forma_pagamento_id: formaPagamentoId,
          p_numero_parcela: parcelas,
          p_observacao: obsEnvio || null,
          p_email_destinatario: emailDestinatario,
        },
      );

      if (rpcError || !rpcResult?.ok) {
        throw new Error(
          rpcResult?.erro || rpcError?.message || "Falha ao executar pagamento",
        );
      }

      // Toast de pendência (informativo, não bloqueia)
      if (rpcResult.pagamento_com_pendencia) {
        toast.warning(
          `Pagamento iniciado com pendência em: ${(rpcResult.pendencias || []).join(", ")}`,
          { duration: 5000 },
        );
      }

      // Toast silencioso de enriquecimento de parceiro
      const qtdEnriquecido =
        rpcResult.enriquecimento_parceiro?.qtd_campos_atualizados || 0;
      if (qtdEnriquecido > 0) {
        toast.info(
          `Dados bancários de ${fornecedorNome} salvos no cadastro. Não vamos pedir de novo.`,
          { duration: 4000 },
        );
      }

      // 2) Edge Function enviar-email-pagamento (B2 — D-G Adapter) — encapsula:
      //    - geração de URLs assinadas dos docs
      //    - invocação de send-transactional-email com template + payload corretos
      //    - update de email_pagamento_enviado (atomic)
      const docsParaEnviar = (documentos || []).filter((d) => docsSelecionados.has(d.id));
      const emailResult = await supabase.functions.invoke("enviar-email-pagamento", {
        body: {
          cpr_id: conta.id,
          email_destinatario: emailDestinatario,
          mensagem_personalizada: mensagemEmail || "",
          docs: docsParaEnviar.map((d) => ({
            tipo: d.tipo,
            nome_arquivo: d.nome_arquivo,
            storage_path: d.storage_path,
          })),
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emailOk = !emailResult.error && Boolean((emailResult.data as any)?.ok);

      // 3) Criar tarefa Uauuu (best-effort)
      try {
        const venc = conta.data_vencimento ? new Date(conta.data_vencimento) : null;
        const urgente =
          venc && venc.getTime() <= Date.now() + 3 * 86400000;

        const { data: tarefa } = await supabase
          .from("sncf_tarefas")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            titulo: `Pagamento: ${fornecedorNome} — ${formatBRL(conta.valor)}`,
            descricao: `Vencimento: ${formatDateBR(conta.data_vencimento)}. NF: ${conta.nf_numero || "sem NF"}. Verificar pagamento e registrar no sistema.`,
            status: "pendente",
            prioridade: urgente ? "alta" : "normal",
            prazo_data: conta.data_vencimento,
            area_destino: "financeiro",
            tipo_processo: "pagamento_fornecedor",
            sistema_origem: "financeiro",
            criado_por: user?.id || null,
            link_acao: `/administrativo/contas-pagar?id=${conta.id}`,
          } as any)
          .select("id")
          .maybeSingle();

        if (tarefa?.id) {
          await supabase
            .from("contas_pagar_receber")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ tarefa_id: tarefa.id } as any)
            .eq("id", conta.id);
        }
      } catch (e) {
        console.warn("Falha ao criar tarefa (não bloqueante):", e);
      }

      if (emailOk) {
        qc.invalidateQueries({ queryKey: ["contas-pagar"] });
        toast.success(`Enviado! Email para ${emailDestinatario}`);
      } else {
        toast.warning(
          `Status atualizado, mas email falhou. Verifique a configuração.`,
        );
      }
      onDone();
      onOpenChange(false);
    } catch (e) {
      // Tratamento robusto: extrai mensagem de Error, objetos Supabase, ou converte
      let msg = "Erro desconhecido";
      if (e instanceof Error) {
        msg = e.message;
      } else if (e && typeof e === "object") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = e as any;
        msg = err.message || err.error_description || err.details || JSON.stringify(e);
      } else {
        msg = String(e);
      }
      console.error("Erro ao enviar pagamento:", e);
      toast.error("Erro: " + msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar para pagamento</DialogTitle>
          <DialogDescription>
            Um email será enviado ao financeiro com todos os dados e documentos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo */}
          <div className="p-3 rounded-lg border bg-muted/30 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Fornecedor:</span>{" "}
              <span className="font-medium">{fornecedorNome}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Valor:</span>{" "}
              <span className="font-mono font-semibold text-admin">
                {formatBRL(conta.valor)}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Vencimento:</span>{" "}
              {formatDateBR(conta.data_vencimento)}
            </p>
            {conta.nf_numero && (
              <p>
                <span className="text-muted-foreground">NF:</span> {conta.nf_numero}
              </p>
            )}
            {categoriaTxt !== "—" && (
              <p>
                <span className="text-muted-foreground">Categoria:</span>{" "}
                {categoriaTxt}
              </p>
            )}
            {formaPagamentoLabel && (
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">Forma de pagamento:</span>{" "}
                <span className="font-medium">{formaPagamentoLabel}</span>
                <button
                  type="button"
                  onClick={() => setEditandoFormaPgto(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  alterar
                </button>
              </p>
            )}
            {formaEhCartao && (
              <p>
                <span className="text-muted-foreground">Parcelas:</span>{" "}
                <span className="font-medium">{parcelas}x</span>
              </p>
            )}
          </div>

          {/* Forma de Pagamento - editável só se usuário clicou "alterar" no resumo */}
          {editandoFormaPgto && (
            <div className="space-y-2 p-3 rounded-lg border border-blue-200 bg-blue-50/50">
              <Label className="text-xs uppercase tracking-wide text-blue-700">
                Alterar forma de pagamento
              </Label>
              <div className="flex items-center gap-2">
                <Select value={formaPagamentoId} onValueChange={setFormaPagamentoId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecione (PIX, Boleto, Transferência...)" />
                  </SelectTrigger>
                  <SelectContent>
                    {(formasPagamento || []).map((fp) => (
                      <SelectItem key={fp.id} value={fp.id}>
                        {fp.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditandoFormaPgto(false)}
                >
                  Confirmar
                </Button>
              </div>
              {formaEhCartao && (
                <div className="space-y-1">
                  <Label className="text-xs">Parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    max={48}
                    value={parcelas}
                    onChange={(e) => setParcelas(parseInt(e.target.value) || 1)}
                    className="w-32 bg-background"
                  />
                </div>
              )}
            </div>
          )}

          {/* Dados bancários */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Dados bancários do fornecedor
            </Label>
            {conta.parceiro_id && semDadosBancariosCadastrados && (
              <div className="flex items-start gap-2 p-2 rounded-md border border-blue-200 bg-blue-50 text-xs text-blue-800">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Sem dados bancários cadastrados pra este fornecedor. Preencha aqui — vamos salvar no cadastro pra próxima vez.
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Banco</Label>
                <Input
                  value={dadosPgto.banco}
                  onChange={(e) => setDadosPgto({ ...dadosPgto, banco: e.target.value })}
                  placeholder="Ex: Itaú"
                />
              </div>
              <div>
                <Label className="text-xs">Agência</Label>
                <Input
                  value={dadosPgto.agencia}
                  onChange={(e) => setDadosPgto({ ...dadosPgto, agencia: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Conta</Label>
                <Input
                  value={dadosPgto.conta}
                  onChange={(e) => setDadosPgto({ ...dadosPgto, conta: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">PIX</Label>
                <Input
                  value={dadosPgto.pix}
                  onChange={(e) => setDadosPgto({ ...dadosPgto, pix: e.target.value })}
                  placeholder="CNPJ, email, etc"
                />
              </div>
            </div>
          </div>

          {/* Destinatário */}
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Enviar para
            </Label>
            {destinatarios && destinatarios.length > 0 ? (
              <select
                value={emailDestinatario}
                onChange={(e) => setEmailDestinatario(e.target.value)}
                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
              >
                {destinatarios.map((fin) => (
                  <option key={fin.id} value={fin.email}>
                    {fin.nome} ({fin.email})
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={emailDestinatario}
                onChange={(e) => setEmailDestinatario(e.target.value)}
                placeholder="financeiro@empresa.com"
              />
            )}
          </div>

          {/* Mensagem do email - EDITÁVEL */}
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Mensagem do e-mail
            </Label>
            <Textarea
              value={mensagemEmail}
              onChange={(e) => setMensagemEmail(e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Edite o texto que será enviado ao financeiro. Os dados estruturados (valor, banco, etc) aparecem em tabela separada.
            </p>
          </div>

          {/* Observação adicional */}
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Observação interna
            </Label>
            <Textarea
              value={obsEnvio}
              onChange={(e) => setObsEnvio(e.target.value)}
              placeholder="Opcional - aparece destacado no email"
              rows={2}
            />
          </div>

          {/* Documentos para anexar (selecionar quais) */}
          {documentos && documentos.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Documentos para anexar ({docsSelecionados.size}/{documentos.length})
              </Label>
              <div className="space-y-1.5 border rounded-md p-2">
                {documentos.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      id={`doc-${doc.id}`}
                      checked={docsSelecionados.has(doc.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(docsSelecionados);
                        if (checked) next.add(doc.id);
                        else next.delete(doc.id);
                        setDocsSelecionados(next);
                      }}
                    />
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                      {TIPO_DOC_LABEL[doc.tipo] || doc.tipo}
                    </Badge>
                    <label
                      htmlFor={`doc-${doc.id}`}
                      className="truncate flex-1 cursor-pointer"
                      title={doc.nome_arquivo}
                    >
                      {doc.nome_arquivo}
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Os documentos selecionados serão enviados como links seguros (válidos por 30 dias) no e-mail.
              </p>
            </div>
          )}

          {!documentos?.length && (
            <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded-md border border-amber-200">
              ⚠ Nenhum documento anexado a esta conta. O envio será feito sem anexos.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            onClick={handleEnviar}
            disabled={enviando}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
