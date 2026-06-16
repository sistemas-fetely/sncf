import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Info, ChevronRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { ImportarPlanilhaWnsDialog } from "@/components/wns/ImportarPlanilhaWnsDialog";
import { WnsPedidoRemessasRow } from "@/components/wns/WnsPedidoRemessasRow";
import { WnsProdutosTable } from "@/components/wns/WnsProdutosTable";
import {
  useWnsFases, useWnsPedidos, useWnsTiposPedido,
} from "@/hooks/wns/useWnsPedidos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA_FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function corFase(seq?: number) {
  if (!seq) return "secondary" as const;
  if (seq <= 3) return "default" as const;
  if (seq <= 5) return "outline" as const;
  return "default" as const;
}

export default function WnsXpm() {
  const [dialogAberto, setDialogAberto] = useState(false);
  const [filtroFase, setFiltroFase] = useState<string>("todas");
  const [filtroCanal, setFiltroCanal] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: fases } = useWnsFases();
  const { data: tipos } = useWnsTiposPedido();
  const { data: pedidos, isLoading, error } = useWnsPedidos();

  const contagemPorFase = useMemo(() => {
    const m = new Map<number, number>();
    (pedidos ?? []).forEach((p) => {
      if (p.evento_atual_wns_id != null) m.set(p.evento_atual_wns_id, (m.get(p.evento_atual_wns_id) ?? 0) + 1);
    });
    return m;
  }, [pedidos]);

  const nfNumero = (nfs?: (string | number)[] | null) => {
    const s = String((nfs ?? [])[0] ?? "");
    const n = parseInt(s.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = (pedidos ?? []).filter((p) => {
      if (filtroFase !== "todas" && String(p.evento_atual_wns_id ?? "") !== filtroFase) return false;
      if (filtroCanal !== "todos" && String(p.tipo_pedido_codigo ?? "") !== filtroCanal) return false;
      if (q) {
        const hay = [
          p.cliente_nome ?? "",
          p.n_pedido_cliente ?? "",
          String(p.pedidowns),
          (p.notas_fiscais ?? []).join(","),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortCol === "nf") {
      arr = [...arr].sort((a, b) => {
        const na = nfNumero(a.notas_fiscais);
        const nb = nfNumero(b.notas_fiscais);
        return sortDir === "asc" ? na - nb : nb - na;
      });
    }
    return arr;
  }, [pedidos, filtroFase, filtroCanal, busca, sortCol, sortDir]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3.5 w-3.5 text-primary" />
      : <ArrowDown className="h-3.5 w-3.5 text-primary" />;
  };

  const COLS = 10;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif">WNS / XPM</h1>
            <p className="text-sm text-muted-foreground">Acompanhamento de pedidos e expedição</p>
          </div>
          <Button onClick={() => setDialogAberto(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Importar planilha
          </Button>
        </div>

        <Tabs defaultValue="pedidos" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
          </TabsList>

          <TabsContent value="pedidos" className="space-y-6">
            {/* KPI cards por fase */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {(fases ?? []).map((f) => {
                const ativo = filtroFase === String(f.wns_id);
                return (
                  <Card
                    key={f.wns_id}
                    onClick={() => setFiltroFase(ativo ? "todas" : String(f.wns_id))}
                    className={`cursor-pointer transition hover:border-primary ${ativo ? "border-primary ring-1 ring-primary" : ""}`}
                  >
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground truncate">{f.descricao}</div>
                      <div className="text-2xl font-semibold">{contagemPorFase.get(f.wns_id) ?? 0}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={filtroFase} onValueChange={setFiltroFase}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Fase" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as fases</SelectItem>
                  {(fases ?? []).map((f) => (
                    <SelectItem key={f.wns_id} value={String(f.wns_id)}>{f.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroCanal} onValueChange={setFiltroCanal}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Canal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os canais</SelectItem>
                  {(tipos ?? []).map((t) => (
                    <SelectItem key={t.codigo} value={String(t.codigo)}>{t.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Buscar cliente, nº pedido, WNS ou NF…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="max-w-sm"
              />
              <div className="ml-auto text-xs text-muted-foreground">
                {filtrados.length} pedido(s)
              </div>
            </div>

            {/* Tabela */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Pedido WNS</TableHead>
                    <TableHead>Nº Cliente</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Fase atual</TableHead>
                    <TableHead className="text-right">Remessas</TableHead>
                    <TableHead>NFs</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Última data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: COLS + 1 }).map((__, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={COLS + 1} className="text-center text-destructive py-8">
                        Erro ao carregar pedidos. Tente recarregar a página.
                      </TableCell>
                    </TableRow>
                  ) : filtrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={COLS + 1} className="text-center text-muted-foreground py-10">
                        Nenhum pedido WNS importado ainda — use Importar planilha para começar.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtrados.map((p) => {
                      const tipo = tipos?.find((t) => t.codigo === p.tipo_pedido_codigo);
                      const fase = fases?.find((f) => f.wns_id === p.evento_atual_wns_id);
                      const multi = (p.total_remessas ?? 0) > 1;
                      const exp = multi && expandido === p.pedidowns;
                      const naoComporeReceita = tipo && !tipo.compoe_receita;
                      return (
                        <Fragment key={p.pedidowns}>
                          <TableRow
                            className={multi ? "cursor-pointer" : ""}
                            onClick={multi ? () => setExpandido(exp ? null : p.pedidowns) : undefined}
                          >
                            <TableCell>
                              {multi ? (exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}
                            </TableCell>
                            <TableCell className="font-mono">{p.pedidowns}</TableCell>
                            <TableCell className="text-xs">{p.n_pedido_cliente ?? "—"}</TableCell>
                            <TableCell className="max-w-[220px] truncate">{p.cliente_nome ?? "—"}</TableCell>
                            <TableCell>
                              {tipo ? (
                                <Badge variant={tipo.compoe_receita ? "default" : "secondary"}>
                                  {tipo.descricao}
                                </Badge>
                              ) : (
                                <Badge variant="outline">—</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {fase ? (
                                <Badge variant={corFase(fase.sequencia)}>{fase.descricao}</Badge>
                              ) : (
                                <Badge variant="outline">—</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{p.total_remessas ?? 0}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {(p.notas_fiscais ?? []).join(", ") || "—"}
                            </TableCell>
                            <TableCell className="text-right">{p.total_quantidade ?? 0}</TableCell>
                            <TableCell className="text-right font-mono">
                              <span className="inline-flex items-center gap-1 justify-end">
                                {BRL.format(p.valor_total ?? 0)}
                                {naoComporeReceita && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Não compõe receita — somente baixa de estoque
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">
                              {p.ultima_data ? DATA_FMT.format(new Date(p.ultima_data)) : "—"}
                            </TableCell>
                          </TableRow>
                          {exp && <WnsPedidoRemessasRow pedidowns={p.pedidowns} colSpan={COLS + 1} />}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="produtos">
            <WnsProdutosTable />
          </TabsContent>
        </Tabs>

        <ImportarPlanilhaWnsDialog open={dialogAberto} onOpenChange={setDialogAberto} />
      </div>
    </TooltipProvider>
  );
}
