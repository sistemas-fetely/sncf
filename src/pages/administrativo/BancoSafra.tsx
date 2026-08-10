import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  ArrowUpFromLine,
  Check,
  FileText,
  Landmark,
  Loader2,
  Mail,
  MailCheck,
  ChevronDown,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { useEnviarEmailBoleto } from "@/hooks/credito/useEnviarEmailBoleto";
import { useBaixasPendentes } from "@/hooks/credito/useBaixasPendentes";
import { useRemessasSafra } from "@/hooks/credito/useRemessasSafra";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Dias corridos desde uma data ISO (null se inválida). */
function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

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
  baixa_remessa_gerada: { label: "Baixa em remessa", cls: "bg-purple-100 text-purple-800" },
};

/** Cor sólida para o ponto de status (as classes -100 do badge somem num círculo de 8px). */
const BOLETO_STATUS_DOT: Record<string, string> = {
  pendente: "bg-gray-400",
  remessa_gerada: "bg-yellow-500",
  registrado: "bg-blue-500",
  pago_manual: "bg-emerald-500",
  pago_banco: "bg-green-600",
  rejeitado: "bg-red-500",
  vencido: "bg-orange-500",
  baixa_solicitada: "bg-orange-600",
  baixa_remessa_gerada: "bg-purple-500",
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

function semAcento(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function AcoesGrupoCliente({
  boletos,
  gerandoEntrada,
  onAbrirEntrada,
  onEnviarEmail,
}: {
  boletos: TitulosBoleto[];
  gerandoEntrada: boolean;
  onAbrirEntrada: (ids: string[]) => void;
  onEnviarEmail: (tituloId: string) => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [confirmarEmails, setConfirmarEmails] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);

  const hojeIso = new Date().toISOString().slice(0, 10);
  const pendentesEntrada = boletos.filter(
    (b) =>
      b.boleto_status === "pendente" &&
      (!b.data_vencimento_atual || b.data_vencimento_atual >= hojeIso),
  );
  const registrados = boletos.filter((b) => b.boleto_status === "registrado");

  async function enviarEmSequencia() {
    setConfirmarEmails(false);
    let enviados = 0;
    for (let i = 0; i < registrados.length; i++) {
      const b = registrados[i];
      setProgresso({ atual: i + 1, total: registrados.length });
      try {
        await onEnviarEmail(b.id);
        enviados++;
      } catch (e) {
        setProgresso(null);
        toast({
          title: `Envio interrompido no boleto ${b.numero_titulo ?? b.id}`,
          description: `${enviados} de ${registrados.length} enviados. Erro: ${
            e instanceof Error ? e.message : String(e)
          }`,
          variant: "destructive",
        });
        return;
      }
    }
    setProgresso(null);
    toast({ title: `${enviados} boleto(s) enviado(s) por e-mail` });
  }

  return (
    <>
      {progresso && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Enviando {progresso.atual} de {progresso.total}...
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={pendentesEntrada.length === 0 || gerandoEntrada}
            onSelect={() => onAbrirEntrada(pendentesEntrada.map((b) => b.id))}
          >
            Conferir entrada dos pendentes ({pendentesEntrada.length})
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={registrados.length === 0 || !!progresso}
            onSelect={(e) => {
              e.preventDefault();
              setConfirmarEmails(true);
            }}
          >
            Enviar boletos por e-mail ({registrados.length})
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmarEmails} onOpenChange={setConfirmarEmails}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar boletos por e-mail</AlertDialogTitle>
            <AlertDialogDescription>
              Serão enviados {registrados.length} e-mails separados, um por boleto. O cliente
              receberá {registrados.length} mensagens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={enviarEmSequencia}>Enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function BancoSafra({ onIrParaRemessas }: { onIrParaRemessas?: () => void } = {}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: baixasPendentesData } = useBaixasPendentes();
  const countSolicitada = baixasPendentesData?.countSolicitada ?? 0;



  const { data: boletos = [], isLoading: loadingBoletos, refetch: refetchBoletos } = useQuery<TitulosBoleto[]>({
    queryKey: ["boletos-safra"],
    queryFn: async () => {
      // Anotada como `string` de propósito: alarga o literal e evita TS2589 no select aninhado.
      // O resultado segue tipado à mão via `as unknown as TitulosBoleto[]` abaixo.
      const SELECT_BOLETOS: string =
        "id, numero_titulo, data_vencimento_atual, valor_bruto, boleto_status, boleto_enviado_em, prorrogacao_nova_data, prorrogacao_solicitada_em, conta:contas_pagar_receber(parceiro:parceiros_comerciais(razao_social)), pedido:pedidos(id_externo)";
      const { data, error } = await supabase
        .from("titulo_a_receber")
        .select(SELECT_BOLETOS)
        .not("boleto_status", "is", null)
        .not("status", "in", "(pago,pago_com_atraso,pago_judicial,cancelado,cancelado_recuperacao)")
        .order("data_vencimento_atual", { ascending: true });
      if (error) throw error;
      return (data as unknown as TitulosBoleto[]) ?? [];
    },
  });

  const [gerandoBaixa, setGerandoBaixa] = useState(false);
  const [gerandoProrrogacao, setGerandoProrrogacao] = useState(false);
  const [gerandoEntrada, setGerandoEntrada] = useState(false);
  const [entradaDialogOpen, setEntradaDialogOpen] = useState(false);
  /** Quando existe, o Dialog de entrada considera apenas estes títulos (escopo de um cliente). */
  const [escopoEntrada, setEscopoEntrada] = useState<string[] | null>(null);

  // mutation de e-mail: uma única instância para toda a tela
  const enviarEmailBoleto = useEnviarEmailBoleto();

  const hojeIso = new Date().toISOString().slice(0, 10);
  const pendentesEntrada = useMemo(
    () => boletos.filter((b) => b.boleto_status === "pendente"),
    [boletos],
  );
  /** Universo do Dialog: escopo do cliente, ou todos os pendentes. */
  const entradaLista = useMemo(() => {
    if (!escopoEntrada) return pendentesEntrada;
    const set = new Set(escopoEntrada);
    return pendentesEntrada.filter((b) => set.has(b.id));
  }, [pendentesEntrada, escopoEntrada]);
  const pendentesPassado = useMemo(
    () =>
      entradaLista.filter(
        (b) => b.data_vencimento_atual && b.data_vencimento_atual < hojeIso,
      ),
    [entradaLista, hojeIso],
  );

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const abrirDialogEntrada = (ids?: string[]) => {
    const escopo = ids && ids.length > 0 ? ids : null;
    const set = escopo ? new Set(escopo) : null;
    const base = set ? pendentesEntrada.filter((b) => set.has(b.id)) : pendentesEntrada;
    const validos = base
      .filter((b) => !b.data_vencimento_atual || b.data_vencimento_atual >= hojeIso)
      .map((b) => b.id);
    setEscopoEntrada(escopo);
    setSelecionados(new Set(validos));
    setEntradaDialogOpen(true);
  };
  const fecharDialogEntrada = () => {
    setEntradaDialogOpen(false);
    setEscopoEntrada(null);
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
      entradaLista
        .filter((b) => !b.data_vencimento_atual || b.data_vencimento_atual >= hojeIso)
        .map((b) => b.id),
    [entradaLista, hojeIso],
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
      entradaLista
        .filter((b) => selecionados.has(b.id))
        .reduce((s, b) => s + Number(b.valor_bruto || 0), 0),
    [entradaLista, selecionados],
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

  const handleGerarBaixa = async (tituloIds: string[] = []) => {
    setGerandoBaixa(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerar-remessa-safra", {
        body: { tipo: "baixa", titulo_ids: tituloIds },
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
      await qc.invalidateQueries({ queryKey: ["baixas-pendentes"] });
      await qc.invalidateQueries({ queryKey: ["remessas-safra"] });
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
    const ids = Array.from(selecionados);
    if (ids.length === 0) {
      toast({ title: "Nenhum título selecionado", variant: "destructive" });
      return;
    }
    setGerandoEntrada(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerar-remessa-safra", {
        body: { tipo: "entrada", titulo_ids: ids },
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
      fecharDialogEntrada();
      await qc.invalidateQueries({ queryKey: ["boletos-safra"] });
      refetchBoletos();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao gerar entrada", description: msg, variant: "destructive" });
    } finally {
      setGerandoEntrada(false);
    }
  };

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

  // ── visão, filtros e busca ────────────────────────────────────────────────
  const [modo, setModo] = useState<"cliente" | "vencimento">("cliente");
  const [filtroKpi, setFiltroKpi] = useState<
    "pendentes" | "registrados" | "pagos_mes" | "vencidos" | "baixas" | null
  >(null);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 200);
    return () => clearTimeout(t);
  }, [busca]);

  const primeiroDiaMesIso = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);

  const boletosFiltrados = useMemo(() => {
    const termo = semAcento(buscaDebounced.trim());
    return boletos.filter((b) => {
      const s = b.boleto_status || "";
      if (filtroKpi === "pendentes" && !(s === "pendente" || s === "remessa_gerada")) return false;
      if (filtroKpi === "registrados" && s !== "registrado") return false;
      if (filtroKpi === "vencidos" && s !== "vencido") return false;
      if (filtroKpi === "baixas" && s !== "baixa_solicitada") return false;
      if (filtroKpi === "pagos_mes") {
        const pago = s === "pago_manual" || s === "pago_banco";
        if (!pago) return false;
        if (!b.data_vencimento_atual || b.data_vencimento_atual < primeiroDiaMesIso) return false;
      }
      if (termo) {
        const alvo = semAcento(
          [
            b.conta?.parceiro?.razao_social ?? "",
            b.numero_titulo ?? "",
            b.pedido?.id_externo ?? "",
          ].join(" "),
        );
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [boletos, filtroKpi, buscaDebounced, primeiroDiaMesIso]);

  const totaisFiltrados = useMemo(() => {
    let total = 0;
    let vencido = 0;
    for (const b of boletosFiltrados) {
      const v = Number(b.valor_bruto || 0);
      total += v;
      const atrasado =
        b.boleto_status === "vencido" ||
        (b.boleto_status === "pendente" &&
          !!b.data_vencimento_atual &&
          b.data_vencimento_atual < hojeIso);
      if (atrasado) vencido += v;
    }
    return { qtd: boletosFiltrados.length, total, vencido };
  }, [boletosFiltrados, hojeIso]);

  const gruposCliente = useMemo(() => {
    const map = new Map<string, TitulosBoleto[]>();
    for (const b of boletosFiltrados) {
      const nome = b.conta?.parceiro?.razao_social || "— sem cliente —";
      const arr = map.get(nome);
      if (arr) arr.push(b);
      else map.set(nome, [b]);
    }
    const grupos = Array.from(map.entries()).map(([nome, lista]) => {
      let total = 0;
      let totalVencido = 0;
      let qtdVencido = 0;
      let proximoVencimento: string | null = null;
      const contagem = new Map<string, number>();
      for (const b of lista) {
        const v = Number(b.valor_bruto || 0);
        total += v;
        const atrasado =
          b.boleto_status === "vencido" ||
          (b.boleto_status === "pendente" &&
            !!b.data_vencimento_atual &&
            b.data_vencimento_atual < hojeIso);
        if (atrasado) {
          qtdVencido++;
          totalVencido += v;
        }
        if (
          b.data_vencimento_atual &&
          (!proximoVencimento || b.data_vencimento_atual < proximoVencimento)
        ) {
          proximoVencimento = b.data_vencimento_atual;
        }
        const st = b.boleto_status || "—";
        contagem.set(st, (contagem.get(st) ?? 0) + 1);
      }
      const mixStatus = Array.from(contagem.entries()).map(([status, qtd]) => ({
        status,
        qtd,
        label: BOLETO_STATUS_CFG[status]?.label ?? status,
        dot: BOLETO_STATUS_DOT[status] ?? "bg-gray-400",
      }));
      return {
        nome,
        boletos: lista,
        total,
        totalVencido,
        qtdVencido,
        proximoVencimento,
        mixStatus,
        abrirPorPadrao: qtdVencido > 0,
      };
    });
    grupos.sort((a, b) => {
      if (b.totalVencido !== a.totalVencido) return b.totalVencido - a.totalVencido;
      const va = a.proximoVencimento ?? "9999-12-31";
      const vb = b.proximoVencimento ?? "9999-12-31";
      return va.localeCompare(vb);
    });
    return grupos;
  }, [boletosFiltrados, hojeIso]);

  const renderTabela = (lista: TitulosBoleto[], ocultarCliente: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vencimento</TableHead>
          <TableHead>Título</TableHead>
          <TableHead>Pedido</TableHead>
          {!ocultarCliente && <TableHead>Cliente</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lista.map((b) => {
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
              <TableCell className="font-mono text-xs">{b.numero_titulo || "—"}</TableCell>
              <TableCell className="font-mono text-xs">{b.pedido?.id_externo || "—"}</TableCell>
              {!ocultarCliente && (
                <TableCell className="max-w-[160px] truncate">
                  {b.conta?.parceiro?.razao_social || "—"}
                </TableCell>
              )}
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
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Landmark className="h-6 w-6" />
          Banco Safra
        </h1>
        <p className="text-sm text-muted-foreground">
          Operação de boletos — conta 422
        </p>
      </div>

      <BaixasPendentesAlert
        onGerarBaixa={handleGerarBaixa}
        gerandoBaixa={gerandoBaixa}
        onIrParaRemessas={onIrParaRemessas}
      />


      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-4 py-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {([
            { key: "pendentes", label: "Pendentes", valor: boletosKpis.pendentes, cls: "text-gray-700", ativoCls: "bg-gray-700 text-white" },
            { key: "registrados", label: "Registrados", valor: boletosKpis.registrados, cls: "text-blue-700", ativoCls: "bg-blue-700 text-white" },
            { key: "pagos_mes", label: "Pagos no mês", valor: boletosKpis.pagosMes, cls: "text-green-700", ativoCls: "bg-green-700 text-white" },
            { key: "vencidos", label: "Vencidos", valor: boletosKpis.vencidos, cls: "text-orange-700", ativoCls: "bg-orange-700 text-white" },
            { key: "baixas", label: "Baixas pendentes", valor: countSolicitada, cls: "text-purple-700", ativoCls: "bg-purple-700 text-white" },
          ] as const).map((k) => {
            const ativo = filtroKpi === k.key;
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => setFiltroKpi(ativo ? null : k.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  ativo ? `${k.ativoCls} border-transparent` : "border-border hover:bg-muted"
                }`}
              >
                <span className={ativo ? "" : "text-muted-foreground"}>{k.label}</span>
                <span className={`font-semibold ${ativo ? "" : k.cls}`}>{k.valor}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => abrirDialogEntrada()}
            disabled={pendentesEntrada.length === 0 || gerandoEntrada}
            size="sm"
            className="gap-2"
          >
            {gerandoEntrada ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpFromLine className="h-4 w-4" />
            )}
            Entrada
            {pendentesEntrada.length > 0 && ` (${pendentesEntrada.length})`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGerarProrrogacao}
            disabled={boletosKpis.prorrogacaoPendente === 0 || gerandoProrrogacao}
            className="gap-2"
          >
            {gerandoProrrogacao ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpFromLine className="h-4 w-4" />
            )}
            Prorrogação
            {boletosKpis.prorrogacaoPendente > 0 && ` (${boletosKpis.prorrogacaoPendente})`}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGerarBaixa([])}
                  disabled={countSolicitada === 0 || gerandoBaixa}
                  className="gap-2"
                >
                  {gerandoBaixa ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4" />
                  )}
                  Baixa (todos)
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gera remessa de baixa para TODOS os títulos aguardando ({countSolicitada}). Para selecionar cliente/título, use o banner acima.</TooltipContent>
            </Tooltip>
          </TooltipProvider>

        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              Boletos{" "}
              <span className="text-sm text-muted-foreground font-normal">
                ({boletosFiltrados.length}
                {boletosFiltrados.length !== boletos.length ? ` de ${boletos.length}` : ""})
              </span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Cliente, título, pedido..."
                  className="h-8 w-[240px] pl-8"
                />
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground mr-1">Ver por:</span>
                <Button
                  size="sm"
                  variant={modo === "cliente" ? "default" : "outline"}
                  className="h-7 px-2.5"
                  onClick={() => setModo("cliente")}
                >
                  Cliente
                </Button>
                <Button
                  size="sm"
                  variant={modo === "vencimento" ? "default" : "outline"}
                  className="h-7 px-2.5"
                  onClick={() => setModo("vencimento")}
                >
                  Vencimento
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingBoletos ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : boletosFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum boleto encontrado.
            </p>
          ) : modo === "vencimento" ? (
            renderTabela(boletosFiltrados, false)
          ) : (
            <div className="space-y-2">
              {gruposCliente.map((g) => {
                const aberto = gruposAbertos[g.nome] ?? g.abrirPorPadrao;
                return (
                  <Collapsible
                    key={g.nome}
                    open={aberto}
                    onOpenChange={(o) => setGruposAbertos((p) => ({ ...p, [g.nome]: o }))}
                    className="rounded-md border"
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <CollapsibleTrigger asChild>
                        <button className="flex flex-1 items-center gap-3 text-left min-w-0">
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "" : "-rotate-90"}`}
                          />
                          <span className="truncate font-medium text-sm" title={g.nome}>
                            {g.nome}
                          </span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {g.boletos.length}
                          </Badge>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {formatBRL(g.total)}
                          </span>
                          {g.qtdVencido > 0 && (
                            <Badge className="shrink-0 bg-red-100 text-red-800 hover:bg-red-100 text-[10px]">
                              {g.qtdVencido} vencido · {formatBRL(g.totalVencido)}
                            </Badge>
                          )}
                          {g.proximoVencimento && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              próx. {formatDateBR(g.proximoVencimento)}
                            </span>
                          )}
                          <span className="flex shrink-0 items-center gap-1">
                            {g.mixStatus.map((m) => (
                              <span
                                key={m.status}
                                title={`${m.label}: ${m.qtd}`}
                                className={`inline-block h-2 w-2 rounded-full ${m.dot}`}
                              />
                            ))}
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      <AcoesGrupoCliente
                        boletos={g.boletos}
                        gerandoEntrada={gerandoEntrada}
                        onAbrirEntrada={abrirDialogEntrada}
                        onEnviarEmail={(id) => enviarEmailBoleto.mutateAsync(id)}
                      />
                    </div>
                    <CollapsibleContent>
                      <div className="border-t px-2 pb-2">{renderTabela(g.boletos, true)}</div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t py-2 text-xs text-muted-foreground">
          <span>
            {totaisFiltrados.qtd} boleto{totaisFiltrados.qtd === 1 ? "" : "s"} ·{" "}
            {formatBRL(totaisFiltrados.total)} total · {formatBRL(totaisFiltrados.vencido)} vencido
          </span>
        </CardFooter>
      </Card>

      <Dialog
        open={entradaDialogOpen}
        onOpenChange={(v) => {
          if (gerandoEntrada) return;
          if (v) setEntradaDialogOpen(true);
          else fecharDialogEntrada();
        }}
      >
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
                {entradaLista.map((b) => {
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
            <Button variant="outline" onClick={fecharDialogEntrada} disabled={gerandoEntrada}>
              Cancelar
            </Button>
            <Button
              onClick={() => handleGerarEntrada()}
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
