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
  Sparkles, Clock, AlertCircle, Layers, ArrowLeftRight,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { CriarCPRAvulsaDialog } from "@/components/financeiro/CriarCPRAvulsaDialog";
import { Link } from "react-router-dom";

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
  tipo: "completo" | "parcial" | "sem_mov";
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

type RespostaConciliacao = {
  itens: ItemConciliacao[];
  lotes: LoteConciliacao[];
};

export default function Conciliacao() {
  const qc = useQueryClient();
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [lotesExpandidos, setLotesExpandidos] = useState<Set<string>>(new Set());
  const [criarCPRPlanilha, setCriarCPRPlanilha] = useState<ItemConciliacao | null>(null);

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

  const itens = resultado?.itens ?? [];
  const lotes = resultado?.lotes ?? [];
  const completos =
    itens.filter((i) => i.tipo === "completo").length +
    lotes.filter((l) => l.tipo === "lote_completo").length;
  const parciais =
    itens.filter((i) => i.tipo === "parcial").length +
    lotes.filter((l) => l.tipo === "lote_parcial").length;
  const semMov = itens.filter((i) => i.tipo === "sem_mov").length;

  function nivelBadge(nivel: number) {
    if (nivel <= 2) return "bg-emerald-100 text-emerald-800";
    if (nivel === 3) return "bg-amber-100 text-amber-800";
    return "bg-muted text-muted-foreground";
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
        <div className="text-xs text-muted-foreground flex items-center gap-2 shrink-0">
          <Link to="/administrativo/conciliacao/stage-1" className="hover:underline">Stage 1</Link>
          <span>·</span>
          <Link to="/administrativo/conciliacao/stage-2" className="hover:underline">Stage 2</Link>
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
          {(completos + parciais + semMov) > 0 && (
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
                return (
                  <div
                    key={lote.numero_lote}
                    className={`rounded-lg border bg-card transition-colors ${
                      isCompleto
                        ? "border-l-4 border-l-emerald-500 bg-emerald-50/30"
                        : "border-l-4 border-l-amber-400"
                    }`}
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
                            <div className="flex items-center gap-2 shrink-0">
                              <span>{formatBRL(pl.valor_pago)}</span>
                              {pl.mov_sugerida ? (
                                <Badge className={`${nivelBadge(pl.mov_sugerida.nivel)} text-[10px]`}>
                                  Match {pl.mov_sugerida.nivel}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">Sem mov</Badge>
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
                      isCompleto
                        ? "border-l-4 border-l-emerald-500 bg-emerald-50/30"
                        : isParcial
                        ? "border-l-4 border-l-amber-400"
                        : ""
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1.5fr_1.5fr_auto] gap-3 items-center">
                      {/* Planilha */}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.nome_favorecido ?? "—"}</p>
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
                        {item.tipo === "sem_mov" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => setCriarCPRPlanilha(item)}
                          >
                            <Plus className="h-3 w-3" /> Criar CPR
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {itens.length === 0 && lotes.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhuma planilha pendente nesta conta.</p>
                <p className="text-xs text-muted-foreground">
                  Importe uma planilha em <Link to="/administrativo/importar-dados" className="underline">Importar Dados</Link>.
                </p>
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
    </div>
  );
}
