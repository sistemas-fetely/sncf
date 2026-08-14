import { Fragment, useEffect, useMemo, useState } from "react";
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
import { TrilhoBoleto } from "@/components/financeiro/TrilhoBoleto";
import { resumirTrilho } from "@/lib/financeiro/marcos-boleto";
import type { Database } from "@/integrations/supabase/types";
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
import { sugerirVencimentoBoleto, dataFaturamentoIso } from "@/lib/financeiro/sugerir-vencimento-boleto";
import { useEnviarEmailBoleto } from "@/hooks/credito/useEnviarEmailBoleto";
import { useBaixasPendentes } from "@/hooks/credito/useBaixasPendentes";
import { useRemessasSafra } from "@/hooks/credito/useRemessasSafra";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RetornoSafraPainel } from "@/components/financeiro/RetornoSafraPainel";

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
  /** Status do TÍTULO (aberto, devolvido, perda...) — distinto do boleto_status. */
  status: string | null;
  data_vencimento_atual: string | null;
  valor_bruto: number | null;
  boleto_status: string | null;
  boleto_enviado_em: string | null;
  prorrogacao_nova_data: string | null;
  prorrogacao_solicitada_em: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  conta: { parceiro: { razao_social: string | null } | null } | null;
  pedido: {
    id_externo: string | null;
    faturado_em: string | null;
    condicao_solicitada: string | null;
  } | null;
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
  // Existe no CHECK do banco desde sempre e nunca esteve aqui: caía no fallback
  // cinza sem rótulo. São os títulos devolvidos cuja baixa o Safra já confirmou.
  baixado_banco: { label: "Baixado (Safra)", cls: "bg-slate-200 text-slate-700" },
};


/**
 * O que este boleto EXIGE do operador — não o que ele "é".
 * Título devolvido ou em perda nunca exige emissão: a mercadoria voltou, o
 * caminho é baixar o título, não mandar boleto ao banco.
 */
type Atencao = "emitir" | "reemitir" | "vencido" | "nenhuma";

const TITULO_SEM_ACAO = new Set(["devolvido", "perda", "perda_parcial", "renegociado"]);

function classificarAtencao(b: TitulosBoleto, hojeIso: string): Atencao {
  if (b.status && TITULO_SEM_ACAO.has(b.status)) return "nenhuma";
  const st = b.boleto_status ?? "pendente";
  if (st === "pendente") return "emitir";
  if (st === "rejeitado") return "reemitir";
  if (st === "vencido") return "vencido";
  if (st === "registrado" && b.data_vencimento_atual && b.data_vencimento_atual < hojeIso) return "vencido";
  return "nenhuma";
}

const ATENCAO_CFG: Record<Exclude<Atencao, "nenhuma">, { label: string; cls: string; barra: string }> = {
  emitir:   { label: "a emitir",   cls: "bg-amber-100 text-amber-900 hover:bg-amber-100",   barra: "bg-amber-500" },
  reemitir: { label: "a reemitir", cls: "bg-orange-100 text-orange-900 hover:bg-orange-100", barra: "bg-orange-500" },
  vencido:  { label: "vencido",    cls: "bg-red-100 text-red-800 hover:bg-red-100",          barra: "bg-red-500" },
};

/** Dias entre hoje e a data (negativo = já passou). */
function diasAte(dataIso: string, hojeIso: string): number {
  return Math.round(
    (new Date(dataIso + "T00:00:00").getTime() - new Date(hojeIso + "T00:00:00").getTime()) / 86400000,
  );
}

/**
 * Subagrupa os boletos de um cliente por PEDIDO. Sem isso, dois pedidos do mesmo
 * cliente aparecem intercalados por data de vencimento e um pedido inteiro sem
 * boleto passa despercebido no meio de outro já registrado.
 */
