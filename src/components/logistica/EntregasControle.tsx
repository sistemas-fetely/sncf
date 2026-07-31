import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2, Package, Search, AlertTriangle, Truck, CheckCircle2, Clock, Wallet, ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SortableTableHead, ordenarPor, type SortState } from "@/components/shared/SortableTableHead";
import { useLogisticaEntregas, type EntregaRow } from "@/hooks/logistica/useLogisticaEntregas";
import { useLogisticaFilaFeed } from "@/hooks/logistica/useLogisticaFilaFeed";
import { useLogisticaSaudeTransportadora } from "@/hooks/logistica/useLogisticaSaudeTransportadora";

type SortCol =
  | "estado" | "canal" | "documento" | "pedido" | "cliente" | "valor"
  | "transportadora" | "destino" | "dias" | "previsao" | "entrega";

const PAGINA = 50;

function fmtData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const texto = (v: string | null | undefined) => (v && v.trim() ? v : "—");

function estadoBadgeCls(r: EntregaRow) {
  const e = r.estado_canonico ?? "";
  if (e === "entregue") return "border-emerald-600/40 text-emerald-700 bg-emerald-500/10";
  if (e === "devolucao") return "border-destructive/40 text-destructive bg-destructive/10";
  if (e === "excecao") return "border-destructive/40 text-destructive bg-destructive/10";
  if (e === "em_transito") return "border-gold/50 text-foreground bg-gold/10";
  return "border-border text-muted-foreground bg-muted/40";
}

function BadgeEstado({ r }: { r: EntregaRow }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] border", estadoBadgeCls(r))}>
      {texto(r.estado_rotulo)}
    </Badge>
  );
}

function BadgeCanal({ canal }: { canal: string | null }) {
  if (!canal) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className="text-[10px] uppercase border-border">
      {canal}
    </Badge>
  );
}

function emTransito(r: EntregaRow) {
  const e = r.estado_canonico ?? "";
  return e !== "entregue" && e !== "devolucao";
}

function paradoMuito(r: EntregaRow) {
  return (r.dias_sem_movimento ?? 0) > 7 && emTransito(r);
}

