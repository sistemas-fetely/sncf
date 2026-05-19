import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  FileText,
  Loader2,
  Send,
  AlertCircle,
  ExternalLink,
  Paperclip,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

const TIPO_DOC_LABEL: Record<string, string> = {
  nf: "NF",
  recibo: "Recibo",
  boleto: "Boleto",
  ticket_cartao: "Ticket cartão",
  comprovante: "Comprovante",
  contrato: "Contrato",
  outro: "Outro",
};

const TAMANHO_LIMITE_ANEXO = 18 * 1024 * 1024; // 18 MB total Resend Base64

interface DocAnexo {
  id: string;
  tipo: string;
  nome_arquivo: string;
  storage_path: string;
  tamanho_bytes?: number | null;
}

type Conta = {
  id: string;
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  valor: number;
  data_vencimento: string | null;
  status: string;
  nf_numero?: string | null;
  forma_pagamento_id?: string | null;
  numero_parcela?: number | null;
  parcela_atual?: number | null;
  parcelas?: number | null;
  parcela_grupo_id?: string | null;
  pasta_contrato_id?: string | null;
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
  const navigate = useNavigate();

  const [enviando, setEnviando] = useState(false);
  const [emailDestinatario, setEmailDestinatario] = useState("");
  const [obsEnvio, setObsEnvio] = useState("");
  const [docsSelecionados, setDocsSelecionados] = useState<Set<string>>(new Set());
  const [uploadando, setUploadando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dadosPgto, setDadosPgto] = useState({
    banco: "",
    agencia: "",
    conta: "",
    pix: "",
  });

  const { data: documentos } = useQuery({
    queryKey: ["envio-pagto-docs", conta.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar_documentos")
        .select("id, tipo, nome_arquivo, storage_path, tamanho_bytes")
        .eq("conta_id", conta.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DocAnexo[];
    },
  });

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

  const { data: parceiroInfo } = useQuery({
    queryKey: ["parceiro-info-envio", conta.parceiro_id],
    enabled: open && !!conta.parceiro_id,
    queryFn: async () => {
      if (!conta.parceiro_id) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("cadastro_incompleto")
        .eq("id", conta.parceiro_id)
        .maybeSingle();
      return { cadastroIncompleto: !!data?.cadastro_incompleto };
    },
  });

  const { data: nfsStageAnexadas } = useQuery({
    queryKey: ["nfs-stage-envio", conta.id],
    enabled: open,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("nfs_stage")
        .select(
          "id, nf_numero, fornecedor_razao_social, tipo_documento, nfs_stage_documentos(tipo, storage_path, arquivo_nome)"
        )
        .eq("conta_pagar_id", conta.id);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []) as Array<any>;
    },
  });

  const { data: dadosAgrupamento } = useQuery({
    queryKey: ["envio-agrupamento", conta.parcela_grupo_id, conta.forma_pagamento_id],
    enabled: open && !!conta.parcela_grupo_id && !!conta.forma_pagamento_id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: forma } = await (supabase as any)
        .from("formas_pagamento")
        .select("envio_agrupa_parcelas, nome")
        .eq("id", conta.forma_pagamento_id)
        .maybeSingle();
      if (!forma?.envio_agrupa_parcelas) return null;

      const { data: parcelasGrupo } = await supabase
        .from("contas_pagar_receber")
        .select("id, parcela_atual, parcelas, valor, data_vencimento, status")
        .eq("parcela_grupo_id", conta.parcela_grupo_id!)
        .in("status", ["aberto", "aprovado"])
        .order("parcela_atual", { ascending: true });

      return {
        formaNome: forma.nome as string,
        parcelas: parcelasGrupo || [],
      };
    },
  });

  const { data: formaInfo } = useQuery({
    queryKey: ["forma-pagamento-envio", conta.forma_pagamento_id],
    enabled: open && !!conta.forma_pagamento_id,
    queryFn: async () => {
      if (!conta.forma_pagamento_id) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("formas_pagamento")
        .select("nome, codigo, requer_dados_bancarios_destinatario, gera_fatura")
        .eq("id", conta.forma_pagamento_id)
        .maybeSingle();
      return data as {
        nome: string;
        codigo: string;
        requer_dados_bancarios_destinatario: boolean;
        gera_fatura: boolean;
      } | null;
    },
  });

  const ehEnvioAgrupado = !!dadosAgrupamento && dadosAgrupamento.parcelas.length > 1;

  const { data: dadosAgrupamentoContrato } = useQuery({
    queryKey: ["envio-agrupamento-contrato", conta.pasta_contrato_id, conta.forma_pagamento_id],
    enabled: open && !!conta.pasta_contrato_id && !!conta.forma_pagamento_id && !conta.parcela_grupo_id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: forma } = await (supabase as any)
        .from("formas_pagamento")
        .select("envio_agrupa_parcelas, nome")
        .eq("id", conta.forma_pagamento_id)
        .maybeSingle();
      if (!forma?.envio_agrupa_parcelas) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: parcelas } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, numero_parcela, parcelas, valor, data_vencimento, status")
        .eq("pasta_contrato_id", conta.pasta_contrato_id!)
        .in("status", ["aberto", "aprovado"])
        .order("data_vencimento", { ascending: true });
      if (!parcelas || parcelas.length <= 1) return null;
      return { parcelas, formaAgrupa: true };
    },
  });

  const [enviarTodas, setEnviarTodas] = useState(true);
  const ehEnvioAgrupadoContrato = !!dadosAgrupamentoContrato && dadosAgrupamentoContrato.parcelas.length > 1;

  useEffect(() => {
    if (!open) return;
    if (conta.dados_pagamento_fornecedor) {
      setDadosPgto({
        banco: conta.dados_pagamento_fornecedor.banco || "",
        agencia: conta.dados_pagamento_fornecedor.agencia || "",
        conta: conta.dados_pagamento_fornecedor.conta || "",
        pix: conta.dados_pagamento_fornecedor.pix || "",
      });
    }
  }, [open, conta.dados_pagamento_fornecedor]);

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

  const parceiroCadastroIncompleto = !!parceiroInfo?.cadastroIncompleto;

  const documentosTodos = useMemo<DocAnexo[]>(() => {
    const manuais = documentos || [];
    const docsNfs: DocAnexo[] = [];
    for (const nf of nfsStageAnexadas || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stageDocs = (nf.nfs_stage_documentos || []) as Array<any>;
      for (const sd of stageDocs) {
        const tipoStr = String(sd.tipo || "").toLowerCase();
        if (tipoStr.includes("pdf") || tipoStr.includes("danfe") || tipoStr.includes("recibo")) {
          docsNfs.push({
            id: `stage-${nf.id}-${sd.storage_path}`,
            tipo: "nf",
            nome_arquivo: sd.arquivo_nome || `NF ${nf.nf_numero || nf.id}.pdf`,
            storage_path: sd.storage_path,
          });
        }
      }
    }
    return [...manuais, ...docsNfs];
  }, [documentos, nfsStageAnexadas]);

  useEffect(() => {
    if (documentosTodos.length > 0 && docsSelecionados.size === 0) {
      setDocsSelecionados(new Set(documentosTodos.map((d) => d.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentosTodos]);

  const tamanhoSelecionado = useMemo(() => {
    let total = 0;
    for (const doc of documentosTodos) {
      if (docsSelecionados.has(doc.id) && doc.tamanho_bytes) {
        total += doc.tamanho_bytes;
      }
    }
    return total;
  }, [documentosTodos, docsSelecionados]);

  const tamanhoExcedeLimite = tamanhoSelecionado > 0 && tamanhoSelecionado > TAMANHO_LIMITE_ANEXO;

  function formatMB(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleAnexarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 30MB por arquivo)");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploadando(true);
    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${conta.id}/${timestamp}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("financeiro-docs")
        .upload(storagePath, file);
      if (upErr) throw upErr;

      const { data: novo, error: dbErr } = await supabase
        .from("contas_pagar_documentos")
        .insert({
          conta_id: conta.id,
          tipo: "outro",
          nome_arquivo: file.name,
          storage_path: storagePath,
          tamanho_bytes: file.size,
          uploaded_por: user?.id || null,
        })
        .select("id")
        .single();
      if (dbErr) throw dbErr;

      await qc.invalidateQueries({ queryKey: ["envio-pagto-docs", conta.id] });
      if (novo?.id) {
        setDocsSelecionados((prev) => new Set([...prev, novo.id]));
      }
      toast.success(`Anexo "${file.name}" adicionado`);
    } catch (err) {
      console.error("Erro no upload:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Falha no upload: " + msg);
    } finally {
      setUploadando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleEnviar() {
    if (parceiroCadastroIncompleto) {
      toast.error("Cadastro do Parceiro incompleto. Complete os dados bancários antes de enviar.");
      return;
    }
    if (!emailDestinatario) {
      toast.error("Selecione um destinatário");
      return;
    }
    if (!conta.forma_pagamento_id) {
      toast.error("Esta conta não tem forma de pagamento definida. Defina antes de enviar.");
      return;
    }

    setEnviando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        "executar_pagamento",
        {
          p_cpr_id: conta.id,
          p_dados_pagamento: dadosPgto,
          p_forma_pagamento_id: conta.forma_pagamento_id,
          p_numero_parcela: conta.parcela_atual || conta.numero_parcela || 1,
          p_observacao: obsEnvio || null,
          p_email_destinatario: emailDestinatario,
        },
      );

      if (rpcError || !rpcResult?.ok) {
        throw new Error(
          rpcResult?.erro || rpcError?.message || "Falha ao executar pagamento",
        );
      }

      if (rpcResult.pagamento_com_pendencia) {
        toast.warning(
          `Pagamento iniciado com pendência em: ${(rpcResult.pendencias || []).join(", ")}`,
          { duration: 5000 },
        );
      }

      const qtdEnriquecido =
        rpcResult.enriquecimento_parceiro?.qtd_campos_atualizados || 0;
      if (qtdEnriquecido > 0) {
        toast.info(
          `Dados bancários de ${fornecedorNome} salvos no cadastro. Não vamos pedir de novo.`,
          { duration: 4000 },
        );
      }

      const docsParaEnviar = documentosTodos.filter((d) => docsSelecionados.has(d.id));
      const emailResult = await supabase.functions.invoke("enviar-email-pagamento", {
        body: {
          cpr_id: conta.id,
          pasta_contrato_id: ehEnvioAgrupadoContrato && enviarTodas ? conta.pasta_contrato_id : undefined,
          email_destinatario: emailDestinatario,
          mensagem_personalizada: "",
          docs: docsParaEnviar.map((d) => ({
            tipo: d.tipo,
            nome_arquivo: d.nome_arquivo,
            storage_path: d.storage_path,
          })),
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emailOk = !emailResult.error && Boolean((emailResult.data as any)?.ok);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const respData = emailResult.data as any;
        if (respData?.agrupado && respData?.parcelas_enviadas > 1) {
          toast.success(
            `Enviado! ${respData.parcelas_enviadas} parcelas agrupadas para ${emailDestinatario}`,
          );
        } else {
          toast.success(`Enviado! Email para ${emailDestinatario}`);
        }
      } else {
        toast.warning(
          `Status atualizado, mas email falhou. Verifique a configuração.`,
        );
      }
      onDone();
      onOpenChange(false);
    } catch (e) {
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
          {/* Resumo (read-only) */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
            <div>
              <span className="text-muted-foreground">Fornecedor:</span>{" "}
              <span className="font-medium">{fornecedorNome}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Valor:</span>{" "}
              <span className="font-semibold text-foreground">{formatBRL(conta.valor)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Vencimento:</span>{" "}
              <span className="font-medium">{formatDateBR(conta.data_vencimento)}</span>
            </div>
            {conta.nf_numero && (
              <div>
                <span className="text-muted-foreground">NF:</span>{" "}
                <span className="font-medium">{conta.nf_numero}</span>
              </div>
            )}
            {categoriaTxt !== "—" && (
              <div>
                <span className="text-muted-foreground">Categoria:</span>{" "}
                <span className="font-medium">{categoriaTxt}</span>
              </div>
            )}
            {formaInfo?.nome && (
              <div>
                <span className="text-muted-foreground">Forma de pagamento:</span>{" "}
                <span className="font-medium">{formaInfo.nome}</span>
              </div>
            )}
          </div>

          {/* Dados bancários do destinatário — quando forma requer */}
          {formaInfo?.requer_dados_bancarios_destinatario &&
            parceiroDadosBancarios &&
            (parceiroDadosBancarios.banco ||
              parceiroDadosBancarios.agencia ||
              parceiroDadosBancarios.conta ||
              parceiroDadosBancarios.pix) && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-1 text-sm">
                <div className="font-semibold text-emerald-900 mb-1">
                  Dados bancários do destinatário
                </div>
                {parceiroDadosBancarios.pix && (
                  <div>
                    <span className="text-muted-foreground">PIX:</span>{" "}
                    <span className="font-medium">{parceiroDadosBancarios.pix}</span>
                  </div>
                )}
                {parceiroDadosBancarios.banco && (
                  <div>
                    <span className="text-muted-foreground">Banco:</span>{" "}
                    <span className="font-medium">{parceiroDadosBancarios.banco}</span>
                  </div>
                )}
                {parceiroDadosBancarios.agencia && (
                  <div>
                    <span className="text-muted-foreground">Agência:</span>{" "}
                    <span className="font-medium">{parceiroDadosBancarios.agencia}</span>
                  </div>
                )}
                {parceiroDadosBancarios.conta && (
                  <div>
                    <span className="text-muted-foreground">Conta:</span>{" "}
                    <span className="font-medium">{parceiroDadosBancarios.conta}</span>
                  </div>
                )}
              </div>
            )}

          {/* Pré-validação cadastro_incompleto */}
          {parceiroCadastroIncompleto && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm">
                <div className="font-semibold text-amber-900">
                  Cadastro do Parceiro incompleto
                </div>
                <div className="text-amber-800">
                  Antes de enviar pagamento, complete os dados bancários no cadastro do Parceiro.
                  O envio só fica liberado quando o cadastro está completo.
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/administrativo/parceiros?abrir=${conta.parceiro_id}`);
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir cadastro do Parceiro
                </Button>
              </div>
            </div>
          )}

          {/* Envio agrupado */}
          {ehEnvioAgrupado && dadosAgrupamento && (
            <div className="rounded-md border border-blue-300 bg-blue-50 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                <Users className="h-4 w-4" />
                Envio agrupado: {dadosAgrupamento.parcelas.length} parcelas serão enviadas juntas
              </div>
              <div className="text-xs text-blue-800">
                Como o pagamento é {dadosAgrupamento.formaNome.toLowerCase()}, o financeiro recebe
                todas as parcelas pendentes do grupo no mesmo email para pré-agendar no banco.
              </div>
              <div className="space-y-1">
                {dadosAgrupamento.parcelas.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1">
                    <span className="font-medium text-blue-900">
                      {p.parcela_atual}/{p.parcelas}
                    </span>
                    <span className="text-blue-800">{formatDateBR(p.data_vencimento)}</span>
                    <span className="font-semibold text-blue-900">{formatBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ehEnvioAgrupadoContrato && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm mb-3">
              <p className="font-medium text-blue-800 mb-2">
                Este contrato tem {dadosAgrupamentoContrato!.parcelas.length} parcelas em aberto.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant={enviarTodas ? "default" : "outline"} onClick={() => setEnviarTodas(true)}>
                  Enviar todas ({dadosAgrupamentoContrato!.parcelas.length})
                </Button>
                <Button size="sm" variant={!enviarTodas ? "default" : "outline"} onClick={() => setEnviarTodas(false)}>
                  Só esta parcela
                </Button>
              </div>
            </div>
          )}

          {/* Destinatário */}
          <div className="space-y-1.5">
            <Label htmlFor="email-dest">Enviar para</Label>
            {destinatarios && destinatarios.length > 0 ? (
              <select
                id="email-dest"
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
                id="email-dest"
                type="email"
                value={emailDestinatario}
                onChange={(e) => setEmailDestinatario(e.target.value)}
                placeholder="financeiro@empresa.com"
              />
            )}
          </div>

          {/* Documentos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Documentos ({docsSelecionados.size}/{documentosTodos.length})
              </Label>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleAnexarArquivo}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadando}
                >
                  {uploadando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                  Adicionar anexo
                </Button>
              </div>
            </div>

            {documentosTodos.length > 0 ? (
              <>
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                  {documentosTodos.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-muted/50 rounded"
                    >
                      <Checkbox
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
                      {doc.tamanho_bytes && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatMB(doc.tamanho_bytes)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {tamanhoSelecionado > 0 && (
                  <div className={`text-xs ${tamanhoExcedeLimite ? "text-amber-700" : "text-muted-foreground"}`}>
                    Total selecionado: {formatMB(tamanhoSelecionado)}
                    {tamanhoExcedeLimite
                      ? ` (excede 18MB — alguns docs virão como link assinado 30 dias)`
                      : ` (anexados ao email)`}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground italic px-2 py-3 border rounded-md">
                ⚠ Nenhum documento anexado. O envio será feito sem anexos.
              </div>
            )}
          </div>

          {/* Observação adicional */}
          <div className="space-y-1.5">
            <Label htmlFor="obs-envio">Observação adicional</Label>
            <Textarea
              id="obs-envio"
              value={obsEnvio}
              onChange={(e) => setObsEnvio(e.target.value)}
              placeholder="Opcional — aparece destacada no email"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            onClick={handleEnviar}
            disabled={enviando || parceiroCadastroIncompleto || uploadando}
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
