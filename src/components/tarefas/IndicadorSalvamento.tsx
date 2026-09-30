import { useIsMutating, useMutationState } from "@tanstack/react-query";

export function IndicadorSalvamento({ tarefaId }: { tarefaId: string }) {
  const mutationKey = ["tarefas", "salvar", tarefaId] as const;
  const emAndamento = useIsMutating({ mutationKey, exact: true });
  const estados = useMutationState({
    filters: { mutationKey, exact: true },
    select: (mutation) => ({
      status: mutation.state.status,
      submittedAt: mutation.state.submittedAt,
    }),
  });
  const ultimo = estados.reduce<(typeof estados)[number] | undefined>(
    (atual, estado) => !atual || estado.submittedAt > atual.submittedAt ? estado : atual,
    undefined,
  );
  const texto = emAndamento > 0 ? "Salvando…" : ultimo?.status === "success" ? "Salvo" : "";

  return (
    <span className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
      {texto}
    </span>
  );
}