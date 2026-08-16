import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import {
import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
  TIPOS_NOTIFICACAO, usePreferenciasNotificacao, useSalvarPreferenciaNotificacao,
} from "@/hooks/tarefas/useNotificacoesTarefas";

export default function NotificacoesPreferencias() {
  const { user } = useAuth();
  const { data: prefs, isLoading, error } = usePreferenciasNotificacao(user?.id);
  const salvar = useSalvarPreferenciaNotificacao(user?.id);

  const valor = (tipo: string, campo: "in_app" | "email") => prefs?.[tipo]?.[campo] ?? true;

  const mudar = (tipo: string, campo: "in_app" | "email", v: boolean) => {
    salvar.mutate({
      tipo,
      in_app: campo === "in_app" ? v : valor(tipo, "in_app"),
      email: campo === "email" ? v : valor(tipo, "email"),
    });
  };

  return (
    <PageShell variant="leitura">
      <PageTitle
        titulo="Notificações"
        estado={
          <>
            Escolha o que aparece no sino e o que entra no <strong>resumo diário por e-mail</strong> —
            nunca um e-mail por evento. Você nunca é notificado da sua própria ação.
          </>
        }
      />

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as preferências: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando preferências…</p>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            <div className="flex items-center gap-3 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="flex-1">Tipo</span>
              <span className="w-16 text-center">No sino</span>
              <span className="w-20 text-center">Resumo</span>
            </div>
            {TIPOS_NOTIFICACAO.map((t) => (
              <div key={t.tipo} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.rotulo}</p>
                  <p className="text-xs text-muted-foreground">{t.ajuda}</p>
                </div>
                <div className="flex w-16 justify-center">
                  <Switch
                    checked={valor(t.tipo, "in_app")}
                    onCheckedChange={(v) => mudar(t.tipo, "in_app", v)}
                    aria-label={`${t.rotulo} no sino`}
                  />
                </div>
                <div className="flex w-20 justify-center">
                  <Switch
                    checked={valor(t.tipo, "email")}
                    onCheckedChange={(v) => mudar(t.tipo, "email", v)}
                    aria-label={`${t.rotulo} no resumo diário`}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
