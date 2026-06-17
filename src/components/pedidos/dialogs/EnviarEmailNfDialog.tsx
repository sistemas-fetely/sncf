import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEnviarEmailNfFaturado } from "@/hooks/pedidos/useEnviarEmailNfFaturado";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedido_id: string;
  parceiro_id: string;
}

export function EnviarEmailNfDialog({ open, onOpenChange, pedido_id, parceiro_id }: Props) {
  const enviar = useEnviarEmailNfFaturado();
  const [emailPrincipal, setEmailPrincipal] = useState("");
  const [emailsAdicionais, setEmailsAdicionais] = useState<string[]>([]);
  const [novoEmail, setNovoEmail] = useState("");

  useQuery({
    queryKey: ["parceiro-email", parceiro_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("email, razao_social")
        .eq("id", parceiro_id)
        .maybeSingle();
      if (data?.email && !emailPrincipal) setEmailPrincipal(data.email);
      return data;
    },
    enabled: open && !!parceiro_id,
  });

  const handleAdicionarEmail = () => {
    const e = novoEmail.trim().toLowerCase();
    if (e && !emailsAdicionais.includes(e) && e !== emailPrincipal.trim().toLowerCase()) {
      setEmailsAdicionais((prev) => [...prev, e]);
    }
    setNovoEmail("");
  };

  const handleEnviar = async () => {
    const [principal, ...resto] = [emailPrincipal, ...emailsAdicionais].filter(Boolean);
    await enviar.mutateAsync({ pedido_id, emails: [principal], cc: resto });
    onOpenChange(false);
  };

  const emailsValidos = emailPrincipal.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviar.isPending) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar NF por e-mail
          </DialogTitle>
          <DialogDescription>
            Confirme o e-mail do destinatário antes de enviar. A NF (PDF) e o XML serão anexados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email-principal">Email principal</Label>
            <Input
              id="email-principal"
              type="email"
              placeholder="cliente@email.com"
              value={emailPrincipal}
              onChange={(e) => setEmailPrincipal(e.target.value)}
            />
          </div>

          {emailsAdicionais.length > 0 && (
            <div className="space-y-1.5">
              <Label>Emails adicionais</Label>
              <div className="flex flex-wrap gap-2">
                {emailsAdicionais.map((em) => (
                  <div key={em} className="flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-sm">
                    <span>{em}</span>
                    <button
                      type="button"
                      onClick={() => setEmailsAdicionais((prev) => prev.filter((x) => x !== em))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="novo-email">Adicionar outro destinatário</Label>
            <div className="flex gap-2">
              <Input
                id="novo-email"
                type="email"
                placeholder="outro@email.com"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdicionarEmail())}
              />
              <Button variant="outline" size="icon" onClick={handleAdicionarEmail} disabled={!novoEmail.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviar.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleEnviar} disabled={!emailsValidos || enviar.isPending} className="gap-1.5">
            {enviar.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
            ) : (
              <><Mail className="h-4 w-4" />Enviar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
