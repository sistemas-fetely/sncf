import { useMemo, useState } from "react";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterInput } from "@/components/ui/filter-input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Search, Undo2, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  useDevolucoesRetornoPendente,
  type RetornoPendentePedido,
} from "@/hooks/estoque/useDevolucoesRetornoPendente";
import { ConferirRetornoDialog } from "@/components/estoque/ConferirRetornoDialog";

function formatNum(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(Number(v ?? 0));
}

export default function RetornoDevolucao() {
  const { data: pedidos = [], isLoading, isFetching, refetch } = useDevolucoesRetornoPendente();
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<RetornoPendentePedido | null>(null);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pedidos;
    return pedidos.filter(
      (p) =>
        p.id_externo?.toLowerCase().includes(q) ||
        p.nf?.toLowerCase().includes(q) ||
        p.itens.some(
          (i) =>
            i.sku.toLowerCase().includes(q) ||
            i.nome_comercial?.toLowerCase().includes(q),
        ),
    );
  }, [pedidos, busca]);

  const totalUnidades = pedidos.reduce((s, p) => s + p.unidades_pendentes, 0);
  const totalValor = pedidos.reduce((s, p) => s + p.valor_custo_pendente, 0);

  // mantém o pedido aberto sincronizado com o refetch da view
  const pedidoAberto = selecionado
    ? pedidos.find((p) => p.pedido_id === selecionado.pedido_id) ?? null
    : null;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs" },
          { label: "Produto" },
          { label: "Estoque" },
          { label: "Retorno de devolução" },
        ]}
        title="Conferência de retorno de devolução"
        subtitle="Mercadoria devolvida só volta ao estoque depois da conferência física. Retorno parcial é normal."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs text-muted-foreground">Pedidos aguardando conferência</div>
          <div className="text-2xl font-semibold tabular-nums">{formatNum(pedidos.length)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs text-muted-foreground">Unidades pendentes</div>
          <div className="text-2xl font-semibold tabular-nums">{formatNum(totalUnidades)}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs text-muted-foreground">Custo parado</div>
          <div className="text-2xl font-semibold tabular-nums">{formatBRL(totalValor)}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <FilterInput
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por pedido, NF, SKU ou produto"
            className="pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtrados.length} {filtrados.length === 1 ? "pedido" : "pedidos"}
        </span>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Pedido</TableHead>
              <TableHead className="w-[130px]">NF de saída</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="w-[130px]">Devolvido em</TableHead>
              <TableHead className="text-right w-[110px]">Esperando</TableHead>
              <TableHead className="text-right w-[110px]">Unidades</TableHead>
              <TableHead className="text-right w-[130px]">Custo pendente</TableHead>
              <TableHead className="w-[130px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <PackageCheck className="h-5 w-5 mx-auto mb-2 opacity-60" />
                  Nenhuma devolução aguardando conferência.
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((p) => (
                <TableRow key={p.pedido_id}>
                  <TableCell className="font-medium">{p.id_externo ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{p.nf ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                    {p.motivo ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">{formatDateBR(p.devolvido_em)}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal tabular-nums",
                        (p.dias_esperando ?? 0) >= 30
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : (p.dias_esperando ?? 0) >= 7
                            ? "bg-warning/10 text-warning border-warning/20"
                            : "bg-muted text-muted-foreground border-border",
                      )}
                    >
                      {formatNum(p.dias_esperando)} d
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatNum(p.unidades_pendentes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBRL(p.valor_custo_pendente)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" className="gap-2" onClick={() => setSelecionado(p)}>
                      <Undo2 className="h-4 w-4" />
                      Conferir
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConferirRetornoDialog
        open={!!selecionado}
        onOpenChange={(v) => { if (!v) setSelecionado(null); }}
        pedido={pedidoAberto}
      />
    </div>
  );
}
