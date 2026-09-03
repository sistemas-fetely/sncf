import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Copy, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { apelidoParceiro } from "@/lib/parceiros/nome";
import {
  useAdicionarObsComercial,
  useItensPedidoOportunidade,
  useObsComerciaisPedido,
} from "@/hooks/comercial/usePedidoOportunidadeDetalhe";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { ComprovantePagamentoBloco } from "@/components/comercial/ComprovantePagamentoBloco";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";
import { nomeArquivoNf } from "@/lib/nf/nome-arquivo";

import { useComprovantesPedido } from "@/hooks/comercial/useComprovantePagamento";
import { SolicitarSopsAcao } from "@/components/comercial/SolicitarSopsAcao";
import { ClienteHistoricoBloco } from "@/components/comercial/ClienteHistorico";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import { usePermissoesMesa } from "@/hooks/comercial/usePermissoesMesa";
import { useStatusComercialLog } from "@/hooks/comercial/useMesaComercial";
import { useBoletosDoPedido } from "@/hooks/pedidos/useBoletosDoPedido";
import type { BoletoTitulo } from "@/hooks/pedidos/useBoletosDoPedido";
import { BotaoBaixarBoletoPdf, baixarBoletoPdf } from "@/components/credito/BotaoBaixarBoletoPdf";
import { usePedidoPortaoAtual } from "@/hooks/pedidos/usePedidoPortaoAtual";
import { useDiagnosticoPagamento } from "@/hooks/comercial/usePedidoOportunidadeDetalhe";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";




/** Texto curto do chip de situação — map, nunca concatenação. */
export const SITUACAO_CHIP: Record<string, string> = {
  sem_recebivel: "Sem recebível",
  previsto: "Previsto",
  coberto_haver: "Coberto por crédito",
  sem_cobranca: "Sem cobrança",
  parcial_pago: "Parcial pago",
  vencido: "Vencido",
  quitado: "Quitado",
  anulado: "Anulado",
  recebivel_familia: "Recebível na família",
};

export function chipSituacao(situacao: string | null | undefined): string {
  return SITUACAO_CHIP[situacao ?? ""] ?? "Em aberto";
}

/**
 * TITULO-DIZ-COMO-ESTA, VIGENTE-DIZ-SE-ENTREGA (02/09/2026): `vw_titulo_boleto_vigente`
 * responde apenas "dá para entregar?" (botão de download e aviso de reemissão). A
 * situação da parcela vem do título — ver `situacaoBoletoTitulo` abaixo.
 */
/**
 * CARNE-VEM-DEPOIS: isto e N PDFs, um por parcela. O PDF unico com N paginas exige
 * refatorar gerar-boleto-pdf para aceitar titulo_ids[] — fatia separada, mexe em edge function.
 */
