import { useState } from "react";
import type { ReactNode } from "react";
import { CodProduto } from "@/components/produto/CodProduto";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { filtrarItensDevolucao, type ItemGavetaDevolucao } from "@/lib/devolucao/gavetaDevolucao";

const numero = (v: number | null) => new Intl.NumberFormat("pt-BR").format(v ?? 0);

export function ItensGavetaDevolucao({ itens, skus, declarada, retornada, acao }: {
  itens: ItemGavetaDevolucao[];
  skus: number | null;
  declarada: number | null;
  retornada: number | null;
  acao?: ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const filtrados = filtrarItensDevolucao(itens, busca, soPendentes);
  return (
    <section className="min-w-0 space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Itens</h3>
          <p className="text-xs text-muted-foreground tabular-nums">{numero(skus)} SKUs · declarado {numero(declarada)} × retornado {numero(retornada)}</p>
        </div>
        {acao}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Buscar itens por SKU ou nome" placeholder="Buscar SKU ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-8 min-w-0 flex-1 basis-40" />
        <label className="flex shrink-0 items-center gap-2 text-xs"><Switch checked={soPendentes} onCheckedChange={setSoPendentes} />Só pendentes</label>
      </div>
      <Table containerClassName="max-h-80 overflow-auto rounded-md border" className="table-fixed text-xs">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-[24%]">SKU</TableHead><TableHead className="w-[31%]">Produto</TableHead>
            <TableHead className="w-[13%] px-1 text-right">Saiu</TableHead><TableHead className="w-[13%] px-1 text-right">Voltou</TableHead><TableHead className="w-[19%] px-1 text-right">Pendente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtrados.map((i) => <TableRow key={i.sku} className={cn(i.qtd_pendente > 0 && "bg-warning/5")}>
            <TableCell className="break-all px-2"><CodProduto chave={i.sku} variant="compacto" /></TableCell>
            <TableCell className="break-words px-2">{i.nome_comercial ?? "—"}</TableCell>
            <TableCell className="px-1 text-right tabular-nums">{numero(i.qtd_saiu)}</TableCell>
            <TableCell className="px-1 text-right tabular-nums">{numero(i.qtd_ja_retornada)}</TableCell>
            <TableCell className={cn("px-1 text-right tabular-nums", i.qtd_pendente > 0 && "font-medium text-warning")}>{numero(i.qtd_pendente)}</TableCell>
          </TableRow>)}
          {!filtrados.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum item encontrado.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </section>
  );
}