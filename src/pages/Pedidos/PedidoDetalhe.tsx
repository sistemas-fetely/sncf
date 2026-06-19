import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { AplicarHaverPedidoDialog } from "@/components/credito/AplicarHaverPedidoDialog";

import { usePedidoDetalhe } from "@/hooks/pedidos/usePedidoDetalhe";
import { supabase } from "@/integrations/supabase/client";
import { usePedidoTitulos } from "@/hooks/pedidos/usePedidoTitulos";
import { usePedidoPriorizado } from "@/hooks/pedidos/useFilaPedidosPriorizada";
import { useAtualizarUrgencia } from "@/hooks/pedidos/useAtualizarUrgencia";
import { useRegistrarEventoPedido } from "@/hooks/pedidos/useRegistrarEventoPedido";

import { isEstagioFinal } from "@/lib/pedidoTransicoes";
import { isSkuDestaque } from "@/lib/pedidoDestaque";
import { cn } from "@/lib/utils";
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
import { PedidoTarefasTab } from "@/components/pedidos/PedidoTarefasTab";
import { BadgePriorizacao } from "@/components/pedidos/BadgePriorizacao";
import { EstagioBadge, FormatoIdade } from "@/components/pedidos/BadgesPedido";
import { CardAnalisePedido } from "@/components/pedidos/CardAnalisePedido";
import { BadgesContextuais } from "@/components/credito/BadgesContextuais";
import { EditarProgramaInline } from "@/components/credito/EditarProgramaInline";
import { TriarPedidoDialog } from "@/components/pedidos/dialogs/TriarPedidoDialog";
import { CancelarPedidoDialog } from "@/components/pedidos/dialogs/CancelarPedidoDialog";
import { AnotarPedidoDialog } from "@/components/pedidos/dialogs/AnotarPedidoDialog";
import { EditarItensDialog } from "@/components/pedidos/dialogs/EditarItensDialog";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import { ConfirmarPortaoPagoDialog } from "@/components/pedidos/dialogs/ConfirmarPortaoPagoDialog";
import { usePedidoPortaoProvisorio } from "@/hooks/pedidos/usePedidoPortaoProvisorio";
import { SplitsPedidoSection } from "@/components/pedidos/SplitsPedidoSection";
import { SplitPedidoDialog } from "@/components/pedidos/dialogs/SplitPedidoDialog";

import { ComplementarSection } from "@/components/pedidos/ComplementarSection";
import { RemessasSection } from "@/components/pedidos/RemessasSection";
import { ReverterParaCobrancaDialog } from "@/components/pedidos/dialogs/ReverterParaCobrancaDialog";

import { usePermissoesDoUsuario } from "@/hooks/usePermissoesDoUsuario";
import { useAuth } from "@/contexts/AuthContext";


import { AREA_LABELS, STATUS_TITULO_LABELS, URGENCIA_LABELS } from "@/types/pedido";
import type { AreaPedido, EstagioPedido, StatusTitulo, TipoTituloPagamento, TituloAReceber, UrgenciaDeclarada } from "@/types/pedido";
import { ArrowLeft, AlertCircle, ExternalLink, Receipt, Loader2, Sparkles, Clock, CheckCircle2, ArrowRight, Package, Copy, Truck, RefreshCw, Scissors, Mail, MailCheck, ShieldAlert, MessageCircle, Link2, Wallet, PauseCircle, Bell, XCircle, History } from "lucide-react";
import { AtencaoPedidoDialog } from "@/components/pedidos/dialogs/AtencaoPedidoDialog";
import { useLimparAtencao } from "@/hooks/pedidos/useAtencaoPedido";
import { toast } from "@/hooks/use-toast";
import { useTransportadoras } from "@/hooks/pedidos/useTransportadoras";
import { useSalvarDadosEnvio } from "@/hooks/pedidos/useSalvarDadosEnvio";
import { useFreteEstimado } from "@/hooks/transportadoras/useFreteEstimado";
import { useEnviarEmailPedidoCobranca } from "@/hooks/pedidos/useEnviarEmailPedidoCobranca";
import { EnviarEmailCobrancaDialog } from "@/components/pedidos/dialogs/EnviarEmailCobrancaDialog";
import { EnviarEmailNfDialog } from "@/components/pedidos/dialogs/EnviarEmailNfDialog";
import { EnviarEmailNfBoletosDialog } from "@/components/pedidos/dialogs/EnviarEmailNfBoletosDialog";
import { useBoletosDoPedido } from "@/hooks/pedidos/useBoletosDoPedido";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) => s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (s: string | null | undefined) => s ? new Date(s).toLocaleString("pt-BR") : "—";

