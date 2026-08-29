import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2, AlertTriangle, Plus, Trash2, ExternalLink, HandCoins, Boxes, Undo2, ShieldAlert, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { useContaCorrenteCliente } from "./Consignados";

/**
 * MESA ÚNICA DO CONSIGNADO.
 * O modelo fiscal (`venda_com_acerto` | `consignacao_fiscal`) é atributo do
 * PARCEIRO, não bifurcação de processo: a mesa é uma só e os blocos que não se
 * aplicam somem por completo. O operador nunca escolhe documento — o banco decide.
 * Todo número vem de view ou de RPC; nada é calculado aqui.
 */

// ── contratos de leitura (espelham as views do banco) ─────────────────────
interface LimiteRow {
  parceiro_id: string;
  consignado_modelo: string | null;
  dia_acerto: number | null;
  saldo_corrido: number | null;
  exposicao_recuperavel: number | null;
  limite_concedido: number | null;
  limite_validade: string | null;
  forma_conta_corrente_aprovada: boolean | null;
  situacao_credito: string | null;
  limite_disponivel: number | null;
  uso_pct: number | null;
  cobertura: number | null;
  dias_estoque_mais_antigo: number | null;
}

interface ExtratoRow {
  parceiro_id: string;
  data: string | null;
  tipo: string | null;
  descricao: string | null;
  valor: number | null;
  ref: string | null;
  pedido_ref: string | null;
  nao_classificado: boolean | null;
  saldo_corrido: number | null;
}

interface DuplicidadeRow {
  nf_id: string;
  numero: string | null;
  data_emissao: string | null;
  valor_nota: number | null;
  pedido: string | null;
  sem_pedido_vinculado: boolean | null;
}

interface EstoqueParceiroRow {
  sku: string | null;
  produto: string | null;
  saldo: number | null;
  dias_no_parceiro: number | null;
  preco_sugerido: number | null;
}

interface EstoqueEstimadoRow {
  sku: string | null;
  qtd_enviada: number | null;
  qtd_devolvida: number | null;
  qtd_vendida_reportada: number | null;
  estoque_estimado: number | null;
}

interface AcertoRow {
  id: string;
  numero: string | null;
  competencia: string | null;
  status: string | null;
  valor_total: number | null;
  pedido_sintetico_id: string | null;
  data_confirmacao: string | null;
}

interface AcertoItemRow {
  id: string;
  sku: string | null;
  descricao: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
}

const MSG_SITUACAO: Record<string, string> = {
  sem_analise: "Sem análise de crédito aprovada.",
  analise_vencida: "Análise de crédito vencida — reanálise obrigatória.",
  limite_nulo: "Análise aprovada, mas SEM limite arbitrado: o parceiro não embarca.",
};

const num = (v: unknown) => (v === null || v === undefined ? "—" : String(v));

function ErroBloco({ error }: { error: unknown }) {
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4" />
      {(error as Error)?.message ?? "Falha ao carregar"}
    </div>
  );
}

