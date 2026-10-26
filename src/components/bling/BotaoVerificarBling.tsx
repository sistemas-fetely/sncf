import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVerificarNfBling } from "@/hooks/bling/useVerificarNfBling";

/** Botão pequeno ao lado de selo de rascunho: consulta o Bling agora. */
export function BotaoVerificarBling({ blingId }: { blingId: string | number | null | undefined }) {
  const m = useVerificarNfBling();
  if (!blingId) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label="Verificar no Bling agora" disabled={m.isPending}
          onClick={(e) => { e.stopPropagation(); m.mutate({ bling_ids: [String(blingId)] }); }}>
          {m.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Verificar no Bling agora</TooltipContent>
    </Tooltip>
  );
}
