import { useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, ExternalLink, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { urlPaginaPix } from "@/lib/pagamento/linkPix";

/** PIX do título: lê da própria linha (a view de cobrança não traz o copia-e-cola). */
export function PixTituloBloco({ tituloId }: { tituloId: string }) {
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["titulo-pix", tituloId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select("link_pagamento, pix_qr_url, pix_token, pix_txid")
        .eq("id", tituloId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { link_pagamento: string | null; pix_qr_url: string | null; pix_token: string | null; pix_txid: string | null } | null;
    },
  });

  const gerarQr = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("QR não renderizado.");
      const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("Não foi possível gerar o PNG do QR.");
      const path = `titulo-${tituloId}-${crypto.randomUUID()}.png`;
      const { error: errUp } = await supabase.storage.from("pix-qr").upload(path, blob, { contentType: "image/png", upsert: false });
      if (errUp) throw new Error(errUp.message);
      const url = supabase.storage.from("pix-qr").getPublicUrl(path).data?.publicUrl;
      if (!url) throw new Error("URL pública do QR não disponível.");
      const { error } = await (supabase as any).rpc("registrar_pix_qr_url_titulo", { p_titulo_id: tituloId, p_url: url });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["titulo-pix", tituloId] });
      toast.success("Imagem do QR gerada.");
    },
    onError: (e: Error) => toast.error("Não foi possível gerar o QR", { description: e.message }),
  });

  async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(null), 1400);
      toast.success(`${rotulo} copiado`);
    } catch (e) {
      toast.error("Não foi possível copiar", { description: e instanceof Error ? e.message : undefined });
    }
  }

  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (q.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="text-xs">Erro ao ler o PIX: {(q.error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  const d = q.data;
  if (!d?.link_pagamento) {
    return (
      <Alert className="border-warning/40 bg-warning/10">
        <AlertTriangle className="h-4 w-4 !text-warning" />
        <AlertDescription className="text-xs text-warning">
          Sem link de pagamento — informe o link no detalhe da cobrança para habilitar o envio ao cliente.
        </AlertDescription>
      </Alert>
    );
  }
  const linkPublico = d.pix_token ? urlPaginaPix(d.pix_token) : null;

  return (
    <div className="space-y-2">
      <div style={{ position: "absolute", left: -9999, top: -9999 }} aria-hidden>
        <QRCodeCanvas ref={canvasRef as any} value={d.link_pagamento} size={320} level="M" marginSize={2} bgColor="#FFFFFF" fgColor="#000000" />
      </div>

      <div className="flex gap-3">
        <div className="bg-background border rounded-md p-2 w-fit self-start">
          {d.pix_qr_url ? (
            <img src={d.pix_qr_url} alt="QR Code PIX" className="h-28 w-28" />
          ) : (
            <QRCodeSVG value={d.link_pagamento} size={112} level="M" marginSize={0} />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Copia e cola</span>
            <div className="flex items-center gap-2 min-w-0">
              <code className="text-[11px] bg-muted px-2 py-1 rounded flex-1 truncate">{d.link_pagamento}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Copiar" onClick={() => copiar(d.link_pagamento!, "Copia e cola")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {linkPublico && (
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Página de pagamento do cliente</span>
              <div className="flex items-center gap-2 min-w-0">
                <code className="text-[11px] bg-muted px-2 py-1 rounded flex-1 truncate">{linkPublico}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Copiar link" onClick={() => copiar(linkPublico, "Link de pagamento PIX")}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="Abrir">
                  <a href={linkPublico} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                </Button>
              </div>
            </div>
          )}
          {!d.pix_qr_url && (
            <Button size="sm" variant="outline" onClick={() => gerarQr.mutate()} disabled={gerarQr.isPending}>
              {gerarQr.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <QrCode className="h-3.5 w-3.5 mr-1" />}
              Gerar QR
            </Button>
          )}
          {copiado && <span className="sr-only">{copiado}</span>}
        </div>
      </div>
    </div>
  );
}
