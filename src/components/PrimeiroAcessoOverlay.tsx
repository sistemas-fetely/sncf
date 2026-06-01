import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ForcaSenhaIndicator,
  senhaEhForte,
} from "@/components/auth/ForcaSenhaIndicator";
import { TermoUsoDialog } from "@/components/auth/TermoUsoDialog";

export function PrimeiroAcessoOverlay() {
  const { user, profile, hasRole, loading: authLoading } = useAuth();
  const isSuperAdmin = hasRole("super_admin");

  const [acessoAtivadoEm, setAcessoAtivadoEm] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [termoAberto, setTermoAberto] = useState(false);
  const [termoAceito, setTermoAceito] = useState(false);
  const [versaoTermo, setVersaoTermo] = useState("1.0");

  const userEmail = user?.email ?? "";

  // Busca acesso_ativado_em direto (profile do contexto não inclui esse campo)
  useEffect(() => {
    if (!user || authLoading) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("acesso_ativado_em")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setAcessoAtivadoEm(data?.acesso_ativado_em ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  // Busca versão vigente do termo
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("termo_uso_versao_vigente");
      if (data) setVersaoTermo(data as string);
    })();
  }, []);

  const shouldShow =
    !!user &&
    !!profile &&
    !isSuperAdmin &&
    acessoAtivadoEm === null;

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
    if (!termoAceito) {
      toast.error("Você precisa aceitar o Termo de Uso para continuar");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      const { error: termoError } = await supabase.rpc(
        "registrar_aceite_termo_uso",
        { _versao: versaoTermo },
      );
      if (termoError) {
        console.error("Erro ao registrar aceite do termo (não-blocking):", termoError);
      }

      toast.success("Acesso ativado! Bem-vindo(a) ao People Fetely.");
      await new Promise((r) => setTimeout(r, 800));
      window.location.replace("/");
    } catch (err: any) {
      toast.error(err.message || "Erro ao ativar acesso");
      setLoading(false);
    }
  };

  if (!shouldShow) return null;

  return (
    <>
      <Dialog open modal>
        <DialogContent
          className="max-w-md"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          hideClose
        >
          <DialogHeader>
            <DialogTitle>Ative seu acesso</DialogTitle>
            <DialogDescription>
              Último passo. Defina sua senha para começar a usar o People Fetely.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primeiro-acesso-senha">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="primeiro-acesso-senha"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-9"
                  minLength={8}
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
              <Label htmlFor="primeiro-acesso-confirm">Confirmar senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="primeiro-acesso-confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                  minLength={8}
                  required
                />
              </div>
              {confirm && password !== confirm && (
                <p className="text-xs text-destructive">As senhas não coincidem</p>
              )}
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="primeiro-acesso-termo"
                  checked={termoAceito}
                  onCheckedChange={(c) => setTermoAceito(c === true)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="primeiro-acesso-termo"
                  className="text-xs leading-relaxed cursor-pointer"
                >
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

            <Button
              type="submit"
              className="w-full"
              disabled={
                loading ||
                !senhaEhForte(password, userEmail) ||
                password !== confirm ||
                !termoAceito
              }
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ativar meu acesso
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <TermoUsoDialog
        open={termoAberto}
        onOpenChange={setTermoAberto}
        versao={versaoTermo}
      />
    </>
  );
}
