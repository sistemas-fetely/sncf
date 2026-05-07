import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, AlertCircle, XCircle, Loader2, Link2, Plus, X,
  ArrowLeftRight, FileSpreadsheet, RefreshCw, RotateCcw, Users,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { ParceiroFormSheet } from "@/components/financeiro/ParceiroFormSheet";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────

type ContaBancaria = { id: string; nome_exibicao: string };

type Pagamento = {
  id: string;
  importacao_id: string;
  nome_favorecido: string;
  cnpj_favorecido: string;
  tipo_pagamento: string;
  valor_pago: number;
  data_pagamento: string | null;
  status_conciliacao: string;
  parceiro_id: string | null;
  conta_pagar_id: string | null;
  movimentacao_id: string | null;
  conta_pagar?: { descricao: string; data_vencimento: string } | null;
};

type TransacaoOFX = {
  id: string;
  data_transacao: string;
  valor: number;
  descricao: string;
  status: string;
};

type CPRCandidato = {
  id: string;
  descricao: string;
  data_vencimento: string;
  valor: number;
};

// ─── ItemOperador ─────────────────────────────────────────────────────────

function ItemOperador({
  pag,
  onConfirmar,
}: {
  pag: Pagamento;
  onConfirmar: (pagId: string, cprId: string) => void;
}) {
  const [cprSelecionada, setCprSelecionada] = useState("");

  const { data: cprs = [] } = useQuery({
    queryKey: ["cprs-operador", pag.parceiro_id, pag.valor_pago],
    enabled: !!pag.parceiro_id,
    queryFn: async () => {
      const { data } = await sb
        .from("contas_pagar_receber")
        .select("id, descricao, data_vencimento, valor")
        .eq("parceiro_id", pag.parceiro_id)
        .eq("valor", pag.valor_pago)
        .in("status", ["aprovado", "aguardando_pagamento"])
        .is("movimentacao_bancaria_id", null);
      return (data || []) as CPRCandidato[];
    },
  });

  return (
    <div className="p-3 border rounded text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{pag.nome_favorecido}</p>
          <p className="text-muted-foreground text-[10px]">{pag.cnpj_favorecido}</p>
          {pag.data_pagamento && (
            <p className="text-[10px] mt-0.5">
              <span className="text-muted-foreground">Pago em: </span>
              <span className="font-medium text-foreground">{formatDateBR(pag.data_pagamento)}</span>
            </p>
          )}
        </div>
        <span className="font-mono font-semibold">{formatBRL(pag.valor_pago)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Select value={cprSelecionada} onValueChange={setCprSelecionada}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder={cprs.length ? "Selecionar CPR" : "Nenhuma CPR disponível"} />
          </SelectTrigger>
          <SelectContent>
            {cprs.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.descricao} · venc {formatDateBR(c.data_vencimento)} · {formatBRL(c.valor)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!cprSelecionada}
          onClick={() => onConfirmar(pag.id, cprSelecionada)}
          className="gap-1"
        >
          <Link2 className="h-3.5 w-3.5" /> Confirmar
        </Button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export default function Conciliacao() {
  const qc = useQueryClient();
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [filtroOFX, setFiltroOFX] = useState("");
  const [acaoOFX, setAcaoOFX] = useState<string | null>(null);
  const [parceiroSheetOpen, setParceiroSheetOpen] = useState(false);
  const [pagParaCadastrar, setPagParaCadastrar] = useState<Pagamento | null>(null);

  const { data: categorias = [] } = useCategoriasPlano();

  const { data: contas } = useQuery({
    queryKey: ["contas-bancarias-conciliacao"],
    queryFn: async () => {
      const { data } = await sb.from("contas_bancarias")
        .select("id, nome_exibicao").eq("ativo", true).eq("tipo", "corrente").order("nome_exibicao");
      return (data || []) as ContaBancaria[];
    },
  });

  // Query principal: todos os pagamentos da conta, independente da importação
  const { data: pagamentos = [], isLoading: loadingPag } = useQuery({
    queryKey: ["itau-pagamentos-conta", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      const { data } = await sb
        .from("itau_pagamentos_stage")
        .select("id, importacao_id, nome_favorecido, cnpj_favorecido, tipo_pagamento, valor_pago, data_pagamento, status_conciliacao, parceiro_id, conta_pagar_id, movimentacao_id, conta_pagar:conta_pagar_id(descricao, data_vencimento)")
        .eq("conta_bancaria_id", contaBancariaId)
        .order("data_pagamento", { ascending: false });
      return (data || []) as Pagamento[];
    },
  });

  const { data: ofxPendentes = [], isLoading: loadingOFX } = useQuery({
    queryKey: ["ofx-residual", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      const { data } = await sb
        .from("ofx_transacoes_stage")
        .select("id, data_transacao, valor, descricao, status")
        .eq("conta_bancaria_id", contaBancariaId)
        .eq("status", "pendente")
        .order("data_transacao", { ascending: false });
      return (data || []) as TransacaoOFX[];
    },
  });

  // ─── Agrupamentos ─────────────────────────────────────────────────────
  const auto      = pagamentos.filter((p) => p.status_conciliacao === "conciliado_auto");
  const operador  = pagamentos.filter((p) => p.status_conciliacao === "aguardando_operador");
  const semCpr    = pagamentos.filter((p) => p.status_conciliacao === "sem_cpr");
  const semParc   = pagamentos.filter((p) => p.status_conciliacao === "sem_parceiro");
  const cprCriada = pagamentos.filter((p) => p.status_conciliacao === "cpr_criada");
  const concluidos = pagamentos.filter((p) =>
    p.status_conciliacao === "conciliado_manual" || p.status_conciliacao === "ignorado"
  );

  const invalidarPagamentos = () =>
    qc.invalidateQueries({ queryKey: ["itau-pagamentos-conta", contaBancariaId] });

  // ─── Mutations ────────────────────────────────────────────────────────

  const confirmarLoteMutation = useMutation({
    mutationFn: async () => {
      const pendentes = auto.filter((p) => !p.movimentacao_id && p.conta_pagar_id);
      let confirmados = 0, erros = 0;
      for (const pag of pendentes) {
        try {
          await sb.from("contas_pagar_receber").update({
            pago_em_conta_id: contaBancariaId,
            data_pagamento: pag.data_pagamento ?? null,
          }).eq("id", pag.conta_pagar_id);
          const { data: res } = await sb.rpc("gerar_movimentacao_de_conta", { p_conta_id: pag.conta_pagar_id });
          if (!res?.ok) { erros++; continue; }
          const { data: mov } = await sb.from("movimentacoes_bancarias")
            .select("id").eq("conta_pagar_id", pag.conta_pagar_id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          await sb.from("itau_pagamentos_stage").update({
            movimentacao_id: mov?.id ?? null, status_conciliacao: "conciliado_manual",
          }).eq("id", pag.id);
          confirmados++;
        } catch { erros++; }
      }
      return { confirmados, erros };
    },
    onSuccess: (d) => {
      toast.success(`${d.confirmados} confirmado${d.confirmados !== 1 ? "s" : ""}${d.erros > 0 ? ` · ${d.erros} erro(s)` : ""}`);
      invalidarPagamentos();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const confirmarUnitarioMutation = useMutation({
    mutationFn: async ({ pagId, cprId }: { pagId: string; cprId: string }) => {
      const { data: pag } = await sb.from("itau_pagamentos_stage")
        .select("data_pagamento").eq("id", pagId).maybeSingle();
      await sb.from("itau_pagamentos_stage").update({ conta_pagar_id: cprId }).eq("id", pagId);
      await sb.from("contas_pagar_receber").update({
        pago_em_conta_id: contaBancariaId,
        data_pagamento: pag?.data_pagamento ?? null,
      }).eq("id", cprId);
      const { data: res } = await sb.rpc("gerar_movimentacao_de_conta", { p_conta_id: cprId });
      if (!res?.ok) throw new Error(res?.erro || "Erro ao gerar movimentação");
      const { data: mov } = await sb.from("movimentacoes_bancarias")
        .select("id").eq("conta_pagar_id", cprId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      await sb.from("itau_pagamentos_stage").update({
        movimentacao_id: mov?.id ?? null, status_conciliacao: "conciliado_manual",
      }).eq("id", pagId);
    },
    onSuccess: () => { toast.success("Confirmado"); invalidarPagamentos(); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const criarDespesaMutation = useMutation({
    mutationFn: async (pag: Pagamento) => {
      const { data: cpr, error } = await sb.from("contas_pagar_receber").insert({
        descricao: pag.nome_favorecido, valor: pag.valor_pago,
        data_vencimento: pag.data_pagamento, parceiro_id: pag.parceiro_id,
        fornecedor_cliente: pag.nome_favorecido, status: "aberto", origem: "manual",
      }).select("id").single();
      if (error) throw error;
      await sb.from("itau_pagamentos_stage").update({
        conta_pagar_id: cpr.id, status_conciliacao: "cpr_criada",
      }).eq("id", pag.id);
    },
    onSuccess: () => {
      toast.success("Despesa criada em Contas a Pagar — categorize e aprove para conciliar");
      invalidarPagamentos();
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const ignorarMutation = useMutation({
    mutationFn: async (pagId: string) => {
      const { error } = await sb.from("itau_pagamentos_stage")
        .update({ status_conciliacao: "ignorado" }).eq("id", pagId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ignorado"); invalidarPagamentos(); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const reverterMutation = useMutation({
    mutationFn: async (pagId: string) => {
      const { error } = await sb.from("itau_pagamentos_stage")
        .update({ status_conciliacao: "pendente", parceiro_id: null, conta_pagar_id: null })
        .eq("id", pagId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revertido — clique Re-processar para tentar conciliar novamente");
      invalidarPagamentos();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const reprocessarMutation = useMutation({
    mutationFn: async () => {
      const { data: imps } = await sb.from("itau_importacoes_stage")
        .select("id").eq("conta_bancaria_id", contaBancariaId);
      const ids = (imps || []).map((i: any) => i.id);
      if (!ids.length) return { totalAuto: 0 };

      await sb.from("itau_pagamentos_stage")
        .update({ status_conciliacao: "pendente", parceiro_id: null, conta_pagar_id: null })
        .in("importacao_id", ids)
        .is("movimentacao_id", null)
        .not("status_conciliacao", "in", "(conciliado_manual,ignorado)");

      let totalAuto = 0;
      for (const id of ids) {
        const { data } = await sb.rpc("processar_itau_pagamentos", { p_importacao_id: id });
        if (data?.ok) totalAuto += data.conciliado_auto || 0;
      }
      return { totalAuto };
    },
    onSuccess: (d) => {
      toast.success(`Re-processado${d.totalAuto > 0 ? ` — ${d.totalAuto} automático(s) detectado(s)` : ""}`);
      invalidarPagamentos();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  // ─── OFX handlers ─────────────────────────────────────────────────────

  async function handleLancarOFX(ofx: TransacaoOFX) {
    if (!confirm(`Lançar como movimentação avulsa?\n\n${ofx.descricao} — ${formatBRL(ofx.valor)}`)) return;
    setAcaoOFX("lancar:" + ofx.id);
    try {
      const { data, error } = await sb.rpc("lancar_ofx_como_movimentacao", { p_ofx_id: ofx.id });
      if (error) throw error;
      if (!data?.ok) { toast.error(data?.erro || "Erro"); return; }
      toast.success("Lançado como movimentação");
      qc.invalidateQueries({ queryKey: ["ofx-residual"] });
    } catch (e: any) { toast.error("Erro: " + e?.message); }
    finally { setAcaoOFX(null); }
  }

  async function handleIgnorarOFX(ofx: TransacaoOFX) {
    setAcaoOFX("ignorar:" + ofx.id);
    try {
      const { data, error } = await sb.rpc("ignorar_ofx", { p_ofx_id: ofx.id });
      if (error) throw error;
      if (!data?.ok) { toast.error(data?.erro || "Erro"); return; }
      toast.success("Ignorada");
      qc.invalidateQueries({ queryKey: ["ofx-residual"] });
    } catch (e: any) { toast.error("Erro: " + e?.message); }
    finally { setAcaoOFX(null); }
  }

  const ofxFiltrados = filtroOFX.trim()
    ? ofxPendentes.filter((o) => o.descricao.toLowerCase().includes(filtroOFX.toLowerCase()))
    : ofxPendentes;

  const pendentesTotal = auto.length + operador.length + semCpr.length + semParc.length + cprCriada.length;
  const defaultSubTab = auto.length > 0 ? "auto"
    : operador.length > 0 ? "operador"
    : semCpr.length > 0 ? "semcpr"
    : semParc.length > 0 ? "semparc"
    : "concluido";

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-primary" />
          Conciliação Bancária
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fila contínua de trabalho. Importe a planilha Itaú quantas vezes quiser — itens novos entram, duplicatas são ignoradas.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Conta bancária:</span>
        <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
          <SelectTrigger className="w-[280px] h-9">
            <SelectValue placeholder="Selecione a conta" />
          </SelectTrigger>
          <SelectContent>
            {(contas ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!contaBancariaId ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Selecione uma conta bancária para começar.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="itau">
          <TabsList>
            <TabsTrigger value="itau" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Planilha Itaú
              {pendentesTotal > 0 && <Badge variant="secondary">{pendentesTotal}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="ofx" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              OFX Residual
              {ofxPendentes.length > 0 && <Badge variant="secondary">{ofxPendentes.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab Planilha Itaú ── */}
          <TabsContent value="itau" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-muted/30">
              {[
                { label: "Auto", count: auto.length, color: "text-emerald-600", Icon: CheckCircle2 },
                { label: "Operador", count: operador.length, color: "text-amber-500", Icon: AlertCircle },
                { label: "Sem CPR", count: semCpr.length, color: "text-orange-500", Icon: AlertCircle },
                { label: "Sem Parceiro", count: semParc.length, color: "text-red-500", Icon: XCircle },
                { label: "CPR Criada", count: cprCriada.length, color: "text-blue-500", Icon: AlertCircle },
              ].map(({ label, count, color, Icon }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs px-2 py-1 bg-background rounded border">
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  <span className="text-muted-foreground">{label}:</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
              <div className="flex-1" />
              {auto.length > 0 && (
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={confirmarLoteMutation.isPending}
                  onClick={() => confirmarLoteMutation.mutate()}
                >
                  {confirmarLoteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Confirmar {auto.length} automático{auto.length !== 1 ? "s" : ""}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={reprocessarMutation.isPending}
                onClick={() => reprocessarMutation.mutate()}
                title="Reseta itens pendentes e roda o matching novamente"
              >
                {reprocessarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Re-processar
              </Button>
            </div>

            {loadingPag ? (
              <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : pendentesTotal === 0 && concluidos.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum pagamento ainda. Importe um relatório XLSX em{" "}
                  <a href="/administrativo/importar" className="text-primary underline">Importar Dados</a>.
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue={defaultSubTab}>
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="auto" className="gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Auto ({auto.length})
                  </TabsTrigger>
                  <TabsTrigger value="operador" className="gap-1 text-xs">
                    <AlertCircle className="h-3 w-3 text-amber-500" /> Operador ({operador.length})
                  </TabsTrigger>
                  <TabsTrigger value="semcpr" className="gap-1 text-xs">
                    <AlertCircle className="h-3 w-3 text-orange-500" /> Sem CPR ({semCpr.length})
                  </TabsTrigger>
                  <TabsTrigger value="semparc" className="gap-1 text-xs">
                    <XCircle className="h-3 w-3 text-red-500" /> Sem Parceiro ({semParc.length})
                  </TabsTrigger>
                  {cprCriada.length > 0 && (
                    <TabsTrigger value="cprcriada" className="gap-1 text-xs">
                      <FileSpreadsheet className="h-3 w-3 text-blue-500" /> CPR Criada ({cprCriada.length})
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="concluido" className="gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-muted-foreground" /> Concluído ({concluidos.length})
                  </TabsTrigger>
                </TabsList>

                {/* Auto */}
                <TabsContent value="auto" className="space-y-2">
                  {auto.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">Nenhum match automático pendente.</p>
                  ) : auto.map((p) => (
                    <div key={p.id} className="p-3 border rounded text-xs flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.nome_favorecido}</p>
                        <p className="text-muted-foreground text-[10px]">
                          {p.conta_pagar?.descricao ?? "—"} · venc {p.conta_pagar?.data_vencimento ? formatDateBR(p.conta_pagar.data_vencimento) : "—"}
                        </p>
                      </div>
                      <span className="font-mono font-semibold">{formatBRL(p.valor_pago)}</span>
                    </div>
                  ))}
                </TabsContent>

                {/* Operador */}
                <TabsContent value="operador" className="space-y-2">
                  {operador.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">Nenhuma ambiguidade pendente.</p>
                  ) : operador.map((p) => (
                    <ItemOperador
                      key={p.id}
                      pag={p}
                      onConfirmar={(pagId, cprId) => confirmarUnitarioMutation.mutate({ pagId, cprId })}
                    />
                  ))}
                </TabsContent>

                {/* Sem CPR */}
                <TabsContent value="semcpr" className="space-y-2">
                  {semCpr.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">Nenhum pagamento sem CPR.</p>
                  ) : semCpr.map((p) => (
                    <div key={p.id} className="p-3 border rounded text-xs flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.nome_favorecido}</p>
                        <p className="text-muted-foreground text-[10px]">
                          {p.tipo_pagamento} · {p.data_pagamento ? formatDateBR(p.data_pagamento) : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{formatBRL(p.valor_pago)}</span>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => criarDespesaMutation.mutate(p)}>
                          <Plus className="h-3.5 w-3.5" /> Criar Despesa
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => ignorarMutation.mutate(p.id)}>
                          <X className="h-3.5 w-3.5" /> Ignorar
                        </Button>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {/* Sem Parceiro */}
                <TabsContent value="semparc" className="space-y-2">
                  {semParc.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">Todos os CNPJs foram identificados.</p>
                  ) : semParc.map((p) => (
                    <div key={p.id} className="p-3 border rounded text-xs flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.nome_favorecido}</p>
                        <p className="text-muted-foreground text-[10px]">{p.cnpj_favorecido} — parceiro não cadastrado</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{formatBRL(p.valor_pago)}</span>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => { setPagParaCadastrar(p); setParceiroSheetOpen(true); }}>
                          <Users className="h-3.5 w-3.5" /> Cadastrar
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => ignorarMutation.mutate(p.id)}>
                          <X className="h-3.5 w-3.5" /> Ignorar
                        </Button>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {/* CPR Criada */}
                {cprCriada.length > 0 && (
                  <TabsContent value="cprcriada" className="space-y-2">
                    <p className="text-[11px] text-muted-foreground p-2 bg-muted/30 rounded">
                      Despesa criada em Contas a Pagar. Categorize e aprove — depois clique <strong>Re-processar</strong>.
                    </p>
                    {cprCriada.map((p) => (
                      <div key={p.id} className="p-3 border rounded text-xs flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{p.nome_favorecido}</p>
                          <p className="text-muted-foreground text-[10px]">
                            {p.tipo_pagamento} · {p.data_pagamento ? formatDateBR(p.data_pagamento) : "—"}
                          </p>
                        </div>
                        <span className="font-mono font-semibold">{formatBRL(p.valor_pago)}</span>
                      </div>
                    ))}
                  </TabsContent>
                )}

                {/* Concluído */}
                <TabsContent value="concluido" className="space-y-2">
                  {concluidos.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">Nenhum item concluído ainda.</p>
                  ) : concluidos.map((p) => {
                    const ignorado = p.status_conciliacao === "ignorado";
                    return (
                      <div key={p.id} className="p-3 border rounded text-xs flex items-center justify-between gap-2 opacity-75">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{p.nome_favorecido}</p>
                            <Badge variant={ignorado ? "outline" : "secondary"} className="text-[9px]">
                              {ignorado ? "Ignorado" : "✓ Conciliado"}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground text-[10px]">
                            {p.tipo_pagamento} · {p.data_pagamento ? formatDateBR(p.data_pagamento) : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{formatBRL(p.valor_pago)}</span>
                          {ignorado && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1"
                              onClick={() => reverterMutation.mutate(p.id)}
                              title="Reverter para fila de trabalho"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Reverter
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>
              </Tabs>
            )}
          </TabsContent>

          {/* ── Tab OFX Residual ── */}
          <TabsContent value="ofx">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Transações sem correspondência na planilha</p>
                  <Badge variant="secondary">{ofxPendentes.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tarifas bancárias, rendimentos de aplicação, TEDs recebidas e outras transações não iniciadas pela Fetely.
                </p>
                <Input
                  placeholder="Filtrar por descrição..."
                  value={filtroOFX}
                  onChange={(e) => setFiltroOFX(e.target.value)}
                  className="h-8 text-xs mt-2"
                />
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingOFX ? (
                  <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
                ) : ofxFiltrados.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center p-4">
                    {ofxPendentes.length === 0 ? "Nenhuma transação OFX pendente. Tudo conciliado! 🎉" : "Nenhuma transação com esse filtro."}
                  </p>
                ) : ofxFiltrados.map((ofx) => {
                  const isDebito = ofx.valor < 0;
                  const acao = acaoOFX?.includes(ofx.id);
                  return (
                    <div key={ofx.id} className="p-3 border rounded text-xs flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{ofx.descricao}</p>
                          <p className="text-muted-foreground text-[10px] shrink-0">{formatDateBR(ofx.data_transacao)}</p>
                        </div>
                        <span className={`font-mono font-semibold ${isDebito ? "text-red-600" : "text-emerald-600"}`}>
                          {formatBRL(ofx.valor)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="gap-1" disabled={acao} onClick={() => handleLancarOFX(ofx)}>
                          <Plus className="h-3.5 w-3.5" /> Lançar como movimentação
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1" disabled={acao} onClick={() => handleIgnorarOFX(ofx)}>
                          <X className="h-3.5 w-3.5" /> Ignorar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Sheet de cadastro de parceiro inline */}
      <ParceiroFormSheet
        open={parceiroSheetOpen}
        onOpenChange={(v) => { setParceiroSheetOpen(v); if (!v) setPagParaCadastrar(null); }}
        categorias={categorias}
        prefill={pagParaCadastrar ? {
          razao_social: pagParaCadastrar.nome_favorecido,
          cnpj: pagParaCadastrar.cnpj_favorecido,
        } : undefined}
        onSaved={async () => {
          if (!pagParaCadastrar) return;
          const { data: imps } = await sb.from("itau_importacoes_stage")
            .select("id").eq("conta_bancaria_id", contaBancariaId);
          const ids = (imps || []).map((i: any) => i.id);
          if (ids.length) {
            await sb.from("itau_pagamentos_stage")
              .update({ status_conciliacao: "pendente", parceiro_id: null })
              .in("importacao_id", ids)
              .eq("cnpj_favorecido", pagParaCadastrar.cnpj_favorecido)
              .eq("status_conciliacao", "sem_parceiro");
            for (const id of ids) {
              await sb.rpc("processar_itau_pagamentos", { p_importacao_id: id });
            }
          }
          setParceiroSheetOpen(false);
          setPagParaCadastrar(null);
          invalidarPagamentos();
          toast.success("Parceiro cadastrado — conciliação atualizada");
        }}
      />
    </div>
  );
}
