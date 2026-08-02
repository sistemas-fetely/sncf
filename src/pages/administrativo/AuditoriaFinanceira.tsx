/**
 * Auditoria Financeira — trabalho sobre o lote congelado mais recente.
 * Fonte: `vw_auditoria_lote_enriquecido`. Ações: RPC `tratar_achado_auditoria`
 * (por linha) e `gerar_snapshot_auditoria` (novo lote).
 *
 * Doutrina: a Auditoria DETECTA e ROTEIA. A tela especializada RESOLVE.
 * Não existe botão de "resolver" aqui — existe rota para a tela que resolve.
 *
 * IMPORTANTE: os valores das classes NÃO são somáveis entre si —
 * naturezas diferentes de dinheiro. Somar dentro de uma classe é ok;
 * somar entre classes é proibido.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import type { EstagioPedido } from "@/types/pedido";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DossieAchado from "@/components/auditoria/DossieAchado";
import HipoteseResumo from "@/components/auditoria/HipoteseResumo";
import { useHipoteseMap } from "@/hooks/useHipoteseMap";
import {
  achadoTemMeio, contarMeios, labelMeio, meiosNoLote,
} from "@/lib/auditoria/filtro-meio";
import {
  AlertTriangle, ShieldAlert, Info, RefreshCw, ExternalLink, Loader2, CheckCircle2,
  ArrowUpRight, ChevronDown,
} from "lucide-react";

type Situacao = "aberto" | "em_analise" | "resolvido" | "explicado" | "reaparecido";
type Fonte = "integridade_financeira" | "recebivel_sem_titulo";

type Achado = {
  id: string;
  lote_id: string;
  gerado_em: string;
  fonte: Fonte | string | null;
  chave: string | null;
  classe: string | null;
  severidade: number | null;
  pedido_id: string | null;
  id_externo: string | null;
  cliente: string | null;
  valor: number | null;
  estagio: string | null;
  detalhe: string | null;
  acao: string | null;
  situacao: Situacao | string | null;
  nota: string | null;
  tratado_em: string | null;
  tratado_por: string | null;
  // vw_auditoria_lote_enriquecido
  // `meio_pagamento` é rótulo COLAPSADO — só para exibir. Filtro usa as flags.
  meio_pagamento: string | null;
  meios_detalhe: string | null;
  tem_cartao: boolean | null;
  tem_boleto: boolean | null;
  tem_pix: boolean | null;
  tem_haver: boolean | null;
  rota_solucao: string | null;
  rotulo_acao: string | null;
  tela_solucao: string | null;
  rota_observacao: string | null;
  achados_no_pedido: number | null;
  pior_severidade_pedido: number | null;
  falso_positivo_sem_caixa: boolean | null;
};

const CLASSE_LABEL: Record<string, string> = {
  REALOCAR_DO_PAI: "Realocar do pedido pai",
  REALOCAR_PARCIAL: "Realocar parcial + faturar diferença",
  BOLETO_PAGO_SEM_EVIDENCIA: "Boleto pago sem evidência bancária",
  FATURAR_REMESSA: "Remessa a faturar",
  PEDIDO_SEM_RECEBIVEL: "Pedido sem recebível",
  SUBFATURADO: "Subfaturado",
  SOBREFATURADO: "Sobrefaturado",
  BOLETO_SEM_MOVIMENTACAO: "Boleto sem movimentação vinculada",
  PAGO_SEM_VINCULO_ORIGEM: "Pago sem vínculo de origem",
  CANCELADO_ESTACIONADO: "Cancelado estacionado",
  RECEBIVEL_SEM_TITULO: "Recebível sem título",
};
const labelClasse = (c: string | null) => (c && CLASSE_LABEL[c]) || c || "—";

const FONTE_LABEL: Record<string, string> = {
  integridade_financeira: "Integridade financeira",
  recebivel_sem_titulo: "Recebível sem título",
};

// Rótulos/ordem/critério de meio vivem em src/lib/auditoria/filtro-meio.ts


const SITUACAO_META: Record<Situacao, { label: string; className: string }> = {
  aberto:       { label: "Aberto",       className: "bg-muted text-foreground border-border" },
  em_analise:   { label: "Em análise",   className: "bg-info/15 text-info border-info/40" },
  resolvido:    { label: "Resolvido",    className: "bg-success/15 text-success border-success/40" },
  explicado:    { label: "Explicado",    className: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/40" },
  reaparecido:  { label: "Reapareceu",   className: "bg-destructive text-destructive-foreground border-destructive font-semibold ring-2 ring-destructive/40" },
};

const SEV_META = {
  1: { label: "Severidade 1", icon: ShieldAlert,    badge: "border-destructive text-destructive" },
  2: { label: "Severidade 2", icon: AlertTriangle,  badge: "border-warning text-warning" },
  3: { label: "Severidade 3", icon: Info,           badge: "text-muted-foreground" },
} as const;

function formatDataHora(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

type TratarResp = {
  ok: boolean;
  erro?: string | null;
  classe?: string | null;
  cliente?: string | null;
  valor?: number | null;
  situacao_antes?: Situacao | null;
  situacao_depois?: Situacao | null;
  propaga_para_proximos_lotes?: boolean | null;
};

type SnapshotResp = {
  ok: boolean;
  erro?: string | null;
  lote_id?: string | null;
  gerado_em?: string | null;
  total?: number | null;
  abertos?: number | null;
  reaparecidos?: number | null;
  herdados?: number | null;
};

export default function AuditoriaFinanceira() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [busca, setBusca] = useState("");
  const [sevFiltro, setSevFiltro] = useState<string>("todas");
  const [classeFiltro, setClasseFiltro] = useState<string>("todas");
  const [fonteFiltro, setFonteFiltro] = useState<string>("todas");
  const [meioFiltro, setMeioFiltro] = useState<string>("todos");
  const [situacaoFiltro, setSituacaoFiltro] = useState<string>("aberto");
  const [mostrarFalsoPositivo, setMostrarFalsoPositivo] = useState(false);
  const [visao, setVisao] = useState<"classe" | "pedido">("classe");

  // Contexto expansível: só os achados abertos disparam as views caras.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const alternarExpandido = (id: string, aberto: boolean) =>
    setExpandidos((cur) => {
      const next = new Set(cur);
      if (aberto) next.add(id);
      else next.delete(id);
      return next;
    });

  const [tratar, setTratar] = useState<Achado | null>(null);
  const [novaSituacao, setNovaSituacao] = useState<"em_analise" | "resolvido" | "explicado">("em_analise");
  const [nota, setNota] = useState("");

  const { data: loteBruto = [], isLoading } = useQuery({
    queryKey: ["auditoria-lote-atual"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_auditoria_lote_enriquecido")
        .select("*");
      if (error) throw error;
      return (data ?? []) as Achado[];
    },
  });

  const geradoEm = loteBruto[0]?.gerado_em ?? null;

  // Hipóteses: view barata, buscada inteira uma vez e virada em mapa.
  const { principal: hipPrincipal } = useHipoteseMap();

  const totalFalsoPositivo = useMemo(
    () => loteBruto.filter((a) => a.falso_positivo_sem_caixa === true).length,
    [loteBruto]
  );

  // Falso positivo por natureza sai da fila por default.
  const lote = useMemo(
    () => (mostrarFalsoPositivo ? loteBruto : loteBruto.filter((a) => a.falso_positivo_sem_caixa !== true)),
    [loteBruto, mostrarFalsoPositivo]
  );

  const contadores = useMemo(() => {
    const c = { aberto: 0, em_analise: 0, resolvido: 0, explicado: 0, reaparecido: 0 } as Record<Situacao, number>;
    for (const a of lote) {
      const s = (a.situacao ?? "aberto") as Situacao;
      if (s in c) c[s] += 1;
    }
    return c;
  }, [lote]);

  const contadoresSev = useMemo(() => {
    const c: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    for (const a of lote) {
      const s = a.severidade;
      if (s === 1 || s === 2 || s === 3) c[s] += 1;
    }
    return c;
  }, [lote]);

  /**
   * Cascata de filtros: as opções de cada filtro são calculadas sobre o
   * conjunto filtrado por TODOS os outros filtros, exceto ele mesmo.
   * Assim o operador nunca fica preso num recorte vazio.
   */
  const passa = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (a: Achado, ignorar?: "classe" | "fonte" | "meio" | "situacao") => {
      if (sevFiltro !== "todas" && String(a.severidade ?? "") !== sevFiltro) return false;
      if (ignorar !== "classe" && classeFiltro !== "todas" && (a.classe ?? "") !== classeFiltro) return false;
      if (ignorar !== "fonte" && fonteFiltro !== "todas" && String(a.fonte ?? "") !== fonteFiltro) return false;
      if (ignorar !== "meio" && meioFiltro !== "todos" && (a.meio_pagamento ?? "—") !== meioFiltro) return false;
      if (ignorar !== "situacao" && situacaoFiltro !== "todas" && (a.situacao ?? "aberto") !== situacaoFiltro) return false;
      if (!q) return true;
      return (
        (a.id_externo || "").toLowerCase().includes(q) ||
        (a.cliente || "").toLowerCase().includes(q) ||
        (a.detalhe || "").toLowerCase().includes(q)
      );
    };
  }, [busca, sevFiltro, classeFiltro, fonteFiltro, meioFiltro, situacaoFiltro]);

  const contar = (ignorar: "classe" | "fonte" | "meio" | "situacao", chave: (a: Achado) => string | null) => {
    const map = new Map<string, number>();
    for (const a of lote) {
      if (!passa(a, ignorar)) continue;
      const k = chave(a);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  };

  // Meio: universo = chips presentes no lote; contagem no recorte atual.
  // Critério = flags do título (não o rótulo colapsado). Um achado misto conta
  // em mais de um chip, então a soma dos chips excede o total — é esperado.
  const contadoresMeio = useMemo(() => {
    const universo = meiosNoLote(lote);
    const recorte = lote.filter((a) => passa(a, "meio"));
    return contarMeios(recorte, universo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote, passa]);


  const ordenarPorContagem = (map: Map<string, number>, label: (k: string) => string) =>
    Array.from(map.entries()).sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return label(a[0]).localeCompare(label(b[0]), "pt-BR");
    });

  const classesDisponiveis = useMemo(
    () => ordenarPorContagem(contar("classe", (a) => a.classe), labelClasse),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lote, passa]
  );

  const fontesDisponiveis = useMemo(
    () => ordenarPorContagem(contar("fonte", (a) => (a.fonte ? String(a.fonte) : null)), (f) => FONTE_LABEL[f] ?? f),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lote, passa]
  );

  const situacoesDisponiveis = useMemo(() => {
    const cont = contar("situacao", (a) => String(a.situacao ?? "aberto"));
    return (["aberto", "em_analise", "resolvido", "explicado", "reaparecido"] as const)
      .map((s) => [s, cont.get(s) ?? 0] as [Situacao, number])
      .filter(([, n]) => n > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote, passa]);

  // Auto-limpeza: filtro que deixou de existir nas opções volta ao default.
  useEffect(() => {
    if (classeFiltro !== "todas" && !classesDisponiveis.some(([c]) => c === classeFiltro)) {
      setClasseFiltro("todas");
      toast.info(`Filtro de classe limpo: não há achados de ${labelClasse(classeFiltro)} em ${labelMeio(meioFiltro)}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classesDisponiveis]);

  useEffect(() => {
    if (fonteFiltro !== "todas" && !fontesDisponiveis.some(([f]) => f === fonteFiltro)) {
      setFonteFiltro("todas");
      toast.info(`Filtro de fonte limpo: não há achados de ${FONTE_LABEL[fonteFiltro] ?? fonteFiltro} em ${labelMeio(meioFiltro)}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontesDisponiveis]);

  useEffect(() => {
    if (situacaoFiltro !== "todas" && !situacoesDisponiveis.some(([s]) => s === situacaoFiltro)) {
      setSituacaoFiltro("todas");
      toast.info(`Filtro de situação limpo: não há achados de ${SITUACAO_META[situacaoFiltro as Situacao]?.label ?? situacaoFiltro} em ${labelMeio(meioFiltro)}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacoesDisponiveis]);

  const filtrosSujos =
    busca.trim() !== "" ||
    sevFiltro !== "todas" ||
    classeFiltro !== "todas" ||
    fonteFiltro !== "todas" ||
    meioFiltro !== "todos" ||
    situacaoFiltro !== "aberto";

  const limparFiltros = () => {
    setBusca("");
    setSevFiltro("todas");
    setClasseFiltro("todas");
    setFonteFiltro("todas");
    setMeioFiltro("todos");
    setSituacaoFiltro("aberto");
  };

  const filtrados = useMemo(
    () => lote.filter((a) => passa(a)),
    [lote, passa]
  );


  const grupos = useMemo(() => {
    const map = new Map<string, { classe: string; severidade: number; itens: Achado[]; total: number }>();
    for (const a of filtrados) {
      const key = a.classe || "—";
      const g = map.get(key) ?? {
        classe: key,
        severidade: a.severidade ?? 99,
        itens: [] as Achado[],
        total: 0,
      };
      g.itens.push(a);
      g.total += Number(a.valor || 0);
      g.severidade = Math.min(g.severidade, a.severidade ?? 99);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.severidade !== b.severidade) return a.severidade - b.severidade;
      return b.total - a.total;
    });
  }, [filtrados]);

  const gruposPedido = useMemo(() => {
    const map = new Map<string, {
      pedido_id: string | null;
      id_externo: string | null;
      cliente: string | null;
      meio: string | null;
      achadosNoPedido: number;
      piorSeveridade: number;
      itens: Achado[];
      total: number;
    }>();
    for (const a of filtrados) {
      const key = a.pedido_id || a.id_externo || a.id;
      const g = map.get(key) ?? {
        pedido_id: a.pedido_id,
        id_externo: a.id_externo,
        cliente: a.cliente,
        meio: a.meio_pagamento,
        achadosNoPedido: a.achados_no_pedido ?? 0,
        piorSeveridade: a.pior_severidade_pedido ?? a.severidade ?? 99,
        itens: [] as Achado[],
        total: 0,
      };
      g.itens.push(a);
      g.total += Number(a.valor || 0);
      g.achadosNoPedido = Math.max(g.achadosNoPedido, a.achados_no_pedido ?? 0);
      g.piorSeveridade = Math.min(g.piorSeveridade, a.pior_severidade_pedido ?? a.severidade ?? 99);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.achadosNoPedido !== b.achadosNoPedido) return b.achadosNoPedido - a.achadosNoPedido;
      if (a.piorSeveridade !== b.piorSeveridade) return a.piorSeveridade - b.piorSeveridade;
      return b.total - a.total;
    });
  }, [filtrados]);

  // Achados vinculados: outros achados do MESMO pedido (base do lote visível).
  const porPedido = useMemo(() => {
    const map = new Map<string, Achado[]>();
    for (const a of lote) {
      if (!a.pedido_id) continue;
      const arr = map.get(a.pedido_id) ?? [];
      arr.push(a);
      map.set(a.pedido_id, arr);
    }
    return map;
  }, [lote]);


  const mTratar = useMutation({
    mutationFn: async (args: {
      achado_id: string;
      situacao: "em_analise" | "resolvido" | "explicado";
      nota: string | null;
    }) => {
      const { data, error } = await supabase.rpc("tratar_achado_auditoria" as never, {
        p_achado_id: args.achado_id,
        p_situacao: args.situacao,
        p_nota: args.nota,
        p_user_id: user?.id ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as TratarResp;
    },
    onSuccess: (resp) => {
      if (!resp?.ok) {
        toast.error(resp?.erro || "Não foi possível tratar o achado.");
        return;
      }
      const linha = `${labelClasse(resp.classe ?? null)} · ${resp.cliente ?? "—"}`;
      const transicao = `${SITUACAO_META[(resp.situacao_antes ?? "aberto") as Situacao]?.label ?? resp.situacao_antes} → ${SITUACAO_META[(resp.situacao_depois ?? "aberto") as Situacao]?.label ?? resp.situacao_depois}`;
      const extra = resp.propaga_para_proximos_lotes
        ? " A explicação passa a valer nos próximos lotes."
        : "";
      toast.success(`${linha} — ${transicao}.${extra}`);
      qc.invalidateQueries({ queryKey: ["auditoria-lote-atual"] });
      setTratar(null);
      setNota("");
    },
    onError: (err) => {
      toast.error(formatError(err));
    },
  });

  const mGerar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("gerar_snapshot_auditoria" as never, {
        p_user_id: user?.id ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as SnapshotResp;
    },
    onSuccess: (resp) => {
      if (!resp?.ok) {
        toast.error(resp?.erro || "Falha ao gerar novo lote.");
        return;
      }
      toast.success(
        `Novo lote gerado: ${resp.total ?? 0} achados, ${resp.abertos ?? 0} abertos, ${resp.reaparecidos ?? 0} reaparecidos.`
      );
      qc.invalidateQueries({ queryKey: ["auditoria-lote-atual"] });
    },
    onError: (err) => toast.error(formatError(err)),
  });

  const abrirTratar = (a: Achado) => {
    setTratar(a);
    setNovaSituacao("em_analise");
    setNota(a.nota ?? "");
  };

  const notaObrigatoria = novaSituacao === "explicado";
  const podeSalvar =
    !!tratar &&
    !mTratar.isPending &&
    (!notaObrigatoria || nota.trim().length > 0);

  /**
   * Linha de achado. `dentroDoPedido` esconde o cliente/pedido repetido
   * quando a visão já é agrupada por pedido.
   */
  const renderAchado = (a: Achado, dentroDoPedido = false) => {
    const sev = (a.severidade ?? 3) as 1 | 2 | 3;
    const sevMeta = SEV_META[sev] ?? SEV_META[3];
    const sitKey = (a.situacao ?? "aberto") as Situacao;
    const sitMeta = SITUACAO_META[sitKey] ?? SITUACAO_META.aberto;
    const falsoPositivo = a.falso_positivo_sem_caixa === true;

    // Achados vinculados no mesmo pedido
    const irmaos = (a.pedido_id ? porPedido.get(a.pedido_id) ?? [] : []).filter((o) => o.id !== a.id);
    const mesmaTela = a.tela_solucao
      ? irmaos.filter((o) => o.tela_solucao === a.tela_solucao)
      : [];
    const outraTela = irmaos.find((o) => o.tela_solucao && o.tela_solucao !== a.tela_solucao);

    const expandido = expandidos.has(a.id);

    // Precedência: a hipótese é do pedido específico; a classe é genérica.
    const hip = hipPrincipal(a.pedido_id, a.classe);
    const rotaFinal = hip?.rota || a.rota_solucao || null;
    const telaFinal = hip?.rota ? hip?.tela || null : a.tela_solucao || null;

    return (
      <Collapsible
        key={a.id}
        open={expandido}
        onOpenChange={(o) => alternarExpandido(a.id, o)}
        className={cn(falsoPositivo && "opacity-60")}
      >
        <div className="px-5 py-4 grid grid-cols-12 gap-3 items-start">

        <div className="col-span-12 md:col-span-2 space-y-1">
          <Badge variant="outline" className={cn("flex-shrink-0", sevMeta.badge)}>
            Sev {sev}
          </Badge>
          {dentroDoPedido && a.classe && (
            <div className="text-xs font-medium leading-snug">{labelClasse(a.classe)}</div>
          )}
          {a.estagio && <EstagioBadge estagio={a.estagio as EstagioPedido} />}
          {falsoPositivo && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="cursor-help">Sem caixa por natureza</Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Forma de pagamento que não gera movimento bancário — nunca terá prova. Está na fila
                  por limitação do detector.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="col-span-12 md:col-span-3 text-sm">
          {!dentroDoPedido && (
            <>
              <div className="truncate" title={a.cliente ?? ""}>
                {a.cliente || "—"}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span className="tabular-nums">{a.id_externo || "—"}</span>
                {a.pedido_id && (
                  <button
                    onClick={() => navigate(`/pedidos/${a.pedido_id}`)}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    abrir <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </div>
            </>
          )}
          <div className="text-sm font-medium tabular-nums mt-1">
            {formatBRL(Number(a.valor || 0))}
          </div>
          <div className="text-xs text-muted-foreground mt-1" title={a.meios_detalhe ?? ""}>
            {labelMeio(a.meio_pagamento)}
          </div>
        </div>
        <div className="col-span-12 md:col-span-4 space-y-2 text-sm">
          <div className="text-muted-foreground">{a.detalhe || "—"}</div>
          {hip ? (
            <HipoteseResumo h={hip} />
          ) : (
            a.acao && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-0.5">
                  Ação
                </div>
                <div className="leading-snug text-foreground">{a.acao}</div>
              </div>
            )
          )}
          {rotaFinal ? (
            <div className="space-y-1">
              <Button size="sm" variant="outline" onClick={() => navigate(rotaFinal)}>
                {hip?.rota ? `Ir para ${telaFinal || "tela de resolução"}` : a.rotulo_acao || "Abrir tela de resolução"}
                <ArrowUpRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
              <div className="text-xs text-muted-foreground">
                Resolve em: {telaFinal || "—"}
              </div>
              {a.rota_observacao && (
                <div className="text-xs text-muted-foreground">{a.rota_observacao}</div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Sem tela de resolução mapeada — tratar manualmente.
            </div>
          )}
          {mesmaTela.length > 0 && (
            <div className="text-xs text-emerald-700">
              Resolver aqui deve fechar também:{" "}
              {mesmaTela.map((o) => labelClasse(o.classe)).join(", ")}
            </div>
          )}
          {outraTela && (
            <div className="text-xs text-amber-700">
              Este pedido tem outro achado que se resolve em {outraTela.tela_solucao}
            </div>
          )}
          {a.nota && (
            <div className="text-xs text-muted-foreground italic border-l-2 pl-2 border-border">
              Nota: {a.nota}
            </div>
          )}
        </div>
        <div className="col-span-12 md:col-span-3 flex flex-col gap-2 items-start md:items-end">
          <Badge variant="outline" className={cn("border", sitMeta.className)}>
            {sitMeta.label}
          </Badge>
          <div className="flex items-center gap-2">
            {a.pedido_id && (
              <CollapsibleTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  aria-label={expandido ? "Recolher contexto" : "Ver contexto do pedido"}
                >
                  Contexto
                  <ChevronDown
                    className={cn("h-4 w-4 ml-1 transition-transform", expandido && "rotate-180")}
                  />
                </Button>
              </CollapsibleTrigger>
            )}
            <Button size="sm" variant="outline" onClick={() => abrirTratar(a)}>
              Tratar
            </Button>
          </div>
          {a.tratado_em && (
            <div className="text-[10px] text-muted-foreground">
              Tratado em {formatDataHora(a.tratado_em)}
            </div>
          )}
        </div>
        </div>
        {a.pedido_id && (
          <CollapsibleContent className="px-5 pb-4">
            <DossieAchado pedidoId={a.pedido_id} aberto={expandido} />
          </CollapsibleContent>
        )}
      </Collapsible>
    );
  };


  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria Financeira</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lote congelado de{" "}
            <span className="font-medium text-foreground">{formatDataHora(geradoEm)}</span>. Trabalhe pelas situações; um novo
            lote propaga o que já foi explicado.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={mGerar.isPending}>
              {mGerar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Gerar novo lote
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Gerar novo lote de auditoria</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    O lote atual será substituído por um novo congelamento da malha financeira.
                  </p>
                  <p>
                    Achados marcados como <strong>explicado</strong> se propagam automaticamente.
                    Achados marcados como <strong>resolvido</strong> que voltarem a aparecer entram
                    como <strong>reaparecido</strong> — sinal de que o problema não foi de fato encerrado.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => mGerar.mutate()}>
                Gerar novo lote
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Aviso obrigatório sobre não-somabilidade */}
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
        <div className="flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-foreground">
              Os valores destas classes não somam entre si.
            </div>
            <div className="text-muted-foreground leading-relaxed">
              São naturezas diferentes de dinheiro: <strong>recebível fora da cobrança</strong> é
              dinheiro possivelmente não perseguido; <strong>pago sem prova</strong> e{" "}
              <strong>recebido escondido</strong> são dinheiro já recebido com rastro faltando;{" "}
              <strong>faturar remessa</strong> é receita ainda a faturar. Somar tudo daria um total
              sem significado — trabalhe classe por classe.
            </div>
          </div>
        </div>
      </div>

      {/* Cards de severidade — apenas contagem (dinheiro não soma entre classes) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {([1, 2, 3] as const).map((s) => {
          const meta = {
            1: { label: "Risco imediato", icon: ShieldAlert, card: "border-destructive/40 bg-destructive/5", active: "ring-2 ring-destructive", icone: "text-destructive" },
            2: { label: "Furo de faturamento", icon: AlertTriangle, card: "border-warning/40 bg-warning/5", active: "ring-2 ring-warning", icone: "text-warning" },
            3: { label: "Rastreabilidade", icon: Info, card: "border-border bg-muted/30", active: "ring-2 ring-muted-foreground", icone: "text-muted-foreground" },
          }[s];
          const Icon = meta.icon;
          const ativo = sevFiltro === String(s);
          return (
            <Card
              key={s}
              onClick={() => setSevFiltro((cur) => (cur === String(s) ? "todas" : String(s)))}
              className={cn("cursor-pointer transition-all border", meta.card, ativo && meta.active)}
            >
              <CardContent className="p-5 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Severidade {s}</div>
                  <div className="text-base font-medium">{meta.label}</div>
                  <div className="text-2xl font-bold tabular-nums">{contadoresSev[s]}</div>
                </div>
                <Icon className={cn("h-6 w-6 flex-shrink-0", meta.icone)} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Contadores por situação */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(["aberto", "em_analise", "resolvido", "explicado", "reaparecido"] as const).map((s) => {
          const meta = SITUACAO_META[s];
          const ativo = situacaoFiltro === s;
          return (
            <Card
              key={s}
              onClick={() => setSituacaoFiltro((cur) => (cur === s ? "todas" : s))}
              className={cn(
                "cursor-pointer transition-all border",
                ativo && "ring-2 ring-primary",
                s === "reaparecido" && contadores[s] > 0 && "border-destructive/60 bg-destructive/5"
              )}
            >
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {meta.label}
                </div>
                <div
                  className={cn(
                    "text-2xl font-bold tabular-nums mt-1",
                    s === "reaparecido" && contadores[s] > 0 && "text-destructive"
                  )}
                >
                  {contadores[s]}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Contagem por meio de pagamento — clicável */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
          Meio de pagamento
        </span>
        {contadoresMeio.map(([m, n]) => (
          <Badge
            key={m}
            variant={meioFiltro === m ? "default" : "outline"}
            className={cn("tabular-nums", n === 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}
            onClick={() => {
              if (n === 0) return;
              setMeioFiltro((cur) => (cur === m ? "todos" : m));
            }}
          >
            {labelMeio(m)} ({n})
          </Badge>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-start sm:items-center">
        <Input
          placeholder="Buscar por pedido, cliente ou detalhe…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <Select value={classeFiltro} onValueChange={setClasseFiltro}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Classe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as classes</SelectItem>
            {classesDisponiveis.map(([c, n]) => (
              <SelectItem key={c} value={c}>{labelClasse(c)} ({n})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fonteFiltro} onValueChange={setFonteFiltro}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Fonte" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as fontes</SelectItem>
            {fontesDisponiveis.map(([f, n]) => (
              <SelectItem key={f} value={f}>{(FONTE_LABEL[f] ?? f)} ({n})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={meioFiltro} onValueChange={setMeioFiltro}>
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="Meio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meios</SelectItem>
            {contadoresMeio.map(([m, n]) => (
              <SelectItem key={m} value={m} disabled={n === 0}>{labelMeio(m)} ({n})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={situacaoFiltro} onValueChange={setSituacaoFiltro}>
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas situações</SelectItem>
            {situacoesDisponiveis.map(([s, n]) => (
              <SelectItem key={s} value={s}>{SITUACAO_META[s].label} ({n})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="text-sm text-muted-foreground tabular-nums">
            {filtrados.length} de {lote.length} achados
          </div>
          {filtrosSujos && (
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          )}
        </div>

      </div>

      {/* Visão e falsos positivos */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Agrupar</span>
          <Button
            size="sm"
            variant={visao === "classe" ? "default" : "outline"}
            onClick={() => setVisao("classe")}
          >
            Por classe
          </Button>
          <Button
            size="sm"
            variant={visao === "pedido" ? "default" : "outline"}
            onClick={() => setVisao("pedido")}
          >
            Por pedido
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="mostrar-falso-positivo"
            checked={mostrarFalsoPositivo}
            onCheckedChange={setMostrarFalsoPositivo}
          />
          <Label htmlFor="mostrar-falso-positivo" className="text-sm text-muted-foreground cursor-pointer">
            Mostrar falsos positivos ({totalFalsoPositivo})
          </Label>
        </div>
      </div>


      {/* Lista */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-8 text-center">Carregando…</div>
      ) : filtrados.length === 0 ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-10 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <div className="text-lg font-medium">Tudo limpo por aqui.</div>
            <div className="text-sm text-muted-foreground max-w-md">
              Nenhum achado casa com os filtros atuais. Ajuste os filtros ou gere um novo lote.
            </div>
          </CardContent>
        </Card>
      ) : visao === "classe" ? (
        <div className="space-y-6">
          {grupos.map((g) => (
            <Card key={g.classe} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b bg-muted/40">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "flex-shrink-0",
                      g.severidade === 1 && "border-destructive text-destructive",
                      g.severidade === 2 && "border-warning text-warning",
                      g.severidade === 3 && "text-muted-foreground"
                    )}
                  >
                    Sev {g.severidade}
                  </Badge>
                  <div className="font-semibold truncate">{labelClasse(g.classe)}</div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {g.itens.length} {g.itens.length === 1 ? "achado" : "achados"}
                  </span>
                </div>
                <div className="text-sm font-semibold tabular-nums flex-shrink-0">
                  {formatBRL(g.total)}
                </div>
              </div>
              <div className="divide-y">
                {g.itens.map((a) => renderAchado(a))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {gruposPedido.map((g, idx) => {
            const multiplos = g.achadosNoPedido >= 3;
            return (
              <Card
                key={g.pedido_id ?? g.id_externo ?? idx}
                className={cn("overflow-hidden", multiplos && "border-amber-500/50")}
              >
                <div className="px-5 py-3 border-b bg-muted/40 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
                      {g.pedido_id ? (
                        <button
                          onClick={() => navigate(`/pedidos/${g.pedido_id}`)}
                          className="font-semibold tabular-nums text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {g.id_externo || "—"} <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <span className="font-semibold tabular-nums">{g.id_externo || "—"}</span>
                      )}
                      <span className="text-sm text-muted-foreground truncate" title={g.cliente ?? ""}>
                        {g.cliente || "—"}
                      </span>
                      <Badge variant="outline" className="flex-shrink-0">
                        {g.achadosNoPedido} {g.achadosNoPedido === 1 ? "achado" : "achados"}
                      </Badge>
                      <Badge variant="secondary" className="flex-shrink-0">
                        {labelMeio(g.meio)}
                      </Badge>
                    </div>
                    <div className="text-sm font-semibold tabular-nums flex-shrink-0">
                      {formatBRL(g.total)}
                    </div>
                  </div>
                  {multiplos && (
                    <div className="text-xs text-muted-foreground">
                      Vários detectores apontando o mesmo pedido — pode ser um problema só visto de ângulos diferentes.
                    </div>
                  )}
                </div>
                <div className="divide-y">
                  {g.itens
                    .slice()
                    .sort((x, y) => (x.severidade ?? 99) - (y.severidade ?? 99))
                    .map((a) => renderAchado(a, true))}
                </div>
              </Card>
            );
          })}
        </div>
      )}


      {/* Dialog de tratamento */}
      <Dialog open={!!tratar} onOpenChange={(o) => { if (!o) { setTratar(null); setNota(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tratar achado</DialogTitle>
            <DialogDescription>
              {tratar ? `${labelClasse(tratar.classe)} · ${tratar.cliente ?? "—"} · ${formatBRL(Number(tratar.valor || 0))}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nova situação</label>
              <Select
                value={novaSituacao}
                onValueChange={(v) => setNovaSituacao(v as typeof novaSituacao)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_analise">Em análise</SelectItem>
                  <SelectItem value="resolvido">Resolvido</SelectItem>
                  <SelectItem value="explicado">Explicado (propaga para próximos lotes)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Nota {notaObrigatoria && <span className="text-destructive">*</span>}
              </label>
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder={
                  notaObrigatoria
                    ? "Explique por que este achado deve ser considerado explicado nos próximos lotes."
                    : "Opcional — contexto do tratamento."
                }
                rows={4}
              />
              {notaObrigatoria && (
                <p className="text-xs text-warning">
                  A explicação é obrigatória e passará a valer para este achado nos próximos lotes.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTratar(null)} disabled={mTratar.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={!podeSalvar}
              onClick={() =>
                tratar &&
                mTratar.mutate({
                  achado_id: tratar.id,
                  situacao: novaSituacao,
                  nota: nota.trim() ? nota.trim() : null,
                })
              }
            >
              {mTratar.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
