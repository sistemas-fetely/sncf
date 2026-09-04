import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { rotuloDestinoLiberacao } from "@/lib/pedidoLiberacaoEstoque";
import { apelidoParceiro, nomeCanonico } from "@/lib/parceiros/nome";
import { useState, useEffect, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { AplicarHaverPedidoDialog } from "@/components/credito/AplicarHaverPedidoDialog";
import { ConverterTituloHaverDialog } from "@/components/credito/ConverterTituloHaverDialog";

import { usePedidoDetalhe } from "@/hooks/pedidos/usePedidoDetalhe";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { prefixarProximaAcao } from "@/lib/pedidos/donoProximaAcao";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { usePedidoEmbalagem } from "@/hooks/pedidos/usePedidoEmbalagem";

/** Formatação pt-BR com número fixo de casas. */
const fmtNum = (v: number, casas: number) =>
  Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

import { usePedidoOrigens } from "@/hooks/pedidos/usePedidoOrigens";
import { supabase } from "@/integrations/supabase/client";
import { usePedidoTitulos } from "@/hooks/pedidos/usePedidoTitulos";
import { PlanoRecebimentoCard } from "@/components/pedidos/PlanoRecebimentoCard";
import { ComprovantePagamentoBloco } from "@/components/comercial/ComprovantePagamentoBloco";
import { AlertasPedidoPanel } from "@/components/pedidos/AlertasPedidoPanel";
import { useRecebivelFamilia } from "@/hooks/pedidos/useRecebivelFamilia";
import { useTituloEixosPedido } from "@/hooks/pedidos/useTituloEixosPedido";
import { useTituloEixosDim } from "@/hooks/credito/useTituloEixosDim";
import { BadgeEixosTitulo } from "@/components/pedidos/BadgeEixosTitulo";
import { useTitulosPedidoResumo } from "@/hooks/credito/useTitulosPedidoResumo";
import { usePedidoPriorizado } from "@/hooks/pedidos/useFilaPedidosPriorizada";
import { useAtualizarUrgencia } from "@/hooks/pedidos/useAtualizarUrgencia";
import { useRegistrarEventoPedido } from "@/hooks/pedidos/useRegistrarEventoPedido";

import { isEstagioFinal } from "@/lib/pedidoTransicoes";
import { useCoberturaItens, rotuloCobertura, usePoliticaCobertura, type CoberturaItem } from "@/lib/pedidoDestaque";
import { toast as toastSonner } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/format-currency";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreditoTab } from "@/components/pedidos/CreditoTab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PedidoStepper } from "@/components/pedidos/PedidoStepper";
import { PedidoTimeline } from "@/components/pedidos/PedidoTimeline";
import { PedidoTarefasVinculadasTab } from "@/components/pedidos/PedidoTarefasVinculadasTab";
import { STATUS_ABERTOS, usePedidoTarefasVinculadas } from "@/hooks/pedidos/usePedidoTarefasVinculadas";
import { BadgePriorizacao } from "@/components/pedidos/BadgePriorizacao";
import { MarcacaoPedido } from "@/components/pedidos/MarcacaoPedido";
import { EstagioBadge, FormatoIdade, NaturezaOperacaoBadge } from "@/components/pedidos/BadgesPedido";
import { LinhaContatosCliente } from "@/components/pedidos/LinhaContatosCliente";
import { CardEntrega } from "@/components/pedidos/CardEntrega";
import { ChipNfPedido } from "@/components/pedidos/ChipNfPedido";
import { CardAnalisePedido } from "@/components/pedidos/CardAnalisePedido";
import { BadgesContextuais } from "@/components/credito/BadgesContextuais";
import { EditarProgramaInline } from "@/components/credito/EditarProgramaInline";
import { TriarPedidoDialog } from "@/components/pedidos/dialogs/TriarPedidoDialog";
import { CancelarPedidoDialog } from "@/components/pedidos/dialogs/CancelarPedidoDialog";
import { ConsolidarPedidoDialog } from "@/components/pedidos/dialogs/ConsolidarPedidoDialog";
import { ReterEstoqueDialog } from "@/components/pedidos/dialogs/ReterEstoqueDialog";
import { DesvincularBlingDialog } from "@/components/pedidos/dialogs/DesvincularBlingDialog";
import { AnotarPedidoDialog } from "@/components/pedidos/dialogs/AnotarPedidoDialog";
import { CanalFopTab } from "@/components/pedidos/CanalFopTab";
import { BotaoEditarPedido } from "@/components/pedidos/BotaoEditarPedido";
import { EditarItensDialog } from "@/components/pedidos/dialogs/EditarItensDialog";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import { usePlanoAbertoPedido, rotuloMeio } from "@/hooks/pedidos/usePlanoAbertoPedido";
import { SplitsPedidoSection } from "@/components/pedidos/SplitsPedidoSection";
import { BotaoSplitPedido } from "@/components/pedidos/BotaoSplitPedido";

import { VinculosSection } from "@/components/pedidos/VinculosSection";
import { AcoesRemessa } from "@/components/pedidos/AcoesRemessa";

import { ReverterParaCobrancaDialog } from "@/components/pedidos/dialogs/ReverterParaCobrancaDialog";
import { MigrarOportunidadeDialog } from "@/components/comercial/MigrarOportunidadeDialog";
import { RetomarOportunidadeDialog } from "@/components/comercial/RetomarOportunidadeDialog";

import { usePermissoesDoUsuario } from "@/hooks/usePermissoesDoUsuario";
import { PreFaturamentoCard } from "@/components/pedidos/PreFaturamentoCard";
import { AncoraFaturamentoCard } from "@/components/pedidos/AncoraFaturamentoCard";
import { useNivel } from "@/hooks/useNivel";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { useAuth } from "@/contexts/AuthContext";


import { AREA_LABELS, STATUS_TITULO_LABELS, URGENCIA_LABELS } from "@/types/pedido";
import type { AreaPedido, EstagioPedido, StatusTitulo, TipoTituloPagamento, TituloAReceber, UrgenciaDeclarada } from "@/types/pedido";
import { ArrowLeft, AlertCircle, ExternalLink, Receipt, Loader2, Sparkles, Clock, CheckCircle2, ArrowRight, Package, PackageSearch, Copy, Truck, RefreshCw, Scissors, Mail, MailCheck, ShieldAlert, MessageCircle, Link2, Wallet, PauseCircle, Bell, XCircle, History, RotateCcw, Scale, PackageX, Link2Off } from "lucide-react";
import { useFreteComparativo } from "@/hooks/pedidos/useFreteComparativo";
import { CompararTransportadorasDialog } from "@/components/pedidos/dialogs/CompararTransportadorasDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { transicoesPara } from "@/lib/pedidoTransicoes";
import { useTransicionarPedido } from "@/hooks/pedidos/useTransicionarPedido";
import { SplitPedidoDialog } from "@/components/pedidos/dialogs/SplitPedidoDialog";
import { ForcarSemLastroDialog } from "@/components/pedidos/dialogs/ForcarSemLastroDialog";
import { AtencaoPedidoDialog } from "@/components/pedidos/dialogs/AtencaoPedidoDialog";
import { useLimparAtencao } from "@/hooks/pedidos/useAtencaoPedido";
import { toast } from "@/hooks/use-toast";
import { useTransportadoras } from "@/hooks/pedidos/useTransportadoras";
import { useTransportadoraOrigem } from "@/hooks/pedidos/useTransportadoraOrigem";
import { useRecotarTransportadora } from "@/hooks/pedidos/useRecotarTransportadora";
import { useSalvarDadosEnvio } from "@/hooks/pedidos/useSalvarDadosEnvio";
import { RastreioPedidoBloco } from "@/components/pedidos/RastreioPedidoBloco";
import { useRastreioPedido } from "@/hooks/pedidos/useRastreioPedido";
import { useRemessas } from "@/hooks/pedidos/useRemessas";
import { useFreteEstimado } from "@/hooks/transportadoras/useFreteEstimado";
import { useEnviarEmailPedidoCobranca } from "@/hooks/pedidos/useEnviarEmailPedidoCobranca";
import { EnviarEmailCobrancaDialog } from "@/components/pedidos/dialogs/EnviarEmailCobrancaDialog";
import { EnviarEmailNfDialog } from "@/components/pedidos/dialogs/EnviarEmailNfDialog";
import { EnviarEmailNfBoletosDialog } from "@/components/pedidos/dialogs/EnviarEmailNfBoletosDialog";
import { useBoletosDoPedido } from "@/hooks/pedidos/useBoletosDoPedido";
import { ComunicacaoPedidoPanel } from "@/components/pedidos/ComunicacaoPedidoPanel";
import { EstadoInstrumentoCobranca } from "@/components/pedidos/EstadoInstrumentoCobranca";
import { ExportarPedidoDialog } from "@/components/pedidos/dialogs/ExportarPedidoDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Pencil } from "lucide-react";
import { AlterarNaturezaDialog } from "@/components/pedidos/AlterarNaturezaDialog";

import { useFreteTipos } from "@/hooks/pedidos/useFreteTipos";
import { SituacaoFinanceiraBloco } from "@/components/pedidos/SituacaoFinanceiraBloco";
import { useProvaPagamento } from "@/hooks/pedidos/useProvaPagamento";
import { ProvaPagamentoAlerta } from "@/components/pedidos/ProvaPagamentoAlerta";



const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) => s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (s: string | null | undefined) => s ? new Date(s).toLocaleString("pt-BR") : "—";

const TIPO_LABEL: Record<TipoTituloPagamento, string> = { boleto: "Boleto", pix: "PIX", cartao: "Cartão", troca_mercadoria: "Troca" };
const STATUS_CORES: Record<StatusTitulo, string> = {
  aguardando_pagamento: "bg-warning text-white border-0", aberto: "bg-info text-white border-0",
  aguardando_emissao_nf: "bg-info text-white border-0", vigente: "bg-info text-white border-0",
  vigente_parcial: "bg-info text-white border-0", pago: "bg-success text-white border-0",
  pago_com_atraso: "bg-success text-white border-0", pago_judicial: "bg-success text-white border-0",
  vencido: "bg-destructive text-white border-0", vencido_suspenso: "bg-destructive text-white border-0",
  em_juridico: "bg-destructive text-white border-0", renegociado: "bg-info text-white border-0",
  baixado_por_perda: "bg-muted text-muted-foreground border-0", cancelado: "bg-muted text-muted-foreground border-0",
  cancelado_recuperacao: "bg-muted text-muted-foreground border-0",
};

function Linha({ label, value, destaque }: { label: string; value?: string | number | null; destaque?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right", destaque && "font-medium")}>{value ?? "—"}</span>
    </div>
  );
}

/**
 * Versão somente-leitura do código de rastreio para nível 1.
 * CONTRATO DE NÍVEL: campos editáveis ficam disabled, não escondidos.
 */
function RastreioLeitura({ pedidoId }: { pedidoId: string }) {
  const rastreio = useRastreioPedido(pedidoId);
  if (rastreio.isLoading) return <p className="text-xs text-muted-foreground">Verificando rastreio…</p>;
  const vinculado = rastreio.data;
  if (!vinculado) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-1.5">
      <p className="text-sm font-medium tracking-wide flex items-center gap-1.5">
        <PackageSearch className="h-3.5 w-3.5 text-muted-foreground" />
        {vinculado.codigo_rastreio}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {vinculado.entregue ? (
          <Badge variant="outline" className="text-[10px] border-success/60 text-success">Entregue</Badge>
        ) : vinculado.status_atual ? (
          <Badge variant="outline" className="text-[10px]">{vinculado.status_atual}</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Aguardando primeira leitura</Badge>
        )}
        {vinculado.data_ultima_atualizacao && (
          <span className="text-[10px] text-muted-foreground">
            Atualizado em {new Date(vinculado.data_ultima_atualizacao).toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * COBERTURA-SO-SOME-DEPOIS-DA-NF (28/08) + PROVA-FISICA-SAI-DA-FILA (04/09).
 * Quem decide se a marca de cobertura aparece nao e mais uma lista de estagios aqui:
 * e a dimensao `politica_cobertura_estagio` (campo `mostra_no_pedido`).
 * Fonte do dado continua sendo vw_pedido_item_cobertura, igual a coluna Estoque da Fila.
 */


function ListaItensComEstoque({ itens, pedidoId, estagio }: { itens: any[]; pedidoId: string; estagio?: string | null }) {
  const coberturaQ = useCoberturaItens([pedidoId]);
  const coberturaMap = coberturaQ.data ?? new Map<string, CoberturaItem>();
  useEffect(() => {
    if (coberturaQ.error) toastSonner.error((coberturaQ.error as Error).message);
  }, [coberturaQ.error]);

  const politicaQ = usePoliticaCobertura();
  useEffect(() => {
    if (politicaQ.error) toastSonner.error((politicaQ.error as Error).message);
  }, [politicaQ.error]);
  const politica = politicaQ.data?.get(estagio ?? "");
  const jaReservado = politica ? !politica.mostra_no_pedido : false;

  const problemas = jaReservado
    ? []
    : itens
        .map((i: any) => coberturaMap.get(i.id)?.cobertura)
        .filter((c) => c === "parcial" || c === "descoberto" || c === "sem_lastro");
  const temDescoberto = problemas.some((c) => c === "descoberto" || c === "sem_lastro");
  return (
    <>
      {problemas.length > 0 && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 mb-3",
            temDescoberto ? "bg-destructive/10 border-destructive/40" : "bg-warning/10 border-warning/40"
          )}
        >
          <AlertCircle className={cn("h-4 w-4 shrink-0", temDescoberto ? "text-destructive" : "text-warning")} />
          <p className={cn("text-xs", temDescoberto ? "text-destructive" : "text-warning")}>
            {problemas.length} item(ns) sem lastro na fila de reserva — verifique antes de seguir.
          </p>
        </div>
      )}
      {itens.length === 0
        ? <p className="text-sm text-muted-foreground text-center py-6">Itens ainda não importados.</p>
        : itens.map((item: any) => {
            const cob = jaReservado ? undefined : coberturaMap.get(item.id);
            const rotulo = cob ? rotuloCobertura(cob.cobertura, cob.qtd_coberta, cob.quantidade) : null;
            const descoberto = cob?.cobertura === "descoberto" || cob?.cobertura === "sem_lastro";
            const parcial = cob?.cobertura === "parcial";
            return (
              <div
                key={item.id}
                className={cn(
                  "flex justify-between items-center gap-3 py-2.5 border-b border-border/40 last:border-0 rounded-md px-2 -mx-2",
                  descoberto && "bg-destructive/10 border-destructive/40",
                  parcial && "bg-warning/10 border-warning/40"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{item.descricao}</p>
                    {rotulo && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] h-5",
                          descoberto
                            ? "border-destructive/40 text-destructive bg-destructive/10"
                            : "border-warning/40 text-warning bg-warning/10"
                        )}
                      >
                        {rotulo}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.sku && `SKU ${item.sku} · `}{item.quantidade} × {fmtBRL.format(item.valor_unitario)}{item.desconto_pct > 0 && ` · ${item.desconto_pct}% desc`}
                  </p>
                </div>
                <p className="text-sm font-medium shrink-0">{fmtBRL.format(item.subtotal || 0)}</p>
              </div>
            );
          })
      }
    </>
  );
}



