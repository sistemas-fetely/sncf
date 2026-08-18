import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useConfirmarCartaoCapturado } from "@/hooks/pedidos/useConfirmarCartaoCapturado";
import { useCriarTarefa } from "@/hooks/pedidos/usePedidoTarefas";
import { toast } from "@/hooks/use-toast";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  pedidoId: string;
  /** Quantidade de parcelas de cartão ainda em aberto. */
  parcelasAbertas: number;
  /** Soma das parcelas de cartão ainda em aberto. */
  valorAberto: number;
  triggerLabel?: string;
}

export function ConfirmarCartaoCapturadoDialog({
  pedidoId,
  parcelasAbertas,
  valorAberto,
  triggerLabel = "Cartão capturado",
}: Props) {
  const [open, setOpen] = useState(false);
  const [nsu, setNsu] = useState("");
  const [dataCaptura, setDataCaptura] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [valorCapturado, setValorCapturado] = useState<string>("");
  const [observacao, setObservacao] = useState("");

  const confirmar = useConfirmarCartaoCapturado();
  const criarTarefa = useCriarTarefa();

  // PROVA-DE-CARTAO-E-O-NSU: nao existe captura anonima. Sem NSU o pedido segue em
  // Aguardando Pagamento e a falta vira pendencia — nenhuma RPC de pagamento roda aqui.
  const handleRegistrarPendencia = async () => {
    try {
      await criarTarefa.mutateAsync({
        pedidoId: pedidoId,
        titulo: "Informar NSU da captura do cartão (pedido segue em Aguardando Pagamento)",
      });
    } catch (e: any) {
      toast({
        title: "Não foi possível registrar a pendência",
        description: e?.message ?? "Erro desconhecido",
        variant: "destructive",
      });
      throw e;
    }
    toast({
      title: "Pendência registrada",
      description:
        "O pedido continua em Aguardando Pagamento até o NSU ser informado. O NSU está no comprovante da maquininha e no portal SafraPay — sempre recuperável.",
    });
    setOpen(false);
  };

  const handleConfirmar = async () => {
    const valorNum = valorCapturado.trim() === "" ? null : Number(valorCapturado.replace(",", "."));
    try {
      await confirmar.mutateAsync({
        pedido_id: pedidoId,
        nsu,
        data_captura: dataCaptura,
        valor_capturado: valorNum !== null && Number.isFinite(valorNum) ? valorNum : null,
        observacao,
      });
    } catch {
      // O toast de erro já sai do hook — manter o diálogo aberto com os dados.
      return;
    }
    setOpen(false);
    setNsu("");
    setValorCapturado("");
    setObservacao("");
    setDataCaptura(new Date().toISOString().slice(0, 10));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!confirmar.isPending) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CreditCard className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar captura do cartão</DialogTitle>
          <DialogDescription>
            As parcelas do cartão são datas de repasse da operadora, não novas cobranças do cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground">
              {parcelasAbertas} parcela(s) de cartão em aberto · {fmtBRL.format(valorAberto)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Uma captura fecha todas as parcelas de uma vez.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nsu-cartao">NSU da captura</Label>
            <Input
              id="nsu-cartao"
              value={nsu}
              onChange={(e) => setNsu(e.target.value)}
              placeholder="Ex.: 123456789"
            />
            <p className="text-xs text-muted-foreground">
              O NSU é a prova da captura. Sem ele, o crédito da adquirente não encontra este
              pedido na conciliação.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-captura-cartao">Data da captura</Label>
            <Input
              id="data-captura-cartao"
              type="date"
              value={dataCaptura}
              onChange={(e) => setDataCaptura(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor-captura-cartao">Valor capturado</Label>
            <Input
              id="valor-captura-cartao"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={valorCapturado}
              onChange={(e) => setValorCapturado(e.target.value)}
              placeholder={valorAberto ? valorAberto.toFixed(2) : "0,00"}
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Se preencher, o sistema confere com o valor das parcelas antes de confirmar.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacao-cartao">Observação (opcional)</Label>
            <Textarea
              id="observacao-cartao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: capturado na maquininha da loja"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegistrarPendencia}
            disabled={confirmar.isPending || criarTarefa.isPending}
          >
            {criarTarefa.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Não tenho o NSU — registrar pendência
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={confirmar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={confirmar.isPending || !nsu.trim() || !dataCaptura}
          >
            {confirmar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar captura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
