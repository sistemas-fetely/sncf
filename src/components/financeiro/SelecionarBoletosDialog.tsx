import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { Loader2 } from "lucide-react";

export interface BoletoStageDoc {
  id: string;
  arquivo_nome: string | null;
  valor: number | null;
  data_vencimento: string | null;
  linha_digitavel: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fornecedor: string;
  boletos: BoletoStageDoc[];
  onConfirmar: (boletosSelecionados: BoletoStageDoc[]) => void | Promise<void>;
  processando?: boolean;
}

export function SelecionarBoletosDialog({
  open,
  onOpenChange,
  fornecedor,
  boletos,
  onConfirmar,
  processando = false,
}: Props) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(
    new Set(boletos.map((b) => b.id)),
  );

  const totalSelecionado = useMemo(() => {
    return boletos
      .filter((b) => selecionadas.has(b.id))
      .reduce((sum, b) => sum + (b.valor || 0), 0);
  }, [boletos, selecionadas]);

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(value: boolean) {
    if (value) setSelecionadas(new Set(boletos.map((b) => b.id)));
    else setSelecionadas(new Set());
  }

  async function confirmar() {
    const sel = boletos.filter((b) => selecionadas.has(b.id));
    if (sel.length === 0) return;
    await onConfirmar(sel);
  }

  const todasMarcadas = selecionadas.size === boletos.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Selecionar boletos para lançar</DialogTitle>
          <DialogDescription>
            {fornecedor} — {boletos.length} boleto{boletos.length === 1 ? "" : "s"} no
            repositório. Marque os que deseja lançar como despesa em Contas a Pagar.
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={todasMarcadas}
                    onCheckedChange={(v) => toggleAll(!!v)}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boletos.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Checkbox
                      checked={selecionadas.has(b.id)}
                      onCheckedChange={() => toggle(b.id)}
                    />
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate">
                    {b.arquivo_nome || "—"}
                  </TableCell>
                  <TableCell>{formatDateBR(b.data_vencimento)}</TableCell>
                  <TableCell className="text-right">
                    {b.valor != null ? formatBRL(b.valor) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="flex sm:justify-between gap-3 items-center">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{selecionadas.size}</span> de{" "}
            {boletos.length} selecionado{selecionadas.size === 1 ? "" : "s"} ·{" "}
            <span className="font-medium text-foreground">
              {formatBRL(totalSelecionado)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={processando}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmar}
              disabled={processando || selecionadas.size === 0}
            >
              {processando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Lançar {selecionadas.size > 0 ? `${selecionadas.size} ` : ""}
              despesa{selecionadas.size === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
