import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Mesmas constantes de ambiente usadas por src/integrations/supabase/client.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function mensagemDeCorpo(texto: string, status: number): string {
  try {
    const j = JSON.parse(texto) as { error?: string; detalhe?: string };
    const msg = [j.error, j.detalhe].filter(Boolean).join(" — ");
    if (msg) return msg;
  } catch {
    /* corpo não é JSON */
  }
  return `HTTP ${status}: ${texto.slice(0, 300) || "resposta vazia"}`;
}

export function useDownloadNfPdf() {
  const mutation = useMutation({
    mutationFn: async ({
      nf_id,
      nome,
      formato = "pdf",
    }: {
      nf_id: string;
      nome?: string;
      formato?: "pdf" | "xml";
    }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Sessão expirada — entre novamente para baixar a NF.");
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/nf-download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ nf_id, formato }),
      });

      // FAIL-LOUD: o corpo real do erro vira a mensagem do toast.
      if (!res.ok) {
        const texto = await res.text().catch(() => "");
        throw new Error(mensagemDeCorpo(texto, res.status));
      }

      const blob = await res.blob();
      if (blob.type && blob.type.includes("json")) {
        const texto = await blob.text().catch(() => "");
        throw new Error(mensagemDeCorpo(texto, res.status));
      }

      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = nome ? `${nome}.${formato}` : `NF-${nf_id}.${formato}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      return true;
    },
    onError: (e: Error, vars) => {
      const formato = vars?.formato ?? "pdf";
      toast.error(
        formato === "xml"
          ? "Não foi possível baixar o XML da NF"
          : "Não foi possível baixar o PDF da NF",
        { description: e.message },
      );
    },
  });

  return {
    baixar: (args: { nf_id: string; nome?: string; formato?: "pdf" | "xml" }) =>
      mutation.mutate(args),
    baixando: mutation.isPending,
    nfEmDownload: (mutation.variables as { nf_id: string } | undefined)?.nf_id ?? null,
  };
}
