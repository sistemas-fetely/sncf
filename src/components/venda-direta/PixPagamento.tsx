import { useRef } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Copy, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { rawMessage } from "@/lib/format-error";

interface PixPagamentoProps {
  payload: string | null;
  link: string | null;
  whatsappUrl?: string | null;
}

async function copiar(texto: string, rotulo: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${rotulo} copiado.`);
  } catch (e) {
    toast.error(rawMessage(e));
  }
}

export function PixPagamento({ payload, link, whatsappUrl }: PixPagamentoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const baixar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = "pix-fetely.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">PIX por QR Code</p>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="flex shrink-0 flex-col items-center gap-2">
        {payload ? (
          <>
            <div className="rounded-md border bg-background p-3">
              <QRCodeSVG value={payload} size={200} level="M" marginSize={1} />
              <div className="absolute -left-[9999px] -top-[9999px]" aria-hidden>
                <QRCodeCanvas ref={canvasRef} value={payload} size={640} level="M" marginSize={2} />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={baixar}>
              <Download className="h-4 w-4" /> Baixar QR (PNG)
            </Button>
          </>
        ) : (
          <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            QR indisponível
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-1">
          <Label>Página do PIX (QR na chave da Fetely)</Label>
          <div className="flex gap-2">
            <Input readOnly value={link ?? "—"} />
            <Button variant="outline" size="icon" disabled={!link} onClick={() => link && copiar(link, "Página do PIX")} aria-label="Copiar página do PIX">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {whatsappUrl && (
          <Button onClick={() => window.open(whatsappUrl, "_blank", "noopener")}>
            <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
          </Button>
        )}

        <div className="space-y-1">
          <Label>PIX copia e cola</Label>
          <div className="flex gap-2">
            <Textarea readOnly value={payload ?? "—"} className="font-mono text-xs" rows={4} />
            <Button variant="outline" size="icon" disabled={!payload} onClick={() => payload && copiar(payload, "PIX copia e cola")} aria-label="Copiar PIX copia e cola">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}