import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { useGerarPixLinha } from "@/hooks/pedidos/useGerarPixLinha";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Copy, ExternalLink, Loader2, QrCode, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";

interface PixGerado {
  payload: string;
  txid: string;
  token?: string | null;
  valor?: number | null;
  pedido?: string | null;
  beneficiario?: string | null;
  banco?: string | null;
}

interface Props {
  linhaId: string;
  origem: "provisao" | "titulo";
  pedidoId: string;
  tipoPagamento?: string | null;
  pago?: boolean | null;
  /** payload EMV já gravado pela RPC */
  linkPagamento?: string | null;
  pixTxid?: string | null;
  pixToken?: string | null;
  pixQrUrl?: string | null;
  valor?: number | null;
}

function BotaoCopiar({ valor, titulo }: { valor: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-7 w-7 shrink-0"
      title={titulo}
      onClick={() => {
        navigator.clipboard.writeText(valor).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1400);
        });
      }}
    >
      {copiado ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function InstrumentoPixLinha({
  linhaId,
  origem,
  pedidoId,
  tipoPagamento,
  pago,
  linkPagamento,
  pixTxid,
  pixToken,
  pixQrUrl,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const subindoRef = useRef(false);
  const [confirmarRegerar, setConfirmarRegerar] = useState(false);
  const [gerado, setGerado] = useState<PixGerado | null>(null);

  const ehPix = tipoPagamento === "pix";

  const gerarBase = useGerarPixLinha(pedidoId);
  // Mesma mutation do rodapé da Cobrança — aqui só espelha o retorno no estado local.
  const gerar = {
    ...gerarBase,
    mutate: () =>
      gerarBase.mutate(
        { linhaId, origem },
        { onSuccess: (data) => setGerado(data ?? null) },
      ),
  };

  const payload = gerado?.payload ?? linkPagamento ?? null;
  const txid = gerado?.txid ?? pixTxid ?? null;
  const token = gerado?.token ?? pixToken ?? null;
  const linkPublico = token ? `${window.location.origin}/pagar/${token}` : null;

  // ── Sobe o PNG do QR pro bucket público (só provisão, só se não houver imagem) ──
  useEffect(() => {
    if (!ehPix || pago) return;
    if (origem !== "provisao") return;
    if (!payload || !linhaId) return;
    if (pixQrUrl) return;
    if (subindoRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    subindoRef.current = true;
    const t = setTimeout(() => {
      canvas.toBlob(async (blob) => {
        try {
          if (!blob) throw new Error("Não foi possível gerar o PNG do QR.");
          const path = `${linhaId}-${crypto.randomUUID()}.png`;
          const { error: errUp } = await supabase.storage
            .from("pix-qr")
            .upload(path, blob, { contentType: "image/png", upsert: false });
          if (errUp) throw new Error(errUp.message);

          const { data: pub } = supabase.storage.from("pix-qr").getPublicUrl(path);
          const url = pub?.publicUrl;
          if (!url) throw new Error("URL pública do QR não disponível.");

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: errRpc } = await (supabase as any).rpc("registrar_pix_qr_url_provisao", {
            p_provisao_id: linhaId,
            p_url: url,
          });
          if (errRpc) throw new Error(errRpc.message);

          qc.invalidateQueries({ queryKey: ["linhas-cobranca-pedido", pedidoId] });
          qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
        } catch (e: unknown) {
          // Falha no upload NÃO invalida o QR da tela nem o copia-e-cola.
          subindoRef.current = false;
          toast({
            title: "Imagem do QR não foi salva",
            description: `O QR e o copia-e-cola continuam válidos, mas a imagem para e-mail não pôde ser salva. ${formatError(e)}`,
            variant: "destructive",
          });
        }
      }, "image/png");
    }, 120);

    return () => clearTimeout(t);
  }, [ehPix, pago, origem, payload, linhaId, pixQrUrl, pedidoId, qc, toast]);

  if (!ehPix) return null;

  if (pago) {
    return <p className="text-xs text-muted-foreground">PIX txid: {txid ?? "—"}</p>;
  }

  if (!txid) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          O QR Code é gerado pelo próprio SNCF, com valor exato e identificador único.
        </p>
        <Button size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
          {gerar.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <QrCode className="h-4 w-4 mr-2" />
          )}
          Gerar QR PIX
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-3">
      {payload && (
        <div style={{ position: "absolute", left: -9999, top: -9999 }} aria-hidden>
          <QRCodeCanvas
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={canvasRef as any}
            value={payload}
            size={320}
            level="M"
            marginSize={2}
            bgColor="#FFFFFF"
            fgColor="#000000"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 min-w-0">
        {payload && (
          <div className="bg-background border border-border/60 rounded-md p-2 w-fit self-start shrink-0">
            <QRCodeSVG value={payload} size={176} level="M" marginSize={0} />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-2">
          {payload && (
            <div className="space-y-1 min-w-0">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Copia e cola
              </span>
              <div className="flex items-start gap-2 min-w-0">
                <code className="flex-1 min-w-0 break-all font-mono text-[11px] text-muted-foreground">
                  {payload}
                </code>
                <BotaoCopiar valor={payload} titulo="Copiar copia e cola" />
              </div>
            </div>
          )}

          {linkPublico && (
            <div className="space-y-1 min-w-0">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Página de pagamento
              </span>
              <div className="flex items-start gap-2 min-w-0">
                <code className="flex-1 min-w-0 break-all font-mono text-[11px] text-muted-foreground">
                  {linkPublico}
                </code>
                <BotaoCopiar valor={linkPublico} titulo="Copiar link" />
                <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" asChild title="Abrir">
                  <a href={linkPublico} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground break-all">
            Identificador no extrato: <span className="font-mono">{txid}</span>
          </p>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmarRegerar(true)}
            disabled={gerar.isPending}
          >
            {gerar.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
            )}
            Regerar QR
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmarRegerar} onOpenChange={setConfirmarRegerar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regerar o QR Code PIX?</AlertDialogTitle>
            <AlertDialogDescription>
              O link de pagamento já enviado ao cliente continua válido — o token da página é
              estável e não muda ao regerar. Só o QR e o copia-e-cola são substituídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                subindoRef.current = false;
                gerar.mutate();
              }}
            >
              Regerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
