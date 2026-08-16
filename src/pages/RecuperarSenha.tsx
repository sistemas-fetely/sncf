import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { FetelyAuthLayout } from "@/components/auth/FetelyAuthLayout";

export default function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.info("Verifique seu e-mail corporativo.");
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FetelyAuthLayout
      title={sent ? "Verifique seu email" : "Recuperar senha"}
      subtitle={
        sent
          ? "Acabamos de te mandar um link."
          : "Tudo self-service. Sem ticket, sem espera."
      }
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Se <strong>{email}</strong> estiver cadastrado no sistema, você receberá um link de recuperação.
            </p>
            <p className="text-xs text-muted-foreground">
              O link expira em 1 hora. Se não chegar em 5 minutos, confira o spam
              ou tente novamente.
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
            Enviar outro link
          </Button>
          <Link to="/login" className="block">
            <Button variant="ghost" className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar para login
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email corporativo</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@fetely.com.br"
                className="pl-9"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use o email corporativo que você cadastrou na Fetely.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </Button>

          <Link to="/login" className="block">
            <Button variant="ghost" className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar para login
            </Button>
          </Link>
        </form>
      )}
    </FetelyAuthLayout>
  );
}
