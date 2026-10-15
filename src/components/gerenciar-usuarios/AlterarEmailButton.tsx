import { useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { chamarEdge, ErroEdge } from "@/lib/pedidos/edgePagamento";
import { toast } from "sonner";

interface Props {
  userId: string;
  nome: string;
  emailAtual: string;
}

interface Resultado {
  success: boolean;
  email_antigo: string;
  email_novo: string;
  acesso_ativado: boolean;
}

export function AlterarEmailButton({ userId, nome, emailAtual }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [novo, setNovo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviandoLink, setEnviandoLink] = useState(false);

  const reset = () => {
    setNovo(""); setMotivo(""); setResultado(null); setLoading(false);
  };

  const invalidar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-auth-users"] }),
      qc.invalidateQueries({ queryKey: ["admin-profiles"] }),
      qc.invalidateQueries({ queryKey: ["mesa-vinculos-ligados"] }),
      qc.invalidateQueries({ queryKey: ["mesa-vinculos-livres"] }),
      qc.invalidateQueries({ queryKey: ["users-list"] }),
    ]);
  };

  const alterar = async () => {
    setLoading(true);
    try {
      const r = await chamarEdge<Resultado & { error?: string }>("manage-user", {
        action: "alterar_email",
        user_id: userId,
        novo_email: novo.trim().toLowerCase(),
        motivo: motivo.trim() || null,
      });
      if (r?.error) throw new Error(r.error);
      toast.success(`E-mail alterado: ${r.email_antigo} → ${r.email_novo}`);
      await invalidar();
      if (r.acesso_ativado) {
        setOpen(false); reset();
      } else {
        setResultado(r);
      }
    } catch (e) {
      const msg = e instanceof ErroEdge && e.status === 409
        ? "Este e-mail já está em uso"
        : (e as Error)?.message || "Erro ao alterar e-mail";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const enviarLink = async () => {
    setEnviandoLink(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "reenviar_link_acesso", user_id: userId, motivo: "Novo e-mail após alteração" },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(`Link de acesso enviado para ${(data as any)?.email ?? resultado?.email_novo}`);
      setOpen(false); reset();
    } catch (e) {
      toast.error((e as Error)?.message || "Erro ao enviar link");
    } finally {
      setEnviandoLink(false);
    }
  };

  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novo.trim());

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Mail className="h-3.5 w-3.5" /> E-mail
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar e-mail de {nome}</DialogTitle>
            <DialogDescription>E-mail atual: <strong>{emailAtual || "—"}</strong></DialogDescription>
          </DialogHeader>

          {resultado ? (
            <div className="space-y-3 text-sm">
              <p>E-mail alterado para <strong>{resultado.email_novo}</strong>.</p>
              <p className="text-muted-foreground">Este usuário ainda não ativou o acesso.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Fechar</Button>
                <Button onClick={enviarLink} disabled={enviandoLink}>
                  {enviandoLink ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar link de acesso para o novo e-mail
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="novo-email">Novo e-mail</Label>
                  <Input id="novo-email" type="email" value={novo} onChange={(e) => setNovo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="motivo-email">Motivo (opcional)</Label>
                  <Textarea id="motivo-email" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
                <Button onClick={alterar} disabled={!valido || loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Alterar e-mail
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