const TIPO_LABEL: Record<TipoTituloPagamento, string> = { boleto: "Boleto", pix: "PIX", cartao: "Cartão", troca_mercadoria: "Troca" };
const STATUS_CORES: Record<StatusTitulo, string> = {
  aguardando_pagamento: "bg-amber-500 text-white border-0", aguardando_envio_bling: "bg-sky-500 text-white border-0",
  aguardando_emissao_nf: "bg-sky-600 text-white border-0", vigente: "bg-blue-500 text-white border-0",
  vigente_parcial: "bg-blue-400 text-white border-0", pago: "bg-emerald-500 text-white border-0",
  pago_com_atraso: "bg-emerald-600 text-white border-0", pago_judicial: "bg-emerald-700 text-white border-0",
  vencido: "bg-red-500 text-white border-0", vencido_suspenso: "bg-red-600 text-white border-0",
  em_juridico: "bg-red-700 text-white border-0", renegociado: "bg-purple-500 text-white border-0",
  baixado_por_perda: "bg-muted text-muted-foreground border-0", cancelado: "bg-muted text-muted-foreground border-0",
  cancelado_recuperacao: "bg-muted text-muted-foreground border-0",
};

function Linha({ label, value, destaque }: { label: string; value?: string | number | null; destaque?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right", destaque && "font-semibold")}>{value ?? "—"}</span>
    </div>
  );
}

function ParcelasTab({ pedidoId }: { pedidoId: string }) {
  const { data: titulos, isLoading } = usePedidoTitulos(pedidoId);
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!titulos || titulos.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground space-y-2">
        <Receipt className="h-8 w-8 mx-auto opacity-30" />
        <p className="text-sm">Nenhum título gerado ainda.</p>
        <p className="text-xs">Títulos nascem ao chegar em Pré-Faturado.</p>
      </div>
    );
  }
  const total = titulos.reduce((acc, t) => acc + Number(t.valor_atual || 0), 0);
  return (
    <div className="space-y-3">
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
                <TableCell>{t.eh_entrada ? <Badge variant="outline" className="border-emerald-500 text-emerald-700">Entrada</Badge> : <Badge variant="outline">Parcela</Badge>}</TableCell>
                <TableCell className="text-sm">{fmtDate(t.data_vencimento_atual)}</TableCell>
                <TableCell className="font-semibold">{fmtBRL.format(Number(t.valor_atual || 0))}</TableCell>
                <TableCell className="text-sm">{TIPO_LABEL[t.tipo_pagamento]}</TableCell>
                <TableCell><Badge className={cn(STATUS_CORES[t.status])}>{STATUS_TITULO_LABELS[t.status]}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end text-sm gap-2">
        <span className="text-muted-foreground">Total:</span>
        <span className="font-bold">{fmtBRL.format(total)}</span>
      </div>
    </div>
  );
}

function AcoesPedidoPreFaturado({ pedido, parceiro }: { pedido: any; parceiro: any }) {
  const [reverterOpen, setReverterOpen] = useState(false);
  return (
    <div className="space-y-2">
      <BotaoSplitPedidoInline pedido={pedido} />
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
        estagio="pre_faturado"
      />
    </div>
  );
}

