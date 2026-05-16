import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Check,
  FileText,
  UserCheck,
  Send,
  ThumbsUp,
  X,
  ShieldCheck,
  RotateCcw,
  Clock,
  ChevronDown,
  CreditCard,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Loader2,
  ExternalLink,
  Ban,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import RegistrarPagamentoDialog from "./RegistrarPagamentoDialog";
import StatusProgressBar from "./StatusProgressBar";
import TimelineHistorico from "./TimelineHistorico";
import EnviarPagamentoDialog from "./EnviarPagamentoDialog";
import DocumentosCP from "./DocumentosCP";

import { NfStageVinculadaCard } from "@/components/financeiro/NfStageVinculadaCard";
import ContaPagarFormEdit from "./ContaPagarFormEdit";
import { useContaWorkflow, type ContaStatus } from "@/hooks/useContaWorkflow";
import { formatError } from "@/lib/format-error";

type Conta = {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  valor_pago?: number | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  conta_id: string | null;
  centro_custo_id: string | null;
  centros_custo?: { codigo: string; nome: string } | null;
  linhas_investimento?: {
    descricao: string | null;
    temas_investimento?: {
      nome: string | null;
      frentes_investimento?: { nome: string | null } | null;
    } | null;
  } | null;
  forma_pagamento_id: string | null;
  origem: string | null;
  observacao?: string | null;
  observacao_pagamento?: string | null;
  comprovante_url?: string | null;
  nf_chave_acesso?: string | null;
  nf_numero?: string | null;
  
  nf_serie?: string | null;
  nf_pdf_url?: string | null;
  nf_xml_url?: string | null;
  nf_aplicavel?: boolean | null;
  nf_aplicavel_motivo?: string | null;
  vinculo_nf_completo?: boolean | null;
  valor_nf_vinculado?: number | null;
  parcela_atual?: number | null;
  parcelas?: number | null;
  email_pagamento_enviado?: boolean | null;
  enviado_pagamento_em?: string | null;
  meio_pagamento_id?: string | null;
  meios_pagamento?: { codigo?: string | null } | null;
  docs_status?: "ok" | "pendente" | "parcial" | null;
  dados_bancarios_fornecedor?: { banco?: string; agencia?: string; conta?: string; pix?: string } | null;
  dados_pagamento_fornecedor?: { banco?: string; agencia?: string; conta?: string; pix?: string } | null;
  plano_contas?: { codigo?: string | null; nome?: string | null } | null;
  formas_pagamento?: { nome?: string | null; codigo?: string | null } | null;
  parceiros_comerciais?: { razao_social?: string | null } | null;
  movimentacao_bancaria_id?: string | null;
  pago_em_conta_id?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aberto: "Aberto",
  atrasado: "Atrasado",
  aprovado: "Aprovado",
  agendado: "Enviado",
  enviado_para_pagamento: "Enviado para Pagamento",
  cancelado: "Cancelado",
  conciliado: "Conciliado",
};

const STATUS_STYLE: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  aberto: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  atrasado: "bg-red-100 text-red-800 hover:bg-red-100",
  aprovado: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  agendado: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  enviado_para_pagamento: "bg-green-100 text-green-800 hover:bg-green-100",
  cancelado: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  conciliado: "bg-teal-100 text-teal-800 hover:bg-teal-100",
};

interface Props {
  contaId: string | null;
  onClose: () => void;
  iniciarEditando?: boolean;
  highlightCampo?: "pago_em_conta_id" | null;
}

