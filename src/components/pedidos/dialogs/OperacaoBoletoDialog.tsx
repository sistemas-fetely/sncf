import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Receipt, Plus, X } from "lucide-react";
import { useRegistrarOperacaoPedido } from "@/hooks/pedidos/useRegistrarOperacaoPedido";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateBR = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");

interface ParcelaForm {
  numero: string;
  vencimento: string;
  valor: string;
  link_pdf: string;
}

interface Props {
  pedido_id: string;
  valor_padrao?: number;
  condicao_solicitada?: string | null;
  data_pedido?: string | null;
}

function parseCondicao(cond: string | null | undefined): number[] {
  if (!cond) return [30];
  const c = cond.toLowerCase().trim();
  if (c.includes("vista") || c === "a_vista") return [0];

  const dias = c
    .split(/[\/,;]/)
    .map((s) => s.trim().replace(/[^0-9]/g, ""))
    .filter((s) => s.length > 0)
    .map((s) => Number(s))
    .filter((n) => !isNaN(n) && n >= 0);

  return dias.length > 0 ? dias : [30];
}

function calcularVencimento(baseISO: string, dias: number): string {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function OperacaoBoletoDialog({
  pedido_id,
  valor_padrao,
  condicao_solicitada,
  data_pedido,
}: Props) {
  const [open, setOpen] = useState(false);

  const parcelasIniciais = useMemo<ParcelaForm[]>(() => {
    const dias = parseCondicao(condicao_solicitada);
    const baseDate = data_pedido || new Date().toISOString().slice(0, 10);
    const valorPorParcela = valor_padrao ? valor_padrao / dias.length : 0;

    return dias.map((d) => ({
      numero: "",
      vencimento: calcularVencimento(baseDate, d),
      valor: valorPorParcela > 0 ? valorPorParcela.toFixed(2) : "",
      link_pdf: "",
    }));
  }, [condicao_solicitada, valor_padrao, data_pedido]);

  const [parcelas, setParcelas] = useState<ParcelaForm[]>(parcelasIniciais);
  const [observacao, setObservacao] = useState("");

  const registrar = useRegistrarOperacaoPedido();

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setParcelas(parcelasIniciais);
      setObservacao("");
    }
    setOpen(v);
  };

  const updateParcela = (idx: number, patch: Partial<ParcelaForm>) => {
    setParcelas((arr) => arr.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removerParcela = (idx: number) => {
    setParcelas((arr) => arr.filter((_, i) => i !== idx));
  };

  const adicionarParcela = () => {
    const ultima = parcelas[parcelas.length - 1];
    const baseDate = ultima?.vencimento || data_pedido || new Date().toISOString().slice(0, 10);
    const novoVencimento = calcularVencimento(baseDate, 30);

    setParcelas((arr) => [
      ...arr,
      { numero: "", vencimento: novoVencimento, valor: "0.00", link_pdf: "" },
    ]);
  };

  const todasPreenchidas = parcelas.every(
    (p) => p.numero.trim() && p.vencimento && p.valor && Number(p.valor) > 0
  );
  const valorTotal = parcelas.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);

  const handleConfirm = async () => {
    if (!todasPreenchidas || parcelas.length === 0) return;

    const parcelasPayload = parcelas.map((p, i) => ({
      indice: i + 1,
      numero_boleto: p.numero.trim(),
      vencimento: p.vencimento,
      valor: Number(p.valor),
      link_pdf: p.link_pdf.trim() || undefined,
    }));

    const descricao =
      parcelas.length === 1
        ? `Boleto ${parcelas[0].numero} emitido — venc ${fmtDateBR(parcelas[0].vencimento)} — ${fmtBRL.format(Number(parcelas[0].valor))}`
        : `${parcelas.length} boletos emitidos — total ${fmtBRL.format(valorTotal)} — 1ª venc ${fmtDateBR(parcelas[0].vencimento)}`;

    const proximaAcao =
      parcelas.length === 1
        ? `Aguardar pagamento do boleto (venc ${fmtDateBR(parcelas[0].vencimento)})`
        : `Aguardar pagamento da 1ª parcela (venc ${fmtDateBR(parcelas[0].vencimento)})`;

    await registrar.mutateAsync({
      pedido_id,
      tipo_evento: "boleto_emitido",
      descricao,
      metadata: {
        total_parcelas: parcelas.length,
        valor_total: valorTotal,
        parcelas: parcelasPayload,
        observacao: observacao.trim() || undefined,
      },
      proxima_acao: proximaAcao,
    });

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
          <Receipt className="h-4 w-4" />
          Emitir boleto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar emissão de boleto(s)</DialogTitle>
          <DialogDescription>
            Boleto(s) gerado(s) externamente (banco). Cole os dados pra registrar no audit.
            {condicao_solicitada && (
              <span className="block mt-1 text-xs">
                Condição do pedido: <strong>{condicao_solicitada}</strong> ·{" "}
                {parcelasIniciais.length} parcela
                {parcelasIniciais.length > 1 ? "s" : ""} detectada
                {parcelasIniciais.length > 1 ? "s" : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {parcelas.map((p, idx) => (
            <div key={idx} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Parcela {idx + 1} de {parcelas.length}
                </span>
                {parcelas.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removerParcela(idx)}
                    className="h-7 w-7 p-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Número do boleto *</Label>
                <Input
                  value={p.numero}
                  onChange={(e) => updateParcela(idx, { numero: e.target.value })}
                  placeholder="34191.79001 01043.510047 91020.150008 8 92020000010000"
                  className="font-mono text-xs h-8"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Vencimento *</Label>
                  <Input
                    type="date"
                    value={p.vencimento}
                    onChange={(e) => updateParcela(idx, { vencimento: e.target.value })}
                    className="h-8"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Valor *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={p.valor}
                    onChange={(e) => updateParcela(idx, { valor: e.target.value })}
                    placeholder="0,00"
                    className="h-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Link do PDF (opcional)</Label>
                <Input
                  value={p.link_pdf}
                  onChange={(e) => updateParcela(idx, { link_pdf: e.target.value })}
                  placeholder="https://banco.com/boleto/abc.pdf"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={adicionarParcela}
            className="w-full gap-2"
          >
            <Plus className="h-4 w-4" />
            Adicionar parcela
          </Button>

          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm font-medium">Total</span>
            <span className="text-sm font-bold">{fmtBRL.format(valorTotal)}</span>
          </div>

          <div className="space-y-2">
            <Label>Observação geral (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Contexto adicional pro audit trail. Vale pra todas as parcelas."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={!todasPreenchidas || parcelas.length === 0 || registrar.isPending}
          >
            {registrar.isPending
              ? "Registrando..."
              : parcelas.length === 1
              ? "Registrar boleto"
              : `Registrar ${parcelas.length} boletos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