function BotaoEmailCobrancaPedido({ pedido_id, parceiro_id }: { pedido_id: string; parceiro_id: string }) {
  const [open, setOpen] = useState(false);
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
  const enviado = pedido.nf_email_enviado_em as string | null | undefined;

  if (enviado) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-emerald-600 border-emerald-200 hover:text-emerald-700"
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
  const { data: boletosInfo, isLoading } = useBoletosDoPedido(pedido.id);
  const enviado = pedido.nf_email_enviado_em as string | null | undefined;

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
                className="w-full gap-1.5 text-emerald-600 border-emerald-200 hover:text-emerald-700 disabled:opacity-60"
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

  const irParaCobranca = () => navigate(`/recebimento/cobranca/${pedido.id}`);

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
        <Button size="sm" variant="outline" className="flex-1 h-7 gap-1 text-xs text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800" onClick={handleWhatsApp}>
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

function BotaoSplitPedidoInline({ pedido }: { pedido: any }) {
  const { data: permissoes } = usePermissoesDoUsuario();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const podeSplit = isSuperAdmin || (permissoes?.has("operacao.split_pedido") ?? false);
  const [splitOpen, setSplitOpen] = useState(false);

  if (!podeSplit) return null;

  return (
    <>
      <Button variant="outline" className="w-full gap-2" onClick={() => setSplitOpen(true)}>
        <Scissors className="h-4 w-4" />Split
      </Button>
      <SplitPedidoDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        pedido_id={pedido.id}
        id_externo={pedido.id_externo}
        valor_liquido={pedido.valor_liquido}
        valor_bruto={pedido.valor_bruto}
      />
    </>
  );
}

function AcoesPedidoCobranca({ pedido, parceiro }: { pedido: any; parceiro: any }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-2 w-full">
      <Button className="w-full gap-2" onClick={() => navigate(`/recebimento/cobranca/${pedido.id}`)}>
        <Package className="h-4 w-4" />Operacionar cobrança
      </Button>
      <BotaoSplitPedidoInline pedido={pedido} />
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

function AcaoPrimaria({ pedido, parceiro, estagio }: { pedido: any; parceiro: any; estagio: EstagioPedido }) {
  const navigate = useNavigate();
  if (estagio === "recebido") return (
    <TriarPedidoDialog pedido_id={pedido.id} perfil_credito={parceiro?.perfil_credito} estagio_atual={estagio} forma_solicitada={pedido.forma_solicitada} triggerLabel="Encaminhar pedido" triggerVariant="default" />
  );
  if (estagio === "cobranca") return (
    <AcoesPedidoCobranca pedido={pedido} parceiro={parceiro} />
  );
  if (estagio === "aguardando_pagamento") return (
    <AcoesAguardandoPagamento pedido={pedido} />
  );
  if (estagio === "pre_faturado" && !pedido.bling_id_destino) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <AcoesPedidoPreFaturado pedido={pedido} parceiro={parceiro} />
        <BotaoEmailCobrancaPedido pedido_id={pedido.id} parceiro_id={pedido.parceiro_id} />
      </div>
    );
  }
  if (estagio === "faturado") return (
    <AcoesPedidoFaturado pedido={pedido} />
  );
  if (estagio === "em_analise_credito") return (
    <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-700 dark:text-blue-300 flex gap-2">
      <Clock className="h-4 w-4 mt-0.5 shrink-0" /><span>Em análise de crédito — aguardando decisão.</span>
    </div>
  );
  return null;
}

function AcoesAguardandoPagamento({ pedido }: { pedido: any }) {
  const { data: temPortaoProvisorio, isLoading } = usePedidoPortaoProvisorio(pedido.id);
  return (
    <div className="flex flex-col gap-2 w-full">
      {!isLoading && temPortaoProvisorio ? (
        <ConfirmarPortaoPagoDialog pedido_id={pedido.id} />
      ) : (
        <ConfirmarPagamentoDialog pedido_id={pedido.id} valor_pedido={pedido.valor_liquido} />
      )}
      <BotaoEmailCobrancaPedido pedido_id={pedido.id} parceiro_id={pedido.parceiro_id} />
      <BotaoSplitPedidoInline pedido={pedido} />
    </div>
  );
}



