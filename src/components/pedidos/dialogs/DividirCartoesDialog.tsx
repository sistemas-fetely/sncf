/**
 * CAPTURA-DE-CARTAO (22/09/2026). Cartão parcelado é UMA captura — as parcelas do plano
 * são os repasses da adquirente. Quando o cliente paga com dois cartões, o plano precisa
 * de duas capturas, cada uma com seu NSU. Quem valida soma, parcelas e estado pago é a
 * RPC `fn_dividir_captura_cartao`; aqui só montamos a intenção e mostramos o "depois".
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/format-currency";
import {
  useDividirCapturaCartao,
  type LinhaDepois,
} from "@/hooks/pedidos/useDividirCapturaCartao";

const fmtData = (s?: string | null) =>
  s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString("pt-BR") : "—";

interface LinhaForm {
  valor: string;
  parcelas: string;
}

interface Props {
  pedidoId: string;
  totalCartao: number;
  aberto: boolean;
  aoFechar: () => void;
}

export function DividirCartoesDialog({ pedidoId, totalCartao, aberto, aoFechar }: Props) {
  const [linhas, setLinhas] = useState<LinhaForm[]>([
    { valor: "", parcelas: "1" },
    { valor: "", parcelas: "1" },
  ]);
  const [previa, setPrevia] = useState<LinhaDepois[] | null>(null);

  const dividir = useDividirCapturaCartao();

  useEffect(() => {
    if (aberto) return;
    setLinhas([
      { valor: "", parcelas: "1" },
      { valor: "", parcelas: "1" },
    ]);
    setPrevia(null);
  }, [aberto]);

  const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

  const soma = useMemo(() => linhas.reduce((a, l) => a + num(l.valor), 0), [linhas]);
  const diferenca = Number((totalCartao - soma).toFixed(2));
  const somaBate = Math.abs(diferenca) < 0.005;

  const parcelasOk = linhas.every((l) => {
    const p = Number(l.parcelas);
    return Number.isInteger(p) && p >= 1 && p <= 24;
  });

  const podeEnviar = somaBate && parcelasOk && linhas.every((l) => num(l.valor) > 0);

  function atualizar(i: number, campo: keyof LinhaForm, v: string) {
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, [campo]: v } : l)));
    setPrevia(null);
  }

  function adicionar() {
    setLinhas((atual) => [...atual, { valor: "", parcelas: "1" }]);
    setPrevia(null);
  }

  function remover(i: number) {
    setLinhas((atual) => (atual.length <= 2 ? atual : atual.filter((_, idx) => idx !== i)));
    setPrevia(null);
  }

  const payload = () =>
    linhas.map((l) => ({ valor: num(l.valor), parcelas: Number(l.parcelas) }));

  async function prevalidar() {
    if (!podeEnviar) return;
    try {
      const res = await dividir.mutateAsync({
        pedido_id: pedidoId,
        capturas: payload(),
        simular: true,
      });
      setPrevia(res.depois ?? []);
    } catch {
      // FAIL-LOUD: a mensagem real do banco já saiu no toast do hook.
      setPrevia(null);
    }
  }

  async function aplicar() {
    if (!podeEnviar) return;
    try {
      await dividir.mutateAsync({
        pedido_id: pedidoId,
        capturas: payload(),
        simular: false,
      });
    } catch {
      return;
    }
    aoFechar();
  }

  const enviando = dividir.isPending;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v && !enviando) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Dividir entre cartões</DialogTitle>
          <DialogDescription>
            Total do plano de cartão deste pedido: {formatBRL(totalCartao)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {linhas.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`captura-valor-${i}`} className="text-xs">
                  Cartão {i + 1} · valor (R$)
                </Label>
                <Input
                  id={`captura-valor-${i}`}
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={l.valor}
                  onChange={(e) => atualizar(i, "valor", e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="w-28 space-y-1.5">
                <Label htmlFor={`captura-parcelas-${i}`} className="text-xs">Parcelas</Label>
                <Input
                  id={`captura-parcelas-${i}`}
                  type="number"
                  min={1}
                  max={24}
                  step={1}
                  value={l.parcelas}
                  onChange={(e) => atualizar(i, "parcelas", e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover cartão ${i + 1}`}
                disabled={linhas.length <= 2 || enviando}
                onClick={() => remover(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={adicionar} disabled={enviando}>
            <Plus className="h-4 w-4" /> Adicionar cartão
          </Button>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Soma dos cartões</span>
              <span className="font-medium">{formatBRL(soma)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {somaBate ? "Fecha com o total" : diferenca > 0 ? "Falta distribuir" : "Passou do total"}
              </span>
              <span className={somaBate ? "font-medium text-success" : "font-medium text-destructive"}>
                {somaBate ? formatBRL(0) : formatBRL(Math.abs(diferenca))}
              </span>
            </div>
          </div>

          {!parcelasOk && (
            <p className="text-xs text-destructive">Parcelas de cada cartão: de 1 a 24.</p>
          )}

          {previa && (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Parcela</TableHead>
                    <TableHead>Cartão</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.map((d, i) => (
                    <TableRow key={`${d.parcela}-${i}`}>
                      <TableCell className="font-mono text-xs">{d.parcela ?? "—"}</TableCell>
                      <TableCell>Cartão {d.captura ?? "—"}</TableCell>
                      <TableCell>{formatBRL(Number(d.valor ?? 0))}</TableCell>
                      <TableCell className="text-sm">{fmtData(d.data)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Cartão parcelado é uma captura só — as parcelas são os repasses da adquirente.
            Cada cartão tem seu próprio NSU.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button variant="outline" onClick={prevalidar} disabled={!podeEnviar || enviando}>
            {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Pré-visualizar
          </Button>
          <Button
            onClick={aplicar}
            disabled={!podeEnviar || enviando}
            title={podeEnviar ? undefined : "A soma dos cartões precisa bater com o total do plano."}
          >
            {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Aplicar divisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