function BaixarTodosBoletos({
  habilitados,
  emReemissao,
}: {
  habilitados: string[];
  emReemissao: number;
}) {
  const [progresso, setProgresso] = useState<number | null>(null);

  if (habilitados.length < 2) return null;

  async function baixarTodos() {
    const erros: string[] = [];
    let ok = 0;
    for (let i = 0; i < habilitados.length; i++) {
      setProgresso(i + 1);
      try {
        // Em série de propósito: cada invoke gera um PDF; paralelizar castiga a função.
        await baixarBoletoPdf(habilitados[i]);
        ok++;
      } catch (e: any) {
        erros.push(e?.message ?? "Falha ao gerar PDF");
      }
    }
    setProgresso(null);
    if (erros.length > 0) {
      toast.error(`${erros.length} boleto(s) falharam.`, { description: erros[0] });
    }
    if (ok > 0) {
      toast.success(
        `${ok} boleto${ok > 1 ? "s" : ""} baixado${ok > 1 ? "s" : ""}.` +
          (emReemissao > 0
            ? ` ${emReemissao} em reemissão foi pulado${emReemissao > 1 ? "s" : ""}.`
            : ""),
      );
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={progresso !== null}
      onClick={baixarTodos}
    >
      {progresso !== null
        ? `Baixando ${progresso} de ${habilitados.length}…`
        : "Baixar todos"}
    </Button>
  );
}

/**
 * TITULO-DIZ-COMO-ESTA, VIGENTE-DIZ-SE-ENTREGA (02/09/2026). A coluna Situacao le
 * titulo_a_receber (status + boleto_status), que e a mesma fonte da tela de Cobranca.
 * O boleto vigente responde OUTRA pergunta — se da para entregar ao cliente — e so
 * governa o botao de download e o aviso de reemissao. Confundir as duas fez o
 * PED-1001 mostrar 'Sem boleto vivo' em tres parcelas ja quitadas.
 */
function situacaoBoletoTitulo(b: BoletoTitulo): {
  rotulo: string;
  classe: string;
  tooltip?: string;
} {
  const v = b.boleto_vigente;
  if (v?.vigente_em_baixa) {
    return { rotulo: "Em reemissão — não entregar", classe: "text-destructive" };
  }
  if (b.status === "cancelado" || b.status === "cancelado_recuperacao") {
    return { rotulo: "Cancelado", classe: "text-muted-foreground" };
  }
  if (b.status === "devolvido") {
    return { rotulo: "Devolvido", classe: "text-muted-foreground" };
  }
  if (b.status === "pago") {
    return {
      rotulo: "Pago",
      classe: "text-success",
      tooltip: b.boleto_status === "pago_banco" ? "Liquidado pelo banco (retorno CNAB)." : undefined,
    };
  }
  if (b.status === "aberto") {
    if (b.boleto_status === "baixado_banco") {
      return { rotulo: "Baixado no banco", classe: "text-warning" };
    }
    if (b.boleto_status === "rejeitado") {
      return { rotulo: "Rejeitado", classe: "text-destructive" };
    }
    if (b.boleto_status === "pendente" || !b.boleto_status) {
      return { rotulo: "Sem boleto emitido", classe: "text-muted-foreground" };
    }
    if (b.data_vencimento_atual && b.data_vencimento_atual < new Date().toISOString().slice(0, 10)) {
      return {
        rotulo: "Vencido",
        classe: "text-warning",
        tooltip: "Boleto vencido continua pagável — o cliente paga com juros e multa.",
      };
    }
    return { rotulo: "Em aberto", classe: "text-foreground" };
  }
  return { rotulo: b.status ?? "—", classe: "text-muted-foreground" };
}


function formatDataHora(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  idExterno: string | null;
  cliente: string | null;
  apelido?: string | null;
  valorEmJogo: number | null;
  situacaoFinanceira: string | null;
  alertaOperacional?: string | null;
  tipoPortao?: string | null;
  valorPortao?: number | null;
  vencimentoPortao?: string | null;
  portaoLinhas?: number | null;
  linkPagamento?: string | null;
  /** Dados da mesa comercial (view `vw_mesa_comercial`). */
  dataEntregaPrevista?: string | null;
  metaOriginal?: string | null;
  metaProvisoria?: boolean | null;
  nfNumero?: string | null;
  nfChave?: string | null;
  /**
   * MECANISMO-ANTES-DE-URL: baixa de NF e por `nfId`, via edge function `nf-download`.
   * As URLs cacheadas do Bling (link assinado ~48h) sairam de proposito.
   */
  nfId?: string | null;
  nfSerie?: string | null;
  temPdf?: boolean | null;

  temXml?: boolean | null;
  boletosValorAberto?: number | null;
  comprovantesQtd?: number | null;
  comprovanteStatus?: string | null;
  abaInicial?: "itens" | "obs" | "pagamento" | "entrega";
  historicoCliente?: {
    eh_primeira_compra: boolean | null;
    cliente_pedidos_faturados: number | null;
    cliente_valor_faturado: number | null;
    cliente_primeira_compra: string | null;
    cliente_ultima_compra: string | null;
    cliente_dias_sem_comprar: number | null;
    cliente_ticket_medio: number | null;
  } | null;
}

/** CARTAO-NAO-FECHA-NA-MAO: a prova do cartão é o NSU da captura, não confirmação manual. */
const PORTAO_SEM_CONFIRMACAO_MANUAL = new Set(["cartao", "composicao"]);

export function PedidoOportunidadeDialog({
  open,
  onOpenChange,
  pedidoId,
  idExterno,
  cliente,
  apelido,
  valorEmJogo,
  situacaoFinanceira,
  alertaOperacional,
  tipoPortao,
  valorPortao,
  vencimentoPortao,
  portaoLinhas,
  linkPagamento,
  dataEntregaPrevista,
  metaOriginal,
  metaProvisoria,
  nfNumero,
  nfChave,
  nfId,
  nfSerie,
  temPdf,
  temXml,

  boletosValorAberto,
  comprovantesQtd,
  comprovanteStatus,
  abaInicial = "itens",
  historicoCliente,
}: Props) {
  const [texto, setTexto] = useState("");
  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const itens = useItensPedidoOportunidade(pedidoId, open);
  const obs = useObsComerciaisPedido(pedidoId, open);
  const adicionar = useAdicionarObsComercial(pedidoId);
  const qc = useQueryClient();

  const { permitido: podeConfirmarPagamento, carregando: carregandoConfirmarPagamento } =
    usePermissaoAcao("acao.confirmar_pagamento_declarado");
  const { permitido: podeEnviarLink, carregando: carregandoEnviarLink } =
    usePermissaoAcao("acao.enviar_link_pagamento");

  /**
   * MECANISMO-ANTES-DE-URL: mesma via de NfsDeVenda, ChipNfPedido e Fila.
   * FAIL-LOUD ja mora no hook: o corpo real do erro do servidor vira o toast.
   */
  const { baixar: baixarNf, baixando: baixandoNf } = useDownloadNfPdf();
  // NOME-DE-ARQUIVO-FALA-O-PEDIDO: `PED-2108_NF-000346-1.pdf`.
  const nomeDoArquivo = nomeArquivoNf({
    pedidoRef: idExterno,
    numero: nfNumero,
    serie: nfSerie,
    fallbackId: nfId,
  });


  const total = (itens.data ?? []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const podeEnviar = texto.trim().length > 0 && !adicionar.isPending;

  /**
   * PORTAO-EXISTE-SE-TEM-LINHA: o portão vem do banco (`pedido_portao` com
   * status provisorio), nunca de "tem vencimento" — PIX antecipado não tem
   * vencimento e antes sumia da aba. As props seguem como fallback de exibição.
   */
  const portaoQ = usePedidoPortaoAtual(pedidoId, open);
  const portao = portaoQ.data ?? null;
  const temPortao = !!portao;
  const portaoTipo = portao?.tipo ?? tipoPortao ?? null;
  const portaoValor = portao?.valor ?? valorPortao ?? null;
  const portaoVencimento = portao?.vencimento ?? vencimentoPortao ?? null;
  const portaoQtdLinhas = portao?.linhas ?? portaoLinhas ?? null;
  const linkPortao = linkPagamento ?? portao?.linkPagamento ?? null;
  const cartaoBloqueia = PORTAO_SEM_CONFIRMACAO_MANUAL.has((portaoTipo ?? "").toLowerCase());

  // COMPROVANTE-FECHA-O-PORTAO (20/08/2026): confirmado por comprovante, a
  // confirmação manual não existe mais — o banco recusaria e o erro é feio.
  // SOPS-ATENDE-O-COMERCIAL (20/08/2026): a tela nao replica regra de estagio;
  // o banco recusa e explica, e a mensagem dele aparece no toast.
  // A ação de solicitar vive em SolicitarSopsAcao — um componente, dois pontos
  // de montagem (linha da mesa e este dialog).
  const boletos = useBoletosDoPedido(open ? pedidoId : undefined);
  const statusLog = useStatusComercialLog(pedidoId, open);
  // PERMISSAO-NOMINAL-POR-ACAO: mesmos gates da linha da mesa, mesma fonte.
  const {
    podeCopiarLink, podeBaixarNf, podeVerBoletos, podeBaixarBoleto,
    podeConfirmarComProva, carregando: carregandoMesa,
  } = usePermissoesMesa();


  const comprovantes = useComprovantesPedido(pedidoId, open);
  const temComprovanteConfirmado = (comprovantes.data ?? []).some(
    (c) => c.status === "confirmado",
  );

  const enviar = async () => {
    if (!podeEnviar) return;
    try {
      await adicionar.mutateAsync(texto);
      setTexto("");
    } catch {
      /* toast já emitido no hook */
    }
  };

  const copiarLink = async () => {
    if (!linkPortao) return;
    try {
      await navigator.clipboard.writeText(linkPortao);
      toast.success("Link de pagamento copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* DRAWER-NAO-PULA: largura fixa, altura total, rolo interno por aba. */}
      <SheetContent
        side="right"
        className="w-full sm:max-w-[640px] flex flex-col overflow-hidden p-6"
      >
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{idExterno || "Pedido"}</span>
            <span className="text-sm">{cliente || "—"}</span>
            {apelidoParceiro(cliente, apelido) && (
              <span className="text-sm text-muted-foreground">
                · {apelidoParceiro(cliente, apelido)}
              </span>
            )}
            <span className="text-sm">{formatBRL(valorEmJogo ?? 0)}</span>
            <Badge
              variant="outline"
              className="rounded px-2 py-0.5 text-xs"
              title={alertaOperacional ?? undefined}
            >
              {chipSituacao(situacaoFinanceira)}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue={abaInicial} className="flex flex-1 flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="itens">Itens</TabsTrigger>
            <TabsTrigger value="obs">Obs. Comerciais</TabsTrigger>
            <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
            <TabsTrigger value="entrega">Entrega, NF e boletos</TabsTrigger>
          </TabsList>

          <TabsContent value="itens" className="mt-4 flex-1 min-h-0 overflow-y-auto">
            {itens.isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (itens.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem itens registrados neste pedido.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 bg-background z-10">
                      <TableHead>SKU</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Valor unitário</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(itens.data ?? []).map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.sku || "—"}</TableCell>
                        <TableCell className="text-sm">{i.descricao || "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {Number(i.quantidade ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatBRL(i.valor_unitario ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatBRL(i.subtotal ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="sticky bottom-0 bg-background">
                      <TableCell colSpan={4} className="text-right text-xs uppercase tracking-wide">
                        Total
                      </TableCell>
                      <TableCell className="text-right">{formatBRL(total)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="obs" className="mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            {historicoCliente && (
              <ClienteHistoricoBloco historico={historicoCliente} />
            )}
            <div className="space-y-2">
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Contexto comercial: contato com o cliente, promessa de pagamento, condição pedida…"
              />
              <div className="flex justify-end">
                <Button onClick={enviar} disabled={!podeEnviar}>
                  {adicionar.isPending ? "Salvando…" : "Adicionar observação"}
                </Button>
              </div>
            </div>

            {obs.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (obs.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma observação comercial ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {(obs.data ?? []).map((o) => (
                  <div key={o.id} className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      {formatDataHora(o.criado_em)}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{o.descricao || "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pagamento" className="mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            {portaoQ.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !temPortao ? (
              <DiagnosticoAbaPagamento pedidoId={pedidoId} idExterno={idExterno} aberto={open} />

            ) : (
              <>
                <div className="rounded-md border px-3 py-2 space-y-1">
                  <p className="text-sm">
                    Tipo: <span className="font-medium">{portaoTipo || "—"}</span>
                  </p>
                  <p className="text-sm">
                    Valor: <span className="font-medium">{formatBRL(portaoValor ?? 0)}</span>
                  </p>
                  <p className="text-sm">
                    Vencimento:{" "}
                    <span className="font-medium">
                      {portaoVencimento ? formatDateBR(portaoVencimento) : "à vista (antecipado)"}
                    </span>
                  </p>
                  {(portaoQtdLinhas ?? 0) > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Pagamento em {portaoQtdLinhas} linhas
                    </p>
                  )}
                </div>

                <ComprovantePagamentoBloco
                  pedidoId={pedidoId}
                  valorPortao={portaoValor}
                  tipoPortao={portaoTipo}
                  podeConfirmar={podeConfirmarPagamento && !carregandoConfirmarPagamento}
                />

                <div className="flex flex-wrap items-center gap-2">

                  {/* Sem `acao.mesa_copiar_link` a ação não existe na tela.
                      Falta de DADO (sem link) continua explicando no tooltip. */}
                  {podeCopiarLink && (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      disabled={!linkPortao}
                      title={!linkPortao ? "Sem link de pagamento" : undefined}
                      onClick={copiarLink}
                    >
                      <Copy className="h-4 w-4" />
                      Copiar link de pagamento
                    </Button>
                  )}
                  {/* ANEXO-CONFORME-QUEM-E: na Mesa o vendedor prova com papel. */}
                  {!temComprovanteConfirmado && (podeConfirmarComProva || carregandoMesa) && (
                    <Button
                      disabled={cartaoBloqueia || carregandoMesa || !podeConfirmarComProva}
                      title={
                        cartaoBloqueia
                          ? "Cartão não fecha por confirmação manual — a prova é o NSU da captura."
                          : !carregandoMesa && !podeConfirmarComProva
                            ? "Você não tem permissão para confirmar pagamento com prova."
                            : undefined
                      }
                      onClick={() => setConfirmarAberto(true)}
                    >
                      Confirmar pagamento
                    </Button>
                  )}
                  {temComprovanteConfirmado && (
                    <span className="text-xs text-muted-foreground">
                      Pagamento já confirmado por comprovante.
                    </span>
                  )}
                </div>
              </>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <SolicitarSopsAcao pedidoId={pedidoId} modo="botao" />
            </div>
          </TabsContent>

          <TabsContent value="entrega" className="mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            {/* PREVISAO-VEM-DO-BANCO: a data é a do pedido, e quando é meta
                provisória a tela diz isso em voz alta. */}
            <div className="rounded-md border px-3 py-2 space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Entrega</p>
              <p className="text-sm">
                Previsão:{" "}
                <span className="font-medium">{formatDateBR(dataEntregaPrevista ?? null)}</span>
                {metaProvisoria && (
                  <Badge
                    variant="outline"
                    className="ml-2 rounded px-1.5 py-0 text-[10px] border-warning/50 text-warning"
                    title="Data provisória: a meta ainda não foi confirmada pela Logística."
                  >
                    provisória
                  </Badge>
                )}
              </p>
              {metaOriginal && metaOriginal !== dataEntregaPrevista && (
                <p className="text-xs text-muted-foreground">
                  Meta original: {formatDateBR(metaOriginal)}
                </p>
              )}
            </div>

            <div className="rounded-md border px-3 py-2 space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Nota fiscal</p>
              {nfNumero || temPdf || temXml ? (
                <>
                  <p className="text-sm">
                    NF <span className="font-medium">{nfNumero || "—"}</span>
                  </p>
                  {nfChave && (
                    <p className="font-mono text-[10px] text-muted-foreground break-all">
                      {nfChave}
                    </p>
                  )}
                  {/* `acao.mesa_baixar_nf` cobre PDF e XML: é a mesma nota. */}
                  {podeBaixarNf && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {temPdf && nfId && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={baixandoNf}
                          onClick={() =>
                            baixarNf({
                              nf_id: nfId,
                              formato: "pdf",
                              nome: nomeDoArquivo,
                            })
                          }
                        >
                          {baixandoNf && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          Baixar PDF
                        </Button>
                      )}
                      {temXml && nfId && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={baixandoNf}
                          onClick={() =>
                            baixarNf({
                              nf_id: nfId,
                              formato: "xml",
                              nome: nomeDoArquivo,
                            })
                          }
                        >
                          {baixandoNf && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          Baixar XML
                        </Button>
                      )}

                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pedido ainda não faturado — não existe NF para baixar.
                </p>
              )}
            </div>

            {/* Consultar boletos é ação gateada por `acao.mesa_ver_boletos`. */}
            {podeVerBoletos && (
            <div className="rounded-md border px-3 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Boletos</p>
                {podeBaixarBoleto && (
                  <BaixarTodosBoletos
                    habilitados={(boletos.data?.boletoTitulos ?? [])
                      .filter(
                        (b) =>
                          !!b.boleto_vigente?.nosso_numero &&
                          !b.boleto_vigente?.vigente_em_baixa,
                      )
                      .map((b) => b.id)}
                    emReemissao={
                      (boletos.data?.boletoTitulos ?? []).filter(
                        (b) => !!b.boleto_vigente?.vigente_em_baixa,
                      ).length
                    }
                  />
                )}
              </div>
              {boletos.isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : boletos.isError ? (
                /* SILENCIO-E-DECISAO: erro de leitura nao pode virar "nao tem boleto". */
                <p className="text-sm text-destructive">
                  Nao foi possivel carregar os boletos:{" "}
                  {boletos.error instanceof Error ? boletos.error.message : "erro desconhecido"}
                </p>
              ) : (boletos.data?.boletoTitulos ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum boleto neste pedido.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Nosso número</TableHead>
                      <TableHead>Situação</TableHead>
                      {podeBaixarBoleto && <TableHead className="w-10">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(boletos.data?.boletoTitulos ?? []).map((b) => {
                      const sit = situacaoBoletoTitulo(b);
                      return (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs">
                          {b.numero_parcela}/{b.total_parcelas}
                          {(b.boleto_vigente?.boletos_vivos ?? 0) > 1 && (
                            <span title="Mais de um boleto vivo neste título — confira com o Financeiro.">
                              <AlertTriangle className="ml-1 inline h-3 w-3 text-warning" />
                            </span>
                          )}

                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDateBR(b.data_vencimento_atual)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {formatBRL(b.valor_bruto ?? 0)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {b.boleto_vigente?.nosso_numero ?? b.boleto_ultimo?.nosso_numero ?? "—"}
                        </TableCell>
                        <TableCell className={`text-xs ${sit.classe}`} title={sit.tooltip}>
                          {sit.rotulo}
                        </TableCell>
                        {podeBaixarBoleto && (
                          <TableCell className="text-right">
                            {/* Estado do dado manda: em reemissão aparece desabilitado com o motivo. */}
                            {b.boleto_vigente?.nosso_numero ? (
                              <BotaoBaixarBoletoPdf
                                tituloId={b.id}
                                desabilitado={!!b.boleto_vigente.vigente_em_baixa}
                                motivoDesabilitado={
                                  b.boleto_vigente.vigente_em_baixa
                                    ? "Boleto em reemissão no banco — não entregue este ao cliente."
                                    : sit.rotulo === "Vencido"
                                      ? "Boleto vencido — o cliente paga com juros e multa."
                                      : undefined
                                }
                              />
                            ) : null}
                          </TableCell>
                        )}
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

              )}
              {(boletosValorAberto ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Em aberto: {formatBRL(boletosValorAberto ?? 0)}
                </p>
              )}
            </div>
            )}

            <div className="rounded-md border px-3 py-2 space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Comprovantes
              </p>
              <p className="text-sm">
                {(comprovantesQtd ?? 0) > 0
                  ? `${comprovantesQtd} comprovante(s) · ${comprovanteStatus || "sem status"}`
                  : "Nenhum comprovante anexado."}
              </p>
            </div>

            <div className="rounded-md border px-3 py-2 space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Histórico do status comercial
              </p>
              {statusLog.isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (statusLog.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma mudança manual de status registrada.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(statusLog.data ?? []).map((l) => (
                    <li key={l.id} className="text-xs">
                      <span className="text-muted-foreground">
                        {formatDataHora(l.definido_em)} ·{" "}
                      </span>
                      {l.de_slug ? `${l.de_slug} → ` : ""}
                      <span className="font-medium">{l.para_slug}</span>
                      {l.definido_por_nome ? ` · ${l.definido_por_nome}` : ""}
                      {l.motivo ? (
                        <span className="text-muted-foreground"> — {l.motivo}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>


        {!temComprovanteConfirmado && (
          <ConfirmarPagamentoDialog
            pedidoId={pedidoId}
            aberto={confirmarAberto}
            aoFechar={() => setConfirmarAberto(false)}
            modo="mesa"
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * A-TELA-NUNCA-MENTE: "sem portão pendente" esconde quatro histórias diferentes.
 * Só leitura — nada aqui escreve no banco.
 */
function DiagnosticoAbaPagamento({
  pedidoId,
  idExterno,
  aberto,
}: {
  pedidoId: string;
  idExterno: string | null;
  aberto: boolean;
}) {
  const { data, isLoading, error } = useDiagnosticoPagamento(pedidoId, aberto);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // FAIL-LOUD: sem o diagnóstico a tela diz que não sabe, não inventa explicação.
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível diagnosticar o pagamento</AlertTitle>
        <AlertDescription>{(error as Error)?.message ?? "Consulta sem retorno."}</AlertDescription>
      </Alert>
    );
  }

  const ref = data.id_externo ?? idExterno ?? "";
  const ehB2c = (data.canal ?? "").toUpperCase() === "B2C" || ref.startsWith("SHP-");

  // CASO A — B2C: pagou no checkout, antes de chegar aqui.
  if (ehB2c) {
    return (
      <Alert>
        <AlertTitle>Pago no checkout</AlertTitle>
        <AlertDescription>
          Pedido B2C: o pagamento acontece no checkout da loja, antes de chegar aqui. Este
          pedido não tem portão a confirmar.
        </AlertDescription>
      </Alert>
    );
  }

  // CASO B — nenhuma linha de provisão: não existe plano para cobrar.
  if (data.linhas === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Sem plano de recebimento</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Este pedido não tem plano de pagamento montado, então não existe parcela para
            confirmar nem portão para fechar. Condição pedida:{" "}
            {data.condicao_solicitada || "não informada"}. O plano precisa ser montado antes
            de cobrar.
          </p>
          {ref.includes("/") && (
            <p>
              Este pedido nasceu de um split de um pedido já faturado — o plano do pai não
              existe mais para herdar. A condição da revenda é decisão comercial nova.
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // CASO C — tem plano, mas nenhuma linha é portão: comprovante não fecha nada.
  if (data.linhasPortao === 0) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Plano sem portão definido</AlertTitle>
        <AlertDescription>
          Existem {data.linhas} parcelas no plano, mas nenhuma está marcada como portão de
          pagamento. Sem portão, o comprovante não tem o que fechar.
        </AlertDescription>
      </Alert>
    );
  }

  // CASO D — portão existe e já está todo confirmado.
  return (
    <Alert className="border-success/50">
      <AlertTitle className="text-success">Portão já fechado</AlertTitle>
      <AlertDescription className="text-muted-foreground">
        Todas as linhas de portão deste pedido já foram confirmadas.
      </AlertDescription>
    </Alert>
  );
}


