import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ConfirmarEnvioEmailDialog({
  open,
  onOpenChange,
  titulo,
  emailPadrao,
  loading,
  onConfirm,
  titleLabel = "Reenviar boleto por e-mail",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: {
    numero_titulo: string | null;
    valor_efetivo: number;
    data_vencimento_atual: string | null;
  };
  emailPadrao: string | null;
  loading?: boolean;
  onConfirm: (destinatarios: string[]) => void;
  titleLabel?: string;
}) {
  const [dest, setDest] = useState("");

  useEffect(() => {
    if (open) setDest(emailPadrao ?? "");
  }, [open, emailPadrao]);

  const emails = dest
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
  const invalidos = emails.filter((e) => !EMAIL_RE.test(e));
  const podeEnviar = emails.length > 0 && invalidos.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleLabel}</DialogTitle>
          <DialogDescription>
            Título <span className="font-mono">{titulo.numero_titulo ?? "—"}</span> ·{" "}
            {formatBRL(titulo.valor_efetivo)} · venc.{" "}
            {formatDateBR(titulo.data_vencimento_atual)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="dest-emails">Destinatários</Label>
          <Input
            id="dest-emails"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="email1@dominio.com, email2@dominio.com"
          />
          <p className="text-xs text-muted-foreground">
            Separe múltiplos e-mails por vírgula.
          </p>
          {invalidos.length > 0 && (
            <p className="text-xs text-red-600">
              E-mail inválido: {invalidos.join(", ")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(emails)}
            disabled={!podeEnviar || loading}
          >
            {loading ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmarEnvioEmailDialog;
