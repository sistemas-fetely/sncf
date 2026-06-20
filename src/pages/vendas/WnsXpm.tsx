import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, ChevronRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { ImportarPlanilhaWnsDialog } from "@/components/wns/ImportarPlanilhaWnsDialog";
import { WnsPedidoRemessasRow } from "@/components/wns/WnsPedidoRemessasRow";
import { WnsProdutosTable } from "@/components/wns/WnsProdutosTable";
import {
  useWnsFases, useWnsPedidos, useWnsTiposPedido,
} from "@/hooks/wns/useWnsPedidos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA_FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const PAGE_SIZE = 20;

export default function WnsXpm() {
  const [dialogAberto, setDialogAberto] = useState(false);
  const [filtroFase, setFiltroFase] = useState("todas");
  const [filtroCanal, setFiltroCanal] = useState("todos");
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const { data: fases } = useWnsFases();
  const { data: tipos } = useWnsTiposPedido();
  const { data: pedidos, isLoading, error } = useWnsPedidos();

  const nfNumero = (nfs?: (string | number)[] | null) => {
    const s = String((nfs ?? [])[0] ?? "");
    const n = parseInt(s.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = (pedidos ?? []).filter((p: any) => {
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
      arr = [...arr].sort((a: any, b: any) => {
        const na = nfNumero(a.notas_fiscais);
        const nb = nfNumero(b.notas_fiscais);
        return sortDir === "asc" ? na - nb : nb - na;
      });
    }
    return arr;
  }, [pedidos, filtroFase, filtroCanal, busca, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const COLS = 10;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">WNS / XPM</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento de pedidos e expedição</p>
        </div>
        <Button onClick={() => setDialogAberto(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Importar planilha
        </Button>
      </div>

      <Tabs defaultValue="pedidos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filtroFase} onValueChange={(v) => { setFiltroFase(v); setPage(1); }}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as fases</SelectItem>
                {(fases ?? []).map((f: any) => (
                  <SelectItem key={f.wns_id} value={String(f.wns_id)}>{f.descricao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroCanal} onValueChange={(v) => { setFiltroCanal(v); setPage(1); }}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os canais</SelectItem>
                {(tipos ?? []).map((t: any) => (
                  <SelectItem key={t.codigo} value={String(t.codigo)}>{t.descricao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar cliente, pedido ou NF..."
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(1); }}
              className="max-w-sm"
            />
            <span className="text-sm text-muted-foreground ml-auto">
              {filtrados.length} pedido(s)
            </span>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Pedido WNS</TableHead>
                      <TableHead>Nº Cliente</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Fase atual</TableHead>
                      <TableHead className="text-right">Remessas</TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => toggleSort("nf")}
                      >
                        <span className="inline-flex items-center gap-1">
                          NFs <SortIcon col="nf" />
                        </span>
                      </TableHead>
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
                        <TableCell colSpan={COLS + 1} className="text-center text-sm text-destructive py-8">
                          Erro ao carregar pedidos. Tente recarregar a página.
                        </TableCell>
                      </TableRow>
                    ) : paginados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={COLS + 1} className="text-center text-sm text-muted-foreground py-8">
                          Nenhum pedido WNS importado ainda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginados.map((p: any) => {
                        const tipo = tipos?.find((t: any) => t.codigo === p.tipo_pedido_codigo);
                        const fase = fases?.find((f: any) => f.wns_id === p.evento_atual_wns_id);
                        const multi = (p.total_remessas ?? 0) > 1;
                        const exp = multi && expandido === p.pedidowns;
                        return (
                          <Fragment key={p.pedidowns}>
                            <TableRow
                              className={multi ? "cursor-pointer" : ""}
                              onClick={multi ? () => setExpandido(exp ? null : p.pedidowns) : undefined}
                            >
                              <TableCell>
                                {multi
                                  ? (exp
                                    ? <ChevronDown className="h-4 w-4" />
                                    : <ChevronRight className="h-4 w-4" />)
                                  : null}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{p.pedidowns}</TableCell>
                              <TableCell>{p.n_pedido_cliente ?? "—"}</TableCell>
                              <TableCell>{p.cliente_nome ?? "—"}</TableCell>
                              <TableCell>{tipo?.descricao ?? "—"}</TableCell>
                              <TableCell>{fase?.descricao ?? "—"}</TableCell>
                              <TableCell className="text-right">{p.total_remessas ?? 0}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {(p.notas_fiscais ?? []).join(", ") || "—"}
                              </TableCell>
                              <TableCell className="text-right">{p.total_quantidade ?? 0}</TableCell>
                              <TableCell className="text-right">
                                {BRL.format(p.valor_total ?? 0)}
                              </TableCell>
                              <TableCell>
                                {p.ultima_data ? DATA_FMT.format(new Date(p.ultima_data)) : "—"}
                              </TableCell>
                            </TableRow>
                            {exp && (
                              <WnsPedidoRemessasRow pedidowns={p.pedidowns} colSpan={COLS + 1} />
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {filtrados.length} pedido(s){totalPages > 1 ? ` · página ${pageSafe} de ${totalPages}` : ""}
            </span>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pageSafe <= 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={pageSafe >= totalPages}
                >
                  Próximo
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="produtos">
          <WnsProdutosTable />
        </TabsContent>
      </Tabs>

      <ImportarPlanilhaWnsDialog open={dialogAberto} onOpenChange={setDialogAberto} />
    </div>
  );
}
