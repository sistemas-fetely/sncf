/**
 * RECEBÍVEIS POR CLIENTE — aba panorâmica da tela /cliente.
 *
 * Herdeira da antiga tela "Vencimentos x Cliente": aging por conta, com
 * expansão para os títulos do cliente. Vive como aba porque o dinheiro a
 * receber é lente do cliente, não tela avulsa.
 */
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Inbox,
  Percent,
  Search,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  CabecalhoOrdenavel,
  LINHA_CABECALHO_COLADO,
  type DirecaoOrdenacao,
} from "@/components/tabela/CabecalhoOrdenavel";
import {
  RodapePaginacao,
  lerTamanhoPaginaSalvo,
  type PageSizeOption,
} from "@/components/tabela/RodapePaginacao";

type RecebivelConta = {
  parceiro_id: string | null;
  cliente: string | null;
  qtd_titulos: number | null;
  total_a_receber: number | null;
  total_vencido: number | null;
  faixa_a_vencer: number | null;
  faixa_1_7: number | null;
  faixa_8_30: number | null;
  faixa_31_60: number | null;
  faixa_60_mais: number | null;
  dias_atraso_max: number | null;
};

type TituloB2B = {
  numero_titulo: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  meio_pagamento: string | null;
  data_vencimento: string | null;
  valor: number | null;
  status_gestao: string | null;
  data_liquidacao: string | null;
  data_recebimento: string | null;
  nf_numero: string | null;
};

const num = (v: number | null | undefined) => (typeof v === "number" ? v : 0);

const STATUS_LABEL: Record<string, string> = {
  pago: "Pago",
  em_aberto: "Em aberto",
  atrasado: "Atrasado",
};

const STATUS_BADGE: Record<string, string> = {
  pago: "bg-success/10 text-success hover:bg-success/10",
  em_aberto: "bg-muted text-foreground hover:bg-muted",
  atrasado: "bg-destructive/10 text-destructive hover:bg-destructive/10",
};

type ColunaRecebivel = "cliente" | "total_a_receber" | "total_vencido" | "dias_atraso_max";

type OrdenacaoRecebivel = { coluna: ColunaRecebivel; dir: DirecaoOrdenacao } | null;

/** Texto sobe; dinheiro e atraso descem. */
const DIR_INICIAL_RECEBIVEL: Record<ColunaRecebivel, DirecaoOrdenacao> = {
  cliente: "asc",
  total_a_receber: "desc",
  total_vencido: "desc",
  dias_atraso_max: "desc",
};

const CHAVE_PAGINA_RECEBIVEIS = "fetely:cliente:recebiveis:page-size";

/** CasaHeader = 4rem. Mesmo numero que ancora o `top-16` do bloco de KPIs. */
const ALTURA_CASA_HEADER = 64;

/** Total de colunas da tabela — usado no colSpan da linha expandida. */
const TOTAL_COLUNAS = 10;

function FaixaCell({ value, className }: { value: number | null; className?: string }) {
  const v = num(value);
  if (v === 0) {
    return (
      <TableCell className="text-right font-mono text-muted-foreground/60">
        {formatBRL(0)}
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("text-right font-mono font-medium", className)}>
      {formatBRL(v)}
    </TableCell>
  );
}

