import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseCsvSafra } from "@/lib/financeiro/csv-safra-parser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Check,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  Mail,
  MailCheck,
  Upload,
} from "lucide-react";
import { useEnviarEmailBoleto } from "@/hooks/credito/useEnviarEmailBoleto";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type ContaSafra = { id: string; nome_exibicao: string; saldo_atual: number | null };

type Movimentacao = {
  id: string;
  data_transacao: string;
  descricao: string | null;
  valor: number;
  tipo: string;
  conciliado: boolean;
  origem: string | null;
};

type TitulosBoleto = {
  id: string;
  numero_titulo: string | null;
  data_vencimento_atual: string | null;
  valor_bruto: number | null;
  boleto_status: string | null;
  boleto_enviado_em: string | null;
  prorrogacao_nova_data: string | null;
  prorrogacao_solicitada_em: string | null;
  conta: { parceiro: { razao_social: string | null } | null } | null;
  pedido: { id_externo: string | null } | null;
};

const BOLETO_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-gray-100 text-gray-600" },
  remessa_gerada: { label: "Remessa gerada", cls: "bg-yellow-100 text-yellow-800" },
  registrado: { label: "Registrado", cls: "bg-blue-100 text-blue-800" },
  pago_manual: { label: "Pago (manual)", cls: "bg-emerald-100 text-emerald-800" },
  pago_banco: { label: "Pago (Safra)", cls: "bg-green-700 text-white" },
  rejeitado: { label: "Rejeitado", cls: "bg-red-100 text-red-800" },
  vencido: { label: "Vencido", cls: "bg-orange-100 text-orange-800" },
  baixa_solicitada: { label: "Baixa pendente", cls: "bg-orange-200 text-orange-900" },
  baixa_remessa_gerada: { label: "Baixa enviada", cls: "bg-purple-100 text-purple-800" },
};

