import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { ArrowLeft, Loader2, RefreshCcw, AlertTriangle, Copy, Check, Mail, Plus, Trash2, Lock } from "lucide-react";

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
import { EditarCondicaoPagamentoDialog } from "@/components/pedidos/dialogs/EditarCondicaoPagamentoDialog";
import { usePedidoEdicaoCampo } from "@/hooks/pedidos/usePedidoEdicaoCampo";
import { AjustarDescontoDialog } from "@/components/pedidos/dialogs/AjustarDescontoDialog";
import { ImpactoEdicaoBanner } from "@/components/pedidos/ImpactoEdicaoBanner";
import { ReabrirAnaliseAction } from "@/components/pedidos/ReabrirAnaliseAction";
import { LinkPagamentoCard } from "@/components/pedidos/LinkPagamentoCard";
import { PortaoLinksPanel } from "@/components/pedidos/PortaoLinksPanel";
import { useVoltarParaOrigem } from "@/hooks/useVoltarParaOrigem";
import { useMontarPlanoPagamento } from "@/hooks/credito/useMontarPlanoPagamento";


const DIAS_PRIMEIRO_PAGAMENTO_FALLBACK = 9;
const INTERVALO_PARCELAS_FALLBACK = 30;

/** COMPOSIÇÃO DE PAGAMENTO: portão é atributo da linha, não "a primeira parcela". */
type LinhaPlano = TituloProposto & { eh_portao?: boolean };


function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function parseDiasCondicao(condicao: string | undefined | null): number {
  if (!condicao) return 0;
  const m = String(condicao).match(/(\d+)\s*dia/i);
  return m ? parseInt(m[1], 10) : 0;
}

