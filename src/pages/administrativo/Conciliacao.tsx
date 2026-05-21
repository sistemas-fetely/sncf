import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, CheckCircle2, Link2, Plus, ChevronDown, ChevronUp,
  Sparkles, Clock, AlertCircle, Layers, ArrowLeftRight, Upload,
  FileSpreadsheet,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { CriarCPRAvulsaDialog } from "@/components/financeiro/CriarCPRAvulsaDialog";
import { ImportarOFXDialog } from "@/components/financeiro/ImportarOFXDialog";
import { ImportadorItauPagamentos } from "@/components/financeiro/ImportadorItauPagamentos";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type ContaBancaria = { id: string; nome_exibicao: string };

type MovSugerida = {
  id: string;
  nivel: number;
  nivel_descricao: string;
  descricao: string | null;
  parceiro_nome: string | null;
  valor: number;
  data_transacao: string;
  conta_pagar_id: string | null;
};

type OfxSugerido = {
  id: string;
  descricao: string;
  valor: number;
  data_transacao: string;
};

type ItemConciliacao = {
  planilha_id: string;
  nome_favorecido: string | null;
  cnpj_favorecido: string | null;
  valor_pago: number;
  data_pagamento: string | null;
  tipo_pagamento: string | null;
  mov_sugerida: MovSugerida | null;
  ofx_sugerido: OfxSugerido | null;
  tipo: "completo" | "parcial" | "sem_mov" | "parcialmente_conciliado";
  valor_ja_vinculado?: number;
  faltam?: number;
};

type LoteConciliacao = {
  numero_lote: string;
  soma: number;
  qtd_planilhas: number;
  planilhas: Array<{
    planilha_id: string;
    nome_favorecido: string | null;
    cnpj_favorecido: string | null;
    valor_pago: number;
    data_pagamento: string | null;
    mov_sugerida: Omit<MovSugerida, "valor" | "data_transacao"> | null;
  }>;
  ofx_sugerido: OfxSugerido | null;
  tipo: "lote_completo" | "lote_parcial";
};

type ItemAguardandoOfx = {
  planilha_id: string;
  nome_favorecido: string | null;
  cnpj_favorecido: string | null;
  valor_pago: number;
  data_pagamento: string | null;
  movimentacao_id: string;
  cpr_descricao: string | null;
  parceiro_nome: string | null;
  ofx_sugerido: OfxSugerido | null;
  tipo: "aguardando_ofx_com_match" | "aguardando_ofx_sem_match";
};

type OfxOrfao = {
  ofx_id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
  tipo: "sem_planilha";
};

type RespostaConciliacao = {
  itens: ItemConciliacao[];
  aguardando_ofx: ItemAguardandoOfx[];
  lotes: LoteConciliacao[];
  ofx_orfao: OfxOrfao[];
};

