import { Loader2 } from "lucide-react";

export function AtualizacaoFila({ isPlaceholderData }: { isPlaceholderData: boolean }) {
  if (!isPlaceholderData) return null;
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
      Atualizando…
    </span>
  );
}