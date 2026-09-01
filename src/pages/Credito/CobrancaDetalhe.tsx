import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Loader2, RefreshCcw, AlertTriangle, Copy, Check, Mail, Plus, Trash2, Lock, Info, ChevronDown, FileText, QrCode, CreditCard, Landmark, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLinhasCobrancaPedido, type LinhaCobrancaPedido } from "@/hooks/pedidos/useLinhasCobrancaPedido";

import { usePropostaCobranca } from "@/hooks/credito/usePropostaCobranca";
import { useMaterializarCobranca } from "@/hooks/credito/useMaterializarCobranca";
import { useMaterializarComHaver } from "@/hooks/credito/useMaterializarComHaver";
import { useHaverDisponivelCliente } from "@/hooks/credito/useHaverDisponivelCliente";
import { useTitulosPedidoResumo } from "@/hooks/credito/useTitulosPedidoResumo";
import { useCriarPortaoProvisorio } from "@/hooks/credito/useCriarPortaoProvisorio";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { SmartBackButton } from "@/components/SmartBackButton";
import type { TituloProposto } from "@/types/credito";
import { formatCNPJ } from "@/lib/cnpj";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useParametros } from "@/hooks/useParametros";
import { ComunicacaoPedidoPanel } from "@/components/pedidos/ComunicacaoPedidoPanel";
// AlterarFormaPagamentoDialog aposentado — fluxo /pgXX substituído por reverter_para_cobranca.
import { ReverterParaCobrancaDialog } from "@/components/pedidos/dialogs/ReverterParaCobrancaDialog";
import { AplicarHaverPedidoDialog } from "@/components/credito/AplicarHaverPedidoDialog";
import { EditarCondicaoPagamentoDialog } from "@/components/pedidos/dialogs/EditarCondicaoPagamentoDialog";
import { usePedidoEdicaoCampo } from "@/hooks/pedidos/usePedidoEdicaoCampo";
import { AjustarDescontoDialog } from "@/components/pedidos/dialogs/AjustarDescontoDialog";
import { ImpactoEdicaoBanner } from "@/components/pedidos/ImpactoEdicaoBanner";
import { ReabrirAnaliseAction } from "@/components/pedidos/ReabrirAnaliseAction";
import { LinkPagamentoCard } from "@/components/pedidos/LinkPagamentoCard";
import { InstrumentoPixLinha } from "@/components/pedidos/InstrumentoPixLinha";
import { useGerarPixLinha } from "@/hooks/pedidos/useGerarPixLinha";
import { useHaverAplicadoPedido } from "@/hooks/pedidos/useHaverAplicadoPedido";

import { useVoltarParaOrigem } from "@/hooks/useVoltarParaOrigem";
import { useMontarPlanoPagamento } from "@/hooks/credito/useMontarPlanoPagamento";
import { PageShell } from "@/components/layout/PageShell";
import { hojeISO } from "@/lib/data";


const DIAS_PRIMEIRO_PAGAMENTO_FALLBACK = 9;
const INTERVALO_PARCELAS_FALLBACK = 30;

/** COMPOSIÇÃO DE PAGAMENTO: portão é atributo da linha, não "a primeira parcela". */
type LinhaPlano = TituloProposto & { eh_portao?: boolean };


function todayISO(): string {
  return hojeISO();
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function addDiasISO(iso: string, dias: number): string {
  if (!iso) return iso;
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function diffDiasISO(deISO: string, ateISO: string): number {
  if (!deISO || !ateISO) return 0;
  const a = new Date(deISO + "T00:00:00").getTime();
  const b = new Date(ateISO + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

function calcularCondicaoLabel(dataVencISO: string, ehEntrada: boolean): string {
  const dias = diffDiasISO(todayISO(), dataVencISO);
  const base = dias <= 0 ? "à vista" : `${dias} ${dias === 1 ? "dia" : "dias"}`;
  return ehEntrada ? `Entrada (${base})` : base;
}

function redistribuirValoresIguais<T extends { valor_bruto: number }>(titulos: T[], total: number): T[] {
  const n = titulos.length;
  if (n === 0) return titulos;
  const totalCent = Math.round(Number(total || 0) * 100);
  const baseCent = Math.floor(totalCent / n);
  const restoCent = totalCent - baseCent * n;
  return titulos.map((t, i) => ({
    ...t,
    valor_bruto: (i === n - 1 ? baseCent + restoCent : baseCent) / 100,
  }));
}

function usePedidoMinimo(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["cobranca-pedido-minimo", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select(`
          id, id_externo, estagio, data_pedido, nf_numero, valor_bruto, valor_liquido, bonus_pix_valor, condicao_solicitada, parceiro_id,
          itens_json, frete_tipo, valor_frete,
          parceiro:parceiros_comerciais!parceiro_id(razao_social, nome_fantasia, cnpj, cpf, email, telefone, cep, logradouro, numero, endereco_complemento, bairro, cidade, uf),
          analises_credito!analises_credito_pedido_id_fkey(parecer_final, status_final, decidido_em, exige_portao)
        `)
        .eq("id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Plano já materializado? Conta linhas vivas de provisao_recebimento do pedido. */
function usePlanoExistente(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["cobranca-plano-existente", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from("provisao_recebimento")
        .select("id", { count: "exact", head: true })
        .eq("pedido_id", pedidoId)
        .neq("status", "cancelada");
      if (error) throw error;
      return Number(count ?? 0);
    },
  });
}

function usePedidoPortaoRegra(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-portao-regra", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_portao_regra")
        .select("exige_portao_regra, porque, portao_minimo_pct")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        exige_portao_regra: boolean | null;
        porque: string | null;
        portao_minimo_pct: number | null;
      } | null;
    },
  });
}

function LinhaInfo({ label, value, copiavel }: { label: string; value: string; copiavel?: string }) {
  const [copiado, setCopiado] = useState(false);
  function copiar() {
    if (!copiavel) return;
    navigator.clipboard.writeText(copiavel).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1400);
    });
  }
  return (
    <div className="flex justify-between gap-3 text-xs py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right flex items-center gap-1.5 font-medium">
        {value}
        {copiavel && (
          <button
            type="button"
            onClick={copiar}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Copiar"
          >
            {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        )}
      </span>
    </div>
  );
}

const ESTAGIO_LABEL: Record<string, string> = {
  cobranca: "Em cobrança",
  em_separacao: "Em separação",
  pre_separacao: "Pré-separação",
  faturado: "Faturado",
  aguardando_pagamento: "Aguardando pagamento",
};

const ICONE_TIPO: Record<string, LucideIcon> = {
  boleto: FileText,
  pix: QrCode,
  cartao: CreditCard,
  conta_corrente: Landmark,
};

