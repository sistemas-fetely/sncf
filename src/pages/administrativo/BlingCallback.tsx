import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const CALLBACK_URL = "https://sncf.lovable.app/administrativo/bling-callback";

export default function BlingCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (loading || !user) return;
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const erroParam = params.get("error");

    (async () => {
      try {
        if (erroParam) throw new Error("Bling negou: " + erroParam);
        if (!code) throw new Error("Code não recebido");

        const { data, error } = await supabase.functions.invoke("sync-bling-financeiro", {
          body: {
            tipo: "token_exchange",
            code,
            redirect_uri: CALLBACK_URL,
          },
        });

        if (error) throw new Error(error.message || "Erro no servidor");
        if (data?.sucesso === false) throw new Error(data.erro || "Erro desconhecido");

        toast.success("Bling conectado com sucesso!");
      } catch (e: any) {
        toast.error("Falha: " + (e?.message || String(e)));
      } finally {
        navigate("/administrativo/configuracao-integracao", { replace: true });
      }
    })();
  }, [loading, user, params, navigate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-admin" />
        <p className="text-sm text-muted-foreground">Conectando com o Bling...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-admin" />
      <p className="text-sm text-muted-foreground">Processando autorização...</p>
    </div>
  );
}