/**
 * Badge de estado da parcela: prefere os dois eixos da view (verdade calculada no
 * banco). Em loading/erro/ausência do título na view, cai de volta no status cru.
 */
function BadgeEstadoParcela({
  titulo,
  eixos,
  dim,
  compacto,
}: {
  titulo: TituloAReceber;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eixos: Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dim: { prova: Record<string, any>; status: Record<string, any> } | undefined;
  compacto?: boolean;
}) {
  const eixo = eixos?.[titulo.id];
  const statusDim = eixo?.eixo_status ? dim?.status?.[eixo.eixo_status] : null;
  if (statusDim) {
    return (
      <BadgeEixosTitulo
        status={statusDim}
        prova={eixo?.eixo_prova ? dim?.prova?.[eixo.eixo_prova] : null}
        compacto={compacto}
      />
    );
  }
  return (
    <Badge className={cn(compacto && "text-[10px]", STATUS_CORES[titulo.status])}>
      {STATUS_TITULO_LABELS[titulo.status]}
    </Badge>
  );
}

function ParcelasTab({ pedidoId }: { pedidoId: string }) {
  const { data: titulos, isLoading } = usePedidoTitulos(pedidoId);
  const { data: familia, isLoading: loadFamilia, isError: errFamilia } = useRecebivelFamilia(pedidoId);
  const { data: eixos } = useTituloEixosPedido(pedidoId);
  const { data: dimEixos } = useTituloEixosDim();
  const { temNivel } = useNivel();
  const [convertendo, setConvertendo] = useState<{ id: string; numero: string; valor: number } | null>(null);
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!titulos || titulos.length === 0) {
    const coberto = !loadFamilia && !errFamilia && familia?.recebivel_na_familia === true;
    return (
      <div className="space-y-4">
        <PlanoRecebimentoCard pedidoId={pedidoId} />
        {coberto ? (
          <div className="text-center py-6 text-muted-foreground space-y-2">
            <Receipt className="h-8 w-8 mx-auto opacity-30" />
            <p className="text-sm">
              Coberto pelo recebível da mãe {familia?.familia_mae_externo ?? "—"} — não cobrar aqui
            </p>
          </div>
        ) : (
          <SituacaoFinanceiraBloco pedidoId={pedidoId} />
        )}

      </div>
    );
  }
  const total = titulos.reduce((acc, t) => acc + Number(t.valor_atual || 0), 0);
  return (
    <div className="space-y-3">
      <PlanoRecebimentoCard pedidoId={pedidoId} />

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead><TableHead>Tipo</TableHead><TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead><TableHead>Forma</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {titulos.map((t: TituloAReceber) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.numero_parcela}/{t.total_parcelas}</TableCell>
                <TableCell>{t.eh_entrada ? <Badge variant="outline" className="border-success/40 text-success">Entrada</Badge> : <Badge variant="outline">Parcela</Badge>}</TableCell>
                <TableCell className="text-sm">{fmtDate(t.data_vencimento_atual)}</TableCell>
                <TableCell className="font-medium">{fmtBRL.format(Number(t.valor_atual || 0))}</TableCell>
                <TableCell className="text-sm">{TIPO_LABEL[t.tipo_pagamento]}</TableCell>
                <TableCell>
                  <BadgeEstadoParcela titulo={t} eixos={eixos} dim={dimEixos} />
                  {(t.status === "pago" || t.status === "pago_com_atraso") && temNivel(3) && (
                    <button
                      onClick={() => setConvertendo({
                        id: t.id,
                        numero: t.numero_titulo ?? "",
                        valor: Number(t.valor_bruto ?? 0),
                      })}
                      className="text-xs text-muted-foreground hover:text-warning underline underline-offset-2 ml-2"
                    >
                      → crédito
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end text-sm gap-2">
        <span className="text-muted-foreground">Total:</span>
        <span className="font-medium">{fmtBRL.format(total)}</span>
      </div>

      {convertendo && temNivel(3) && (
        <ConverterTituloHaverDialog
          open={!!convertendo}
          onOpenChange={(v) => !v && setConvertendo(null)}
          tituloId={convertendo.id}
          numeroTitulo={convertendo.numero}
          valor={convertendo.valor}
        />
      )}
    </div>
  );
}

const ESTAGIOS_BLOQUEIAM_MIGRAR = new Set([
  "em_separacao",
  "pre_faturamento",
  "faturado",
  "em_transporte",
  "entregue",
  "cancelado",
  "recuperacao_venda",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BotaoMigrarComercial({ pedido }: { pedido: any }) {
  const [open, setOpen] = useState(false);
  const { temNivel } = useNivel();
  if (!temNivel(3)) return null;
  if (ESTAGIOS_BLOQUEIAM_MIGRAR.has(pedido.estagio)) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-4 w-4" />
        Migrar para Oportunidade Comercial
      </Button>
      <MigrarOportunidadeDialog
        open={open}
        onOpenChange={setOpen}
        pedidoId={pedido.id}
        idExterno={pedido.id_externo}
        cliente={pedido.parceiro_nome || pedido.cliente}
        origem="manual"
      />
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BotaoRetomarOportunidade({ pedido }: { pedido: any }) {
  const [open, setOpen] = useState(false);
  const { temNivel } = useNivel();
  if (!temNivel(3)) return null;
  return (
    <>
      <Button
        variant="default"
        size="sm"
        className="w-full gap-1.5"
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="h-4 w-4" />
        Retomar da Oportunidade Comercial
      </Button>
      <RetomarOportunidadeDialog
        open={open}
        onOpenChange={setOpen}
        pedidoId={pedido.id}
        idExterno={pedido.id_externo}
        cliente={pedido.parceiro_nome || pedido.cliente}
        retomavelPara={pedido.oportunidade_origem_estagio ?? pedido.retomavel_para}
      />
    </>
  );
}

function AcoesPedidoPreFaturado({ pedido, parceiro }: { pedido: any; parceiro: any }) {
  const [reverterOpen, setReverterOpen] = useState(false);
  const { temNivel } = useNivel();
  if (!temNivel(3)) return null;
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground hover:text-foreground"
        onClick={() => setReverterOpen(true)}
      >
        Voltar para cobrança
      </Button>
      <ReverterParaCobrancaDialog
        open={reverterOpen}
        onClose={() => setReverterOpen(false)}
        pedidoId={pedido.id}
        idExterno={pedido.id_externo}
        estagio="pre_separacao"
      />
    </div>
  );
}

function BotaoEmailCobrancaPedido({ pedido_id, parceiro_id }: { pedido_id: string; parceiro_id: string }) {
  const [open, setOpen] = useState(false);
  const { temNivel } = useNivel();
  if (!temNivel(2)) return null;
  return (
    <>
      <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4" />Enviar cobrança
      </Button>
      <EnviarEmailCobrancaDialog
        open={open}
        onOpenChange={setOpen}
        pedido_id={pedido_id}
        parceiro_id={parceiro_id}
      />
    </>
  );
}

function BotaoEmailNfFaturado({ pedido }: { pedido: any }) {
  const [open, setOpen] = useState(false);
  const { temNivel } = useNivel();
  const enviado = pedido.nf_email_enviado_em as string | null | undefined;
  if (!temNivel(2)) return null;

  if (enviado) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-success border-success/40 hover:text-success"
              onClick={() => setOpen(true)}
            >
              <MailCheck className="h-4 w-4" />NF enviada · reenviar
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Enviada em {new Date(enviado).toLocaleString("pt-BR")}
          </TooltipContent>
        </Tooltip>
        <EnviarEmailNfDialog
          open={open}
          onOpenChange={setOpen}
          pedido_id={pedido.id}
          parceiro_id={pedido.parceiro_id}
        />
      </TooltipProvider>
    );
  }

  return (
    <>
      <Button size="sm" variant="default" className="w-full gap-1.5" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4" />Enviar NF por e-mail
      </Button>
      <EnviarEmailNfDialog
        open={open}
        onOpenChange={setOpen}
        pedido_id={pedido.id}
        parceiro_id={pedido.parceiro_id}
      />
    </>
  );
}

function BotaoEmailNfBoletos({ pedido }: { pedido: any }) {
  const [open, setOpen] = useState(false);
  const { temNivel } = useNivel();
  const { data: boletosInfo, isLoading } = useBoletosDoPedido(pedido.id);
  const enviado = pedido.nf_email_enviado_em as string | null | undefined;
  if (!temNivel(2)) return null;

  const qtdTotal = boletosInfo?.qtdTotal ?? 0;
  const qtdRegistrados = boletosInfo?.qtdRegistrados ?? 0;
  const todosRegistrados = boletosInfo?.todosRegistrados ?? false;
  const disabled = isLoading || !todosRegistrados;
  const tooltipPendente = `${qtdRegistrados}/${qtdTotal} boletos com remessa gerada — gere a remessa Safra antes de enviar`;

  if (enviado) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="w-full">
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                className="w-full gap-1.5 text-success border-success/40 hover:text-success disabled:opacity-60"
                onClick={() => setOpen(true)}
              >
                <MailCheck className="h-4 w-4" />NF + boletos enviados · reenviar
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {disabled
              ? tooltipPendente
              : `Enviado em ${new Date(enviado).toLocaleString("pt-BR")}`}
          </TooltipContent>
        </Tooltip>
        <EnviarEmailNfBoletosDialog
          open={open}
          onOpenChange={setOpen}
          pedido_id={pedido.id}
          parceiro_id={pedido.parceiro_id}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-full">
            <Button
              size="sm"
              variant="default"
              disabled={disabled}
              className="w-full gap-1.5"
              onClick={() => setOpen(true)}
            >
              <Mail className="h-4 w-4" />
              {disabled && qtdTotal > 0
                ? `Enviar NF + boletos (${qtdRegistrados}/${qtdTotal})`
                : "Enviar NF + boletos"}
            </Button>
          </span>
        </TooltipTrigger>
        {disabled && <TooltipContent>{tooltipPendente}</TooltipContent>}
      </Tooltip>
      <EnviarEmailNfBoletosDialog
        open={open}
        onOpenChange={setOpen}
        pedido_id={pedido.id}
        parceiro_id={pedido.parceiro_id}
      />
    </TooltipProvider>
  );
}





function LinkPagamentoCard({ pedido, titulos }: { pedido: any; titulos: any[] }) {
  const navigate = useNavigate();
  const statusPagos = ["pago", "pago_com_atraso", "pago_judicial", "baixado_por_perda", "cancelado"];
  const tiposComLink = ["pix", "cartao", "cartao_credito", "cartao_debito"];

  const link =
    titulos
      .filter((t) => tiposComLink.includes(t.tipo_pagamento ?? "") && !statusPagos.includes(t.status) && t.link_pagamento)
      .map((t) => t.link_pagamento as string)[0] ??
    (pedido.link_pagamento as string | null | undefined) ??
    null;

  const irParaCobranca = () => navigate(`/recebimento/cobranca/${pedido.id}`, { state: { from: `/pedidos/${pedido.id}`, fromLabel: "Pedido" } });
  const formaEhBoleto = (pedido.forma_solicitada ?? "").toLowerCase().includes("boleto");
  const podeAjustarCobranca = ["cobranca", "aguardando_pagamento"].includes(pedido.estagio ?? "");

  // Boleto sem link em estágio que não permite ajuste → oculta o card
  if (!link && formaEhBoleto && !podeAjustarCobranca) return null;

  // Boleto sem link mas pode ajustar → mostrar só o botão de navegação
  if (!link && formaEhBoleto && podeAjustarCobranca) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Cobrança</p>
        </div>
        <Button size="sm" variant="outline" className="w-full h-7 gap-1.5 text-xs" onClick={irParaCobranca} >
          <ExternalLink className="h-3 w-3" />
          {pedido.estagio === "aguardando_pagamento" ? "Ajustar na tela de cobrança" : "Cadastrar na tela de cobrança"}
        </Button>
      </div>
    );
  }

  const handleCopiar = () => {
    navigator.clipboard.writeText(link!).then(() => {
      toast({ title: "Link copiado!", description: "Cole no WhatsApp ou onde preferir." });
    });
  };

  const handleWhatsApp = () => {
    const texto = `Olá! Segue o link de pagamento do pedido ${pedido.id_externo}:\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  };

  if (!link) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Link de pagamento</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Nenhum link cadastrado.</p>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 gap-1.5 text-xs"
          onClick={irParaCobranca}
        >
          <ExternalLink className="h-3 w-3" />
          Cadastrar na tela de cobrança
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Link de pagamento</p>
      </div>
      <p className="text-xs text-muted-foreground truncate max-w-[220px]" title={link}>
        {link}
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="flex-1 h-7 gap-1 text-xs" onClick={handleCopiar}>
          <Copy className="h-3 w-3" />
          Copiar
        </Button>
        <Button size="sm" variant="outline" className="flex-1 h-7 gap-1 text-xs text-success border-success/40 hover:bg-success/10 hover:text-success" onClick={handleWhatsApp}>
          <MessageCircle className="h-3 w-3" />
          WhatsApp
        </Button>
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Editar na tela de cobrança" onClick={irParaCobranca}>
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function BotaoSplitPedidoInline({ pedido, estagio }: { pedido: any; estagio: string | null | undefined }) {
  return (
    <BotaoSplitPedido
      pedido_id={pedido.id}
      id_externo={pedido.id_externo}
      valor_liquido={pedido.valor_liquido}
      valor_bruto={pedido.valor_bruto}
      estagio={estagio}
    />
  );
}

/**
 * Descida manual para pré-separação. A guarda do banco (RESERVA-NASCE-DA-PRE-SEPARACAO)
 * bloqueia quando falta lastro; aqui o operador vê o que falta e escolhe entre
 * dividir a remessa (caminho correto na maioria dos casos) ou forçar com motivo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AcaoDescerPreSeparacao({ pedido, estagio }: { pedido: any; estagio: EstagioPedido }) {
  const transicionar = useTransicionarPedido();
  const [splitOpen, setSplitOpen] = useState(false);
  const { permitido: podeLiberarSemProva } = usePermissaoAcao("acao.liberar_sem_prova");
  const falta = transicionar.faltaLastro;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-1.5"
        disabled={transicionar.isPending}
        onClick={() =>
          transicionar.mutate({ pedido_id: pedido.id, para_estagio: "pre_separacao" })
        }
      >
        {transicionar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
        Descer para pré-separação
      </Button>

      {podeLiberarSemProva && (
        <ForcarSemLastroDialog
          open={!!falta}
          onOpenChange={(v) => { if (!v) transicionar.limparFaltaLastro(); }}
          faltantes={falta?.faltantes ?? []}
          isPending={transicionar.isPending}
          onDividirRemessa={() => setSplitOpen(true)}
          onForcar={(motivo) => {
            transicionar.mutate(
              { pedido_id: pedido.id, para_estagio: "pre_separacao", motivo },
              { onSuccess: () => transicionar.limparFaltaLastro() },
            );
          }}
        />
      )}

      <SplitPedidoDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        pedido_id={pedido.id}
        id_externo={pedido.id_externo}
        valor_liquido={pedido.valor_liquido}
        valor_bruto={pedido.valor_bruto}
        estagio_origem={estagio}
      />
    </>
  );
}




function AcoesPedidoCobranca({ pedido, parceiro }: { pedido: any; parceiro: any }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-2 w-full">
      <Button className="w-full gap-2" onClick={() => navigate(`/recebimento/cobranca/${pedido.id}`, { state: { from: `/pedidos/${pedido.id}`, fromLabel: "Pedido" } })}>
        <Package className="h-4 w-4" />Operacionar cobrança
      </Button>
    </div>
  );
}

function AcoesPedidoFaturado({ pedido }: { pedido: any }) {
  const { data: boletosInfo } = useBoletosDoPedido(pedido.id);
  const temBoletos = boletosInfo?.temBoletos ?? false;
  return (
    <div className="flex flex-col gap-2 w-full">
      {temBoletos
        ? <BotaoEmailNfBoletos pedido={pedido} />
        : <BotaoEmailNfFaturado pedido={pedido} />}
    </div>
  );
}

function AcaoPrimaria({ pedido, parceiro, estagio, geraTituloReceber }: { pedido: any; parceiro: any; estagio: EstagioPedido; geraTituloReceber: boolean }) {
  const navigate = useNavigate();
  const { temNivel } = useNivel();
  if (estagio === "recebido") return temNivel(3) ? (
    <TriarPedidoDialog pedido_id={pedido.id} perfil_credito={parceiro?.perfil_credito} estagio_atual={estagio} forma_solicitada={pedido.forma_solicitada} triggerLabel="Encaminhar pedido" triggerVariant="default" />
  ) : null;
  if (estagio === "cobranca") return (
    <AcoesPedidoCobranca pedido={pedido} parceiro={parceiro} />
  );
  if (estagio === "aguardando_pagamento") return (
    <AcoesAguardandoPagamento pedido={pedido} geraTituloReceber={geraTituloReceber} />
  );
  if (estagio === "pre_separacao" && !pedido.bling_id_destino) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <AcoesPedidoPreFaturado pedido={pedido} parceiro={parceiro} />
      </div>
    );
  }
  // Estação de PRÉ-FATURAMENTO (o aviso do WNS morreu aqui): o pedido é
  // conferido pela RPC e desce ao Bling tarde e completo, depois que a XPM
  // devolve peso e volume reais.
  if (estagio === "pre_faturamento") return (
    <PreFaturamentoCard pedidoId={pedido.id} />
  );
  if (estagio === "faturado") return (
    <AcoesPedidoFaturado pedido={pedido} />
  );
  if (estagio === "em_analise_credito") return (
    <div className="rounded-md bg-info/10 border border-info/40 p-3 text-sm text-info flex gap-2">
      <Clock className="h-4 w-4 mt-0.5 shrink-0" /><span>Em análise de crédito — aguardando decisão.</span>
    </div>
  );
  return null;
}

/**
 * AÇÕES em `aguardando_pagamento`. A ação depende do MEIO das linhas abertas:
 * cartão é captura única (um clique fecha todas as parcelas, propagação no
 * banco); PIX e boleto seguem linha a linha, com a linha nomeada antes do clique.
 */
function AcoesAguardandoPagamento({ pedido }: { pedido: any; geraTituloReceber?: boolean }) {
  const { data: plano } = usePlanoAbertoPedido(pedido.id);
  const { temNivel } = useNivel();
  const [confirmarAberto, setConfirmarAberto] = useState(false);

  const cartao = (plano ?? []).filter((l) => (l.tipo_pagamento ?? "").toLowerCase() === "cartao");
  const linhaALinha = (plano ?? []).filter((l) =>
    ["pix", "boleto"].includes((l.tipo_pagamento ?? "").toLowerCase()),
  );

  const resumoMeios = (linhas: typeof linhaALinha) => {
    const porMeio = new Map<string, number>();
    linhas.forEach((l) => {
      const m = (l.tipo_pagamento ?? "").toLowerCase();
      porMeio.set(m, (porMeio.get(m) ?? 0) + 1);
    });
    return [...porMeio.entries()]
      .map(([m, n]) => `${n} parcela(s) de ${rotuloMeio(m)}`)
      .join(", ");
  };

  // REFERENCIA-SEMPRE, ANEXO-CONFORME-QUEM-E: uma só tela, modo SOPS.
  return (
    <div className="flex flex-col gap-2 w-full">
      {temNivel(3) && (
        <>
          <Button size="sm" onClick={() => setConfirmarAberto(true)}>
            {cartao.length > 0 && linhaALinha.length === 0
              ? "Confirmar captura"
              : "Confirmar pagamento"}
          </Button>
          {cartao.length > 0 && linhaALinha.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Cartão em aberto: {resumoMeios(cartao)} — fecha pela captura (NSU).
            </p>
          )}
          <ConfirmarPagamentoDialog
            pedidoId={pedido.id}
            aberto={confirmarAberto}
            aoFechar={() => setConfirmarAberto(false)}
            modo="sops"
          />
        </>
      )}
    </div>
  );
}


/**
 * Botão "Enviar para separação" que aparece apenas em pedidos no estágio
 * `aguardando_estoque`. Consome `vw_pedido_aguardando_estoque` para saber se
 * o pedido tem pendência financeira no pai (grupo `negociar`) — não recalcula
 * nada de título aqui, é dimensão pronta. No grupo `enviar` dispara direto;
 * no grupo `negociar` abre AlertDialog explicando que a cobrança das parcelas
 * seguintes é do CPR, mas permite avançar (aviso, não trava).
 */
function EnviarParaSeparacaoAcao({ pedidoId }: { pedidoId: string }) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: triagem, isLoading } = useQuery({
    queryKey: ["triagem-pedido", pedidoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pedido_aguardando_estoque")
        .select("grupo, situacao_pai, valor_vencido_pai, dias_atraso_pai")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return data as { grupo: string | null; situacao_pai: string | null; valor_vencido_pai: number | null; dias_atraso_pai: number | null } | null;
    },
  });

  const { data: destino } = useQuery({
    queryKey: ["pedido-destino-estoque", pedidoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pedido_destino_estoque")
        .select("destino, rotulo, porque, pago, falta_recebivel")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        destino: string | null;
        rotulo: string | null;
        porque: string | null;
        pago: boolean | null;
        falta_recebivel: number | null;
      } | null;
    },
  });




  const [enviando, setEnviando] = useState(false);

  const executar = async () => {
    setEnviando(true);
    try {
      const { data, error } = await (supabase as any).rpc("liberar_pedido_estoque", {
        p_pedido_id: pedidoId,
        p_motivo: "Produto chegou — liberado na ficha do pedido",
      });
      if (error) throw error;
      const destLabel = rotuloDestinoLiberacao(data?.destino);
      const acao = data?.acao_na_cobranca as "materializar_cobranca" | "gerar_portao" | null | undefined;
      let description: string | undefined;
      if (acao === "materializar_cobranca") {
        description = "Próximo passo: materializar a cobrança na tela de Cobrança";
      } else if (acao === "gerar_portao") {
        description = "Próximo passo: gerar o portão de entrada na aba Primeiro Pagamento";
      }
      toast({ title: `Enviado para ${destLabel}`, description });
      invalidarPedido(qc, pedidoId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao liberar remessa", description: msg, variant: "destructive" });
    } finally {
      setEnviando(false);
      setConfirmOpen(false);
    }
  };

  const grupo = triagem?.grupo;
  const precisaConfirmar = grupo === "negociar";
  const rotuloBotao = destino?.rotulo || "Enviar para próxima fase";
  const tooltipBotao = destino?.porque || undefined;

  const handleClick = () => {
    if (precisaConfirmar) setConfirmOpen(true);
    else executar();
  };

  const fmtBRL = (v: number | null | undefined) =>
    typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="flex-1 gap-1.5"
          onClick={handleClick}
          disabled={isLoading || enviando}
          title={tooltipBotao}
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
          {rotuloBotao}
        </Button>
        {destino?.pago && (
          <Badge variant="outline" className="h-6 px-1.5 text-[10px] border-success/40 text-success">
            Pago
          </Badge>
        )}
      </div>
      {Number(destino?.falta_recebivel ?? 0) > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          falta recebível: {fmtBRL(Number(destino?.falta_recebivel))}
        </p>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pedido pai tem parcela vencida</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="rounded-md bg-muted/50 border p-3 space-y-1 text-xs">
                 <div><span className="text-muted-foreground">Situação:</span> {triagem?.situacao_pai ?? "—"}</div>
                 <div><span className="text-muted-foreground">Valor vencido:</span> {fmtBRL(triagem?.valor_vencido_pai)}</div>
                 <div><span className="text-muted-foreground">Dias em atraso:</span> {triagem?.dias_atraso_pai ?? "—"}</div>
                </div>
                <p>
                  A primeira parcela do pedido pai já foi paga. O que está vencido são parcelas seguintes,
                  e por isso a cobrança dessas parcelas é responsabilidade do CPR, não da expedição.
                </p>
                {Number(destino?.falta_recebivel ?? 0) > 0 && (
                  <p className="text-warning">
                    Esta remessa ainda <strong>não tem recebível</strong> ({fmtBRL(Number(destino?.falta_recebivel))}).
                    Ao confirmar, ela vai para <strong>Cobrança</strong> para ser faturada — não para expedição.
                  </p>
                )}
                <p>
                  Esta remessa <strong>pode ser enviada normalmente</strong> — o aviso existe para dar visibilidade
                  antes da decisão, não para travar. Destino: <strong>{rotuloDestinoLiberacao(destino?.destino)}</strong>.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); executar(); }} disabled={enviando}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enviar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}



// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BotaoConsolidarPedido({ pedido, qtdTitulosAtivos }: { pedido: any; qtdTitulosAtivos: number }) {
  const [open, setOpen] = useState(false);
  const { temNivel } = useNivel();
  if (!temNivel(2)) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setOpen(true)}>
        <Scissors className="h-4 w-4 rotate-90" />
        Consolidar outro pedido aqui
      </Button>
      <ConsolidarPedidoDialog
        open={open}
        onOpenChange={setOpen}
        pedidoId={pedido.id}
        idExterno={pedido.id_externo}
        parceiroId={pedido.parceiro_id}
        naturezaId={pedido.natureza_operacao_id ?? null}
        valorBruto={Number(pedido.valor_bruto ?? 0)}
        valorFrete={Number(pedido.valor_frete ?? 0)}
        valorLiquido={Number(pedido.valor_liquido ?? 0)}
        condicao={pedido.condicao_solicitada ?? null}
        qtdTitulosAtivos={qtdTitulosAtivos}
      />
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BotaoReterEstoque({ pedido }: { pedido: any }) {
  const [open, setOpen] = useState(false);
  const { temNivel } = useNivel();
  if (!temNivel(2)) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setOpen(true)}>
        <PackageX className="h-4 w-4" />
        Enviar para Aguardando Estoque
      </Button>
      <ReterEstoqueDialog open={open} onOpenChange={setOpen} pedidoId={pedido.id} idExterno={pedido.id_externo} />
    </>
  );
}


export default function PedidoDetalhe() {
  const { permitido: permEnviarBling } = usePermissaoAcaoOuSuperAdmin("acao.enviar_bling");
  const { permitido: permEmpurrarXpm } = usePermissaoAcaoOuSuperAdmin("acao.empurrar_xpm");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data, isLoading } = usePedidoDetalhe(id);
  const { data: prova } = useProvaPagamento(id);
  const { data: priorizado } = usePedidoPriorizado(id);
  const atualizarUrgencia = useAtualizarUrgencia();
  const limparAtencao = useLimparAtencao();
  const [urgencia, setUrgencia] = useState<UrgenciaDeclarada>("normal");
  const [obsUrgencia, setObsUrgencia] = useState("");
  const registrarEvento = useRegistrarEventoPedido();
  const [obsSop, setObsSop] = useState("");
  const [transportadoraId, setTransportadoraId] = useState("");
  const [pesoBruto, setPesoBruto] = useState("");
  const [recalculandoPeso, setRecalculandoPeso] = useState(false);
  const [freteTipo, setFreteTipo] = useState("");
  const { tipos: freteTiposAtivos } = useFreteTipos();
  const [valorFrete, setValorFrete] = useState("");
  
  const transportadoras = useTransportadoras();
  const { rotuloOrigem } = useTransportadoraOrigem();
  const recotar = useRecotarTransportadora();
  const salvarDadosEnvio = useSalvarDadosEnvio();
  const freteComparativo = useFreteComparativo(id);
  const [compararOpen, setCompararOpen] = useState(false);
  const { data: titulosData } = usePedidoTitulos(id);
  const { data: remessasData } = useRemessas(id ?? "");
  const { data: origensData } = usePedidoOrigens(id ?? "");
  const { data: familiaRecebivel, isLoading: familiaCarregando, isError: familiaErro } = useRecebivelFamilia(id);
  const { data: eixosTitulos } = useTituloEixosPedido(id);
  const { data: dimEixosTitulos } = useTituloEixosDim();
  const { data: titulosResumo } = useTitulosPedidoResumo(id);
  const [aplicarHaverOpen, setAplicarHaverOpen] = useState(false);
  const [desvincularBlingOpen, setDesvincularBlingOpen] = useState(false);
  const [naturezaDialogOpen, setNaturezaDialogOpen] = useState(false);
  const [naturezaSugerida, setNaturezaSugerida] = useState<string | null>(null);

  const [restaurandoSnapshot, setRestaurandoSnapshot] = useState(false);
  const [confirmRestaurar, setConfirmRestaurar] = useState(false);
  const [corrigindoSnapshot, setCorrigindoSnapshot] = useState(false);
  const { user } = useAuth();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const { temNivel } = useNivel();
  const { permitido: podeLiberarSemProva } = usePermissaoAcao("acao.liberar_sem_prova");

  const parceiroIdAtual = data?.pedido?.parceiro_id as string | undefined;

  // Número do pedido no Bling. pedidos_venda só tem registros a partir do início
  // do sync (01/06/2026); ausência de match é esperada e degrada em silêncio.
  const blingIdDestino = data?.pedido?.bling_id_destino ?? null;
  const { data: pedidoVendaBling } = useQuery({
    queryKey: ["pedido-venda-bling", blingIdDestino],
    enabled: !!blingIdDestino,
    queryFn: async () => {
      const { data: pv, error } = await (supabase as any)
        .from("pedidos_venda")
        .select("numero, numero_loja")
        .eq("bling_id", String(blingIdDestino))
        .maybeSingle();
      if (error) throw error;
      return pv as { numero: string | null; numero_loja: string | null } | null;
    },
  });

  // Aba do browser espelha o H1 — remessas do mesmo cliente ficam distinguíveis.
  const idExternoAba = data?.pedido?.id_externo ?? (data?.pedido?.id ? String(data.pedido.id).slice(0, 8) : null);
  useEffect(() => {
    if (!idExternoAba) return;
    const anterior = document.title;
    document.title = `Pedido ${idExternoAba}`;
    return () => { document.title = anterior; };
  }, [idExternoAba]);


  const { data: haveresDisponiveisData } = useQuery({
    queryKey: ["haver-disponivel", parceiroIdAtual],
    enabled: !!parceiroIdAtual,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("haver_cliente")
        .select("id, saldo")
        .eq("parceiro_id", parceiroIdAtual)
        .in("status", ["disponivel", "parcial"])
        .gt("saldo", 0);
      return data ?? [];
    },
  });
  const totalHaverDisponivel = (haveresDisponiveisData ?? []).reduce(
    (s: number, h: any) => s + Number(h.saldo), 0
  );

  // ADIANTAMENTO-TEM-DESTINO: dinheiro já pago pelo cliente amarrado a ESTE
  // pedido. Não é crédito e não tem ação — é consumido no faturamento.
  const { data: adiantamentoPedido } = useQuery({
    queryKey: ["pedido-adiantamento", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pedido_adiantamento")
        .select("adiantado_vivo, formas, recebido_em, pct_pago, cobre_pedido_inteiro")
        .eq("pedido_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        adiantado_vivo: number | null;
        formas: string | null;
        recebido_em: string | null;
        pct_pago: number | null;
        cobre_pedido_inteiro: boolean | null;
      } | null;
    },
  });
  const adiantadoVivo = Number(adiantamentoPedido?.adiantado_vivo ?? 0);

  // PORTAO-E-REGRA: a verdade do portão vem da view derivada, nunca de coluna cacheada.
  const { data: portaoRegra } = useQuery({
    queryKey: ["pedido-portao-regra", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pedido_portao_regra")
        .select("exige_portao_regra")
        .eq("pedido_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as { exige_portao_regra: boolean | null } | null;
    },
  });



  const { data: splitsAtivos } = useQuery({
    queryKey: ["splits", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select("id, id_externo, estagio")
        .eq("split_de_pedido_id", id)
        .neq("estagio", "cancelado");
      if (error) throw error;
      return (data ?? []) as { id: string; id_externo: string; estagio: string }[];
    },
    enabled: !!id,
  });

  // Tarefas vinculadas (vw_pedido_tarefas) — alimenta o dot da aba Tarefas.
  const { data: tarefasVinculadas } = usePedidoTarefasVinculadas(id);
  const tarefasAbertas = (tarefasVinculadas ?? []).filter((t) =>
    STATUS_ABERTOS.includes(t.status),
  ).length;

  const recalcularPeso = async () => {
    if (!id) return;
    setRecalculandoPeso(true);
    try {
      const { data, error } = await (supabase as any).rpc("calcular_peso_pedido", {
        p_pedido_id: id,
      });
      if (!error && data != null) {
        setPesoBruto(String(data.peso ?? data));
        // Invalida a query do pedido para que cubagem_total seja atualizado na tela
        invalidarPedido(queryClient, id);
      }
    } finally {
      setRecalculandoPeso(false);
    }
  };

  const pesoBrutoNum = parseFloat(pesoBruto) || Number(data?.pedido?.peso_bruto_total) || 0;
  /** Números de expedição — leitura pura da view, o front só formata. */
  const embalagem = usePedidoEmbalagem(id);
  const emb = embalagem.data ?? null;
  // PESO-TAXADO-VEM-DA-VIEW: o front não recalcula peso cobrado. A view já aplica
  // tara e cubagem de expedição; cubagem_total (volume sólido) subestima o frete.
  const pesoCobradoEst = Number(emb?.peso_taxado_previsto) || pesoBrutoNum;

  const cepEstimativa = data?.pedido?.endereco_entrega?.cep ?? data?.parceiro?.cep ?? null;
  const freteEst = useFreteEstimado(
    transportadoraId || null,
    cepEstimativa,
    pesoCobradoEst > 0 ? pesoCobradoEst : null
  );

  useEffect(() => {
    if (priorizado) {
      setUrgencia(priorizado.urgencia_declarada || "normal");
      setObsUrgencia(priorizado.urgencia_observacao || "");
    }
  }, [priorizado]);

  // Sincroniza os campos do card "Dados de envio" sempre que o SERVIDOR mudar.
  // Sem dirty tracking: perder digitação não salva é mais barato que gravar
  // valor velho por cima do recalculado (consolidação, split, edição de itens).
  const envioServidor = [
    data?.pedido?.transportadora_id ?? "",
    data?.pedido?.peso_bruto_total ?? "",
    data?.pedido?.frete_tipo ?? "",
    data?.pedido?.valor_frete ?? "",
  ].join("|");
  const envioServidorRef = useRef<string | null>(null);

  useEffect(() => {
    const pedidoAtual = data?.pedido;
    if (!pedidoAtual) return;
    if (envioServidorRef.current === envioServidor) return;

    envioServidorRef.current = envioServidor;
    setTransportadoraId(pedidoAtual.transportadora_id ?? "");
    setPesoBruto(String(pedidoAtual.peso_bruto_total ?? ""));
    setFreteTipo(pedidoAtual.frete_tipo ?? "");
    setValorFrete(String(pedidoAtual.valor_frete ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envioServidor]);


  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!data) return <div className="p-6">Pedido não encontrado.</div>;

  const { pedido, parceiro, itens, eventos, analiseCredito, analisesAnteriores, natureza, naturezaAlerta, naturezaRefPedidoId, idade_minutos, sla_estourado } = data;
  const naturezaTrocaLiberada =
    !naturezaAlerta ||
    (naturezaAlerta.estagio_permite !== false &&
      !naturezaAlerta.tem_titulo &&
      !naturezaAlerta.tem_remessa);
  const naturezaTrocaTooltip = naturezaTrocaLiberada
    ? "Trocar natureza de operação"
    : naturezaAlerta?.tem_titulo
      ? "Não é possível trocar: já existe título ativo neste pedido."
      : naturezaAlerta?.tem_remessa
        ? "Não é possível trocar: já existe remessa criada neste pedido."
        : "Não é possível trocar: o estágio atual não permite alterar a natureza.";

  const rotuloPedido = pedido.id_externo ?? String(pedido.id).slice(0, 8);
  const nomeClienteExibido = nomeCanonico(parceiro?.razao_social, "Cliente");
  const apelidoCliente = apelidoParceiro(parceiro?.razao_social, parceiro?.nome_fantasia);
  const geraTituloReceber = natureza?.gera_titulo_receber ?? true;
  const estagio = pedido.estagio as EstagioPedido;
  const estagioFinal = isEstagioFinal(estagio);

  // Espelha a guarda dupla da RPC atualizar_frete_pedido: o VALOR do frete congela
  // quando existe recebível emitido ou remessa criada. Demais dados de envio ficam livres.
  const temTituloAtivo = (titulosData ?? []).some(
    (t: any) => !["cancelado", "cancelado_recuperacao"].includes(t.status)
  );
  const temRemessaAtiva = (remessasData ?? []).some((r: any) => r.status !== "cancelada");
  const valorFreteCongelado = temTituloAtivo || temRemessaAtiva;
  const origens = origensData ?? [];
  const temOrigemConsolidada = origens.length > 0;
  const valorFreteAlterado =
    Math.abs((parseFloat(valorFrete) || 0) - (Number(pedido.valor_frete) || 0)) > 0.005;
  // Fidelidade ao original do FOP como VISIBILIDADE, não como sobrescrita:
  // o campo segue carregando o valor real do pedido (o que gera a cobrança);
  // a divergência contra o snapshot aparece como selo.
  const freteOriginalFop =
    (pedido as any).snapshot_original?.valor_frete != null
      ? Number((pedido as any).snapshot_original.valor_frete)
      : null;
  // Natureza sem cobrança não tem frete cobrado do cliente: divergência não se aplica.
  const freteDivergeOriginal =
    geraTituloReceber &&
    freteOriginalFop != null &&
    Math.abs(freteOriginalFop - (Number(pedido.valor_frete) || 0)) > 0.005;

  const handleRestaurarSnapshot = async () => {
    if (!pedido?.id) return;
    setRestaurandoSnapshot(true);
    try {
      // Se é um split, verificar e corrigir snapshot do pai antes de restaurar
      if (pedido.split_de_pedido_id) {
        // Buscar dados do pai
        const { data: paiData, error: paiErr } = await (supabase as any)
          .from("pedidos")
          .select("id, snapshot_original")
          .eq("id", pedido.split_de_pedido_id)
          .single();

        if (paiErr) throw new Error(`Erro ao buscar pedido pai: ${paiErr.message}`);

        // Se pai tem backfill: true, corrigir snapshot via FOP primeiro
        if (paiData?.snapshot_original?.backfill === true) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (!token) throw new Error("Sessão inválida");

          const rebackfillResp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rebackfill-snapshot-fop`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ pedido_ids: [paiData.id] }),
            }
          );
          const rebackfillResult = await rebackfillResp.json();
          if (!rebackfillResp.ok || rebackfillResult?.erros > 0) {
            const errMsg = rebackfillResult?.resultados?.[0]?.erro ?? rebackfillResult?.error ?? "Erro ao corrigir snapshot do pai";
            throw new Error(errMsg);
          }
        }
      }

      // Chamar restaurar_snapshot_completo (detecta pai automaticamente se for split)
      const { data, error } = await (supabase as any).rpc("restaurar_snapshot_completo", {
        p_pedido_id: pedido.id,
        p_usuario_id: user?.id,
      });
      if (error) throw error;
      const resultado = data as any;

      const splitsMsg = resultado?.splits_dissolvidos > 0 ? ` ${resultado.splits_dissolvidos} split(s) dissolvido(s).` : "";
      const reativadoMsg = resultado?.pai_reativado ? " Pedido reativado para Recebido." : "";
      const valoresMsg = resultado?.motivo_sem_valores ? ` ${resultado.motivo_sem_valores}` : " Valores restaurados.";
      const paiMsg = resultado?.pedido_pai_externo && resultado.pedido_pai_externo !== pedido?.id_externo
        ? ` (pedido pai: ${resultado.pedido_pai_externo})`
        : "";

      toast({
        title: "Pedido restaurado ao original",
        description: `${resultado?.itens_restaurados ?? 0} itens restaurados.${splitsMsg}${reativadoMsg}${valoresMsg}${paiMsg}`,
      });

      invalidarPedido(queryClient, pedido.id);
    } catch (err: any) {
      toast({
        title: "Erro ao restaurar",
        description: err?.message ?? "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setRestaurandoSnapshot(false);
      setConfirmRestaurar(false);
    }
  };

  const handleCorrigirSnapshot = async () => {
    if (!pedido?.id) return;
    setCorrigindoSnapshot(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rebackfill-snapshot-fop`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ pedido_ids: [pedido.id] }),
        }
      );
      const result = await resp.json();
      if (!resp.ok || result?.erros > 0) {
        const errMsg = result?.resultados?.[0]?.erro ?? result?.error ?? "Erro desconhecido";
        throw new Error(errMsg);
      }
      toast({
        title: "Snapshot corrigido",
        description: "Dados originais do FOP carregados com sucesso.",
      });
      invalidarPedido(queryClient, pedido.id);
    } catch (err: any) {
      toast({
        title: "Erro ao corrigir snapshot",
        description: err?.message ?? "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setCorrigindoSnapshot(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="px-6 pt-4">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground" onClick={() => navigate("/pedidos")}>
          <ArrowLeft className="h-4 w-4" />Casa dos Pedidos
        </Button>
      </div>

      <div className="px-6 pb-4">
        <PedidoStepper
          estagioAtual={estagio}
          onClickEstagio={(e) => navigate(`/pedidos?estagio=${e}`)}
        />
      </div>

      <div className="px-6 pt-2 pb-4">
        <div className="space-y-1 min-w-0">
          {/* PEDIDO-E-O-TITULO: remessas do mesmo cliente precisam de abas distinguíveis. */}
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-serif text-[26px] font-medium tracking-tight text-foreground leading-tight truncate">
              Pedido {rotuloPedido}
            </h1>
            <ChipNfPedido pedidoId={pedido.id} pedidoRef={pedido.id_externo} />
          </div>
          <p className="text-[15px] text-muted-foreground truncate">
            {pedido.parceiro_id ? (
              <Link
                to={`/parceiros/${pedido.parceiro_id}`}
                className="text-primary border-b border-primary/40 no-underline hover:border-primary"
              >
                {nomeClienteExibido}
              </Link>
            ) : (
              <span>{nomeClienteExibido}</span>
            )}
            {apelidoCliente && <span> · {apelidoCliente}</span>}
            {parceiro?.cnpj && <span className="font-mono"> · CNPJ {parceiro.cnpj}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <EstagioBadge estagio={estagio} />
            {natureza?.codigo && natureza.codigo !== "venda" && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1",
                        naturezaTrocaLiberada ? "cursor-pointer" : "cursor-default",
                      )}
                      onClick={() => {
                        if (!naturezaTrocaLiberada) return;
                        setNaturezaSugerida(null);
                        setNaturezaDialogOpen(true);
                      }}
                    >
                      <NaturezaOperacaoBadge codigo={natureza?.codigo ?? null} nome={natureza?.nome ?? null} />
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{naturezaTrocaTooltip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {priorizado && <BadgePriorizacao score={priorizado.score_total} breakdown={priorizado.score_breakdown} compact />}
            <span className="text-xs text-muted-foreground"><FormatoIdade minutos={idade_minutos} /></span>
            {sla_estourado && <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" />SLA estourado</Badge>}
            <MarcacaoPedido pedidoId={pedido.id} marcacao={pedido.marcacao ?? null} />
            <BadgesContextuais
              parceiro={parceiro || {}}
              analisesAnteriores={analisesAnteriores}
              mostrarSemAlertas={false}
              className="gap-2 [&>*]:text-[10px] [&>*]:py-0 [&>*]:px-1.5 [&_svg]:h-3 [&_svg]:w-3"
            />
          </div>
          <LinhaContatosCliente
            telefone={parceiro?.telefone}
            email={parceiro?.email}
            email_cobranca={parceiro?.email_cobranca}
            contatos={parceiro?.contatos}
          />
          {!estagioFinal && pedido.proxima_acao && (
            <p className="text-sm text-muted-foreground italic pt-1.5">
              <span className="text-[10px] uppercase tracking-widest not-italic mr-1.5">Próxima ação:</span>
              {prefixarProximaAcao(pedido.proxima_acao, {
                podeEnviarBling: permEnviarBling,
                podeEmpurrarXpm: permEmpurrarXpm,
              })}
            </p>
          )}
        </div>
      </div>

      {/* Prova de pagamento — só aparece quando existe algum recebimento registrado */}
      {prova && prova.valor_recebido > 0 && (
        <div className="mx-6 mb-3">
          <ProvaPagamentoAlerta prova={prova} />
        </div>
      )}



      {/* Banner atenção — pausa (vermelho) ou aviso (âmbar) */}
      {(pedido as any).atencao_nivel && (
        <div className={cn(
          "mx-6 mb-3 flex items-start gap-3 rounded-lg border p-3",
          (pedido as any).atencao_nivel === 'pausa'
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-warning/40 bg-warning/10 text-warning"
        )}>
          {(pedido as any).atencao_nivel === 'pausa'
            ? <PauseCircle className="h-5 w-5 mt-0.5 shrink-0" />
            : <Bell className="h-5 w-5 mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide">
              {(pedido as any).atencao_nivel === 'pausa' ? 'PEDIDO PAUSADO' : 'AVISO'}
            </p>
            <p className="text-sm">{(pedido as any).atencao_motivo}</p>
          </div>
          {!estagioFinal && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 shrink-0"
              onClick={() => id && limparAtencao.mutate({ pedidoId: id })}
              disabled={limparAtencao.isPending}
            >
              <XCircle className="h-4 w-4" />
              Remover
            </Button>
          )}
        </div>
      )}

      {adiantadoVivo > 0.01 && (
        <div className="mx-6 mb-3 flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-success">
          <Wallet className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-sm">
            {adiantamentoPedido?.cobre_pedido_inteiro ? (
              <>
                Pedido já pago integralmente — <span className="font-medium">{fmtBRL.format(adiantadoVivo)}</span>{" "}
                recebidos em {adiantamentoPedido?.formas ?? "—"}. Os títulos nascem quitados no faturamento.
              </>
            ) : (
              <>
                <span className="font-medium">{fmtBRL.format(adiantadoVivo)}</span> já pagos neste pedido
                {" "}({adiantamentoPedido?.formas ?? "—"}
                {adiantamentoPedido?.recebido_em ? `, ${formatDateBR(adiantamentoPedido.recebido_em)}` : ""}).
                {" "}Abate a parcela mais próxima automaticamente no faturamento.
              </>
            )}
          </p>
        </div>
      )}


      {totalHaverDisponivel > 0.01 && pedido.estagio !== "faturado" && pedido.estagio !== "cancelado" && (
        <div className="mx-6 mb-3 flex items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/10 p-3">
          <div className="flex items-center gap-2 text-success">
            <Wallet className="h-4 w-4 shrink-0" />
            <p className="text-sm">
              <span className="font-medium">{fmtBRL.format(totalHaverDisponivel)}</span> em crédito disponível para este cliente
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setAplicarHaverOpen(true)}
          >
            Aplicar crédito
          </Button>
        </div>
      )}

      {/* NATUREZA-INCOERENTE: banco decide, tela só mostra o motivo em texto humano. */}
      {naturezaAlerta?.incoerente === true && (
        <div className="mx-6 mb-3 flex items-start justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-warning">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide">Natureza incoerente</p>
              <p className="text-sm">{naturezaAlerta.motivo}</p>
              {!naturezaAlerta.pode_trocar && (
                <p className="text-xs mt-1 opacity-80">
                  {naturezaAlerta.tem_titulo
                    ? "Troca travada: já existe título ativo neste pedido."
                    : naturezaAlerta.tem_remessa
                      ? "Troca travada: já existe remessa criada neste pedido."
                      : "Troca travada: o estágio atual não permite alterar a natureza."}
                </p>
              )}
            </div>
          </div>
          {naturezaAlerta.pode_trocar && temNivel(3) && (
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => {
                setNaturezaSugerida(naturezaAlerta.sugestao_codigo ?? null);
                setNaturezaDialogOpen(true);
              }}
            >
              Trocar para {naturezaAlerta.sugestao_nome}
            </Button>
          )}
        </div>
      )}

      {temNivel(3) && (
        <AlterarNaturezaDialog
          open={naturezaDialogOpen}
          onOpenChange={(v) => {
            setNaturezaDialogOpen(v);
            if (!v) setNaturezaSugerida(null);
          }}
          pedidoId={naturezaRefPedidoId}
          pedidoFilhoId={naturezaRefPedidoId !== pedido.id ? pedido.id : undefined}
          ehRemessaFilha={naturezaRefPedidoId !== pedido.id}
          codigoAtual={natureza?.codigo ?? null}
          codigoSugerido={naturezaSugerida}
          focarMotivo={!!naturezaSugerida}

        />
      )}

      {/* Canal único de alerta operacional: achados vivos da auditoria. */}
      <AlertasPedidoPanel pedidoId={pedido.id} />

      <Separator />


      <div className="flex flex-col lg:flex-row lg:items-start">

        {/* COLUNA ESQUERDA */}
        <div className="flex-1 min-w-0 px-6 py-5 space-y-6">

          {analiseCredito?.status_final && analiseCredito.status_final !== "aprovado" && (
            <Alert className={cn(
              analiseCredito.status_final === "reprovado"
                ? "border-destructive/40 bg-destructive/10"
                : "border-warning/40 bg-warning/10"
            )}>
              <ShieldAlert className={cn(
                "h-4 w-4",
                analiseCredito.status_final === "reprovado" ? "text-destructive" : "text-warning"
              )} />
              <AlertDescription className={cn(
                analiseCredito.status_final === "reprovado"
                  ? "text-destructive"
                  : "text-warning"
              )}>
                <p className="font-medium mb-0.5">
                  {analiseCredito.status_final === "reprovado"
                    ? "Crédito reprovado"
                    : "Crédito aprovado com ressalva"}
                </p>
                <p className="text-sm">{analiseCredito.ressalva || "Consulte a aba Crédito para detalhes."}</p>
              </AlertDescription>
            </Alert>
          )}

          {/* ============ FAIXA 0: estação de PRÉ-FATURAMENTO ============ */}
          {estagio === "pre_faturamento" && (
            <div className="space-y-4">
              {pedido.bling_envio_erro ? (
                <Alert className="border-destructive/40 bg-destructive/10">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <AlertDescription className="text-destructive">
                    <p className="font-medium">Envio ao Bling falhou</p>
                    <p className="text-sm">{pedido.bling_envio_erro}</p>
                    <p className="text-sm mt-1">
                      Corrija o problema e tente enviar novamente. O pedido permanece em pré-faturamento.
                    </p>
                  </AlertDescription>
                </Alert>
              ) : pedido.bling_id_destino ? (
                <Alert className="border-success/40 bg-success/10">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <AlertDescription>
                    <p className="font-medium text-success">Enviado ao Bling — aguardando emissão da NF</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm bg-background/60 px-1.5 py-0.5 rounded font-mono">
                        {pedido.bling_id_destino}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(String(pedido.bling_id_destino));
                          toast({ title: "Copiado", description: "ID do Bling copiado para a área de transferência." });
                        }}
                      >
                        <Copy className="h-3 w-3" />
                        Copiar
                      </Button>
                    </div>
                    {pedido.bling_enviado_em && (
                      <p className="text-sm mt-1">
                        Enviado em {fmtDateTime(pedido.bling_enviado_em)}
                      </p>
                    )}
                    <p className="text-sm mt-2 text-muted-foreground">
                      A NF é emitida dentro do Bling. Quando ela for ingerida, o pedido avança para Faturado automaticamente.
                    </p>
                  </AlertDescription>
                </Alert>
              ) : null}
              <AncoraFaturamentoCard pedidoId={pedido.id} idExterno={pedido.id_externo} />
            </div>
          )}

          {/* ============ FAIXA 1: Pedido · Resumo financeiro · Dados de envio ============ */}
          <div className="grid gap-4 lg:grid-cols-2 items-stretch">

            {/* Coluna esquerda — Pedido + Resumo financeiro */}
            <div className="flex flex-col gap-4">
              {/* Card — Pedido */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    Pedido
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">ID externo</p>
                      <p className="text-sm">{pedido.id_externo}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Data</p>
                      <p className="text-sm">{fmtDate(pedido.data_pedido)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Recebido em</p>
                      <p className="text-sm">{fmtDateTime(pedido.recebido_em)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Via</p>
                      <p className="text-sm">{pedido.recebido_via ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Vendedor</p>
                      <p className="text-sm">{pedido.vendedor ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Condição</p>
                      <p className="text-sm">{pedido.condicao_solicitada ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Forma</p>
                      <p className="text-sm">{pedido.forma_solicitada ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Natureza</p>
                      <div className="flex items-center gap-1.5">
                        {naturezaTrocaLiberada ? (
                          <p className="text-sm">{natureza?.nome ?? "Venda"}</p>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-sm cursor-default">{natureza?.nome ?? "Venda"}</p>
                              </TooltipTrigger>
                              <TooltipContent>{naturezaTrocaTooltip}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {naturezaTrocaLiberada && temNivel(3) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground"
                            title="Trocar natureza de operação"
                            onClick={() => {
                              setNaturezaSugerida(null);
                              setNaturezaDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {pedido.bling_id_destino && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                          {pedidoVendaBling?.numero ? "Bling" : "Bling ID"}
                        </p>
                        {pedidoVendaBling?.numero ? (
                          <>
                            <p className="text-sm">#{pedidoVendaBling.numero}</p>
                            <p className="text-[10px] text-muted-foreground">id {pedido.bling_id_destino}</p>
                          </>
                        ) : (
                          <p className="text-sm">#{pedido.bling_id_destino}</p>
                        )}
                      </div>
                    )}
                  </div>
                  {parceiro?.id && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      {temNivel(2) ? (
                        <EditarProgramaInline parceiro_id={parceiro.id} nivel_atual={parceiro.nivel_programa || "convive"} categoria_ka_atual={parceiro.categoria_ka ?? null} />
                      ) : (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Programa de Parceiros</Label>
                          <p className="text-sm capitalize">
                            {(parceiro.nivel_programa || "convive").replace("_", " ")}
                            {parceiro.categoria_ka && (
                              <span className="text-muted-foreground"> · KA {parceiro.categoria_ka}</span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-3">
                    <SplitsPedidoSection pedido_id={pedido.id} />
                  </div>
                </CardContent>
              </Card>

              {/* Card — Resumo financeiro */}
                <Card className="border-border/60 flex-1 flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      Resumo financeiro
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const bruto          = pedido.valor_bruto || 0;
                      const liquido        = pedido.valor_liquido || 0;
                      const frete          = Number(pedido.valor_frete) || 0;
                      const celebra        = Number((pedido as any).desconto_celebra_valor) || 0;
                      const pix            = Number((pedido as any).bonus_pix_valor) || 0;
                      const temBreakdown   = celebra > 0.01 || pix > 0.01;
                      // AJUSTE-COM-SINAL: negativo é acréscimo (ex.: acréscimo por condição de
                      // pagamento). Math.max(0, ...) escondia a linha e o card não fechava.
                      const ajusteSimples   = bruto + frete - liquido;
                      const descontoSimples = Math.max(0, ajusteSimples);
                      const acrescimoSimples = Math.max(0, -ajusteSimples);
                      const temFrete       = frete > 0.01;
                      // CRÉDITO PARCIAL TAMBÉM É PAGAMENTO: crédito que não cobre o pedido
                      // inteiro não vira título de haver, vira adiantamento vinculado. Ler só
                      // `somaHaver` deixava o crédito invisível em todo pedido pré-NF.
                      const creditoCliente = Math.max(
                        Number(titulosResumo?.somaHaver ?? 0),
                        Number(titulosResumo?.somaAdiantamento ?? 0),
                      );
                      const jaPagoDinheiro = Number(titulosResumo?.somaPagos ?? 0);
                      const abatido        = Number(titulosResumo?.totalAbatido ?? 0);
                      return (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Valor bruto</span>
                            <span>{fmtBRL.format(bruto)}</span>
                          </div>
                          {temBreakdown ? (
                            <>
                              {celebra > 0.01 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Desconto ({((celebra / bruto) * 100).toFixed(2)}%)</span>
                                  <span className="text-destructive">−{fmtBRL.format(celebra)}</span>
                                </div>
                              )}
                              {pix > 0.01 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Desconto PIX ({(celebra > 0.01 ? (pix / (bruto - celebra)) * 100 : (pix / bruto) * 100).toFixed(2)}%)</span>
                                  <span className="text-destructive">−{fmtBRL.format(pix)}</span>
                                </div>
                              )}
                            </>
                          ) : descontoSimples > 0.01 ? (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Desconto ({((descontoSimples / bruto) * 100).toFixed(2)}%)</span>
                              <span className="text-destructive">−{fmtBRL.format(descontoSimples)}</span>
                            </div>
                          ) : acrescimoSimples > 0.01 ? (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Acréscimo ({((acrescimoSimples / bruto) * 100).toFixed(2)}%)</span>
                              <span>+{fmtBRL.format(acrescimoSimples)}</span>
                            </div>
                          ) : null}
                          {temFrete && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Frete{pedido.frete_tipo ? ` (${pedido.frete_tipo})` : ""}</span>
                              <span>+{fmtBRL.format(frete)}</span>
                            </div>
                          )}
                          <div className="border-t border-border/60 pt-2">
                            <div className="flex justify-between text-sm font-medium">
                              <span>Valor líquido</span>
                              <span>{fmtBRL.format(liquido)}</span>
                            </div>
                          </div>
                          {/* HAVER-É-PAGAMENTO: o líquido não muda; o crédito é uma parcela paga. */}
                          {abatido > 0.005 && (
                            <>
                              {creditoCliente > 0.005 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-success">
                                    Crédito do cliente
                                  </span>
                                  <span className="text-success">
                                    −{fmtBRL.format(creditoCliente)}
                                  </span>
                                </div>
                              )}
                              {jaPagoDinheiro > 0.005 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-success">
                                    Já pago
                                  </span>
                                  <span className="text-success">
                                    −{fmtBRL.format(jaPagoDinheiro)}
                                  </span>
                                </div>
                              )}
                              <div className="border-t border-border/60 pt-2">
                                <div className="flex justify-between text-base font-medium">
                                  <span>A cobrar</span>
                                  <span>{fmtBRL.format(Math.max(0, liquido - abatido))}</span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* PROVA-VIAJA-COM-O-PEDIDO (20/08/2026): o comprovante confirmado
                        na Mesa Comercial precisa ser conferível pelo SOPS depois. */}
                    <div className="mt-3">
                      <ComprovantePagamentoBloco
                        pedidoId={pedido.id}
                        somenteLeitura
                        podeConfirmar={false}
                      />
                    </div>
                  </CardContent>
                </Card>
            </div>

            {pedido.alerta_logistica && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-sm">{pedido.alerta_logistica}</p>
              </div>
            )}

            {/* Card — Dados de envio */}
            {estagio !== "cancelado" && (
              <Card className="border-border/60 h-full flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    Dados de envio
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Transportadora</label>
                    <Select value={transportadoraId || "__none__"} onValueChange={(v) => setTransportadoraId(v === "__none__" ? "" : v)} disabled={!temNivel(2)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Nenhuma —</SelectItem>
                        {(transportadoras.data ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.razao_social}
                            {t.cnpj && <span className="text-muted-foreground ml-2 text-xs">{t.cnpj}</span>}
                          </SelectItem>
                        ))}
                        </SelectContent>
                      </Select>
                      {pedido.transportadora_origem && (
                        <Badge variant="outline" className="text-[10px] w-fit">
                          {rotuloOrigem(pedido.transportadora_origem)}
                        </Badge>
                      )}
                    </div>

                    {/* RASTREIO-B2B-MANUAL (22/08/2026): vínculo manual de código Correios */}
                    {/* CONTRATO DE NÍVEL: nível 1 lê o rastreio; nível 2+ pode vincular/trocar. */}
                    {id && (temNivel(2) ? <RastreioPedidoBloco pedidoId={id} /> : <RastreioLeitura pedidoId={id} />)}

                    <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Peso bruto total (kg)</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={pesoBruto}
                        onChange={(e) => setPesoBruto(e.target.value)}
                        placeholder="0.000"
                        disabled={!temNivel(2)}
                        className="flex-1 min-w-0 h-9 text-sm rounded-md border border-input bg-background px-3 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      {temNivel(2) && (
                        <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0" title="Recalcular peso a partir dos itens" disabled={recalculandoPeso} onClick={recalcularPeso}>
                          {recalculandoPeso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Bloco de expedição — todos os números vêm de vw_pedido_embalagem */}
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground cursor-help">Caixas (estimativa)</p>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              Faixa calibrada em 66 expedições reais. O valor central acerta na mediana; a faixa cobre cerca de 60% dos casos. Não substitui a contagem do separador.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {emb?.caixas_min != null && emb?.caixas_max != null ? (
                          emb.caixas_min === emb.caixas_max ? (
                            <p className="text-base font-medium">{emb.caixas_min}</p>
                          ) : (
                            <>
                              <p className="text-base font-medium">{emb.caixas_min} a {emb.caixas_max}</p>
                              {emb.caixas_estimadas != null && (
                                <p className="text-[10px] text-muted-foreground leading-tight">central {emb.caixas_estimadas}</p>
                              )}
                            </>
                          )
                        ) : (
                          <p className="text-base font-medium">{emb?.caixas_estimadas ?? "—"}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cubagem expedição</p>
                        <p className="text-base font-medium">
                          {emb?.cubagem_expedicao_m3 != null ? `${fmtNum(emb.cubagem_expedicao_m3, 4)} m³` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Peso expedido (estimado)</p>
                        <p className="text-base font-medium">
                          {emb?.peso_expedido_kg != null ? `${fmtNum(emb.peso_expedido_kg, 1)} kg` : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight">produto + embalagem</p>
                      </div>
                    </div>

                    {emb && (
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        {[
                          [emb.pacotes_v ?? 0, "volumosos"] as const,
                          [emb.pacotes_p ?? 0, "planos pequenos"] as const,
                          [emb.pacotes_g ?? 0, "planos grandes"] as const,
                          [emb.pacotes_l ?? 0, "placas largas"] as const,
                        ]
                          .filter(([n]) => Number(n) > 0)
                          .map(([n, rotulo]) => `${n} ${rotulo}`)
                          .join(" · ")}
                        {emb.litros_solidos != null && emb.fator_embalagem != null && (
                          <> — {fmtNum(emb.litros_solidos, 1)} L sólidos × {fmtNum(emb.fator_embalagem, 2)}</>
                        )}
                      </p>
                    )}



                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-[10px] text-muted-foreground/80 leading-tight cursor-help">
                            Volume sólido do produto: {Number(pedido.cubagem_total) > 0 ? `${fmtNum(Number(pedido.cubagem_total), 4)} m³` : "—"}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          A transportadora não cobra por este número. A cobrança usa a cubagem de expedição (produto + embalagem).
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {(emb?.skus_sem_dimensao ?? 0) > 0 && (
                      <Badge variant="outline" className="border-warning/60 text-warning text-[10px]">
                        {emb!.skus_sem_dimensao} SKU(s) sem dimensão cadastrada — não entram na estimativa de caixas nem de peso
                      </Badge>
                    )}
                  </div>



                  {freteEst.isLoading && transportadoraId && (
                    <p className="text-xs text-muted-foreground">Calculando frete...</p>
                  )}
                  {freteEst.data && freteEst.data.erro && (
                    <p className="text-xs text-destructive">{freteEst.data.erro}</p>
                  )}
                  {freteEst.data && !freteEst.data.erro && (
                    <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Estimativa Icaro</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-medium">{freteEst.data.valor_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                        {pedido.valor_bruto > 0 && (<span className="text-xs text-muted-foreground">({((freteEst.data.valor_estimado / pedido.valor_bruto) * 100).toFixed(2)}% do bruto)</span>)}
                      </div>
                      <p className="text-xs text-muted-foreground">{emb?.peso_taxado_previsto != null && <>Peso taxado {fmtNum(emb.peso_taxado_previsto, 1)} kg · </>}Prazo {freteEst.data.prazo_dias}d · {freteEst.data.tarifa_code}</p>
                      <p className="text-[11px] text-muted-foreground">Base: R$ {freteEst.data.breakdown.base.toFixed(2)} · GRIS: R$ {freteEst.data.breakdown.gris.toFixed(2)} · Pedágio: R$ {freteEst.data.breakdown.pedagio.toFixed(2)} · TAS: R$ {freteEst.data.breakdown.tas.toFixed(2)}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/40">
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Tipo frete</label>
                      <Select value={freteTipo} onValueChange={setFreteTipo} disabled={!temNivel(2)}>
                        <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          {freteTiposAtivos.map((t) => (
                            <SelectItem key={t.codigo} value={t.codigo}>
                              {t.rotulo || t.codigo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {temNivel(2) && (
                      <div className="col-span-2 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-full"
                          onClick={() => {
                            setCompararOpen(true);
                            freteComparativo.refetch();
                          }}
                        >
                          <Scale className="h-3.5 w-3.5 mr-1.5" />
                          Comparar transportadoras
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-full"
                          disabled={!id || recotar.isPending}
                          onClick={() => id && recotar.mutate({ pedidoId: id, forcar: true })}
                        >
                          {recotar.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Recotar
                        </Button>
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor frete (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={valorFrete}
                        onChange={(e) => setValorFrete(e.target.value)}
                        placeholder="0,00"
                        disabled={!temNivel(2)}
                        className="w-full h-8 text-sm rounded-md border border-input bg-background px-3 mt-0.5 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                        Cobrado do cliente — não muda ao escolher transportadora.
                      </p>
                      {freteDivergeOriginal && (
                        <p className="text-[10px] text-warning mt-1 leading-tight font-medium">
                          Divergência: FOP trouxe {fmtBRL.format(freteOriginalFop as number)} · pedido está {fmtBRL.format(Number(pedido.valor_frete) || 0)}.
                        </p>
                      )}
                      {valorFreteCongelado && valorFreteAlterado && (
                        <p className="text-[10px] text-warning mt-1 leading-tight">
                          Há recebível emitido: o banco vai recusar esta alteração de valor. Ajuste pela tela de Cobrança.
                        </p>
                      )}
                    </div>

                  </div>

                  {temNivel(2) && (
                    <Button
                      size="sm"
                      className="h-9 w-full"
                      disabled={salvarDadosEnvio.isPending}
                      onClick={() =>
                        id && salvarDadosEnvio.mutate({
                          pedidoId: id,
                          transportadoraId: transportadoraId || null,
                          pesoBrutoTotal: parseFloat(pesoBruto) || 0,
                          freteTipo: freteTipo || null,
                          valorFrete: parseFloat(valorFrete) || 0,
                          estimativaValor: freteEst.data?.valor_estimado ?? null,
                          estimativaJson: freteEst.data ?? null,
                        })
                      }
                    >
                      {salvarDadosEnvio.isPending ? (<><Loader2 className="h-3 w-3 animate-spin mr-1" />Salvando…</>) : ("Salvar")}
                    </Button>
                  )}

                  {temNivel(2) && (
                    <CompararTransportadorasDialog
                      open={compararOpen}
                      onOpenChange={setCompararOpen}
                      isLoading={freteComparativo.isFetching}
                      data={freteComparativo.data}
                      valorAtual={parseFloat(valorFrete) || 0}
                      onEscolher={(opcao) => {
                        if (opcao.transportadora_id) setTransportadoraId(opcao.transportadora_id);
                        setCompararOpen(false);
                        toast({
                          title: `${opcao.transportadora_nome} selecionada`,
                          description: `Estimativa de custo ${(opcao.valor_estimado ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · o valor cobrado do cliente não foi alterado. Confirme em Salvar.`,
                        });
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {estagio === "entregue" && id && (
              <CardEntrega pedidoId={id} estagio={estagio} />
            )}
          </div>

          {/* ============ FAIXA 2: Detalhes · Observações ============ */}
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Card — Detalhes */}
            <Card className="border-border/60 h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  Detalhes
                </CardTitle>
              </CardHeader>
              <CardContent>
              <Tabs defaultValue={analiseCredito?.ressalva ? "credito" : "analise"} className="space-y-3">

                <TabsList>
                  <TabsTrigger value="analise">Análise IA</TabsTrigger>
                  <TabsTrigger value="credito" className="gap-1.5">
                    Crédito
                    {analiseCredito?.ressalva && (
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="timeline">Histórico</TabsTrigger>
                  <TabsTrigger value="urgencia">Urgência</TabsTrigger>
                  <TabsTrigger value="obs_sop">Obs SOPs</TabsTrigger>
                  <TabsTrigger value="canal_fop" className="gap-1.5">
                    Canal FOP
                    {(eventos ?? []).some(
                      (ev: any) => ev.tipo_evento === "msg_comercial"
                    ) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-info" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="tarefas" className="gap-1.5">
                    Tarefas
                    {tarefasAbertas > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
                </TabsList>

                <TabsContent value="analise">
                  <CardAnalisePedido pedido_id={pedido.id} status={pedido.analise_pedido_status ?? null} motivo={pedido.analise_pedido_motivo ?? null} detalhes={pedido.analise_pedido_detalhes ?? null} executada_em={pedido.analise_pedido_executada_em ?? null} />
                </TabsContent>
                <TabsContent value="credito">
                  <CreditoTab analise={analiseCredito} />
                </TabsContent>
                <TabsContent value="timeline"><PedidoTimeline eventos={eventos} /></TabsContent>
                <TabsContent value="urgencia">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Urgência</p>
                    </div>
                    <Select value={urgencia} onValueChange={(v) => setUrgencia(v as UrgenciaDeclarada)} disabled={!temNivel(3)}>
                      <SelectTrigger className="h-8 text-sm disabled:opacity-60 disabled:cursor-not-allowed"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-muted" />{URGENCIA_LABELS.normal}</span></SelectItem>
                        <SelectItem value="alta"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-warning" />{URGENCIA_LABELS.alta}</span></SelectItem>
                        <SelectItem value="critica"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-destructive" />{URGENCIA_LABELS.critica}</span></SelectItem>
                      </SelectContent>
                    </Select>
                    <textarea
                      value={obsUrgencia}
                      onChange={(e) => setObsUrgencia(e.target.value)}
                      placeholder="Justificativa opcional…"
                      rows={2}
                      disabled={!temNivel(3)}
                      className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    {temNivel(3) && (
                      <Button size="sm" variant="outline" className="w-full"
                        onClick={() => id && atualizarUrgencia.mutate({ pedidoId: id, urgencia, observacao: obsUrgencia })}
                        disabled={atualizarUrgencia.isPending}>
                        {atualizarUrgencia.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Salvando…</> : "Salvar urgência"}
                      </Button>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="obs_sop">
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Observações SOPs (internas)</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Notas internas de SOP. Ao salvar, fica registrado na linha do tempo do pedido com autor e data.
                    </p>
                    <textarea
                      value={obsSop}
                      onChange={(e) => setObsSop(e.target.value)}
                      placeholder="Ex.: cliente exige NF antes do envio; conferir lote XYZ; SOP de embalagem dupla…"
                      rows={4}
                      disabled={!temNivel(2)}
                      className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    {temNivel(2) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={!obsSop.trim() || registrarEvento.isPending}
                        onClick={async () => {
                          if (!id || !obsSop.trim()) return;
                          await registrarEvento.mutateAsync({
                            pedido_id: id,
                            tipo_evento: "anotacao",
                            descricao: `[SOP] ${obsSop.trim()}`,
                            metadata: { categoria: "sop" },
                          });
                          setObsSop("");
                        }}
                      >
                        {registrarEvento.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Salvando…</> : "Registrar na timeline"}
                      </Button>
                    )}

                    {(() => {
                      const sopEventos = (eventos || []).filter((ev: any) =>
                        ev.tipo_evento === "anotacao" &&
                        (ev?.metadata?.categoria === "sop" || (typeof ev.descricao === "string" && ev.descricao.startsWith("[SOP]")))
                      );
                      if (sopEventos.length === 0) {
                        return (
                          <p className="text-[11px] text-muted-foreground italic pt-2 border-t">
                            Nenhuma observação SOP registrada ainda.
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-2 pt-2 border-t">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Histórico SOP ({sopEventos.length})
                          </p>
                          <ul className="space-y-2">
                            {sopEventos.map((ev: any) => (
                              <li key={ev.id} className="text-xs rounded-md border border-border bg-muted/40 px-2.5 py-2">
                                <p className="whitespace-pre-wrap">{String(ev.descricao || "").replace(/^\[SOP\]\s*/, "")}</p>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {new Date(ev.criado_em).toLocaleString("pt-BR")}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                  </TabsContent>
                  <TabsContent value="canal_fop">
                    <CanalFopTab pedidoId={pedido.id} eventos={eventos ?? []} />
                  </TabsContent>
                  <TabsContent value="tarefas">
                  <PedidoTarefasVinculadasTab pedidoId={pedido.id} />
                </TabsContent>
                <TabsContent value="parcelas">
                  <div className="space-y-3">
                    <PlanoRecebimentoCard pedidoId={pedido.id} compacto />
                    {!titulosData || titulosData.length === 0 ? (
                      !familiaCarregando && !familiaErro && familiaRecebivel?.recebivel_na_familia === true ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          Coberto pelo recebível da mãe {familiaRecebivel?.familia_mae_externo ?? "—"} — não cobrar aqui
                        </p>
                      ) : (
                        <SituacaoFinanceiraBloco pedidoId={pedido.id} compacto />
                      )
                    ) : (
                      <div className="space-y-2">
                        {titulosData.map((t: TituloAReceber) => (
                          <div key={t.id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs">{t.numero_parcela}/{t.total_parcelas}</span>
                                {t.eh_entrada && <Badge variant="outline" className="text-[9px] h-4 px-1 border-success/40 text-success">entrada</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">{TIPO_LABEL[t.tipo_pagamento]} · {fmtDate(t.data_vencimento_atual)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium">{fmtBRL.format(Number(t.valor_atual || 0))}</p>
                              <BadgeEstadoParcela titulo={t} eixos={eixosTitulos} dim={dimEixosTitulos} compacto />
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm pt-1">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-medium">{fmtBRL.format(titulosData.reduce((acc: number, t: TituloAReceber) => acc + Number(t.valor_atual || 0), 0))}</span>
                        </div>
                      </div>
                    )}
                    <EstadoInstrumentoCobranca pedidoId={pedido.id} />
                  </div>
                </TabsContent>
              </Tabs>
              </CardContent>
            </Card>

            {/* Card — Observações */}
            <Card className="border-border/60 h-full flex flex-col">
              <CardHeader className="pb-3 shrink-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  Observações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col">
                <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Do cliente</p>
                  <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                    {(pedido as any).observacao_cliente?.trim() || <span className="text-muted-foreground italic">Sem observação.</span>}
                  </p>
                </div>
                <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Fetély (interna)</p>
                  <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                    {pedido.observacao_pedido?.trim() || <span className="text-muted-foreground italic">Sem observação.</span>}
                  </p>
                </div>
              </CardContent>
            </Card>

          </div>






          {/* ============ FAIXA 4: Itens do pedido (largura cheia) ============ */}
          <div className="grid gap-4 lg:grid-cols-2 items-stretch">
            {(() => {
              const snap = (pedido as any).snapshot_original as {
                valor_bruto: number;
                valor_liquido: number;
                valor_frete: number;
                frete_tipo: string | null;
                desconto_celebra_valor: number;
                bonus_pix_valor: number;
                itens_json: Array<{
                  sku: string;
                  quantidade: number;
                  preco_unitario: number;
                  subtotal: number;
                  produto?: { nomeComercial?: string };
                }> | null;
                gravado_em: string;
                backfill?: boolean;
              } | null;

              if (!snap) return null;

              const snapBruto      = snap.valor_bruto || 0;
              const snapLiquido    = snap.valor_liquido || 0;
              const snapFrete      = Number(snap.valor_frete) || 0;
              const snapCelebra    = Number(snap.desconto_celebra_valor) || 0;
              const snapPix        = Number(snap.bonus_pix_valor) || 0;
              const snapAjusteSimples    = snapBruto + snapFrete - snapLiquido;
              const snapDescontoSimples  = Math.max(0, snapAjusteSimples);
              const snapAcrescimoSimples = Math.max(0, -snapAjusteSimples);
              const snapTemBreakdown   = snapCelebra > 0.01 || snapPix > 0.01;
              const deltaLiquido        = pedido.valor_liquido - snapLiquido;
              const hasDelta            = Math.abs(deltaLiquido) > 0.01;

              return (
                <Card className="border-warning/70 flex-1 flex flex-col bg-warning/10 lg:order-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <History className="h-4 w-4 text-warning" />
                      Como chegou do FOP
                      {snap.backfill && (
                        <Badge variant="secondary" className="ml-1 text-[10px] font-normal h-5 px-1.5">via backfill</Badge>
                      )}
                      {/* Mantido em super_admin de propósito: corrige o dado de ORIGEM vindo do FOP, é manutenção, não operação. */}
                      {isSuperAdmin && (snap as any)?.backfill === true && pedido.recebido_via === 'api' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                          onClick={handleCorrigirSnapshot}
                          disabled={corrigindoSnapshot}
                        >
                          {corrigindoSnapshot ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          {corrigindoSnapshot ? "Corrigindo..." : "Corrigir snapshot"}
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Valor bruto</span>
                        <span>{fmtBRL.format(snapBruto)}</span>
                      </div>
                      {snapTemBreakdown ? (
                        <>
                          {snapCelebra > 0.01 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Desconto ({((snapCelebra / snapBruto) * 100).toFixed(2)}%)</span>
                              <span className="text-destructive">−{fmtBRL.format(snapCelebra)}</span>
                            </div>
                          )}
                          {snapPix > 0.01 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Desconto PIX ({((snapCelebra > 0.01 ? snapPix / (snapBruto - snapCelebra) : snapPix / snapBruto) * 100).toFixed(2)}%)</span>
                              <span className="text-destructive">−{fmtBRL.format(snapPix)}</span>
                            </div>
                          )}
                        </>
                      ) : snapDescontoSimples > 0.01 ? (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Desconto ({((snapDescontoSimples / snapBruto) * 100).toFixed(2)}%)</span>
                          <span className="text-destructive">−{fmtBRL.format(snapDescontoSimples)}</span>
                        </div>
                      ) : snapAcrescimoSimples > 0.01 ? (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Acréscimo ({((snapAcrescimoSimples / snapBruto) * 100).toFixed(2)}%)</span>
                          <span>+{fmtBRL.format(snapAcrescimoSimples)}</span>
                        </div>
                      ) : null}
                  {(snapFrete > 0.01 || snap.frete_tipo) && (() => {
                    const freteExibir = snapFrete > 0.01 ? snapFrete : (Number(pedido.valor_frete) || 0);
                    return (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Frete{snap.frete_tipo ? ` (${snap.frete_tipo})` : ""}</span>
                        <span>{freteExibir > 0.01 ? `+${fmtBRL.format(freteExibir)}` : "—"}</span>
                      </div>
                    );
                  })()}
                      <div className="border-t border-border/60 pt-2">
                        <div className="flex justify-between text-sm font-medium">
                          <span>Valor líquido</span>
                          <span>{fmtBRL.format(snapLiquido)}</span>
                        </div>
                      </div>
                      {hasDelta && (
                        <div className={`flex justify-between text-xs pt-1 ${deltaLiquido < 0 ? "text-success" : "text-destructive"}`}>
                          <span>Δ vs original</span>
                          <span>{deltaLiquido > 0 ? "+" : ""}{fmtBRL.format(deltaLiquido)}</span>
                        </div>
                      )}
                      {!hasDelta && (
                        <div className="flex justify-between text-xs pt-1 text-muted-foreground">
                          <span>Δ vs original</span>
                          <span>Sem alteração</span>
                        </div>
                      )}
                    </div>

                {temOrigemConsolidada && (
                  <div className="mt-3 rounded-md border border-warning/60 bg-warning/10 p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-warning font-medium">
                      Segunda origem — consolidado de outro pedido
                    </div>
                    {origens.map((o) => (
                      <div key={o.origem_pedido_id} className="text-xs space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            className="font-medium hover:underline text-left"
                            onClick={() => navigate(`/pedidos/${o.origem_pedido_id}`)}
                          >
                            {o.origem_id_externo}
                          </button>
                          <span className="text-muted-foreground">
                            {o.itens} {o.itens === 1 ? "item" : "itens"} · {fmtBRL.format(Number(o.valor_bruto_itens) || 0)}
                          </span>
                        </div>
                        {o.origem_venda_id_externo && (
                          <div className="text-muted-foreground">
                            Remessa da venda {o.origem_venda_id_externo} — o snapshot do FOP dessas linhas vive no pedido de origem, não aqui.
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="text-[10px] text-muted-foreground leading-tight border-t border-warning/40 pt-1.5">
                      Os itens acima não constam na lista de itens originais abaixo: eles chegaram por consolidação, não pelo FOP deste pedido.
                    </div>
                  </div>
                )}



                    {snap.itens_json && snap.itens_json.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border/60">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                          Itens originais ({snap.itens_json.length})
                        </div>
                        <div className="space-y-1">
                          {snap.itens_json.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate">{item.produto?.nomeComercial ?? item.sku}</span>
                                <span className="text-muted-foreground shrink-0">×{item.quantidade}</span>
                              </div>
                              <span className="shrink-0 tabular-nums">
                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.subtotal ?? (item as any).subtotal_bruto ?? (item.quantidade * (item.preco_unitario ?? (item as any).valor_unitario ?? 0)))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isSuperAdmin && (
                      <div className="mt-4 pt-4 border-t border-border/60">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setConfirmRestaurar(true)}
                          disabled={restaurandoSnapshot || temOrigemConsolidada}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restaurar original
                        </Button>
                        {temOrigemConsolidada && (
                          <p className="text-[10px] text-warning mt-1 leading-tight">
                            Restauração bloqueada: este pedido absorveu {origens.map((o) => o.origem_id_externo).join(", ")} por consolidação. Restaurar apagaria os itens vindos de fora, que não existem em nenhum snapshot.
                          </p>
                        )}
                      </div>
                    )}

                  </CardContent>
                </Card>
              );
            })()}

            <AlertDialog open={confirmRestaurar} onOpenChange={setConfirmRestaurar}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {pedido?.split_de_pedido_id ? "Restaurar pedido pai ao original?" : splitsAtivos && splitsAtivos.length > 0 ? "Dissolver splits e restaurar ao original?" : "Restaurar pedido ao original?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      {splitsAtivos && splitsAtivos.length > 0 ? (
                        <>
                          <p className="text-sm">
                            Este pedido possui <strong>{splitsAtivos.length}</strong> split(s) ativo(s) que serão <strong className="text-destructive">cancelados</strong>:
                          </p>
                          <ul className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1">
                            {splitsAtivos.map((s) => (
                              <li key={s.id} className="text-xs font-mono text-destructive">
                                {s.id_externo} — {s.estagio.replace(/_/g, " ")}
                              </li>
                            ))}
                          </ul>
                          <p className="text-sm">
                            Após a dissolução, os <strong>{(pedido as any).snapshot_original?.itens_json?.length ?? 0}</strong> itens originais do FOP serão restaurados no pedido principal.
                          </p>
                        </>
                      ) : (
                        <>
                          {pedido?.split_de_pedido_id && (
                            <p className="text-sm text-warning font-medium">
                              Este pedido é um split. A restauração será aplicada no pedido pai e todos os splits serão cancelados.
                            </p>
                          )}
                          <p className="text-sm">
                            Os <strong>{(pedido as any).snapshot_original?.itens_json?.length ?? 0}</strong> itens originais do FOP serão restaurados. Valores financeiros serão restaurados apenas se não houver título a receber emitido.
                          </p>
                        </>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Esta ação é irreversível. Os splits cancelados não podem ser reativados.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={restaurandoSnapshot}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => { e.preventDefault(); handleRestaurarSnapshot(); }}
                    disabled={restaurandoSnapshot}
                    className={splitsAtivos && splitsAtivos.length > 0 ? "bg-destructive hover:bg-destructive/90" : ""}
                  >
                    {restaurandoSnapshot ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restaurando...</>
                    ) : splitsAtivos && splitsAtivos.length > 0 ? (
                      "Dissolver splits e restaurar"
                    ) : (
                      "Confirmar restauração"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Card className="border-border/60 lg:order-1">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Itens do pedido
                    <span className="text-xs font-normal text-muted-foreground">{itens.length} {itens.length === 1 ? "item" : "itens"}</span>
                  </CardTitle>
                  {temNivel(2) && (
                    <EditarItensDialog
                      pedidoId={pedido.id}
                      estagioAtual={estagio}
                      itensAtuais={itens.map((i: any) => ({
                        sku: i.sku,
                        descricao: i.descricao,
                        quantidade: i.quantidade,
                        valor_unitario: i.valor_unitario,
                      }))}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ListaItensComEstoque itens={itens} pedidoId={pedido.id} estagio={estagio} />
              </CardContent>
            </Card>
          </div>




          {estagioFinal && (
            <div className={cn("rounded-lg border p-4 text-sm", pedido.estagio === "cancelado" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-success")}>
              <p className="font-medium">{pedido.estagio === "cancelado" ? "Pedido cancelado" : "Pedido entregue"}{pedido.cancelado_motivo && ` · ${pedido.cancelado_motivo}`}</p>
              <p className="text-xs opacity-70 mt-0.5">{pedido.cancelado_em ? fmtDateTime(pedido.cancelado_em) : fmtDateTime(pedido.entregue_em)}</p>
            </div>
          )}
        </div>

        {(estagio === "entregue" || !estagioFinal) && (
          <aside className="order-first lg:order-none px-6 py-5 lg:w-72 lg:shrink-0 lg:pl-5 lg:border-l lg:border-border/60 lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-3">
              {/* CONTRATO DE NÍVEL: 1 vê · 2 edita · 3 aprova · 4 apaga · 5 lê sensível · 6 tudo. Ato excepcional (cancelar, forçar, declarar por terceiro) usa AÇÃO NOMEADA, não nível. */}
              {!estagioFinal && (
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ações</p>
              )}
              {temNivel(2) && <BotaoEditarPedido pedido={pedido} itens={itens} />}
              <div className="border-t border-border/40" />
              {!estagioFinal && (
                <AcaoPrimaria pedido={pedido} parceiro={parceiro} estagio={estagio} geraTituloReceber={geraTituloReceber} />
              )}
              {!estagioFinal && (
                <AcoesRemessa
                  pedido_id={pedido.id}
                  parceiro_id={pedido.parceiro_id}
                  id_externo={pedido.id_externo}
                  estagio={estagio ?? ""}
                  bling_id_destino={pedido.bling_id_destino}
                />
              )}
              {!estagioFinal && estagio === "aguardando_estoque" && (
                <EnviarParaSeparacaoAcao pedidoId={pedido.id} />
              )}
              {!estagioFinal && estagio !== "aguardando_estoque" && transicoesPara(estagio).includes("pre_separacao") && (
                <AcaoDescerPreSeparacao pedido={pedido} estagio={estagio} />
              )}
              {!estagioFinal && (
                <BotaoSplitPedidoInline pedido={pedido} estagio={estagio} />
              )}


              {estagio === "pre_separacao" && (
                <BotaoReterEstoque pedido={pedido} />
              )}
              {estagio !== "cancelado" && estagio !== "em_analise_credito" && (
                <ComunicacaoPedidoPanel
                  pedido_id={pedido.id}
                  parceiro_id={pedido.parceiro_id}
                  estagio={estagio}
                  exige_portao={!!portaoRegra?.exige_portao_regra}
                  gera_titulo_receber={geraTituloReceber}
                />
              )}
              {temNivel(2) && <ExportarPedidoDialog pedidoId={pedido.id} />}

              {geraTituloReceber ? (
                <LinkPagamentoCard pedido={pedido} titulos={titulosData ?? []} />
              ) : (
                <p className="text-xs text-muted-foreground italic px-1">
                  Natureza de operação sem cobrança{natureza?.nome ? ` · ${natureza.nome}` : ""}.
                </p>
              )}
              {!estagioFinal && !(pedido as any).atencao_nivel && temNivel(2) && (
                <AtencaoPedidoDialog pedidoId={pedido.id}>
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <PauseCircle className="h-4 w-4" />
                    Pausar / Avisar
                  </Button>
                </AtencaoPedidoDialog>
              )}
              {estagio === "recuperacao_venda" && (
                <BotaoRetomarOportunidade pedido={pedido} />
              )}
              {!estagioFinal && (
                <BotaoMigrarComercial pedido={pedido} />
              )}
              {!estagioFinal && temNivel(4) && (
                <div className="pt-3 mt-1 border-t border-border/40">
                  <CancelarPedidoDialog
                    pedido_id={pedido.id}
                    id_externo={pedido.id_externo}
                    estagio={estagio}
                    cliente_nome={parceiro?.razao_social}
                  />
                </div>
              )}
              {estagio !== "cancelado" && (
                <VinculosSection
                  pedido_id={pedido.id}
                  id_externo={pedido.id_externo}
                  split_de_pedido_id={(pedido as any).split_de_pedido_id ?? null}
                  consolidado_em_pedido_id={(pedido as any).consolidado_em_pedido_id ?? null}
                  pedido_origem_id={pedido.pedido_origem_id ?? null}
                  acoesBling={(() => {
                    // Ação de exceção: só gerente+ (nível 4), só antes de faturar, e só se houver vínculo vivo.
                    if (!temNivel(4)) return null;
                    if (!["pre_separacao", "em_separacao"].includes(estagio)) return null;
                    const remessas = (remessasData ?? []) as any[];
                    if ((pedido as any).nf_numero) return null;
                    if (remessas.some((r) => r.nf_numero)) return null;
                    const vinculoVivo =
                      !!(pedido as any).bling_enviado_em ||
                      remessas.some(
                        (r) =>
                          r.status !== "cancelada" &&
                          (r.status === "enviada_bling" || r.bling_pedido_id != null)
                      );
                    if (!vinculoVivo) return null;
                    return (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-1.5 h-auto py-1.5 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => setDesvincularBlingOpen(true)}
                        >
                          <Link2Off className="h-3.5 w-3.5 shrink-0" />
                          Desvincular do Bling
                        </Button>
                        <DesvincularBlingDialog
                          open={desvincularBlingOpen}
                          onOpenChange={setDesvincularBlingOpen}
                          pedidoId={pedido.id}
                          idExterno={pedido.id_externo}
                          blingId={(pedido as any).bling_id_destino ?? null}
                        />
                      </>
                    );
                  })()}
                  acoesExtra={
                    !estagioFinal && isSuperAdmin ? (
                      <BotaoConsolidarPedido
                        pedido={pedido}
                        qtdTitulosAtivos={(titulosData ?? []).filter(
                          (t: any) => !["cancelado", "cancelado_recuperacao"].includes(t.status)
                        ).length}
                      />
                    ) : null
                  }
                />

              )}


            </div>
          </aside>
        )}
      </div>

      {pedido && temNivel(3) && (
        <AplicarHaverPedidoDialog
          open={aplicarHaverOpen}
          onOpenChange={setAplicarHaverOpen}
          pedidoId={pedido.id}
          idExterno={pedido.id_externo}
          valorLiquido={Number(pedido.valor_liquido ?? 0)}
          parceiroId={pedido.parceiro_id}
        />
      )}
    </div>
  );
}

