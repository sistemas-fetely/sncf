import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CreditCard, RefreshCw } from "lucide-react";
import { useRegistrarOperacaoPedido } from "@/hooks/pedidos/useRegistrarOperacaoPedido";

interface Props {
  pedido_id: string;
  contato_email?: string | null;
  contato_telefone?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ultimo_evento?: any | null;
}

const METODOS = ["Email", "WhatsApp", "SMS", "Outro"] as const;
type Metodo = typeof METODOS[number];

export function OperacaoCartaoDialog({
  pedido_id, contato_email, contato_telefone, ultimo_evento,
}: Props) {
  const isAtualizacao = !!ultimo_evento;
  const meta = ultimo_evento?.metadata || {};

  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("WhatsApp");
  const [contato, setContato] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    if (isAtualizacao) {
      setLink(String(meta.link || ""));
      setMetodo((METODOS.includes(meta.metodo) ? meta.metodo : "WhatsApp") as Metodo);
      setContato(String(meta.contato || ""));
      setObservacao("");
    } else {
      setLink("");
      setMetodo("WhatsApp");
      setContato(contato_telefone || "");
      setObservacao("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const registrar = useRegistrarOperacaoPedido();

  const handleMetodoChange = (m: Metodo) => {
    setMetodo(m);
    if (m === "Email" && contato_email) setContato(contato_email);
    else if (["WhatsApp", "SMS"].includes(m) && contato_telefone) setContato(contato_telefone);
  };

  const handleConfirm = async () => {
    if (!link.trim() || !contato.trim()) return;

    await registrar.mutateAsync({
      pedido_id,
      tipo_evento: isAtualizacao ? "link_cartao_atualizado" : "link_cartao_enviado",
      descricao: isAtualizacao
        ? `Link de cartão atualizado — enviado por ${metodo} para ${contato}`
        : `Link enviado por ${metodo} para ${contato}`,
      metadata: {
        link: link.trim(),
        metodo,
        contato: contato.trim(),
        observacao: observacao.trim() || undefined,
        evento_anterior_id: isAtualizacao ? ultimo_evento.id : undefined,
      },
      proxima_acao: "Aguardar confirmação do pagamento",
    });

    setOpen(false);
  };

  const btnClass = isAtualizacao
    ? "gap-2 bg-blue-700 hover:bg-blue-800 text-white"
    : "gap-2 bg-blue-600 hover:bg-blue-700 text-white";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className={btnClass}>
          {isAtualizacao ? <RefreshCw className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
          {isAtualizacao ? "Atualizar link" : "Enviar link de pagamento"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isAtualizacao ? "Atualizar link de pagamento" : "Enviar link de pagamento por cartão"}
          </DialogTitle>
          <DialogDescription>
            {isAtualizacao
              ? "Cliente pediu mudança? Atualize o link/método/contato. Registra novo evento na timeline."
              : "Cole o link gerado no gateway externo. O sistema registra o envio."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Link do pagamento *</Label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://gateway.com/pagamento/abc123"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Método de envio *</Label>
              <Select value={metodo} onValueChange={(v) => handleMetodoChange(v as Metodo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METODOS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contato *</Label>
              <Input
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                placeholder={metodo === "Email" ? "cliente@email.com" : "(11) 99999-9999"}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{isAtualizacao ? "Motivo da atualização" : "Observação (opcional)"}</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={isAtualizacao ? "Ex: cliente pediu pra enviar pelo email" : "Algum contexto adicional pro audit trail."}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={!link.trim() || !contato.trim() || registrar.isPending}
          >
            {registrar.isPending ? "Registrando..." : isAtualizacao ? "Registrar atualização" : "Registrar envio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