function BotaoBaixarBoletoPdf({ boleto }: { boleto: any }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!["registrado", "remessa_gerada"].includes(boleto.boleto_status)) return null;

  async function baixar() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerar-boleto-pdf", {
        body: { titulo_id: boleto.id },
      });
      if (error || !data?.ok) {
        throw new Error(data?.erro ?? error?.message ?? "Falha ao gerar PDF");
      }
      const bin = atob(data.pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.nome_arquivo ?? `boleto_${boleto.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={loading}
            onClick={baixar}
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileText className="h-4 w-4 text-muted-foreground" />
            }
          </Button>
        </TooltipTrigger>
        <TooltipContent>Baixar espelho do boleto (PDF)</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function BotaoEmailBoleto({ boleto }: { boleto: any }) {
  const enviar = useEnviarEmailBoleto();
  if (boleto.boleto_status !== "registrado") return null;

  if (boleto.boleto_enviado_em) {
    const dt = new Date(boleto.boleto_enviado_em).toLocaleDateString("pt-BR");
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center text-green-600">
              <MailCheck className="h-4 w-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Boleto enviado em {dt}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={enviar.isPending}
            onClick={() => enviar.mutate(boleto.id)}
          >
            {enviar.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Mail className="h-4 w-4 text-muted-foreground" />
            }
          </Button>
        </TooltipTrigger>
        <TooltipContent>Enviar boleto por email</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

async function gerarHashSafra(data: string, descricao: string, valor: number): Promise<string> {
  const base = `${data}|${(descricao || "").trim()}|${Math.abs(valor).toFixed(2)}`;
  const buf = new TextEncoder().encode(base);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
  return `safra_extrato_${hex}`;
}

type PreviewLinha = { data: string; descricao: string; valor: number; tipo: string };

export default function BancoSafra() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parsedRef = useRef<ReturnType<typeof parseCsvSafra> | null>(null);

  const [activeTab, setActiveTab] = useState<string>("extrato");
  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [linhasPreview, setLinhasPreview] = useState<PreviewLinha[]>([]);
  const [totalLinhas, setTotalLinhas] = useState<number>(0);
  const [importando, setImportando] = useState<boolean>(false);

  const { data: contaSafra } = useQuery<ContaSafra | null>({
    queryKey: ["conta-bancaria-safra"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao, saldo_atual")
        .eq("banco_codigo", "422")
        .eq("ativo", true)
        .maybeSingle();
      if (error) throw error;
      return (data as ContaSafra | null) ?? null;
    },
  });

  const { data: movimentacoes = [], isLoading: loadingMov } = useQuery<Movimentacao[]>({
    queryKey: ["movimentacoes-safra", contaSafra?.id],
    enabled: activeTab === "extrato" && !!contaSafra?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_bancarias")
        .select("id, data_transacao, descricao, valor, tipo, conciliado, origem")
        .eq("conta_bancaria_id", contaSafra!.id)
        .order("data_transacao", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as Movimentacao[]) ?? [];
    },
  });

  // Saldo calculado a partir de TODAS as movimentações registradas
  const { data: saldoMovimentacoes } = useQuery<number>({
    queryKey: ["saldo-movimentacoes-safra", contaSafra?.id],
    enabled: !!contaSafra?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_bancarias")
        .select("valor, tipo")
        .eq("conta_bancaria_id", contaSafra!.id);
      if (error) throw error;
      let saldo = 0;
      for (const m of (data as { valor: number; tipo: string }[]) ?? []) {
        if (m.tipo === "credito") saldo += Number(m.valor || 0);
        else if (m.tipo === "debito") saldo -= Number(m.valor || 0);
      }
      return saldo;
    },
  });

  const { data: boletos = [], isLoading: loadingBoletos, refetch: refetchBoletos } = useQuery<TitulosBoleto[]>({
    queryKey: ["boletos-safra"],
    enabled: activeTab === "boletos",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("titulo_a_receber")
        .select(
          "id, numero_titulo, data_vencimento_atual, valor_bruto, boleto_status, boleto_enviado_em, prorrogacao_nova_data, prorrogacao_solicitada_em, conta:contas_pagar_receber(parceiro:parceiros_comerciais(razao_social)), pedido:pedidos(id_externo)",
        )
        .not("boleto_status", "is", null)
        .order("data_vencimento_atual", { ascending: true });
      if (error) throw error;
      return (data as unknown as TitulosBoleto[]) ?? [];
    },
  });

  const [gerandoBaixa, setGerandoBaixa] = useState(false);
  const [gerandoProrrogacao, setGerandoProrrogacao] = useState(false);
  const [gerandoEntrada, setGerandoEntrada] = useState(false);
  const [entradaDialogOpen, setEntradaDialogOpen] = useState(false);

  const hojeIso = new Date().toISOString().slice(0, 10);
  const pendentesEntrada = useMemo(
    () => boletos.filter((b) => b.boleto_status === "pendente"),
    [boletos],
  );
  const pendentesPassado = useMemo(
    () =>
      pendentesEntrada.filter(
        (b) => b.data_vencimento_atual && b.data_vencimento_atual < hojeIso,
      ),
    [pendentesEntrada, hojeIso],
  );

  // seleção dinâmica no dialog
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const abrirDialogEntrada = () => {
    const validos = pendentesEntrada
      .filter((b) => !b.data_vencimento_atual || b.data_vencimento_atual >= hojeIso)
      .map((b) => b.id);
    setSelecionados(new Set(validos));
    setEntradaDialogOpen(true);
  };
  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const idsSelecionaveis = useMemo(
    () =>
      pendentesEntrada
        .filter((b) => !b.data_vencimento_atual || b.data_vencimento_atual >= hojeIso)
        .map((b) => b.id),
    [pendentesEntrada, hojeIso],
  );
  const todosSelecionados =
    idsSelecionaveis.length > 0 &&
    idsSelecionaveis.every((id) => selecionados.has(id));
  const toggleTodos = () => {
    if (todosSelecionados) setSelecionados(new Set());
    else setSelecionados(new Set(idsSelecionaveis));
  };
  const totalSelecionado = useMemo(
    () =>
      pendentesEntrada
        .filter((b) => selecionados.has(b.id))
        .reduce((s, b) => s + Number(b.valor_bruto || 0), 0),
    [pendentesEntrada, selecionados],
  );

  // edição inline de boletos
  const [edits, setEdits] = useState<Record<string, { data?: string; valor?: string }>>({});
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const temEdicao = (id: string) => !!(edits[id]?.data || edits[id]?.valor);
  const handleSalvar = async (b: TitulosBoleto) => {
    const edit = edits[b.id];
    if (!edit) return;
    setSalvando((p) => ({ ...p, [b.id]: true }));
    try {
      const update: Record<string, any> = {};
      if (edit.data && edit.data !== b.data_vencimento_atual) update.data_vencimento_atual = edit.data;
      if (edit.valor) {
        const v = parseFloat(edit.valor.replace(",", "."));
        if (!isNaN(v) && v > 0 && v !== Number(b.valor_bruto)) update.valor_bruto = v;
      }
      if (Object.keys(update).length === 0) {
        setEdits((p) => { const n = { ...p }; delete n[b.id]; return n; });
        return;
      }
      const { error } = await (supabase as any).from("titulo_a_receber").update(update).eq("id", b.id);
      if (error) throw error;
      setEdits((p) => { const n = { ...p }; delete n[b.id]; return n; });
      toast({ title: "Boleto atualizado", description: `${b.numero_titulo} salvo com sucesso.` });
      refetchBoletos();
    } catch (e) {
      toast({ title: "Erro ao salvar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSalvando((p) => ({ ...p, [b.id]: false }));
    }
  };

  const handleGerarBaixa = async () => {
    setGerandoBaixa(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerar-remessa-safra", {
        body: { tipo: "baixa" },
      });
      if (error || !data?.ok) throw new Error(data?.erro ?? error?.message ?? "Erro ao gerar remessa de baixa");
      const blob = new Blob([data.arquivo_conteudo], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.arquivo_nome;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Remessa de baixa gerada: ${data.qtd_titulos} boleto(s)` });
      refetchBoletos();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao gerar baixa", description: msg, variant: "destructive" });
    } finally {
      setGerandoBaixa(false);
    }
  };

  const handleGerarProrrogacao = async () => {
    setGerandoProrrogacao(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerar-remessa-safra", {
        body: { tipo: "prorrogacao" },
      });
      if (error || !data?.ok) throw new Error(data?.erro ?? error?.message ?? "Erro ao gerar remessa de prorrogação");
      const blob = new Blob([data.arquivo_conteudo], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.arquivo_nome;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Remessa de prorrogação gerada: ${data.qtd_titulos} boleto(s)` });
      refetchBoletos();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao gerar prorrogação", description: msg, variant: "destructive" });
    } finally {
      setGerandoProrrogacao(false);
    }
  };

  const handleGerarEntrada = async () => {
    setGerandoEntrada(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerar-remessa-safra", {
        body: { tipo: "entrada", titulo_ids: Array.from(selecionados) },
      });
      if (error || !data?.ok) throw new Error(data?.erro ?? error?.message ?? "Erro ao gerar remessa de entrada");
      const blob = new Blob([data.arquivo_conteudo], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.arquivo_nome;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: `Remessa de entrada gerada: ${data.qtd_titulos} boleto(s)`,
        description: data.valor_total != null ? `Total: ${formatBRL(Number(data.valor_total))}` : undefined,
      });
      setEntradaDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["boletos-safra"] });
      refetchBoletos();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao gerar entrada", description: msg, variant: "destructive" });
    } finally {
      setGerandoEntrada(false);
    }
  };


  const kpis = useMemo(() => {
    const primeiroDia = new Date();
    primeiroDia.setDate(1);
    primeiroDia.setHours(0, 0, 0, 0);
    const iso = primeiroDia.toISOString().slice(0, 10);
    let creditos = 0;
    let debitos = 0;
    for (const m of movimentacoes) {
      if (!m.data_transacao || m.data_transacao < iso) continue;
      if (m.tipo === "credito") creditos += Number(m.valor || 0);
      else if (m.tipo === "debito") debitos += Number(m.valor || 0);
    }
    return { creditos, debitos, resultado: creditos - debitos };
  }, [movimentacoes]);

  const boletosKpis = useMemo(() => {
    const primeiroDia = new Date();
    primeiroDia.setDate(1);
    primeiroDia.setHours(0, 0, 0, 0);
    const iso = primeiroDia.toISOString().slice(0, 10);
    let pendentes = 0;
    let registrados = 0;
    let pagosMes = 0;
    let vencidos = 0;
    let baixaPendente = 0;
    let prorrogacaoPendente = 0;
    for (const b of boletos) {
      const s = b.boleto_status || "";
      if (s === "pendente" || s === "remessa_gerada") pendentes++;
      else if (s === "registrado") registrados++;
      else if (s === "vencido") vencidos++;
      else if (s === "baixa_solicitada") baixaPendente++;
      if (
        s === "registrado" &&
        b.prorrogacao_nova_data &&
        !b.prorrogacao_solicitada_em
      ) {
        prorrogacaoPendente++;
      }
      if (
        (s === "pago_manual" || s === "pago_banco") &&
        b.data_vencimento_atual &&
        b.data_vencimento_atual >= iso
      ) {
        pagosMes++;
      }
    }
    return { pendentes, registrados, pagosMes, vencidos, baixaPendente, prorrogacaoPendente };
  }, [boletos]);

  function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const texto = String(reader.result || "");
      const parsed = parseCsvSafra(texto);
      parsedRef.current = parsed;
      const preview = parsed.movimentacoes.slice(0, 3).map((m) => ({
        data: m.data_transacao,
        descricao: m.descricao,
        valor: m.valor,
        tipo: m.tipo,
      }));
      setLinhasPreview(preview);
      setTotalLinhas(parsed.movimentacoes.length);
      setArquivoNome(file.name);
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleImportar() {
    if (!contaSafra?.id || !parsedRef.current) return;
    setImportando(true);
    let importadas = 0;
    let duplicadas = 0;
    let erros = 0;
    for (const m of parsedRef.current.movimentacoes) {
      const hash = await gerarHashSafra(m.data_transacao, m.descricao, m.valor);
      const { error } = await supabase.from("movimentacoes_bancarias").insert({
        conta_bancaria_id: contaSafra.id,
        data_transacao: m.data_transacao,
        descricao: m.descricao,
        valor: Math.abs(m.valor),
        tipo: m.valor >= 0 ? "credito" : "debito",
        origem: "csv_safra",
        hash_unico: hash,
        conciliado: false,
      });
      if (error) {
        if ((error as { code?: string }).code === "23505") duplicadas++;
        else erros++;
      } else {
        importadas++;
      }
    }
    await qc.invalidateQueries({ queryKey: ["movimentacoes-safra"] });
    await qc.invalidateQueries({ queryKey: ["conta-bancaria-safra"] });
    toast({
      title: "Importação concluída",
      description: `${importadas} importadas, ${duplicadas} duplicatas ignoradas${
        erros ? `, ${erros} erros` : ""
      }`,
    });
    setLinhasPreview([]);
    setTotalLinhas(0);
    setArquivoNome("");
    parsedRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setImportando(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Landmark className="h-6 w-6" />
          Banco Safra
        </h1>
        <p className="text-sm text-muted-foreground">
          Extrato, boletos e conciliação — conta 422
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              Saldo das movimentações
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/70" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Calculado a partir das movimentações registradas no sistema
                    (boletos liquidados). Não substitui o extrato bancário.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {saldoMovimentacoes == null ? "—" : formatBRL(saldoMovimentacoes)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <ArrowDownToLine className="h-4 w-4" /> Créditos mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatBRL(kpis.creditos)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <ArrowUpFromLine className="h-4 w-4" /> Débitos mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{formatBRL(kpis.debitos)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Resultado mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                kpis.resultado >= 0 ? "text-green-700" : "text-red-700"
              }`}
            >
              {formatBRL(kpis.resultado)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="extrato">Extrato</TabsTrigger>
          <TabsTrigger value="boletos">Boletos</TabsTrigger>
        </TabsList>

        <TabsContent value="extrato" className="space-y-6">
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader>
              <CardTitle className="text-base">Importar extrato CSV</CardTitle>
              <p className="text-sm text-muted-foreground">
                Faça o download do extrato em formato CSV no Internet Banking Safra e importe aqui.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleArquivoSelecionado}
                />
                <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                  <Upload className="h-4 w-4" />
                  Selecionar arquivo CSV
                </Button>
                {arquivoNome && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <FileSpreadsheet className="h-4 w-4" />
                    {arquivoNome}
                  </span>
                )}
              </div>

              {linhasPreview.length > 0 && (
                <div className="space-y-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhasPreview.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell>{formatDateBR(l.data)}</TableCell>
                          <TableCell>{l.descricao}</TableCell>
                          <TableCell
                            className={`text-right font-mono ${
                              l.valor >= 0 ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            {l.valor >= 0 ? "+" : "-"}
                            {formatBRL(Math.abs(l.valor))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground">
                    {totalLinhas} transações encontradas — {linhasPreview.length} exibidas como preview
                  </p>
                  <Button onClick={handleImportar} disabled={importando}>
                    {importando ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>Importar {totalLinhas} transações</>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Movimentações Safra{" "}
                <span className="text-sm text-muted-foreground font-normal">
                  ({movimentacoes.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingMov ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : movimentacoes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma movimentação ainda. Importe um extrato CSV para começar.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-center">Conciliado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimentacoes.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{formatDateBR(m.data_transacao)}</TableCell>
                        <TableCell className="max-w-[400px] truncate">{m.descricao || "—"}</TableCell>
                        <TableCell>
                          {m.tipo === "credito" ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              Crédito
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Débito</Badge>
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            m.tipo === "credito" ? "text-green-700" : "text-red-700"
                          }`}
                        >
                          {m.tipo === "credito" ? "+" : "-"}
                          {formatBRL(Number(m.valor))}
                        </TableCell>
                        <TableCell className="text-center">
                          {m.conciliado ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-gray-400 inline" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="boletos" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Pendentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-700">{boletosKpis.pendentes}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Registrados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-700">{boletosKpis.registrados}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Pagos no mês</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">{boletosKpis.pagosMes}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Vencidos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-700">{boletosKpis.vencidos}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Baixas pendentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-700">{boletosKpis.baixaPendente}</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleGerarProrrogacao}
              disabled={boletosKpis.prorrogacaoPendente === 0 || gerandoProrrogacao}
              className="gap-2"
            >
              {gerandoProrrogacao ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpFromLine className="h-4 w-4" />
              )}
              Gerar remessa de prorrogação
              {boletosKpis.prorrogacaoPendente > 0 && ` (${boletosKpis.prorrogacaoPendente})`}
            </Button>
            <Button
              variant="outline"
              onClick={handleGerarBaixa}
              disabled={boletosKpis.baixaPendente === 0 || gerandoBaixa}
              className="gap-2"
            >
              {gerandoBaixa ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpFromLine className="h-4 w-4" />
              )}
              Gerar Remessa de Baixa
            </Button>
            <Button
              onClick={abrirDialogEntrada}
              disabled={pendentesEntrada.length === 0 || gerandoEntrada}
              className="gap-2"
            >
              {gerandoEntrada ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpFromLine className="h-4 w-4" />
              )}
              Gerar Remessa de Entrada
              {pendentesEntrada.length > 0 && ` (${pendentesEntrada.length})`}
            </Button>
          </div>


          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Boletos{" "}
                <span className="text-sm text-muted-foreground font-normal">({boletos.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBoletos ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : boletos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum boleto encontrado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boletos.map((b) => {
                      const cfg =
                        BOLETO_STATUS_CFG[b.boleto_status || ""] || {
                          label: b.boleto_status || "—",
                          cls: "bg-gray-100 text-gray-600",
                        };
                      const vencido = b.boleto_status === "vencido";
                      const editavel = b.boleto_status === "pendente";
                      const registrado = b.boleto_status === "registrado" || b.boleto_status === "remessa_gerada";
                      const pendentePassado =
                        editavel && !!b.data_vencimento_atual && b.data_vencimento_atual < hojeIso;
                      return (
                        <TableRow
                          key={b.id}
                          className={pendentePassado ? "bg-red-50/60 border-l-2 border-l-red-400" : ""}
                        >
                          <TableCell className={vencido || pendentePassado ? "text-red-700 font-medium" : ""}>
                            {pendentePassado && (
                              <Badge className="mb-1 bg-red-100 text-red-800 hover:bg-red-100 text-[10px]">
                                Vencimento no passado
                              </Badge>
                            )}
                            {editavel ? (
                              <Input
                                type="date"
                                className="h-8 w-[140px]"
                                value={edits[b.id]?.data ?? b.data_vencimento_atual ?? ""}
                                onChange={(e) =>
                                  setEdits((p) => ({ ...p, [b.id]: { ...p[b.id], data: e.target.value } }))
                                }
                              />
                            ) : registrado ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1.5">
                                      {formatDateBR(b.data_vencimento_atual)}
                                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Para alterar, solicite a baixa primeiro</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              formatDateBR(b.data_vencimento_atual)
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {b.numero_titulo || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {b.pedido?.id_externo || "—"}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate">
                            {b.conta?.parceiro?.razao_social || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${cfg.cls} hover:${cfg.cls}`}>{cfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {editavel ? (
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="h-8 w-[110px] ml-auto text-right font-mono"
                                value={edits[b.id]?.valor ?? String(b.valor_bruto ?? "")}
                                onChange={(e) =>
                                  setEdits((p) => ({ ...p, [b.id]: { ...p[b.id], valor: e.target.value } }))
                                }
                              />
                            ) : (
                              formatBRL(Number(b.valor_bruto || 0))
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {temEdicao(b.id) && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleSalvar(b)}
                                  disabled={salvando[b.id]}
                                  className="h-8"
                                >
                                  {salvando[b.id] ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                  <span className="ml-1">Salvar</span>
                                </Button>
                              )}
                              <BotaoBaixarBoletoPdf boleto={b} />
                              <BotaoEmailBoleto boleto={b} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={entradaDialogOpen} onOpenChange={(v) => !gerandoEntrada && setEntradaDialogOpen(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gerar Remessa de Entrada</DialogTitle>
            <DialogDescription>
              Selecione os títulos pendentes que serão enviados ao Safra para registro.
            </DialogDescription>
          </DialogHeader>

          {pendentesPassado.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>{pendentesPassado.length}</strong> título(s) com vencimento no passado ficaram fora da seleção — ajuste as datas para incluí-los em outra remessa.
              </div>
            </div>
          )}

          <div className="max-h-[360px] overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={todosSelecionados}
                      onCheckedChange={toggleTodos}
                      disabled={idsSelecionaveis.length === 0}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentesEntrada.map((b) => {
                  const passado = !!b.data_vencimento_atual && b.data_vencimento_atual < hojeIso;
                  const marcado = selecionados.has(b.id);
                  return (
                    <TableRow key={b.id} className={passado ? "bg-red-50/60" : ""}>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Checkbox
                                checked={marcado}
                                onCheckedChange={() => toggleSelecionado(b.id)}
                                disabled={passado}
                                aria-label={`Selecionar ${b.numero_titulo}`}
                              />
                            </span>
                          </TooltipTrigger>
                          {passado && (
                            <TooltipContent>
                              Ajuste a data na lista para habilitar
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b.numero_titulo || "—"}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{b.conta?.parceiro?.razao_social || "—"}</TableCell>
                      <TableCell className={passado ? "text-red-700 font-medium" : ""}>
                        <div className="flex items-center gap-2">
                          {formatDateBR(b.data_vencimento_atual)}
                          {passado && (
                            <Badge variant="outline" className="border-red-300 text-red-700 text-[10px]">
                              Vencimento no passado
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatBRL(Number(b.valor_bruto || 0))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEntradaDialogOpen(false)} disabled={gerandoEntrada}>
              Cancelar
            </Button>
            <Button
              onClick={handleGerarEntrada}
              disabled={gerandoEntrada || selecionados.size === 0}
              className="gap-2"
            >
              {gerandoEntrada && <Loader2 className="h-4 w-4 animate-spin" />}
              Gerar remessa com {selecionados.size} título(s) · {formatBRL(totalSelecionado)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
