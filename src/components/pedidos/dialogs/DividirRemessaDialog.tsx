import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, PackageOpen } from "lucide-react";
import { useDividirRemessa } from "@/hooks/pedidos/useDividirRemessa";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface ItemRemessa {
  descricao?: string;
  sku?: string;
  quantidade: number;
  valor_unitario: number;
}

interface Props {
  remessaId: string;
  pedidoId: string;
  codigo: string;
  itens: ItemRemessa[];
  /** Rótulo do botão que abre o diálogo. Default: "Dividir". */
  triggerLabel?: string;
  /** title do botão (id completo da remessa em colunas estreitas). */
  triggerTitle?: string;
  /** Botão de largura cheia (uso na coluna AÇÕES). */
  triggerFullWidth?: boolean;
}


export function DividirRemessaDialog({ remessaId, pedidoId, codigo, itens, triggerLabel, triggerTitle, triggerFullWidth }: Props) {
  const [open, setOpen] = useState(false);
  const [mover, setMover] = useState(() => itens.map(() => 0));
  const dividir = useDividirRemessa();

  const reset = () => setMover(itens.map(() => 0));

  const setQtd = (i: number, v: number) => {
    setMover((prev) => {
      const next = [...prev];
      const max = itens[i]?.quantidade ?? 0;
      next[i] = Math.max(0, Math.min(max, Math.floor(v || 0)));
      return next;
    });
  };

  const valorNova = itens.reduce((s, it, i) => s + mover[i] * (it.valor_unitario ?? 0), 0);
  const valorFica = itens.reduce(
    (s, it, i) => s + (it.quantidade - mover[i]) * (it.valor_unitario ?? 0),
    0
  );
  const totalMovido = mover.reduce((s, q) => s + q, 0);
  const totalFica = itens.reduce((s, it, i) => s + (it.quantidade - mover[i]), 0);
  const podeConfirmar = totalMovido > 0 && totalFica > 0 && !dividir.isPending;

  const handleConfirmar = () => {
    const itensParaNova = itens
      .map((_, i) => ({ indice: i, quantidade: mover[i] }))
      .filter((x) => x.quantidade > 0);
    dividir.mutate(
      { remessaOrigemId: remessaId, pedidoId, itensParaNova },
      { onSuccess: () => { setOpen(false); reset(); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={triggerFullWidth ? "w-full gap-1.5" : "gap-1"}
          title={triggerTitle}
        >
          <PackageOpen className="h-3.5 w-3.5 shrink-0" />
          {triggerLabel ?? "Dividir"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dividir {codigo}</DialogTitle>
          <DialogDescription>
            Quanto de cada item sai para uma nova tentativa de envio. O que sobrar continua nesta. O frete é
            rateado proporcional ao valor de cada uma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {itens.map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {it.descricao ?? it.sku ?? "Item"}
                </p>
                <p className="text-xs text-muted-foreground">
                  de {it.quantidade} · {fmtBRL.format(it.valor_unitario ?? 0)}/un
                </p>
              </div>
              <Input
                type="number"
                min={0}
                max={it.quantidade}
                value={mover[i]}
                onChange={(e) => setQtd(i, Number(e.target.value))}
                className="w-20 text-right"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground text-xs">Fica em {codigo}</p>
            <p className="font-medium">{fmtBRL.format(valorFica)}</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground text-xs">Vai pra nova tentativa</p>
            <p className="font-medium">{fmtBRL.format(valorNova)}</p>
          </div>
        </div>

        {totalMovido > 0 && totalFica === 0 && (
          <div className="text-sm text-warning bg-warning/10 border border-warning/40 rounded-md p-2">
            Não dá pra mover tudo — ao menos um item precisa ficar nesta tentativa. Pra mandar tudo,
            use o envio normal.
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={dividir.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!podeConfirmar}>
            {dividir.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />Dividindo…</>
            ) : (
              "Criar nova tentativa"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
