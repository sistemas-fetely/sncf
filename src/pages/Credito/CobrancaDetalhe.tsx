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
import { ArrowLeft, Loader2, RefreshCcw, AlertTriangle, Copy, Check, Mail, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePropostaCobranca } from "@/hooks/credito/usePropostaCobranca";
import { useMaterializarCobranca } from "@/hooks/credito/useMaterializarCobranca";
import { useCriarPortaoProvisorio } from "@/hooks/credito/useCriarPortaoProvisorio";
import { usePermissions } from "@/hooks/usePermissions";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { TituloProposto } from "@/types/credito";
import { formatCNPJ } from "@/lib/cnpj";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useParametros } from "@/hooks/useParametros";
import { EnviarEmailCobrancaDialog } from "@/components/pedidos/dialogs/EnviarEmailCobrancaDialog";
import { AlterarFormaPagamentoDialog } from "@/components/pedidos/dialogs/AlterarFormaPagamentoDialog";
import { EditarCondicaoPagamentoDialog } from "@/components/pedidos/dialogs/EditarCondicaoPagamentoDialog";

const DIAS_PRIMEIRO_PAGAMENTO_FALLBACK = 9;

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
          id, id_externo, estagio, data_pedido, valor_liquido, condicao_solicitada, parceiro_id,
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
  const { toast } = useToast();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [datas, setDatas] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
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

  useEffect(() => {
    if (titulosQ.data) {
      const initLinks: Record<string, string> = {};
      const initDatas: Record<string, string> = {};
      titulosQ.data.forEach((t: any) => {
        initLinks[t.id] = t.link_pagamento ?? "";
        initDatas[t.id] = t.data_vencimento_atual ?? "";
      });
      setLinks(initLinks);
      setDatas(initDatas);
    }
  }, [titulosQ.data]);

  const fasePagamento: 1 | 2 | 3 = useMemo(() => {
    const ts = titulosQ.data ?? [];
    if (ts.some((t: any) => t.email_cobranca_enviado_em || t.boleto_enviado_em)) return 3;
    if (ts.some((t: any) => t.link_pagamento || t.boleto_status === "registrado")) return 2;
    return 1;
  }, [titulosQ.data]);

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      for (const t of titulosQ.data ?? []) {
        const novoLink = links[t.id] ?? "";
        const atualLink = t.link_pagamento ?? "";
        const novaData = datas[t.id] ?? "";
        const atualData = t.data_vencimento_atual ?? "";
        const changed: Record<string, any> = {};
        if (novoLink !== atualLink) changed.link_pagamento = novoLink || null;
        if (novaData && novaData !== atualData) changed.data_vencimento_atual = novaData;
        if (Object.keys(changed).length > 0) {
          const { error } = await (supabase as any)
            .from("titulo_a_receber")
            .update(changed)
            .eq("id", t.id);
          if (error) throw error;
        }
      }
      toast({ title: "Salvo!", description: "Títulos atualizados com sucesso." });
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
        subtitle="Edite o link de pagamento dos títulos em aberto."
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
          {titulosQ.isLoading && <Skeleton className="h-40 w-full" />}

          {!titulosQ.isLoading && titulosQ.data?.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">Nenhum título em aberto para este pedido.</p>
          )}

          {titulosQ.data && titulosQ.data.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Parcela</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Link de pagamento</TableHead>
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
                      <TableCell>
                        <Input
                          type="url"
                          placeholder="https://..."
                          value={links[t.id] ?? ""}
                          onChange={(e) =>
                            setLinks((prev) => ({ ...prev, [t.id]: e.target.value }))
                          }
                          className="h-8 w-80 text-xs"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setEmailOpen(true)}
                disabled={!pedido.parceiro_id}
              >
                <Mail className="h-4 w-4 mr-1" /> Enviar cobrança
              </Button>
              <Button
                onClick={handleSalvar}
                disabled={salvando || titulosQ.isLoading || titulosQ.data?.length === 0}
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Salvar links
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <EnviarEmailCobrancaDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        pedido_id={pedido.id}
        parceiro_id={pedido.parceiro_id}
      />
      <AlterarFormaPagamentoDialog
        open={alterarPagtoOpen}
        onClose={() => setAlterarPagtoOpen(false)}
        pedidoId={pedido.id}
        idExterno={pedido.id_externo}
        temTitulosComEmailEnviado={(titulosQ.data ?? []).some((t: any) => t.email_cobranca_enviado_em != null)}
      />
    </div>
  );
}

