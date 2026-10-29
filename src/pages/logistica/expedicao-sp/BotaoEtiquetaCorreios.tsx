import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGerarEtiquetaCorreios, usePrepostagemViva } from "./useMesaSp";

/**
 * Reimpressão do rótulo Correios gerado pelo SNCF em qualquer estação depois de Documentos.
 * Só aparece com pré-postagem viva; nunca cria uma nova (isso é ato da estação Documentos).
 */
export function BotaoEtiquetaCorreios({ pedidoId, disabled }: { pedidoId: string; disabled?: boolean }) {
  const ppQ = usePrepostagemViva(pedidoId);
  const gerar = useGerarEtiquetaCorreios();
  const pp = ppQ.data;
  if (ppQ.error) return <span className="text-xs text-destructive">{(ppQ.error as Error).message}</span>;
  if (!pp) return null;
  return (
    <Button
      type="button" size="sm" variant="outline"
      onClick={() => gerar.mutate({ pedidoId, prepostagemId: pp.id })}
      disabled={disabled || gerar.isPending}
    >
      {gerar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Printer aria-hidden="true" />}
      Imprimir etiqueta Correios{pp.codigo_objeto ? ` (${pp.codigo_objeto})` : ""}
    </Button>
  );
}
