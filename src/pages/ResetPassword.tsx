import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FetelyAuthLayout } from "@/components/auth/FetelyAuthLayout";
import { ForcaSenhaIndicator, senhaEhForte } from "@/components/auth/ForcaSenhaIndicator";
import { TermoUsoDialog } from "@/components/auth/TermoUsoDialog";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validToken, setValidToken] = useState(false);

  // Primeiro acesso vs reset comum
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);
  const [termoAberto, setTermoAberto] = useState(false);
  const [termoAceito, setTermoAceito] = useState(false);
  const [versaoTermo, setVersaoTermo] = useState("1.0");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const init = async () => {
      const hash = window.location.hash;
      const isImplicitRecovery = hash.includes("type=recovery");

      if (isImplicitRecovery) {
        // Fluxo implicit: hash tem type=recovery — token válido imediatamente
        setValidToken(true);
      } else {
        // Fluxo PKCE: não há hash, mas Supabase já estabeleceu sessão via ?code=
        await new Promise((r) => setTimeout(r, 500));
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          setValidToken(true);
        } else {
          setValidToken(false);
          return;
        }
      }

      // Dá um tempinho pra Supabase processar o hash
      await new Promise((r) => setTimeout(r, 300));

      // Buscar versão do termo vigente
      const { data: versao } = await supabase.rpc("termo_uso_versao_vigente");
      if (versao) setVersaoTermo(versao as string);

      // Verificar se é primeiro acesso
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        setUserEmail(userData.user.email || "");
        const { data: profile } = await supabase
          .from("profiles")
          .select("acesso_ativado_em")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        setPrimeiroAcesso(!profile?.acesso_ativado_em);
      }
    };
    init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (!senhaEhForte(password, userEmail)) {
      toast.error("A senha não atende aos critérios de força");
      return;
    }
    if (primeiroAcesso && !termoAceito) {
      toast.error("Você precisa aceitar o Termo de Uso para continuar");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Se primeiro acesso, registrar aceite do termo
      if (primeiroAcesso) {
        await supabase.rpc("registrar_aceite_termo_uso", { _versao: versaoTermo });
      }

      toast.success(
        primeiroAcesso
          ? "Bem-vindo(a) ao People Fetely! Acesso ativado."
          : "Senha atualizada com sucesso!"
      );
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar senha");
    } finally {
      setLoading(false);
    }
  };

  if (!validToken) {
    return (
      <FetelyAuthLayout
        title="Link inválido"
        subtitle="Não conseguimos validar este link."
      >
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            O link pode ter expirado (válido por 1 hora) ou já ter sido usado.
          </p>
          <Link to="/recuperar-senha" className="block">
            <Button className="w-full">Solicitar novo link</Button>
          </Link>
          <Link to="/login" className="block">
            <Button variant="ghost" className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar para login
            </Button>
          </Link>
        </div>
      </FetelyAuthLayout>
    );
  }

  return (
    <>
      <FetelyAuthLayout
        title={primeiroAcesso ? "Defina sua senha" : "Nova senha"}
        subtitle={
          primeiroAcesso
            ? "Último passo pra ativar seu acesso ao People Fetely."
            : "Escolha uma nova senha pra sua conta."
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 pr-9"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <ForcaSenhaIndicator senha={password} email={userEmail} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="pl-9"
                required
              />
            </div>
            {confirm && password !== confirm && (
              <p className="text-xs text-destructive">As senhas não coincidem</p>
            )}
          </div>

          {primeiroAcesso && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="termo"
                  checked={termoAceito}
                  onCheckedChange={(c) => setTermoAceito(c === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="termo" className="text-xs leading-relaxed cursor-pointer">
                  Li e aceito o{" "}
                  <button
                    type="button"
                    onClick={() => setTermoAberto(true)}
                    className="text-primary hover:underline font-medium"
                  >
                    Termo de Uso do People Fetely v{versaoTermo}
                  </button>
                  , incluindo as diretrizes de uso aceitável, confidencialidade e LGPD.
                </Label>
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={
              loading ||
              !senhaEhForte(password, userEmail) ||
              password !== confirm ||
              (primeiroAcesso && !termoAceito)
            }
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {primeiroAcesso ? "Ativar meu acesso" : "Atualizar senha"}
          </Button>
        </form>
      </FetelyAuthLayout>

      <TermoUsoDialog
        open={termoAberto}
        onOpenChange={setTermoAberto}
        versao={versaoTermo}
      />
    </>
  );
}