function fmtDataBR(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function CopiavelInline({ label, valor }: { label: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-xs text-muted-foreground shrink-0 w-32">{label}</span>
      <span className="text-xs break-all min-w-0">{valor}</span>
      <button
        type="button"
        title="Copiar"
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => {
          navigator.clipboard.writeText(valor).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1400);
          });
        }}
      >
        {copiado ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/**
 * STEPPER-HONESTO (28/08/2026): cada nó acende pelo seu próprio fato. Passo
 * posterior cumprido NÃO acende os anteriores — herança esconde furo.
 */
function StepperHonesto({ passos }: { passos: { label: string; feito: boolean }[] }) {
  const idxAtual = passos.findIndex((p) => !p.feito);
  return (
    <div className="flex items-center py-3 px-4 rounded-lg border border-border/60">
      {passos.map((p, i) => (
        <div key={p.label} className="flex items-center flex-1 last:flex-none min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            {p.feito ? (
              <span className="h-6 w-6 rounded-full bg-success/15 text-success flex items-center justify-center">
                <Check className="h-3.5 w-3.5" />
              </span>
            ) : (
              <span className="h-6 w-6 rounded-full border-2 border-border" />
            )}
            <span
              className={
                "text-sm " +
                (p.feito
                  ? "text-success"
                  : i === idxAtual
                    ? "text-foreground font-medium"
                    : "text-muted-foreground")
              }
            >
              {p.label}
            </span>
          </div>
          {i < passos.length - 1 && <div className="flex-1 h-px mx-3 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function CelulaDinheiro({
  rotulo,
  valor,
  dominante,
}: {
  rotulo: string;
  valor: number;
  dominante?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={dominante ? "text-[22px] font-medium mt-0.5" : "text-[17px] font-medium mt-0.5"}>
        {fmtBRL.format(valor)}
      </p>
    </div>
  );
}

function LinhaParcela({ l, pedidoId }: { l: LinhaCobrancaPedido; pedidoId: string }) {
  // Linha sem instrumento nasce aberta — o botão "Gerar QR PIX" tem que estar à vista.
  const [aberto, setAberto] = useState(() => !l.pago && !l.instrumento_pronto);
  const Icone = ICONE_TIPO[l.tipo_pagamento ?? ""] ?? FileText;
  const valor = Number(l.valor ?? 0);
  const pago = !!l.pago;

  const verbo = pago ? "pago em " : l.estado === "vencido" ? "venceu " : "vence ";
  const dataTexto = pago ? fmtDataBR(l.pago_em ?? l.data_vencimento) : fmtDataBR(l.data_vencimento);

  let badge: { cls: string; texto: string };
  if (l.estado === "pago") {
    badge = { cls: "bg-success/10 text-success", texto: `Pago${l.pago_em ? ` em ${fmtDataBR(l.pago_em)}` : ""}` };
  } else if (l.estado === "vencido") {
    badge = {
      cls: "bg-destructive/10 text-destructive",
      texto: `Vencido há ${l.dias_atraso ?? 0} ${(l.dias_atraso ?? 0) === 1 ? "dia" : "dias"}`,
    };
  } else if (l.estado === "vence_hoje") {
    badge = { cls: "bg-warning/10 text-warning", texto: "Vence hoje" };
  } else if (l.estado === "sem_data") {
    badge = { cls: "bg-warning/10 text-warning", texto: "Sem vencimento" };
  } else {
    badge = {
      cls: "bg-muted text-muted-foreground",
      texto: `Vence em ${l.dias_para_vencer ?? 0} ${(l.dias_para_vencer ?? 0) === 1 ? "dia" : "dias"}`,
    };
  }

  const temInstrumento =
    !!l.link_pagamento || !!l.linha_digitavel || !!l.nosso_numero || !!l.boleto_status || !!l.pix_txid;

  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left hover:bg-muted/40 transition-colors"
      >
        <Icone className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">
              Parcela {l.numero_parcela ?? "—"} de {l.total_parcelas ?? "—"} · {fmtBRL.format(valor)}
            </span>
            {l.eh_portao && (
              <Badge variant="secondary" className="text-[10px]">Portão</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground capitalize">
            {(l.tipo_pagamento ?? "—").replace(/_/g, " ")} · <span className="normal-case">{verbo}{dataTexto}</span>
          </p>
        </div>
        <Badge variant="outline" className={"border-0 text-[11px] whitespace-nowrap " + badge.cls}>
          {badge.texto}
        </Badge>
        <ChevronDown
          className={"h-4 w-4 text-muted-foreground shrink-0 transition-transform " + (aberto ? "rotate-180" : "")}
        />
      </button>

      {aberto && (
        <div className="pl-11 pr-4 pb-3 space-y-1.5 min-w-0">
          {l.link_pagamento && l.tipo_pagamento !== "pix" && (
            <CopiavelInline label="Link" valor={l.link_pagamento} />
          )}
          {l.linha_digitavel && <CopiavelInline label="Linha digitável" valor={l.linha_digitavel} />}
          <InstrumentoPixLinha
            linhaId={l.linha_id}
            origem={l.origem}
            pedidoId={pedidoId}
            tipoPagamento={l.tipo_pagamento}
            pago={l.pago}
            linkPagamento={l.link_pagamento}
            pixTxid={l.pix_txid}
            pixToken={l.pix_token}
            pixQrUrl={l.pix_qr_url}
            valor={Number(l.valor ?? 0)}
          />
          {l.nosso_numero && (
            <p className="text-xs text-muted-foreground">Nosso número: {l.nosso_numero}</p>
          )}
          {l.boleto_status && (
            <p className="text-xs text-muted-foreground">Boleto: {l.boleto_status}</p>
          )}
          {!temInstrumento && l.tipo_pagamento !== "pix" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Nenhum link ou boleto emitido para esta parcela
            </p>
          )}
        </div>
      )}

    </div>
  );
}

function GerenciarLinksPagamento({ pedido }: { pedido: any }) {
  const navigate = useNavigate();
  const [alterarPagtoOpen, setAlterarPagtoOpen] = useState(false);
  const portaoRegraQ = usePedidoPortaoRegra(pedido.id);
  const linhasQ = useLinhasCobrancaPedido(pedido.id);
  const planoCardRef = useRef<HTMLDivElement>(null);



  const emailLogQ = useQuery({
    queryKey: ["cobranca-email-log", pedido.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedido_email_log")
        .select("id, tipo_email, destinatario")
        .eq("pedido_id", pedido.id);
      if (error) throw error;
      return (data ?? []) as { id: string; tipo_email: string | null; destinatario: string | null }[];
    },
    enabled: !!pedido.id,
  });

  const linhas = linhasQ.data ?? [];
  const somaLinhas = linhas.reduce((a, l) => a + Number(l.valor ?? 0), 0);
  const somaPago = linhas.filter((l) => l.pago).reduce((a, l) => a + Number(l.valor ?? 0), 0);
  const somaAberto = linhas.filter((l) => !l.pago).reduce((a, l) => a + Number(l.valor ?? 0), 0);
  const valorPedido = Number(pedido.valor_liquido ?? 0);
  // HAVER-É-PAGAMENTO: crédito do cliente já aplicado cobre parte do pedido e não entra no plano.
  const haverQ = useHaverAplicadoPedido(pedido.id);
  const haverAplicado = haverQ.data ?? 0;
  const delta = somaLinhas + haverAplicado - valorPedido;

  const temInstrumento = linhas.some((l) => l.instrumento_pronto);
  // Passo 3: e-mail interno é teste, não é envio ao cliente.
  const enviadoAoCliente = (emailLogQ.data ?? []).some(
    (e) => e.tipo_email === "cobranca" && !!e.destinatario && !e.destinatario.trim().toLowerCase().endsWith("@fetely.com.br"),
  );

  const passos = [
    { label: "Plano montado", feito: linhas.length > 0 },
    { label: "Instrumento pronto", feito: temInstrumento },
    { label: "Enviado ao cliente", feito: enviadoAoCliente },
  ];
  const incoerente = enviadoAoCliente && !temInstrumento;

  const cartaoAbertas = linhas.filter((l) => l.tipo_pagamento === "cartao" && !l.pago);
  const cartaoAbertoValor = cartaoAbertas.reduce((a, l) => a + Number(l.valor ?? 0), 0);

  const emCobranca = pedido.estagio === "cobranca";

  // Linha PIX sem QR emitido é a ação mais próxima: o instrumento vive na linha do plano.
  const pixPendentes = linhas.filter(
    (l) => l.tipo_pagamento === "pix" && !l.pix_txid && !l.pago,
  );
  const gerarPix = useGerarPixLinha(pedido.id);

  // Botão primário só quando a ação NÃO existe em outro lugar da tela.
  const acaoPrimaria: { label: string; onClick: () => void; carregando?: boolean } | null =
    linhas.length === 0
      ? { label: "Montar plano", onClick: () => navigate(`/recebimento/cobranca/${pedido.id}?refazer=1`) }
      : pixPendentes.length === 1
        ? {
            label: "Gerar QR PIX",
            carregando: gerarPix.isPending,
            onClick: () =>
              gerarPix.mutate(
                { linhaId: pixPendentes[0].linha_id, origem: pixPendentes[0].origem },
                { onSuccess: () => planoCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }) },
              ),
          }
        : null;


  function refazerPlano() {
    if (emCobranca) {
      navigate(`/recebimento/cobranca/${pedido.id}?refazer=1`);
    } else {
      setAlterarPagtoOpen(true);
    }
  }

  return (
    <PageShell className="animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Recebimento", to: "/recebimento" },
          { label: "Cobrança", to: "/recebimento/cobranca" },
          { label: pedido.id_externo ?? "—" },
        ]}
        title={`Cobrança — ${pedido.id_externo ?? ""}`}
        subtitle="Plano de pagamento e instrumentos de cobrança do pedido."
      />

      {/* (a) IDENTIFICAÇÃO */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[18px] font-medium">
            {pedido.id_externo ?? "—"} · {pedido.parceiro?.razao_social ?? "—"}
          </p>
          <Badge variant="outline">
            {ESTAGIO_LABEL[pedido.estagio] ?? pedido.estagio ?? "—"}
          </Badge>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {pedido.condicao_solicitada ?? "—"} · pedido de {fmtDataBR(pedido.data_pedido)}
        </p>
      </div>

      {/* (b) FAIXA DE DINHEIRO */}
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 rounded-lg border border-border/60 divide-x divide-border/60">
          <CelulaDinheiro rotulo="Pedido" valor={valorPedido} />
          <CelulaDinheiro
            rotulo={pedido.nf_numero ? `Faturado (NF ${pedido.nf_numero})` : "No plano"}
            valor={somaLinhas}
          />
          <CelulaDinheiro rotulo="Pago" valor={somaPago} />
          <CelulaDinheiro rotulo="Em aberto" valor={somaAberto} dominante />
        </div>

        {haverAplicado > 0 && (
          <p className="mt-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            {fmtBRL.format(haverAplicado)} coberto por crédito do cliente — não entra no plano.
          </p>
        )}

        {linhasQ.isSuccess && linhas.length > 0 && Math.abs(delta) > 0.01 && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {delta < 0
                ? `${fmtBRL.format(Math.abs(delta))} do pedido não estão em nenhuma parcela — plano não cobre o total.`
                : `As parcelas somam ${fmtBRL.format(delta)} a mais que o pedido.`}
            </span>
          </div>
        )}
      </div>

      {/* (c) STEPPER HONESTO */}
      <div className="space-y-2">
        <StepperHonesto passos={passos} />
        {incoerente && (
          <p className="flex items-center gap-2 text-sm text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Cobrança enviada sem instrumento emitido — verifique o que o cliente recebeu.
          </p>
        )}
      </div>

      {/* (5) AVISO DE CARTÃO */}
      {cartaoAbertas.length > 0 && (
        <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {cartaoAbertas.length} parcela(s) de cartão em aberto · {fmtBRL.format(cartaoAbertoValor)} —
          uma captura fecha todas de uma vez.
        </div>
      )}

      {/* (d) LISTA ÚNICA DE PARCELAS */}
      <Card ref={planoCardRef}>

        <CardHeader>
          <CardTitle className="text-base">Plano de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {linhasQ.isLoading && <Skeleton className="h-40 w-full" />}
          {!linhasQ.isLoading && linhas.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nenhum plano de pagamento montado para este pedido.
            </p>
          )}
          {linhas.map((l) => (
            <LinhaParcela key={`${l.origem}-${l.linha_id}`} l={l} pedidoId={pedido.id} />

          ))}
        </CardContent>
      </Card>

      {/* (e) LINK DE PAGAMENTO DO PEDIDO */}
      <div>
        <LinkPagamentoCard pedidoId={pedido.id} />
      </div>

      {/* (f) COMUNICAÇÃO */}
      <div>
        <ComunicacaoPedidoPanel
          pedido_id={pedido.id}
          parceiro_id={pedido.parceiro_id}
          estagio={pedido.estagio}
          exige_portao={!!portaoRegraQ.data?.exige_portao_regra}
        />
      </div>

      {/* (g) RODAPÉ DE AÇÕES */}
      <div className="flex items-center justify-between gap-3">
        <SmartBackButton fallback="/recebimento/cobranca" fallbackLabel="Voltar ao pedido" />
        <div className="flex items-center gap-2">
          {acaoPrimaria && (
            <Button onClick={acaoPrimaria.onClick} disabled={acaoPrimaria.carregando}>
              {acaoPrimaria.carregando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {acaoPrimaria.label}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={refazerPlano}>Refazer plano</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/pedidos/${pedido.id}`)}>
                Ver pedido
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ReverterParaCobrancaDialog
        open={alterarPagtoOpen}
        onClose={() => setAlterarPagtoOpen(false)}
        pedidoId={pedido.id}
        idExterno={pedido.id_externo}
        estagio={pedido.estagio}
        motivoAlterarPagamento
      />
    </PageShell>
  );
}

export default function CobrancaDetalhe() {

  const { pedidoId } = useParams<{ pedidoId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const voltarPara = useVoltarParaOrigem("/recebimento/cobranca");
  const { toast } = useToast();

  const pedidoQ = usePedidoMinimo(pedidoId);
  const portaoRegraQ = usePedidoPortaoRegra(pedidoId);
  const propostaQ = usePropostaCobranca(pedidoId);
  const planoExistenteQ = usePlanoExistente(pedidoId);
  const materializar = useMaterializarCobranca();
  const materializarComHaver = useMaterializarComHaver();
  const criarPortao = useCriarPortaoProvisorio();
  const montarPlano = useMontarPlanoPagamento();

  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const exigePortao = !!portaoRegraQ.data?.exige_portao_regra;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haverCliente = useHaverDisponivelCliente((pedidoQ.data as any)?.parceiro_id);
  const haverSaldo = haverCliente?.saldo ?? 0;
  const haverDisponivel = haverSaldo > 0;

  // HAVER-É-PAGAMENTO: parte do pedido pode já estar quitada (haver, entrada
  // paga por qualquer meio, ou adiantamento vinculado). A base do parcelamento
  // é o líquido MENOS o que já é dinheiro do cliente — `pedidos.valor_liquido`
  // nunca é reduzido no banco.
  const titulosResumoQ = useTitulosPedidoResumo(pedidoId);
  // CRÉDITO PARCIAL TAMBÉM É PAGAMENTO: título pago OU adiantamento vinculado.
  const jaPagoPedido = Number(titulosResumoQ.data?.totalAbatido ?? 0);
  const jaAdiantado = Number(titulosResumoQ.data?.somaAdiantamento ?? 0);
  const jaPagoHaver = Number(titulosResumoQ.data?.somaHaver ?? 0);
  const creditoAplicado = Number(titulosResumoQ.data?.creditoAplicado ?? 0);


  const [titulos, setTitulos] = useState<LinhaPlano[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { regraDe: regraEdicaoCampo } = usePedidoEdicaoCampo((pedidoQ.data as any)?.estagio);
  // Esconde o gatilho antigo quando a seção nova de pagamento está liberada para o estágio.
  const pagamentoNoPainel = !!regraEdicaoCampo("pagamento")?.permitido;
  const [editarCondicaoOpen, setEditarCondicaoOpen] = useState(false);
  const [ajustarDescontoOpen, setAjustarDescontoOpen] = useState(false);
  const [valorTotalCobrar, setValorTotalCobrar] = useState<number>(0);
  const [parcelasIguais, setParcelasIguais] = useState<boolean>(false);
  const [diasPrimeiroPagamento, setDiasPrimeiroPagamento] = useState<number>(DIAS_PRIMEIRO_PAGAMENTO_FALLBACK);
  const [intervaloDias, setIntervaloDias] = useState<number>(INTERVALO_PARCELAS_FALLBACK);
  const [planoEditado, setPlanoEditado] = useState<boolean>(false);
  const [aplicarHaverOpen, setAplicarHaverOpen] = useState<boolean>(false);

  const paramDiasQ = useParametros("dias_primeiro_pagamento");
  const paramIntervaloQ = useParametros("intervalo_entre_parcelas");

  // Âncora em hoje: cada linha vence em hoje + dias + prazo_dias próprio da
  // condição aprovada. Só quando a linha não traz prazo_dias é que cai no
  // espaçamento uniforme antigo (i * intervalo).
  const aplicarPrimeiraDataECascata = (
    lista: TituloProposto[],
    dias: number,
    intervalo: number,
  ): TituloProposto[] => {
    if (lista.length === 0) return lista;
    const base = addDiasISO(todayISO(), dias);
    return lista.map((t, i) => {
      const prazo = Number(t.prazo_dias);
      const dataVenc = Number.isFinite(prazo)
        ? addDiasISO(base, prazo)
        : addDiasISO(base, i * intervalo);
      return {
        ...t,
        data_vencimento: dataVenc,
        condicao_pagamento: calcularCondicaoLabel(dataVenc, t.eh_entrada),
      };
    });
  };

  function montarLinhasDaProposta(
    lista: TituloProposto[],
    dias: number,
    intervalo: number,
  ): LinhaPlano[] {
    const novos: LinhaPlano[] = lista.map((t) => ({ ...t, eh_portao: false }));
    // LINHA UNICA: se a regra exige portao e so ha uma parcela, ela nasce marcada.
    // Com duas ou mais, a escolha continua do operador (composicao).
    if (exigePortao && novos.length === 1) {
      novos[0].eh_portao = true;
    }
    // A doutrina APROVADO-MANDA-NO-VENCIMENTO foi substituída pela ÂNCORA EM HOJE:
    // propor_cobranca devolve `prazo_dias` por linha e a data gravada na análise de
    // crédito não é mais lida. A cascata é aplicada SEMPRE, para que os campos
    // "dias do primeiro pagamento" e "intervalo" editados pelo operador tenham efeito.
    return aplicarPrimeiraDataECascata(novos, dias, intervalo);
  }

  // hidrata estado local quando a proposta chega — UMA VEZ por pedido.
  // Refetch da proposta (foco de janela, invalidação) não pode apagar a
  // composição manual montada pelo operador.
  const pedidoHidratadoRef = useRef<string | null>(null);
  const lastCreditoAplicadoRef = useRef<number>(0);
  const lastJaPagoPedidoRef = useRef<number>(0);
  useEffect(() => {
    if (!propostaQ.data?.titulos_propostos) return;
    if (!pedidoId) return;
    if (pedidoHidratadoRef.current === pedidoId) return;
    if (paramDiasQ.isLoading || paramIntervaloQ.isLoading) return;

    const vDiasParam = Number(paramDiasQ.data?.[0]?.valor);
    const vIntervalo = Number(paramIntervaloQ.data?.[0]?.valor);
    // PREVISAO-VEM-DO-BANCO: a RPC já decidiu se aplica a prorrogação.
    // Só usamos o parâmetro global como fallback quando a proposta não trouxe o campo.
    const prorrogacaoDaProposta = Number(propostaQ.data.prorrogacao_dias);
    const diasUsar = Number.isFinite(prorrogacaoDaProposta) && prorrogacaoDaProposta >= 0
      ? prorrogacaoDaProposta
      : Number.isFinite(vDiasParam) && vDiasParam >= 0
        ? vDiasParam
        : DIAS_PRIMEIRO_PAGAMENTO_FALLBACK;
    const intervaloUsar = Number.isFinite(vIntervalo) && vIntervalo >= 0 ? vIntervalo : INTERVALO_PARCELAS_FALLBACK;

    setDiasPrimeiroPagamento(diasUsar);
    setIntervaloDias(intervaloUsar);

    const novos = montarLinhasDaProposta(propostaQ.data.titulos_propostos, diasUsar, intervaloUsar);
    setTitulos(novos);

    const somaProposta = novos.reduce((acc, t) => acc + Number(t.valor_bruto || 0), 0);
    const bruto = Number(pedidoQ.data?.valor_liquido ?? propostaQ.data?.valor_total ?? somaProposta);
    const novoTotal = Math.max(0, bruto - creditoAplicado);
    setValorTotalCobrar(Math.round(novoTotal * 100) / 100);
    if (creditoAplicado > 0.005 || jaPagoPedido > 0.005) setTitulos((prev) => redistribuirValoresIguais(prev, novoTotal));
    setParcelasIguais(false);
    setPlanoEditado(false);
    lastCreditoAplicadoRef.current = creditoAplicado;
    lastJaPagoPedidoRef.current = jaPagoPedido;
    pedidoHidratadoRef.current = pedidoId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostaQ.data, pedidoId, pedidoQ.data?.valor_liquido, creditoAplicado, jaPagoPedido, paramDiasQ.isLoading, paramIntervaloQ.isLoading, exigePortao]);

  // Aplicação de crédito/haver após a hidratação: reage apenas ao saldo
  // gravado, sem reconstruir as linhas a partir da proposta. Só redistribui
  // valores, preservando forma, vencimento e portão escolhidos pelo operador.
  useEffect(() => {
    if (!pedidoId) return;
    if (pedidoHidratadoRef.current !== pedidoId) return;
    if (lastCreditoAplicadoRef.current === creditoAplicado && lastJaPagoPedidoRef.current === jaPagoPedido) return;

    const novoTotal = Math.max(0, Number(pedidoQ.data?.valor_liquido ?? 0) - creditoAplicado);
    setValorTotalCobrar(Math.round(novoTotal * 100) / 100);
    setTitulos((prev) => redistribuirValoresIguais(prev, novoTotal));
    lastCreditoAplicadoRef.current = creditoAplicado;
    lastJaPagoPedidoRef.current = jaPagoPedido;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditoAplicado, jaPagoPedido, pedidoId, pedidoQ.data?.valor_liquido]);


  // A proposta nasce pelo que FALTA cobrar, não pelo valor da nota. `montar_plano_pagamento`
  // reconcilia com `novas + pagas + haver = líquido`, então o plano cheio seria recusado.
  const valorPedido = Number(pedidoQ.data?.valor_liquido ?? propostaQ.data?.valor_total ?? 0);

  const totalEditado = useMemo(
    () => titulos.reduce((acc, t) => acc + Number(t.valor_bruto || 0), 0),
    [titulos],
  );

  // ENVELOPE-TEM-UMA-DEFINICAO (19/08/2026): o banner avalia o PLANO EM TELA.
  // Antes recebia proposta.condicao_original — a condicao ANTIGA — e dava
  // falso-verde para plano que estourava o prazo aprovado.
  const linhasParaImpacto = useMemo(
    () =>
      titulos.map((t) => ({
        numero_parcela: t.numero_parcela,
        tipo_pagamento: t.tipo_pagamento,
        valor: Number(t.valor_bruto || 0),
        data_vencimento: t.data_vencimento,
        eh_entrada: !!t.eh_entrada,
        eh_portao: !!t.eh_portao,
      })),
    [titulos],
  );
  const valorACobrar = Math.max(0, valorPedido - creditoAplicado);
  const diff = totalEditado - valorACobrar;
  const pctDiff = valorACobrar > 0 ? Math.abs(diff) / valorACobrar : 0;
  const temDivergenciaLeve = Math.abs(diff) > 0.005 && pctDiff <= 0.01;
  const temDivergenciaGrave = pctDiff > 0.01;

  const qtdPortao = titulos.filter((t) => t.eh_portao).length;
  const totalPortao = titulos.reduce(
    (acc, t) => acc + (t.eh_portao ? Number(t.valor_bruto || 0) : 0),
    0,
  );
  const pctPortao = totalEditado > 0 ? (totalPortao / totalEditado) * 100 : 0;

  // Regra do portão vinda da view — mostrada ANTES do clique. O banco continua sendo
  // a autoridade final; isto é só para o operador não bater na parede.
  const portaoMinimoPct = Number(portaoRegraQ.data?.portao_minimo_pct ?? 0);
  const portaoMinimoRS = (Math.max(0, portaoMinimoPct) / 100) * totalEditado;
  const faltaPortaoRS = Math.max(0, portaoMinimoRS - totalPortao);
  const coberturaPortaoOk =
    !exigePortao || (totalPortao > 0.005 && faltaPortaoRS <= 0.005);



  const temValorInvalido = titulos.some((t) => Number(t.valor_bruto) <= 0);
  // Boleto não pode nascer vencido: a régua é HOJE, não a data do pedido.
  const temDataPassada = titulos.some((t) => t.data_vencimento < todayISO());

  const atualizarTitulo = (idx: number, patch: Partial<LinhaPlano>) => {
    setPlanoEditado(true);
    setTitulos((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };


  const handleValorTotalChange = (v: number) => {
    const arredondado = Math.round(v * 100) / 100;
    setValorTotalCobrar(arredondado);
    if (parcelasIguais) {
      setTitulos((prev) => redistribuirValoresIguais(prev, arredondado));
    }
  };

  const handleParcelasIguaisChange = (checked: boolean) => {
    setParcelasIguais(checked);
    if (checked) {
      setTitulos((prev) => redistribuirValoresIguais(prev, valorTotalCobrar));
    }
  };

  const handleDataChange = (idx: number, novaData: string) => {
    setPlanoEditado(true);
    setTitulos((prev) =>
      prev.map((t, i) =>
        i === idx
          ? { ...t, data_vencimento: novaData, condicao_pagamento: calcularCondicaoLabel(novaData, t.eh_entrada) }
          : t,
      ),
    );
  };


  const renumerar = (lista: LinhaPlano[]): LinhaPlano[] => {
    const n = lista.length;
    return lista.map((t, i) => ({ ...t, ordem: i, numero_parcela: i + 1, total_parcelas: n }));
  };

  const handleAdicionarParcela = () => {
    setPlanoEditado(true);
    setTitulos((prev) => {
      const ultima = prev[prev.length - 1];
      const novaData = ultima
        ? addDiasISO(ultima.data_vencimento, intervaloDias)
        : addDiasISO(todayISO(), diasPrimeiroPagamento);
      const prazoUltima = Number(ultima?.prazo_dias);
      const novo: LinhaPlano = {
        ordem: prev.length,
        numero_parcela: prev.length + 1,
        total_parcelas: prev.length + 1,
        eh_entrada: false,
        eh_portao: false,
        tipo_pagamento: ultima?.tipo_pagamento ?? "boleto",
        valor_bruto: 0,
        data_vencimento: novaData,
        prazo_dias: Number.isFinite(prazoUltima) ? prazoUltima + intervaloDias : undefined,
        condicao_pagamento: calcularCondicaoLabel(novaData, false),
      };
      const nova = renumerar([...prev, novo]);
      return parcelasIguais ? redistribuirValoresIguais(nova, valorTotalCobrar) : nova;
    });
  };


  const handleRemoverParcela = (idx: number) => {
    setPlanoEditado(true);
    setTitulos((prev) => {
      if (prev.length <= 1) return prev;
      const nova = renumerar(prev.filter((_, i) => i !== idx));
      return parcelasIguais ? redistribuirValoresIguais(nova, valorTotalCobrar) : nova;
    });
  };

  const podeMaterializar =
    !!pedidoId && titulos.length > 0 && !temValorInvalido && !temDataPassada;

  const handleAceitar = () => {
    if (temValorInvalido) {
      toast({
        title: "Valores inválidos",
        description: "Todos os títulos devem ter valor maior que zero.",
        variant: "destructive",
      });
      return;
    }
    if (temDataPassada) {
      toast({
        title: "Data de vencimento inválida",
        description: "Vencimentos não podem ser anteriores a hoje.",
        variant: "destructive",
      });
      return;
    }
    if (temDivergenciaLeve) {
      toast({
        title: "Divergência de soma",
        description: `Total editado difere em ${fmtBRL.format(diff)} do valor do pedido.`,
      });
    }
    setConfirmOpen(true);
  };

  const handleConfirmar = () => {
    if (!pedidoId) return;
    // Porta única: montar_plano_pagamento cobre portão, parcelamento e haver.
    montarPlano.mutate(
      {
        pedidoId,
        linhas: titulos.map((t) => ({
          numero_parcela: t.numero_parcela,
          tipo_pagamento: t.tipo_pagamento,
          valor: Number(t.valor_bruto || 0),
          data_prevista: t.data_vencimento,
          eh_portao: !!t.eh_portao,
          eh_entrada: !!t.eh_entrada,
          condicao_pagamento: t.condicao_pagamento ?? null,
          link_pagamento: t.link_pagamento ?? null,
        })),
      },
      {
        onSuccess: () => setPlanoEditado(false),
        onSettled: () => setConfirmOpen(false),
      },
    );
  };


  const handleRecalcular = () => {
    if (!propostaQ.data?.titulos_propostos) return;
    const novos = montarLinhasDaProposta(propostaQ.data.titulos_propostos, diasPrimeiroPagamento, intervaloDias);
    setTitulos((prev) => {
      if (parcelasIguais) {
        return redistribuirValoresIguais(novos, valorTotalCobrar);
      }
      return novos;
    });
    setParcelasIguais(false);
    setPlanoEditado(false);
  };

  // Loading
  if (pedidoQ.isLoading || propostaQ.isLoading || planoExistenteQ.isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </PageShell>
    );
  }

  // Erro ao carregar pedido (query falhou)
  if (pedidoQ.error) {
    return (
      <PageShell>
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar pedido: {(pedidoQ.error as Error).message}
          </AlertDescription>
        </Alert>
        <Button variant="ghost" onClick={() => navigate(voltarPara)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </PageShell>
    );
  }

  // Pedido não encontrado
  if (!pedidoQ.data) {
    return (
      <PageShell>
        <Alert variant="destructive">
          <AlertDescription>Pedido não encontrado.</AlertDescription>
        </Alert>
        <Button variant="ghost" className="mt-4" onClick={() => navigate(voltarPara)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </PageShell>
    );
  }

  // PLANO-EM-COBRANCA-E-EDITAVEL (28/08/2026): pedido em cobrança não tem título nem
  // boleto — só provisão prevista. montar_plano_pagamento é porta única e já apaga a
  // provisão antes de remontar, então refazer o plano aqui não cancela nada e não
  // precisa de reversão. ?refazer=1 devolve o operador à proposta editável.
  const refazer = searchParams.get("refazer") === "1";
  const emCobranca = pedidoQ.data.estagio === "cobranca";
  if (!emCobranca || ((planoExistenteQ.data ?? 0) > 0 && !refazer)) {
    return <GerenciarLinksPagamento pedido={pedidoQ.data} />;
  }


  // Erro na RPC de proposta
  if (propostaQ.error) {
    return (
      <PageShell>
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao calcular proposta: {(propostaQ.error as Error).message}
          </AlertDescription>
        </Alert>
        <Button variant="ghost" onClick={() => navigate(voltarPara)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </PageShell>
    );
  }

  const proposta = propostaQ.data!;
  const pedido = pedidoQ.data;

  // ─── Cálculos enriquecidos para resumo (regra crítica: pedido.valor_bruto envenenado) ───
  const itensPedido = Array.isArray(pedido.itens_json) ? (pedido.itens_json as any[]) : [];
  const valorBrutoCalc = itensPedido.reduce(
    (acc, it) => acc + Number(it?.quantidade ?? 0) * Number(it?.valor_unitario ?? 0),
    0,
  );
  const qtdItens = itensPedido.reduce((acc, it) => acc + Number(it?.quantidade ?? 0), 0);
  const descontoRS = Math.max(0, valorBrutoCalc - valorPedido);
  const descontoPct = valorBrutoCalc > 0 ? (descontoRS / valorBrutoCalc) * 100 : 0;

  const analisesPedido = (Array.isArray(pedido.analises_credito) ? pedido.analises_credito : []) as Array<{
    parecer_final: string | null;
    status_final: string | null;
    decidido_em: string | null;
    exige_portao: boolean | null;
  }>;
  const analiseEscolhida = (() => {
    if (!analisesPedido.length) return null;
    const cmp = (a: typeof analisesPedido[number], b: typeof analisesPedido[number]) =>
      (b.decidido_em ?? "").localeCompare(a.decidido_em ?? "");
    const aprovadas = analisesPedido.filter((a) => a.status_final === "aprovado").sort(cmp);
    if (aprovadas.length) return aprovadas[0];
    return [...analisesPedido].sort(cmp)[0];
  })();
  const obsCredito = analiseEscolhida?.parecer_final?.trim() || "—";

  const freteLabel = (() => {
    const tipo = (pedido.frete_tipo ?? "").toString().trim();
    const valor = Number(pedido.valor_frete ?? 0);
    if (!tipo && !valor) return "—";
    if (!tipo) return fmtBRL.format(valor);
    return `${tipo.toUpperCase()} · ${fmtBRL.format(valor)}`;
  })();

  return (
    <PageShell className="animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Recebimento", to: "/recebimento" },
          { label: "Cobrança", to: "/recebimento/cobranca" },
          { label: pedido.id_externo ?? "—" },
        ]}
        title={`Cobrança — ${pedido.id_externo ?? ""}`}
        subtitle="Edite a proposta de títulos antes de materializar."
      />

      {/* Faixa de estado: já materializei ou não? */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">
          Ainda não materializado — o que está abaixo é uma proposta editável.
        </span>
      </div>

      {/* No modo proposta o passo 3 é sempre falso: envio só existe depois do plano materializado. */}
      <StepperHonesto
        passos={[
          { label: "Plano montado", feito: (planoExistenteQ.data ?? 0) > 0 },
          { label: "Instrumento pronto", feito: titulos.some((t) => t.link_pagamento) },
          { label: "Enviado ao cliente", feito: false },
        ]}
      />

      {/* Resumo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo do pedido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          {/* ZONA 1 — DINHEIRO */}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3 rounded-md border bg-muted/30 p-3">
            <div>
              <p className="text-muted-foreground text-xs">Valor total</p>
              <p className="font-medium">{fmtBRL.format(valorPedido)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Desconto</p>
              <p className="font-medium">
                {descontoRS > 0
                  ? `${descontoPct.toFixed(descontoPct >= 10 ? 0 : 1)}% · ${fmtBRL.format(descontoRS)}`
                  : "—"}
              </p>
            </div>
            {jaPagoPedido > 0.005 && (
              <div>
                <p className="text-muted-foreground text-xs">
                  {jaAdiantado > 0.005 ? "Crédito do cliente aplicado" : "Já pago"}
                </p>
                <p className="font-medium text-success">−{fmtBRL.format(jaPagoPedido)}</p>
              </div>
            )}
            <div className="ml-auto text-right">
              <p className="text-muted-foreground text-xs">A cobrar</p>
              <p className="text-2xl font-medium leading-tight">
                {fmtBRL.format(Math.max(0, valorPedido - jaPagoPedido))}
              </p>
            </div>
          </div>

          {/* ZONA 2 — CONDIÇÃO */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-muted-foreground text-xs">Condição original</p>
              <p className="font-medium">{proposta.condicao_original}</p>
            </div>
            {pedido.condicao_solicitada &&
              pedido.condicao_solicitada !== proposta.condicao_original && (
              <div>
                <p className="text-muted-foreground text-xs">Condição nova</p>
                <p className="font-medium text-warning">{pedido.condicao_solicitada}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Tem entrada?</p>
              <p className="font-medium">{proposta.tem_entrada ? "Sim" : "Não"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Frete</p>
              <p className="font-medium">{freteLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Qtd de itens</p>
              <p className="font-medium">{qtdItens}</p>
            </div>
          </div>

          {/* ZONA 3 — CLIENTE (recolhida) */}
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-xs mb-1">Cliente</p>
            {pedido.parceiro?.razao_social && (
              <LinhaInfo label="Razão social" value={pedido.parceiro.razao_social} copiavel={pedido.parceiro.razao_social} />
            )}
            {pedido.parceiro?.cnpj && (
              <LinhaInfo label="CNPJ" value={formatCNPJ(pedido.parceiro.cnpj)} copiavel={pedido.parceiro.cnpj} />
            )}
            {!pedido.parceiro?.cnpj && pedido.parceiro?.cpf && (
              <LinhaInfo label="CPF" value={pedido.parceiro.cpf} copiavel={pedido.parceiro.cpf} />
            )}
            <Collapsible>
              <CollapsibleTrigger className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="h-3.5 w-3.5" />
                Ver dados cadastrais
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1">
                {pedido.parceiro?.nome_fantasia && pedido.parceiro.nome_fantasia !== pedido.parceiro.razao_social && (
                  <LinhaInfo label="Nome fantasia" value={pedido.parceiro.nome_fantasia} copiavel={pedido.parceiro.nome_fantasia} />
                )}
                {pedido.parceiro?.cnpj && pedido.parceiro?.cpf && (
                  <LinhaInfo label="CPF" value={pedido.parceiro.cpf} copiavel={pedido.parceiro.cpf} />
                )}
                {pedido.parceiro?.email && (
                  <LinhaInfo label="E-mail" value={pedido.parceiro.email} copiavel={pedido.parceiro.email} />
                )}
                {pedido.parceiro?.telefone && (
                  <LinhaInfo label="Telefone" value={pedido.parceiro.telefone} copiavel={pedido.parceiro.telefone} />
                )}
                {pedido.parceiro?.cep && (
                  <LinhaInfo label="CEP" value={pedido.parceiro.cep} copiavel={pedido.parceiro.cep} />
                )}
                {(pedido.parceiro?.logradouro || pedido.parceiro?.numero) && (
                  <LinhaInfo
                    label="Logradouro"
                    value={[pedido.parceiro?.logradouro, pedido.parceiro?.numero, pedido.parceiro?.endereco_complemento].filter(Boolean).join(", ")}
                    copiavel={[pedido.parceiro?.logradouro, pedido.parceiro?.numero, pedido.parceiro?.endereco_complemento].filter(Boolean).join(", ")}
                  />
                )}
                {pedido.parceiro?.bairro && (
                  <LinhaInfo label="Bairro" value={pedido.parceiro.bairro} copiavel={pedido.parceiro.bairro} />
                )}
                {pedido.parceiro?.cidade && (
                  <LinhaInfo label="Cidade" value={pedido.parceiro.cidade} copiavel={pedido.parceiro.cidade} />
                )}
                {pedido.parceiro?.uf && (
                  <LinhaInfo label="UF" value={pedido.parceiro.uf} copiavel={pedido.parceiro.uf} />
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div>
            <p className="text-muted-foreground text-xs">Obs crédito</p>
            <p className="font-medium text-xs whitespace-pre-wrap text-foreground/80">{obsCredito}</p>
          </div>
        </CardContent>
      </Card>


      {/* Portão — primeiro pagamento à vista: regra derivada da view, nunca toggle. */}
      {exigePortao && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-sm">Portão — primeiro pagamento à vista para liberar a NF</p>
              </div>
              <Badge variant="secondary" className="gap-1.5">
                <Lock className="h-3 w-3" />
                Obrigatório
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {portaoRegraQ.data?.porque ??
                "O primeiro título será o portão (libera a NF ao ser pago). Os demais ficam aguardando NF."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Proposta editável */}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Proposta de títulos</CardTitle>
          <Button variant="outline" size="sm" onClick={handleRecalcular} title="Volta ao plano de vencimentos aprovado pelo crédito, descartando edições manuais">
            <RefreshCcw className="h-4 w-4" /> Recalcular
          </Button>
        </CardHeader>
        <CardContent>
          <ImpactoEdicaoBanner
            pedidoId={pedidoQ.data?.id}
            linhas={linhasParaImpacto}
            className="mb-2"
          />
          <div className="mb-4">
            <ReabrirAnaliseAction
              pedidoId={pedidoQ.data?.id}
              linhas={linhasParaImpacto}
            />
          </div>
          {jaPagoPedido > 0.005 && (
            <Alert className="mb-4 border-success/40 bg-success/10">
              <AlertDescription className="text-sm">
                Este pedido já tem <strong>{fmtBRL.format(jaPagoPedido)}</strong> quitado
                {jaPagoHaver > 0.005 && (
                  <> (crédito do cliente / haver: <strong>{fmtBRL.format(jaPagoHaver)}</strong>)</>
                )}
                . O valor do pedido segue sendo {fmtBRL.format(valorPedido)}, e você está
                parcelando apenas o restante:{" "}
                <strong>{fmtBRL.format(valorACobrar)}</strong>.
              </AlertDescription>
            </Alert>
          )}

          {/* Faixa de controles: total a cobrar + parcelas iguais */}
          <div className="flex flex-wrap items-end gap-4 mb-4 p-3 rounded-md border bg-muted/30">
            <div className="space-y-1">
              <Label htmlFor="valor-total-cobrar" className="text-xs text-muted-foreground">
                Valor total a cobrar
              </Label>
              <Input
                id="valor-total-cobrar"
                type="number"
                step="0.01"
                min="0"
                value={valorTotalCobrar}
                onChange={(e) => handleValorTotalChange(Number(e.target.value))}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dias-primeiro-pagamento" className="text-xs text-muted-foreground">
                Dias do primeiro pagamento
              </Label>
              <Input
                id="dias-primeiro-pagamento"
                type="number"
                min="0"
                step="1"
                value={diasPrimeiroPagamento}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setDiasPrimeiroPagamento(Number.isFinite(n) && n >= 0 ? n : 0);
                }}
                className="h-9 w-40"
              />
              <p className="text-[11px] text-muted-foreground max-w-[16rem]">
                Padrão vem da condição aprovada pelo crédito. Aumentar o prazo pode exigir nova análise.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="intervalo-parcelas" className="text-xs text-muted-foreground">
                Intervalo entre parcelas (dias)
              </Label>
              <Input
                id="intervalo-parcelas"
                type="number"
                min="0"
                step="1"
                value={intervaloDias}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setIntervaloDias(Number.isFinite(n) && n >= 0 ? n : 0);
                }}
                className="h-9 w-40"
              />
              <p className="text-[11px] text-muted-foreground">
                Vale só para parcelas adicionadas manualmente — o espaçamento das
                parcelas da proposta vem da condição aprovada.
              </p>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Checkbox
                id="parcelas-iguais"
                checked={parcelasIguais}
                onCheckedChange={(c) => handleParcelasIguaisChange(c === true)}
              />
              <Label htmlFor="parcelas-iguais" className="text-sm cursor-pointer">
                Parcelas iguais
              </Label>
            </div>
            {haverDisponivel && (
              <div className="space-y-1 ml-auto rounded-md border bg-success/10 p-3">
                <p className="text-xs font-medium">Crédito do cliente (haver)</p>
                <p className="text-sm font-medium">{fmtBRL.format(haverSaldo)}</p>
                <p className="text-xs text-muted-foreground">disponível na conta do cliente</p>
                <p className="text-[11px] text-muted-foreground">
                  Aplicar registra o crédito neste pedido.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setAplicarHaverOpen(true)}
                >
                  Aplicar crédito
                </Button>
              </div>
            )}
          </div>


          {/* Resumo da composição de pagamento */}
          <p className="text-xs text-muted-foreground mb-2">
            Plano: {titulos.length} linha(s) · total {fmtBRL.format(totalEditado)} ·{" "}
            {qtdPortao} de portão somando {fmtBRL.format(totalPortao)}
            {exigePortao && (
              <>
                {" "}· este pedido exige portão
                {totalPortao <= 0.005
                  ? " — marque ao menos uma linha como portão"
                  : ` (cobertura de ${pctPortao.toFixed(0)}% do plano; mínimo exigido ${portaoMinimoPct.toFixed(0)}%)`}
              </>
            )}
            {jaPagoPedido > 0.005 && (
              <>
                {" "}· {fmtBRL.format(jaPagoPedido)} já coberto por crédito do cliente — não cobrar esta parte
              </>
            )}
          </p>

          {creditoAplicado > 0.005 && (
            <div className="flex items-center justify-between rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm">
              <span className="text-success">
                Crédito do cliente já abatido deste pedido — não entra no plano
              </span>
              <span className="font-medium text-success">
                −{fmtBRL.format(creditoAplicado)}
              </span>
            </div>
          )}

          {planoEditado && (
            <p className="mb-2 text-xs text-warning">
              Plano editado e ainda não materializado.
            </p>
          )}

          {/* Regra do portão explicada ANTES do clique */}
          {exigePortao && (
            <div
              className={
                "mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm " +
                (coberturaPortaoOk
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-warning/40 bg-warning/10 text-warning")
              }
            >
              {coberturaPortaoOk ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                {coberturaPortaoOk ? (
                  <span>Cobertura suficiente para liberar.</span>
                ) : (
                  <span>
                    Faltam <strong>{fmtBRL.format(faltaPortaoRS)}</strong> para liberar este pedido — marque
                    mais parcelas como pagamento antecipado.
                  </span>
                )}
                <span className="block text-xs opacity-80">
                  Antecipado hoje: {fmtBRL.format(totalPortao)} ({pctPortao.toFixed(0)}% do plano) · mínimo
                  exigido: {portaoMinimoPct.toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="w-20">Portão</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Link pagamento</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {titulos.map((t, idx) => {
                  const dataInvalida = t.data_vencimento < todayISO();
                  const valorInvalido = Number(t.valor_bruto) <= 0;
                  const tipoDesabilitado = pedidoQ.data?.estagio !== "cobranca";

                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">
                        {t.numero_parcela}/{t.total_parcelas}
                      </TableCell>
                      <TableCell>
                        {t.eh_entrada ? (
                          <Badge>Entrada</Badge>
                        ) : (
                          <Badge variant="outline">Parcela</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {tipoDesabilitado ? (
                          <span className="text-sm capitalize">{t.tipo_pagamento}</span>
                        ) : (
                          <Select
                            value={t.tipo_pagamento}
                            onValueChange={(v) =>
                              atualizarTitulo(idx, {
                                tipo_pagamento: v as TituloProposto["tipo_pagamento"],
                              })
                            }
                          >
                            <SelectTrigger className="h-9 w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pix">PIX</SelectItem>
                              <SelectItem value="boleto">Boleto</SelectItem>
                              <SelectItem value="cartao">Cartão</SelectItem>
                              <SelectItem value="conta_corrente">Conta Corrente (Parceiro)</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <span title="Esta linha bloqueia a liberação do pedido até ser paga.">
                          <Switch
                            checked={!!t.eh_portao}
                            onCheckedChange={(v) => atualizarTitulo(idx, { eh_portao: v })}
                            aria-label="Linha de portão"
                          />
                        </span>
                      </TableCell>

                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={t.valor_bruto}
                          disabled={parcelasIguais}
                          readOnly={parcelasIguais}
                          onChange={(e) =>
                            atualizarTitulo(idx, { valor_bruto: Number(e.target.value) })
                          }
                          className={`h-9 w-32 ml-auto text-right ${valorInvalido ? "border-destructive" : ""}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={t.data_vencimento}
                          onChange={(e) => handleDataChange(idx, e.target.value)}
                          className={`h-9 w-40 ${dataInvalida ? "border-destructive" : ""}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.condicao_pagamento}
                      </TableCell>
                      <TableCell>
                        {t.tipo_pagamento === "conta_corrente" ? (
                          <span className="text-xs text-muted-foreground">
                            Não se aplica
                          </span>
                        ) : (
                          <Input
                            type="url"
                            placeholder="https://..."
                            value={t.link_pagamento ?? ""}
                            onChange={(e) =>
                              atualizarTitulo(idx, { link_pagamento: e.target.value || undefined })
                            }
                            className="h-9 w-56 text-xs"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoverParcela(idx)}
                          disabled={titulos.length <= 1}
                          title="Remover parcela"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-medium">
                    Total
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      temDivergenciaGrave
                        ? "text-destructive"
                        : temDivergenciaLeve
                          ? "text-warning"
                          : ""
                    }`}
                  >
                    {fmtBRL.format(totalEditado)}
                  </TableCell>
                  <TableCell colSpan={4} className="text-xs text-muted-foreground">
                    Pedido: {fmtBRL.format(valorPedido)}
                    {creditoAplicado > 0.005 && (
                      <> · líquido {fmtBRL.format(pedido.valor_liquido)}</>
                    )}
                    {jaPagoPedido > 0.005 && (
                      <> · já pago {fmtBRL.format(jaPagoPedido)} · a cobrar {fmtBRL.format(valorACobrar)}</>
                    )}
                    {titulos.length > 0 && (
                      <> · {titulos.length}x de {fmtBRL.format(valorACobrar / titulos.length)}</>
                    )}
                    {Math.abs(diff) > 0.005 && (
                      <> · diferença {fmtBRL.format(diff)}</>
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={handleAdicionarParcela}>
              <Plus className="h-4 w-4" /> Adicionar parcela
            </Button>
          </div>


          {(temDivergenciaGrave || temValorInvalido || temDataPassada) && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {temValorInvalido && <div>Há títulos com valor zero ou negativo.</div>}
                {temDataPassada && (
                  <div>Há vencimentos anteriores a hoje.</div>
                )}
                {temDivergenciaGrave && (
                  <div>
                    Total dos títulos diverge em mais de 1% do valor do pedido (
                    {fmtBRL.format(diff)}).
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3 mt-6">
            {isSuperAdmin && (
              <Button
                variant="ghost"
                onClick={() => setAjustarDescontoOpen(true)}
                disabled={montarPlano.isPending}
              >
                Ajustar desconto
              </Button>
            )}
            {!pagamentoNoPainel && (
              <Button
                variant="ghost"
                onClick={() => setEditarCondicaoOpen(true)}
                disabled={montarPlano.isPending}
              >
                Alterar pagamento
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate(voltarPara)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAceitar}
              disabled={!podeMaterializar || montarPlano.isPending || !coberturaPortaoOk}
              title={
                !coberturaPortaoOk
                  ? `Faltam ${fmtBRL.format(faltaPortaoRS)} marcados como pagamento antecipado para atingir o mínimo de ${portaoMinimoPct.toFixed(0)}% exigido neste pedido.`
                  : undefined
              }
            >
              {montarPlano.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Aceitar e montar plano
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar plano de pagamento</DialogTitle>
            <DialogDescription>
              <>
                Serão criadas <strong>{titulos.length}</strong> linha
                {titulos.length !== 1 ? "s" : ""} totalizando{" "}
                <strong>{fmtBRL.format(totalEditado)}</strong>, das quais{" "}
                <strong>{qtdPortao}</strong> de portão somando{" "}
                <strong>{fmtBRL.format(totalPortao)}</strong>.
                {qtdPortao > 0 && (
                  <> O pedido só é liberado quando todas as linhas de portão estiverem pagas.</>
                )}
              </>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={montarPlano.isPending}
            >
              Voltar
            </Button>
            <Button onClick={handleConfirmar} disabled={montarPlano.isPending}>
              {montarPlano.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <EditarCondicaoPagamentoDialog
        open={editarCondicaoOpen}
        onClose={() => setEditarCondicaoOpen(false)}
        pedidoId={pedidoQ.data?.id ?? ""}
        idExterno={pedidoQ.data?.id_externo ?? ""}
      />

      <AjustarDescontoDialog
        open={ajustarDescontoOpen}
        onClose={() => setAjustarDescontoOpen(false)}
        pedidoId={pedidoQ.data?.id ?? ""}
        idExterno={pedidoQ.data?.id_externo ?? ""}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        valorBruto={Number((pedidoQ.data as any)?.valor_bruto ?? 0)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bonusPixValor={Number((pedidoQ.data as any)?.bonus_pix_valor ?? 0)}
        condicaoAtual={proposta?.condicao_original ?? pedidoQ.data?.condicao_solicitada ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        estagio={(pedidoQ.data as any)?.estagio ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freteTipo={(pedidoQ.data as any)?.frete_tipo ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        valorFrete={Number((pedidoQ.data as any)?.valor_frete ?? 0)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        descontoAtualValor={Number((pedidoQ.data as any)?.desconto_celebra_valor ?? 0)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        descontoAtualPct={Number((pedidoQ.data as any)?.desconto_pct ?? 0)}
      />

      {pedidoQ.data?.id && (pedidoQ.data as any)?.parceiro_id && (
        <AplicarHaverPedidoDialog
          open={aplicarHaverOpen}
          onOpenChange={setAplicarHaverOpen}
          pedidoId={pedidoQ.data.id}
          idExterno={pedidoQ.data.id_externo ?? ""}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          valorLiquido={Number((pedidoQ.data as any)?.valor_liquido ?? 0)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parceiroId={(pedidoQ.data as any).parceiro_id}
        />
      )}
    </PageShell>
  );
}