function Carregando() {
  return (
    <div className="p-6 flex justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function ConsignadoDetalhe() {
  const { parceiroId } = useParams<{ parceiroId: string }>();
  const qc = useQueryClient();

  const invalidarTudo = async () => {
    await Promise.all([
      "consignados-conta-corrente",
      "consignado-limite",
      "consignado-extrato",
      "consignado-duplicidades",
      "consignado-estoque-parceiro",
      "consignado-estoque-estimado",
      "consignado-acertos",
      "consignado-acerto-itens",
    ].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  };

  const parceiroQ = useQuery({
    queryKey: ["consignado-parceiro", parceiroId],
    enabled: !!parceiroId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj")
        .eq("id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null } | null;
    },
  });

  const contaQ = useContaCorrenteCliente(parceiroId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cc = contaQ.data?.[0] as any;

  const limiteQ = useQuery({
    queryKey: ["consignado-limite", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<LimiteRow | null> => {
      const { data, error } = await (supabase as any)
        .from("vw_consignado_limite")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as LimiteRow | null;
    },
  });
  const limite = limiteQ.data;

  // FONTE DO MODELO: a conta corrente manda; a view de limite é o espelho.
  const modelo: string | null = cc?.consignado_modelo ?? limite?.consignado_modelo ?? null;
  const ehConsignacaoFiscal = modelo === "consignacao_fiscal";
  const diaAcerto = cc?.dia_acerto ?? limite?.dia_acerto ?? null;

  const extratoQ = useQuery({
    queryKey: ["consignado-extrato", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<ExtratoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_corrente_extrato_cliente")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .order("data", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ExtratoRow[];
    },
  });

  const nDuplicidades = Number(cc?.n_docs_duplicidade_suspeita ?? 0);
  const valorDuplicidade = Number(cc?.documentado_em_duplicidade_suspeita ?? 0);

  const duplicidadesQ = useQuery({
    queryKey: ["consignado-duplicidades", parceiroId],
    enabled: !!parceiroId && valorDuplicidade > 0,
    queryFn: async (): Promise<DuplicidadeRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_nf_duplicidade_suspeita")
        .select("nf_id, numero, data_emissao, valor_nota, pedido, sem_pedido_vinculado")
        .eq("parceiro_id", parceiroId)
        .order("data_emissao", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as DuplicidadeRow[];
    },
  });

  const estoqueParceiroQ = useQuery({
    queryKey: ["consignado-estoque-parceiro", parceiroId],
    enabled: !!parceiroId && ehConsignacaoFiscal,
    queryFn: async (): Promise<EstoqueParceiroRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_consignado_estoque_parceiro")
        .select("sku, produto, saldo, dias_no_parceiro, preco_sugerido")
        .eq("parceiro_id", parceiroId)
        .order("dias_no_parceiro", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as EstoqueParceiroRow[];
    },
  });

  const estoqueEstimadoQ = useQuery({
    queryKey: ["consignado-estoque-estimado", parceiroId],
    enabled: !!parceiroId && modelo === "venda_com_acerto",
    queryFn: async (): Promise<EstoqueEstimadoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_estoque_estimado_parceiro")
        .select("sku, qtd_enviada, qtd_devolvida, qtd_vendida_reportada, estoque_estimado")
        .eq("parceiro_id", parceiroId)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as EstoqueEstimadoRow[];
    },
  });

  const acertosQ = useQuery({
    queryKey: ["consignado-acertos", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<AcertoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("consignado_acerto")
        .select("id, numero, competencia, status, valor_total, pedido_sintetico_id, data_confirmacao")
        .eq("parceiro_id", parceiroId)
        .order("competencia", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as AcertoRow[];
    },
  });

  const rascunho = useMemo(
    () => (acertosQ.data ?? []).find((a) => a.status === "rascunho") ?? null,
    [acertosQ.data],
  );

  const itensRascunhoQ = useQuery({
    queryKey: ["consignado-acerto-itens", rascunho?.id],
    enabled: !!rascunho?.id,
    queryFn: async (): Promise<AcertoItemRow[]> => {
      if (!rascunho?.id) return [];
      const { data, error } = await (supabase as any)
        .from("consignado_acerto_item")
        .select("id, sku, descricao, quantidade, valor_unitario, valor_total")
        .eq("acerto_id", rascunho.id)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as AcertoItemRow[];
    },
  });

  // ── ciclo de acerto ───────────────────────────────────────────────────
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7));
  const [itens, setItens] = useState<{ sku: string; quantidade: string; valor_unitario: string }[]>([
    { sku: "", quantidade: "", valor_unitario: "" },
  ]);
  const [confirmacao, setConfirmacao] = useState<Record<string, unknown> | null>(null);

  const abrirAcerto = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("abrir_acerto_consignado", {
        p_parceiro_id: parceiroId,
        p_competencia: `${competencia}-01`,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      toast.success("Acerto do mês aberto", {
        description: "Idempotente: se já existia acerto nesta competência, é o mesmo.",
      });
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao abrir acerto", { description: e.message }),
  });

  const salvarItens = useMutation({
    mutationFn: async () => {
      if (!rascunho) throw new Error("Não há acerto em rascunho.");
      const payload = itens
        .filter((l) => l.sku.trim() && Number(l.quantidade) > 0)
        .map((l) => ({
          sku: l.sku.trim(),
          quantidade: Number(l.quantidade),
          valor_unitario: Number(l.valor_unitario || 0),
        }));
      if (payload.length === 0) throw new Error("Informe pelo menos um SKU com quantidade.");
      const { data, error } = await (supabase as any).rpc("registrar_venda_reportada_consignado", {
        p_acerto_id: rascunho.id,
        p_itens: payload,
      });
      // FAIL-LOUD: a mensagem do banco vai pra tela EXATAMENTE como veio.
      // A função recusa o reporte inteiro se um item exceder o saldo em poder
      // do parceiro — suavizar isso esconderia a razão da recusa.
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: async (d) => {
      toast.success(`Reporte salvo — ${num(d?.itens)} item(ns)`, {
        description: `Valor do acerto: ${formatBRL(Number(d?.valor_total ?? 0))}`,
      });
      setItens([{ sku: "", quantidade: "", valor_unitario: "" }]);
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Reporte recusado pelo banco", { description: e.message }),
  });

  const confirmarAcerto = useMutation({
    mutationFn: async () => {
      if (!rascunho) throw new Error("Não há acerto em rascunho.");
      const { data, error } = await (supabase as any).rpc("confirmar_acerto_consignado", {
        p_acerto_id: rascunho.id,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: async (d) => {
      setConfirmacao(d);
      toast.success("Acerto confirmado");
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao confirmar acerto", { description: e.message }),
  });

  // ── retorno de consignação ────────────────────────────────────────────
  const [retornoAberto, setRetornoAberto] = useState(false);
  const [retornoItens, setRetornoItens] = useState<{ sku: string; quantidade: string }[]>([
    { sku: "", quantidade: "" },
  ]);
  const [retornoDoc, setRetornoDoc] = useState("");
  const [retornoObs, setRetornoObs] = useState("");

  const registrarRetorno = useMutation({
    mutationFn: async () => {
      const payload = retornoItens
        .filter((l) => l.sku.trim() && Number(l.quantidade) > 0)
        .map((l) => ({ sku: l.sku.trim(), quantidade: Number(l.quantidade) }));
      if (payload.length === 0) throw new Error("Informe pelo menos um SKU com quantidade.");
      const { data, error } = await (supabase as any).rpc("registrar_retorno_consignacao", {
        p_parceiro_id: parceiroId,
        p_itens: payload,
        p_documento: retornoDoc.trim() || null,
        p_obs: retornoObs.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: async (d) => {
      toast.success(`Retorno registrado — ${num(d?.unidades)} unidade(s)`, {
        description: String(d?.nota ?? ""),
      });
      setRetornoAberto(false);
      setRetornoItens([{ sku: "", quantidade: "" }]);
      setRetornoDoc("");
      setRetornoObs("");
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao registrar retorno", { description: e.message }),
  });

  const nome = parceiroQ.data?.razao_social ?? "Parceiro";
  const rotuloModelo = ehConsignacaoFiscal
    ? "Consignação fiscal"
    : modelo === "venda_com_acerto"
      ? "Venda com acerto"
      : "Modelo não definido";

  const situacao = limite?.situacao_credito ?? null;
  const situacaoRuim = !!situacao && situacao !== "ok";
  const formaNaoAprovada = limite?.forma_conta_corrente_aprovada === false;
  const operacaoBloqueada = situacaoRuim || formaNaoAprovada;

  return (
    <PageShell>
      <CasaPageHeader
        breadcrumb={[
          { label: "Comercial" },
          { label: "Consignados", to: "/pedidos?aba=consignados" },
          { label: nome },
        ]}
        title={nome}
        subtitle={parceiroQ.data?.cnpj ? `CNPJ ${parceiroQ.data.cnpj}` : "Regime consignado"}
      />

      <div className="flex flex-wrap items-center gap-2 -mt-2">
        <Badge variant={ehConsignacaoFiscal ? "default" : "secondary"}>{rotuloModelo}</Badge>
        <Badge variant="outline">
          {diaAcerto ? `Acerto todo dia ${diaAcerto}` : "Dia de acerto não definido"}
        </Badge>
      </div>

      {/* ═══ CRÉDITO E RISCO ═══ */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-gold" /> Crédito e risco
        </h2>

        {(situacaoRuim || formaNaoAprovada) && (
          <Alert variant="destructive" className="border-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-1 text-sm">
              {situacaoRuim && (
                <p className="font-medium">
                  {situacao ? MSG_SITUACAO[situacao] ?? `Situação de crédito: ${situacao}` : ""}
                </p>
              )}
              {formaNaoAprovada && (
                <p className="font-medium">
                  A análise de crédito não aprovou a forma conta corrente para este parceiro.
                </p>
              )}
              <p>Enquanto isso valer, o parceiro não embarca — este bloqueio é operacional, não é aviso.</p>
            </AlertDescription>
          </Alert>
        )}

        {limiteQ.isError ? (
          <ErroBloco error={limiteQ.error} />
        ) : limiteQ.isLoading ? (
          <Carregando />
        ) : !limite ? (
          <p className="text-sm text-muted-foreground">
            Este parceiro não aparece em <code>vw_consignado_limite</code> — sem limite para exibir.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Saldo corrido", valor: formatBRL(limite.saldo_corrido) },
              { label: "Limite concedido", valor: formatBRL(limite.limite_concedido) },
              { label: "Limite disponível", valor: formatBRL(limite.limite_disponivel) },
              { label: "Uso do limite", valor: limite.uso_pct === null ? "—" : `${limite.uso_pct}%` },
              { label: "Cobertura", valor: num(limite.cobertura) },
              { label: "Estoque mais antigo", valor: limite.dias_estoque_mais_antigo === null ? "—" : `${limite.dias_estoque_mais_antigo} dias` },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4 space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</p>
                  <p className="text-lg tabular-nums">{c.valor}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ═══ DUPLICIDADE SUSPEITA ═══ */}
      {valorDuplicidade > 0 && (
        <Alert className="border-warning/50 bg-warning/10">
          <Copy className="h-4 w-4 text-warning" />
          <AlertDescription className="space-y-3 text-sm">
            <p className="font-medium text-warning">
              {nDuplicidades || "Algumas"} nota(s) com valor e itens idênticos a outra(s) — o saldo
              conta as duas ({formatBRL(valorDuplicidade)}), alguém precisa decidir.
            </p>
            {duplicidadesQ.isError ? (
              <ErroBloco error={duplicidadesQ.error} />
            ) : duplicidadesQ.isLoading ? (
              <Carregando />
            ) : (
              <div className="rounded-md border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Emissão</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Pedido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(duplicidadesQ.data ?? []).map((d) => (
                      <TableRow key={d.nf_id}>
                        <TableCell className="text-xs tabular-nums">{d.numero ?? "—"}</TableCell>
                        <TableCell className="text-xs">{formatDateBR(d.data_emissao)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatBRL(d.valor_nota)}</TableCell>
                        <TableCell className="text-xs">
                          {d.sem_pedido_vinculado ? (
                            <span className="text-warning">sem pedido vinculado</span>
                          ) : (d.pedido ?? "—")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* ═══ EXTRATO DE CONTA CORRENTE ═══ */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-gold" /> Extrato de conta corrente
        </h2>
        <Card>
          <CardContent className="p-0">
            {extratoQ.isError ? (
              <ErroBloco error={extratoQ.error} />
            ) : extratoQ.isLoading ? (
              <Carregando />
            ) : (extratoQ.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">Sem lançamentos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Saldo corrido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(extratoQ.data ?? []).map((l, i) => {
                    const v = Number(l.valor ?? 0);
                    const credito = v < 0;
                    return (
                      <TableRow key={`${l.ref ?? "l"}-${i}`} className={cn(l.nao_classificado && "bg-warning/10")}>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateBR(l.data)}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px]">{l.tipo ?? "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.descricao ?? "—"}
                          {l.pedido_ref && <span className="block text-muted-foreground">{l.pedido_ref}</span>}
                          {l.nao_classificado && (
                            <span className="mt-0.5 flex items-center gap-1 text-warning">
                              <AlertTriangle className="h-3 w-3" /> NF sem pedido vinculado
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-sm tabular-nums",
                            credito ? "text-success" : "text-destructive",
                          )}
                        >
                          {credito ? "− " : "+ "}{formatBRL(Math.abs(v))}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{formatBRL(l.saldo_corrido)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ═══ ESTOQUE EM PODER DO PARCEIRO (só consignação fiscal) ═══ */}
      {ehConsignacaoFiscal && (
        <section className="space-y-3">
          <div>
            <h2 className="font-serif text-xl flex items-center gap-2">
              <Boxes className="h-4 w-4 text-gold" /> Estoque em poder do parceiro
            </h2>
            <p className="text-sm text-muted-foreground">
              Esta mercadoria é <strong>da Fetely</strong> — está apenas em poder do parceiro. Não foi
              vendida e continua no patrimônio da empresa.
            </p>
          </div>
          <Card>
            <CardContent className="p-0">
              {estoqueParceiroQ.isError ? (
                <ErroBloco error={estoqueParceiroQ.error} />
              ) : estoqueParceiroQ.isLoading ? (
                <Carregando />
              ) : (estoqueParceiroQ.data ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">Nada em poder do parceiro.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Dias no parceiro</TableHead>
                      <TableHead className="text-right">Preço sugerido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(estoqueParceiroQ.data ?? []).map((e) => {
                      const velho = Number(e.dias_no_parceiro ?? 0) > 90;
                      return (
                        <TableRow key={e.sku ?? Math.random()} className={cn(velho && "bg-destructive/10")}>
                          <TableCell className="text-xs font-mono">{e.sku ?? "—"}</TableCell>
                          <TableCell className="text-xs">{e.produto ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{num(e.saldo)}</TableCell>
                          <TableCell className={cn("text-right text-sm tabular-nums", velho && "text-destructive font-medium")}>
                            {num(e.dias_no_parceiro)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatBRL(e.preco_sugerido)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ═══ ESTIMATIVA (só venda com acerto) ═══ */}
      {modelo === "venda_com_acerto" && (
        <section className="space-y-3">
          <div>
            <h2 className="font-serif text-xl flex items-center gap-2">
              <Boxes className="h-4 w-4 text-gold" /> Estoque no parceiro — ESTIMATIVA
            </h2>
            <p className="text-sm text-muted-foreground">
              Número estimado, não controle patrimonial: neste modelo a mercadoria já foi vendida na
              saída. Serve de referência para o acerto, não de inventário.
            </p>
          </div>
          <Card>
            <CardContent className="p-0">
              {estoqueEstimadoQ.isError ? (
                <ErroBloco error={estoqueEstimadoQ.error} />
              ) : estoqueEstimadoQ.isLoading ? (
                <Carregando />
              ) : (estoqueEstimadoQ.data ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">Sem estimativa para este parceiro.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Enviado</TableHead>
                      <TableHead className="text-right">Devolvido</TableHead>
                      <TableHead className="text-right">Vendido reportado</TableHead>
                      <TableHead className="text-right">Estimado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(estoqueEstimadoQ.data ?? []).map((e) => (
                      <TableRow key={e.sku ?? Math.random()}>
                        <TableCell className="text-xs font-mono">{e.sku ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{num(e.qtd_enviada)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{num(e.qtd_devolvida)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{num(e.qtd_vendida_reportada)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{num(e.estoque_estimado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ═══ CICLO DE ACERTO ═══ */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-gold" /> Ciclo de acerto
        </h2>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {rascunho ? `Acerto em rascunho — ${rascunho.numero ?? ""}` : "Abrir acerto do mês"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!rascunho && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="competencia">Competência</Label>
                  <Input
                    id="competencia"
                    type="month"
                    value={competencia}
                    onChange={(e) => setCompetencia(e.target.value)}
                    className="w-44"
                  />
                </div>
                <Button
                  disabled={abrirAcerto.isPending || !competencia || operacaoBloqueada}
                  onClick={() => abrirAcerto.mutate()}
                >
                  {abrirAcerto.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Abrir acerto do mês
                </Button>
                <p className="text-xs text-muted-foreground">
                  Idempotente: reabrir a mesma competência devolve o mesmo acerto.
                </p>
              </div>
            )}

            {rascunho && (
              <>
                <div className="space-y-2">
                  {itens.map((l, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1 flex-1 min-w-[10rem]">
                        {i === 0 && <Label className="text-xs">SKU</Label>}
                        <Input
                          list={ehConsignacaoFiscal ? "skus-em-poder" : undefined}
                          value={l.sku}
                          placeholder="SKU"
                          onChange={(e) =>
                            setItens((p) => p.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="space-y-1 w-28">
                        {i === 0 && <Label className="text-xs">Qtd</Label>}
                        <Input
                          type="number"
                          min="0"
                          value={l.quantidade}
                          onChange={(e) =>
                            setItens((p) => p.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="space-y-1 w-36">
                        {i === 0 && <Label className="text-xs">Valor unitário</Label>}
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.valor_unitario}
                          onChange={(e) =>
                            setItens((p) => p.map((x, j) => (j === i ? { ...x, valor_unitario: e.target.value } : x)))
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setItens((p) => (p.length === 1 ? p : p.filter((_, j) => j !== i)))}
                        title="Remover linha"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {ehConsignacaoFiscal && (
                    <datalist id="skus-em-poder">
                      {(estoqueParceiroQ.data ?? []).map((e) => (
                        <option key={e.sku ?? ""} value={e.sku ?? ""}>
                          {`${e.produto ?? ""} · saldo ${num(e.saldo)}`}
                        </option>
                      ))}
                    </datalist>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setItens((p) => [...p, { sku: "", quantidade: "", valor_unitario: "" }])}
                    >
                      <Plus className="h-4 w-4" /> Linha
                    </Button>
                    <Button
                      size="sm"
                      disabled={salvarItens.isPending || operacaoBloqueada}
                      onClick={() => salvarItens.mutate()}
                    >
                      {salvarItens.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Salvar reporte
                    </Button>
                  </div>

                  {ehConsignacaoFiscal && (
                    <p className="text-xs text-muted-foreground">
                      O banco recusa o reporte inteiro se qualquer item exceder o saldo em poder do parceiro.
                    </p>
                  )}
                </div>

                {(itensRascunhoQ.data ?? []).length > 0 && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Unitário</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(itensRascunhoQ.data ?? []).map((it) => (
                          <TableRow key={it.id}>
                            <TableCell className="text-xs font-mono">{it.sku ?? "—"}</TableCell>
                            <TableCell className="text-xs">{it.descricao ?? "—"}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums">{num(it.quantidade)}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums">{formatBRL(it.valor_unitario)}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums">{formatBRL(it.valor_total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    disabled={
                      confirmarAcerto.isPending
                      || operacaoBloqueada
                      || (itensRascunhoQ.data ?? []).length === 0
                    }
                    onClick={() => confirmarAcerto.mutate()}
                  >
                    {confirmarAcerto.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirmar acerto
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    Valor do acerto: {formatBRL(rascunho.valor_total)}
                  </span>
                </div>
              </>
            )}

            {confirmacao && (
              <Alert className="border-success/50 bg-success/10">
                <AlertTriangle className="h-4 w-4 text-success" />
                <AlertDescription className="space-y-1 text-sm">
                  <p className="font-medium text-success">
                    Próximo passo: {String(confirmacao.proximo_passo ?? "—")}
                  </p>
                  <p>
                    Pedido sintético <strong>{String(confirmacao.pedido_sintetico ?? "—")}</strong>
                    {confirmacao.pedido_id && (
                      <Link
                        to={`/pedidos/${String(confirmacao.pedido_id)}`}
                        className="ml-2 inline-flex items-center gap-1 underline"
                      >
                        abrir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Acertos anteriores</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {acertosQ.isError ? (
              <ErroBloco error={acertosQ.error} />
            ) : acertosQ.isLoading ? (
              <Carregando />
            ) : (acertosQ.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">Nenhum acerto registrado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Pedido sintético</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(acertosQ.data ?? []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs font-mono">{a.numero ?? "—"}</TableCell>
                      <TableCell className="text-xs">{formatDateBR(a.competencia)}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === "rascunho" ? "outline" : "secondary"} className="text-[10px]">
                          {a.status ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatBRL(a.valor_total)}</TableCell>
                      <TableCell className="text-xs">
                        {a.pedido_sintetico_id ? (
                          <Link
                            to={`/pedidos/${a.pedido_sintetico_id}`}
                            className="inline-flex items-center gap-1 underline"
                          >
                            abrir <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ═══ RETORNO DE MERCADORIA (só consignação fiscal) ═══ */}
      {ehConsignacaoFiscal && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="font-serif text-xl flex items-center gap-2">
              <Undo2 className="h-4 w-4 text-gold" /> Retorno de consignação
            </h2>
            <Button variant="outline" size="sm" onClick={() => setRetornoAberto(true)}>
              Registrar retorno
            </Button>
          </div>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Retorno não é devolução.</strong> A mercadoria nunca foi vendida: não houve
              receita, não há o que estornar e isso <strong>não passa pela fila de Devolução</strong>.
              É só a volta física do que sempre foi da Fetely.
            </AlertDescription>
          </Alert>

          <Dialog open={retornoAberto} onOpenChange={setRetornoAberto}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Registrar retorno de consignação — {nome}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {retornoItens.map((l, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="space-y-1 flex-1">
                      {i === 0 && <Label className="text-xs">SKU</Label>}
                      <Input
                        list="skus-em-poder-retorno"
                        value={l.sku}
                        onChange={(e) =>
                          setRetornoItens((p) => p.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))
                        }
                      />
                    </div>
                    <div className="space-y-1 w-28">
                      {i === 0 && <Label className="text-xs">Qtd</Label>}
                      <Input
                        type="number"
                        min="0"
                        value={l.quantidade}
                        onChange={(e) =>
                          setRetornoItens((p) => p.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRetornoItens((p) => (p.length === 1 ? p : p.filter((_, j) => j !== i)))}
                      title="Remover linha"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <datalist id="skus-em-poder-retorno">
                  {(estoqueParceiroQ.data ?? []).map((e) => (
                    <option key={e.sku ?? ""} value={e.sku ?? ""}>
                      {`${e.produto ?? ""} · saldo ${num(e.saldo)}`}
                    </option>
                  ))}
                </datalist>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRetornoItens((p) => [...p, { sku: "", quantidade: "" }])}
                >
                  <Plus className="h-4 w-4" /> Linha
                </Button>
                <div className="space-y-1">
                  <Label htmlFor="retorno-doc">Documento</Label>
                  <Input id="retorno-doc" value={retornoDoc} onChange={(e) => setRetornoDoc(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="retorno-obs">Observação</Label>
                  <Textarea id="retorno-obs" value={retornoObs} onChange={(e) => setRetornoObs(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button disabled={registrarRetorno.isPending} onClick={() => registrarRetorno.mutate()}>
                  {registrarRetorno.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Registrar retorno
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      )}
    </PageShell>
  );
}
