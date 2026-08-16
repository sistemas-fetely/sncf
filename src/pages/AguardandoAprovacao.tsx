import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";

export default function AguardandoAprovacao() {
  const { signOut, user, approved, roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (approved || roles.includes("super_admin")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Clock className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-medium">Aguardando Aprovação</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sua conta está pendente de aprovação
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-center text-sm text-muted-foreground">
              Sua conta <strong>{user.email}</strong> foi criada com sucesso, mas precisa ser aprovada por um administrador antes que você possa acessar o sistema.
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Você receberá acesso assim que um administrador aprovar sua conta. Por favor, entre em contato com o RH caso precise de acesso urgente.
            </p>
            <Button variant="outline" className="w-full" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
