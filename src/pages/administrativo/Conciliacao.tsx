import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Link2,
  Plus,
  X,
  ArrowLeftRight,
  FileSpreadsheet,
  CheckSquare,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type ContaBancaria = { id: string; nome_exibicao: string };

type Importacao = {
  id: string;
  arquivo_nome: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  total_linhas: number;
  status: string;
  created_at: string;
};

type Pagamento = {
  id: string;
  nome_favorecido: string;
  cnpj_favorecido: string;
  tipo_pagamento: string;
  valor_pago: number;
  data_pagamento: string | null;
  status_conciliacao: string;
  parceiro_id: string | null;
  conta_pagar_id: string | null;
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
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{pag.nome_favorecido}</div>
          <div className="text-xs text-muted-foreground">{pag.cnpj_favorecido}</div>
          {pag.data_pagamento && (
            <div className="text-xs mt-0.5">
              <span className="text-muted-foreground">Pago em: </span>
              <span className="font-medium text-foreground">{formatDateBR(pag.data_pagamento)}</span>
            </div>
          )}
        </div>
        <div className="text-sm font-semibold whitespace-nowrap">{formatBRL(pag.valor_pago)}</div>
      </div>
      <div className="flex items-center gap-2">
        <Select value={cprSelecionada} onValueChange={setCprSelecionada}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder={cprs.length === 0 ? "Nenhuma CPR candidata" : "Escolher CPR"} />
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
          <Link2 className="h-3.5 w-3.5" />
          Confirmar
        </Button>
      </div>
    </div>
  );
}

// ─── PainelImportacao ─────────────────────────────────────────────────────

