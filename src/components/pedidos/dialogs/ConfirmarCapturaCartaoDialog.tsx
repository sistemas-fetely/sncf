import { useMemo, useState } from "react";
import { Loader2, AlertTriangle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useConfirmarPagamentoLinha } from "@/hooks/pedidos/useConfirmarPagamentoLinha";
import type { LinhaPlanoAberta } from "@/hooks/pedidos/usePlanoAbertoPedido";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtData(iso: string | null): string {
  if (!iso) return "sem vencimento";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function rotuloParcela(l: LinhaPlanoAberta, meio?: string): string {
  const parcela = l.numero_parcela
    ? `Parcela ${l.numero_parcela}${l.total_parcelas ? `/${l.total_parcelas}` : ""}`
    : "Parcela";
  return [parcela, meio, fmtBRL.format(l.valor), `vence ${fmtData(l.data_prevista)}`]
    .filter(Boolean)
    .join(" · ");
}

interface Props {
  /** Parcelas de cartão em aberto do pedido, em ordem de parcela. */
  linhas: LinhaPlanoAberta[];
  /** Texto de qual meio ainda falta depois desta captura (só toast). */
  faltaLabel?: string | null;
}

/**
 * Cartão parcelado não são N cobranças: é UMA captura cujo repasse a adquirente
 * fatia. A tela chama a RPC UMA vez — a propagação para as parcelas irmãs
 * acontece no banco.
 */
export function ConfirmarCapturaCartaoDialog({ linhas, faltaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [nsu, setNsu] = useState("");
  const [semNsu, setSemNsu] = useState(false);
  const [dataCaptura, setDataCaptura] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [observacao, setObservacao] = useState("");

  const confirmar = useConfirmarPagamentoLinha();

  const ordenadas = useMemo(
    () => [...linhas].sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0)),
    [linhas],
  );
  const primeira = ordenadas[0];
  const total = ordenadas.reduce((s, l) => s + l.valor, 0);
  const nsuFaltando = !semNsu && !nsu.trim();

  const handleConfirmar = async () => {
    if (!primeira) return;
    try {
      await confirmar.mutateAsync({
        provisao_id: primeira.id,
        prova_tipo: semNsu ? "manual" : "cartao_nsu",
        prova_ref: semNsu ? null : nsu,
        data_pagamento: dataCaptura,
        observacao,
        falta_label: faltaLabel ?? null,
      });
    } catch {
      return; // toast de erro já sai do hook
    }
    setOpen(false);
    setNsu("");
    setSemNsu(false);
    setObservacao("");
    setDataCaptura(new Date().toISOString().slice(0, 10));
  };

  if (!primeira) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!confirmar.isPending) setOpen(v); }}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <CreditCard className="h-4 w-4 mr-2" aria-hidden="true" />
          Confirmar captura do cartão
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar captura do cartão</DialogTitle>
          <DialogDescription>
            Cartão é captura única. Confirmar aqui quita as{" "}
            <span className="font-medium text-foreground">{ordenadas.length} parcela(s)</span> de uma
            vez — as datas das parcelas seguintes são repasses da adquirente, não novos pagamentos do
            cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border">
            <ul className="divide-y">
              {ordenadas.map((l) => (
                <li key={l.id} className="px-3 py-2 text-sm">
                  {rotuloParcela(l)}
                </li>
              ))}
            </ul>
            <div className="border-t px-3 py-2 text-sm flex justify-between bg-muted/40">
              <span className="text-muted-foreground">Total a confirmar</span>
              <span className="font-medium tabular-nums">{fmtBRL.format(total)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nsu-captura">NSU da captura</Label>
            <Input
              id="nsu-captura"
              value={nsu}
              disabled={semNsu}
              onChange={(e) => setNsu(e.target.value)}
              placeholder="NSU / código de autorização"
            />
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="sem-nsu"
                checked={semNsu}
                onCheckedChange={(v) => setSemNsu(v === true)}
              />
              <Label htmlFor="sem-nsu" className="text-xs text-muted-foreground">
                Não tenho o NSU agora (registrar como confirmação manual)
              </Label>
            </div>
            {semNsu && (
              <div className="rounded-md bg-warning/10 border border-warning/40 p-3 text-sm text-warning flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Sem NSU, a confirmação entra como prova <span className="font-medium">manual</span>.
                  O pedido anda, mas não conta como confirmado pelo meio.
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-captura">Data da captura</Label>
            <Input
              id="data-captura"
              type="date"
              value={dataCaptura}
              onChange={(e) => setDataCaptura(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="obs-captura">Observação (opcional)</Label>
            <Textarea
              id="obs-captura"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: captura na maquininha SafraPay, 4x sem juros"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={confirmar.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={confirmar.isPending || nsuFaltando || !dataCaptura}>
            {confirmar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar captura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