function addDiasISO(iso: string, dias: number): string {
  if (!iso) return iso;
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
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
          id, id_externo, estagio, data_pedido, valor_bruto, valor_liquido, bonus_pix_valor, condicao_solicitada, parceiro_id,
          itens_json, frete_tipo, valor_frete, exige_portao,
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

function CobrancaStepper({ fase }: { fase: 1 | 2 | 3 }) {
  const ativo  = "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 bg-primary border-primary text-primary-foreground";
  const feito  = "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 bg-emerald-500 border-emerald-500 text-white";
  const futuro = "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 bg-background border-border text-muted-foreground";
  const linhaVerde = "flex-1 h-0.5 mx-3 bg-emerald-400";
  const linhaCinza = "flex-1 h-0.5 mx-3 bg-border";

  return (
    <div className="flex items-center py-3 px-4 bg-muted/30 rounded-lg border border-border/50">
      {/* Step 1 */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={fase > 1 ? feito : fase === 1 ? ativo : futuro}>
          {fase > 1 ? <Check className="h-3.5 w-3.5" /> : "1"}
        </div>
        <span className={"text-sm " + (fase === 1 ? "font-semibold" : fase > 1 ? "text-emerald-600" : "text-muted-foreground")}>
          Criar link / boleto
        </span>
      </div>
      <div className={fase > 1 ? linhaVerde : linhaCinza} />
      {/* Step 2 */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={fase > 2 ? feito : fase === 2 ? ativo : futuro}>
          {fase > 2 ? <Check className="h-3.5 w-3.5" /> : "2"}
        </div>
        <span className={"text-sm " + (fase === 2 ? "font-semibold" : fase > 2 ? "text-emerald-600" : "text-muted-foreground")}>
          Link / boleto criado
        </span>
      </div>
      <div className={fase > 2 ? linhaVerde : linhaCinza} />
      {/* Step 3 */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={fase === 3 ? feito : futuro}>
          {fase === 3 ? <Check className="h-3.5 w-3.5" /> : "3"}
        </div>
        <span className={"text-sm " + (fase === 3 ? "text-emerald-600 font-semibold" : "text-muted-foreground")}>
          Link / boleto enviado
        </span>
      </div>
    </div>
  );
}

function GerenciarLinksPagamento({ pedido }: { pedido: any }) {
  const navigate = useNavigate();
  const voltarPara = useVoltarParaOrigem("/recebimento/cobranca");
  const { toast } = useToast();
  const [datas, setDatas] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [alterarPagtoOpen, setAlterarPagtoOpen] = useState(false);

  const titulosQ = useQuery({
    queryKey: ["gerenciar-links", pedido.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, numero_parcela, total_parcelas, valor_bruto, data_vencimento_atual, tipo_pagamento, status, link_pagamento, boleto_status, email_cobranca_enviado_em, boleto_enviado_em")
        .eq("pedido_id", pedido.id)
        .not("status", "in", "(cancelado,cancelado_recuperacao,renegociado,pago,pago_com_atraso,pago_judicial,baixado_por_perda)")
        .order("numero_parcela");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const emailLogQ = useQuery({
    queryKey: ["cobranca-email-log", pedido.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedido_email_log")
        .select("id")
        .eq("pedido_id", pedido.id)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!pedido.id,
  });

  useEffect(() => {
    if (titulosQ.data) {
      const initDatas: Record<string, string> = {};
      titulosQ.data.forEach((t: any) => {
        initDatas[t.id] = t.data_vencimento_atual ?? "";
      });
      setDatas(initDatas);
    }
  }, [titulosQ.data]);

  const fasePagamento: 1 | 2 | 3 = useMemo(() => {
    const ts = titulosQ.data ?? [];
    const jaEnviado = ts.some((t: any) => t.email_cobranca_enviado_em || t.boleto_enviado_em) || !!emailLogQ.data;
    if (jaEnviado) return 3;
    if (ts.some((t: any) => t.link_pagamento || t.boleto_status === "registrado")) return 2;
    return 1;
  }, [titulosQ.data, emailLogQ.data]);

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      for (const t of titulosQ.data ?? []) {
        const novaData = datas[t.id] ?? "";
        const atualData = t.data_vencimento_atual ?? "";
        const changed: Record<string, any> = {};
        if (novaData && novaData !== atualData) changed.data_vencimento_atual = novaData;
        if (Object.keys(changed).length > 0) {
          const { error } = await (supabase as any)
            .from("titulo_a_receber")
            .update(changed)
            .eq("id", t.id);
          if (error) throw error;
        }
      }
      toast({ title: "Salvo!", description: "Vencimentos atualizados com sucesso." });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Recebimento", to: "/recebimento" },
          { label: "Cobrança", to: "/recebimento/cobranca" },
          { label: pedido.id_externo ?? "—" },
        ]}
        title={`Links de Pagamento — ${pedido.id_externo ?? ""}`}
        subtitle="Link de pagamento único do pedido e vencimentos dos títulos em aberto."
      />

      <CobrancaStepper fase={fasePagamento} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Títulos em aberto</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAlterarPagtoOpen(true)}
            >
              Alterar pagamento
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <LinkPagamentoCard pedidoId={pedido.id} className="mb-4" />

          {titulosQ.isLoading && <Skeleton className="h-40 w-full" />}

          {!titulosQ.isLoading && <PortaoLinksPanel pedidoId={pedido.id} />}

          {titulosQ.data && titulosQ.data.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Parcela</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {titulosQ.data.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm font-medium">
                        {t.numero_parcela}/{t.total_parcelas}
                      </TableCell>
                      <TableCell className="text-sm">
                        {fmtBRL.format(Number(t.valor_bruto))}
                      </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      value={datas[t.id] ?? ""}
                      onChange={(e) =>
                        setDatas((prev) => ({ ...prev, [t.id]: e.target.value }))
                      }
                      className="h-8 w-36 text-xs"
                    />
                  </TableCell>
                      <TableCell className="text-sm capitalize">
                        {t.tipo_pagamento ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}


          <div className="mt-6">
            <ComunicacaoPedidoPanel
              pedido_id={pedido.id}
              parceiro_id={pedido.parceiro_id}
              estagio={pedido.estagio}
              exige_portao={!!(pedido as any).exige_portao}
            />
          </div>

          <div className="flex justify-between mt-6">
            <SmartBackButton fallback="/recebimento/cobranca" fallbackLabel="Voltar" />
            <div className="flex gap-2">
              <Button
                onClick={handleSalvar}
                disabled={salvando || titulosQ.isLoading || titulosQ.data?.length === 0}
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Salvar vencimentos
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <ReverterParaCobrancaDialog
        open={alterarPagtoOpen}
        onClose={() => setAlterarPagtoOpen(false)}
        pedidoId={pedido.id}
        idExterno={pedido.id_externo}
        estagio="cobranca"
        motivoAlterarPagamento
      />
    </div>
  );
}

export default function CobrancaDetalhe() {

  const { pedidoId } = useParams<{ pedidoId: string }>();
  const navigate = useNavigate();
  const voltarPara = useVoltarParaOrigem("/recebimento/cobranca");
  const { toast } = useToast();

  const pedidoQ = usePedidoMinimo(pedidoId);
  const portaoRegraQ = usePedidoPortaoRegra(pedidoId);
  const propostaQ = usePropostaCobranca(pedidoId);
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
  const haverDisponivel = !exigePortao && haverSaldo > 0;

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
  const [valorHaverAplicar, setValorHaverAplicar] = useState<number>(0);
  const baseCobravel = Math.max(
    0,
    Number((pedidoQ.data as any)?.valor_liquido ?? 0) - jaPagoPedido,
  );
  const maxHaver = Math.min(haverSaldo, baseCobravel);

  const handleAplicarHaver = (v: number) => {
    const aplicar = Math.max(0, Math.min(Number.isFinite(v) ? v : 0, maxHaver));
    setValorHaverAplicar(aplicar);
    const novoTotal = Math.max(0, baseCobravel - aplicar);
    setValorTotalCobrar(novoTotal);
    setTitulos((prev) => redistribuirValoresIguais(prev, novoTotal));
  };

  const paramDiasQ = useParametros("dias_primeiro_pagamento");
  const paramIntervaloQ = useParametros("intervalo_entre_parcelas");

  // Aplica 1ª data = hoje + dias e cascateia as demais por offset cumulativo (i * intervalo)
  const aplicarPrimeiraDataECascata = (
    lista: TituloProposto[],
    dias: number,
    intervalo: number,
  ): TituloProposto[] => {
    if (lista.length === 0) return lista;
    const primeiraData = addDiasISO(todayISO(), dias);
    return lista.map((t, i) => {
      const dataVenc = i === 0 ? primeiraData : addDiasISO(primeiraData, i * intervalo);
      return {
        ...t,
        data_vencimento: dataVenc,
        condicao_pagamento: calcularCondicaoLabel(dataVenc, t.eh_entrada),
      };
    });
  };

  // hidrata estado local quando a proposta chega
  useEffect(() => {
    if (!propostaQ.data?.titulos_propostos) return;
    if (paramDiasQ.isLoading || paramIntervaloQ.isLoading) return;

    const vDias = Number(paramDiasQ.data?.[0]?.valor);
    const vIntervalo = Number(paramIntervaloQ.data?.[0]?.valor);
    const diasUsar = Number.isFinite(vDias) && vDias >= 0 ? vDias : DIAS_PRIMEIRO_PAGAMENTO_FALLBACK;
    const intervaloUsar = Number.isFinite(vIntervalo) && vIntervalo >= 0 ? vIntervalo : INTERVALO_PARCELAS_FALLBACK;

    setDiasPrimeiroPagamento(diasUsar);
    setIntervaloDias(intervaloUsar);

    const novos: LinhaPlano[] = propostaQ.data.titulos_propostos.map((t) => ({ ...t, eh_portao: false }));
    // LINHA UNICA: se a regra exige portao e so ha uma parcela, ela nasce marcada.
    // Com duas ou mais, a escolha continua do operador (composicao).
    if (exigePortao && novos.length === 1) {
      novos[0].eh_portao = true;
    }
    setTitulos(aplicarPrimeiraDataECascata(novos, diasUsar, intervaloUsar));

    const somaProposta = novos.reduce((acc, t) => acc + Number(t.valor_bruto || 0), 0);
    const bruto = Number(pedidoQ.data?.valor_liquido ?? propostaQ.data?.valor_total ?? somaProposta);
    const novoTotal = Math.max(0, bruto - creditoAplicado);
    setValorTotalCobrar(novoTotal);
    if (creditoAplicado > 0.005 || jaPagoPedido > 0.005) setTitulos((prev) => redistribuirValoresIguais(prev, novoTotal));
    setParcelasIguais(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostaQ.data, pedidoQ.data?.valor_liquido, creditoAplicado, jaPagoPedido, paramDiasQ.isLoading, paramIntervaloQ.isLoading, exigePortao]);


  // A proposta nasce pelo que FALTA cobrar, não pelo valor da nota. `montar_plano_pagamento`
  // reconcilia com `novas + pagas + haver = líquido`, então o plano cheio seria recusado.
  const valorPedido = Number(pedidoQ.data?.valor_liquido ?? propostaQ.data?.valor_total ?? 0);
  const dataPedidoStr: string | undefined = pedidoQ.data?.data_pedido;

  const totalEditado = useMemo(
    () => titulos.reduce((acc, t) => acc + Number(t.valor_bruto || 0), 0),
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



  const temValorInvalido = titulos.some((t) => Number(t.valor_bruto) <= 0);
  const temDataPassada = !!dataPedidoStr && titulos.some(
    (t) => t.data_vencimento < dataPedidoStr,
  );

  const atualizarTitulo = (idx: number, patch: Partial<LinhaPlano>) => {
    setTitulos((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };


  const handleValorTotalChange = (v: number) => {
    setValorTotalCobrar(v);
    if (parcelasIguais) {
      setTitulos((prev) => redistribuirValoresIguais(prev, v));
    }
  };

  const handleParcelasIguaisChange = (checked: boolean) => {
    setParcelasIguais(checked);
    if (checked) {
      setTitulos((prev) => redistribuirValoresIguais(prev, valorTotalCobrar));
    }
  };

  const handleDataChange = (idx: number, novaData: string) => {
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
    setTitulos((prev) => {
      const ultima = prev[prev.length - 1];
      const novaData = ultima
        ? addDiasISO(ultima.data_vencimento, intervaloDias)
        : addDiasISO(todayISO(), diasPrimeiroPagamento);
      const novo: LinhaPlano = {
        ordem: prev.length,
        numero_parcela: prev.length + 1,
        total_parcelas: prev.length + 1,
        eh_entrada: false,
        eh_portao: false,
        tipo_pagamento: ultima?.tipo_pagamento ?? "boleto",
        valor_bruto: 0,
        data_vencimento: novaData,
        condicao_pagamento: calcularCondicaoLabel(novaData, false),
      };
      const nova = renumerar([...prev, novo]);
      return parcelasIguais ? redistribuirValoresIguais(nova, valorTotalCobrar) : nova;
    });
  };


  const handleRemoverParcela = (idx: number) => {
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
        description: "Vencimentos não podem ser anteriores à data do pedido.",
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
      { onSettled: () => setConfirmOpen(false) },
    );
  };


  const handleRecalcular = () => {
    setTitulos((prev) => {
      if (prev.length === 0) return prev;
      const comDatas = aplicarPrimeiraDataECascata(prev, diasPrimeiroPagamento, intervaloDias);
      return parcelasIguais ? redistribuirValoresIguais(comDatas, valorTotalCobrar) : comDatas;
    });
  };

  // Loading
  if (pedidoQ.isLoading || propostaQ.isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Erro ao carregar pedido (query falhou)
  if (pedidoQ.error) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar pedido: {(pedidoQ.error as Error).message}
          </AlertDescription>
        </Alert>
        <Button variant="ghost" onClick={() => navigate(voltarPara)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  // Pedido não encontrado
  if (!pedidoQ.data) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        <Alert variant="destructive">
          <AlertDescription>Pedido não encontrado.</AlertDescription>
        </Alert>
        <Button variant="ghost" className="mt-4" onClick={() => navigate(voltarPara)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  // Pedido já saiu de 'cobranca' — modo edição de links
  if (pedidoQ.data.estagio !== "cobranca") {
    return <GerenciarLinksPagamento pedido={pedidoQ.data} />;
  }


  // Erro na RPC de proposta
  if (propostaQ.error) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao calcular proposta: {(propostaQ.error as Error).message}
          </AlertDescription>
        </Alert>
        <Button variant="ghost" onClick={() => navigate(voltarPara)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
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
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6 animate-casa-fade-in">
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

      <CobrancaStepper fase={titulos.some((t) => t.link_pagamento) ? 2 : 1} />

      {/* Resumo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo do pedido</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="md:col-span-2">
            <p className="text-muted-foreground text-xs mb-1">Cliente</p>
            {pedido.parceiro?.razao_social && (
              <LinhaInfo label="Razão social" value={pedido.parceiro.razao_social} copiavel={pedido.parceiro.razao_social} />
            )}
            {pedido.parceiro?.nome_fantasia && pedido.parceiro.nome_fantasia !== pedido.parceiro.razao_social && (
              <LinhaInfo label="Nome fantasia" value={pedido.parceiro.nome_fantasia} copiavel={pedido.parceiro.nome_fantasia} />
            )}
            {pedido.parceiro?.cnpj && (
              <LinhaInfo label="CNPJ" value={formatCNPJ(pedido.parceiro.cnpj)} copiavel={pedido.parceiro.cnpj} />
            )}
            {pedido.parceiro?.cpf && (
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
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Valor bruto</p>
            <p className="font-medium">{fmtBRL.format(valorBrutoCalc)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Desconto</p>
            <p className="font-medium">
              {descontoRS > 0
                ? `${descontoPct.toFixed(descontoPct >= 10 ? 0 : 1)}% · ${fmtBRL.format(descontoRS)}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Valor total</p>
            <p className="font-medium">{fmtBRL.format(valorPedido)}</p>
          </div>
          {jaPagoPedido > 0.005 && (
            <div>
              <p className="text-muted-foreground text-xs">
                {jaAdiantado > 0.005 ? "Crédito do cliente aplicado" : "Já pago"}
              </p>
              <p className="font-medium text-emerald-700">
                −{fmtBRL.format(jaPagoPedido)}
              </p>
            </div>
          )}
          {jaPagoPedido > 0.005 && (
            <div>
              <p className="text-muted-foreground text-xs">A cobrar</p>
              <p className="font-medium">
                {fmtBRL.format(Math.max(0, valorPedido - jaPagoPedido))}
              </p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">Frete</p>
            <p className="font-medium">{freteLabel}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Qtd de itens</p>
            <p className="font-medium">{qtdItens}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Condição original</p>

            <p className="font-medium">{proposta.condicao_original}</p>
          </div>
          {pedido.condicao_solicitada &&
            pedido.condicao_solicitada !== proposta.condicao_original && (
            <div>
              <p className="text-muted-foreground text-xs">Condição nova</p>
              <p className="font-medium text-amber-600">{pedido.condicao_solicitada}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">Tem entrada?</p>
            <p className="font-medium">{proposta.tem_entrada ? "Sim" : "Não"}</p>
          </div>
          <div className="md:col-span-4">
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
                <p className="font-semibold text-sm">Portão — primeiro pagamento à vista para liberar a NF</p>
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
          <Button variant="outline" size="sm" onClick={handleRecalcular}>
            <RefreshCcw className="h-4 w-4" /> Recalcular
          </Button>
        </CardHeader>
        <CardContent>
          <ImpactoEdicaoBanner
            pedidoId={pedidoQ.data?.id}
            novaCondicao={proposta.condicao_original}
            novoValorLiquido={totalEditado}
            className="mb-2"
          />
          <div className="mb-4">
            <ReabrirAnaliseAction
              pedidoId={pedidoQ.data?.id}
              novaCondicao={proposta.condicao_original}
              novoValorLiquido={totalEditado}
            />
          </div>
          {jaPagoPedido > 0.005 && (
            <Alert className="mb-4 border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20">
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
              <div className="space-y-1 ml-auto rounded-md border bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                <Label htmlFor="aplicar-haver" className="text-xs font-medium">
                  Crédito do cliente (haver)
                </Label>
                <p className="text-xs text-muted-foreground">
                  {fmtBRL.format(haverSaldo)} disponível
                </p>
                <Input
                  id="aplicar-haver"
                  type="number"
                  step="0.01"
                  min={0}
                  max={maxHaver}
                  value={valorHaverAplicar}
                  onChange={(e) => handleAplicarHaver(Number(e.target.value))}
                  placeholder="Aplicar"
                  className="h-9 w-40"
                />
                <p className="text-[11px] text-muted-foreground">
                  Líquido a cobrar: {fmtBRL.format(valorTotalCobrar)}
                </p>
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
                  : ` (cobertura de ${pctPortao.toFixed(0)}% do plano; o mínimo é validado no banco ao confirmar)`}
              </>
            )}
            {jaPagoPedido > 0.005 && (
              <>
                {" "}· {fmtBRL.format(jaPagoPedido)} já coberto por crédito do cliente — não cobrar esta parte
              </>
            )}
          </p>

          {creditoAplicado > 0.005 && (
            <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
              <span className="text-emerald-800 dark:text-emerald-200">
                Crédito do cliente já abatido deste pedido — não entra no plano
              </span>
              <span className="font-semibold text-emerald-800 dark:text-emerald-200">
                −{fmtBRL.format(creditoAplicado)}
              </span>
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
                  const dataInvalida = !!dataPedidoStr && t.data_vencimento < dataPedidoStr;
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
                    className={`text-right font-semibold ${
                      temDivergenciaGrave
                        ? "text-destructive"
                        : temDivergenciaLeve
                          ? "text-amber-600"
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
                  <div>Há vencimentos anteriores à data do pedido.</div>
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
              disabled={!podeMaterializar || montarPlano.isPending}
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
                {valorHaverAplicar > 0 && (
                  <> {" "}Haver aplicado: <strong>{fmtBRL.format(valorHaverAplicar)}</strong>.</>
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
      />
    </div>
  );
}
