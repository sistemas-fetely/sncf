import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Loader2, QrCode, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/format-currency";
import { useGerarPixPortao } from "@/hooks/pedidos/useGerarPixPortao";

interface Props {
  portaoId: string;
  pedidoId: string;
  tipoPagamento?: string | null;
  /** payload EMV já gravado pela RPC em pedido_portao.link_pagamento */
  linkPagamento?: string | null;
  pixTxid?: string | null;
  valor?: number | null;
  beneficiario?: string | null;
  banco?: string | null;
}

export function PixQrCodePortao({
  portaoId,
  pedidoId,
  tipoPagamento,
  linkPagamento,
  pixTxid,
  valor,
  beneficiario,
  banco,
}: Props) {
  const { toast } = useToast();
  const gerar = useGerarPixPortao();
  const [copiado, setCopiado] = useState(false);

  if (tipoPagamento !== "pix") return null;

  const resultado = gerar.data;
  // payload EMV é texto opaco: só exibir, copiar e virar QR.
  const payload = resultado?.payload ?? linkPagamento ?? null;
  const txid = resultado?.txid ?? pixTxid ?? null;
  const valorFinal = resultado?.valor ?? valor ?? null;
  const beneficiarioFinal = resultado?.beneficiario ?? beneficiario ?? null;
  const bancoFinal = resultado?.banco ?? banco ?? null;

  const temQr = !!payload && !!txid;

  const copiar = () => {
    if (!payload) return;
    navigator.clipboard.writeText(payload).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1400);
      toast({ title: "Copiado", description: "Copia e cola PIX copiado." });
    });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">QR Code PIX do portão</span>
          </div>
          {temQr && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => gerar.mutate({ portao_id: portaoId, pedido_id: pedidoId })}
              disabled={gerar.isPending}
            >
              {gerar.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              Gerar novamente
            </Button>
          )}
        </div>

        {!temQr ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              O QR Code é gerado pelo próprio SNCF, com valor exato e identificador único.
            </p>
            <Button
              size="sm"
              onClick={() => gerar.mutate({ portao_id: portaoId, pedido_id: pedidoId })}
              disabled={gerar.isPending}
            >
              {gerar.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <QrCode className="h-4 w-4 mr-2" />
              )}
              Gerar QR Code PIX
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="bg-background border rounded-md p-3 w-fit self-start">
              <QRCodeSVG value={payload!} size={196} level="M" marginSize={0} />
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Copia e cola
                </span>
                <div className="flex items-start gap-2 min-w-0">
                  <code className="flex-1 min-w-0 truncate font-mono text-[11px] bg-muted text-muted-foreground rounded px-2 py-1.5">
                    {payload}
                  </code>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copiar} title="Copiar">
                    {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-1 text-xs">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Valor</dt>
                  <dd className="font-medium text-foreground">{formatBRL(valorFinal)}</dd>
                </div>
                {beneficiarioFinal && (
                  <div className="flex gap-2 min-w-0">
                    <dt className="text-muted-foreground shrink-0">Beneficiário</dt>
                    <dd className="truncate text-foreground">{beneficiarioFinal}</dd>
                  </div>
                )}
                {bancoFinal && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Banco</dt>
                    <dd className="text-foreground">{bancoFinal}</dd>
                  </div>
                )}
                <div className="flex gap-2 min-w-0">
                  <dt className="text-muted-foreground shrink-0">Identificador no extrato</dt>
                  <dd className="font-mono truncate text-foreground">{txid}</dd>
                </div>
              </dl>

              <Badge
                variant="outline"
                className="border-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px]"
              >
                Uso único · valor exato
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