export default function ContaPagarDetalheDrawer({
  contaId,
  onClose,
  iniciarEditando = false,
  highlightCampo = null,
}: Props) {
  const [showPag, setShowPag] = useState(false);
  const [showEnviar, setShowEnviar] = useState(false);
  const [modoEdit, setModoEdit] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [lancandoMov, setLancandoMov] = useState(false);
  
  const workflow = useContaWorkflow();
  const qc = useQueryClient();

  async function handleLancarMov() {
    if (!conta) return;
    setLancandoMov(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc(
        "gerar_movimentacao_de_conta",
        { p_conta_id: conta.id }
      );
      if (error) throw error;
      if (!result?.ok) {
        toast.error(result?.erro || "Erro ao lançar em movimentação");
        return;
      }

      if (result?.ja_existia) {
        toast.info("Esta conta já tinha movimentação vinculada");
      } else {
        toast.success("Lançada em Movimentação");
      }

      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", conta.id] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setLancandoMov(false);
    }
  }

  async function handleApagar(apagarGrupoInteiro = false) {
    if (!conta) return;
    setApagando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc(
        "apagar_conta_pagar",
        {
          p_id: conta.id,
          p_apagar_grupo_inteiro: apagarGrupoInteiro,
        },
      );
      if (error) throw error;

      // Caso 1: grupo de parcelas — pede confirmação cascade
      if (result?.precisa_confirmar_grupo) {
        const qtd = result.qtd_parcelas_grupo;
        const ok = window.confirm(
          `Esta conta faz parte de um grupo de ${qtd} parcelas.\n\n` +
          `Apagar TODAS as ${qtd} parcelas?\n\n` +
          `OK = apaga todas\n` +
          `Cancelar = cancela operação`
        );
        if (ok) {
          await handleApagar(true);
        }
        return;
      }

      // Caso 2: erro de regra (status, cartão vinculado, conciliado etc)
      if (!result?.ok) {
        toast.error(result?.erro || "Erro ao apagar");
        return;
      }

      // Caso 3: sucesso
      const msg = result.cascade_grupo
        ? `${result.apagadas} parcelas apagadas`
        : "Conta apagada";
      toast.success(msg);

      if (result.nfs_desvinculadas > 0) {
        toast.info(`${result.nfs_desvinculadas} NF(s) voltaram pra fila de não-vinculadas`);
      }

      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      onClose();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message :
        typeof e === "object" && e !== null
          ? ((e as { message?: string }).message ?? JSON.stringify(e))
          : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setApagando(false);
    }
  }

  useEffect(() => {
    setModoEdit(false);
  }, [contaId]);

  const { data: conta } = useQuery({
    queryKey: ["conta-pagar-detalhe", contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar_receber")
        .select(
          `*, plano_contas:conta_id(codigo,nome), formas_pagamento:forma_pagamento_id(nome,codigo,cobra_email,pula_aprovacao), meios_pagamento:meio_pagamento_id(codigo), parceiros_comerciais:parceiro_id(razao_social), centros_custo:centro_custo_id(codigo,nome), linhas_investimento:linha_investimento_id(descricao, temas_investimento:tema_id(nome, frentes_investimento:frente_id(nome)))`
        )
        .eq("id", contaId!)
        .single();
      if (error) throw error;
      return data as unknown as Conta;
    },
  });

  // Detectar se a CPR tem irmãs (mesmo parcela_grupo_id, não-canceladas)
  // parcela_grupo_id é universal — cobre Pedido de Compra, NF parcelada, contrato, compromisso
  const { data: irmasInfo } = useQuery({
    queryKey: ["cpr-irmas-info", (conta as unknown as { parcela_grupo_id?: string | null })?.parcela_grupo_id, conta?.id],
    enabled: !!(conta as unknown as { parcela_grupo_id?: string | null })?.parcela_grupo_id && !!conta?.id,
    queryFn: async () => {
      const grupoId = (conta as unknown as { parcela_grupo_id?: string | null })?.parcela_grupo_id;
      if (!grupoId || !conta?.id) return { totalIrmas: 0 };
      const { count } = await supabase
        .from("contas_pagar_receber")
        .select("id", { count: "exact", head: true })
        .eq("parcela_grupo_id", grupoId)
        .neq("id", conta.id)
        .neq("status", "cancelado");
      return { totalIrmas: count || 0 };
    },
  });

  const temIrmasAtivas = (irmasInfo?.totalIrmas ?? 0) > 0;

  const { data: comprovUrl } = useQuery({
    queryKey: ["comprovante-url", conta?.comprovante_url],
    enabled: !!conta?.comprovante_url,
    queryFn: async () => {
      const { data } = await supabase.storage
        .from("comprovantes-pagamento")
        .createSignedUrl(conta!.comprovante_url!, 60 * 10);
      return data?.signedUrl || null;
    },
  });

  const { data: nfPjId } = useQuery({
    queryKey: ["nf-pj-by-numero", conta?.nf_numero, conta?.origem],
    enabled: !!conta && conta.origem === "nf_pj_interno" && !!conta.nf_numero,
    queryFn: async () => {
      const { data } = await supabase
        .from("notas_fiscais_pj")
        .select("id")
        .eq("numero", conta!.nf_numero!)
        .limit(1)
        .maybeSingle();
      return data?.id || null;
    },
  });

  const { data: itens } = useQuery({
    queryKey: ["conta-pagar-itens", contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar_itens")
        .select("id, descricao, ncm, quantidade, unidade, valor_total, conta_plano_id, plano_contas:conta_plano_id(codigo, nome)")
        .eq("conta_id", contaId!);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        descricao: string;
        ncm: string | null;
        quantidade: number | null;
        unidade: string | null;
        valor_total: number | null;
        conta_plano_id: string | null;
        plano_contas?: { codigo?: string | null; nome?: string | null } | null;
      }>;
    },
  });

  const temCategoriasMultiplas = (() => {
    if (!itens || itens.length < 2) return false;
    const cats = new Set(itens.map((i) => i.conta_plano_id || "_sem"));
    return cats.size > 1;
  })();

  async function avancar(novoStatus: ContaStatus, observacao?: string, closeOnSuccess = true) {
    if (!conta) return;
    await workflow.mudarStatus.mutateAsync({
      contaId: conta.id,
      statusAnterior: conta.status,
      novoStatus,
      observacao: observacao || undefined,
    });
    // Click inteligente: por padrão fecha o drawer após avançar status
    // Próxima ação geralmente é avaliar outras CPRs
    if (closeOnSuccess) onClose();
  }

  const dadosBancarios =
    conta?.dados_bancarios_fornecedor || conta?.dados_pagamento_fornecedor || null;
  const isCartao = conta?.meios_pagamento?.codigo === "fatura_cartao";

  // Fatura de cartão vinculada a esta CPR (via fatura_cartao_lancamentos)
  const { data: faturaVinculada } = useQuery({
    queryKey: ["fatura-da-cpr", conta?.id],
    enabled: !!conta?.id && isCartao,
    queryFn: async () => {
      if (!conta?.id) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("fatura_cartao_lancamentos")
        .select("fatura_id, faturas_cartao:fatura_id(data_vencimento, periodo_inicio, periodo_fim, valor_total, status)")
        .eq("conta_pagar_id", conta.id)
        .maybeSingle();
      return data as {
        fatura_id: string;
        faturas_cartao: {
          data_vencimento: string;
          periodo_inicio: string | null;
          periodo_fim: string | null;
          valor_total: number;
          status: string;
        } | null;
      } | null;
    },
  });

  return (
    <Sheet open={!!contaId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {!conta ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="truncate">{conta.descricao}</SheetTitle>
                  <SheetDescription className="flex items-center gap-2 flex-wrap">
                    <span>{conta.tipo === "pagar" ? "Conta a pagar" : "Conta a receber"}</span>
                    {conta.origem === "nf_pj_interno" && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <UserCheck className="h-3 w-3" /> NF PJ
                      </Badge>
                    )}
                    {isCartao && (
                    <Badge variant="outline" className="gap-1 text-xs border-blue-300 text-blue-700">
                        <CreditCard className="h-3 w-3" /> Cartão
                      </Badge>
                    )}
                    {conta.movimentacao_bancaria_id && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 gap-1">
                        <ArrowRightLeft className="h-3 w-3" />
                        Já em Movimentação
                      </Badge>
                    )}
                  </SheetDescription>
                </div>
                <Badge className={STATUS_STYLE[conta.status] || "bg-muted"}>
                  {STATUS_LABEL[conta.status] || conta.status}
                </Badge>
                {!modoEdit && conta.status !== "cancelado" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-2"
                    onClick={() => setModoEdit(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    {conta.status === "enviado_para_pagamento" ? "Ver dados" : "Editar"}
                  </Button>
                )}
                {/* Botão de Lançar em Mov movido pra área de ações por status (footer) — bloco aguardando_pagamento */}
              </div>
              <div className="text-2xl font-bold mt-2">{formatBRL(conta.valor)}</div>
              {conta.origem === "nf_pj_interno" && nfPjId && (
                <Link
                  to={`/notas-fiscais/${nfPjId}`}
                  className="text-sm text-admin underline mt-1 inline-block"
                >
                  Ver NF PJ original no People →
                </Link>
              )}
            </SheetHeader>

            {modoEdit ? (
              <div className="mt-4">
                <ContaPagarFormEdit
                  conta={{
                    id: conta.id,
                    descricao: conta.descricao,
                    data_vencimento: conta.data_vencimento,
                    conta_id: conta.conta_id,
                    centro_custo_id: conta.centro_custo_id,
                    forma_pagamento_id: conta.forma_pagamento_id,
                    observacao: conta.observacao ?? null,
                    nf_numero: conta.nf_numero ?? null,
                    nf_serie: conta.nf_serie ?? null,
                    nf_chave_acesso: conta.nf_chave_acesso ?? null,
                    nf_aplicavel: conta.nf_aplicavel ?? true,
                    nf_aplicavel_motivo: conta.nf_aplicavel_motivo ?? null,
                    status: conta.status,
                    pago_em_conta_id: conta.pago_em_conta_id ?? null,
                    parceiro_id: conta.parceiro_id ?? null,
                    // Campos pra família (visibilidade por origem)
                    meio_pagamento_id: conta.meio_pagamento_id ?? null,
                    meios_pagamento: conta.meios_pagamento ?? null,
                    origem: conta.origem ?? null,
                    formas_pagamento: conta.formas_pagamento ?? null,
                  }}
                  onSaved={() => setModoEdit(false)}
                  onCancel={() => setModoEdit(false)}
                  highlightCampo={highlightCampo}
                />
              </div>
            ) : (
              <>
            <div className="mt-4">
              <StatusProgressBar statusAtual={conta.status} isCartao={isCartao} />
            </div>

            {isCartao && conta.status === "aberto" && (
              <div className="mt-3 p-2 rounded-md bg-blue-50 text-blue-700 text-[11px] flex items-center gap-2">
                <CreditCard className="h-3 w-3" />
                Cartão — pagamento via fatura mensal. Conciliação acontece em Caixa & Banco quando a fatura é paga.
              </div>
            )}

            <Separator className="my-4" />

            {/* Informações */}
            <div className="space-y-3 text-sm">
              <Linha label="Parceiro" value={conta.parceiros_comerciais?.razao_social || conta.fornecedor_cliente || "—"} />
              <Linha
                label="Categoria"
                value={
                  conta.plano_contas
                    ? `${conta.plano_contas.codigo || ""} ${conta.plano_contas.nome || ""}`.trim()
                    : "—"
                }
              />
              <Linha label="Centro de custo" value={conta.centros_custo?.nome || "—"} />
              {(() => {
                const li = conta.linhas_investimento;
                const frente = li?.temas_investimento?.frentes_investimento?.nome;
                const tema = li?.temas_investimento?.nome;
                const desc = li?.descricao;
                const txt = li ? [frente, tema, desc].filter(Boolean).join(" · ") : "";
                return <Linha label="Linha de investimento" value={txt || "—"} />;
              })()}
              <Linha label="Forma de pagamento" value={conta.formas_pagamento?.nome || "—"} />
              {isCartao && faturaVinculada?.faturas_cartao && (
                <Linha
                  label="Fatura vinculada"
                  value={
                    <span className="text-xs text-primary">
                      vence {formatDateBR(faturaVinculada.faturas_cartao.data_vencimento)}
                      {" · "}
                      {formatBRL(faturaVinculada.faturas_cartao.valor_total)}
                    </span>
                  }
                />
              )}
              {isCartao && !faturaVinculada?.faturas_cartao && conta?.status !== "cancelado" && (
                <Linha
                  label="Fatura vinculada"
                  value={<span className="text-xs text-muted-foreground">não vinculada</span>}
                />
              )}
              <Linha label="Vencimento" value={formatDateBR(conta.data_vencimento)} />
              {conta.data_pagamento && (
                <Linha label="Pago em" value={formatDateBR(conta.data_pagamento)} />
              )}
              {conta.valor_pago != null && conta.valor_pago !== conta.valor && (
                <Linha label="Valor pago" value={formatBRL(conta.valor_pago)} />
              )}
              {conta.parcelas && conta.parcelas > 1 && (
                <Linha label="Parcela" value={`${conta.parcela_atual || 1} de ${conta.parcelas}`} />
              )}
              <Linha label="Origem" value={conta.origem || "manual"} />

              {conta.observacao && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Observação</div>
                  <p className="text-sm">{conta.observacao}</p>
                </div>
              )}
              {conta.observacao_pagamento && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Observação do pagamento</div>
                  <p className="text-sm">{conta.observacao_pagamento}</p>
                </div>
              )}
            </div>

            {/* Dados de pagamento (colapsável) */}
            <Separator className="my-4" />
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left group">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Dados de pagamento
                </p>
                <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2 text-xs">
                {isCartao ? (
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-muted-foreground">
                      Pagamento via {conta.formas_pagamento?.nome || "cartão"} — sem dados bancários necessários.
                    </p>
                  </div>
                ) : dadosBancarios ? (
                  <div className="space-y-1">
                    {dadosBancarios.banco && <Linha label="Banco" value={dadosBancarios.banco} />}
                    {dadosBancarios.agencia && <Linha label="Agência" value={dadosBancarios.agencia} />}
                    {dadosBancarios.conta && <Linha label="Conta" value={dadosBancarios.conta} />}
                    {dadosBancarios.pix && <Linha label="PIX" value={<span className="font-mono">{dadosBancarios.pix}</span>} />}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Nenhum dado bancário cadastrado. Será solicitado ao enviar para pagamento.
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Documentos */}
            <Separator className="my-4" />

            <VinculoNFStatusBadge conta={conta} />
            <NFsAnexadasSecao contaId={conta.id} />
            <DocumentosCP
              contaId={conta.id}
              docsStatus={conta.docs_status || "pendente"}
              nfChaveAcesso={conta.nf_chave_acesso}
              nfNumero={conta.nf_numero}
              origem={conta.origem}
            />

            {/* NF vinculada (com PDF/XML, links) */}
            {(conta.nf_pdf_url || conta.nf_xml_url) && (
              <>
                <Separator className="my-4" />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Arquivos da NF</p>
                  <div className="flex gap-2">
                    {conta.nf_pdf_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={conta.nf_pdf_url} target="_blank" rel="noreferrer">PDF</a>
                      </Button>
                    )}
                    {conta.nf_xml_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={conta.nf_xml_url} target="_blank" rel="noreferrer">XML</a>
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Itens com categorias múltiplas */}
            {itens && itens.length > 0 && temCategoriasMultiplas && (
              <>
                <Separator className="my-4" />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Classificação por item
                  </p>
                  <div className="space-y-2">
                    {itens.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-start gap-3 p-2 rounded bg-muted/50 text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.descricao}</p>
                          <p className="text-muted-foreground">
                            NCM: {item.ncm || "—"}
                            {item.quantidade != null && (
                              <> · Qtd: {item.quantidade} {item.unidade || ""}</>
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium">{formatBRL(item.valor_total || 0)}</p>
                          <p className="text-muted-foreground">
                            {item.plano_contas
                              ? `${item.plano_contas.codigo || ""} ${item.plano_contas.nome || ""}`.trim()
                              : "Sem categoria"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Comprovante */}
            {conta.comprovante_url && (
              <>
                <Separator className="my-4" />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Comprovante</p>
                  {comprovUrl ? (
                    <Button size="sm" variant="outline" asChild className="gap-2">
                      <a href={comprovUrl} target="_blank" rel="noreferrer">
                        <FileText className="h-4 w-4" /> Ver comprovante
                      </a>
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Carregando link…</p>
                  )}
                </div>
              </>
            )}

            {/* AÇÕES DO WORKFLOW - PR2: aberto → aprovado → doc_pendente → finalizado */}
            {conta.tipo === "pagar" && (
              <>
                <Separator className="my-4" />
                <div className="space-y-3">
                  {/* ABERTO ou ATRASADO → pode aprovar */}
                  {(conta.status === "aberto" || conta.status === "atrasado") && (
                    <div className="space-y-2">
                      <p
                        className={`text-xs ${conta.status === "atrasado" ? "text-red-600 font-medium" : "text-muted-foreground"}`}
                      >
                        {conta.status === "atrasado"
                          ? "⚠ Atrasada! Aprove para liberar pagamento."
                          : "Validada. Aprove para liberar pagamento."}
                      </p>
                      <Button
                        className="w-full bg-purple-700 hover:bg-purple-800 text-white gap-2"
                        onClick={async () => {
                          // Cartão vai direto pra aguardando_pagamento em cascata (sem email ao fornecedor)
                          // Não-cartão vai pra aprovado em cascata (requer envio de email depois)
                          const statusAlvo = isCartao ? "enviado_para_pagamento" : "aprovado";
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const { data: cascata } = await (supabase as any).rpc(
                            "aprovar_cpr_em_cascata",
                            { p_cpr_id: conta.id, p_status_alvo: statusAlvo },
                          );
                          const totalAprovadas = (cascata?.parcelas_aprovadas as number) || 1;
                          if (totalAprovadas > 1) {
                            toast.success(
                              isCartao
                                ? `${totalAprovadas} parcelas aguardando pagamento pela fatura`
                                : `${totalAprovadas} parcelas do grupo aprovadas`,
                            );
                          }
                          onClose();
                        }}
                      >
                        <ThumbsUp className="h-4 w-4" /> Aprovar pagamento
                      </Button>
                    </div>
                  )}

                  {/* APROVADO → enviar para pagamento (Família A) ou pular pra aguardando (Família B) */}
                  {conta.status === "aprovado" && (
                    <div className="space-y-2">
                      {isCartao ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Pagamento via fatura de cartão — não cabe envio de email ao fornecedor.
                          </p>
                          <Button
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
                            onClick={() =>
                              avancar(
                                "enviado_para_pagamento",
                                "Marcado como aguardando — pagamento via fatura de cartão.",
                              )
                            }
                          >
                            <Send className="h-4 w-4" /> Marcar como aguardando pagamento
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Aprovado! Envie ao financeiro com os documentos.
                          </p>
                          <Button
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
                            onClick={() => setShowEnviar(true)}
                          >
                            <Send className="h-4 w-4" /> Enviar para pagamento
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {/* AGUARDANDO_PAGAMENTO → pagar via fatura (cartão c/ fatura) ou manualmente */}
                  {conta.status === "enviado_para_pagamento" && !conta.movimentacao_bancaria_id && (
                    <div className="space-y-2">
                      {isCartao && faturaVinculada?.faturas_cartao ? (
                        <div className="space-y-2">
                          <div className="p-3 rounded-lg bg-blue-50 text-blue-700 text-sm flex items-start gap-2">
                            <CreditCard className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>Pague pela fatura de cartão — todas as despesas vinculadas serão marcadas como pagas.</span>
                          </div>
                          <Button
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                            onClick={() => {
                              onClose();
                              window.location.href = "/administrativo/faturas-cartao";
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Ir para Faturas de Cartão
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
                            <Clock className="h-4 w-4" /> Enviado para pagamento — quando confirmar que foi pago, marque abaixo
                          </div>
                          <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                            onClick={async () => {
                              await handleLancarMov();
                              onClose();
                            }}
                            disabled={lancandoMov}
                          >
                            {lancandoMov ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowRightLeft className="h-4 w-4" />
                            )}
                            Marcar como paga
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {/* DOC_PENDENTE → reenviar email + opção finalizar manual */}
                  {conta.status === "doc_pendente" && (
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4" /> Aguardando NF/Recibo do fornecedor
                      </div>
                      <Button
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
                        onClick={() => setShowEnviar(true)}
                      >
                        <Send className="h-4 w-4" /> Reenviar e-mail (cobrar documentação)
                      </Button>
                      <button
                        className="text-[11px] text-muted-foreground hover:text-foreground underline w-full text-center"
                        onClick={() => avancar("enviado_para_pagamento", "Marcado como aguardando pagamento (documentação OK)")}
                      >
                        Finalizar manualmente (NF entregue fora do sistema)
                      </button>
                    </div>
                  )}

                  {/* FINALIZADO */}
                  {conta.status === "finalizado" && (
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2">
                        <Check className="h-4 w-4" /> Finalizado — documentação OK, pagamento gerenciado em Caixa e Banco
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => setShowEnviar(true)}
                      >
                        <Send className="h-3.5 w-3.5" /> Reenviar e-mail (caso necessário)
                      </Button>
                    </div>
                  )}

                  {/* CANCELADO */}
                  {conta.status === "cancelado" && (
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg bg-gray-100 text-gray-700 text-sm flex items-center gap-2">
                        <X className="h-4 w-4" /> Cancelado
                      </div>
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => avancar("aberto", "Reaberto após cancelamento", false)}
                      >
                        <RotateCcw className="h-4 w-4" /> Reabrir
                      </Button>
                    </div>
                  )}

                  {/* STATUS LEGADOS (registros antigos migrados manualmente) */}
                  {(conta.status === "rascunho" || conta.status === "agendado" || conta.status === "conciliado") && (
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg bg-blue-50 text-blue-700 text-xs">
                        Status legado: <strong>{conta.status}</strong>. Reabrir para novo fluxo.
                      </div>
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => avancar("aberto", "Migrado para novo fluxo", false)}
                      >
                        <RotateCcw className="h-4 w-4" /> Reabrir para novo fluxo
                      </Button>
                    </div>
                  )}

                  {/* Botão Cancelar — disponível em qualquer status antes de pagar */}
                  {conta.status !== "enviado_para_pagamento" &&
                    conta.status !== "cancelado" &&
                    conta.status !== "finalizado" &&
                    conta.status !== "conciliado" && (
                      <div className="pt-4 border-t">
                        <CancelarButton conta={conta} workflow={workflow} onClose={onClose} temIrmasAtivas={temIrmasAtivas} />
                      </div>
                    )}
                </div>
              </>
            )}

            {showPag && (
              <RegistrarPagamentoDialog
                open={showPag}
                onOpenChange={setShowPag}
                conta={{
                  id: conta.id,
                  descricao: conta.descricao,
                  valor: conta.valor,
                  forma_pagamento_id: conta.forma_pagamento_id,
                }}
                onPaid={onClose}
              />
            )}

            {showEnviar && (
              <EnviarPagamentoDialog
                open={showEnviar}
                onOpenChange={setShowEnviar}
                conta={conta}
                onDone={() => {}}
              />
            )}

            <Separator className="my-4" />
            <TimelineHistorico contaId={conta.id} />
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CancelarButton({
  conta,
  workflow: _workflow,
  onClose,
  temIrmasAtivas,
}: {
  conta: { id: string; status: string };
  workflow: ReturnType<typeof useContaWorkflow>;
  onClose: () => void;
  temIrmasAtivas: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          className="w-full text-red-500 hover:text-red-700 hover:bg-red-50 gap-2 text-xs"
        >
          <X className="h-3 w-3" /> Cancelar esta conta
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {temIrmasAtivas ? "Cancelar parcela ou pedido inteiro?" : "Cancelar esta conta?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {temIrmasAtivas ? (
              <>
                Este pedido tem outras parcelas ativas. Você pode cancelar apenas esta parcela
                ou o pedido inteiro. NFs/Recibos vinculados são desvinculados automaticamente.
                Parcelas já pagas ou canceladas não são afetadas.
              </>
            ) : (
              <>
                O status mudará para "cancelado" e qualquer NF/Recibo vinculado será desvinculado
                automaticamente (voltará pro Stage). Você poderá reverter depois se necessário.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={async () => {
              try {
                const { data, error } = await supabase.rpc("cancelar_conta_pagar", {
                  p_conta_id: conta.id,
                });
                if (error) throw error;
                const result = data as { success: boolean; error?: string; nf_desvinculada?: boolean };
                if (!result?.success) {
                  toast.error(result?.error || "Erro ao cancelar conta");
                  return;
                }
                toast.success(
                  result.nf_desvinculada
                    ? "Conta cancelada e NF desvinculada com sucesso!"
                    : "Conta cancelada com sucesso!"
                );
                onClose();
              } catch (e) {
                console.error("Erro ao cancelar:", e);
                toast.error("Erro ao cancelar: " + formatError(e));
              }
            }}
          >
            {temIrmasAtivas ? "Só esta parcela" : "Sim, cancelar"}
          </AlertDialogAction>
          {temIrmasAtivas && (
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-800 text-white"
              onClick={async () => {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const { data, error } = await (supabase as any).rpc(
                    "cancelar_pedido_inteiro_via_cpr",
                    { p_cpr_id: conta.id },
                  );
                  if (error) throw error;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const result = data as any;
                  if (!result?.ok) {
                    toast.error(result?.erro || "Erro ao cancelar pedido");
                    return;
                  }
                  const canceladas = result.parcelas_canceladas as number;
                  const protegidas = result.parcelas_protegidas as number;
                  toast.success(
                    protegidas > 0
                      ? `${canceladas} parcelas canceladas. ${protegidas} preservadas (já pagas ou canceladas).`
                      : `${canceladas} parcelas canceladas — pedido inteiro.`,
                  );
                  onClose();
                } catch (e) {
                  console.error("Erro ao cancelar pedido:", e);
                  toast.error("Erro: " + formatError(e));
                }
              }}
            >
              Pedido inteiro
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Linha({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}


// NFs vinculadas à CPR — modelo N:1 via nfs_stage.conta_pagar_id
function NFsAnexadasSecao({ contaId }: { contaId: string }) {
  const qc = useQueryClient();

  const { data: nfs = [] } = useQuery({
    queryKey: ["nfs-anexadas-cpr", contaId],
    enabled: !!contaId,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("nfs_stage")
        .select("id, tipo_documento, fornecedor_razao_social, nf_numero, valor, nf_data_emissao")
        .eq("conta_pagar_id", contaId)
        .neq("status", "descartada")
        .order("nf_data_emissao", { ascending: false });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        tipo_documento: string | null;
        fornecedor_razao_social: string | null;
        nf_numero: string | null;
        valor: number | null;
        nf_data_emissao: string | null;
      }>;
    },
  });

  async function desanexarNF(nfId: string) {
    // Desanexa uma NF específica zerando seu conta_pagar_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("nfs_stage")
      .update({ conta_pagar_id: null })
      .eq("id", nfId);
    if (error) {
      toast.error("Erro ao desanexar: " + error.message);
      return;
    }
    toast.success("NF desanexada");
    qc.invalidateQueries({ queryKey: ["nfs-anexadas-cpr", contaId] });
    qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", contaId] });
    qc.invalidateQueries({ queryKey: ["nfs-stage"] });
    qc.invalidateQueries({ queryKey: ["contas-pagar"] });
  }


  const totalNFs = nfs.length;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          NFs anexadas do Repositório
          {totalNFs > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {totalNFs}
            </Badge>
          )}
        </div>
      </div>

      {totalNFs === 0 ? (
        <div className="text-xs text-muted-foreground italic px-2 py-3 border border-dashed rounded">
          Sem NF anexada. Edite a CPR (botão acima) e use o campo "Prova fiscal" pra anexar do Repositório.
        </div>
      ) : (
        <div className="space-y-1.5">
          {nfs.map((nf) => (
            <div
              key={nf.id}
              className="flex items-center justify-between gap-2 p-2 rounded border border-emerald-200 bg-emerald-50/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <FileText className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {nf.fornecedor_razao_social || "Fornecedor"}
                  </span>
                  {nf.nf_numero && (
                    <span className="text-xs text-muted-foreground">
                      · NF {nf.nf_numero}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  {nf.valor !== null && (
                    <span>R$ {Number(nf.valor).toFixed(2).replace(".", ",")}</span>
                  )}
                  {nf.nf_data_emissao && (
                    <span>
                      {new Date(nf.nf_data_emissao + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => desanexarNF(nf.id)}
                className="h-6 w-6 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 shrink-0"
                title="Desanexar esta NF"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================
// Status do vínculo NF (badge + subtítulo)
// =====================================================
function VinculoNFStatusBadge({ conta }: { conta: Conta }) {
  const valor = Number(conta.valor || 0);
  const vinculado = Number(conta.valor_nf_vinculado || 0);
  const aplicavel = conta.nf_aplicavel !== false;
  const completo = conta.vinculo_nf_completo === true;

  let icon: React.ReactNode;
  let titulo: string;
  let subtitulo: React.ReactNode;
  let cls: string;

  if (!aplicavel) {
    icon = <Ban className="h-4 w-4" />;
    titulo = "NF não aplicável";
    subtitulo = conta.nf_aplicavel_motivo || "Despesa sem exigência fiscal.";
    cls = "border-zinc-300 bg-zinc-50 text-zinc-700";
  } else if (completo) {
    icon = <CheckCircle className="h-4 w-4" />;
    titulo = "Vínculo NF completo";
    subtitulo = `${formatBRL(vinculado)} de ${formatBRL(valor)}`;
    cls = "border-emerald-300 bg-emerald-50 text-emerald-800";
  } else if (vinculado <= 0) {
    icon = <AlertTriangle className="h-4 w-4" />;
    titulo = "Sem NF vinculada";
    subtitulo = "Esta despesa exige nota fiscal.";
    cls = "border-amber-300 bg-amber-50 text-amber-800";
  } else {
    icon = <AlertTriangle className="h-4 w-4" />;
    titulo = "Vínculo NF parcial";
    subtitulo = `${formatBRL(vinculado)} de ${formatBRL(valor)} — faltam ${formatBRL(valor - vinculado)}`;
    cls = "border-amber-300 bg-amber-50 text-amber-800";
  }

  return (
    <div className={`mb-3 flex items-start gap-2 rounded-md border px-3 py-2 ${cls}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight">{titulo}</div>
        <div className="text-xs opacity-80 mt-0.5">{subtitulo}</div>
      </div>
    </div>
  );
}

