import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { formatBRL } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { mascaraCpf } from "@/lib/documentos/cpf";

export interface ItemPagamentoLote {
  movimentacao_id: string;
  favorecido_nome: string | null;
  favorecido_documento: string | null;
  valor: number;
  modalidade: string | null;
  data_pagamento: string | null;
}
export function LotePagamentosBadge({ itens }: { itens: ItemPagamentoLote[] | undefined }) {
  if (!itens?.length) return null;
  const total = itens.reduce((s, i) => s + Math.round(Number(i.valor) * 100), 0) / 100;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto max-w-full p-0 hover:bg-transparent" onClick={e => e.stopPropagation()}>
          <Badge variant="outline" className="font-normal whitespace-normal text-left border-primary/30 bg-primary/5 text-primary">Lote · {itens.length} pagamentos</Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[440px] max-w-[calc(100vw-2rem)] bg-card p-0" onClick={e => e.stopPropagation()}>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table className="table-fixed w-full" containerClassName="overflow-visible">
            <TableHeader><TableRow><TableHead className="w-[68%]">Favorecido</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>{itens.map((item, idx) => {
              const d = (item.favorecido_documento ?? "").replace(/\D/g, "");
              return <TableRow key={idx}>
                <TableCell className="break-words text-xs"><div>{item.favorecido_nome ?? "—"}</div><div className="text-muted-foreground">{d.length === 11 ? mascaraCpf(d) : d.length === 14 ? formatCNPJ(d) : d || "—"}</div></TableCell>
                <TableCell className="font-mono text-right text-xs break-words">{formatBRL(Number(item.valor))}</TableCell>
              </TableRow>;
            })}</TableBody>
            <TableFooter><TableRow><TableCell>Total</TableCell><TableCell className="text-right font-mono text-xs">{formatBRL(total)}</TableCell></TableRow></TableFooter>
          </Table>
        </div>
      </PopoverContent>
    </Popover>
  );
}
