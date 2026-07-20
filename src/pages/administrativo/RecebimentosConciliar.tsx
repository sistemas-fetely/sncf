import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowDownToLine,
  Inbox,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Upload,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { toast } from "sonner";
import { ImportarExtratoDialog } from "@/components/financeiro/ImportarExtratoDialog";

type Credito = {
  id: string;
  data_transacao: string;
  descricao: string | null;
  valor: number;
  conta_bancaria_id: string | null;
  conta_nome: string | null;
};


type Sugestao = {
  titulo_id: string;
  numero_titulo: string | null;
  cliente: string | null;
  valor_atual: number;
  data_vencimento_atual: string | null;
  status: string;
  diff_valor: number;
  dias_distancia: number;
  score: number;
  nivel: string;
};

type Meio = "pix" | "cartao" | "cobranca" | "outro";

function detectarMeio(descricao: string | null): Meio {
  const d = (descricao || "").toUpperCase().trim();
  if (d.startsWith("PIX")) return "pix";
  if (d.startsWith("RESUMO VENDAS CARTAO")) return "cartao";
  if (d.startsWith("CREDITO COBRANCA")) return "cobranca";
  return "outro";
}

const MEIO_BADGE: Record<Meio, { label: string; className: string }> = {
  pix: { label: "PIX", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  cartao: { label: "Cartão", className: "bg-purple-100 text-purple-800 hover:bg-purple-100" },
  cobranca: { label: "Cobrança", className: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  outro: { label: "Outro", className: "bg-muted text-muted-foreground hover:bg-muted" },
};

const NIVEL_CONFIG: Record<string, { label: string; cor: string }> = {
  titulo_na_descricao: { label: "Nº título no extrato", cor: "bg-violet-100 text-violet-800" },
  referencia_pedido: { label: "Ref. pedido", cor: "bg-blue-100 text-blue-800" },
  cnpj_e_valor: { label: "CNPJ + valor", cor: "bg-sky-100 text-sky-800" },
  cnpj: { label: "CNPJ", cor: "bg-cyan-100 text-cyan-800" },
  valor_exato: { label: "Valor exato", cor: "bg-green-100 text-green-800" },
  proximidade: { label: "Proximidade", cor: "bg-amber-100 text-amber-800" },
};

function NivelBadge({ nivel, score }: { nivel: string; score: number }) {
  const cfg = NIVEL_CONFIG[nivel] ?? { label: nivel, cor: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cor}`}>
      {cfg.label} <span className="opacity-60">{score}</span>
    </span>
  );
}

type StatusGrupo = "a_receber" | "vencido" | "pago" | "cancelado";

const GRUPO_DE_STATUS: Record<string, StatusGrupo> = {
  aguardando_pagamento: "a_receber",
  aguardando_envio_bling: "a_receber",
  aguardando_emissao_nf: "a_receber",
  vigente: "a_receber",
  vigente_parcial: "a_receber",
  renegociado: "a_receber",
  vencido: "vencido",
  vencido_suspenso: "vencido",
  em_juridico: "vencido",
  pago: "pago",
  pago_com_atraso: "pago",
  pago_judicial: "pago",
  cancelado: "cancelado",
  cancelado_recuperacao: "cancelado",
  baixado_por_perda: "cancelado",
};

const GRUPO_LABEL: Record<StatusGrupo, string> = {
  a_receber: "A receber",
  vencido: "Vencido",
  pago: "Pago",
  cancelado: "Cancelado",
};

const GRUPO_BADGE: Record<StatusGrupo, string> = {
  a_receber: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  vencido: "bg-red-100 text-red-800 hover:bg-red-100",
  pago: "bg-green-100 text-green-800 hover:bg-green-100",
  cancelado: "bg-gray-100 text-gray-700 hover:bg-gray-100",
};

const QUERY_KEY = ["recebimentos-conciliar-creditos"];

export default function RecebimentosConciliar() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [naoRecebivelCredito, setNaoRecebivelCredito] = useState<Credito | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_bancarias")
        .select("id, data_transacao, descricao, valor, conta_bancaria_id, contas_bancarias(nome_exibicao)")
        .eq("tipo", "credito")
        .eq("conciliado", false)
        .order("data_transacao", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data || []) as any[]).map((r) => ({
        id: r.id,
        data_transacao: r.data_transacao,
        descricao: r.descricao,
        valor: r.valor,
        conta_bancaria_id: r.conta_bancaria_id,
        conta_nome: r.contas_bancarias?.nome_exibicao ?? null,
      })) as Credito[];
    },
  });

  const { data: baixasManuaisCount } = useQuery({
    queryKey: ["baixas-manuais-aguardando-batimento"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("titulo_a_receber")
        .select("id", { count: "exact", head: true })
        .in("status", ["pago", "pago_com_atraso", "pago_judicial"])
        .is("movimentacao_baixa_id", null)
        .eq("tipo_pagamento", "pix");
      if (error) throw error;
      return count ?? 0;
    },
  });


  const creditos = data || [];
  const totalValor = creditos.reduce((s, c) => s + Number(c.valor || 0), 0);

  async function invalidar() {
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
    await qc.invalidateQueries({ queryKey: ["cobranca-divergencias"] });
    await qc.invalidateQueries({ queryKey: ["baixas-manuais-aguardando-batimento"] });
    await qc.invalidateQueries({ queryKey: ["pagos-manuais-para-credito"] });
  }


  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ArrowDownToLine className="h-6 w-6 text-admin" />
          Recebimentos a conciliar
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Créditos do extrato bancário ainda não vinculados a um título a receber.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Créditos não conciliados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{creditos.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Soma dos créditos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatBRL(totalValor)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Baixas manuais aguardando batimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{baixasManuaisCount ?? "—"}</div>
          </CardContent>
        </Card>
      </div>


      <DivergenciasCobrancaSection />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Não foi possível carregar os créditos. Tente novamente em instantes.
            </div>
          ) : creditos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-admin-muted">
                <Inbox className="h-8 w-8 text-admin" />
              </div>
              <p className="text-lg font-semibold">Nenhum crédito aguardando conciliação.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Data</TableHead>
                    <TableHead>Meio</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-64" />
                  </TableRow>

                </TableHeader>
                <TableBody>
                  {creditos.map((c) => {
                    const open = expandedId === c.id;
                    return (
                      <RowCredito
                        key={c.id}
                        credito={c}
                        open={open}
                        onToggle={() => setExpandedId(open ? null : c.id)}
                        onNaoRecebivel={() => setNaoRecebivelCredito(c)}
                        invalidar={invalidar}
                        onDone={() => setExpandedId(null)}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NaoRecebivelDialog
        credito={naoRecebivelCredito}
        onClose={() => setNaoRecebivelCredito(null)}
        onDone={async () => {
          setNaoRecebivelCredito(null);
          await invalidar();
        }}
      />
    </div>
  );
}

function RowCredito({
  credito,
  open,
  onToggle,
  onNaoRecebivel,
  invalidar,
  onDone,
}: {
  credito: Credito;
  open: boolean;
  onToggle: () => void;
  onNaoRecebivel: () => void;
  invalidar: () => Promise<void>;
  onDone: () => void;
}) {
  const meio = detectarMeio(credito.descricao);
  const badge = MEIO_BADGE[meio];
  const canExpand = true;

  return (
    <>
      <TableRow>
        <TableCell>
          {canExpand ? (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onToggle}>
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          ) : null}
        </TableCell>
        <TableCell className="whitespace-nowrap">{formatDateBR(credito.data_transacao)}</TableCell>
        <TableCell>
          <Badge className={badge.className}>{badge.label}</Badge>
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {credito.conta_nome || "—"}
        </TableCell>
        <TableCell className="max-w-md truncate">{credito.descricao || "—"}</TableCell>

        <TableCell className="text-right font-mono whitespace-nowrap text-green-700">
          {formatBRL(Number(credito.valor || 0))}
        </TableCell>
        <TableCell className="text-right">
          {meio === "cobranca" ? (
            <Button size="sm" variant={open ? "secondary" : "default"} onClick={onToggle}>
              Ver título
            </Button>
          ) : meio === "cartao" ? (
            <Button size="sm" variant={open ? "secondary" : "default"} onClick={onToggle}>
              Montar cesta
            </Button>
          ) : meio === "pix" ? (
            <Button size="sm" variant={open ? "secondary" : "default"} onClick={onToggle}>
              Ver candidatos
            </Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant={open ? "secondary" : "default"} onClick={onToggle}>
                Ver candidatos
              </Button>
              <Button size="sm" variant="outline" onClick={onNaoRecebivel}>
                Não é recebível
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
      {open && canExpand && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            {meio === "cartao" ? (
              <PainelCesta credito={credito} invalidar={invalidar} onDone={onDone} />
            ) : meio === "cobranca" ? (
              <PainelBoleto credito={credito} invalidar={invalidar} onDone={onDone} />
            ) : (
              <PainelUnico credito={credito} invalidar={invalidar} onDone={onDone} />
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function useSugestoes(credito: Credito, enabled: boolean) {
  return useQuery({
    queryKey: ["sugerir-titulos", credito.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sugerir_titulos_para_credito", {
        p_movimentacao_id: credito.id,
        p_janela_dias: 7,
      });
      if (error) throw error;
      return (data || []) as Sugestao[];
    },
  });
}

function LinhaTitulo({
  s,
  right,
}: {
  s: Sugestao;
  right: React.ReactNode;
}) {
  const grupo = GRUPO_DE_STATUS[s.status] ?? null;
  const exato = Math.abs(Number(s.diff_valor || 0)) <= 0.01;
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{s.numero_titulo || "—"}</TableCell>
      <TableCell>{s.cliente || "—"}</TableCell>
      <TableCell className="whitespace-nowrap">{formatDateBR(s.data_vencimento_atual)}</TableCell>
      <TableCell className="text-right font-mono whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          {exato && (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              valor exato
            </Badge>
          )}
          {formatBRL(Number(s.valor_atual || 0))}
        </div>
      </TableCell>
      <TableCell>
        <NivelBadge nivel={s.nivel} score={s.score} />
      </TableCell>
      <TableCell>
        <Badge className={grupo ? GRUPO_BADGE[grupo] : "bg-muted"}>
          {grupo ? GRUPO_LABEL[grupo] : s.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">{right}</TableCell>
    </TableRow>
  );
}

type PagoManual = {
  titulo_id: string;
  numero_titulo: string | null;
  cliente: string | null;
  data_pagamento: string | null;
  valor: number;
};

function usePagosManuais(credito: Credito, enabled: boolean) {
  return useQuery({
    queryKey: ["pagos-manuais-para-credito", credito.id],
    enabled,
    queryFn: async () => {
      const dRef = new Date(credito.data_transacao + (credito.data_transacao.length === 10 ? "T00:00:00" : ""));
      const dMin = new Date(dRef); dMin.setDate(dMin.getDate() - 7);
      const dMax = new Date(dRef); dMax.setDate(dMax.getDate() + 7);
      const iso = (x: Date) => x.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("titulo_a_receber")
        .select(
          "id, numero_titulo, data_pagamento, valor_atual, valor_bruto, valor_juros, valor_desconto, " +
          "conta:conta_id(parceiro:parceiro_id(razao_social, nome_fantasia))"
        )
        .in("status", ["pago", "pago_com_atraso", "pago_judicial"])
        .is("movimentacao_baixa_id", null)
        .gte("data_pagamento", iso(dMin))
        .lte("data_pagamento", iso(dMax));
      if (error) throw error;
      const alvo = Number(credito.valor || 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data || []) as any[])
        .map((r) => {
          const valor =
            Number(r.valor_atual ?? r.valor_bruto ?? 0) +
            Number(r.valor_juros ?? 0) -
            Number(r.valor_desconto ?? 0);
          const parc = r.conta?.parceiro;
          return {
            titulo_id: r.id,
            numero_titulo: r.numero_titulo ?? null,
            cliente: parc?.razao_social ?? parc?.nome_fantasia ?? null,
            data_pagamento: r.data_pagamento ?? null,
            valor,
          } as PagoManual;
        })
        .filter((p) => Math.abs(p.valor - alvo) <= 0.01);
    },
  });
}

function PainelUnico({
  credito,
  invalidar,
  onDone,
}: {
  credito: Credito;
  invalidar: () => Promise<void>;
  onDone: () => void;
}) {
  const { data: sugestoes, isLoading } = useSugestoes(credito, true);
  const { data: pagosManuais, isLoading: loadingPagos } = usePagosManuais(credito, true);
  const [conciliando, setConciliando] = useState<string | null>(null);
  const [batendo, setBatendo] = useState<string | null>(null);
  const [mostrarDivergentes, setMostrarDivergentes] = useState(false);

  const { altos, baixos } = useMemo(() => {
    const list = (sugestoes || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const hi: Sugestao[] = [];
    const lo: Sugestao[] = [];
    for (const s of list) {
      if ((s.score ?? 0) >= 60) hi.push(s);
      else lo.push(s);
    }
    return { altos: hi, baixos: lo };
  }, [sugestoes]);

  const pagos = pagosManuais || [];

  async function conciliar(s: Sugestao) {
    setConciliando(s.titulo_id);
    try {
      const { data, error } = await supabase.rpc("conciliar_credito_titulo", {
        p_movimentacao_id: credito.id,
        p_titulo_id: s.titulo_id,
      });
      if (error) {
        toast.error(`Erro ao conciliar: ${error.message}`);
        return;
      }
      const r = data as { ok?: boolean; numero_titulo?: string; aviso?: string; error?: string } | null;
      if (!r || r.ok !== true) {
        toast.error(`Não foi possível conciliar: ${r?.error || "resposta inesperada"}`);
        return;
      }
      toast.success(`Título ${r.numero_titulo || s.numero_titulo || ""} conciliado`);
      if (r.aviso) toast.warning(r.aviso);
      await invalidar();
      onDone();
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConciliando(null);
    }
  }

  async function confirmarBatimento(p: PagoManual) {
    setBatendo(p.titulo_id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("confirmar_batimento_titulo_pago", {
        p_movimentacao_id: credito.id,
        p_titulo_id: p.titulo_id,
      });
      if (error) {
        toast.error(`Erro ao confirmar batimento: ${error.message}`);
        return;
      }
      const r = data as { ok?: boolean; numero_titulo?: string; aviso?: string; error?: string } | null;
      if (!r || r.ok !== true) {
        toast.error(`Não foi possível bater: ${r?.error || "resposta inesperada"}`);
        return;
      }
      toast.success(`Batimento confirmado — título ${r.numero_titulo || p.numero_titulo || ""}`);
      if (r.aviso) toast.warning(r.aviso);
      await invalidar();
      onDone();
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatendo(null);
    }
  }

  if (isLoading || loadingPagos) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const semNada = altos.length === 0 && baixos.length === 0 && pagos.length === 0;
  if (semNada) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Nenhum candidato para este crédito na janela de 7 dias.
      </div>
    );
  }

  const renderAcao = (s: Sugestao) => {
    const score = s.score ?? 0;
    const habilitado = score >= 60;
    const btn = (
      <Button
        size="sm"
        disabled={!habilitado || conciliando === s.titulo_id}
        onClick={() => conciliar(s)}
      >
        {conciliando === s.titulo_id ? "Conciliando..." : "Conciliar título"}
      </Button>
    );
    if (!habilitado) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>{btn}</span>
            </TooltipTrigger>
            <TooltipContent>Score baixo — conciliação bloqueada</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (score < 80) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>{btn}</span>
            </TooltipTrigger>
            <TooltipContent>Match por proximidade — confirme com atenção</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return btn;
  };

  return (
    <div className="space-y-4">
      {altos.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            Candidatos ({altos.length})
          </div>
          <div className="border rounded-md bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {altos.map((s) => (
                  <LinhaTitulo key={s.titulo_id} s={s} right={renderAcao(s)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {pagos.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            Baixados manualmente — aguardando batimento ({pagos.length})
          </div>
          <div className="border rounded-md bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data pagamento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.titulo_id}>
                    <TableCell className="font-mono text-xs">{p.numero_titulo || "—"}</TableCell>
                    <TableCell>{p.cliente || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateBR(p.data_pagamento)}</TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {formatBRL(p.valor)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={batendo === p.titulo_id}
                        onClick={() => confirmarBatimento(p)}
                      >
                        {batendo === p.titulo_id ? "Batendo..." : "Confirmar batimento"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {altos.length === 0 && pagos.length === 0 && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Nenhum candidato com score suficiente na janela de 7 dias.
        </div>
      )}

      {baixos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setMostrarDivergentes((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground mb-2"
          >
            {mostrarDivergentes ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Outros candidatos (score baixo) — {baixos.length}
          </button>
          {mostrarDivergentes && (
            <div className="border rounded-md bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº título</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {baixos.map((s) => (
                    <LinhaTitulo key={s.titulo_id} s={s} right={renderAcao(s)} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PainelBoleto({
  credito,
  invalidar,
  onDone,
}: {
  credito: Credito;
  invalidar: () => Promise<void>;
  onDone: () => void;
}) {
  const { data: sugestoes, isLoading } = useSugestoes(credito, true);
  const [conciliando, setConciliando] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-8 w-full" />;

  const candidatos = (sugestoes || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  async function confirmarBoleto(s: Sugestao) {
    setConciliando(s.titulo_id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("confirmar_batimento_titulo_pago", {
        p_movimentacao_id: credito.id,
        p_titulo_id: s.titulo_id,
      });
      if (error) {
        toast.error(`Erro: ${error.message}`);
        return;
      }
      const r = data as { ok?: boolean; numero_titulo?: string; aviso?: string; error?: string } | null;
      if (!r || r.ok !== true) {
        const msgBanco = r?.error || "";
        const msgExibir = msgBanco.toLowerCase().includes("pago") && msgBanco.toLowerCase().includes("concilia")
          ? "O retorno CNAB deste boleto ainda não foi processado. Importe o arquivo de retorno do Safra e tente novamente."
          : msgBanco || "Erro inesperado";
        toast.error(msgExibir);
        return;
      }
      toast.success(`Boleto ${r.numero_titulo || s.numero_titulo || ""} conciliado`);
      if (r.aviso) toast.warning(r.aviso);
      await invalidar();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setConciliando(null);
    }
  }

  if (candidatos.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Título correspondente não encontrado. O retorno CNAB pode ainda não ter sido importado.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">
        Crédito de cobrança — confirme o título liquidado pelo banco (CNAB já baixou, aqui só carimba conciliado)
      </div>
      <div className="border rounded-md bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº título</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidatos.map((s) => (
              <TableRow key={s.titulo_id}>
                <TableCell className="font-mono text-xs">{s.numero_titulo || "—"}</TableCell>
                <TableCell>{s.cliente || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDateBR(s.data_vencimento_atual)}</TableCell>
                <TableCell className="text-right font-mono">{formatBRL(Number(s.valor_atual || 0))}</TableCell>
                <TableCell><NivelBadge nivel={s.nivel} score={s.score} /></TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={conciliando === s.titulo_id}
                    onClick={() => confirmarBoleto(s)}
                  >
                    {conciliando === s.titulo_id ? "Confirmando..." : "Confirmar recebimento"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}



function PainelCesta({
  credito,
  invalidar,
  onDone,
}: {
  credito: Credito;
  invalidar: () => Promise<void>;
  onDone: () => void;
}) {
  const { data: sugestoes, isLoading } = useSugestoes(credito, true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [conciliando, setConciliando] = useState(false);

  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const soma = useMemo(() => {
    const list = sugestoes || [];
    return list.reduce((acc, s) => (selecionados.has(s.titulo_id) ? acc + Number(s.valor_atual || 0) : acc), 0);
  }, [sugestoes, selecionados]);

  const valorCredito = Number(credito.valor || 0);
  const bate = Math.abs(soma - valorCredito) <= 0.01;
  const qtd = selecionados.size;

  async function conciliarCesta() {
    if (!bate || qtd === 0) return;
    setConciliando(true);
    try {
      const { data, error } = await supabase.rpc("conciliar_credito_cesta", {
        p_movimentacao_id: credito.id,
        p_titulo_ids: Array.from(selecionados),
      });
      if (error) {
        toast.error(`Erro ao conciliar cesta: ${error.message}`);
        return;
      }
      const r = data as { ok?: boolean; titulos?: number; valor?: number; error?: string } | null;
      if (!r || r.ok !== true) {
        toast.error(`Não foi possível conciliar: ${r?.error || "resposta inesperada"}`);
        return;
      }
      toast.success(`Cesta conciliada — ${r.titulos ?? qtd} títulos / ${formatBRL(Number(r.valor ?? soma))}`);
      await invalidar();
      onDone();
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConciliando(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!sugestoes || sugestoes.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Nenhum título aberto com este valor na janela de 7 dias.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="border rounded-md bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Nº título</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sugestoes.map((s) => {
              const grupo = GRUPO_DE_STATUS[s.status] ?? null;
              const checked = selecionados.has(s.titulo_id);
              return (
                <TableRow key={s.titulo_id}>
                  <TableCell>
                    <Checkbox checked={checked} onCheckedChange={() => toggle(s.titulo_id)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.numero_titulo || "—"}</TableCell>
                  <TableCell>{s.cliente || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateBR(s.data_vencimento_atual)}
                  </TableCell>
                  <TableCell className="text-right font-mono whitespace-nowrap">
                    {formatBRL(Number(s.valor_atual || 0))}
                  </TableCell>
                  <TableCell>
                    <Badge className={grupo ? GRUPO_BADGE[grupo] : "bg-muted"}>
                      {grupo ? GRUPO_LABEL[grupo] : s.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-4 bg-background border rounded-md px-4 py-3 sticky bottom-0">
        <div className="text-sm">
          Selecionados: <span className="font-semibold">{qtd}</span>
          {" · "}
          Soma:{" "}
          <span className={`font-mono font-semibold ${bate ? "text-green-700" : "text-red-600"}`}>
            {formatBRL(soma)}
          </span>
          {" / Crédito: "}
          <span className="font-mono">{formatBRL(valorCredito)}</span>
        </div>
        <Button
          size="sm"
          disabled={!bate || qtd === 0 || conciliando}
          onClick={conciliarCesta}
        >
          {conciliando ? "Conciliando..." : `Conciliar cesta (${qtd} títulos)`}
        </Button>
      </div>
    </div>
  );
}

function NaoRecebivelDialog({
  credito,
  onClose,
  onDone,
}: {
  credito: Credito | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [processando, setProcessando] = useState(false);
  const open = credito !== null;
  const podeSalvar = motivo.trim().length >= 5;

  async function handleSalvar() {
    if (!credito || !podeSalvar) return;
    setProcessando(true);
    try {
      const { data, error } = await supabase.rpc("marcar_credito_nao_recebivel", {
        p_movimentacao_id: credito.id,
        p_motivo: motivo.trim(),
      });
      if (error) {
        toast.error(`Erro: ${error.message}`);
        return;
      }
      const r = data as { ok?: boolean; error?: string } | null;
      if (!r || r.ok !== true) {
        toast.error(`Não foi possível marcar: ${r?.error || "resposta inesperada"}`);
        return;
      }
      toast.success("Crédito marcado como não recebível");
      setMotivo("");
      await onDone();
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProcessando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !processando) {
          setMotivo("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar crédito como não recebível</DialogTitle>
          <DialogDescription>
            O crédito será removido da fila de conciliação. Registre o motivo (mínimo 5 caracteres).
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: estorno de fornecedor, transferência interna, etc."
          rows={4}
          disabled={processando}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={processando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={!podeSalvar || processando}>
            {processando ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Divergencia = {
  dia: string;
  valor_extrato: number;
  soma_sinteticas: number;
  diferenca: number;
  qtd_sinteticas: number;
};

function DivergenciasCobrancaSection() {
  const qc = useQueryClient();
  const [reprocessando, setReprocessando] = useState(false);
  const [importarOpen, setImportarOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["cobranca-divergencias"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_divergencias")
        .select("dia, valor_extrato, soma_sinteticas, diferenca, qtd_sinteticas")
        .order("dia", { ascending: false });
      if (error) throw error;
      return (data || []) as Divergencia[];
    },
  });

  const divs = data || [];

  async function handleReprocessar() {
    setReprocessando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: r, error } = await (supabase as any).rpc("fn_casar_sinteticas_extrato");
      if (error) throw error;
      const res = (r || {}) as { linhas_extrato_casadas?: number; sinteticas_casadas?: number };
      toast.success(
        `Casamento reprocessado — ${Number(res.linhas_extrato_casadas || 0)} linhas / ${Number(res.sinteticas_casadas || 0)} boletos`
      );
      await qc.invalidateQueries({ queryKey: ["cobranca-divergencias"] });
    } catch (e) {
      toast.error("Erro no reprocessamento: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReprocessando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Divergências de cobrança (boletos)
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportarOpen(true)}
            className="gap-2"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar extrato
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReprocessar}
            disabled={reprocessando}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reprocessando ? "animate-spin" : ""}`} />
            Reprocessar casamento
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : divs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma divergência — extrato e liquidações batem ✓
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead className="text-right">Valor no extrato</TableHead>
                  <TableHead className="text-right">Soma liquidações</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="text-right">Qtd boletos</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {divs.map((d) => {
                  const diff = Number(d.diferenca || 0);
                  const qtd = Number(d.qtd_sinteticas || 0);
                  const semLiq = qtd === 0 && Number(d.valor_extrato || 0) > 0;
                  return (
                    <TableRow key={d.dia}>
                      <TableCell className="whitespace-nowrap">{formatDateBR(d.dia)}</TableCell>
                      <TableCell className="text-right font-mono">{formatBRL(Number(d.valor_extrato || 0))}</TableCell>
                      <TableCell className="text-right font-mono">{formatBRL(Number(d.soma_sinteticas || 0))}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${diff !== 0 ? "text-red-600" : ""}`}>
                        {formatBRL(diff)}
                      </TableCell>
                      <TableCell className="text-right">{qtd}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {semLiq ? "crédito de cobrança sem liquidações internas — retorno não processado ou era pré-sistema" : ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <ImportarExtratoDialog
        open={importarOpen}
        onOpenChange={(v) => {
          setImportarOpen(v);
          if (!v) {
            qc.invalidateQueries({ queryKey: QUERY_KEY });
            qc.invalidateQueries({ queryKey: ["cobranca-divergencias"] });
          }
        }}
      />
    </Card>
  );
}
