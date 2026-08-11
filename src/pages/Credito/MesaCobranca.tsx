import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format-currency";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, Send, Copy, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useReguaEtapas, resolverEtapaParaTitulo, type ReguaEtapa } from "@/hooks/credito/useReguaFila";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import { AcaoReguaDialog } from "@/components/credito/AcaoReguaDialog";
import { PausarReguaDialog } from "@/components/credito/PausarReguaDialog";
import { RenegociarTituloDialog } from "@/components/credito/RenegociarTituloDialog";
import { EnviarPacoteDialog } from "@/components/credito/EnviarPacoteDialog";

import { adaptarParaTitulo, type LinhaMesa } from "@/lib/financeiro/adaptar-titulo-mesa";
import {
  seloEntrega, seloInstrumento, seloEnvio, EntregaResumoInline,
  fmtDataMesa, fmtDataHoraMesa, textoUltimoEnvio, AVISO_PROVA_ENVIO,
} from "@/lib/financeiro/mesa-lastros";

/** Filas em que a régua opera dentro da Mesa (fusão Mesa × Régua). */
const FILAS_REGUA = new Set<string>(["A_COBRAR", "A_VENCER"]);




// ── Ordem de trabalho (fixa) ──
const FILAS: { chave: string; label: string }[] = [
  { chave: "ENTREGA_DEVOLVIDA", label: "Mercadoria devolvida" },
  { chave: "ENTREGA_PROBLEMA", label: "Problema na entrega" },
  { chave: "A_ENVIAR", label: "A enviar — NF + boleto + cópia do pedido" },
  { chave: "A_EMITIR_BOLETO", label: "A emitir boleto" },
  { chave: "A_REEMITIR_BOLETO", label: "A reemitir boleto" },
  { chave: "A_COBRAR", label: "A cobrar" },
  { chave: "EMAIL_BLOQUEADO", label: "Sem canal de e-mail" },
  { chave: "A_VENCER", label: "A vencer (D-3)" },
  { chave: "ENTREGA_ATRASADA", label: "Entrega atrasada" },
  { chave: "CONCILIAR", label: "Conciliar — não cobrar" },
  { chave: "BOLETO_EM_CURSO_BANCO", label: "Boleto em curso no banco" },
  { chave: "EM_CURSO", label: "Em curso" },
  { chave: "NAO_COBRAVEL", label: "Não cobrável" },
];

/** Filas de urgência ALTA — vão para o topo, acima de tudo que não seja vencido. */
const FILAS_URGENCIA_ALTA = new Set<string>(["ENTREGA_DEVOLVIDA", "ENTREGA_PROBLEMA"]);

const GRUPOS: Record<"agir" | "vigiar" | "nao", string[]> = {
  agir: ["ENTREGA_DEVOLVIDA", "ENTREGA_PROBLEMA", "A_ENVIAR", "A_EMITIR_BOLETO", "A_REEMITIR_BOLETO", "A_COBRAR", "EMAIL_BLOQUEADO"],
  vigiar: ["A_VENCER", "BOLETO_EM_CURSO_BANCO", "EM_CURSO"],
  nao: ["CONCILIAR", "ENTREGA_ATRASADA", "NAO_COBRAVEL"],
};

const NAO_COBRAR = new Set<string>(GRUPOS.nao);

/** Filas do bloco AGIR AGORA — usado também pelo badge da aba no hub. */
export const FILAS_AGIR_AGORA = GRUPOS.agir;

const FILAS_BOLETO = new Set<string>(["A_EMITIR_BOLETO", "A_REEMITIR_BOLETO"]);

const fmtData = fmtDataMesa;
const fmtDataHora = fmtDataHoraMesa;

// ── Agrupamento por pedido (mesmo padrão de gruposCliente do BancoSafra) ──
interface GrupoPedidoMesa {
  chave: string;
  cliente: string;
  pedido: string;
  parcelas: LinhaMesa[];
  instrumento: string;
  nf: string;
  total: number;
  /** Parcela mais urgente (maior dias_atraso) — dita vencimento, atraso e lastros. */
  urgente: LinhaMesa;
  ressalvas: string;
  abrirPorPadrao: boolean;
}

