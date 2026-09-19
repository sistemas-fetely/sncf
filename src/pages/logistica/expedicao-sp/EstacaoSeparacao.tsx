import { ArrowRight, Loader2, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selo } from "@/components/ui/selo";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { ItemPedidoMesa } from "./tipos";

/**
 * Estação 2 — Separação. Picking list puro: o que pegar da prateleira.
 * NÃO existe RPC de "separação concluída": quem prova a separação é a
 * conferência por bipagem. Por isso o botão daqui só NAVEGA para a estação 3.
 */
interface Props {
  itens: ItemPedidoMesa[];
  carregando: boolean;
  onConcluir: () => void;
}

export function EstacaoSeparacao({ itens, carregando, onConcluir }: Props) {
  const totalPecas = itens.reduce((s, i) => s + i.quantidade, 0);

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando a picking list…
        </CardContent>
      </Card>
    );
  }

  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone={PackageSearch}
        titulo="Pedido sem itens"
        mensagem="Este pedido não tem linhas em pedido_itens. Confira a origem antes de separar — não há o que bipar."
      />
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Picking list · {itens.length} {itens.length === 1 ? "linha" : "linhas"} · {totalPecas} peças
          </p>
          <Button onClick={onConcluir}>
            Concluir separação
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[9rem]">SKU</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-[10rem]">EAN</TableHead>
              <TableHead className="w-[5rem] text-right">Qtd</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs">{i.sku ?? "—"}</TableCell>
                <TableCell className="text-sm">{i.descricao}</TableCell>
                <TableCell className="font-mono text-xs">
                  {i.ean ?? (
                    // Sem EAN o item não pode ser bipado. Dizer isso agora, na
                    // prateleira, é mais barato do que descobrir na conferência.
                    <Selo estado="warning">sem EAN</Selo>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{i.quantidade}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
