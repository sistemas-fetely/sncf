import { FileText, Sparkles } from "lucide-react";
import { useMeuContratoPJ, useMinhasNotas } from "@/hooks/useMinhasNotas";
import { CardContratoAtivo } from "@/components/minhas-notas/CardContratoAtivo";
import { TimelineNotas } from "@/components/minhas-notas/TimelineNotas";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { PageShell } from "@/components/layout/PageShell";
export default function MinhasNotas() {
  const { data: contrato, isLoading: loadingContrato } = useMeuContratoPJ();
  const { data: notas, isLoading: loadingNotas } = useMinhasNotas();

  const anoAtual = new Date().getFullYear();

  if (loadingContrato) {
    return (
      <PageShell variant="leitura">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </PageShell>
    );
  }

  if (!contrato) {
    return (
      <PageShell variant="leitura">
        <h1 className="text-2xl font-medium tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Minhas Notas Fiscais
        </h1>
        <Alert>
          <AlertDescription>
            Não encontramos contrato PJ ativo vinculado ao seu usuário. Se acha que isso é um engano,
            fale com o RH.
          </AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell variant="leitura">
      <div>
        <h1 className="text-2xl font-medium tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Minhas Notas Fiscais
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhe sua jornada mensal de emissão. Cada mês tem seu ritmo. 💚
        </p>
      </div>

      <CardContratoAtivo contrato={contrato} />

      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Quando chegar o dia 25, aparecerá uma tarefa em <strong>/tarefas</strong> pra você emitir a NF do mês.
          Submeta por lá — chega por aqui direto pra acompanhar. Sem WhatsApp, sem email — tudo rastreável.
        </AlertDescription>
      </Alert>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Timeline {anoAtual}</h2>
          <span className="text-xs text-muted-foreground">
            {(notas || []).filter((n) => n.competencia.startsWith(`${anoAtual}-`)).length} NF(s) em {anoAtual}
          </span>
        </div>

        {loadingNotas ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <TimelineNotas notas={notas || []} ano={anoAtual} />
        )}
      </div>
    </PageShell>
  );
}
