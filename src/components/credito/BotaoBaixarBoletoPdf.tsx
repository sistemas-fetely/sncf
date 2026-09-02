import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Motor único de download do espelho do boleto.
 * A edge function `gerar-boleto-pdf` resolve o boleto VIGENTE por dentro
 * (vw_titulo_boleto_vigente) e recusa com 422 quando o vigente está em baixa.
 * FAIL-LOUD: a mensagem que a função devolve em `erro` sobe no toast como veio.
 */
export async function baixarBoletoPdf(tituloId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("gerar-boleto-pdf", {
    body: { titulo_id: tituloId },
  });
  if (error || !data?.ok) {
    throw new Error(data?.erro ?? error?.message ?? "Falha ao gerar PDF");
  }
  const bin = atob(data.pdf_base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.nome_arquivo ?? `boleto_${tituloId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function BotaoBaixarBoletoPdf({
  tituloId,
  desabilitado,
  motivoDesabilitado,
  variant = "ghost",
  rotulo,
}: {
  tituloId: string;
  desabilitado?: boolean;
  motivoDesabilitado?: string;
  variant?: "ghost" | "outline";
  rotulo?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function baixar() {
    setLoading(true);
    try {
      await baixarBoletoPdf(tituloId);
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const icone = loading ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <FileText className="h-4 w-4 text-muted-foreground" />
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={rotulo ? "sm" : "icon"}
            className={rotulo ? undefined : "h-7 w-7"}
            disabled={loading || desabilitado}
            onClick={baixar}
          >
            {rotulo ? (
              <>
                {icone}
                <span className="ml-2">{rotulo}</span>
              </>
            ) : (
              icone
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {motivoDesabilitado ?? "Baixar espelho do boleto (PDF)"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