export default function Conciliacao() {
  const qc = useQueryClient();
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [lotesExpandidos, setLotesExpandidos] = useState<Set<string>>(new Set());
  const [criarCPRPlanilha, setCriarCPRPlanilha] = useState<ItemConciliacao | null>(null);
  const [criarCPROfx, setCriarCPROfx] = useState<OfxOrfao | null>(null);
  const [multiVinculoAberto, setMultiVinculoAberto] = useState<ItemConciliacao | null>(null);
  const [movsSelecionadas, setMovsSelecionadas] = useState<string[]>([]);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState<ItemConciliacao | null>(null);
  const [parciaisExpandidos, setParciaisExpandidos] = useState<Set<string>>(new Set());
  const [importOfxOpen, setImportOfxOpen] = useState(false);
  const [importPlanilhaOpen, setImportPlanilhaOpen] = useState(false);

  const { data: contas } = useQuery({
    queryKey: ["contas-bancarias-conciliacao"],
    queryFn: async () => {
      const { data } = await sb
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .eq("tipo", "corrente")
        .order("nome_exibicao");
      return (data || []) as ContaBancaria[];
    },
  });

  const { data: resultado, isLoading } = useQuery({
    queryKey: ["conciliacao-unificada", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      const { data, error } = await sb.rpc("apontar_matches_conciliacao", {
        p_conta_bancaria_id: contaBancariaId,
      });
      if (error) throw error;
      return data as RespostaConciliacao;
    },
  });

  const { data: movsVinculadasMap } = useQuery({
    queryKey: ["movs-vinculadas-parciais", Array.from(parciaisExpandidos).sort().join(",")],
    enabled: parciaisExpandidos.size > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("movimentacoes_bancarias")
        .select("id, itau_planilha_id, descricao, valor, data_transacao, pg_em")
        .in("itau_planilha_id", Array.from(parciaisExpandidos))
        .order("data_transacao", { ascending: true });
      const map = new Map<
        string,
        Array<{
          id: string;
          descricao: string;
          valor: number;
          data_transacao: string;
          pg_em: string | null;
        }>
      >();
      (data || []).forEach((m: { itau_planilha_id: string | null; id: string; descricao: string; valor: number; data_transacao: string; pg_em: string | null }) => {
        if (!m.itau_planilha_id) return;
        const arr = map.get(m.itau_planilha_id) || [];
        arr.push({ id: m.id, descricao: m.descricao, valor: m.valor, data_transacao: m.data_transacao, pg_em: m.pg_em });
        map.set(m.itau_planilha_id, arr);
      });
      return map;
    },
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["conciliacao-unificada", contaBancariaId] });
  };

  const vincularMutation = useMutation({
    mutationFn: async ({
      planilhaId, movId, ofxId,
    }: { planilhaId: string; movId: string; ofxId?: string }) => {
      const { data, error } = await sb.rpc("vincular_conciliacao", {
        p_planilha_id: planilhaId,
        p_movimentacao_id: movId,
        p_ofx_id: ofxId ?? null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.motivo || "Erro");
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(
        d.stages_completados === 2
          ? "Conciliado ✓ — Stage 1 + Stage 2"
          : "Stage 1 feito — aguarda OFX"
      );
      invalidar();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const vincularLoteMutation = useMutation({
    mutationFn: async ({
      planilhaIds, movIds, ofxId,
    }: { planilhaIds: string[]; movIds: string[]; ofxId: string }) => {
      const { data, error } = await sb.rpc("vincular_lote_conciliacao", {
        p_planilha_ids: planilhaIds,
        p_movimentacao_ids: movIds,
        p_ofx_id: ofxId,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.motivo || "Erro");
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Lote conciliado ✓ — ${d.planilhas_vinculadas} pagamentos`);
      invalidar();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const { data: movsElegiveis } = useQuery({
    queryKey: ["movs-elegiveis-multi", multiVinculoAberto?.planilha_id],
    enabled: !!multiVinculoAberto,
    queryFn: async () => {
      const { data, error } = await sb.rpc("listar_movimentacoes_elegiveis");
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        descricao: string | null;
        valor: number;
        data_transacao: string | null;
        conta_pagar_id: string | null;
        cpr_descricao: string | null;
        fornecedor_cliente: string | null;
        forma_pagamento_nome: string | null;
        fatura_vencimento: string | null;
      }>;
    },
  });

  const { data: itensConciliados } = useQuery({
    queryKey: ["conciliados", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("itau_pagamentos_stage")
        .select(`
          id, nome_favorecido, cnpj_favorecido, valor_pago, data_pagamento,
          ofx_transacao_id, status_conciliacao,
          ofx_transacoes_stage!ofx_transacao_id(descricao, data_transacao, valor)
        `)
        .eq("conta_bancaria_id", contaBancariaId)
        .eq("status_conciliacao", "conciliado")
        .order("data_pagamento", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        nome_favorecido: string | null;
        cnpj_favorecido: string | null;
        valor_pago: number;
        data_pagamento: string | null;
        ofx_transacao_id: string | null;
        status_conciliacao: string;
        ofx_transacoes_stage: { descricao: string; data_transacao: string; valor: number } | null;
      }>;
    },
  });

  const valorPlanilhaAberta = multiVinculoAberto?.valor_pago ?? 0;
  const somaMovsSelecionadas = (movsElegiveis ?? [])
    .filter((m) => movsSelecionadas.includes(m.id))
    .reduce((acc, m) => acc + Math.abs(Number(m.valor || 0)), 0);

  const multiVinculoMutation = useMutation({
    mutationFn: async ({ planilhaId, movIds }: { planilhaId: string; movIds: string[] }) => {
      const { data, error } = await sb.rpc("vincular_planilha_multiplas_movs", {
        p_planilha_id: planilhaId,
        p_movimentacao_ids: movIds,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.motivo || "Erro");
      return data;
    },
    onSuccess: () => {
      toast.success("Movimentações vinculadas ✓");
      setMultiVinculoAberto(null);
      setMovsSelecionadas([]);
      invalidar();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const [faturaSelecionada, setFaturaSelecionada] = useState<string | null>(null);

  const { data: faturasDisponiveis } = useQuery({
    queryKey: ["faturas-disponiveis", confirmacaoAberta?.planilha_id],
    enabled: !!confirmacaoAberta,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb as any).rpc("listar_faturas_disponiveis_para_planilha", {
        p_planilha_id: confirmacaoAberta!.planilha_id,
      });
      if (error) throw error;
      return (data || []) as Array<{
        fatura_id: string;
        cartao_nome: string;
        data_vencimento: string;
        valor_total: number;
        qtd_lancamentos: number;
        ja_vinculada: boolean;
        parceiros: string;
      }>;
    },
  });

  const conciliarFaturaMutation = useMutation({
    mutationFn: async ({ planilhaId, faturaId, ofxId }: { planilhaId: string; faturaId: string; ofxId?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb as any).rpc("conciliar_semov_fatura", {
        p_planilha_id: planilhaId,
        p_fatura_id: faturaId,
        p_ofx_id: ofxId ?? null,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(data as any)?.ok) throw new Error((data as any)?.motivo || "Erro");
      return data;
    },
    onSuccess: () => {
      toast.success("Fatura vinculada ✓ — conciliação completa");
      setConfirmacaoAberta(null);
      setFaturaSelecionada(null);
      invalidar();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const itens = resultado?.itens ?? [];
  const aguardandoOfx = resultado?.aguardando_ofx ?? [];
  const lotes = resultado?.lotes ?? [];
  const ofxOrfao = resultado?.ofx_orfao ?? [];
  const completos =
    itens.filter((i) => i.tipo === "completo").length +
    lotes.filter((l) => l.tipo === "lote_completo").length;
  const parciais =
    itens.filter((i) => i.tipo === "parcial").length +
    lotes.filter((l) => l.tipo === "lote_parcial").length;
  const semMov = itens.filter((i) => i.tipo === "sem_mov").length;
  const parcialmenteConciliados = itens.filter((i) => i.tipo === "parcialmente_conciliado").length;

  function nivelBadge(nivel: number) {
    if (nivel <= 2) return "bg-emerald-100 text-emerald-800";
    if (nivel === 3) return "bg-amber-100 text-amber-800";
    return "bg-muted text-muted-foreground";
  }

  function corNivel(nivel: number | undefined | null): string {
    if (!nivel) return "";
    if (nivel === 1) return "border-l-4 border-l-emerald-500 bg-emerald-50/20";
    if (nivel === 2) return "border-l-4 border-l-yellow-400 bg-yellow-50/20";
    if (nivel === 3) return "border-l-4 border-l-orange-400 bg-orange-50/20";
    return "border-l-4 border-l-red-400 bg-red-50/20";
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6" />
            Conciliação Bancária
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            A IA cruza planilha × movimentação × OFX simultaneamente. Verde = concilia tudo em 1 clique.
            Amarelo = Stage 1 agora, OFX depois.
          </p>
        </div>
      </div>

      {/* Seletor conta */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Conta bancária:</span>
        <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            {(contas ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setImportOfxOpen(true)}
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          Importar OFX
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setImportPlanilhaOpen(true)}
          className="gap-2"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Importar Planilha
        </Button>
      </div>

      {!contaBancariaId ? (
        <p className="text-sm text-muted-foreground">Selecione uma conta bancária.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Cruzando planilha × movimentação × OFX…
        </div>
      ) : (
        <>
          {/* Resumo */}
          {(completos + parciais + semMov + parcialmenteConciliados) > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {completos > 0 && (
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {completos} pronto{completos !== 1 ? "s" : ""} para conciliar
                </Badge>
              )}
              {parciais > 0 && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
                  <Clock className="h-3 w-3" />
                  {parciais} parcial{parciais !== 1 ? "is" : ""}
                </Badge>
              )}
              {semMov > 0 && (
                <Badge variant="outline" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {semMov} sem movimentação
                </Badge>
              )}
              {parcialmenteConciliados > 0 && (
                <Badge variant="outline" className="gap-1 border-blue-300 text-blue-800">
                  <Clock className="h-3 w-3" />
                  {parcialmenteConciliados} parcialmente conciliado{parcialmenteConciliados !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}

          {/* Lotes */}
          {lotes.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Layers className="h-4 w-4" /> Lotes
              </h2>
              {lotes.map((lote) => {
                const expandido = lotesExpandidos.has(lote.numero_lote);
                const isCompleto = lote.tipo === "lote_completo";
                const todasMovs = lote.planilhas.every((p) => !!p.mov_sugerida);
                const nivelLote = lote.planilhas.every((p) => p.mov_sugerida)
                  ? Math.max(...lote.planilhas.map((p) => p.mov_sugerida!.nivel))
                  : null;
                return (
                  <div
                    key={lote.numero_lote}
                    className={`rounded-lg border bg-card transition-colors ${corNivel(nivelLote)}`}
                  >
                    <div className="flex items-center justify-between gap-4 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">Lote {lote.numero_lote}</p>
                          <span className="text-muted-foreground text-xs">·</span>
                          <span className="text-xs text-muted-foreground">
                            {lote.qtd_planilhas} pagamentos
                          </span>
                        </div>
                        {lote.ofx_sugerido && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            OFX: {lote.ofx_sugerido.descricao} · {formatDateBR(lote.ofx_sugerido.data_transacao)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-semibold text-sm">{formatBRL(lote.soma)}</span>
                        {isCompleto && todasMovs && lote.ofx_sugerido && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            disabled={vincularLoteMutation.isPending}
                            onClick={() =>
                              vincularLoteMutation.mutate({
                                planilhaIds: lote.planilhas.map((p) => p.planilha_id),
                                movIds: lote.planilhas.map((p) => p.mov_sugerida!.id),
                                ofxId: lote.ofx_sugerido!.id,
                              })
                            }
                          >
                            {vincularLoteMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Link2 className="h-3 w-3" />
                            )}
                            Conciliar lote
                          </Button>
                        )}
                        <button
                          onClick={() => {
                            const s = new Set(lotesExpandidos);
                            if (s.has(lote.numero_lote)) s.delete(lote.numero_lote);
                            else s.add(lote.numero_lote);
                            setLotesExpandidos(s);
                          }}
                          className="text-muted-foreground hover:text-foreground p-1"
                        >
                          {expandido ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {expandido && (
                      <div className="border-t divide-y">
                        {lote.planilhas.map((pl) => (
                          <div key={pl.planilha_id} className="flex items-center justify-between gap-4 px-3 py-2 text-xs">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{pl.nome_favorecido ?? "—"}</p>
                              <p className="text-muted-foreground truncate">
                                {pl.cnpj_favorecido ?? "—"} · {pl.data_pagamento ? formatDateBR(pl.data_pagamento) : "—"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                              <span>{formatBRL(pl.valor_pago)}</span>
                              {pl.mov_sugerida ? (
                                <>
                                  <Badge className={`${nivelBadge(pl.mov_sugerida.nivel)} text-[10px]`}>
                                    Match {pl.mov_sugerida.nivel}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px] gap-1"
                                    disabled={vincularMutation.isPending}
                                    onClick={() =>
                                      vincularMutation.mutate({
                                        planilhaId: pl.planilha_id,
                                        movId: pl.mov_sugerida!.id,
                                      })
                                    }
                                  >
                                    {vincularMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Link2 className="h-3 w-3" />
                                    )}
                                    Vincular
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Badge variant="outline" className="text-[10px]">Sem mov</Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px] gap-1"
                                    onClick={() => {
                                      setMultiVinculoAberto({
                                        planilha_id: pl.planilha_id,
                                        nome_favorecido: pl.nome_favorecido,
                                        cnpj_favorecido: pl.cnpj_favorecido,
                                        valor_pago: pl.valor_pago,
                                        data_pagamento: pl.data_pagamento,
                                        tipo_pagamento: null,
                                        mov_sugerida: null,
                                        ofx_sugerido: null,
                                        tipo: "sem_mov",
                                      });
                                      setMovsSelecionadas([]);
                                    }}
                                  >
                                    <Layers className="h-3 w-3" /> Selecionar movs
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px] gap-1"
                                    onClick={() =>
                                      setCriarCPRPlanilha({
                                        planilha_id: pl.planilha_id,
                                        nome_favorecido: pl.nome_favorecido,
                                        cnpj_favorecido: pl.cnpj_favorecido,
                                        valor_pago: pl.valor_pago,
                                        data_pagamento: pl.data_pagamento,
                                        tipo_pagamento: null,
                                        mov_sugerida: null,
                                        ofx_sugerido: null,
                                        tipo: "sem_mov",
                                      })
                                    }
                                  >
                                    <Plus className="h-3 w-3" /> Criar CPR
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Itens avulsos */}
          {itens.length > 0 && (
            <div className="space-y-2">
              {lotes.length > 0 && (
                <h2 className="text-sm font-semibold text-muted-foreground">Avulsos</h2>
              )}
              {itens.map((item) => {
                const isCompleto = item.tipo === "completo";
                const isParcial = item.tipo === "parcial";
                return (
                  <div
                    key={item.planilha_id}
                    className={`rounded-lg border bg-card p-3 transition-colors ${
                      item.tipo === "parcialmente_conciliado"
                        ? "border-l-4 border-l-blue-500 bg-blue-50/20"
                        : corNivel(item.mov_sugerida?.nivel)
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1.5fr_1.5fr_auto] gap-3 items-center">
                      {/* Planilha */}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.nome_favorecido ?? "—"}</p>
                        {item.tipo === "parcialmente_conciliado" && (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge className="text-[9px] bg-blue-100 text-blue-800 hover:bg-blue-100">
                              Parcial · {formatBRL(item.valor_ja_vinculado ?? 0)} de {formatBRL(item.valor_pago)}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              Faltam {formatBRL(item.faltam ?? 0)}
                            </span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground truncate">
                          {item.cnpj_favorecido ?? "Sem CNPJ"} · {item.tipo_pagamento ?? "—"}
                          {item.data_pagamento && (
                            <> · {formatDateBR(item.data_pagamento)}</>
                          )}
                        </p>
                      </div>

                      {/* Movimentação */}
                      <div className="min-w-0 text-xs">
                        {item.mov_sugerida ? (
                          <div className="space-y-1">
                            <Badge className={`${nivelBadge(item.mov_sugerida.nivel)} text-[10px]`}>
                              Match {item.mov_sugerida.nivel} · {item.mov_sugerida.nivel_descricao}
                            </Badge>
                            <p className="truncate font-medium">
                              {item.mov_sugerida.parceiro_nome ?? item.mov_sugerida.descricao ?? "—"}
                            </p>
                            <p className="text-muted-foreground">
                              {formatDateBR(item.mov_sugerida.data_transacao)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">— sem movimentação</span>
                        )}
                      </div>

                      {/* OFX */}
                      <div className="min-w-0 text-xs">
                        {item.ofx_sugerido ? (
                          <div className="space-y-1">
                            <Badge variant="outline" className="text-[10px]">OFX</Badge>
                            <p className="truncate font-medium">{item.ofx_sugerido.descricao}</p>
                            <p className="text-muted-foreground">
                              {formatDateBR(item.ofx_sugerido.data_transacao)}
                            </p>
                          </div>
                        ) : item.tipo !== "sem_mov" ? (
                          <span className="text-muted-foreground">— OFX pendente</span>
                        ) : null}
                      </div>

                      {/* Ação */}
                      <div className="flex items-center gap-2 justify-end shrink-0">
                        <span className="font-semibold text-sm">{formatBRL(item.valor_pago)}</span>
                        {isCompleto && item.mov_sugerida && item.ofx_sugerido && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            disabled={vincularMutation.isPending}
                            onClick={() =>
                              vincularMutation.mutate({
                                planilhaId: item.planilha_id,
                                movId: item.mov_sugerida!.id,
                                ofxId: item.ofx_sugerido!.id,
                              })
                            }
                          >
                            {vincularMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Link2 className="h-3 w-3" />
                            )}
                            Conciliar
                          </Button>
                        )}
                        {isParcial && item.mov_sugerida && (
                          <Button
                            size="sm"
                            className="bg-amber-500 hover:bg-amber-600 text-white gap-1"
                            disabled={vincularMutation.isPending}
                            onClick={() =>
                              vincularMutation.mutate({
                                planilhaId: item.planilha_id,
                                movId: item.mov_sugerida!.id,
                              })
                            }
                          >
                            {vincularMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Link2 className="h-3 w-3" />
                            )}
                            Stage 1
                          </Button>
                        )}
                        {item.tipo === "parcialmente_conciliado" && (
                          <>
                            <Button size="sm" variant="outline"
                              className="gap-1 border-blue-300 text-blue-800 hover:bg-blue-50"
                              onClick={() => { setMultiVinculoAberto(item); setMovsSelecionadas([]); }}>
                              <Layers className="h-3.5 w-3.5" /> Selecionar movs
                            </Button>
                            <button
                              onClick={() => {
                                const s = new Set(parciaisExpandidos);
                                if (s.has(item.planilha_id)) s.delete(item.planilha_id);
                                else s.add(item.planilha_id);
                                setParciaisExpandidos(s);
                              }}
                              className="text-muted-foreground hover:text-foreground p-1"
                              title="Ver movimentações vinculadas"
                            >
                              {parciaisExpandidos.has(item.planilha_id)
                                ? <ChevronUp className="h-4 w-4" />
                                : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </>
                        )}
                        {item.tipo === "sem_mov" && item.ofx_sugerido && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            disabled={conciliarFaturaMutation.isPending}
                            onClick={() => setConfirmacaoAberta(item)}
                          >
                            <Link2 className="h-3 w-3" />
                            Conciliar
                          </Button>
                        )}
                        {item.tipo === "sem_mov" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs"
                              onClick={() => { setMultiVinculoAberto(item); }}
                            >
                              <Layers className="h-3.5 w-3.5" /> Selecionar movs
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => setCriarCPRPlanilha(item)}
                            >
                              <Plus className="h-3 w-3" /> Criar CPR
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {item.tipo === "parcialmente_conciliado" && parciaisExpandidos.has(item.planilha_id) && (
                      <div className="border-t mt-2 pt-2">
                        {(() => {
                          const movs = movsVinculadasMap?.get(item.planilha_id) ?? [];
                          if (movs.length === 0) {
                            return (
                              <p className="text-xs text-muted-foreground px-1 py-2">
                                Nenhuma movimentação vinculada ainda.
                              </p>
                            );
                          }
                          return (
                            <div className="divide-y">
                              {movs.map((m) => (
                                <div key={m.id} className="flex items-center justify-between gap-4 px-1 py-2 text-xs">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate">{m.descricao || "—"}</p>
                                    <p className="text-muted-foreground">{formatDateBR(m.data_transacao)}</p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-mono">{formatBRL(m.valor)}</span>
                                    {m.pg_em ? (
                                      <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700 bg-emerald-50">
                                        Conciliado
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700 bg-amber-50">
                                        Aguardando OFX
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {aguardandoOfx.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                Aguardando OFX ({aguardandoOfx.length})
              </p>
              {aguardandoOfx.map((item) => (
                <div key={item.planilha_id} className="border rounded-md p-3 flex items-center justify-between gap-4 border-l-4 border-l-amber-400 bg-amber-50/20">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.nome_favorecido ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.data_pagamento ? formatDateBR(item.data_pagamento) : "—"} · {formatBRL(item.valor_pago)}
                    </p>
                    {item.cpr_descricao && (
                      <p className="text-xs text-muted-foreground truncate">CPR: {item.cpr_descricao}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.ofx_sugerido && (
                      <div className="text-right mr-2">
                        <Badge variant="outline" className="text-xs mb-1">OFX sugerido</Badge>
                        <p className="text-xs text-muted-foreground">{item.ofx_sugerido.descricao}</p>
                        <p className="text-xs font-medium">{formatBRL(item.ofx_sugerido.valor)}</p>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!item.ofx_sugerido || vincularMutation.isPending}
                      onClick={() => {
                        if (item.ofx_sugerido) {
                          vincularMutation.mutate({
                            planilhaId: item.planilha_id,
                            movId: item.movimentacao_id,
                            ofxId: item.ofx_sugerido.id,
                          });
                        }
                      }}
                      className="gap-1"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Vincular OFX
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {ofxOrfao.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                OFX sem planilha ({ofxOrfao.length})
              </p>
              {ofxOrfao.map((item) => (
                <div key={item.ofx_id} className="border rounded-md p-3 flex items-center justify-between gap-4 border-l-4 border-l-slate-300">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateBR(item.data_transacao)} · {formatBRL(item.valor)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCriarCPROfx(item)}
                    className="gap-1 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Criar CPR
                  </Button>
                </div>
              ))}
            </div>
          )}

          {itens.length === 0 && lotes.length === 0 && aguardandoOfx.length === 0 && ofxOrfao.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum item pendente nesta conta.</p>
                <p className="text-xs text-muted-foreground">Importe uma planilha ou OFX nos botões acima.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {criarCPRPlanilha && (
        <CriarCPRAvulsaDialog
          open={!!criarCPRPlanilha}
          onOpenChange={(v) => { if (!v) setCriarCPRPlanilha(null); }}
          origem="stage_1"
          fonteId={criarCPRPlanilha.planilha_id}
          resumo={{
            titulo: criarCPRPlanilha.nome_favorecido ?? "—",
            valor: criarCPRPlanilha.valor_pago,
            data: criarCPRPlanilha.data_pagamento,
            info: criarCPRPlanilha.cnpj_favorecido ?? undefined,
          }}
          descricaoInicial={criarCPRPlanilha.nome_favorecido ?? ""}
          onSucesso={() => { setCriarCPRPlanilha(null); invalidar(); }}
        />
      )}

      {criarCPROfx && (
        <CriarCPRAvulsaDialog
          open={!!criarCPROfx}
          onOpenChange={(v) => { if (!v) setCriarCPROfx(null); }}
          origem="stage_2_debito"
          fonteId={criarCPROfx.ofx_id}
          resumo={{
            titulo: criarCPROfx.descricao,
            valor: criarCPROfx.valor,
            data: criarCPROfx.data_transacao,
          }}
          descricaoInicial={criarCPROfx.descricao}
          onSucesso={() => { setCriarCPROfx(null); invalidar(); }}
        />
      )}

      <ImportarOFXDialog
        open={importOfxOpen}
        onOpenChange={setImportOfxOpen}
        onSuccess={invalidar}
        contaBancariaId={contaBancariaId || undefined}
      />

      <Sheet open={importPlanilhaOpen} onOpenChange={setImportPlanilhaOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Importar Planilha Itaú Pagamentos</SheetTitle>
            <SheetDescription>
              Suba a planilha de pagamentos efetuados (exportada do Itaú). As linhas pendentes aparecerão como Stage 1.
            </SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <ImportadorItauPagamentos contaBancariaId={contaBancariaId || undefined} />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!multiVinculoAberto} onOpenChange={(v) => { if (!v) { setMultiVinculoAberto(null); setMovsSelecionadas([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular múltiplas movimentações</DialogTitle>
            <DialogDescription>
              {multiVinculoAberto?.nome_favorecido ?? "—"} · {formatBRL(valorPlanilhaAberta)}
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-lg border space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Selecionadas</span>
              <span className={`font-mono font-semibold ${somaMovsSelecionadas === valorPlanilhaAberta ? "text-emerald-600" : ""}`}>
                {formatBRL(somaMovsSelecionadas)} / {formatBRL(valorPlanilhaAberta)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  somaMovsSelecionadas > valorPlanilhaAberta ? "bg-red-500" :
                  somaMovsSelecionadas === valorPlanilhaAberta ? "bg-emerald-500" : "bg-primary"
                }`}
                style={{ width: `${valorPlanilhaAberta > 0 ? Math.min(100, (somaMovsSelecionadas / valorPlanilhaAberta) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {somaMovsSelecionadas === valorPlanilhaAberta ? "✓ Soma confere" :
               somaMovsSelecionadas > valorPlanilhaAberta ? "⚠ Excedeu o valor" :
               `Faltam ${formatBRL(valorPlanilhaAberta - somaMovsSelecionadas)}`}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1">
            {(movsElegiveis ?? [])
              .filter((m) => Math.abs(Number(m.valor || 0)) <= valorPlanilhaAberta)
              .map((mov) => {
                const selecionada = movsSelecionadas.includes(mov.id);
                return (
                  <div
                    key={mov.id}
                    onClick={() => setMovsSelecionadas((prev) =>
                      prev.includes(mov.id) ? prev.filter((id) => id !== mov.id) : [...prev, mov.id]
                    )}
                    className={`p-3 rounded border cursor-pointer text-xs flex items-start justify-between gap-2 ${
                      selecionada ? "border-emerald-400 bg-emerald-50/30" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{mov.fornecedor_cliente ?? mov.descricao ?? "—"}</p>
                      <p className="text-muted-foreground text-[10px] truncate">{mov.cpr_descricao ?? "—"}</p>
                      <p className="text-muted-foreground text-[10px]">{mov.data_transacao ? formatDateBR(mov.data_transacao) : "—"}</p>
                      {mov.forma_pagamento_nome && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{mov.forma_pagamento_nome}</span>
                          {mov.fatura_vencimento && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                              venc {formatDateBR(mov.fatura_vencimento)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold">{formatBRL(Math.abs(Number(mov.valor || 0)))}</span>
                      {selecionada && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </div>
                  </div>
                );
              })}
            {(movsElegiveis ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhuma movimentação elegível.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setMultiVinculoAberto(null); setMovsSelecionadas([]); }}>
              Cancelar
            </Button>
            <Button
              disabled={movsSelecionadas.length === 0 || somaMovsSelecionadas > valorPlanilhaAberta || multiVinculoMutation.isPending}
              onClick={() => multiVinculoMutation.mutate({
                planilhaId: multiVinculoAberto!.planilha_id,
                movIds: movsSelecionadas,
              })}
              className="gap-1"
            >
              {multiVinculoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Vincular {movsSelecionadas.length} movimentações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação */}
      <Dialog open={!!confirmacaoAberta} onOpenChange={(v) => { if (!v) { setConfirmacaoAberta(null); setFaturaSelecionada(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-emerald-600" />
              Vincular à Fatura de Cartão
            </DialogTitle>
          </DialogHeader>
          {confirmacaoAberta && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Planilha Itaú</p>
                  <p className="font-semibold">{confirmacaoAberta.nome_favorecido ?? "—"}</p>
                  <p className="font-mono font-bold text-base">{formatBRL(confirmacaoAberta.valor_pago)}</p>
                  <p className="text-xs text-muted-foreground">{confirmacaoAberta.data_pagamento ? formatDateBR(confirmacaoAberta.data_pagamento) : "—"}</p>
                </div>
                {confirmacaoAberta.ofx_sugerido && (
                  <div className="rounded-md border p-3 space-y-1 text-sm bg-muted/20">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">OFX detectado</p>
                    <p className="font-medium truncate">{confirmacaoAberta.ofx_sugerido.descricao}</p>
                    <p className="font-mono font-bold text-base">{formatBRL(confirmacaoAberta.ofx_sugerido.valor)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateBR(confirmacaoAberta.ofx_sugerido.data_transacao)}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Selecione a fatura que este pagamento está quitando:</p>
                {!faturasDisponiveis ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : faturasDisponiveis.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">Nenhuma fatura disponível para vinculação.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {faturasDisponiveis.map((f) => (
                      <div
                        key={f.fatura_id}
                        onClick={() => !f.ja_vinculada && setFaturaSelecionada(f.fatura_id)}
                        className={`p-3 rounded border cursor-pointer text-xs transition-colors ${
                          f.ja_vinculada
                            ? "opacity-50 cursor-not-allowed bg-muted/20"
                            : faturaSelecionada === f.fatura_id
                              ? "border-emerald-400 bg-emerald-50/40"
                              : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold truncate">{f.cartao_nome}</p>
                            <p className="text-muted-foreground truncate">{f.parceiros}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Vence {formatDateBR(f.data_vencimento)} · {f.qtd_lancamentos} lançamentos</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <p className="font-mono font-bold">{formatBRL(f.valor_total)}</p>
                            {f.ja_vinculada && <Badge variant="outline" className="text-[9px]">já vinculada</Badge>}
                            {faturaSelecionada === f.fatura_id && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmacaoAberta(null); setFaturaSelecionada(null); }}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              disabled={conciliarFaturaMutation.isPending || !faturaSelecionada}
              onClick={() => {
                if (!confirmacaoAberta || !faturaSelecionada) return;
                conciliarFaturaMutation.mutate({
                  planilhaId: confirmacaoAberta.planilha_id,
                  faturaId: faturaSelecionada,
                  ofxId: confirmacaoAberta.ofx_sugerido?.id,
                });
              }}
            >
              {conciliarFaturaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Vincular fatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seção de itens conciliados */}
      {itensConciliados && itensConciliados.length > 0 && (
        <div className="space-y-2 pt-4 border-t">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Conciliados ({itensConciliados.length})
          </h2>
          <div className="space-y-1">
            {itensConciliados.map((item) => (
              <div key={item.id} className="rounded-md border border-emerald-200 bg-emerald-50/30 p-3 text-xs flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{item.nome_favorecido ?? "—"}</p>
                  <p className="text-muted-foreground text-[10px]">{item.cnpj_favorecido}</p>
                  {item.ofx_transacoes_stage && (
                    <p className="text-muted-foreground text-[10px] truncate mt-0.5">
                      OFX: {item.ofx_transacoes_stage.descricao} · {formatDateBR(item.ofx_transacoes_stage.data_transacao)}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold">{formatBRL(item.valor_pago)}</p>
                  <p className="text-[10px] text-muted-foreground">{item.data_pagamento ? formatDateBR(item.data_pagamento) : "—"}</p>
                  <Badge variant="outline" className="text-[9px] border-emerald-400 text-emerald-700 bg-emerald-50 mt-0.5">
                    Conciliado ✓
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
