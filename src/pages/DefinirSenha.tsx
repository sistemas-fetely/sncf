import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FetelyAuthLayout } from "@/components/auth/FetelyAuthLayout";
import { humanizeError } from "@/lib/errorMessages";

export default function DefinirSenha() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const senhaCurta = password.length > 0 && password.length < 8;
  const senhasDiferentes = confirm.length > 0 && password !== confirm;
  const podeSubmeter = password.length >= 8 && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeSubmeter) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha definida com sucesso!");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(humanizeError(err?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FetelyAuthLayout
      title="Defina sua senha"
      subtitle="Crie a senha que você vai usar para acessar o sistema."
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
              placeholder="Mínimo 8 caracteres"
              className="pl-9 pr-9"
              required
              minLength={8}
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
          {senhaCurta && (
            <p className="text-xs text-destructive">A senha precisa ter no mínimo 8 caracteres</p>
          )}
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
              placeholder="Repita a senha"
              className="pl-9"
              required
            />
          </div>
          {senhasDiferentes && (
            <p className="text-xs text-destructive">As senhas não coincidem</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={loading || !podeSubmeter}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Definir senha
        </Button>
      </form>
    </FetelyAuthLayout>
  );
}