export default function CobrancaDetalhe() {

  const { pedidoId } = useParams<{ pedidoId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const pedidoQ = usePedidoMinimo(pedidoId);
  const propostaQ = usePropostaCobranca(pedidoId);
  const materializar = useMaterializarCobranca();
  const criarPortao = useCriarPortaoProvisorio();
  const { isSuperAdmin } = usePermissions();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exigePortao = !!(pedidoQ.data as any)?.exige_portao;

  const [titulos, setTitulos] = useState<TituloProposto[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editarCondicaoOpen, setEditarCondicaoOpen] = useState(false);
  const [valorTotalCobrar, setValorTotalCobrar] = useState<number>(0);
  const [parcelasIguais, setParcelasIguais] = useState<boolean>(false);
  const [diasPrimeiroPagamento, setDiasPrimeiroPagamento] = useState<number>(DIAS_PRIMEIRO_PAGAMENTO_FALLBACK);

  const paramDiasQ = useParametros("dias_primeiro_pagamento");

  // Aplica 1ª data = hoje + dias e cascateia as demais a partir dela (preserva 30/60/90)
  const aplicarPrimeiraDataECascata = (
    lista: TituloProposto[],
    dias: number,
  ): TituloProposto[] => {
    if (lista.length === 0) return lista;
    const primeiraData = addDiasISO(todayISO(), dias);
    return lista.map((t, i) => {
      if (i === 0) return { ...t, data_vencimento: primeiraData };
      const offset = parseDiasCondicao(t.condicao_pagamento);
      return { ...t, data_vencimento: addDiasISO(primeiraData, offset) };
    });
  };

  // Quando o parâmetro chega, atualiza o estado caso ainda esteja no fallback
  useEffect(() => {
    const v = Number(paramDiasQ.data?.[0]?.valor);
    if (Number.isFinite(v) && v >= 0) {
      setDiasPrimeiroPagamento((curr) =>
        curr === DIAS_PRIMEIRO_PAGAMENTO_FALLBACK ? v : curr,
      );
    }
  }, [paramDiasQ.data]);

  // hidrata estado local quando a proposta chega
  useEffect(() => {
    if (propostaQ.data?.titulos_propostos) {
      const novos = propostaQ.data.titulos_propostos.map((t) => ({ ...t }));
      setTitulos(aplicarPrimeiraDataECascata(novos, diasPrimeiroPagamento));
      const somaProposta = novos.reduce((acc, t) => acc + Number(t.valor_bruto || 0), 0);
      const novoTotal = Number(pedidoQ.data?.valor_liquido ?? propostaQ.data?.valor_total ?? somaProposta);
      setValorTotalCobrar(novoTotal);
      setParcelasIguais(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostaQ.data, pedidoQ.data?.valor_liquido]);

  // Reaplica 1ª data + cascata sempre que diasPrimeiroPagamento mudar
  useEffect(() => {
    setTitulos((prev) =>
      prev.length ? aplicarPrimeiraDataECascata(prev, diasPrimeiroPagamento) : prev,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diasPrimeiroPagamento]);

  const valorPedido = Number(pedidoQ.data?.valor_liquido ?? propostaQ.data?.valor_total ?? 0);
  const dataPedidoStr: string | undefined = pedidoQ.data?.data_pedido;

  const totalEditado = useMemo(
    () => titulos.reduce((acc, t) => acc + Number(t.valor_bruto || 0), 0),
    [titulos],
  );
  const diff = totalEditado - valorPedido;
  const pctDiff = valorPedido > 0 ? Math.abs(diff) / valorPedido : 0;
  const temDivergenciaLeve = Math.abs(diff) > 0.005 && pctDiff <= 0.01;
  const temDivergenciaGrave = pctDiff > 0.01;

  const temValorInvalido = titulos.some((t) => Number(t.valor_bruto) <= 0);
  const temDataPassada = !!dataPedidoStr && titulos.some(
    (t) => t.data_vencimento < dataPedidoStr,
  );

  const atualizarTitulo = (idx: number, patch: Partial<TituloProposto>) => {
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
    if (idx !== 0) {
      atualizarTitulo(idx, { data_vencimento: novaData });
      return;
    }
    setTitulos((prev) =>
      prev.map((t, i) => {
        if (i === 0) return { ...t, data_vencimento: novaData };
        const offset = parseDiasCondicao(t.condicao_pagamento);
        return { ...t, data_vencimento: addDiasISO(novaData, offset) };
      }),
    );
  };

  const renumerar = (lista: TituloProposto[]): TituloProposto[] => {
    const n = lista.length;
    return lista.map((t, i) => ({ ...t, ordem: i, numero_parcela: i + 1, total_parcelas: n }));
  };

  const handleAdicionarParcela = () => {
    setTitulos((prev) => {
      const ultima = prev[prev.length - 1];
      const novaData = ultima ? addDiasISO(ultima.data_vencimento, 30) : new Date().toISOString().slice(0, 10);
      const novo: TituloProposto = {
        ordem: prev.length,
        numero_parcela: prev.length + 1,
        total_parcelas: prev.length + 1,
        eh_entrada: false,
        tipo_pagamento: ultima?.tipo_pagamento ?? "boleto",
        valor_bruto: 0,
        data_vencimento: novaData,
        condicao_pagamento: ultima?.condicao_pagamento ?? "",
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
    const mut = exigePortao ? criarPortao : materializar;
    mut.mutate(
      { pedidoId, titulosEditados: titulos },
      { onSettled: () => setConfirmOpen(false) },
    );
  };

  const handleTogglePortao = async (valor: boolean) => {
    if (!pedidoId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("definir_exige_portao", {
      p_pedido_id: pedidoId,
      p_valor: valor,
    });
    if (error) {
      toast({ title: "Não foi possível alterar o portão", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["cobranca-pedido-minimo", pedidoId] });
    toast({ title: valor ? "Portão ativado" : "Portão desativado" });
  };

  const handleRecalcular = () => {
    qc.invalidateQueries({ queryKey: ["cobranca-proposta", pedidoId] });
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
        <Button variant="ghost" onClick={() => navigate("/recebimento/cobranca")}>
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
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/recebimento/cobranca")}>
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
        <Button variant="ghost" onClick={() => navigate("/recebimento/cobranca")}>
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
  const creditoRecomendaPortao = !!analiseEscolhida?.exige_portao;

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

      {/* Portão — primeiro pagamento à vista */}
      <Card>
        <CardContent className="py-4 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm">Portão — primeiro pagamento à vista para liberar a NF</p>
              {creditoRecomendaPortao && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Crédito recomendou portão para este pedido.
                </p>
              )}
            </div>
            <Switch
              checked={exigePortao}
              onCheckedChange={handleTogglePortao}
              disabled={!isSuperAdmin}
            />
          </div>
          {exigePortao && (
            <p className="text-xs text-muted-foreground">
              O primeiro título será o portão (libera a NF ao ser pago). Os demais ficam aguardando NF.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Proposta editável */}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Proposta de títulos</CardTitle>
          <Button variant="outline" size="sm" onClick={handleRecalcular}>
            <RefreshCcw className="h-4 w-4" /> Recalcular
          </Button>
        </CardHeader>
        <CardContent>
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
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Pagamento</TableHead>
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
                        <Select
                          value={t.tipo_pagamento}
                          onValueChange={(v) =>
                            atualizarTitulo(idx, {
                              tipo_pagamento: v as TituloProposto["tipo_pagamento"],
                            })
                          }
                        >
                          <SelectTrigger className="h-9 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="boleto">Boleto</SelectItem>
                            <SelectItem value="cartao">Cartão</SelectItem>
                          </SelectContent>
                        </Select>
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
                        <Input
                          type="url"
                          placeholder="https://..."
                          value={t.link_pagamento ?? ""}
                          onChange={(e) =>
                            atualizarTitulo(idx, { link_pagamento: e.target.value || undefined })
                          }
                          className="h-9 w-56 text-xs"
                        />
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
                  <TableCell colSpan={3} className="text-right font-medium">
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
                    {titulos.length > 0 && (
                      <> · {titulos.length}x de {fmtBRL.format(valorPedido / titulos.length)}</>
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
            <Button
              variant="ghost"
              onClick={() => setEditarCondicaoOpen(true)}
              disabled={materializar.isPending || criarPortao.isPending}
            >
              Alterar pagamento
            </Button>
            <Button variant="outline" onClick={() => navigate("/recebimento/cobranca")}>
              Cancelar
            </Button>
            <Button
              onClick={handleAceitar}
              disabled={!podeMaterializar || materializar.isPending || criarPortao.isPending}
            >
              {(materializar.isPending || criarPortao.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              {exigePortao ? "Aceitar e gerar portão" : "Aceitar e materializar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{exigePortao ? "Confirmar criação do portão" : "Confirmar materialização"}</DialogTitle>
            <DialogDescription>
              {exigePortao ? (
                <>Vamos criar o portão. O pedido ficará aguardando o primeiro pagamento à vista antes de liberar a NF.</>
              ) : (
                <>
                  Esta operação é irreversível. Serão criados <strong>{titulos.length}</strong>{" "}
                  título{titulos.length !== 1 ? "s" : ""} totalizando{" "}
                  <strong>{fmtBRL.format(totalEditado)}</strong>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={materializar.isPending || criarPortao.isPending}
            >
              Voltar
            </Button>
            <Button onClick={handleConfirmar} disabled={materializar.isPending || criarPortao.isPending}>
              {(materializar.isPending || criarPortao.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
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
    </div>
  );
}
