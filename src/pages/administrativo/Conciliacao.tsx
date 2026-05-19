import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GitCompare,
  Check,
  X,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Search,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  calcularSugestoes,
  classificarScore,
  type MovimentacaoOFX,
  type ContaPagarParaMatch,
} from "@/lib/financeiro/match-engine";
import { BuscarMatchManualDialog } from "@/components/financeiro/BuscarMatchManualDialog";

type Movimentacao = {
  id: string;
  conta_bancaria_id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
  tipo: string | null;
  conciliado: boolean | null;
  conta_pagar_id: string | null;
  origem: string | null;
};

type ContaBancariaLite = {
  id: string;
  nome_exibicao: string;
  cor: string | null;
};

type ContaParaMatch = {
  id: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  nf_numero: string | null;
  parceiros_comerciais?: { razao_social: string | null; cnpj: string | null } | null;
};

const SCORE_STYLES: Record<string, string> = {
  exato: "bg-emerald-100 text-emerald-900 border-emerald-300",
  alto: "bg-green-100 text-green-800 border-green-300",
  razoavel: "bg-amber-100 text-amber-800 border-amber-300",
  fraco: "bg-orange-100 text-orange-800 border-orange-300",
};

const SCORE_LABEL: Record<string, string> = {
  exato: "Match perfeito",
  alto: "Match forte",
  razoavel: "Match razoável",
  fraco: "Match fraco",
};

