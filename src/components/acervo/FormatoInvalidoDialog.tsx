import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface AlertaFormato { cod_cadastro: string; sku: string | null; colecao: string | null; fase: string | null; campo: string; valor: string | null; regra: string | null; motivo: string }

interface Props { open: boolean; onOpenChange: (v: boolean) => void; alertas: AlertaFormato[]; erro?: string | null; onExportar: (cods: string[]) => void }

export function FormatoInvalidoDialog({ open, onOpenChange, alertas, erro, onExportar }: Props) {
  const [inativos, setInativos] = useState(false);
  const linhas = useMemo(() => alertas.filter((a) => inativos || a.fase !== "inativo"), [alertas, inativos]);
  const cods = useMemo(() => [...new Set(linhas.map((a) => a.cod_cadastro))], [linhas]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Formato inválido</DialogTitle>
          <DialogDescription>{cods.length} produto(s) · {linhas.length} campo(s) fora do formato da ficha.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={inativos} onCheckedChange={(v) => setInativos(v === true)} /> Incluir inativos
        </label>
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background"><TableRow><TableHead>Produto</TableHead><TableHead>Campo</TableHead><TableHead>Valor</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
            <TableBody>
              {linhas.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum produto com formato inválido.</TableCell></TableRow>}
              {linhas.map((a, i) => (
                <TableRow key={`${a.cod_cadastro}-${a.campo}-${i}`}>
                  <TableCell><div className="font-mono text-xs">{a.cod_cadastro}</div><div className="text-xs text-muted-foreground">{a.sku ?? "—"} · {a.colecao ?? "—"} · {a.fase ?? "—"}</div></TableCell>
                  <TableCell className="text-sm">{a.campo}</TableCell>
                  <TableCell className="font-mono text-xs">{a.valor ?? "—"}</TableCell>
                  <TableCell className="text-sm">{a.motivo}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!cods.length} onClick={() => onExportar(cods)}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar planilha destes produtos</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