function agruparPorPedido(boletos: TitulosBoleto[], hojeIso: string) {
  const map = new Map<string, TitulosBoleto[]>();
  for (const b of boletos) {
    const k = b.pedido?.id_externo || "— sem pedido —";
    const arr = map.get(k);
    if (arr) arr.push(b);
    else map.set(k, [b]);
  }
  const subs = Array.from(map.entries()).map(([pedido, lista]) => {
    let total = 0;
    let prioridade = 3;
    let proximo: string | null = null;
    const cont = new Map<Atencao, { qtd: number; valor: number }>();
    for (const b of lista) {
      const v = Number(b.valor_bruto || 0);
      total += v;
      const a = classificarAtencao(b, hojeIso);
      if (a !== "nenhuma") {
        const acc = cont.get(a) ?? { qtd: 0, valor: 0 };
        acc.qtd++; acc.valor += v;
        cont.set(a, acc);
        const p = a === "vencido" ? 1 : b.data_vencimento_atual && diasAte(b.data_vencimento_atual, hojeIso) <= 7 ? 0 : 2;
        if (p < prioridade) prioridade = p;
      }
      if (b.data_vencimento_atual && (!proximo || b.data_vencimento_atual < proximo)) {
        proximo = b.data_vencimento_atual;
      }
    }
    return {
      pedido,
      boletos: lista,
      total,
      prioridade,
      proximo,
      atencaoLista: (["emitir", "reemitir", "vencido"] as const)
        .map((k) => ({ tipo: k, ...(cont.get(k) ?? { qtd: 0, valor: 0 }) }))
        .filter((x) => x.qtd > 0),
    };
  });
  subs.sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    return (a.proximo ?? "9999-12-31").localeCompare(b.proximo ?? "9999-12-31");
  });
  return subs;
}

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
  const baixaSolicitadaItens = baixasPendentesData?.baixaSolicitada ?? [];
  const { data: remessas = [] } = useRemessasSafra();




  const { data: boletos = [], isLoading: loadingBoletos, refetch: refetchBoletos } = useQuery<TitulosBoleto[]>({
    queryKey: ["boletos-safra"],
    queryFn: async () => {
      // Anotada como `string` de propósito: alarga o literal e evita TS2589 no select aninhado.
      // O resultado segue tipado à mão via `as unknown as TitulosBoleto[]` abaixo.
      const SELECT_BOLETOS: string =
        "id, numero_titulo, status, data_vencimento_atual, valor_bruto, boleto_status, boleto_enviado_em, prorrogacao_nova_data, prorrogacao_solicitada_em, numero_parcela, total_parcelas, conta:contas_pagar_receber(parceiro:parceiros_comerciais(razao_social)), pedido:pedidos(id_externo, faturado_em, condicao_solicitada)";
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

  /**
   * Revalida TODO consumidor de `titulo_a_receber` no hub de Cobrança.
   * Banco Safra (`boletos-safra`) e Mesa de Cobrança (`cobranca-mesa`) leem o mesmo
   * dado de fundo — qualquer ação que muda boleto precisa invalidar os dois caches.
   */
  const revalidarTitulos = async () => {
    await Promise.all([
      refetchBoletos(),
      qc.invalidateQueries({ queryKey: ["boletos-safra"] }),
      qc.invalidateQueries({ queryKey: ["cobranca-mesa"] }),
    ]);
  };

  const [gerandoBaixa, setGerandoBaixa] = useState(false);
  const [gerandoProrrogacao, setGerandoProrrogacao] = useState(false);
  const [gerandoEntrada, setGerandoEntrada] = useState(false);
  const [entradaDialogOpen, setEntradaDialogOpen] = useState(false);
  /** Quando existe, o Dialog de entrada considera apenas estes títulos (escopo de um cliente). */
  const [escopoEntrada, setEscopoEntrada] = useState<string[] | null>(null);
  // Diálogo de conferência da baixa (seleção de títulos que antes vivia no BaixasPendentesAlert)
  const [baixaDialogOpen, setBaixaDialogOpen] = useState(false);
  const [baixaSelecionados, setBaixaSelecionados] = useState<Set<string>>(new Set());
  const abrirDialogBaixa = () => {
    setBaixaSelecionados(new Set(baixaSolicitadaItens.map((i) => i.id)));
    setBaixaDialogOpen(true);
  };
  const totalBaixaSelecionado = baixaSolicitadaItens
    .filter((i) => baixaSelecionados.has(i.id))
    .reduce((s, i) => s + Number(i.valor || 0), 0);

  // mutation de e-mail: uma única instância para toda a tela
  const enviarEmailBoleto = useEnviarEmailBoleto();

  const hojeIso = new Date().toISOString().slice(0, 10);
  const pendentesEntrada = useMemo(
    () => boletos.filter((b) => b.boleto_status === "pendente"),
    [boletos],
  );

  // edição inline de boletos (declarada aqui porque as sugestões dependem dela)
  const [edits, setEdits] = useState<Record<string, { data?: string; valor?: string }>>({});

  /**
   * A parcela 1 é sugerida pela regra pura (faturamento + dia nominal, piso 7d).
   * As demais seguem a data EFETIVA da parcela 1 — edição em curso na tela tem
   * precedência sobre o salvo, para o operador ver a cascata antes de gravar.
   */
  const ancoraPorPedido = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of boletos) {
      if ((b.numero_parcela ?? 1) !== 1) continue;
      const ped = b.pedido?.id_externo;
      if (!ped) continue;
      const efetiva = edits[b.id]?.data ?? b.data_vencimento_atual ?? null;
      if (efetiva) map[ped] = efetiva;
    }
    return map;
  }, [boletos, edits]);

  /** Sugestão de vencimento por título pendente (só sugestão — nunca grava sozinha). */
  const sugestoes = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of pendentesEntrada) {
      const parcela = b.numero_parcela ?? 1;
      const ped = b.pedido?.id_externo;
      const ancora = parcela > 1 && ped ? ancoraPorPedido[ped] : null;
      const s = sugerirVencimentoBoleto(
        b.pedido?.faturado_em,
        b.pedido?.condicao_solicitada,
        parcela,
        b.total_parcelas,
        ancora,
      );
      if (s) map[b.id] = s;
    }
    return map;
  }, [pendentesEntrada, ancoraPorPedido]);

  /** Pendentes com sugestão diferente da data salva — universo do dialog em lote. */
  const pendentesComSugestao = useMemo(
    () =>
      pendentesEntrada.filter(
        (b) => sugestoes[b.id] && sugestoes[b.id] !== b.data_vencimento_atual,
      ),
    [pendentesEntrada, sugestoes],
  );
  const [sugestoesDialogOpen, setSugestoesDialogOpen] = useState(false);
  const [aplicandoSugestoes, setAplicandoSugestoes] = useState(false);
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
    setBuscaEntrada("");
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

  /** Busca do Dialog de entrada — cliente, pedido ou título. */
  const [buscaEntrada, setBuscaEntrada] = useState("");
  const entradaFiltrada = useMemo(() => {
    const termo = semAcento(buscaEntrada.trim());
    if (!termo) return entradaLista;
    return entradaLista.filter((b) =>
      semAcento(
        [
          b.conta?.parceiro?.razao_social ?? "",
          b.pedido?.id_externo ?? "",
          b.numero_titulo ?? "",
        ].join(" "),
      ).includes(termo),
    );
  }, [entradaLista, buscaEntrada]);

  /** Agrupamento por PEDIDO — mesmo conceito de gruposCliente. */
  const gruposEntrada = useMemo(() => {
    const map = new Map<string, TitulosBoleto[]>();
    const ordem: string[] = [];
    for (const b of entradaFiltrada) {
      const k = b.pedido?.id_externo ?? `sem-pedido:${b.id}`;
      if (!map.has(k)) { map.set(k, []); ordem.push(k); }
      map.get(k)!.push(b);
    }
    return ordem.map((k) => {
      const lista = map.get(k)!;
      const selecionaveis = lista
        .filter((b) => !b.data_vencimento_atual || b.data_vencimento_atual >= hojeIso)
        .map((b) => b.id);
      const marcados = selecionaveis.filter((id) => selecionados.has(id));
      return {
        chave: k,
        pedido: lista[0].pedido?.id_externo ?? "— sem pedido —",
        cliente: lista[0].conta?.parceiro?.razao_social || "— sem cliente —",
        boletos: lista,
        total: lista.reduce((s, b) => s + Number(b.valor_bruto || 0), 0),
        selecionaveis,
        estado:
          selecionaveis.length > 0 && marcados.length === selecionaveis.length
            ? ("todos" as const)
            : marcados.length > 0
              ? ("parcial" as const)
              : ("nenhum" as const),
      };
    });
  }, [entradaFiltrada, hojeIso, selecionados]);

  const toggleGrupoEntrada = (ids: string[], marcarTodos: boolean) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      for (const id of ids) {
        if (marcarTodos) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  };

  // edição inline de boletos (state declarado acima, junto das sugestões)
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const temEdicao = (id: string) => !!(edits[id]?.data || edits[id]?.valor);
  const handleSalvar = async (b: TitulosBoleto) => {
    const edit = edits[b.id];
    if (!edit) return;
    setSalvando((p) => ({ ...p, [b.id]: true }));
    try {
      const novaData =
        edit.data && edit.data !== b.data_vencimento_atual ? edit.data : null;
      let novoValor: number | null = null;
      if (edit.valor) {
        const v = parseFloat(edit.valor.replace(",", "."));
        if (!isNaN(v) && v > 0 && v !== Number(b.valor_bruto)) novoValor = v;
      }
      if (!novaData && novoValor === null) {
        setEdits((p) => { const n = { ...p }; delete n[b.id]; return n; });
        return;
      }

      /* Vencimento passa pelo portão único: a RPC grava a data E a trilha
         (ator_id = auth.uid()). UPDATE direto nesta coluna é proibido. */
      if (novaData) {
        const { data: resultado, error } = await supabase.rpc(
          "ajustar_vencimento_boleto_pendente",
          {
            p_titulo_id: b.id,
            p_nova_data: novaData,
            p_motivo: "Ajuste manual na tela Banco Safra",
          },
        );
        if (error) throw error;
        const r = resultado as { ok: boolean; erro?: string } | null;
        if (!r?.ok) {
          toast({
            title: "Vencimento não alterado",
            description: r?.erro ?? "A RPC recusou o ajuste sem informar motivo.",
            variant: "destructive",
          });
          void revalidarTitulos();
          return; // mantém edits[b.id] para o operador corrigir
        }
      }

      if (novoValor !== null) {
        const update: Partial<Pick<
          Database["public"]["Tables"]["titulo_a_receber"]["Update"],
          "valor_bruto"
        >> = { valor_bruto: novoValor };
        const { error } = await supabase.from("titulo_a_receber").update(update).eq("id", b.id);
        if (error) throw error;
      }

      setEdits((p) => { const n = { ...p }; delete n[b.id]; return n; });
      toast({ title: "Boleto atualizado", description: `${b.numero_titulo} salvo com sucesso.` });
      void revalidarTitulos();
    } catch (e) {
      toast({ title: "Erro ao salvar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSalvando((p) => ({ ...p, [b.id]: false }));
    }
  };

  /** Aplica em lote as sugestões de vencimento (em sequência, para na primeira falha). */
  const aplicarSugestoes = async () => {
    setAplicandoSugestoes(true);
    let salvos = 0;
    try {
      for (const b of pendentesComSugestao) {
        try {
          const { data: resultado, error } = await supabase.rpc(
            "ajustar_vencimento_boleto_pendente",
            {
              p_titulo_id: b.id,
              p_nova_data: sugestoes[b.id],
              p_motivo: "Sugestão de vencimento aplicada em lote (NF + condição do pedido)",
            },
          );
          if (error) throw error;
          const r = resultado as { ok: boolean; erro?: string } | null;
          if (!r?.ok) throw new Error(r?.erro ?? "Ajuste recusado pela RPC.");
          salvos++;
        } catch (e) {
          throw new Error(
            `${(e as Error).message} — ${salvos} título(s) salvo(s) antes da falha (${b.numero_titulo ?? b.id}).`,
          );
        }
      }
      toast({ title: `${salvos} vencimentos atualizados pela sugestão` });
      setSugestoesDialogOpen(false);
      await revalidarTitulos();
    } catch (e) {
      toast({
        title: "Erro ao aplicar sugestões",
        description: (e as Error).message,
        variant: "destructive",
      });
      await revalidarTitulos();
    } finally {
      setAplicandoSugestoes(false);
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
      setBaixaDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["baixas-pendentes"] });
      await qc.invalidateQueries({ queryKey: ["remessas-safra"] });
      void revalidarTitulos();
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
      void revalidarTitulos();
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
      void revalidarTitulos();
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
    const hoje = new Date().toISOString().slice(0, 10);
    let pendentes = 0;
    let pendentesValor = 0;
    let pendentesPassado = 0;
    let registrados = 0;
    let pagosMes = 0;
    let vencidos = 0;
    let vencidosValor = 0;
    let vencidoMaisAntigo: string | null = null;
    let prorrogacaoPendente = 0;
    for (const b of boletos) {
      const s = b.boleto_status || "";
      const v = Number(b.valor_bruto || 0);
      if (s === "pendente") {
        pendentes++;
        pendentesValor += v;
        if (b.data_vencimento_atual && b.data_vencimento_atual < hoje) pendentesPassado++;
      } else if (s === "registrado") registrados++;
      else if (s === "vencido") {
        vencidos++;
        vencidosValor += v;
        if (
          b.data_vencimento_atual &&
          (!vencidoMaisAntigo || b.data_vencimento_atual < vencidoMaisAntigo)
        ) {
          vencidoMaisAntigo = b.data_vencimento_atual;
        }
      }
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
    const diasVencidoMaisAntigo = vencidoMaisAntigo
      ? diasDesde(`${vencidoMaisAntigo}T00:00:00`)
      : null;
    return {
      pendentes,
      pendentesValor,
      pendentesPassado,
      registrados,
      pagosMes,
      vencidos,
      vencidosValor,
      diasVencidoMaisAntigo,
      prorrogacaoPendente,
    };
  }, [boletos]);

  /** Arquivos gerados e nunca enviados ao Safra. */
  const remessasParadas = useMemo(() => {
    const geradas = remessas.filter((r) => r.status === "gerada" && !r.enviada_em);
    let maisAntigaDias: number | null = null;
    for (const r of geradas) {
      const d = diasDesde(r.gerado_em);
      if (d != null && (maisAntigaDias == null || d > maisAntigaDias)) maisAntigaDias = d;
    }
    return { qtd: geradas.length, maisAntigaDias };
  }, [remessas]);

  /** Bloco 3 do useBaixasPendentes: enviadas ao banco, aguardando retorno. */
  const aguardandoRetorno = useMemo(() => {
    const itens = baixasPendentesData?.remessaEnviadaAguardandoRetorno ?? [];
    let dias: number | null = null;
    for (const i of itens) {
      const d = diasDesde(i.remessa_enviada_em);
      if (d != null && (dias == null || d > dias)) dias = d;
    }
    const remessasUnicas = new Set(itens.map((i) => i.remessa_id ?? i.id));
    return { qtd: remessasUnicas.size, dias };
  }, [baixasPendentesData]);


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
      if (filtroKpi === "pendentes" && s !== "pendente") return false;
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
      const atencao = new Map<Atencao, { qtd: number; valor: number }>();
      let emitirMaisUrgente: string | null = null;
      /** Pedidos na ordem de vencimento (lista já vem ordenada asc). */
      const pedidos: string[] = [];
      for (const b of lista) {
        const v = Number(b.valor_bruto || 0);
        total += v;
        const a = classificarAtencao(b, hojeIso);
        if (a === "vencido") {
          qtdVencido++;
          totalVencido += v;
        }
        if (a !== "nenhuma") {
          const acc = atencao.get(a) ?? { qtd: 0, valor: 0 };
          acc.qtd++; acc.valor += v;
          atencao.set(a, acc);
          if ((a === "emitir" || a === "reemitir") && b.data_vencimento_atual &&
              (!emitirMaisUrgente || b.data_vencimento_atual < emitirMaisUrgente)) {
            emitirMaisUrgente = b.data_vencimento_atual;
          }
        }
        if (
          b.data_vencimento_atual &&
          (!proximoVencimento || b.data_vencimento_atual < proximoVencimento)
        ) {
          proximoVencimento = b.data_vencimento_atual;
        }
        const ped = b.pedido?.id_externo;
        if (ped && !pedidos.includes(ped)) pedidos.push(ped);
      }
      const atencaoLista = (["emitir", "reemitir", "vencido"] as const)
        .map((k) => ({ tipo: k, ...(atencao.get(k) ?? { qtd: 0, valor: 0 }) }))
        .filter((x) => x.qtd > 0);
      return {
        nome,
        boletos: lista,
        total,
        totalVencido,
        qtdVencido,
        proximoVencimento,
        pedidos,
        atencaoLista,
        prioridade: (() => {
          const temEmitir = (atencao.get("emitir")?.qtd ?? 0) + (atencao.get("reemitir")?.qtd ?? 0) > 0;
          const emitirApertado =
            temEmitir && !!emitirMaisUrgente && diasAte(emitirMaisUrgente, hojeIso) <= 7;
          if (emitirApertado) return 0;
          if (qtdVencido > 0) return 1;
          if (temEmitir) return 2;
          return 3;
        })(),
        abrirPorPadrao: qtdVencido > 0 || (atencao.get("emitir")?.qtd ?? 0) + (atencao.get("reemitir")?.qtd ?? 0) > 0,
      };
    });
    grupos.sort((a, b) => {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
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
                  (() => {
                    const valorAtual = edits[b.id]?.data ?? b.data_vencimento_atual ?? "";
                    const sug = sugestoes[b.id];
                    const dias = (() => {
                      const m = (b.pedido?.condicao_solicitada || "").match(/\d+(?:\s*\/\s*\d+)+/);
                      if (!m) return null;
                      const arr = m[0].split("/").map((x) => x.trim());
                      return arr[(b.numero_parcela ?? 1) - 1] ?? null;
                    })();
                    return (
                      <div className="space-y-1">
                        <Input
                          type="date"
                          className="h-8 w-[140px]"
                          value={valorAtual}
                          onChange={(e) =>
                            setEdits((p) => ({ ...p, [b.id]: { ...p[b.id], data: e.target.value } }))
                          }
                        />
                        {sug && sug !== valorAtual && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEdits((p) => ({ ...p, [b.id]: { ...p[b.id], data: sug } }))
                                  }
                                  className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                                >
                                  {(b.numero_parcela ?? 1) > 1
                                    ? `P1 ${formatDateBR(ancoraPorPedido[b.pedido?.id_externo ?? ""] ?? null)?.slice(0, 5) ?? "—"}`
                                    : `Fat ${formatDateBR(dataFaturamentoIso(b.pedido?.faturado_em))?.slice(0, 5) || "—"}`}
                                  {dias ? ` +${dias}d` : ""} → {formatDateBR(sug)?.slice(0, 5)} ·{" "}
                                  <span className="font-medium underline">usar</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {(b.numero_parcela ?? 1) > 1
                                  ? `Intervalo comercial contado a partir do vencimento da parcela 1`
                                  : `Faturamento (${formatDateBR(dataFaturamentoIso(b.pedido?.faturado_em))?.slice(0, 5)}) + dias da condição, nunca antes de faturamento + 7 dias`}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    );
                  })()
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

  // ── Faixa de trabalho: só o que está parado esperando gente ───────────────
  type LinhaFaixa = {
    key: string;
    filtro: typeof filtroKpi;
    texto: React.ReactNode;
    valor: number | null;
    tom: "vermelho" | "ambar" | "neutro";
    acao: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean } | null;
    acaoSecundaria?: { label: string; onClick: () => void; disabled?: boolean } | null;
  };
  const linhasFaixa: LinhaFaixa[] = [];
  if (boletosKpis.pendentes > 0) {
    linhasFaixa.push({
      key: "pendentes",
      filtro: "pendentes",
      tom: boletosKpis.pendentesPassado > 0 ? "vermelho" : "neutro",
      valor: boletosKpis.pendentesValor,
      texto: (
        <>
          {boletosKpis.pendentes} boletos nunca registrados no Safra
          {boletosKpis.pendentesPassado > 0 && (
            <span className="text-destructive">
              , {boletosKpis.pendentesPassado} com vencimento no passado
            </span>
          )}
        </>
      ),
      acao: {
        label: "Gerar entrada",
        onClick: () => abrirDialogEntrada(),
        disabled: pendentesEntrada.length === 0 || gerandoEntrada,
        loading: gerandoEntrada,
      },
      acaoSecundaria:
        pendentesComSugestao.length > 0
          ? {
              label: "Aplicar sugestões de vencimento",
              onClick: () => setSugestoesDialogOpen(true),
            }
          : null,
    });
  }
  if (boletosKpis.vencidos > 0) {
    linhasFaixa.push({
      key: "vencidos",
      filtro: "vencidos",
      tom: "vermelho",
      valor: boletosKpis.vencidosValor,
      texto: (
        <>
          {boletosKpis.vencidos} vencidos
          {boletosKpis.diasVencidoMaisAntigo != null &&
            `, o mais antigo há ${boletosKpis.diasVencidoMaisAntigo} dias`}
        </>
      ),
      acao: { label: "Ver", onClick: () => setFiltroKpi("vencidos") },
    });
  }
  if (countSolicitada > 0) {
    linhasFaixa.push({
      key: "baixas",
      filtro: "baixas",
      tom: "neutro",
      valor: baixasPendentesData?.totalSolicitada ?? 0,
      texto: <>{countSolicitada} baixas aguardando remessa</>,
      acao: {
        label: "Gerar baixa",
        onClick: abrirDialogBaixa,
        disabled: gerandoBaixa,
        loading: gerandoBaixa,
      },
    });
  }
  if (remessasParadas.qtd > 0) {
    linhasFaixa.push({
      key: "remessas-paradas",
      filtro: null,
      tom: "ambar",
      valor: null,
      texto: (
        <>
          {remessasParadas.qtd} arquivos gerados e nunca enviados ao Safra
          {remessasParadas.maisAntigaDias != null && `, há ${remessasParadas.maisAntigaDias} dias`}
        </>
      ),
      acao: onIrParaRemessas
        ? { label: "Abrir Remessas", onClick: onIrParaRemessas }
        : null,
    });
  }
  if (boletosKpis.prorrogacaoPendente > 0) {
    linhasFaixa.push({
      key: "prorrogacoes",
      filtro: null,
      tom: "neutro",
      valor: null,
      texto: <>{boletosKpis.prorrogacaoPendente} prorrogações aguardando envio</>,
      acao: {
        label: "Gerar prorrogação",
        onClick: handleGerarProrrogacao,
        disabled: gerandoProrrogacao,
        loading: gerandoProrrogacao,
      },
    });
  }
  if (aguardandoRetorno.qtd > 0) {
    linhasFaixa.push({
      key: "aguardando-retorno",
      filtro: null,
      tom: "neutro",
      valor: null,
      texto: (
        <>
          {aguardandoRetorno.qtd} remessas enviadas aguardando retorno do banco
          {aguardandoRetorno.dias != null && `, há ${aguardandoRetorno.dias} dias`}
        </>
      ),
      acao: null,
    });
  }

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

      <Card>
        <CardContent className="p-0">
          {linhasFaixa.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Nada parado. Tudo em dia por aqui.
            </p>
          ) : (
            <ul className="divide-y">
              {linhasFaixa.map((l) => {
                const ativo = l.filtro != null && filtroKpi === l.filtro;
                const borda =
                  l.tom === "vermelho"
                    ? "border-l-destructive"
                    : l.tom === "ambar"
                      ? "border-l-amber-500"
                      : "border-l-transparent";
                return (
                  <li
                    key={l.key}
                    className={`flex items-center justify-between gap-3 border-l-2 px-4 py-2 ${borda} ${
                      ativo ? "bg-muted/60" : ""
                    }`}
                  >
                    <button
                      type="button"
                      disabled={l.filtro == null}
                      onClick={() => l.filtro && setFiltroKpi(ativo ? null : l.filtro)}
                      className={`flex min-w-0 flex-1 items-baseline gap-2 text-left text-sm ${
                        l.filtro == null ? "cursor-default" : "hover:underline"
                      } ${l.tom === "vermelho" ? "text-destructive" : l.tom === "ambar" ? "text-amber-700" : ""}`}
                    >
                      <span className="truncate">{l.texto}</span>
                      {l.valor != null && (
                        <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
                          {formatBRL(l.valor)}
                        </span>
                      )}
                    </button>
                    {l.acaoSecundaria && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={l.acaoSecundaria.onClick}
                        disabled={l.acaoSecundaria.disabled}
                      >
                        {l.acaoSecundaria.label}
                      </Button>
                    )}
                    {l.acao && (
                      <Button
                        size="sm"
                        variant={l.tom === "neutro" ? "outline" : "default"}
                        className="shrink-0 gap-2"
                        onClick={l.acao.onClick}
                        disabled={l.acao.disabled}
                      >
                        {l.acao.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {l.acao.label}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* resumo do que não pede ação */}
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setFiltroKpi(filtroKpi === "registrados" ? null : "registrados")}
          className={`hover:underline ${filtroKpi === "registrados" ? "font-semibold text-foreground" : ""}`}
        >
          {boletosKpis.registrados} registrados
        </button>
        <span>·</span>
        <button
          type="button"
          onClick={() => setFiltroKpi(filtroKpi === "pagos_mes" ? null : "pagos_mes")}
          className={`hover:underline ${filtroKpi === "pagos_mes" ? "font-semibold text-foreground" : ""}`}
        >
          {boletosKpis.pagosMes} pagos no mês
        </button>
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
                /* Grupo inteiro encerrado (devolvido / baixado por perda) não exige nada
                   de ninguém: continua visível para consulta, mas para de disputar
                   atenção com o que ainda está vivo. */
                const grupoEncerrado = resumirTrilho(g.boletos, hojeIso)?.encerrado ?? false;
                return (
                  <Collapsible
                    key={g.nome}
                    open={aberto}
                    onOpenChange={(o) => setGruposAbertos((p) => ({ ...p, [g.nome]: o }))}
                    className={`relative overflow-hidden rounded-md border ${g.prioridade <= 2 ? "border-l-0" : ""} ${grupoEncerrado ? "opacity-60" : ""}`}
                  >
                    {g.prioridade <= 2 && (
                      <span
                        aria-hidden
                        className={`absolute left-0 top-0 h-full w-1 ${
                          g.atencaoLista.find((x) => x.tipo === "emitir" || x.tipo === "reemitir")
                            ? ATENCAO_CFG.emitir.barra
                            : ATENCAO_CFG.vencido.barra
                        }`}
                      />
                    )}
                    <div className="flex items-center gap-2 px-3 py-2">
                      <CollapsibleTrigger asChild>
                        <button className="flex flex-1 items-center gap-3 text-left min-w-0">
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "" : "-rotate-90"}`}
                          />
                          <span className="truncate font-medium text-sm" title={g.nome}>
                            {g.nome}
                          </span>
                          {g.pedidos.length > 0 && (
                            <span
                              className="shrink-0 font-mono text-[11px] text-muted-foreground"
                              title={g.pedidos.join(", ")}
                            >
                              {g.pedidos[0]}
                              {g.pedidos.length > 1 && ` +${g.pedidos.length - 1}`}
                            </span>
                          )}
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {g.boletos.length}
                          </Badge>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {formatBRL(g.total)}
                          </span>
                          {g.atencaoLista.map((x) => (
                            <Badge
                              key={x.tipo}
                              className={`shrink-0 text-[10px] font-semibold ${ATENCAO_CFG[x.tipo].cls}`}
                            >
                              {x.qtd} {ATENCAO_CFG[x.tipo].label} · {formatBRL(x.valor)}
                            </Badge>
                          ))}
                          {/* A fita responde ONDE o boleto está; o badge acima responde
                              O QUE FAZER. São perguntas diferentes e convivem — antes era
                              XOR e o cliente com pendência perdia o status inteiro. */}
                          <TrilhoBoleto itens={g.boletos} hojeIso={hojeIso} />
                          {g.proximoVencimento && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              próx. {formatDateBR(g.proximoVencimento)}
                            </span>
                          )}
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
                      <div className="border-t px-2 pb-2">
                        {g.pedidos.length <= 1 ? (
                          renderTabela(g.boletos, true)
                        ) : (
                          agruparPorPedido(g.boletos, hojeIso).map((sp) => (
                            <div key={sp.pedido} className="mt-2 first:mt-1">
                              <div className="flex items-center gap-2 px-1 py-1">
                                <span className="font-mono text-[11px] font-medium">{sp.pedido}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {sp.boletos.length}
                                </Badge>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {formatBRL(sp.total)}
                                </span>
                                <TrilhoBoleto itens={sp.boletos} hojeIso={hojeIso} />
                                {sp.atencaoLista.map((x) => (
                                  <Badge
                                    key={x.tipo}
                                    className={`text-[10px] font-semibold ${ATENCAO_CFG[x.tipo].cls}`}
                                  >
                                    {x.qtd} {ATENCAO_CFG[x.tipo].label}
                                  </Badge>
                                ))}
                                {(() => {
                                  const alvos = sp.boletos.filter(
                                    (b) => sugestoes[b.id] && sugestoes[b.id] !== (edits[b.id]?.data ?? b.data_vencimento_atual ?? ""),
                                  );
                                  if (alvos.length === 0) return null;
                                  return (
                                    <button
                                      type="button"
                                      className="text-[11px] font-medium text-muted-foreground underline hover:text-foreground"
                                      onClick={() =>
                                        setEdits((p) => {
                                          const n = { ...p };
                                          for (const b of alvos) n[b.id] = { ...n[b.id], data: sugestoes[b.id] };
                                          return n;
                                        })
                                      }
                                    >
                                      usar sugestões ({alvos.length})
                                    </button>
                                  );
                                })()}
                              </div>
                              {renderTabela(sp.boletos, true)}
                            </div>
                          ))
                        )}
                      </div>
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
        <DialogContent className="max-w-3xl">
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

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Buscar cliente, pedido ou título"
              value={buscaEntrada}
              onChange={(e) => setBuscaEntrada(e.target.value)}
            />
          </div>

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
                  <TableHead className="w-[120px]">Vencimento</TableHead>
                  <TableHead className="w-[110px] text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gruposEntrada.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum título encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {gruposEntrada.map((g) => (
                  <Fragment key={g.chave}>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell>
                        <Checkbox
                          checked={
                            g.estado === "todos"
                              ? true
                              : g.estado === "parcial"
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={() =>
                            toggleGrupoEntrada(g.selecionaveis, g.estado !== "todos")
                          }
                          disabled={g.selecionaveis.length === 0}
                          aria-label={`Selecionar pedido ${g.pedido}`}
                        />
                      </TableCell>
                      <TableCell colSpan={2} className="max-w-0">
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-medium max-w-[280px]"
                            title={g.cliente}
                          >
                            {g.cliente}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                              {g.pedido}
                            </span>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {g.boletos.length}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="w-[110px] text-right font-mono text-xs whitespace-nowrap">
                        {formatBRL(g.total)}
                      </TableCell>
                    </TableRow>
                    {g.boletos.map((b) => {
                      const passado = !!b.data_vencimento_atual && b.data_vencimento_atual < hojeIso;
                      const marcado = selecionados.has(b.id);
                      return (
                        <TableRow key={b.id} className={passado ? "bg-red-50/60" : ""}>
                          <TableCell className="pl-6">
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
                          <TableCell className="font-mono text-xs max-w-0">
                            <div className="truncate">
                              {b.numero_titulo || "—"}
                              {b.numero_parcela && b.total_parcelas ? (
                                <span className="text-muted-foreground">
                                  {" "}{b.numero_parcela}/{b.total_parcelas}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className={`w-[120px] ${passado ? "text-red-700 font-medium" : ""}`}>
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="whitespace-nowrap">{formatDateBR(b.data_vencimento_atual)}</span>
                              {passado && (
                                <Badge variant="outline" className="border-red-300 text-red-700 text-[10px]">
                                  Vencimento no passado
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="w-[110px] text-right font-mono whitespace-nowrap">{formatBRL(Number(b.valor_bruto || 0))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                ))}
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

      <Dialog
        open={baixaDialogOpen}
        onOpenChange={(v) => {
          if (gerandoBaixa) return;
          setBaixaDialogOpen(v);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gerar Remessa de Baixa</DialogTitle>
            <DialogDescription>
              Selecione os títulos com baixa solicitada que entram nesta remessa.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[360px] overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        baixaSolicitadaItens.length > 0 &&
                        baixaSelecionados.size === baixaSolicitadaItens.length
                      }
                      onCheckedChange={(c) =>
                        setBaixaSelecionados(
                          c ? new Set(baixaSolicitadaItens.map((i) => i.id)) : new Set()
                        )
                      }
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Nosso número</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baixaSolicitadaItens.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Checkbox
                        checked={baixaSelecionados.has(i.id)}
                        onCheckedChange={() =>
                          setBaixaSelecionados((prev) => {
                            const n = new Set(prev);
                            if (n.has(i.id)) n.delete(i.id);
                            else n.add(i.id);
                            return n;
                          })
                        }
                        aria-label={`Selecionar ${i.numero_titulo ?? i.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{i.numero_titulo || "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{i.cliente}</TableCell>
                    <TableCell className="font-mono text-xs">{i.nosso_numero_seq || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatBRL(i.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBaixaDialogOpen(false)}
              disabled={gerandoBaixa}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => handleGerarBaixa(Array.from(baixaSelecionados))}
              disabled={gerandoBaixa || baixaSelecionados.size === 0}
              className="gap-2"
            >
              {gerandoBaixa && <Loader2 className="h-4 w-4 animate-spin" />}
              Gerar remessa com {baixaSelecionados.size} título(s) ·{" "}
              {formatBRL(totalBaixaSelecionado)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aplicar sugestões de vencimento em lote (só pendentes com sugestão diferente) */}
      <Dialog open={sugestoesDialogOpen} onOpenChange={(v) => !aplicandoSugestoes && setSugestoesDialogOpen(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aplicar sugestões de vencimento</DialogTitle>
            <DialogDescription>
              Faturamento do pedido + dias da condição comercial, nunca antes de faturamento + 7
              dias. Só títulos nunca registrados no Safra.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Vencimento atual</TableHead>
                  <TableHead>Sugestão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentesComSugestao.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="max-w-[200px] truncate">
                      {b.conta?.parceiro?.razao_social || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{b.numero_titulo || "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatDateBR(b.data_vencimento_atual)}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {formatDateBR(sugestoes[b.id])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSugestoesDialogOpen(false)}
              disabled={aplicandoSugestoes}
            >
              Cancelar
            </Button>
            <Button onClick={aplicarSugestoes} disabled={aplicandoSugestoes} className="gap-2">
              {aplicandoSugestoes && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar e salvar ({pendentesComSugestao.length} títulos)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RetornoSafraPainel />
    </div>
  );
}
