import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Link2, Plus, X, Loader2, AlertCircle, Search, ArrowLeftRight, CreditCard, Layers as LayersIcon } from "lucide-react";

import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { BuscarMultiplosLancamentosDialog } from "@/components/financeiro/BuscarMultiplosLancamentosDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getFaturaInfoMap, type FaturaInfo } from "@/lib/financeiro/get-fatura-info";

type ContaBancaria = { id: string; nome_exibicao: string };

type TransacaoOFX = {
  id: string;
  data_transacao: string;
  valor: number;
  descricao: string;
  tipo: string | null;
  conta_bancaria_id: string;
  status: string;
};

type ContaPagarPendente = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  fornecedor_cliente: string | null;
  status: string;
  formas_pagamento: { nome: string } | null;
};

export default function OFXStage() {
  const qc = useQueryClient();
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [ofxSelecionada, setOfxSelecionada] = useState<TransacaoOFX | null>(null);
  const [filtroDescOFX, setFiltroDescOFX] = useState("");
  const [filtroDescCP, setFiltroDescCP] = useState("");
  const [filtroValorOFX, setFiltroValorOFX] = useState("");
  const [filtroValorCP, setFiltroValorCP] = useState("");
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null);
  const [buscaMultiplaOpen, setBuscaMultiplaOpen] = useState(false);
  const [ofxIgnorar, setOfxIgnorar] = useState<TransacaoOFX | null>(null);

  const { data: contas } = useQuery({
    queryKey: ["contas-bancarias-ofx-stage"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("contas_bancarias")
        .select("id, nome_exibicao, tipo")
        .eq("ativo", true)
        .eq("tipo", "corrente")
        .order("nome_exibicao");
      return (data || []) as ContaBancaria[];
    },
  });

  const { data: transacoesOFX = [], isLoading: loadingOFX } = useQuery({
    queryKey: ["ofx-transacoes-pendentes", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("ofx_transacoes_stage")
        .select("id, data_transacao, valor, descricao, tipo, conta_bancaria_id, status")
        .eq("conta_bancaria_id", contaBancariaId)
        .eq("status", "pendente")
        .order("data_transacao", { ascending: false });
      return (data || []) as TransacaoOFX[];
    },
  });

  const { data: contasPagar = [], isLoading: loadingCP } = useQuery({
    queryKey: ["contas-pagar-pendentes-ofx"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("contas_pagar_receber")
        .select(
          "id, descricao, valor, data_vencimento, fornecedor_cliente, status, formas_pagamento:forma_pagamento_id(nome)",
        )
        .in("status", ["aprovado", "enviado_para_pagamento"])
        .is("movimentacao_bancaria_id", null)
        .order("data_vencimento", { ascending: true });
      return (data || []) as ContaPagarPendente[];
    },
  });

  // Map: conta_pagar_id -> { banco_nome, fatura_vencimento }
  // Trazido em query separada — não polui o select acima e tolera ausência.
  const { data: faturaInfoMap = new Map<string, FaturaInfo>() } = useQuery({
    queryKey: ["fatura-info-map-ofx", contasPagar.map((c) => c.id).join(",")],
    enabled: contasPagar.length > 0,
    queryFn: () => getFaturaInfoMap(contasPagar.map((c) => c.id)),
  });

  const ofxFiltradas = useMemo(() => {
    let lista = transacoesOFX;
    if (filtroDescOFX.trim()) {
      const t = filtroDescOFX.toLowerCase();
      lista = lista.filter((o) => o.descricao.toLowerCase().includes(t));
    }
    if (filtroValorOFX.trim()) {
      const prefixo = filtroValorOFX.replace(/[^\d]/g, "");
      if (prefixo) {
        lista = lista.filter((o) => {
          const valorInt = String(Math.round(Math.abs(o.valor) * 100));
          const valorReais = String(Math.floor(Math.abs(o.valor)));
          return valorReais.startsWith(prefixo) || valorInt.startsWith(prefixo);
        });
      }
    }
    return lista;
  }, [transacoesOFX, filtroDescOFX, filtroValorOFX]);

  const contasFiltradas = useMemo(() => {
    let lista: (ContaPagarPendente & { score?: number })[] = contasPagar;

    if (ofxSelecionada) {
      const valorAbs = Math.abs(ofxSelecionada.valor);
      lista = lista
        .map((c) => ({
          ...c,
          score: Math.abs(c.valor - valorAbs) <= 0.01
            ? 100
            : Math.abs(c.valor - valorAbs) <= 0.5
              ? 80
              : Math.abs(c.valor - valorAbs) <= 5
                ? 60
                : 0,
        }))
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    if (filtroDescCP.trim()) {
      const t = filtroDescCP.toLowerCase();
      lista = lista.filter((c) =>
        c.descricao.toLowerCase().includes(t) ||
        (c.fornecedor_cliente || "").toLowerCase().includes(t)
      );
    }

    if (filtroValorCP.trim()) {
      const prefixo = filtroValorCP.replace(/[^\d]/g, "");
      if (prefixo) {
        lista = lista.filter((c) => {
          const valorInt = String(Math.round(Math.abs(c.valor) * 100));
          const valorReais = String(Math.floor(Math.abs(c.valor)));
          return valorReais.startsWith(prefixo) || valorInt.startsWith(prefixo);
        });
      }
    }

    return lista;
  }, [contasPagar, ofxSelecionada, filtroDescCP, filtroValorCP]);



  async function handleConciliar(contaPagarId: string, contaPagarDesc: string) {
    if (!ofxSelecionada) return;
    setAcaoEmCurso("conciliar:" + contaPagarId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("conciliar_transacao_ofx", {
        p_ofx_id: ofxSelecionada.id,
        p_conta_pagar_id: contaPagarId,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Erro ao conciliar");
        return;
      }
      toast.success(`Conciliado: ${contaPagarDesc}`);
      setOfxSelecionada(null);
      qc.invalidateQueries({ queryKey: ["ofx-transacoes-pendentes"] });
      qc.invalidateQueries({ queryKey: ["contas-pagar-pendentes-ofx"] });
    } catch (e) {
      // Extrai mensagem útil de erros Supabase (message, details, hint) ou padrão JS
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg =
        err?.message ||
        err?.details ||
        err?.hint ||
        (e instanceof Error ? e.message : null) ||
        JSON.stringify(e);
      console.error("[OFXStage] erro:", e);
      toast.error("Erro: " + msg);
    } finally {
      setAcaoEmCurso(null);
    }
  }



  async function handleLancarMovimentacao(ofx: TransacaoOFX) {
    if (!confirm(`Lançar como movimentação avulsa (sem conta a pagar)?\n\n${ofx.descricao} — ${formatBRL(ofx.valor)}`)) return;
    setAcaoEmCurso("lancar:" + ofx.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("lancar_ofx_como_movimentacao", {
        p_ofx_id: ofx.id,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Erro");
        return;
      }
      toast.success(`Lançado como movimentação: ${ofx.descricao}`);
      if (ofxSelecionada?.id === ofx.id) setOfxSelecionada(null);
      qc.invalidateQueries({ queryKey: ["ofx-transacoes-pendentes"] });
    } catch (e) {
      // Extrai mensagem útil de erros Supabase (message, details, hint) ou padrão JS
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg =
        err?.message ||
        err?.details ||
        err?.hint ||
        (e instanceof Error ? e.message : null) ||
        JSON.stringify(e);
      console.error("[OFXStage] erro:", e);
      toast.error("Erro: " + msg);
    } finally {
      setAcaoEmCurso(null);
    }
  }

  async function handleIgnorar(ofx: TransacaoOFX) {
    setAcaoEmCurso("ignorar:" + ofx.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("ignorar_ofx", {
        p_ofx_id: ofx.id,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Erro");
        return;
      }
      toast.success("Ignorada");
      if (ofxSelecionada?.id === ofx.id) setOfxSelecionada(null);
      qc.invalidateQueries({ queryKey: ["ofx-transacoes-pendentes"] });
    } catch (e) {
      // Extrai mensagem útil de erros Supabase (message, details, hint) ou padrão JS
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg =
        err?.message ||
        err?.details ||
        err?.hint ||
        (e instanceof Error ? e.message : null) ||
        JSON.stringify(e);
      console.error("[OFXStage] erro:", e);
      toast.error("Erro: " + msg);
    } finally {
      setAcaoEmCurso(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-admin" />
          OFX em Stage
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Concilie transações do extrato bancário com despesas em Contas a Pagar. Importação acumula até conciliar.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-muted-foreground font-medium">Conta bancária:</span>
        <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[200px]">
            <SelectValue placeholder="Selecione a conta" />
          </SelectTrigger>
          <SelectContent>
            {(contas || []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome_exibicao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!contaBancariaId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Layers className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Selecione uma conta bancária para ver as transações pendentes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* OFX */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4 text-blue-600" />
                  Extrato OFX
                  <Badge variant="outline" className="ml-1">{transacoesOFX.length}</Badge>
                </h2>
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Filtrar por descrição..."
                  value={filtroDescOFX}
                  onChange={(e) => setFiltroDescOFX(e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor..."
                  value={filtroValorOFX}
                  onChange={(e) => setFiltroValorOFX(e.target.value)}
                  className="h-8 text-xs w-28"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {loadingOFX ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando...
                </div>
              ) : ofxFiltradas.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground">
                  {transacoesOFX.length === 0
                    ? "Nenhuma transação pendente. Importe um OFX em /administrativo/importar."
                    : "Nenhuma transação corresponde ao filtro."}
                </div>
              ) : (
                ofxFiltradas.map((ofx) => {
                  const selected = ofxSelecionada?.id === ofx.id;
                  const eh_debito = ofx.valor < 0;
                  const acao = acaoEmCurso?.includes(ofx.id) || acaoEmCurso === "conciliar:" + ofx.id;
                  return (
                    <div
                      key={ofx.id}
                      className={`p-2 border rounded text-xs transition-all cursor-pointer ${
                        selected
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                          : "border-zinc-200 hover:border-zinc-300"
                      }`}
                      onClick={() => !acao && setOfxSelecionada(selected ? null : ofx)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{ofx.descricao}</div>
                          <div className="text-muted-foreground text-[10px]">{formatDateBR(ofx.data_transacao)}</div>
                        </div>
                        <div className={`font-mono font-semibold ${eh_debito ? "text-red-700" : "text-emerald-700"}`}>
                          {formatBRL(ofx.valor)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] gap-1"
                          onClick={(e) => { e.stopPropagation(); handleLancarMovimentacao(ofx); }}
                          disabled={!!acao}
                        >
                          <Plus className="h-3 w-3" />
                          Lançar como movimentação
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] gap-1"
                          onClick={(e) => { e.stopPropagation(); setBuscaMultiplaOpen(true); }}
                          disabled={!!acao}
                          title="SISPAG: 1 OFX = N contas a pagar"
                        >
                          <LayersIcon className="h-3 w-3" />
                          Buscar Múltiplos
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px] gap-1 text-zinc-600"
                          onClick={(e) => { e.stopPropagation(); setOfxIgnorar(ofx); }}
                          disabled={!!acao}
                        >
                          <X className="h-3 w-3" />
                          Ignorar
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* CONTAS A PAGAR */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-600" />
                  Contas a Pagar
                  <Badge variant="outline" className="ml-1">{contasPagar.length}</Badge>
                </h2>
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Filtrar por descrição ou fornecedor..."
                  value={filtroDescCP}
                  onChange={(e) => setFiltroDescCP(e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor..."
                  value={filtroValorCP}
                  onChange={(e) => setFiltroValorCP(e.target.value)}
                  className="h-8 text-xs w-28"
                />
              </div>
              {ofxSelecionada && (
                <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded p-1.5 mt-1 flex items-center gap-1">
                  <Search className="h-3 w-3" />
                  Sugerindo matches por valor próximo de {formatBRL(Math.abs(ofxSelecionada.valor))}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {loadingCP ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando...
                </div>
              ) : contasFiltradas.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground">
                  Nenhuma conta a pagar pendente.
                </div>
              ) : (
                contasFiltradas.map((c) => {
                  const score = c.score || 0;
                  const acao = acaoEmCurso?.includes(c.id);
                  const meioPagamento = c.formas_pagamento?.nome ?? null;
                  const faturaInfo = faturaInfoMap.get(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`p-2 border rounded text-xs ${
                        score === 100
                          ? "border-emerald-400 bg-emerald-50"
                          : score >= 60
                            ? "border-emerald-200 bg-emerald-50/40"
                            : "border-zinc-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{c.descricao}</div>
                          <div className="text-muted-foreground text-[10px]">
                            {c.fornecedor_cliente && <span>{c.fornecedor_cliente} · </span>}
                            venc {formatDateBR(c.data_vencimento)}
                          </div>
                          {meioPagamento && (
                            <div className="flex items-center gap-1 text-[10px] text-zinc-600 mt-0.5">
                              <CreditCard className="h-3 w-3" />
                              <span>{meioPagamento}</span>
                              {faturaInfo?.banco_nome && (
                                <span className="text-muted-foreground"> · {faturaInfo.banco_nome}</span>
                              )}
                              {faturaInfo?.fatura_vencimento && (
                                <span className="text-muted-foreground">
                                  {" "}· fat {formatDateBR(faturaInfo.fatura_vencimento)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="font-mono font-semibold whitespace-nowrap">{formatBRL(c.valor)}</div>
                      </div>
                      {ofxSelecionada && (
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1 mt-2 w-full"
                          onClick={() => handleConciliar(c.id, c.descricao)}
                          disabled={!!acao}
                        >
                          {acao ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                          Conciliar com {formatBRL(Math.abs(ofxSelecionada.valor))}
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!ofxSelecionada && contaBancariaId && transacoesOFX.length > 0 && (
        <div className="text-xs text-muted-foreground bg-zinc-50 border rounded p-2 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Como usar:</strong> Clique em uma transação OFX (esquerda) para ver as contas a pagar candidatas (direita) ranqueadas por valor próximo. Depois clique "Conciliar" na conta correspondente. Sem match? Use "Lançar como movimentação" (taxa, IOF) ou "Ignorar".
          </div>
        </div>
      )}

      {ofxSelecionada && (
        <BuscarMultiplosLancamentosDialog
          open={buscaMultiplaOpen}
          onOpenChange={setBuscaMultiplaOpen}
          ofxId={ofxSelecionada.id}
          ofxDescricao={ofxSelecionada.descricao}
          ofxValorAbs={Math.abs(ofxSelecionada.valor)}
          ofxData={ofxSelecionada.data_transacao}
          onSuccess={() => {
            setOfxSelecionada(null);
          }}
        />
      )}

      <AlertDialog open={!!ofxIgnorar} onOpenChange={(open) => !open && setOfxIgnorar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignorar transação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {ofxIgnorar ? (
                <div>
                  <span className="font-medium block mt-2">{ofxIgnorar.descricao}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatBRL(ofxIgnorar.valor)} · {formatDateBR(ofxIgnorar.data_transacao)}
                  </span>
                </div>
              ) : <span />}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (ofxIgnorar) handleIgnorar(ofxIgnorar);
                setOfxIgnorar(null);
              }}
              className="bg-zinc-700 hover:bg-zinc-800 text-white"
            >
              Ignorar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
