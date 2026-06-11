import { useMemo, useState } from "react";
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
import { Info } from "lucide-react";
import { useWnsSkus } from "@/hooks/wns/useWnsSkus";
import { useWnsTiposPedido } from "@/hooks/wns/useWnsPedidos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function WnsProdutosTable() {
  const [filtroCanal, setFiltroCanal] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const { data: tipos } = useWnsTiposPedido();
  const { data: skus, isLoading, error } = useWnsSkus();

  const tiposPorCodigo = useMemo(() => {
    const m = new Map<number, { descricao: string; compoe_receita: boolean }>();
    (tipos ?? []).forEach((t) => m.set(t.codigo, { descricao: t.descricao, compoe_receita: t.compoe_receita }));
    return m;
  }, [tipos]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (skus ?? []).filter((s) => {
      if (filtroCanal !== "todos" && String(s.tipo_pedido_codigo ?? "") !== filtroCanal) return false;
      if (q && !s.sku.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [skus, filtroCanal, busca]);

  const resumo = useMemo(() => {
    const skusDistintos = new Set(filtradas.map((s) => s.sku)).size;
    let qtdVenda = 0;
    let valorVenda = 0;
    filtradas.forEach((s) => {
      const t = s.tipo_pedido_codigo != null ? tiposPorCodigo.get(s.tipo_pedido_codigo) : null;
      if (t?.compoe_receita) {
        qtdVenda += Number(s.total_quantidade ?? 0);
        valorVenda += Number(s.valor_total ?? 0);
      }
    });
    return { skusDistintos, qtdVenda, valorVenda };
  }, [filtradas, tiposPorCodigo]);

  const COLS = 6;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">SKUs distintos</div>
              <div className="text-2xl font-semibold">{resumo.skusDistintos}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Quantidade vendida</div>
              <div className="text-2xl font-semibold">{resumo.qtdVenda}</div>
              <div className="text-[10px] text-muted-foreground">somente canais de venda</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Valor vendido</div>
              <div className="text-2xl font-semibold">{BRL.format(resumo.valorVenda)}</div>
              <div className="text-[10px] text-muted-foreground">somente canais de venda</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
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
            placeholder="Buscar SKU…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-sm"
          />
          <div className="ml-auto text-xs text-muted-foreground">
            {filtradas.length} linha(s)
          </div>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Remessas</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: COLS }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={COLS} className="text-center text-destructive py-8">
                    Erro ao carregar produtos: {(error as Error).message}
                  </TableCell>
                </TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLS} className="text-center text-muted-foreground py-10">
                    Nenhum produto importado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                filtradas.map((s, idx) => {
                  const t = s.tipo_pedido_codigo != null ? tiposPorCodigo.get(s.tipo_pedido_codigo) : null;
                  const naoComporeReceita = t && !t.compoe_receita;
                  return (
                    <TableRow key={`${s.sku}-${s.tipo_pedido_codigo ?? "x"}-${idx}`}>
                      <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                      <TableCell>
                        {t ? (
                          <Badge variant={t.compoe_receita ? "default" : "secondary"}>{t.descricao}</Badge>
                        ) : (
                          <Badge variant="outline">—</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{s.total_pedidos ?? 0}</TableCell>
                      <TableCell className="text-right">{s.total_remessas ?? 0}</TableCell>
                      <TableCell className="text-right">{s.total_quantidade ?? 0}</TableCell>
                      <TableCell className={`text-right font-mono ${naoComporeReceita ? "text-muted-foreground" : ""}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {BRL.format(Number(s.valor_total ?? 0))}
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
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </TooltipProvider>
  );
}
