import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, CheckCircle2, XCircle, Loader2 } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
type Status = "loading" | "valid" | "already" | "invalid" | "success" | "error";

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    fetch(`${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`, {
      headers: { apikey: anonKey },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid === false && data.reason === "already_unsubscribed") setStatus("already");
        else if (data.valid) setStatus("valid");
        else setStatus("invalid");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (result.success) setStatus("success");
      else if (result.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch {
      setStatus("error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <PageShell className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
        </div>
        <Card className="card-shadow">
          <CardContent className="pt-6 text-center space-y-4">
            {status === "loading" && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Verificando...</p>
              </div>
            )}
            {status === "valid" && (
              <>
                <h2 className="text-xl font-medium">Cancelar inscrição</h2>
                <p className="text-sm text-muted-foreground">
                  Deseja deixar de receber e-mails de notificação?
                </p>
                <Button onClick={handleUnsubscribe} disabled={processing} className="w-full">
                  {processing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Confirmar cancelamento
                </Button>
              </>
            )}
            {status === "success" && (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <h2 className="text-xl font-medium">Inscrição cancelada</h2>
                <p className="text-sm text-muted-foreground">Você não receberá mais e-mails de notificação.</p>
              </div>
            )}
            {status === "already" && (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
                <h2 className="text-xl font-medium">Já cancelado</h2>
                <p className="text-sm text-muted-foreground">Sua inscrição já foi cancelada anteriormente.</p>
              </div>
            )}
            {status === "invalid" && (
              <div className="flex flex-col items-center gap-3">
                <XCircle className="h-10 w-10 text-destructive" />
                <h2 className="text-xl font-medium">Link inválido</h2>
                <p className="text-sm text-muted-foreground">Este link de cancelamento é inválido ou expirou.</p>
              </div>
            )}
            {status === "error" && (
              <div className="flex flex-col items-center gap-3">
                <XCircle className="h-10 w-10 text-destructive" />
                <h2 className="text-xl font-medium">Erro</h2>
                <p className="text-sm text-muted-foreground">Ocorreu um erro ao processar sua solicitação. Tente novamente.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