function MultiSelect({
  label, opcoes, selecionadas, onToggle, onLimpar,
}: {
  label: string;
  opcoes: string[];
  selecionadas: Set<string>;
  onToggle: (v: string) => void;
  onLimpar: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
          {label}
          {selecionadas.size > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1">{selecionadas.size}</Badge>
          )}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {opcoes.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem opções</div>
        ) : (
          <>
            {opcoes.map((o) => (
              <DropdownMenuCheckboxItem
                key={o}
                checked={selecionadas.has(o)}
                onCheckedChange={() => onToggle(o)}
                onSelect={(e) => e.preventDefault()}
                className="text-xs"
              >
                {o}
              </DropdownMenuCheckboxItem>
            ))}
            {selecionadas.size > 0 && (
              <button
                type="button"
                onClick={onLimpar}
                className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Limpar
              </button>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Kpi({
  label, valor, icon: Icon, tom,
}: {
  label: string;
  valor: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tom?: "alerta" | "aviso";
}) {
  return (
    <Card
      className={cn(
        tom === "alerta" && "border-destructive/30 bg-destructive/5",
        tom === "aviso" && "border-amber-500/30 bg-amber-500/5"
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className="h-3.5 w-3.5 text-gold" />
        </div>
        <div className="text-xl font-medium tabular-nums">{valor}</div>
      </CardContent>
    </Card>
  );
}

function LinhaEntrega({ r, completo }: { r: EntregaRow; completo?: boolean }) {
  const urgente = (r.ordem_urgencia ?? 0) >= 70 && emTransito(r);
  const parado = paradoMuito(r);
  return (
    <TableRow
      className={cn(
        "text-xs",
        urgente && "bg-destructive/5 hover:bg-destructive/10",
        !urgente && parado && "bg-amber-500/5 hover:bg-amber-500/10"
      )}
    >
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <BadgeEstado r={r} />
          {r.ocorrencia_texto && (
            <span className="text-[10px] text-muted-foreground max-w-[180px] truncate">
              {r.ocorrencia_texto}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell><BadgeCanal canal={r.canal} /></TableCell>
      <TableCell className="font-mono max-w-[150px] truncate">{texto(r.documento_ref)}</TableCell>
      <TableCell className="font-mono">
        {r.pedido_id && r.pedido_externo ? (
          <Link to={`/pedidos/${r.pedido_id}`} className="text-primary hover:underline">
            {r.pedido_externo}
          </Link>
        ) : (
          texto(r.pedido_externo)
        )}
      </TableCell>
      <TableCell className="max-w-[200px] truncate">{texto(r.cliente)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {r.valor != null ? formatBRL(Number(r.valor)) : "—"}
      </TableCell>
      <TableCell className="hidden md:table-cell max-w-[150px] truncate">
        {texto(r.transportadora)}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {r.municipio_destino || r.uf_destino
          ? `${texto(r.municipio_destino)}${r.uf_destino ? ` / ${r.uf_destino}` : ""}`
          : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {r.dias_sem_movimento != null ? r.dias_sem_movimento : "—"}
      </TableCell>
      {completo && (
        <>
          <TableCell className="hidden lg:table-cell">{fmtData(r.previsao_entrega)}</TableCell>
          <TableCell>{fmtData(r.data_entrega)}</TableCell>
        </>
      )}
    </TableRow>
  );
}

const num = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR");

function pct(v: number | null | undefined) {
  return v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function otdCls(v: number | null | undefined) {
  if (v == null) return "text-muted-foreground";
  if (v >= 95) return "text-emerald-700";
  if (v >= 85) return "text-amber-600";
  return "text-destructive";
}

/** Bloco — Rastreio sem atualização. Não renderiza nada quando a view vem vazia. */
function AlertaFeedParado() {
  const { data = [], error } = useLogisticaFilaFeed();

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5" />
        <div>
          <div className="font-medium">Erro ao carregar a fila de feed</div>
          <div>{formatError(error)}</div>
        </div>
      </div>
    );
  }

  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5">
      <div className="flex items-center gap-2 p-3 border-b border-destructive/20">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <div className="text-sm font-medium">Rastreio sem atualização</div>
        <Badge variant="outline" className="text-xs">{data.length}</Badge>
      </div>
      <div className="divide-y divide-border/60">
        {data.map((f, i) => {
          const grave = (f.severidade ?? 3) === 1;
          return (
            <div
              key={`${f.transportadora}-${f.canal}-${i}`}
              className={cn(
                "flex items-start gap-2 p-3",
                grave ? "bg-destructive/5" : "bg-amber-500/5"
              )}
            >
              <AlertTriangle
                className={cn("h-4 w-4 mt-0.5 shrink-0", grave ? "text-destructive" : "text-amber-600")}
              />
              <div className="min-w-0">
                <div className={cn("text-xs font-medium", grave ? "text-destructive" : "text-amber-700")}>
                  {texto(f.diagnostico)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Última ocorrência: {fmtData(f.ultima_ocorrencia)} · Última importação:{" "}
                  {fmtData(f.ultima_importacao)} · {num(f.remessas)} remessas afetadas
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bloco — Saúde por transportadora. */
function SaudeTransportadora() {
  const { data = [], isLoading, error } = useLogisticaSaudeTransportadora();

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5" />
        <div>
          <div className="font-medium">Erro ao carregar a saúde por transportadora</div>
          <div>{formatError(error)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 p-3 border-b">
        <Truck className="h-4 w-4 text-gold" />
        <div className="text-sm font-medium">Saúde por transportadora</div>
        {!isLoading && <Badge variant="outline" className="text-xs">{data.length}</Badge>}
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
        </div>
      ) : data.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">Sem dados de transportadora</div>
      ) : (
        <div className="overflow-auto max-h-[52vh]">
          <TooltipProvider>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:bg-card">
                <TableRow className="text-xs bg-card hover:bg-card">
                  <TableHead>Transportadora</TableHead>
                  <TableHead className="text-right">Remessas</TableHead>
                  <TableHead className="text-right">OTD</TableHead>
                  <TableHead className="text-right">Atrasadas</TableHead>
                  <TableHead className="text-right">Pior atraso</TableHead>
                  <TableHead className="text-right">Gap médio</TableHead>
                  <TableHead className="text-right">Com problema</TableHead>
                  <TableHead className="text-right">Paradas +7d</TableHead>
                  <TableHead className="text-right">Valor em trânsito</TableHead>
                  <TableHead>Feed</TableHead>
                  <TableHead className="text-right">Cobertura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s, i) => {
                  const gap = s.gap_medio_dias == null ? null : Number(s.gap_medio_dias);
                  const cobertura = s.cobertura_medicao_pct == null ? null : Number(s.cobertura_medicao_pct);
                  return (
                    <TableRow key={`${s.transportadora}-${s.canal}-${i}`} className="text-xs">
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate max-w-[220px]">{texto(s.transportadora)}</span>
                          <BadgeCanal canal={s.canal ?? null} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(s.remessas)}</TableCell>
                      <TableCell className="text-right">
                        <div className={cn("text-lg font-medium tabular-nums leading-none", otdCls(s.otd_pct))}>
                          {pct(s.otd_pct)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {num(s.no_prazo)} de {num(s.mensuraveis)} medidas
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(s.atrasadas)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.pior_atraso_dias == null ? "—" : `${num(s.pior_atraso_dias)} d`}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          gap != null && gap < 0 && "text-emerald-700",
                          gap != null && gap > 0 && "text-destructive"
                        )}
                      >
                        {gap == null
                          ? "—"
                          : `${gap > 0 ? "+" : ""}${gap.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(s.com_problema)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(s.paradas_7d)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.valor_em_transito == null ? "—" : formatBRL(Number(s.valor_em_transito))}
                      </TableCell>
                      <TableCell>
                        {s.feed_velho ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-destructive/40 text-destructive bg-destructive/10"
                          >
                            {num(s.dias_feed_atrasado)} dias
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                            atual
                          </Badge>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {texto(s.modo_alimentacao)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cobertura != null && cobertura < 80 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-amber-600 cursor-help">{pct(cobertura)}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Parte das entregas não tem data para medir prazo
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          pct(cobertura)
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>
      )}

      <div className="border-t p-2 text-[10px] text-muted-foreground">
        OTD compara data de entrega com previsão da transportadora. Só entra no cálculo remessa
        entregue com as duas datas.
      </div>
    </div>
  );
}


export function EntregasControle() {
  const { data = [], isLoading, error } = useLogisticaEntregas();

  const [canal, setCanal] = useState<string>("todos");
  const [transps, setTransps] = useState<Set<string>>(new Set());
  const [estados, setEstados] = useState<Set<string>>(new Set());
  const [ufs, setUfs] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<SortState<SortCol> | null>(null);
  const [pagina, setPagina] = useState(0);

  const opcoes = useMemo(() => {
    const t = new Set<string>();
    const e = new Set<string>();
    const u = new Set<string>();
    for (const r of data) {
      if (r.transportadora) t.add(r.transportadora);
      if (r.estado_rotulo) e.add(r.estado_rotulo);
      if (r.uf_destino) u.add(r.uf_destino);
    }
    const ord = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { transportadoras: ord(t), estados: ord(e), ufs: ord(u) };
  }, [data]);

  // Canal aplica a KPIs e grade
  const porCanal = useMemo(
    () => (canal === "todos" ? data : data.filter((r) => r.canal === canal)),
    [data, canal]
  );

  const atencao = useMemo(() => {
    const base = porCanal.filter((r) => r.eh_problema === true || paradoMuito(r));
    return [...base].sort((a, b) => {
      const du = (b.ordem_urgencia ?? 0) - (a.ordem_urgencia ?? 0);
      if (du !== 0) return du;
      return (b.dias_sem_movimento ?? 0) - (a.dias_sem_movimento ?? 0);
    });
  }, [porCanal]);

  const kpis = useMemo(() => {
    let transito = 0, entregues = 0, problema = 0, parados = 0, exposto = 0;
    for (const r of porCanal) {
      if (emTransito(r)) {
        transito++;
        exposto += Number(r.valor ?? 0);
      }
      if (r.estado_canonico === "entregue") entregues++;
      if (r.eh_problema) problema++;
      if (paradoMuito(r)) parados++;
    }
    return { transito, entregues, problema, parados, exposto };
  }, [porCanal]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = porCanal.filter((r) => {
      if (transps.size > 0 && !(r.transportadora && transps.has(r.transportadora))) return false;
      if (estados.size > 0 && !(r.estado_rotulo && estados.has(r.estado_rotulo))) return false;
      if (ufs.size > 0 && !(r.uf_destino && ufs.has(r.uf_destino))) return false;
      if (q) {
        const alvo = [r.documento_ref, r.cliente, r.pedido_externo]
          .map((v) => (v ?? "").toLowerCase())
          .join(" ");
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    if (!sort) return base;
    const ts = (s: string | null) => {
      if (!s) return null;
      const t = new Date(s).getTime();
      return isNaN(t) ? null : t;
    };
    return ordenarPor<EntregaRow, SortCol>(base, sort, {
      estado: (r) => r.estado_rotulo ?? null,
      canal: (r) => r.canal ?? null,
      documento: (r) => r.documento_ref ?? null,
      pedido: (r) => r.pedido_externo ?? null,
      cliente: (r) => r.cliente ?? null,
      valor: (r) => (r.valor != null ? Number(r.valor) : null),
      transportadora: (r) => r.transportadora ?? null,
      destino: (r) => r.municipio_destino ?? r.uf_destino ?? null,
      dias: (r) => r.dias_sem_movimento ?? null,
      previsao: (r) => ts(r.previsao_entrega),
      entrega: (r) => ts(r.data_entrega),
    });
  }, [porCanal, transps, estados, ufs, busca, sort]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(paginaAtual * PAGINA, paginaAtual * PAGINA + PAGINA);

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>
  ) => (v: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
    setPagina(0);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <AlertaFeedParado />
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando entregas…
        </div>
        <SaudeTransportadora />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <AlertaFeedParado />
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>
            <div className="font-medium">Erro ao carregar as entregas</div>
            <div className="text-xs">{formatError(error)}</div>
          </div>
        </div>
        <SaudeTransportadora />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bloco 0 — Rastreio sem atualização */}
      <AlertaFeedParado />

      {/* Bloco 1 — Precisa de atenção */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 p-3 border-b">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <div className="text-sm font-medium">Precisa de atenção</div>
          <Badge variant="outline" className="text-xs">{atencao.length}</Badge>
        </div>
        {atencao.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Nenhuma carga exigindo atenção
          </div>
        ) : (
          <div className="max-h-[38vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:bg-card">
                <TableRow className="text-xs bg-card hover:bg-card">
                  <TableHead>Estado</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="hidden md:table-cell">Transportadora</TableHead>
                  <TableHead className="hidden md:table-cell">Destino</TableHead>
                  <TableHead className="text-right">Dias parado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atencao.map((r, i) => (
                  <LinhaEntrega key={`${r.fonte}-${r.fonte_id}-${i}`} r={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Bloco 2 — KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi label="Em trânsito" valor={kpis.transito} icon={Truck} />
        <Kpi label="Entregues" valor={kpis.entregues} icon={CheckCircle2} />
        <Kpi label="Com problema" valor={kpis.problema} icon={AlertTriangle} tom={kpis.problema > 0 ? "alerta" : undefined} />
        <Kpi label="Sem movimento +7d" valor={kpis.parados} icon={Clock} tom={kpis.parados > 0 ? "aviso" : undefined} />
        <Kpi label="Valor exposto" valor={formatBRL(kpis.exposto)} icon={Wallet} />
      </div>

      {/* Bloco 3 — Grade completa */}
      <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium">Entregas</div>
          <Badge variant="outline" className="text-xs">
            {filtradas.length} de {data.length}
          </Badge>
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
            placeholder="Documento, cliente ou pedido…"
            className="h-8 pl-7 w-56 text-xs"
          />
        </div>

        <Select value={canal} onValueChange={(v) => { setCanal(v); setPagina(0); }}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="b2b">B2B</SelectItem>
            <SelectItem value="b2c">B2C</SelectItem>
          </SelectContent>
        </Select>

        <MultiSelect
          label="Transportadora"
          opcoes={opcoes.transportadoras}
          selecionadas={transps}
          onToggle={toggle(setTransps)}
          onLimpar={() => { setTransps(new Set()); setPagina(0); }}
        />
        <MultiSelect
          label="Estado"
          opcoes={opcoes.estados}
          selecionadas={estados}
          onToggle={toggle(setEstados)}
          onLimpar={() => { setEstados(new Set()); setPagina(0); }}
        />
        <MultiSelect
          label="UF"
          opcoes={opcoes.ufs}
          selecionadas={ufs}
          onToggle={toggle(setUfs)}
          onLimpar={() => { setUfs(new Set()); setPagina(0); }}
        />
      </div>

      {filtradas.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
          Nenhuma entrega para os filtros selecionados.
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:bg-card">
                <TableRow className="text-xs bg-card hover:bg-card">
                  <SortableTableHead column="estado" sort={sort} onSort={setSort}>Estado</SortableTableHead>
                  <SortableTableHead column="canal" sort={sort} onSort={setSort}>Canal</SortableTableHead>
                  <SortableTableHead column="documento" sort={sort} onSort={setSort}>Documento</SortableTableHead>
                  <SortableTableHead column="pedido" sort={sort} onSort={setSort}>Pedido</SortableTableHead>
                  <SortableTableHead column="cliente" sort={sort} onSort={setSort}>Cliente</SortableTableHead>
                  <SortableTableHead column="valor" sort={sort} onSort={setSort} align="right" className="text-right">Valor</SortableTableHead>
                  <SortableTableHead column="transportadora" sort={sort} onSort={setSort} className="hidden md:table-cell">Transportadora</SortableTableHead>
                  <SortableTableHead column="destino" sort={sort} onSort={setSort} className="hidden md:table-cell">Destino</SortableTableHead>
                  <SortableTableHead column="dias" sort={sort} onSort={setSort} align="right" className="text-right">Dias parado</SortableTableHead>
                  <SortableTableHead column="previsao" sort={sort} onSort={setSort} className="hidden lg:table-cell">Previsão</SortableTableHead>
                  <SortableTableHead column="entrega" sort={sort} onSort={setSort}>Entrega</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((r, i) => (
                  <LinhaEntrega key={`${r.fonte}-${r.fonte_id}-${i}`} r={r} completo />
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-2 border-t p-2 text-xs">
              <span className="text-muted-foreground">
                Página {paginaAtual + 1} de {totalPaginas}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm" className="h-7 text-xs"
                  disabled={paginaAtual === 0}
                  onClick={() => setPagina(paginaAtual - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs"
                  disabled={paginaAtual >= totalPaginas - 1}
                  onClick={() => setPagina(paginaAtual + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