export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data, isLoading } = usePedidoDetalhe(id);
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
  const [valorFrete, setValorFrete] = useState("");
  const camposEnvioPedidoIdRef = useRef<string | null>(null);
  const transportadoras = useTransportadoras();
  const salvarDadosEnvio = useSalvarDadosEnvio();
  const { data: titulosData } = usePedidoTitulos(id);
  const [aplicarHaverOpen, setAplicarHaverOpen] = useState(false);

  const parceiroIdAtual = data?.pedido?.parceiro_id as string | undefined;
  const { data: haveresDisponiveisData } = useQuery({
    queryKey: ["haver-disponivel", parceiroIdAtual],
    enabled: !!parceiroIdAtual,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("haver_cliente")
        .select("id, saldo")
        .eq("parceiro_id", parceiroIdAtual)
        .eq("status", "disponivel")
        .gt("saldo", 0);
      return data ?? [];
    },
  });
  const totalHaverDisponivel = (haveresDisponiveisData ?? []).reduce(
    (s: number, h: any) => s + Number(h.saldo), 0
  );

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
        queryClient.invalidateQueries({ queryKey: ["pedido-detalhe", id] });
      }
    } finally {
      setRecalculandoPeso(false);
    }
  };

  const pesoBrutoNum = parseFloat(pesoBruto) || Number(data?.pedido?.peso_bruto_total) || 0;
  const cubagemTotal = Number(data?.pedido?.cubagem_total) || 0;
  const pesoCobradoEst = cubagemTotal > 0 ? Math.max(pesoBrutoNum, cubagemTotal * 300) : pesoBrutoNum;
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

  useEffect(() => {
    const pedidoAtual = data?.pedido;
    if (!pedidoAtual) return;
    if (camposEnvioPedidoIdRef.current === pedidoAtual.id) return;

    camposEnvioPedidoIdRef.current = pedidoAtual.id;
    setTransportadoraId(pedidoAtual.transportadora_id ?? "");
    setPesoBruto(String(pedidoAtual.peso_bruto_total ?? ""));
    setFreteTipo(pedidoAtual.frete_tipo ?? "");
    setValorFrete(String(pedidoAtual.valor_frete ?? ""));
  }, [data?.pedido?.id]);

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!data) return <div className="p-6">Pedido não encontrado.</div>;

  const { pedido, parceiro, itens, eventos, analiseCredito, analisesAnteriores, idade_minutos, sla_estourado } = data;
  const estagio = pedido.estagio as EstagioPedido;
  const estagioFinal = isEstagioFinal(estagio);

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
          <h1 className="text-xl font-bold truncate">{parceiro?.razao_social || pedido.cliente_nome_snapshot || "Cliente"}</h1>
          <p className="text-xs text-muted-foreground font-mono">CNPJ {parceiro?.cnpj} · Pedido {pedido.id_externo}</p>
          {parceiro?.email && (
            <a href={`mailto:${parceiro.email}`} className="text-xs text-primary hover:underline truncate block">
              {parceiro.email}
            </a>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <EstagioBadge estagio={estagio} />
            {priorizado && <BadgePriorizacao score={priorizado.score_total} breakdown={priorizado.score_breakdown} compact />}
            <span className="text-xs text-muted-foreground"><FormatoIdade minutos={idade_minutos} /></span>
            {sla_estourado && <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" />SLA estourado</Badge>}
          </div>
          {!estagioFinal && pedido.proxima_acao && (
            <p className="text-sm text-muted-foreground italic pt-1.5">
              <span className="text-[10px] uppercase tracking-widest not-italic mr-1.5">Próxima ação:</span>
              {pedido.proxima_acao}
            </p>
          )}
        </div>
      </div>

      {/* Banner atenção — pausa (vermelho) ou aviso (âmbar) */}
      {(pedido as any).atencao_nivel && (
        <div className={cn(
          "mx-6 mb-3 flex items-start gap-3 rounded-lg border p-3",
          (pedido as any).atencao_nivel === 'pausa'
            ? "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/30 dark:border-red-800 dark:text-red-200"
            : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200"
        )}>
          {(pedido as any).atencao_nivel === 'pausa'
            ? <PauseCircle className="h-5 w-5 mt-0.5 shrink-0" />
            : <Bell className="h-5 w-5 mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide">
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

      <Separator />

      <div className="flex flex-col lg:flex-row lg:items-start">

        {/* COLUNA ESQUERDA */}
        <div className="flex-1 min-w-0 px-6 py-5 space-y-6">

          {analiseCredito?.status_final && analiseCredito.status_final !== "aprovado" && (
            <Alert className={cn(
              analiseCredito.status_final === "reprovado"
                ? "border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800"
                : "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
            )}>
              <ShieldAlert className={cn(
                "h-4 w-4",
                analiseCredito.status_final === "reprovado" ? "text-red-600" : "text-amber-600"
              )} />
              <AlertDescription className={cn(
                analiseCredito.status_final === "reprovado"
                  ? "text-red-900 dark:text-red-200"
                  : "text-amber-900 dark:text-amber-200"
              )}>
                <p className="font-semibold mb-0.5">
                  {analiseCredito.status_final === "reprovado"
                    ? "Crédito reprovado"
                    : "Crédito aprovado com ressalva"}
                </p>
                <p className="text-sm">{analiseCredito.ressalva || "Consulte a aba Crédito para detalhes."}</p>
              </AlertDescription>
            </Alert>
          )}

          {estagio === "recebido" && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Revisar e encaminhar</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><p className="text-muted-foreground uppercase tracking-wide mb-0.5">Perfil</p><p className="font-semibold capitalize">{parceiro?.perfil_credito ? String(parceiro.perfil_credito).split("_").join(" ") : "—"}</p></div>
                <div><p className="text-muted-foreground uppercase tracking-wide mb-0.5">Valor</p><p className="font-semibold">{fmtBRL.format(pedido.valor_liquido || 0)}</p></div>
                <div><p className="text-muted-foreground uppercase tracking-wide mb-0.5">Condição</p><p className="font-semibold">{pedido.condicao_solicitada}</p></div>
                <div><p className="text-muted-foreground uppercase tracking-wide mb-0.5">Forma</p><p className="font-semibold">{pedido.forma_solicitada}</p></div>
              </div>
              <div className="pt-1">
                <BadgesContextuais
                  parceiro={parceiro || {}}
                  analisesAnteriores={analisesAnteriores}
                  valorPedido={pedido?.valor_liquido}
                />
              </div>
            </div>
          )}

          {/* ============ FAIXA 1: Pedido · Resumo financeiro · Dados de envio ============ */}
          <div className="grid gap-4 lg:grid-cols-2 items-stretch">

            {/* Coluna esquerda — Pedido + Resumo financeiro */}
            <div className="flex flex-col gap-4">
              {/* Card — Pedido */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
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
                    {pedido.bling_id_destino && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Bling ID</p>
                        <p className="text-sm">#{pedido.bling_id_destino}</p>
                      </div>
                    )}
                  </div>
                  {parceiro?.id && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <EditarProgramaInline parceiro_id={parceiro.id} nivel_atual={parceiro.nivel_programa || "convive"} categoria_ka_atual={parceiro.categoria_ka ?? null} />
                    </div>
                  )}
                  <div className="mt-3">
                    <SplitsPedidoSection pedido_id={pedido.id} />
                  </div>
                </CardContent>
              </Card>

              {/* Grid lado a lado: Como chegou do FOP + Resumo financeiro */}
              <div className="grid gap-4 lg:grid-cols-2">
                {(() => {
                  const snap = (pedido as any).snapshot_original as {
                    valor_bruto: number;
                    valor_liquido: number;
                    valor_frete: number;
                    frete_tipo: string | null;
                    desconto_celebra_valor: number;
                    bonus_pix_valor: number;
                    gravado_em: string;
                  } | null;

                  if (!snap) return null;

                  const snapBruto      = snap.valor_bruto || 0;
                  const snapLiquido    = snap.valor_liquido || 0;
                  const snapFrete      = Number(snap.valor_frete) || 0;
                  const snapCelebra    = Number(snap.desconto_celebra_valor) || 0;
                  const snapPix        = Number(snap.bonus_pix_valor) || 0;
                  const snapDescontoSimples = Math.max(0, snapBruto + snapFrete - snapLiquido);
                  const snapTemBreakdown   = snapCelebra > 0.01 || snapPix > 0.01;
                  const deltaLiquido        = pedido.valor_liquido - snapLiquido;
                  const hasDelta            = Math.abs(deltaLiquido) > 0.01;

                  return (
                    <Card className="border-amber-200/70 dark:border-amber-800/50 flex-1 flex flex-col bg-amber-50/30 dark:bg-amber-950/10">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <History className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          Como chegou do FOP
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
                          ) : null}
                          {snapFrete > 0.01 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Frete{snap.frete_tipo ? ` (${snap.frete_tipo})` : ""}</span>
                              <span>+{fmtBRL.format(snapFrete)}</span>
                            </div>
                          )}
                          <div className="border-t border-border/60 pt-2">
                            <div className="flex justify-between text-sm font-semibold">
                              <span>Valor líquido</span>
                              <span>{fmtBRL.format(snapLiquido)}</span>
                            </div>
                          </div>
                          {hasDelta && (
                            <div className={`flex justify-between text-xs pt-1 ${deltaLiquido < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
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
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Card — Resumo financeiro */}
                <Card className="border-border/60 flex-1 flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
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
                      const descontoSimples = Math.max(0, bruto + frete - liquido);
                      const temFrete       = frete > 0.01;
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
                          ) : null}
                          {temFrete && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Frete{pedido.frete_tipo ? ` (${pedido.frete_tipo})` : ""}</span>
                              <span>+{fmtBRL.format(frete)}</span>
                            </div>
                          )}
                          <div className="border-t border-border/60 pt-2">
                            <div className="flex justify-between text-sm font-semibold">
                              <span>Valor líquido</span>
                              <span>{fmtBRL.format(liquido)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Card — Dados de envio */}
            {estagio !== "cancelado" && (
              <Card className="border-border/60 h-full flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    Dados de envio
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Transportadora</label>
                    <Select value={transportadoraId || "__none__"} onValueChange={(v) => setTransportadoraId(v === "__none__" ? "" : v)}>
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
                  </div>

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
                        className="flex-1 min-w-0 h-9 text-sm rounded-md border border-input bg-background px-3 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0" title="Recalcular peso a partir dos itens" disabled={recalculandoPeso} onClick={recalcularPeso}>
                        {recalculandoPeso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
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
                        <p className="text-base font-semibold">{freteEst.data.valor_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                        {pedido.valor_bruto > 0 && (<span className="text-xs text-muted-foreground">({((freteEst.data.valor_estimado / pedido.valor_bruto) * 100).toFixed(2)}% do bruto)</span>)}
                      </div>
                      <p className="text-xs text-muted-foreground">Prazo {freteEst.data.prazo_dias}d · {freteEst.data.tarifa_code}</p>
                      <p className="text-[11px] text-muted-foreground">Base: R$ {freteEst.data.breakdown.base.toFixed(2)} · GRIS: R$ {freteEst.data.breakdown.gris.toFixed(2)} · Pedágio: R$ {freteEst.data.breakdown.pedagio.toFixed(2)} · TAS: R$ {freteEst.data.breakdown.tas.toFixed(2)}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/40">
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Tipo frete</label>
                      <Select value={freteTipo} onValueChange={setFreteTipo}>
                        <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FOB">FOB — Frete cobrado do cliente</SelectItem>
                          <SelectItem value="CIF">CIF — Benefício comercial (Fetely absorve)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor frete (R$)</label>
                      <input type="number" step="0.01" min="0" value={valorFrete} onChange={(e) => setValorFrete(e.target.value)} placeholder="0,00" className="w-full h-8 text-sm rounded-md border border-input bg-background px-3 mt-0.5 focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cubagem</p>
                      <p className="text-sm font-medium">{pedido.cubagem_total > 0 ? `${Number(pedido.cubagem_total).toFixed(4)} m³` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Peso Cubagem</p>
                      <p className="text-sm font-medium">{pedido.cubagem_total > 0 ? `${(Number(pedido.cubagem_total) * 300).toFixed(3)} kg` : "—"}</p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className="h-9 w-full"
                    disabled={salvarDadosEnvio.isPending || !!pedido.bling_id_destino}
                    onClick={() =>
                      id && salvarDadosEnvio.mutate({
                        pedidoId: id,
                        transportadoraId: transportadoraId || null,
                        pesoBrutoTotal: parseFloat(pesoBruto) || 0,
                        freteTipo: freteTipo || null,
                        valorFrete: parseFloat(valorFrete) || 0,
                      })
                    }
                  >
                    {salvarDadosEnvio.isPending ? (<><Loader2 className="h-3 w-3 animate-spin mr-1" />Salvando…</>) : ("Salvar")}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ============ FAIXA 2: Detalhes · Observações ============ */}
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Card — Detalhes */}
            <Card className="border-border/60 h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
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
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="timeline">Histórico</TabsTrigger>
                  <TabsTrigger value="urgencia">Urgência</TabsTrigger>
                  <TabsTrigger value="obs_sop">Obs SOPs</TabsTrigger>
                  <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
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
                    <Select value={urgencia} onValueChange={(v) => setUrgencia(v as UrgenciaDeclarada)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-gray-400" />{URGENCIA_LABELS.normal}</span></SelectItem>
                        <SelectItem value="alta"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-yellow-500" />{URGENCIA_LABELS.alta}</span></SelectItem>
                        <SelectItem value="critica"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" />{URGENCIA_LABELS.critica}</span></SelectItem>
                      </SelectContent>
                    </Select>
                    <textarea
                      value={obsUrgencia}
                      onChange={(e) => setObsUrgencia(e.target.value)}
                      placeholder="Justificativa opcional…"
                      rows={2}
                      className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                    />
                    <Button size="sm" variant="outline" className="w-full"
                      onClick={() => id && atualizarUrgencia.mutate({ pedidoId: id, urgencia, observacao: obsUrgencia })}
                      disabled={atualizarUrgencia.isPending}>
                      {atualizarUrgencia.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Salvando…</> : "Salvar urgência"}
                    </Button>
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
                      className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                    />
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
                <TabsContent value="tarefas">
                  <PedidoTarefasTab pedidoId={pedido.id} />
                </TabsContent>
                <TabsContent value="parcelas">
                  {!titulosData || titulosData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum título gerado ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {titulosData.map((t: TituloAReceber) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs">{t.numero_parcela}/{t.total_parcelas}</span>
                              {t.eh_entrada && <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-500 text-emerald-700">entrada</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{TIPO_LABEL[t.tipo_pagamento]} · {fmtDate(t.data_vencimento_atual)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold">{fmtBRL.format(Number(t.valor_atual || 0))}</p>
                            <Badge className={cn("text-[10px]", STATUS_CORES[t.status])}>{STATUS_TITULO_LABELS[t.status]}</Badge>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm pt-1">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-bold">{fmtBRL.format(titulosData.reduce((acc: number, t: TituloAReceber) => acc + Number(t.valor_atual || 0), 0))}</span>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              </CardContent>
            </Card>

            {/* Card — Observações */}
            <Card className="border-border/60 h-full flex flex-col">
              <CardHeader className="pb-3 shrink-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  Observações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col">
                <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Do cliente</p>
                  <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                    {(pedido as any).observacao_cliente?.trim() || <span className="text-muted-foreground italic">Sem observação.</span>}
                  </p>
                </div>
                <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Fetély (interna)</p>
                  <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                    {pedido.observacao_pedido?.trim() || <span className="text-muted-foreground italic">Sem observação.</span>}
                  </p>
                </div>
              </CardContent>
            </Card>

          </div>


          {/* ============ FAIXA 3: Remessas ============ */}
          {estagio !== "cancelado" && (
            <RemessasSection
              pedido_id={pedido.id}
              parceiro_id={pedido.parceiro_id}
              id_externo={pedido.id_externo}
              estagio={pedido.estagio}
              bling_id_destino={pedido.bling_id_destino}
            />
          )}


          {/* ============ FAIXA 4: Itens do pedido (largura cheia) ============ */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Itens do pedido
                  <span className="text-xs font-normal text-muted-foreground">{itens.length} {itens.length === 1 ? "item" : "itens"}</span>
                </CardTitle>
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
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const temDestaque = itens.some((i: any) => isSkuDestaque(i.sku));
                return (
                  <>
                    {temDestaque && (
                      <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 mb-3">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          Este pedido contém produto(s) de destaque — verifique atenção especial na separação.
                        </p>
                      </div>
                    )}
                    {itens.length === 0
                      ? <p className="text-sm text-muted-foreground text-center py-6">Itens ainda não importados.</p>
                      : itens.map((item: any) => {
                          const ehDestaque = isSkuDestaque(item.sku);
                          return (
                            <div
                              key={item.id}
                              className={cn(
                                "flex justify-between items-center gap-3 py-2.5 border-b border-border/40 last:border-0 rounded-md px-2 -mx-2",
                                ehDestaque && "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">{item.descricao}</p>
                                  {ehDestaque && (
                                    <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
                                      Destaque
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {item.sku && `SKU ${item.sku} · `}{item.quantidade} × {fmtBRL.format(item.valor_unitario)}{item.desconto_pct > 0 && ` · ${item.desconto_pct}% desc`}
                                </p>
                              </div>
                              <p className="text-sm font-semibold shrink-0">{fmtBRL.format(item.subtotal || 0)}</p>
                            </div>
                          );
                        })
                    }
                  </>
                );
              })()}
            </CardContent>
          </Card>




          {estagioFinal && (
            <div className={cn("rounded-lg border p-4 text-sm", pedido.estagio === "cancelado" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700")}>
              <p className="font-medium">{pedido.estagio === "cancelado" ? "Pedido cancelado" : "Pedido entregue"}{pedido.cancelado_motivo && ` · ${pedido.cancelado_motivo}`}</p>
              <p className="text-xs opacity-70 mt-0.5">{pedido.cancelado_em ? fmtDateTime(pedido.cancelado_em) : fmtDateTime(pedido.entregue_em)}</p>
            </div>
          )}
        </div>

        {!estagioFinal && (
          <aside className="order-first lg:order-none px-6 py-5 lg:w-72 lg:shrink-0 lg:pl-5 lg:border-l lg:border-border/60 lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ações</p>
              <AcaoPrimaria pedido={pedido} parceiro={parceiro} estagio={estagio} />
              <LinkPagamentoCard pedido={pedido} titulos={titulosData ?? []} />
              {!estagioFinal && !(pedido as any).atencao_nivel && (
                <AtencaoPedidoDialog pedidoId={pedido.id}>
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <PauseCircle className="h-4 w-4" />
                    Pausar / Avisar
                  </Button>
                </AtencaoPedidoDialog>
              )}
              <div className="pt-3 mt-1 border-t border-border/40">
                <CancelarPedidoDialog
                  pedido_id={pedido.id}
                  id_externo={pedido.id_externo}
                  estagio={estagio}
                />
              </div>

              {estagio !== "cancelado" && (
                <ComplementarSection
                  pedido_id={pedido.id}
                  pedido_origem_id={pedido.pedido_origem_id ?? null}
                  id_externo={pedido.id_externo}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