/** Maior dias_atraso de um conjunto de linhas (0 se nenhuma vencida). */
function maiorAtraso(rows: LinhaMesa[]): number {
  return rows.reduce((m, l) => Math.max(m, Number(l.dias_atraso ?? 0)), 0);
}

function agruparPorPedidoMesa(rows: LinhaMesa[]): GrupoPedidoMesa[] {
  const map = new Map<string, LinhaMesa[]>();
  const ordem: string[] = [];
  for (const l of rows) {
    const k = l.pedido_id ?? `sem-pedido:${l.titulo_id}`;
    if (!map.has(k)) { map.set(k, []); ordem.push(k); }
    map.get(k)!.push(l);
  }
  const grupos = ordem.map((k) => {
    // Dentro do grupo: parcela mais atrasada primeiro.
    const parcelas = [...map.get(k)!].sort(
      (a, b) => Number(b.dias_atraso ?? 0) - Number(a.dias_atraso ?? 0),
    );
    const instrumentos = Array.from(new Set(parcelas.map((p) => p.instrumento ?? "—")));
    const urgente = parcelas.reduce((a, b) =>
      Number(b.dias_atraso ?? 0) > Number(a.dias_atraso ?? 0) ? b : a,
    );
    const ressalvas = Array.from(
      new Set(parcelas.map((p) => (p.ressalvas ?? "").trim()).filter(Boolean)),
    ).join(" · ");
    return {
      chave: k,
      cliente: parcelas[0].nome_exibicao ?? "—",
      pedido: parcelas[0].pedido ?? "—",
      parcelas,
      instrumento: instrumentos.length === 1 ? instrumentos[0] : "misto",
      nf: parcelas.find((p) => p.nf_numero)?.nf_numero ?? "—",
      total: parcelas.reduce((s, p) => s + Number(p.valor_atual ?? 0), 0),
      urgente,
      ressalvas,
      abrirPorPadrao: parcelas.some((p) => Number(p.dias_atraso ?? 0) > 0),
    };
  });
  // Pedido mais atrasado primeiro.
  return grupos.sort((a, b) => maiorAtraso(b.parcelas) - maiorAtraso(a.parcelas));
}

function TextoAtraso({ dias }: { dias: number }) {
  return dias > 0 ? (
    <span className="text-destructive">{dias}d em atraso</span>
  ) : (
    <span className="text-muted-foreground">vence em {Math.abs(dias)}d</span>
  );
}

// ── Página ──
interface MesaCobrancaProps {
  /** Navega o hub para Banco → Remessas Safra. Se ausente, o link não é renderizado. */
  onIrParaBanco?: () => void;
}

