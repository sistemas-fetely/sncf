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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, AlertCircle, XCircle, Loader2, Link2, Plus, X,
  ArrowLeftRight, FileSpreadsheet, RefreshCw, RotateCcw, Users, Zap, Search,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { ParceiroFormSheet } from "@/components/financeiro/ParceiroFormSheet";
import { BuscarMatchManualDialog } from "@/components/financeiro/BuscarMatchManualDialog";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";
import { useAplicarRegrasOFX } from "@/hooks/financeiro/useAplicarRegrasOFX";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────

type ContaBancaria = { id: string; nome_exibicao: string };

type Pagamento = {
  id: string;
  importacao_id: string;
  numero_lote: string | null;
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
  parcela_atual?: number | null;
  parcelas?: number | null;
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
      if (!pag.parceiro_id) return [];
      const tolerancia = (pag.valor_pago ?? 0) * 0.02;
      const minVal = (pag.valor_pago ?? 0) - Math.max(tolerancia, 0.01);
      const maxVal = (pag.valor_pago ?? 0) + Math.max(tolerancia, 0.01);
      const { data } = await sb
        .from("contas_pagar_receber")
        .select("id, descricao, data_vencimento, valor, parcela_atual, parcelas")
        .eq("parceiro_id", pag.parceiro_id)
        .gte("valor", minVal)
        .lte("valor", maxVal)
        .in("status", ["aberto", "aprovado", "aguardando_pagamento"])
        .is("movimentacao_bancaria_id", null)
        .order("data_vencimento", { ascending: true });
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
                {c.descricao}
                {c.parcela_atual && c.parcelas ? ` (${c.parcela_atual}/${c.parcelas})` : ""}
                {" · "}venc {c.data_vencimento ? formatDateBR(c.data_vencimento) : "—"}
                {" · "}{formatBRL(c.valor)}
                {Math.abs(c.valor - (pag.valor_pago ?? 0)) > 0.01
                  ? ` · dif ${formatBRL(Math.abs(c.valor - (pag.valor_pago ?? 0)))}`
                  : ""}
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
  const [buscarCPRPag, setBuscarCPRPag] = useState<Pagamento | null>(null);
  const [vincularOFXPag, setVincularOFXPag] = useState<Pagamento | null>(null);
  const [ordemPendentes, setOrdemPendentes] = useState<"data" | "nome" | "valor">("data");

  const { data: candidatosOFX = [] } = useQuery({
    queryKey: ["ofx-candidatos-vinculo", vincularOFXPag?.id, contaBancariaId],
    enabled: !!vincularOFXPag && !!contaBancariaId,
    queryFn: async () => {
      if (!vincularOFXPag || !contaBancariaId) return [];
      const valor = vincularOFXPag.valor_pago ?? 0;
      const tol   = Math.max(valor * 0.02, 0.50);
      const { data } = await sb
        .from("ofx_transacoes_stage")
        .select("id, data_transacao, descricao, valor")
        .eq("conta_bancaria_id", contaBancariaId)
        .eq("status", "pendente")
        .lt("valor", 0)
        .gte("valor", -(valor + tol))
        .lte("valor", -(valor - tol))
        .order("data_transacao", { ascending: false })
        .limit(20);
      return (data || []) as Array<{
        id: string;
        data_transacao: string;
        descricao: string;
        valor: number;
      }>;
    },
  });

  const { data: cprsParaBusca = [] } = useQuery({
    queryKey: ["cprs-busca-livre", buscarCPRPag?.id, buscarCPRPag?.parceiro_id],
    enabled: !!buscarCPRPag,
    queryFn: async () => {
      if (!buscarCPRPag) return [];
      let q = sb
        .from("contas_pagar_receber")
        .select("id, descricao, valor, data_vencimento, data_pagamento, fornecedor_cliente, nf_numero, parceiros_comerciais(razao_social)")
        .in("status", ["aberto", "aprovado", "aguardando_pagamento"])
        .is("movimentacao_bancaria_id", null)
        .order("data_vencimento", { ascending: false })
        .limit(200);
      if (buscarCPRPag.parceiro_id) {
        q = q.eq("parceiro_id", buscarCPRPag.parceiro_id);
      }
      const { data } = await q;
      return data || [];
    },
  });

  const { data: categorias = [] } = useCategoriasPlano();
  const { aplicarRegras } = useAplicarRegrasOFX();
  const [aplicandoRegras, setAplicandoRegras] = useState(false);

  async function handleAplicarRegras() {
    if (!contaBancariaId) return;
    setAplicandoRegras(true);
    try {
      const { aplicados } = await aplicarRegras(contaBancariaId);
      if (aplicados > 0) {
        toast.success(`${aplicados} transação${aplicados !== 1 ? "ões" : ""} lançada${aplicados !== 1 ? "s" : ""} automaticamente`);
      } else {
        toast.info("Nenhuma transação bateu com as regras cadastradas");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setAplicandoRegras(false);
    }
  }

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
        .select("id, importacao_id, numero_lote, nome_favorecido, cnpj_favorecido, tipo_pagamento, valor_pago, data_pagamento, status_conciliacao, parceiro_id, conta_pagar_id, movimentacao_id, conta_pagar:conta_pagar_id(descricao, data_vencimento)")
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
  const semCpr    = pagamentos.filter((p) => p.status_conciliacao === "sem_cpr" || p.status_conciliacao === "sem_cnpj");
  const semParc   = pagamentos.filter((p) => p.status_conciliacao === "sem_parceiro");
  const cprCriada = pagamentos.filter((p) => p.status_conciliacao === "cpr_criada");
  const concluidos = pagamentos.filter((p) =>
    p.status_conciliacao === "conciliado_manual" || p.status_conciliacao === "ignorado"
  );

  const invalidarPagamentos = () =>
    qc.invalidateQueries({ queryKey: ["itau-pagamentos-conta", contaBancariaId] });

  const invalidarOFX = () =>
    qc.invalidateQueries({ queryKey: ["ofx-residual", contaBancariaId] });

  async function vincularOFX(pag: Pagamento) {
    try {
      if (pag.numero_lote && pag.numero_lote !== "-") {
        const { data: loteItens } = await sb
          .from("itau_pagamentos_stage")
          .select("id, valor_pago, movimentacao_id")
          .eq("importacao_id", pag.importacao_id)
          .eq("numero_lote", pag.numero_lote);

        if (!loteItens?.length) return;

        // Só concilia o OFX SISPAG quando TODOS os itens do lote já foram confirmados
        const todosConfirmados = loteItens.every((i: any) => i.movimentacao_id !== null);
        if (!todosConfirmados) return;

        const somaLote = loteItens.reduce(
          (acc: number, i: any) => acc + (Number(i.valor_pago) || 0), 0
        );

        const { data: candidatos } = await sb
          .from("ofx_transacoes_stage")
          .select("id")
          .eq("conta_bancaria_id", contaBancariaId)
          .eq("status", "pendente")
          .lt("valor", 0)
          .gte("valor", -(somaLote + 0.05))
          .lte("valor", -(somaLote - 0.05));

        if (candidatos?.length === 1) {
          const ofxId = candidatos[0].id;
          await sb.from("ofx_transacoes_stage")
            .update({ status: "persistida" }).eq("id", ofxId);
          await sb.from("itau_pagamentos_stage")
            .update({ ofx_transacao_id: ofxId })
            .in("id", loteItens.map((i: any) => i.id));
        }
      } else {
        const { data: candidatos } = await sb
          .from("ofx_transacoes_stage")
          .select("id")
          .eq("conta_bancaria_id", contaBancariaId)
          .eq("status", "pendente")
          .lt("valor", 0)
          .gte("valor", -(pag.valor_pago + 0.05))
          .lte("valor", -(pag.valor_pago - 0.05));

        if (candidatos?.length === 1) {
          const ofxId = candidatos[0].id;
          await sb.from("ofx_transacoes_stage")
            .update({ status: "persistida" }).eq("id", ofxId);
          await sb.from("itau_pagamentos_stage")
            .update({ ofx_transacao_id: ofxId }).eq("id", pag.id);
        }
      }
    } catch {
      // melhor esforço
    }
  }

  // ─── Mutations ────────────────────────────────────────────────────────

  const confirmarLoteMutation = useMutation({
    mutationFn: async () => {
      const pendentes = auto.filter((p) => !p.movimentacao_id && p.conta_pagar_id);
      let confirmados = 0, erros = 0, jaPagas = 0;
      for (const pag of pendentes) {
        try {
          // Doutrina #54 — pula CPRs que já têm mov vinculada
          const { data: cprCheck } = await sb.from("contas_pagar_receber")
            .select("movimentacao_bancaria_id")
            .eq("id", pag.conta_pagar_id).maybeSingle();
          if (cprCheck?.movimentacao_bancaria_id) {
            jaPagas++;
            continue;
          }

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
          await vincularOFX(pag);
          confirmados++;
        } catch { erros++; }
      }
      return { confirmados, erros, jaPagas };
    },
    onSuccess: (d) => {
      const partes = [
        `${d.confirmados} confirmado${d.confirmados !== 1 ? "s" : ""}`,
      ];
      if (d.jaPagas > 0) partes.push(`${d.jaPagas} pulado${d.jaPagas !== 1 ? "s" : ""} (já conciliado${d.jaPagas !== 1 ? "s" : ""})`);
      if (d.erros > 0) partes.push(`${d.erros} erro(s)`);
      toast.success(partes.join(" · "));
      invalidarPagamentos();
      invalidarOFX();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const confirmarUnitarioMutation = useMutation({
    mutationFn: async ({ pagId, cprId }: { pagId: string; cprId: string }) => {
      // Doutrina #54 — guarda UX antes do trigger DB rejeitar
      const { data: cprCheck } = await sb.from("contas_pagar_receber")
        .select("movimentacao_bancaria_id, descricao, data_pagamento")
        .eq("id", cprId).maybeSingle();
      if (cprCheck?.movimentacao_bancaria_id) {
        throw new Error(
          `Esta CPR já possui movimentação vinculada` +
          (cprCheck.data_pagamento ? ` (paga em ${formatDateBR(cprCheck.data_pagamento)})` : "") +
          `. Desvincule a movimentação anterior antes de re-vincular.`
        );
      }

      const { data: pagCompleto } = await sb.from("itau_pagamentos_stage")
        .select("id, importacao_id, numero_lote, valor_pago, data_pagamento")
        .eq("id", pagId).maybeSingle();
      await sb.from("itau_pagamentos_stage").update({ conta_pagar_id: cprId }).eq("id", pagId);
      await sb.from("contas_pagar_receber").update({
        pago_em_conta_id: contaBancariaId,
        data_pagamento: pagCompleto?.data_pagamento ?? null,
      }).eq("id", cprId);
      const { data: res } = await sb.rpc("gerar_movimentacao_de_conta", { p_conta_id: cprId });
      if (!res?.ok) throw new Error(res?.erro || "Erro ao gerar movimentação");
      const { data: mov } = await sb.from("movimentacoes_bancarias")
        .select("id").eq("conta_pagar_id", cprId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      await sb.from("itau_pagamentos_stage").update({
        movimentacao_id: mov?.id ?? null, status_conciliacao: "conciliado_manual",
      }).eq("id", pagId);
      if (pagCompleto) await vincularOFX(pagCompleto as Pagamento);
    },
    onSuccess: () => { toast.success("Confirmado"); invalidarPagamentos(); invalidarOFX(); },
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

  const vincularManualMutation = useMutation({
    mutationFn: async ({ pagId, cprId }: { pagId: string; cprId: string }) => {
      const { error } = await sb
        .from("itau_pagamentos_stage")
        .update({ conta_pagar_id: cprId, status_conciliacao: "conciliado_manual" })
        .eq("id", pagId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("CPR vinculada com sucesso");
      setBuscarCPRPag(null);
      qc.invalidateQueries({ queryKey: ["itau-pagamentos-conta", contaBancariaId] });
    },
    onError: () => toast.error("Erro ao vincular CPR"),
  });

  const confirmarVinculoOFXMutation = useMutation({
    mutationFn: async ({ pagId, ofxId }: { pagId: string; ofxId: string }) => {
      const { error: e1 } = await sb
        .from("ofx_transacoes_stage")
        .update({ status: "persistida" })
        .eq("id", ofxId);
      if (e1) throw e1;
      const { error: e2 } = await sb
        .from("itau_pagamentos_stage")
        .update({ movimentacao_id: ofxId })
        .eq("id", pagId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Vinculado ao extrato");
      setVincularOFXPag(null);
      qc.invalidateQueries({ queryKey: ["itau-pagamentos-conta", contaBancariaId] });
      qc.invalidateQueries({ queryKey: ["ofx-residual", contaBancariaId] });
    },
    onError: () => toast.error("Erro ao vincular ao extrato"),
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

  const pendentesReais = operador.length + semCpr.length + semParc.length + cprCriada.length;
  const pendentesTotal = pendentesReais; // auto vai para Concluídos
  const defaultSubTab = pendentesReais > 0 ? "pendentes" : "concluidos";
  const todosOsPendentes = [...operador, ...semCpr, ...semParc, ...cprCriada];
  const pendentesOrdenados = [...todosOsPendentes].sort((a, b) => {
    if (ordemPendentes === "nome") {
      return (a.nome_favorecido ?? "").localeCompare(b.nome_favorecido ?? "", "pt-BR");
    }
    if (ordemPendentes === "valor") {
      return (b.valor_pago ?? 0) - (a.valor_pago ?? 0);
    }
    const da = a.data_pagamento ?? "";
    const db = b.data_pagamento ?? "";
    return db.localeCompare(da);
  });
  const todosOsConcluidos = [...auto, ...concluidos];
  const aguardandoOFX = todosOsConcluidos.filter(
    (p) => !p.movimentacao_id && p.status_conciliacao !== "ignorado" && !!p.conta_pagar_id
  );
  const resolvidos = todosOsConcluidos.filter(
    (p) => !!p.movimentacao_id || p.status_conciliacao === "ignorado"
  );

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
            {/* Ações */}
            <div className="flex items-center justify-end gap-2">
              {auto.length > 0 && (
                <Button
                  size="sm"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                  disabled={confirmarLoteMutation.isPending}
                  onClick={() => confirmarLoteMutation.mutate()}
                >
                  {confirmarLoteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Confirmar {auto.length} automático{auto.length !== 1 ? "s" : ""}
                </Button>
              )}
              <Button
                size="sm" variant="outline" className="gap-2 h-8"
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
                <TabsList>
                  <TabsTrigger value="pendentes" className="gap-1 text-xs">
                    {pendentesReais > 0 && (
                      <span className="h-4 w-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">
                        {pendentesReais}
                      </span>
                    )}
                    Pendentes
                  </TabsTrigger>
                  <TabsTrigger value="concluidos" className="gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                    Concluídos ({todosOsConcluidos.length})
                  </TabsTrigger>
                </TabsList>

                {/* ── Pendentes ── */}
                <TabsContent value="pendentes" className="space-y-2">
                  {todosOsPendentes.length > 1 && (
                    <div className="flex items-center gap-1 pb-1">
                      <span className="text-[10px] text-muted-foreground mr-1">Ordenar:</span>
                      {(["data", "nome", "valor"] as const).map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setOrdemPendentes(op)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            ordemPendentes === op
                              ? "bg-foreground text-background border-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {op === "data" ? "Data" : op === "nome" ? "Tomador" : "Valor"}
                        </button>
                      ))}
                    </div>
                  )}
                  {todosOsPendentes.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">
                      ✓ Nenhum item pendente. Tudo resolvido!
                    </p>
                  ) : (
                    <>
                      {cprCriada.length > 0 && (
                        <p className="text-[11px] text-muted-foreground p-2 bg-muted/30 rounded">
                          Há despesas criadas em Contas a Pagar aguardando categorização.
                          Categorize e aprove lá, depois clique <strong>Re-processar</strong>.
                        </p>
                      )}
                      {pendentesOrdenados.map((p) => {
                        const statusLabel =
                          p.status_conciliacao === "aguardando_operador" ? "Selecionar CPR" :
                          p.status_conciliacao === "sem_cnpj"            ? "Sem CNPJ" :
                          p.status_conciliacao === "sem_cpr"             ? "Sem CPR" :
                          p.status_conciliacao === "sem_parceiro"        ? "Sem parceiro" :
                          p.status_conciliacao === "cpr_criada"          ? "CPR criada" :
                          p.status_conciliacao;

                        const statusColor =
                          p.status_conciliacao === "aguardando_operador" ? "bg-amber-100 text-amber-800" :
                          p.status_conciliacao === "sem_parceiro"        ? "bg-red-100 text-red-800" :
                          p.status_conciliacao === "cpr_criada"          ? "bg-blue-100 text-blue-800" :
                          "bg-orange-100 text-orange-800";

                        if (p.status_conciliacao === "aguardando_operador") {
                          return (
                            <div key={p.id} className="space-y-1">
                              <div className="flex items-center gap-2 px-1">
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusColor}`}>
                                  {statusLabel}
                                </span>
                              </div>
                              <ItemOperador
                                pag={p}
                                onConfirmar={(pagId, cprId) => confirmarUnitarioMutation.mutate({ pagId, cprId })}
                              />
                            </div>
                          );
                        }

                        if (p.status_conciliacao === "cpr_criada") {
                          return (
                            <div key={p.id} className="p-3 border rounded text-xs flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusColor}`}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <p className="font-medium truncate">{p.nome_favorecido}</p>
                                <p className="text-muted-foreground text-[10px]">
                                  {p.tipo_pagamento} · {p.data_pagamento ? formatDateBR(p.data_pagamento) : "—"}
                                </p>
                              </div>
                              <span className="font-mono font-semibold">{formatBRL(p.valor_pago)}</span>
                            </div>
                          );
                        }

                        // sem_cpr, sem_cnpj, sem_parceiro
                        return (
                          <div key={p.id} className="p-3 border rounded text-xs flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusColor}`}>
                                  {statusLabel}
                                </span>
                              </div>
                              <p className="font-medium truncate">{p.nome_favorecido}</p>
                              <p className="text-muted-foreground text-[10px]">
                                {p.status_conciliacao === "sem_cnpj"
                                  ? "Sem CNPJ — vincule manualmente"
                                  : p.status_conciliacao === "sem_parceiro"
                                  ? `${p.cnpj_favorecido} — parceiro não cadastrado`
                                  : p.tipo_pagamento}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">
                                {p.data_pagamento ? formatDateBR(p.data_pagamento) : "—"}
                              </span>
                              <span className="text-muted-foreground text-sm">·</span>
                              <span className="font-mono font-semibold text-sm">{formatBRL(p.valor_pago)}</span>
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => setBuscarCPRPag(p)}>
                                <Search className="h-3.5 w-3.5" /> Vincular CPR
                              </Button>
                              {p.status_conciliacao !== "sem_cnpj" && p.status_conciliacao !== "sem_parceiro" && (
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => criarDespesaMutation.mutate(p)}>
                                  <Plus className="h-3.5 w-3.5" /> Criar Despesa
                                </Button>
                              )}
                              {p.status_conciliacao === "sem_parceiro" && (
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => { setPagParaCadastrar(p); setParceiroSheetOpen(true); }}>
                                  <Users className="h-3.5 w-3.5" /> Cadastrar
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="gap-1" onClick={() => ignorarMutation.mutate(p.id)}>
                                <X className="h-3.5 w-3.5" /> Ignorar
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </TabsContent>

                {/* ── Concluídos ── */}
                <TabsContent value="concluidos" className="space-y-2">
                  {aguardandoOFX.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5 px-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Aguardando vínculo com extrato ({aguardandoOFX.length})
                      </p>
                      {aguardandoOFX.map((p) => (
                        <div key={p.id} className="p-3 border border-amber-200 bg-amber-50/40 rounded text-xs flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                ⏳ Aguardando OFX
                              </span>
                            </div>
                            <p className="font-medium truncate">{p.nome_favorecido}</p>
                            <p className="text-muted-foreground text-[10px]">
                              CPR: {p.conta_pagar?.descricao ?? "—"} · venc {p.conta_pagar?.data_vencimento ? formatDateBR(p.conta_pagar.data_vencimento) : "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {p.data_pagamento ? formatDateBR(p.data_pagamento) : "—"}
                            </span>
                            <span className="font-mono font-semibold text-sm">{formatBRL(p.valor_pago)}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-50"
                              onClick={() => setVincularOFXPag(p)}
                            >
                              <ArrowLeftRight className="h-3.5 w-3.5" /> Vincular ao Extrato
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {resolvidos.length === 0 && aguardandoOFX.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">Nenhum item concluído ainda.</p>
                  ) : resolvidos.length > 0 && (
                    <div className="space-y-2">
                      {aguardandoOFX.length > 0 && (
                        <p className="text-[11px] font-semibold text-muted-foreground px-1">
                          Concluídos ({resolvidos.length})
                        </p>
                      )}
                      {resolvidos.map((p) => {
                        const isAuto     = p.status_conciliacao === "conciliado_auto";
                        const isIgnorado = p.status_conciliacao === "ignorado";
                        const badgeLabel = isAuto ? "✓ Auto" : isIgnorado ? "Ignorado" : "✓ Manual";
                        const badgeClass = isIgnorado
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-100 text-emerald-800";
                        return (
                          <div key={p.id} className="p-3 border rounded text-xs flex items-center justify-between gap-2 opacity-75">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${badgeClass}`}>
                                  {badgeLabel}
                                </span>
                              </div>
                              <p className="font-medium truncate">{p.nome_favorecido}</p>
                              <p className="text-muted-foreground text-[10px]">
                                {isAuto
                                  ? `${p.conta_pagar?.descricao ?? "—"} · venc ${p.conta_pagar?.data_vencimento ? formatDateBR(p.conta_pagar.data_vencimento) : "—"}`
                                  : `${p.tipo_pagamento} · ${p.data_pagamento ? formatDateBR(p.data_pagamento) : "—"}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold">{formatBRL(p.valor_pago)}</span>
                              {isIgnorado && (
                                <Button size="sm" variant="ghost" className="gap-1" onClick={() => reverterMutation.mutate(p.id)}>
                                  <RotateCcw className="h-3.5 w-3.5" /> Reverter
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    placeholder="Filtrar por descrição..."
                    value={filtroOFX}
                    onChange={(e) => setFiltroOFX(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 shrink-0"
                    disabled={aplicandoRegras}
                    onClick={handleAplicarRegras}
                    title="Aplica regras automáticas cadastradas em Parâmetros"
                  >
                    {aplicandoRegras
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Zap className="h-3.5 w-3.5" />}
                    Aplicar regras
                  </Button>
                </div>
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
                      <p className="font-medium truncate flex-1 min-w-0">{ofx.descricao}</p>
                      <div className="flex items-center gap-1.5 shrink-0 text-sm">
                        <span className="text-muted-foreground">{formatDateBR(ofx.data_transacao)}</span>
                        <span className="text-muted-foreground">·</span>
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

      {vincularOFXPag && (
        <Dialog open={!!vincularOFXPag} onOpenChange={(v) => { if (!v) setVincularOFXPag(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Vincular ao Extrato</DialogTitle>
              <DialogDescription>
                Selecione a transação do extrato bancário que corresponde a este pagamento.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground text-xs">Favorecido:</span> <span className="font-medium">{vincularOFXPag.nome_favorecido}</span></div>
                <div><span className="text-muted-foreground text-xs">Valor:</span> <span className="font-semibold">{formatBRL(vincularOFXPag.valor_pago)}</span></div>
                <div><span className="text-muted-foreground text-xs">Data:</span> <span className="font-medium">{vincularOFXPag.data_pagamento ? formatDateBR(vincularOFXPag.data_pagamento) : "—"}</span></div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Candidatos no extrato (±2% do valor):</p>
                {candidatosOFX.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic p-2 border rounded">
                    Nenhuma transação pendente com valor próximo encontrada no extrato.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {candidatosOFX.map((ofx) => (
                      <button
                        key={ofx.id}
                        type="button"
                        className="w-full text-left p-2.5 border rounded hover:bg-muted/50 text-xs transition-colors"
                        onClick={() => confirmarVinculoOFXMutation.mutate({
                          pagId: vincularOFXPag.id,
                          ofxId: ofx.id,
                        })}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{ofx.descricao}</span>
                          <span className="font-mono font-semibold shrink-0">{formatBRL(Math.abs(ofx.valor))}</span>
                        </div>
                        <p className="text-muted-foreground text-[10px] mt-0.5">
                          {formatDateBR(ofx.data_transacao)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVincularOFXPag(null)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <BuscarMatchManualDialog
        open={!!buscarCPRPag}
        onOpenChange={(v) => { if (!v) setBuscarCPRPag(null); }}
        movimentacao={
          buscarCPRPag
            ? {
                id: buscarCPRPag.id,
                data_transacao: buscarCPRPag.data_pagamento ?? new Date().toISOString().split("T")[0],
                descricao: buscarCPRPag.nome_favorecido ?? "",
                valor: -(buscarCPRPag.valor_pago ?? 0),
              }
            : null
        }
        contas={cprsParaBusca}
        onMatch={(cprId) =>
          buscarCPRPag &&
          vincularManualMutation.mutate({ pagId: buscarCPRPag.id, cprId })
        }
      />
    </div>
  );
}