function PainelImportacao({ importacao }: { importacao: Importacao }) {
  const qc = useQueryClient();

  const { data: pagamentos = [], isLoading } = useQuery({
    queryKey: ["itau-pagamentos", importacao.id],
    queryFn: async () => {
      const { data } = await sb
        .from("itau_pagamentos_stage")
        .select(
          "id, nome_favorecido, cnpj_favorecido, tipo_pagamento, valor_pago, data_pagamento, status_conciliacao, parceiro_id, conta_pagar_id, conta_pagar:conta_pagar_id(descricao, data_vencimento)"
        )
        .eq("importacao_id", importacao.id)
        .order("nome_favorecido");
      return (data || []) as Pagamento[];
    },
  });

  const auto = pagamentos.filter((p) => p.status_conciliacao === "conciliado_auto");
  const operador = pagamentos.filter((p) => p.status_conciliacao === "aguardando_operador");
  const semCpr = pagamentos.filter((p) => p.status_conciliacao === "sem_cpr");
  const semParc = pagamentos.filter((p) => p.status_conciliacao === "sem_parceiro");
  const concluido = pagamentos.filter((p) => p.status_conciliacao === "conciliado_manual");

  const confirmarLoteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("confirmar_itau_lote_auto", {
        p_importacao_id: importacao.id,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || "Erro ao confirmar");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.confirmados} pagamentos confirmados`);
      qc.invalidateQueries({ queryKey: ["itau-pagamentos", importacao.id] });
      qc.invalidateQueries({ queryKey: ["itau-importacoes"] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const confirmarUnitarioMutation = useMutation({
    mutationFn: async ({ pagId, cprId }: { pagId: string; cprId: string }) => {
      const { data, error } = await sb.rpc("confirmar_itau_pagamento_unitario", {
        p_pagamento_id: pagId,
        p_conta_pagar_id: cprId,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || "Erro");
      return data;
    },
    onSuccess: () => {
      toast.success("Pagamento confirmado");
      qc.invalidateQueries({ queryKey: ["itau-pagamentos", importacao.id] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const ignorarMutation = useMutation({
    mutationFn: async (pagId: string) => {
      const { error } = await sb
        .from("itau_pagamentos_stage")
        .update({ status_conciliacao: "ignorado" })
        .eq("id", pagId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itau-pagamentos", importacao.id] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  const banner = [
    { label: "Automático", count: auto.length, color: "text-emerald-600", Icon: CheckCircle2 },
    { label: "Operador", count: operador.length, color: "text-amber-500", Icon: AlertCircle },
    { label: "Sem CPR", count: semCpr.length, color: "text-orange-500", Icon: AlertCircle },
    { label: "Sem Parceiro", count: semParc.length, color: "text-red-500", Icon: XCircle },
  ];

  const initialTab = auto.length > 0 ? "auto" : operador.length > 0 ? "operador" : "semcpr";

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {banner.map(({ label, count, color, Icon }) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <Icon className={`h-4 w-4 ${color}`} />
            <span className="text-muted-foreground">{label}:</span>
            <span className="font-semibold">{count}</span>
          </div>
        ))}
      </div>

      {auto.length > 0 && (
        <Button
          onClick={() => confirmarLoteMutation.mutate()}
          disabled={confirmarLoteMutation.isPending}
          className="gap-2"
        >
          {confirmarLoteMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Confirmar {auto.length} pagamento{auto.length !== 1 ? "s" : ""} automático
          {auto.length !== 1 ? "s" : ""}
        </Button>
      )}

      <Tabs defaultValue={initialTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="auto" className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Automático ({auto.length})
          </TabsTrigger>
          <TabsTrigger value="operador" className="gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> Operador ({operador.length})
          </TabsTrigger>
          <TabsTrigger value="semcpr" className="gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> Sem CPR ({semCpr.length})
          </TabsTrigger>
          <TabsTrigger value="semparc" className="gap-1">
            <XCircle className="h-3.5 w-3.5" /> Sem Parceiro ({semParc.length})
          </TabsTrigger>
          {concluido.length > 0 && (
            <TabsTrigger value="concluido" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Concluído ({concluido.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="auto" className="space-y-2 mt-3">
          {auto.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              Nenhum. Use o botão acima para confirmar.
            </p>
          ) : (
            auto.map((p) => (
              <div
                key={p.id}
                className="border rounded-md p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{p.nome_favorecido}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.conta_pagar?.descricao ?? "—"} · venc{" "}
                    {p.conta_pagar?.data_vencimento
                      ? formatDateBR(p.conta_pagar.data_vencimento)
                      : "—"}
                  </div>
                </div>
                <div className="text-sm font-semibold whitespace-nowrap">
                  {formatBRL(p.valor_pago)}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="operador" className="space-y-2 mt-3">
          {operador.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">Nenhuma ambiguidade pendente.</p>
          ) : (
            operador.map((p) => (
              <ItemOperador
                key={p.id}
                pag={p}
                onConfirmar={(pagId, cprId) =>
                  confirmarUnitarioMutation.mutate({ pagId, cprId })
                }
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="semcpr" className="space-y-2 mt-3">
          {semCpr.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">Nenhum pagamento sem CPR.</p>
          ) : (
            semCpr.map((p) => (
              <div
                key={p.id}
                className="border rounded-md p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{p.nome_favorecido}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.tipo_pagamento} · {p.data_pagamento ? formatDateBR(p.data_pagamento) : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {formatBRL(p.valor_pago)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => ignorarMutation.mutate(p.id)}
                    className="gap-1"
                  >
                    <X className="h-3.5 w-3.5" /> Ignorar
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="semparc" className="space-y-2 mt-3">
          {semParc.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">Todos os CNPJs foram identificados.</p>
          ) : (
            semParc.map((p) => (
              <div
                key={p.id}
                className="border rounded-md p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{p.nome_favorecido}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.cnpj_favorecido} — parceiro não cadastrado
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {formatBRL(p.valor_pago)}
                  </span>
                  <Button size="sm" variant="outline" className="gap-1" disabled>
                    <Plus className="h-3.5 w-3.5" /> Cadastrar
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {concluido.length > 0 && (
          <TabsContent value="concluido" className="space-y-2 mt-3">
            {concluido.map((p) => (
              <div
                key={p.id}
                className="border rounded-md p-3 flex items-start justify-between gap-3 bg-muted/30"
              >
                <div className="font-medium text-sm truncate">{p.nome_favorecido}</div>
                <div className="text-sm font-semibold whitespace-nowrap">
                  {formatBRL(p.valor_pago)}
                </div>
              </div>
            ))}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────

export default function Conciliacao() {
  const qc = useQueryClient();
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [importacaoAberta, setImportacaoAberta] = useState<string | null>(null);
  const [filtroOFX, setFiltroOFX] = useState("");
  const [acaoOFX, setAcaoOFX] = useState<string | null>(null);

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

  const { data: importacoes = [], isLoading: loadingImp } = useQuery({
    queryKey: ["itau-importacoes", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      const { data } = await sb
        .from("itau_importacoes_stage")
        .select("id, arquivo_nome, periodo_inicio, periodo_fim, total_linhas, status, created_at")
        .eq("conta_bancaria_id", contaBancariaId)
        .order("created_at", { ascending: false });
      return (data || []) as Importacao[];
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

  const ofxFiltrados = filtroOFX.trim()
    ? ofxPendentes.filter((o) =>
        o.descricao.toLowerCase().includes(filtroOFX.toLowerCase())
      )
    : ofxPendentes;

  async function handleLancarOFX(ofx: TransacaoOFX) {
    if (!confirm(`Lançar como movimentação avulsa?\n\n${ofx.descricao} — ${formatBRL(ofx.valor)}`))
      return;
    setAcaoOFX("lancar:" + ofx.id);
    try {
      const { data, error } = await sb.rpc("lancar_ofx_como_movimentacao", { p_ofx_id: ofx.id });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Erro");
        return;
      }
      toast.success("Lançado como movimentação");
      qc.invalidateQueries({ queryKey: ["ofx-residual"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      toast.error("Erro: " + e?.message);
    } finally {
      setAcaoOFX(null);
    }
  }

  async function handleIgnorarOFX(ofx: TransacaoOFX) {
    setAcaoOFX("ignorar:" + ofx.id);
    try {
      const { data, error } = await sb.rpc("ignorar_ofx", { p_ofx_id: ofx.id });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Erro");
        return;
      }
      toast.success("Ignorada");
      qc.invalidateQueries({ queryKey: ["ofx-residual"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      toast.error("Erro: " + e?.message);
    } finally {
      setAcaoOFX(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-admin" />
          Conciliação Bancária
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Concilie pagamentos via relatório Itaú. Transações sem correspondência ficam no OFX
          Residual.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm">Conta bancária:</span>
        <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {(contas ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome_exibicao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!contaBancariaId ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Selecione uma conta bancária para ver as conciliações.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="planilha">
          <TabsList>
            <TabsTrigger value="planilha" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Planilha Itaú
              {importacoes.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {importacoes.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ofx" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              OFX Residual
              {ofxPendentes.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {ofxPendentes.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planilha" className="space-y-3 mt-4">
            {loadingImp ? (
              <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando importações...
              </div>
            ) : importacoes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Nenhuma importação encontrada. Importe um relatório XLSX em{" "}
                  <strong>Importar Dados</strong>.
                </CardContent>
              </Card>
            ) : (
              importacoes.map((imp) => {
                const aberta = importacaoAberta === imp.id;
                return (
                  <Card key={imp.id}>
                    <CardHeader
                      className="cursor-pointer py-3"
                      onClick={() => setImportacaoAberta(aberta ? null : imp.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileSpreadsheet className="h-5 w-5 text-admin shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{imp.arquivo_nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {imp.periodo_inicio && imp.periodo_fim
                                ? `${formatDateBR(imp.periodo_inicio)} → ${formatDateBR(imp.periodo_fim)}`
                                : "Período não identificado"}
                              {" · "}
                              {imp.total_linhas} pagamentos
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={imp.status === "processado" ? "default" : "outline"}>
                            {imp.status === "processado" ? "Processado" : "Pendente"}
                          </Badge>
                          {aberta ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    {aberta && (
                      <CardContent className="border-t pt-0">
                        <PainelImportacao importacao={imp} />
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="ofx" className="space-y-3 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ArrowLeftRight className="h-4 w-4" />
                    Transações sem correspondência na planilha
                    <Badge variant="secondary">{ofxPendentes.length}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tarifas bancárias, rendimentos de aplicação, TEDs recebidas e outras transações
                  não iniciadas pela Fetely.
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
                  <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                  </div>
                ) : ofxFiltrados.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    {ofxPendentes.length === 0
                      ? "Nenhuma transação OFX pendente. Tudo conciliado! 🎉"
                      : "Nenhuma transação com esse filtro."}
                  </p>
                ) : (
                  ofxFiltrados.map((ofx) => {
                    const isDebito = ofx.valor < 0;
                    const acao = acaoOFX?.includes(ofx.id);
                    return (
                      <div
                        key={ofx.id}
                        className="border rounded-md p-3 flex items-start justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{ofx.descricao}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDateBR(ofx.data_transacao)}
                            </div>
                          </div>
                          <span
                            className={`text-sm font-semibold whitespace-nowrap ${
                              isDebito ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {formatBRL(ofx.valor)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!acao}
                            onClick={() => handleLancarOFX(ofx)}
                            className="gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Lançar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!!acao}
                            onClick={() => handleIgnorarOFX(ofx)}
                            className="gap-1"
                          >
                            <X className="h-3.5 w-3.5" />
                            Ignorar
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

    </div>
  );
}
