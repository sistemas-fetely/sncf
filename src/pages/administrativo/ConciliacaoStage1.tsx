import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FileSpreadsheet, Loader2, Link2, Search, AlertCircle, CheckCircle2, Plus, Sparkles,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { CriarCPRAvulsaDialog } from "@/components/financeiro/CriarCPRAvulsaDialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type ContaBancaria = { id: string; nome_exibicao: string };

type PlanilhaItem = {
  id: string;
  nome_favorecido: string | null;
  cnpj_favorecido: string | null;
  tipo_pagamento: string | null;
  valor_pago: number | null;
  data_pagamento: string | null;
  status_conciliacao: string;
};

type SugestaoLote = {
  planilha_id: string;
  sugestao_movimentacao_id: string | null;
  sugestao_data_transacao: string | null;
  sugestao_descricao: string | null;
  sugestao_valor: number | null;
  sugestao_conta_pagar_id: string | null;
  sugestao_conta_pagar_descricao: string | null;
  sugestao_parceiro_nome: string | null;
  melhor_nivel: number | null;
  melhor_nivel_descricao: string | null;
  qtd_no_melhor_nivel: number;
  qtd_total: number;
  pode_auto_sugerir: boolean;
};

type LinhaCombinada = PlanilhaItem & { sugestao: SugestaoLote | null };

type Candidato = {
  movimentacao_id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
  conta_pagar_id: string | null;
  conta_pagar_descricao: string | null;
  parceiro_nome: string | null;
  parceiro_cnpj: string | null;
  match_nivel: number;
  match_descricao: string;
};

function nivelBadgeClass(nivel: number | null): string {
  if (nivel === 1) return "bg-emerald-100 text-emerald-800";
  if (nivel === 2) return "bg-emerald-50 text-emerald-700";
  if (nivel === 3) return "bg-amber-100 text-amber-800";
  if (nivel === 4) return "bg-muted text-muted-foreground";
  return "bg-muted text-muted-foreground";
}

