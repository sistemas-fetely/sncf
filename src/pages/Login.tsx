import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { FetelyAuthLayout } from "@/components/auth/FetelyAuthLayout";

export default function Login() {
  const navigate = useNavigate();
  const { user, roles, approved, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;
    const isSuperAdmin = roles.includes("super_admin");
    navigate(approved || isSuperAdmin ? "/" : "/aguardando-aprovacao", { replace: true });
  }, [approved, authLoading, navigate, roles, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado com sucesso!");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        toast.success("Solicitação enviada! Verifique seu e-mail corporativo.");
      }
    } catch (error: any) {
      const { humanizeError } = await import("@/lib/errorMessages");
      toast.error(humanizeError(error?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FetelyAuthLayout
      title={mode === "login" ? "Acesse sua conta" : "Solicitar acesso"}
      subtitle={
        mode === "login"
          ? "Use seu email corporativo Fetely."
          : "Preencha pra solicitar acesso ao People Fetely."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "register" && (
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome completo</Label>
            <div className="relative">
              <UserPlus className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
                className="pl-9"
                required
              />
            </div>
          </div>
        )}

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
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{mode === "register" ? "Crie sua senha de acesso" : "Senha"}</Label>
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
              minLength={mode === "register" ? 10 : 6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === "register" && (
            <p className="text-xs text-muted-foreground mt-1">
              Mínimo 10 caracteres, com pelo menos 1 maiúscula, 1 número e 1 caractere especial.
            </p>
          )}
        </div>

        {mode === "login" && (
          <>
            <div className="flex justify-end">
              <Link to="/recuperar-senha" className="text-xs text-primary hover:underline">
                Esqueci minha senha
              </Link>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Primeiro acesso? Use o link acima para criar sua senha.
            </p>
          </>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "..." : mode === "login" ? "Entrar" : "Solicitar acesso"}
        </Button>

        <p className="text-center text-sm text-muted-foreground pt-2">
          {mode === "login" ? (
            <>
              Quer celebrar com a gente?{" "}
              <button
                type="button"
                onClick={() => setMode("register")}
                className="text-primary hover:underline font-medium"
              >
                Solicitar acesso
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button
                type="button"
                onClick={() => setMode("login")}
                className="text-primary hover:underline font-medium"
              >
                Fazer login
              </button>
            </>
          )}
        </p>
      </form>
    </FetelyAuthLayout>
  );
}