export default function MesaCobranca({ onIrParaBanco }: MesaCobrancaProps = {}) {
  const { toast } = useToast();

  const [busca, setBusca] = useState("");
  const [instrumentoF, setInstrumentoF] = useState("todos");
  const [filaF, setFilaF] = useState("todas");
  /** Cartão VENCIDO — única forma de filtrar atraso (o toggle "Só em atraso" foi removido). */
  const [soVencido, setSoVencido] = useState(false);
  const [grupoAtivo, setGrupoAtivo] = useState<keyof typeof GRUPOS | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>(
    () => Object.fromEntries(FILAS.map((f) => [f.chave, GRUPOS.agir.includes(f.chave)])),
  );
  /** Filas cujo estado de abertura o operador já mexeu (vence o default por vencido). */
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});
  const [detalhe, setDetalhe] = useState<LinhaMesa | null>(null);
  /** Diálogo de confirmação do envio do pacote (destinatário editável + CC). */
  const [pacote, setPacote] = useState<{ linha: LinhaMesa; total: number } | null>(null);

  /** Ação de régua em curso (título adaptado + etapa aplicável). */
  const [acaoRegua, setAcaoRegua] = useState<{
    titulo: TituloCobranca;
    etapa: ReguaEtapa | null;
    tipo: "enviada" | "pulada" | "pausar" | "renegociar";
  } | null>(null);

  const etapasQ = useReguaEtapas();
  const etapas = etapasQ.data ?? [];



  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["cobranca-mesa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_mesa")
        .select("*");
      if (error) throw error;
      return (data ?? []) as LinhaMesa[];
    },
  });

  const linhas = q.data ?? [];

  const instrumentos = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.instrumento).filter(Boolean))) as string[],
    [linhas],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (soVencido) {
        // Filtro transversal de vencidos: ignora o recorte por grupo de cartão.
        if (!((l.dias_atraso ?? 0) > 0)) return false;
      } else if (grupoAtivo && !GRUPOS[grupoAtivo].includes(l.fila ?? "")) return false;
      if (filaF !== "todas" && l.fila !== filaF) return false;
      if (instrumentoF !== "todos" && l.instrumento !== instrumentoF) return false;
      if (termo) {
        const alvo = [l.nome_exibicao, l.pedido, l.numero_titulo].join(" ").toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [linhas, busca, instrumentoF, filaF, soVencido, grupoAtivo]);

  const resumoGrupo = (grupo: keyof typeof GRUPOS) => {
    const alvo = linhas.filter((l) => GRUPOS[grupo].includes(l.fila ?? ""));
    return { qtd: alvo.length, soma: alvo.reduce((s, l) => s + Number(l.valor_atual ?? 0), 0) };
  };

  /** Vencidos: transversal a todas as filas. */
  const resumoVencido = useMemo(() => {
    const alvo = linhas.filter((l) => (l.dias_atraso ?? 0) > 0);
    return { qtd: alvo.length, soma: alvo.reduce((s, l) => s + Number(l.valor_atual ?? 0), 0) };
  }, [linhas]);

  const porFila = useMemo(() => {
    const map: Record<string, LinhaMesa[]> = Object.fromEntries(FILAS.map((f) => [f.chave, []]));
    for (const l of filtradas) {
      const k = l.fila ?? "";
      if (!map[k]) map[k] = [];
      map[k].push(l);
    }
    return map;
  }, [filtradas]);

  /** Ordem por urgência: filas com vencido primeiro (mais atrasada no topo); demais mantêm a ordem de trabalho. */
  const filasOrdenadas = useMemo(() => {
    return FILAS.map((f, i) => {
      const rows = porFila[f.chave] ?? [];
      const vencidas = rows.filter((l) => (l.dias_atraso ?? 0) > 0);
      return {
        ...f,
        rows,
        qtdVencido: vencidas.length,
        totalVencido: vencidas.reduce((s, l) => s + Number(l.valor_atual ?? 0), 0),
        maxAtraso: maiorAtraso(rows),
        urgenciaAlta: FILAS_URGENCIA_ALTA.has(f.chave) && rows.length > 0,
        ordemBase: i,
      };
    }).sort((a, b) => {
      const av = a.qtdVencido > 0 ? 1 : 0;
      const bv = b.qtdVencido > 0 ? 1 : 0;
      if (av !== bv) return bv - av;
      if (av === 1 && a.maxAtraso !== b.maxAtraso) return b.maxAtraso - a.maxAtraso;
      // Sem vencido: filas de urgência alta (entrega devolvida / problema) vêm antes.
      const au = a.urgenciaAlta ? 1 : 0;
      const bu = b.urgenciaAlta ? 1 : 0;
      if (av === 0 && au !== bu) return bu - au;
      return a.ordemBase - b.ordemBase;
    });
  }, [porFila]);


  const abrirEnviarPacote = (l: LinhaMesa, totalPedido: number) => {
    if (!l.pedido_id) {
      toast({ title: "Sem pedido vinculado", description: "Não é possível enviar o pacote.", variant: "destructive" });
      return;
    }
    setPacote({ linha: l, total: totalPedido });
  };


  const copiarLinha = async (linha: string) => {
    try {
      await navigator.clipboard.writeText(linha);
      toast({ title: "Linha digitável copiada" });
    } catch (e: any) {
      toast({ title: "Não foi possível copiar", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const cards: { chave: keyof typeof GRUPOS; titulo: string }[] = [
    { chave: "agir", titulo: "AGIR AGORA" },
    { chave: "vigiar", titulo: "VIGIAR" },
    { chave: "nao", titulo: "NÃO É COBRANÇA" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {q.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Erro ao carregar a mesa: {(q.error as any)?.message ?? "erro desconhecido"}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Link
            to="/credito/regua-etapas"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Configurar etapas da régua →
          </Link>
        </div>

        {/* Cartões-resumo */}
        <div className="grid gap-3 sm:grid-cols-4">
          {/* VENCIDO — transversal a todas as filas, primeiro da fila visual. */}
          <Card
            onClick={() => { setSoVencido((v) => !v); setGrupoAtivo(null); }}
            className={`cursor-pointer transition ${
              soVencido ? "ring-2 ring-destructive" : "hover:bg-muted/50"
            } ${
              resumoVencido.qtd > 0
                ? "border-destructive bg-destructive/10"
                : "border-muted bg-muted/30 opacity-70"
            }`}
          >
            <CardContent className="p-3">
              <div
                className={`text-[11px] font-semibold tracking-wide ${
                  resumoVencido.qtd > 0 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                VENCIDO
              </div>
              {resumoVencido.qtd > 0 ? (
                <>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums text-destructive">
                      {resumoVencido.qtd}
                    </span>
                    <span className="text-xs text-muted-foreground">títulos</span>
                  </div>
                  <div className="text-sm font-medium tabular-nums text-destructive">
                    {formatBRL(resumoVencido.soma)}
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-1 text-sm text-muted-foreground">nenhum vencido</div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {formatBRL(0)}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {cards.map((c) => {
            const r = resumoGrupo(c.chave);
            const ativo = !soVencido && grupoAtivo === c.chave;
            return (
              <Card
                key={c.chave}
                onClick={() => { setSoVencido(false); setGrupoAtivo(ativo ? null : c.chave); }}
                className={`cursor-pointer transition ${ativo ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
              >
                <CardContent className="p-3">
                  <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">{c.titulo}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums">{r.qtd}</span>
                    <span className="text-xs text-muted-foreground">títulos</span>
                  </div>
                  <div className="text-sm tabular-nums">{formatBRL(r.soma)}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>


        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Cliente, pedido ou título"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select value={instrumentoF} onValueChange={setInstrumentoF}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Instrumento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os instrumentos</SelectItem>
              {instrumentos.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filaF} onValueChange={setFilaF}>
            <SelectTrigger className="h-9 w-[240px]"><SelectValue placeholder="Fila" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as filas</SelectItem>
              {FILAS.map((f) => <SelectItem key={f.chave} value={f.chave}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {soVencido && (
            <span className="text-xs text-destructive">Mostrando só títulos vencidos</span>
          )}
        </div>



        {/* Grupos */}
        {q.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {filasOrdenadas.map((f) => {
              const rows = f.rows;
              const soma = rows.reduce((s, l) => s + Number(l.valor_atual ?? 0), 0);
              const acao = rows.find((r) => r.acao_sugerida)?.acao_sugerida ?? null;
              const naoCobrar = NAO_COBRAR.has(f.chave);
              // Fila com vencido nasce expandida; depois respeita o clique do operador.
              const aberto = tocados[f.chave] ? !!abertos[f.chave] : f.qtdVencido > 0 || !!abertos[f.chave];
              return (
                <Collapsible
                  key={f.chave}
                  open={aberto}
                  onOpenChange={(o) => {
                    setAbertos((p) => ({ ...p, [f.chave]: o }));
                    setTocados((p) => ({ ...p, [f.chave]: true }));
                  }}
                  className={`rounded-md border ${f.qtdVencido > 0 ? "border-destructive/50" : ""}`}
                >
                  <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
                    <ChevronDown className={`h-4 w-4 shrink-0 transition ${aberto ? "" : "-rotate-90"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{f.label}</span>
                        <Badge variant="secondary" className="tabular-nums">{rows.length}</Badge>
                        <span className="text-xs tabular-nums text-muted-foreground">{formatBRL(soma)}</span>
                        {f.qtdVencido > 0 && (
                          <Badge className="shrink-0 bg-red-100 text-red-800 hover:bg-red-100 text-[10px]">
                            {f.qtdVencido} vencido{f.qtdVencido > 1 ? "s" : ""} · {formatBRL(f.totalVencido)}
                          </Badge>
                        )}
                      </div>

                      {acao && <div className="truncate text-xs text-muted-foreground">{acao}</div>}
                      {naoCobrar && (
                        <div className="text-xs text-warning">Estes títulos não devem ser cobrados do cliente.</div>
                      )}
                      {onIrParaBanco && FILAS_BOLETO.has(f.chave) && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="mt-0.5 inline-block cursor-pointer text-xs text-primary underline-offset-2 hover:underline"
                          onClick={(e) => { e.stopPropagation(); onIrParaBanco(); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onIrParaBanco(); }
                          }}
                        >
                          Ir para Banco → Remessas Safra
                        </span>
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {rows.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Fila limpa.</div>
                    ) : (
                      <div className="space-y-1.5 p-2">
                        {agruparPorPedidoMesa(rows).map((g) => {
                          const chaveGrupo = `${f.chave}:${g.chave}`;
                          const aberto = gruposAbertos[chaveGrupo] ?? g.abrirPorPadrao;
                          const atrasoUrgente = Number(g.urgente.dias_atraso ?? 0);
                          return (
                            <Collapsible
                              key={chaveGrupo}
                              open={aberto}
                              onOpenChange={(o) => setGruposAbertos((p) => ({ ...p, [chaveGrupo]: o }))}
                              className="rounded-md border"
                            >
                              <div className="flex items-center gap-2 px-2 py-1.5">
                                <CollapsibleTrigger asChild>
                                  <button className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left text-xs">
                                    <ChevronDown
                                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "" : "-rotate-90"}`}
                                    />
                                    <span className="truncate font-medium" title={g.cliente}>{g.cliente}</span>
                                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{g.pedido}</span>
                                    <Badge variant="outline" className="shrink-0 text-[10px]">
                                      {g.parcelas.length}
                                    </Badge>
                                    <span className="shrink-0 text-muted-foreground">{g.instrumento}</span>
                                    <span className="shrink-0 text-muted-foreground">NF {g.nf}</span>
                                    <span className="shrink-0 font-mono tabular-nums">{formatBRL(g.total)}</span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">
                                      {fmtData(g.urgente.vencimento)}
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                      <TextoAtraso dias={atrasoUrgente} />
                                    </span>
                                    <span className="flex shrink-0 flex-wrap items-center gap-1">
                                      {seloEntrega(g.urgente)}
                                      {seloInstrumento(g.urgente)}
                                      {seloEnvio(g.urgente)}
                                    </span>
                                    {g.ressalvas && (
                                      <span className="min-w-0 text-[10px] text-warning">{g.ressalvas}</span>
                                    )}
                                    <EntregaResumoInline l={g.urgente} className="min-w-0" />
                                  </button>
                                </CollapsibleTrigger>
                                {f.chave === "A_ENVIAR" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 shrink-0 text-xs"
                                    onClick={() => abrirEnviarPacote(g.urgente, Number(g.total ?? 0))}
                                  >
                                    <Send className="mr-1 h-3 w-3" />
                                    Enviar pacote
                                  </Button>
                                )}

                              </div>
                              <CollapsibleContent>
                                <div className="border-t px-2 pb-2">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="text-[11px]">
                                        <TableHead className="h-8">Título</TableHead>
                                        <TableHead className="h-8">Instrumento</TableHead>
                                        <TableHead className="h-8">NF</TableHead>
                                        <TableHead className="h-8 text-right">Valor</TableHead>
                                        <TableHead className="h-8">Vencimento</TableHead>
                                        <TableHead className="h-8">Atraso</TableHead>
                                        <TableHead className="h-8">Lastros</TableHead>
                                        <TableHead className="h-8">Ressalvas</TableHead>
                                        {FILAS_REGUA.has(f.chave) && (
                                          <TableHead className="h-8">Régua</TableHead>
                                        )}
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {g.parcelas.map((l) => {
                                        const tituloAdapt = FILAS_REGUA.has(f.chave) ? adaptarParaTitulo(l) : null;
                                        const etapa = tituloAdapt ? resolverEtapaParaTitulo(tituloAdapt, etapas) : null;
                                        return (
                                        <TableRow
                                          key={l.titulo_id}
                                          className="cursor-pointer text-xs"
                                          onClick={() => setDetalhe(l)}
                                        >
                                          <TableCell className="py-1.5">
                                            {l.numero_titulo ?? "—"}
                                            {l.numero_parcela && l.total_parcelas ? (
                                              <span className="text-muted-foreground"> {l.numero_parcela}/{l.total_parcelas}</span>
                                            ) : null}
                                          </TableCell>
                                          <TableCell className="py-1.5">{l.instrumento ?? "—"}</TableCell>
                                          <TableCell className="py-1.5">{l.nf_numero ?? "—"}</TableCell>
                                          <TableCell className="py-1.5 text-right tabular-nums">{formatBRL(Number(l.valor_atual ?? 0))}</TableCell>
                                          <TableCell className="py-1.5 tabular-nums">{fmtData(l.vencimento)}</TableCell>
                                          <TableCell className="py-1.5 tabular-nums">
                                            <TextoAtraso dias={Number(l.dias_atraso ?? 0)} />
                                          </TableCell>
                                          <TableCell className="py-1.5">
                                            <div className="flex flex-wrap items-center gap-1">
                                              {seloEntrega(l)}
                                              {seloInstrumento(l)}
                                              {seloEnvio(l)}
                                            </div>
                                          </TableCell>
                                          <TableCell className="py-1.5">
                                            {l.ressalvas && (
                                              <div className="text-[10px] text-warning">{l.ressalvas}</div>
                                            )}
                                            <EntregaResumoInline l={l} />
                                          </TableCell>
                                          {FILAS_REGUA.has(f.chave) && (
                                            <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                                              {!tituloAdapt || !etapa ? (
                                                <span className="text-[10px] text-muted-foreground">
                                                  sem ação de régua hoje
                                                </span>
                                              ) : (
                                                <div className="flex flex-wrap items-center gap-1">
                                                  <Badge variant="outline" className="text-[10px]">
                                                    {etapa.codigo} · {etapa.canal_sugerido}
                                                  </Badge>
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-6 px-2 text-[10px]"
                                                    onClick={() => setAcaoRegua({ titulo: tituloAdapt, etapa, tipo: "enviada" })}
                                                  >
                                                    Registrar ação
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 px-2 text-[10px]"
                                                    onClick={() => setAcaoRegua({ titulo: tituloAdapt, etapa, tipo: "pulada" })}
                                                  >
                                                    Pular
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 px-2 text-[10px]"
                                                    onClick={() => setAcaoRegua({ titulo: tituloAdapt, etapa, tipo: "pausar" })}
                                                  >
                                                    Pausar
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 px-2 text-[10px]"
                                                    onClick={() => setAcaoRegua({ titulo: tituloAdapt, etapa, tipo: "renegociar" })}
                                                  >
                                                    Renegociar
                                                  </Button>
                                                </div>
                                              )}
                                            </TableCell>
                                          )}
                                        </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Drawer somente-leitura */}
        <Sheet open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            {detalhe && (
              <>
                <SheetHeader>
                  <SheetTitle className="text-base">
                    {detalhe.numero_titulo ?? "Título"}{" "}
                    {detalhe.numero_parcela && detalhe.total_parcelas
                      ? `· ${detalhe.numero_parcela}/${detalhe.total_parcelas}`
                      : ""}
                  </SheetTitle>
                  <SheetDescription>{detalhe.nome_exibicao ?? "—"}</SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-2 text-xs">
                  {[
                    ["Pedido", detalhe.pedido ?? "—"],
                    ["Nome canônico", detalhe.nome_canonico ?? "—"],
                    ["Apelido", detalhe.apelido ?? "—"],
                    ["E-mail", detalhe.email_cliente ?? "—"],
                    ["Instrumento", detalhe.instrumento ?? "—"],
                    ["Valor atual", formatBRL(Number(detalhe.valor_atual ?? 0))],
                    ["Vencimento", fmtData(detalhe.vencimento)],
                    ["Dias de atraso", String(detalhe.dias_atraso ?? 0)],
                    ["Status do boleto", detalhe.boleto_status ?? "—"],
                    ["Estágio", detalhe.estagio ?? "—"],
                    ["Faturado em", fmtDataHora(detalhe.faturado_em)],
                    ["NF", detalhe.nf_numero ?? "—"],
                    ["Último envio", textoUltimoEnvio(detalhe)],
                    ["E-mail de cobrança em", fmtDataHora(detalhe.email_cobranca_enviado_em)],
                    ["Próxima ação (régua)", fmtData(detalhe.data_proxima_acao_regua)],
                    ["Régua pausada", detalhe.pausa_regua_automatica ? "sim" : "não"],
                    ["Lastro entrega", detalhe.lastro_entrega ?? "—"],
                    ["Estado do funil de entrega", detalhe.entrega_funil_estado ?? "—"],
                    ["Transportadora", detalhe.entrega_transportadora ?? "—"],
                    ["Ocorrência", [detalhe.entrega_ocorrencia_codigo, detalhe.entrega_ocorrencia_texto].filter(Boolean).join(" ") || "—"],
                    ["Data da entrega", fmtData(detalhe.entrega_data)],
                    ["Previsão de entrega", fmtData(detalhe.entrega_previsao)],
                    ["Recebedor", detalhe.entrega_recebedor ? `recebido por: ${detalhe.entrega_recebedor}` : "—"],
                    ["Reembarcada após devolução", detalhe.entrega_reembarcada ? "sim" : "não"],
                    ["Entregue método", detalhe.entregue_metodo ?? "—"],
                    ["Entregue em", fmtDataHora(detalhe.entregue_em)],
                    ["Lastro instrumento", detalhe.lastro_instrumento ?? "—"],
                    ["Lastro envio", detalhe.lastro_envio ?? "—"],
                    ["Envio falhou em", fmtData(detalhe.envio_falhou_em)],
                    ["Motivo da falha de envio", detalhe.envio_falha_motivo ?? "—"],
                    ["Fila", detalhe.fila ?? "—"],
                    ["Ação sugerida", detalhe.acao_sugerida ?? "—"],
                    ["Ressalvas", detalhe.ressalvas ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3 border-b py-1">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-right font-medium">{v}</span>
                    </div>
                  ))}
                  {detalhe.linha_digitavel && (
                    <div className="pt-2">
                      <div className="text-muted-foreground">Linha digitável</div>
                      <div className="mt-1 flex items-start gap-2">
                        <code className="break-all rounded bg-muted px-2 py-1">{detalhe.linha_digitavel}</code>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={() => { void copiarLinha(detalhe.linha_digitavel!); }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="pt-2 text-[10px] leading-snug text-muted-foreground">{AVISO_PROVA_ENVIO}</p>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Régua operacional dentro da Mesa */}
        {acaoRegua && (acaoRegua.tipo === "enviada" || acaoRegua.tipo === "pulada") && (
          <AcaoReguaDialog
            titulo={acaoRegua.titulo}
            etapa={acaoRegua.etapa}
            modo={acaoRegua.tipo}
            open
            onClose={() => setAcaoRegua(null)}
          />
        )}
        {acaoRegua && acaoRegua.tipo === "pausar" && (
          <PausarReguaDialog
            titulo={acaoRegua.titulo}
            etapa={acaoRegua.etapa}
            open
            onClose={() => setAcaoRegua(null)}
          />
        )}
        {acaoRegua && acaoRegua.tipo === "renegociar" && (
          <RenegociarTituloDialog
            titulo={acaoRegua.titulo}
            etapa={acaoRegua.etapa}
            open
            onClose={() => setAcaoRegua(null)}
          />
        )}

        <EnviarPacoteDialog
          linha={pacote?.linha ?? null}
          valorTotalPedido={pacote?.total ?? null}
          open={!!pacote}
          onOpenChange={(v) => { if (!v) setPacote(null); }}
          onEnviado={async () => { await q.refetch(); }}
        />

      </div>
    </TooltipProvider>
  );
}
