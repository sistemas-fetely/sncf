import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { QrCode, RefreshCw } from "lucide-react";
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

export function OperacaoPixDialog({
  pedido_id, contato_email, contato_telefone, ultimo_evento,
}: Props) {
  const isAtualizacao = !!ultimo_evento;
  const meta = ultimo_evento?.metadata || {};

  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<"chave" | "qr">("chave");
  const [dados, setDados] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("WhatsApp");
  const [contato, setContato] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    if (isAtualizacao) {
      setTipo(meta.tipo === "qr" ? "qr" : "chave");
      setDados(String(meta.dados || ""));
      setMetodo((METODOS.includes(meta.metodo) ? meta.metodo : "WhatsApp") as Metodo);
      setContato(String(meta.contato || ""));
      setObservacao("");
    } else {
      setTipo("chave");
      setDados("");
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
    if (!dados.trim() || !contato.trim()) return;

    const tipoLabel = tipo === "chave" ? "Chave PIX" : "QR Code copia-e-cola";

    await registrar.mutateAsync({
      pedido_id,
      tipo_evento: isAtualizacao ? "pix_atualizado" : "pix_enviado",
      descricao: isAtualizacao
        ? `PIX atualizado — ${tipoLabel} enviada por ${metodo} para ${contato}`
        : `${tipoLabel} enviada por ${metodo} para ${contato}`,
      metadata: {
        tipo,
        dados: dados.trim(),
        metodo,
        contato: contato.trim(),
        observacao: observacao.trim() || undefined,
        evento_anterior_id: isAtualizacao ? ultimo_evento.id : undefined,
      },
      proxima_acao: "Aguardar confirmação do pagamento PIX",
    });

    setOpen(false);
  };

  const btnClass = isAtualizacao
    ? "gap-2 bg-cyan-700 hover:bg-cyan-800 text-white"
    : "gap-2 bg-cyan-600 hover:bg-cyan-700 text-white";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className={btnClass}>
          {isAtualizacao ? <RefreshCw className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
          {isAtualizacao ? "Atualizar PIX" : "Enviar PIX"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isAtualizacao ? "Atualizar PIX" : "Enviar PIX"}</DialogTitle>
          <DialogDescription>
            {isAtualizacao
              ? "Atualizar chave/QR ou método de envio. Registra novo evento na timeline."
              : "Registra o envio da chave PIX ou QR Code copia-e-cola pro cliente."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as "chave" | "qr")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="chave" id="pix-chave" />
                <Label htmlFor="pix-chave" className="font-normal cursor-pointer">
                  Chave PIX (CNPJ / e-mail / telefone / aleatória)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="qr" id="pix-qr" />
                <Label htmlFor="pix-qr" className="font-normal cursor-pointer">
                  QR Code copia-e-cola (PIX dinâmico)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>{tipo === "chave" ? "Chave PIX *" : "Código copia-e-cola *"}</Label>
            {tipo === "chave" ? (
              <Input
                value={dados}
                onChange={(e) => setDados(e.target.value)}
                placeholder="CNPJ, email, telefone ou aleatória"
              />
            ) : (
              <Textarea
                value={dados}
                onChange={(e) => setDados(e.target.value)}
                placeholder="000201265204..."
                rows={3}
                className="font-mono text-xs"
              />
            )}
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
              placeholder={isAtualizacao ? "Ex: cliente trocou de banco" : "Algum contexto adicional pro audit trail."}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={!dados.trim() || !contato.trim() || registrar.isPending}
          >
            {registrar.isPending ? "Registrando..." : isAtualizacao ? "Registrar atualização" : "Registrar envio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