export default function ConciliacaoStage1() {
  const qc = useQueryClient();
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [drawerPlanilha, setDrawerPlanilha] = useState<PlanilhaItem | null>(null);
  const [criarCPROpen, setCriarCPROpen] = useState(false);
  const [criarCPRPlanilha, setCriarCPRPlanilha] = useState<PlanilhaItem | null>(null);

  const { data: contas } = useQuery({
    queryKey: ["contas-bancarias-stage1"],
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

  const { data: linhas = [], isLoading: loadingLinhas } = useQuery({
    queryKey: ["stage1-linhas-combinadas", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async (): Promise<LinhaCombinada[]> => {
      const { data: pendentes } = await sb
        .from("itau_pagamentos_stage")
        .select("id, nome_favorecido, cnpj_favorecido, tipo_pagamento, valor_pago, data_pagamento, status_conciliacao")
        .eq("conta_bancaria_id", contaBancariaId)
        .is("movimentacao_id", null)
        .not("status_conciliacao", "in", "(ignorado)")
        .order("data_pagamento", { ascending: false });

      const planilhas = (pendentes || []) as PlanilhaItem[];
      if (planilhas.length === 0) return [];

      const { data: sugestoes, error: errSug } = await sb.rpc(
        "apontar_matches_stage_1_em_lote",
        { p_conta_bancaria_id: contaBancariaId }
      );
      if (errSug) throw errSug;

      const mapaSug = new Map<string, SugestaoLote>();
      (sugestoes || []).forEach((s: SugestaoLote) => mapaSug.set(s.planilha_id, s));

      return planilhas.map((p) => ({ ...p, sugestao: mapaSug.get(p.id) ?? null }));
    },
  });

  const { data: candidatos = [], isLoading: loadingCand } = useQuery({
    queryKey: ["stage1-candidatos", drawerPlanilha?.id],
    enabled: !!drawerPlanilha,
    queryFn: async () => {
      if (!drawerPlanilha) return [];
      const { data, error } = await sb.rpc("apontar_matches_stage_1", {
        p_planilha_id: drawerPlanilha.id,
      });
      if (error) throw error;
      return (data || []) as Candidato[];
    },
  });

  const { data: vinculados = [] } = useQuery({
    queryKey: ["stage1-vinculados", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      const { data } = await sb
        .from("itau_pagamentos_stage")
        .select("id, nome_favorecido, cnpj_favorecido, valor_pago, data_pagamento, movimentacao_id, conta_pagar_id, conta_pagar:conta_pagar_id(descricao)")
        .eq("conta_bancaria_id", contaBancariaId)
        .eq("status_conciliacao", "aguardando_ofx")
        .order("data_pagamento", { ascending: false });
      return data || [];
    },
  });

  const vincularMutation = useMutation({
    mutationFn: async ({ planilhaId, movimentacaoId }: { planilhaId: string; movimentacaoId: string }) => {
      const { data, error } = await sb.rpc("vincular_stage_1", {
        p_planilha_id: planilhaId,
        p_movimentacao_id: movimentacaoId,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.motivo || "Erro desconhecido");
    },
    onSuccess: () => {
      toast.success("Vínculo Stage 1 criado — aguarda Stage 2");
      setDrawerPlanilha(null);
      qc.invalidateQueries({ queryKey: ["stage1-linhas-combinadas", contaBancariaId] });
      qc.invalidateQueries({ queryKey: ["conciliacao-hub-stage1-count"] });
      qc.invalidateQueries({ queryKey: ["stage1-vinculados", contaBancariaId] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const linhasOrdenadas = [...linhas].sort((a, b) => {
    const prioridade = (l: LinhaCombinada) => {
      if (l.sugestao?.pode_auto_sugerir) return 0;
      if ((l.sugestao?.qtd_total ?? 0) > 0) return 1;
      return 2;
    };
    const pri = prioridade(a) - prioridade(b);
    if (pri !== 0) return pri;
    return new Date(b.data_pagamento || 0).getTime() - new Date(a.data_pagamento || 0).getTime();
  });

  const totalSugestoesAuto = linhasOrdenadas.filter((l) => l.sugestao?.pode_auto_sugerir).length;
  const totalComCandidatos = linhasOrdenadas.filter(
    (l) => (l.sugestao?.qtd_total ?? 0) > 0 && !l.sugestao?.pode_auto_sugerir
  ).length;
  const totalSemMatch = linhasOrdenadas.filter((l) => !l.sugestao || l.sugestao.qtd_total === 0).length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Link to="/administrativo/conciliacao" className="hover:text-foreground hover:underline">
          Conciliação
        </Link>
        <span>/</span>
        <span>Stage 1</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6" />
          Stage 1 — Planilha ↔ Movimentação
        </h1>
        <p className="text-sm text-muted-foreground">
          A IA cruza cada linha da planilha Itaú com as movimentações pendentes da conta em 4 níveis
          (CNPJ+Data+Valor, CNPJ+Valor, Data+Valor, Valor). Onde encontra evidência forte e única — sugere
          direto. Onde tem ambiguidade — abre opções.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Conta bancária:</span>
        <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Selecione uma conta" />
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
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Selecione uma conta bancária para começar.
          </CardContent>
        </Card>
      ) : loadingLinhas ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Cruzando dados com a IA…
        </div>
      ) : linhas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
            <p className="font-medium">Nenhuma linha pendente nesta conta.</p>
            <p className="text-sm text-muted-foreground">
              Importe uma planilha em{" "}
              <Link to="/administrativo/importar-dados" className="underline">Importar Dados</Link>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {totalSugestoesAuto > 0 && (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
                <Sparkles className="h-3 w-3" />
                {totalSugestoesAuto} sugestã{totalSugestoesAuto !== 1 ? "ões" : "o"} pronta{totalSugestoesAuto !== 1 ? "s" : ""}
              </Badge>
            )}
            {totalComCandidatos > 0 && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                {totalComCandidatos} com candidatos
              </Badge>
            )}
            {totalSemMatch > 0 && (
              <Badge variant="outline">{totalSemMatch} sem match</Badge>
            )}
          </div>

          <div className="space-y-2">
            {linhasOrdenadas.map((l) => {
              const s = l.sugestao;
              const sugereAuto = !!s?.pode_auto_sugerir;
              const temCandidatos = (s?.qtd_total ?? 0) > 0 && !sugereAuto;
              const semMatch = !s || s.qtd_total === 0;

              return (
                <div
                  key={l.id}
                  className={`p-4 border rounded-md transition-colors ${
                    sugereAuto
                      ? "border-emerald-200 bg-emerald-50/30 border-l-4 border-l-emerald-500"
                      : temCandidatos
                      ? "border-l-4 border-l-amber-400 bg-card hover:bg-accent/30"
                      : "bg-card hover:bg-accent/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{l.nome_favorecido ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {l.cnpj_favorecido ?? "Sem CNPJ"} · {l.tipo_pagamento ?? "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-xs text-muted-foreground">
                        {l.data_pagamento ? formatDateBR(l.data_pagamento) : "—"}
                      </div>
                      <div className="font-medium tabular-nums">
                        {formatBRL(l.valor_pago ?? 0)}
                      </div>

                      {sugereAuto && s && (
                        <Button
                          size="sm"
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={vincularMutation.isPending}
                          onClick={() => vincularMutation.mutate({
                            planilhaId: l.id,
                            movimentacaoId: s.sugestao_movimentacao_id!,
                          })}
                        >
                          {vincularMutation.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Vincular
                        </Button>
                      )}

                      {temCandidatos && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => setDrawerPlanilha(l)}
                        >
                          <Search className="h-3.5 w-3.5" />
                          Ver {s!.qtd_total} candidato{s!.qtd_total !== 1 ? "s" : ""}
                        </Button>
                      )}

                      {semMatch && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => {
                            setCriarCPRPlanilha(l);
                            setCriarCPROpen(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Criar CPR
                        </Button>
                      )}
                    </div>
                  </div>

                  {sugereAuto && s && (
                    <div className="mt-2 flex items-center gap-2 text-xs flex-wrap pl-1">
                      <Badge className={`${nivelBadgeClass(s.melhor_nivel)} hover:${nivelBadgeClass(s.melhor_nivel)}`}>
                        Match {s.melhor_nivel} · {s.melhor_nivel_descricao}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium truncate">
                        {s.sugestao_parceiro_nome ?? s.sugestao_descricao ?? "—"}
                      </span>
                      {s.sugestao_conta_pagar_descricao && (
                        <span className="text-muted-foreground truncate">
                          · {s.sugestao_conta_pagar_descricao}
                        </span>
                      )}
                      {s.sugestao_data_transacao && (
                        <span className="text-muted-foreground">
                          · {formatDateBR(s.sugestao_data_transacao)}
                        </span>
                      )}
                    </div>
                  )}

                  {temCandidatos && s?.melhor_nivel_descricao && (
                    <div className="mt-2 text-xs pl-1">
                      <Badge variant="outline" className={nivelBadgeClass(s.melhor_nivel)}>
                        Melhor nível: {s.melhor_nivel} ({s.melhor_nivel_descricao}) · {s.qtd_no_melhor_nivel} no nível
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {vinculados.length > 0 && (
            <div className="mt-6 border-t pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Vinculados — aguardando Stage 2 ({vinculados.length})
              </p>
              {vinculados.map((v: any) => (
                <div key={v.id} className="p-3 border border-emerald-100 bg-emerald-50/20 rounded text-xs flex items-center justify-between gap-2 opacity-75">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{v.nome_favorecido ?? "—"}</p>
                    <p className="text-muted-foreground text-[10px]">
                      CPR: {v.conta_pagar?.descricao ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-muted-foreground">
                      {v.data_pagamento ? formatDateBR(v.data_pagamento) : "—"}
                    </span>
                    <span className="font-mono font-semibold text-sm">
                      {formatBRL(v.valor_pago ?? 0)}
                    </span>
                    <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700">
                      ✓ Stage 1 feito
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {drawerPlanilha && (
        <Dialog open={!!drawerPlanilha} onOpenChange={(v) => { if (!v) setDrawerPlanilha(null); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Candidatos para vínculo Stage 1</DialogTitle>
              <DialogDescription>
                Selecione a movimentação que corresponde a esta linha da planilha.
              </DialogDescription>
            </DialogHeader>

            <div className="p-3 rounded-md bg-muted/50 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium truncate">{drawerPlanilha.nome_favorecido ?? "—"}</span>
                <span className="font-medium tabular-nums">{formatBRL(drawerPlanilha.valor_pago ?? 0)}</span>
              </div>
              <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                <span>CNPJ: {drawerPlanilha.cnpj_favorecido ?? "—"}</span>
                <span>·</span>
                <span>Data: {drawerPlanilha.data_pagamento ? formatDateBR(drawerPlanilha.data_pagamento) : "—"}</span>
              </div>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-auto">
              <div className="text-sm font-medium">Movimentações candidatas:</div>
              {loadingCand ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando matches…
                </div>
              ) : candidatos.length === 0 ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 border rounded-md bg-amber-50 text-amber-900">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium">Nenhuma movimentação candidata encontrada.</p>
                      <p className="text-xs">
                        A CPR pode não estar registrada ainda — você pode criá-la avulsa agora e já vincular.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 w-full"
                    onClick={() => { setCriarCPRPlanilha(drawerPlanilha); setCriarCPROpen(true); }}
                  >
                    <Plus className="h-4 w-4" />
                    Criar CPR avulsa e vincular
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {candidatos.map((c) => (
                    <div
                      key={c.movimentacao_id}
                      className="flex items-start justify-between gap-3 p-3 border rounded-md hover:bg-accent/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div>
                          <Badge className={`${nivelBadgeClass(c.match_nivel)} hover:${nivelBadgeClass(c.match_nivel)}`}>
                            Match {c.match_nivel} · {c.match_descricao}
                          </Badge>
                        </div>
                        <div className="font-medium truncate">
                          {c.parceiro_nome ?? c.descricao ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.conta_pagar_descricao ?? c.descricao}
                          {c.parceiro_cnpj ? ` · CNPJ ${c.parceiro_cnpj}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="font-medium tabular-nums">{formatBRL(c.valor)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateBR(c.data_transacao)}
                        </div>
                        <Button
                          size="sm"
                          className="gap-1 mt-1"
                          disabled={vincularMutation.isPending}
                          onClick={() => vincularMutation.mutate({
                            planilhaId: drawerPlanilha.id,
                            movimentacaoId: c.movimentacao_id,
                          })}
                        >
                          {vincularMutation.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Link2 className="h-3.5 w-3.5" />}
                          Vincular
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDrawerPlanilha(null)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {criarCPRPlanilha && (
        <CriarCPRAvulsaDialog
          open={criarCPROpen}
          onOpenChange={(v) => {
            setCriarCPROpen(v);
            if (!v) setCriarCPRPlanilha(null);
          }}
          origem="stage_1"
          fonteId={criarCPRPlanilha.id}
          resumo={{
            titulo: criarCPRPlanilha.nome_favorecido ?? "—",
            valor: criarCPRPlanilha.valor_pago ?? 0,
            data: criarCPRPlanilha.data_pagamento,
            info: criarCPRPlanilha.cnpj_favorecido ?? undefined,
          }}
          descricaoInicial={criarCPRPlanilha.nome_favorecido ?? ""}
          onSucesso={() => {
            setCriarCPROpen(false);
            setCriarCPRPlanilha(null);
            setDrawerPlanilha(null);
            qc.invalidateQueries({ queryKey: ["stage1-linhas-combinadas", contaBancariaId] });
            qc.invalidateQueries({ queryKey: ["conciliacao-hub-stage1-count"] });
          }}
        />
      )}
    </div>
  );
}
