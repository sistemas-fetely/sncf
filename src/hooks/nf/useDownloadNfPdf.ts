import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

async function extrairMensagemErro(data: unknown, fallback: string): Promise<string> {
  try {
    if (data instanceof Blob) {
      const txt = await data.text();
      const j = JSON.parse(txt);
      return [j.error, j.detalhe].filter(Boolean).join(" — ") || txt.slice(0, 300);
    }
    if (data && typeof data === "object") {
      const j = data as { error?: string; detalhe?: string };
      if (j.error) return [j.error, j.detalhe].filter(Boolean).join(" — ");
    }
  } catch {
    /* mantém o fallback */
  }
  return fallback;
}

export function useDownloadNfPdf() {
  const mutation = useMutation({
    mutationFn: async ({ nf_id, nome }: { nf_id: string; nome?: string }) => {
      const { data, error } = await supabase.functions.invoke("nf-download", { body: { nf_id } });

      if (error) {
        // FAIL-LOUD: usa a mensagem real devolvida pela função, não a genérica.
        const msg = await extrairMensagemErro(data, error.message);
        throw new Error(msg);
      }

      let blob: Blob;
      if (data instanceof Blob) blob = data;
      else if (data instanceof ArrayBuffer) blob = new Blob([data], { type: "application/pdf" });
      else {
        // Função respondeu JSON de erro com status 2xx (não deve acontecer, mas é explícito).
        throw new Error(await extrairMensagemErro(data, "Resposta inesperada da função nf-download."));
      }

      if (blob.type && blob.type.includes("json")) {
        throw new Error(await extrairMensagemErro(blob, "Falha ao baixar o PDF da NF."));
      }

      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = nome ? `${nome}.pdf` : `NF-${nf_id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      return true;
    },
    onError: (e: Error) => {
      toast.error("Não foi possível baixar o PDF da NF", { description: e.message });
    },
  });

  return {
    baixar: (args: { nf_id: string; nome?: string }) => mutation.mutate(args),
    baixando: mutation.isPending,
    nfEmDownload: (mutation.variables as { nf_id: string } | undefined)?.nf_id ?? null,
  };
}