export default function Conciliacao() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [conciliando, setConciliando] = useState<Set<string>>(new Set());
  const [buscarMatchOpen, setBuscarMatchOpen] = useState(false);
  const [movParaBusca, setMovParaBusca] = useState<Movimentacao | null>(null);

  const { data: contasBancarias } = useQuery({
    queryKey: ["contas-bancarias-conciliacao"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao, cor")
        .eq("ativo", true)
        .order("nome_exibicao");
      return (data || []) as ContaBancariaLite[];
    },
  });

  const { data: movimentacoes, isLoading: loadingMovs } = useQuery({
    queryKey: ["movs-nao-conciliadas", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_bancarias")
        .select("id, conta_bancaria_id, data_transacao, descricao, valor, tipo, conciliado, conta_pagar_id, origem")
        .eq("conta_bancaria_id", contaBancariaId)
        .or("conciliado.is.null,conciliado.eq.false")
        .order("data_transacao", { ascending: false });
      if (error) throw error;
      return (data || []) as Movimentacao[];
    },
  });

  const { data: contasParaMatch, isLoading: loadingContas } = useQuery({
    queryKey: ["contas-para-match"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("contas_pagar_receber")
        .select(
          "id, valor, data_vencimento, data_pagamento, fornecedor_cliente, parceiro_id, nf_numero, parceiros_comerciais:parceiro_id(razao_social, cnpj)",
        )
        .eq("tipo", "pagar")
        .in("status", ["finalizado", "doc_pendente"])
        .is("movimentacao_bancaria_id", null);
      if (error) throw error;
      return (data || []) as ContaParaMatch[];
    },
  });

  const sugestoes = useMemo(() => {
    if (!movimentacoes || !contasParaMatch) return [];

    const movsOFX: MovimentacaoOFX[] = movimentacoes.map((m) => ({
      id: m.id,
      data_transacao: m.data_transacao,
      valor: m.valor,
      descricao: m.descricao,
    }));

    const contasMatch: ContaPagarParaMatch[] = contasParaMatch.map((c) => ({
      id: c.id,
      valor: c.valor,
      data_vencimento: c.data_vencimento,
      data_pagamento: c.data_pagamento,
      fornecedor_cliente: c.fornecedor_cliente,
      parceiro_razao_social: c.parceiros_comerciais?.razao_social,
      parceiro_cnpj: c.parceiros_comerciais?.cnpj,
      nf_numero: c.nf_numero,
    }));

    return calcularSugestoes(movsOFX, contasMatch, 50);
  }, [movimentacoes, contasParaMatch]);

  const mapMovs = useMemo(() => {
    const m: Record<string, Movimentacao> = {};
    (movimentacoes || []).forEach((mov) => (m[mov.id] = mov));
    return m;
  }, [movimentacoes]);

  const mapContas = useMemo(() => {
    const m: Record<string, ContaParaMatch> = {};
    (contasParaMatch || []).forEach((c) => (m[c.id] = c));
    return m;
  }, [contasParaMatch]);

  const movsComSugestao = sugestoes
    .map((s) => ({
      sugestao: s,
      mov: mapMovs[s.movimentacao_id],
      conta: mapContas[s.conta_pagar_id],
    }))
    .filter((x) => x.mov && x.conta);

  const movsSemSugestao = (movimentacoes || []).filter((m) => {
    if (m.valor >= 0) return false;
    return !sugestoes.find((s) => s.movimentacao_id === m.id);
  });

  const movsEntrada = (movimentacoes || []).filter((m) => m.valor > 0);

  async function confirmarMatch(movId: string, contaId: string) {
    setConciliando((prev) => new Set(prev).add(movId));
    try {
      const conciliadoEm = new Date().toISOString();
      const { error: e1 } = await supabase
        .from("movimentacoes_bancarias")
        .update({
          conciliado: true,
          conta_pagar_id: contaId,
          conciliado_em: conciliadoEm,
          conciliado_por: user?.id || null,
        })
        .eq("id", movId);
      if (e1) throw e1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e2 } = await (supabase as any)
        .from("contas_pagar_receber")
        .update({
          movimentacao_bancaria_id: movId,
          conciliado_em: conciliadoEm,
          conciliado_por: user?.id || null,
        })
        .eq("id", contaId);
      if (e2) throw e2;

      toast.success("Match confirmado");
      qc.invalidateQueries({ queryKey: ["movs-nao-conciliadas"] });
      qc.invalidateQueries({ queryKey: ["contas-para-match"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setConciliando((prev) => {
        const next = new Set(prev);
        next.delete(movId);
        return next;
      });
    }
  }

  async function ignorarMovimentacao(movId: string) {
    setConciliando((prev) => new Set(prev).add(movId));
    try {
      const { error } = await supabase
        .from("movimentacoes_bancarias")
        .update({
          conciliado: true,
          conta_pagar_id: null,
          conciliado_em: new Date().toISOString(),
          conciliado_por: user?.id || null,
        })
        .eq("id", movId);
      if (error) throw error;
      toast.success("Movimentação ignorada");
      qc.invalidateQueries({ queryKey: ["movs-nao-conciliadas"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setConciliando((prev) => {
        const next = new Set(prev);
        next.delete(movId);
        return next;
      });
    }
  }

  async function conciliarTodosFortes() {
    const fortes = movsComSugestao.filter((x) => x.sugestao.score >= 80);
    if (fortes.length === 0) {
      toast.info("Nenhum match forte (≥80) encontrado");
      return;
    }
    if (!confirm(`Conciliar ${fortes.length} matches com score ≥ 80 automaticamente?`)) {
      return;
    }
    let ok = 0;
    for (const x of fortes) {
      try {
        await confirmarMatch(x.mov.id, x.conta.id);
        ok++;
      } catch {
        // erro tratado individualmente
      }
    }
    toast.success(`${ok} matches conciliados`);
  }

  function abrirBuscaManual(mov: Movimentacao) {
    setMovParaBusca(mov);
    setBuscarMatchOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitCompare className="h-6 w-6 text-admin" />
          Conciliação OFX
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Compare extrato bancário com lançamentos do sistema. Confirme matches automáticos ou busque manualmente.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Conta bancária</p>
              <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Selecione a conta para conciliar..." />
                </SelectTrigger>
                <SelectContent>
                  {(contasBancarias || []).map((cb) => (
                    <SelectItem key={cb.id} value={cb.id}>
                      {cb.nome_exibicao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {contaBancariaId && movsComSugestao.length > 0 && (
              <Button
                onClick={conciliarTodosFortes}
                className="ml-auto gap-2 bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                <Zap className="h-4 w-4" />
                Conciliar todos os matches fortes
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!contaBancariaId ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <GitCompare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            Selecione uma conta bancária para iniciar a conciliação.
          </CardContent>
        </Card>
      ) : loadingMovs || loadingContas ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Movimentações pendentes</p>
                <p className="text-2xl font-bold">{(movimentacoes || []).length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Com sugestão de match</p>
                <p className="text-2xl font-bold text-emerald-700">{movsComSugestao.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Sem match (saídas)</p>
                <p className="text-2xl font-bold text-amber-700">{movsSemSugestao.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Entradas</p>
                <p className="text-2xl font-bold text-blue-700">{movsEntrada.length}</p>
              </CardContent>
            </Card>
          </div>

          {movsComSugestao.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-700" />
                  Matches sugeridos ({movsComSugestao.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {movsComSugestao.map(({ sugestao, mov, conta }) => {
                  const classe = classificarScore(sugestao.score);
                  const processando = conciliando.has(mov.id);
                  return (
                    <div
                      key={mov.id}
                      className={`rounded-lg border-2 p-3 ${SCORE_STYLES[classe]}`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="bg-white text-xs gap-1">
                            <Sparkles className="h-3 w-3" />
                            {SCORE_LABEL[classe]} · {sugestao.score} pts
                          </Badge>
                          <span className="text-xs">{sugestao.motivos.join(" · ")}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
                        <div className="bg-white rounded-md p-3 border">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                            Extrato bancário
                          </p>
                          <div className="text-xs text-muted-foreground">
                            {formatDateBR(mov.data_transacao)}
                          </div>
                          <div className="text-sm font-medium truncate mt-0.5" title={mov.descricao}>
                            {mov.descricao}
                          </div>
                          <div className="text-base font-mono font-bold text-red-700 mt-1">
                            {formatBRL(mov.valor)}
                          </div>
                        </div>

                        <div className="hidden md:flex items-center justify-center text-muted-foreground">
                          <ArrowRight className="h-5 w-5" />
                        </div>

                        <div className="bg-white rounded-md p-3 border">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                            Lançamento sistema
                          </p>
                          <div className="text-xs text-muted-foreground">
                            {conta.parceiros_comerciais?.razao_social || conta.fornecedor_cliente}
                            {conta.nf_numero && ` · NF ${conta.nf_numero}`}
                          </div>
                          <div className="text-sm font-medium truncate mt-0.5">
                            Venc: {formatDateBR(conta.data_vencimento)}
                            {conta.data_pagamento && ` · Pago: ${formatDateBR(conta.data_pagamento)}`}
                          </div>
                          <div className="text-base font-mono font-bold mt-1">
                            {formatBRL(conta.valor)}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-3 justify-end flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-white text-xs h-8"
                          onClick={() => abrirBuscaManual(mov)}
                          disabled={processando}
                        >
                          <Search className="h-3 w-3 mr-1" />
                          Outro lançamento
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-white text-xs h-8"
                          onClick={() => ignorarMovimentacao(mov.id)}
                          disabled={processando}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Ignorar
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8"
                          onClick={() => confirmarMatch(mov.id, conta.id)}
                          disabled={processando}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Confirmar match
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {movsSemSugestao.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  Sem match automático ({movsSemSugestao.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {movsSemSugestao.map((mov) => {
                  const processando = conciliando.has(mov.id);
                  return (
                    <div key={mov.id} className="rounded-md border p-3 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">
                          {formatDateBR(mov.data_transacao)}
                        </div>
                        <div className="truncate text-sm" title={mov.descricao}>
                          {mov.descricao}
                        </div>
                      </div>
                      <div className="font-mono text-sm text-red-700 whitespace-nowrap">
                        {formatBRL(mov.valor)}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8"
                          onClick={() => abrirBuscaManual(mov)}
                          disabled={processando}
                        >
                          <Search className="h-3 w-3 mr-1" />
                          Buscar match
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 text-muted-foreground"
                          onClick={() => ignorarMovimentacao(mov.id)}
                          disabled={processando}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Ignorar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {movsEntrada.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-blue-700">
                  Entradas — {movsEntrada.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {movsEntrada.map((mov) => (
                  <div key={mov.id} className="rounded-md border p-3 flex items-center gap-3 bg-blue-50/30 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {formatDateBR(mov.data_transacao)}
                      </div>
                      <div className="truncate text-sm" title={mov.descricao}>
                        {mov.descricao}
                      </div>
                    </div>
                    <div className="font-mono text-sm text-green-700 whitespace-nowrap">
                      {formatBRL(mov.valor)}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 text-muted-foreground"
                      onClick={() => ignorarMovimentacao(mov.id)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Ignorar
                    </Button>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground italic px-1">
                  Conciliação de entradas (Contas a Receber) será implementada em breve.
                </p>
              </CardContent>
            </Card>
          )}

          {(movimentacoes || []).length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-600" />
                <p className="font-medium">Tudo conciliado!</p>
                <p className="text-muted-foreground mt-1">
                  Não há movimentações pendentes para esta conta.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <BuscarMatchManualDialog
        open={buscarMatchOpen}
        onOpenChange={setBuscarMatchOpen}
        movimentacao={movParaBusca}
        contas={contasParaMatch || []}
        onMatch={(contaId) => {
          if (movParaBusca) {
            confirmarMatch(movParaBusca.id, contaId);
            setBuscarMatchOpen(false);
          }
        }}
      />
    </div>
  );
}
