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
import { ForcaSenhaIndicator, senhaEhForte, REGRA_SENHA_TEXTO } from "@/components/auth/ForcaSenhaIndicator";
import { TermoUsoDialog } from "@/components/auth/TermoUsoDialog";
import { formatError } from "@/lib/format-error";

/** Aguarda o processamento do hash/código do link e devolve se há sessão real. */
async function aguardarSessao(timeoutMs = 4000): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  return new Promise((resolve) => {
    let feito = false;
    const fim = (ok: boolean) => {
      if (feito) return;
      feito = true;
      sub.subscription.unsubscribe();
      clearTimeout(t);
      resolve(ok);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) fim(true);
    });
    const t = setTimeout(async () => {
      const { data: d } = await supabase.auth.getSession();
      fim(!!d.session);
    }, timeoutMs);
  });
}

export default function DefinirSenha() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [estado, setEstado] = useState<"verificando" | "valido" | "invalido">("verificando");

  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);
  const [termoAberto, setTermoAberto] = useState(false);
  const [termoAceito, setTermoAceito] = useState(false);
  const [versaoTermo, setVersaoTermo] = useState("1.0");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const init = async () => {
      const ok = await aguardarSessao();
      if (!ok) {
        setEstado("invalido");
        return;
      }

      const { data: versao } = await supabase.rpc("termo_uso_versao_vigente");
      if (versao) setVersaoTermo(versao as string);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setEstado("invalido");
        return;
      }
      setUserEmail(userData.user.email || "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("acesso_ativado_em")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      setPrimeiroAcesso(!profile?.acesso_ativado_em);
      setEstado("valido");
    };
    void init();
  }, []);

  const podeSubmeter =
    senhaEhForte(password, userEmail) && password === confirm && (!primeiroAcesso || termoAceito);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeSubmeter) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      if (primeiroAcesso) {
        const { error: termoErr } = await supabase.rpc("registrar_aceite_termo_uso", { _versao: versaoTermo });
        if (termoErr) throw termoErr;
      }
      toast.success(primeiroAcesso ? "Bem-vindo(a) ao Fetély! Acesso ativado." : "Senha atualizada com sucesso!");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  if (estado === "verificando") {
    return (
      <FetelyAuthLayout title="Validando link" subtitle="Só um instante.">
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </FetelyAuthLayout>
    );
  }

  if (estado === "invalido") {
    return (
      <FetelyAuthLayout title="Link inválido ou expirado" subtitle="Não conseguimos validar este link.">
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            O link pode ter expirado, já ter sido usado ou ter sido aberto em outro navegador.
          </p>
          <Link to="/recuperar-senha" className="block">
            <Button className="w-full">Pedir novo link</Button>
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
        subtitle={primeiroAcesso ? "Último passo pra ativar seu acesso ao Fetély." : "Escolha uma nova senha pra sua conta."}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <p className="text-xs text-muted-foreground">{REGRA_SENHA_TEXTO}</p>
            <ForcaSenhaIndicator senha={password} email={userEmail} />
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-9"
                autoComplete="new-password"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
                className="pl-9"
                autoComplete="new-password"
                required
              />
            </div>
            {confirm && password !== confirm && <p className="text-xs text-destructive">As senhas não coincidem</p>}
          </div>

          {primeiroAcesso && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <Checkbox id="termo" checked={termoAceito} onCheckedChange={(c) => setTermoAceito(c === true)} className="mt-0.5" />
                <Label htmlFor="termo" className="text-xs leading-relaxed cursor-pointer">
                  Li e aceito o{" "}
                  <button type="button" onClick={() => setTermoAberto(true)} className="text-primary hover:underline font-medium">
                    Termo de Uso do Fetély v{versaoTermo}
                  </button>
                  , incluindo as diretrizes de uso aceitável, confidencialidade e LGPD.
                </Label>
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || !podeSubmeter}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {primeiroAcesso ? "Ativar meu acesso" : "Atualizar senha"}
          </Button>
        </form>
      </FetelyAuthLayout>
      <TermoUsoDialog open={termoAberto} onOpenChange={setTermoAberto} versao={versaoTermo} />
    </>
  );
}