function TitulosAbertosCliente({
  parceiroId,
  incluirPagos,
}: {
  parceiroId: string;
  incluirPagos: boolean;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["titulos-b2b-conta", parceiroId, incluirPagos],
    queryFn: async () => {
      let q = supabase
        .from("vw_recebivel_b2b")
        .select(
          "numero_titulo, numero_parcela, total_parcelas, meio_pagamento, data_vencimento, valor, status_gestao, data_liquidacao, data_recebimento, nf_numero",
        )
        .eq("parceiro_id", parceiroId)
        .order("data_vencimento", { ascending: true });
      if (!incluirPagos) {
        q = q.in("status_gestao", ["em_aberto", "atrasado"]);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TituloB2B[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Erro ao carregar títulos deste cliente.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Nenhum título com NF para este cliente.
      </div>
    );
  }

  return (
    <div className="bg-muted/30 p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº NF</TableHead>
            <TableHead>Nº título / parcela</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Recebimento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((t, idx) => {
            const status = t.status_gestao ?? "em_aberto";
            const parcela =
              t.numero_parcela && t.total_parcelas
                ? `${t.numero_titulo ?? "—"} (${t.numero_parcela}/${t.total_parcelas})`
                : t.numero_titulo ?? "—";
            return (
              <TableRow key={`${t.numero_titulo ?? "x"}-${t.numero_parcela ?? idx}`}>
                <TableCell className="font-mono">{t.nf_numero ?? "—"}</TableCell>
                <TableCell className="font-mono">{parcela}</TableCell>
                <TableCell>{formatDateBR(t.data_vencimento)}</TableCell>
                <TableCell className="text-right font-mono">{formatBRL(num(t.valor))}</TableCell>
                <TableCell>
                  <Badge className={STATUS_BADGE[status] ?? STATUS_BADGE.em_aberto}>
                    {STATUS_LABEL[status] ?? status}
                  </Badge>
                </TableCell>
                <TableCell>{t.data_recebimento ? formatDateBR(t.data_recebimento) : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function RecebiveisPorClienteTab() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [incluirPagos, setIncluirPagos] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [ordenacao, setOrdenacao] = useState<OrdenacaoRecebivel>(null);
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(() =>
    lerTamanhoPaginaSalvo(CHAVE_PAGINA_RECEBIVEIS),
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["vw-recebivel-b2b-por-conta", incluirPagos],
    queryFn: async () => {
      const { data, error } = incluirPagos
        ? await supabase.from("vw_recebivel_b2b_por_conta_full").select("*")
        : await supabase.from("vw_recebivel_b2b_por_conta").select("*");
      if (error) throw error;
      return (data ?? []) as RecebivelConta[];
    },
  });

  const ordenarPor = (coluna: ColunaRecebivel) => {
    setOrdenacao((atual) => {
      if (!atual || atual.coluna !== coluna) return { coluna, dir: DIR_INICIAL_RECEBIVEL[coluna] };
      const invertida: DirecaoOrdenacao = atual.dir === "asc" ? "desc" : "asc";
      // Fechou o ciclo: volta a ordem que a view entrega.
      return invertida === DIR_INICIAL_RECEBIVEL[coluna] ? null : { coluna, dir: invertida };
    });
  };

  useEffect(() => {
    setPagina(1);
  }, [busca, ordenacao, incluirPagos]);

  // TOPO-COLADO-SE-MEDE: o cabecalho da tabela cola logo abaixo dos KPIs, e a
  // altura deles muda (os cards quebram linha em tela menor). Mede, nao chuta.
  const kpisRef = useRef<HTMLDivElement>(null);
  const [alturaKpis, setAlturaKpis] = useState(0);

  useEffect(() => {
    const el = kpisRef.current;
    if (!el) return;
    const medir = () => setAlturaKpis(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const kpis = useMemo(() => {
    const base = data ?? [];
    const total = base.reduce((s, r) => s + num(r.total_a_receber), 0);
    const vencido = base.reduce((s, r) => s + num(r.total_vencido), 0);
    const inad = total > 0 ? (vencido / total) * 100 : 0;
    return { total, vencido, inad };
  }, [data]);

  const filtrados = useMemo(() => {
    const base = data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => (r.cliente ?? "").toLowerCase().includes(q));
  }, [data, busca]);

  // VAZIO-VAI-PRO-FIM: celula sem dado nunca ganha primeiro lugar, nos dois sentidos.
  const ordenados = useMemo(() => {
    if (!ordenacao) return filtrados;
    const dir = ordenacao.dir === "asc" ? 1 : -1;
    const valorDe = (r: RecebivelConta): string | number | null => {
      switch (ordenacao.coluna) {
        case "cliente":
          return r.cliente?.trim() ? r.cliente : null;
        case "total_a_receber":
          return r.total_a_receber == null ? null : Number(r.total_a_receber);
        case "total_vencido":
          return r.total_vencido == null ? null : Number(r.total_vencido);
        case "dias_atraso_max":
          return r.dias_atraso_max == null ? null : Number(r.dias_atraso_max);
        default:
          return null;
      }
    };
    return [...filtrados].sort((a, b) => {
      const va = valorDe(a);
      const vb = valorDe(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
  }, [filtrados, ordenacao]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginaItens = ordenados.slice(
    (paginaAtual - 1) * tamanhoPagina,
    paginaAtual * tamanhoPagina,
  );

  return (
    <div
      className="space-y-4"
      style={{ "--fila-topo-colado": `${ALTURA_CASA_HEADER + alturaKpis}px` } as CSSProperties}
    >
      <div
        ref={kpisRef}
        className="sticky top-16 z-20 grid gap-3 bg-background py-2 md:grid-cols-3"
      >
        <div className="rounded-md border border-border/60 bg-card p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Total a receber
          </p>
          <p className="text-sm font-medium">{error ? "—" : formatBRL(kpis.total)}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Total vencido
          </p>
          <p className="text-sm font-medium text-destructive">
            {error ? "—" : formatBRL(kpis.vencido)}
          </p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Percent className="h-3.5 w-3.5" /> Inadimplência
          </p>
          <p className="text-sm font-medium">
            {error ? "—" : `${kpis.inad.toFixed(1)}%`}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente"
              className="h-8 pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="incluir-pagos-recebiveis"
              checked={incluirPagos}
              onCheckedChange={setIncluirPagos}
            />
            <Label htmlFor="incluir-pagos-recebiveis" className="text-xs">
              Incluir pagos
            </Label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="flex items-center gap-2 p-6 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Não foi possível carregar os recebíveis. Tente novamente.
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : ordenados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <Inbox className="h-5 w-5" />
              Nenhum cliente com título em aberto.
            </div>
          ) : (
            <>
              <Table containerClassName="overflow-visible">
                <TableHeader>
                  <TableRow className={LINHA_CABECALHO_COLADO}>
                    <TableHead className="w-8" />
                    <CabecalhoOrdenavel
                      rotulo="Cliente"
                      dir={ordenacao?.coluna === "cliente" ? ordenacao.dir : null}
                      onOrdenar={() => ordenarPor("cliente")}
                    />
                    <CabecalhoOrdenavel
                      rotulo="Total a receber"
                      className="text-right"
                      alinharDireita
                      dir={ordenacao?.coluna === "total_a_receber" ? ordenacao.dir : null}
                      onOrdenar={() => ordenarPor("total_a_receber")}
                    />
                    <TableHead className="text-right">A vencer</TableHead>
                    <TableHead className="text-right">1–7 dias</TableHead>
                    <TableHead className="text-right">8–30 dias</TableHead>
                    <TableHead className="text-right">31–60d</TableHead>
                    <TableHead className="text-right">+60d</TableHead>
                    <CabecalhoOrdenavel
                      rotulo="Vencido"
                      className="text-right"
                      alinharDireita
                      dir={ordenacao?.coluna === "total_vencido" ? ordenacao.dir : null}
                      onOrdenar={() => ordenarPor("total_vencido")}
                    />
                    <CabecalhoOrdenavel
                      rotulo="Atraso máx (dias)"
                      className="text-right"
                      alinharDireita
                      dir={ordenacao?.coluna === "dias_atraso_max" ? ordenacao.dir : null}
                      onOrdenar={() => ordenarPor("dias_atraso_max")}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginaItens.map((r) => {
                    const id = r.parceiro_id ?? "";
                    const aberto = expandido === id;
                    const atraso = num(r.dias_atraso_max);
                    return (
                      <Fragment key={id || r.cliente || Math.random()}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpandido(aberto ? null : id)}
                        >
                          <TableCell className="w-8">
                            {aberto ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            <button
                              type="button"
                              className="text-left hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (id) navigate(`/cliente/${id}?aba=posicao`);
                              }}
                            >
                              {r.cliente ?? "(sem nome)"}
                            </button>
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatBRL(num(r.total_a_receber))}
                          </TableCell>
                          <FaixaCell value={r.faixa_a_vencer} className="text-foreground" />
                          <FaixaCell value={r.faixa_1_7} className="text-warning" />
                          <FaixaCell value={r.faixa_8_30} className="text-warning" />
                          <FaixaCell value={r.faixa_31_60} className="text-destructive" />
                          <FaixaCell value={r.faixa_60_mais} className="text-destructive" />
                          <TableCell className="text-right font-mono font-medium text-destructive">
                            {formatBRL(num(r.total_vencido))}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-mono",
                              atraso > 0
                                ? "font-medium text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {atraso}
                          </TableCell>
                        </TableRow>
                        {aberto && id && (
                          <TableRow>
                            <TableCell colSpan={TOTAL_COLUNAS} className="p-0">
                              <TitulosAbertosCliente
                                parceiroId={id}
                                incluirPagos={incluirPagos}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <RodapePaginacao
                total={ordenados.length}
                pagina={paginaAtual}
                tamanhoPagina={tamanhoPagina}
                chavePreferencia={CHAVE_PAGINA_RECEBIVEIS}
                onPagina={setPagina}
                onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
