import { useEffect, useRef, useState } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, ExternalLink, Loader2, QrCode, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/format-currency";
import { supabase } from "@/integrations/supabase/client";
import { useGerarPixProvisao } from "@/hooks/pedidos/useGerarPixProvisao";

interface Props {
  provisaoId: string;
  pedidoId: string;
  tipoPagamento?: string | null;
  /** payload EMV já gravado pela RPC em pedido_portao.link_pagamento */
  linkPagamento?: string | null;
  pixTxid?: string | null;
  valor?: number | null;
  beneficiario?: string | null;
  banco?: string | null;
}

export function PixQrCode({
  provisaoId,
  pedidoId,
  tipoPagamento,
  linkPagamento,
  pixTxid,
  valor,
  beneficiario,
  banco,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const gerar = useGerarPixProvisao();
  const [copiado, setCopiado] = useState(false);
  const [copiadoLink, setCopiadoLink] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const subindoRef = useRef(false);

  const ehPix = tipoPagamento === "pix";

  // pix_qr_url / pix_token vivem na LINHA de cobrança — a RPC grava, o front só lê.
  const { data: portaoPix } = useQuery({
    queryKey: ["provisao-pix-qr", provisaoId],
    enabled: ehPix && !!provisaoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("provisao_recebimento")
        .select("pix_qr_url, pix_token")
        .eq("id", provisaoId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as { pix_qr_url: string | null; pix_token: string | null } | null;
    },
  });

  const resultado = gerar.data;
  // payload EMV é texto opaco: só exibir, copiar e virar QR.
  const payload = resultado?.payload ?? linkPagamento ?? null;
  const txid = resultado?.txid ?? pixTxid ?? null;
  const valorFinal = resultado?.valor ?? valor ?? null;
  const beneficiarioFinal = resultado?.beneficiario ?? beneficiario ?? null;
  const bancoFinal = resultado?.banco ?? banco ?? null;
  const token = (resultado as any)?.token ?? portaoPix?.pix_token ?? null;
  const qrUrl = portaoPix?.pix_qr_url ?? null;

  const temQr = !!payload && !!txid;
  const linkPublico = token ? `${window.location.origin}/pagar/${token}` : null;

  // ── Sobe o PNG do QR pro bucket público (só se ainda não houver imagem) ──
  useEffect(() => {
    if (!ehPix || !payload || !provisaoId) return;
    if (qrUrl) return;
    if (subindoRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    subindoRef.current = true;
    const t = setTimeout(() => {
      canvas.toBlob(async (blob) => {
        try {
          if (!blob) throw new Error("Não foi possível gerar o PNG do QR.");
          const path = `${provisaoId}-${crypto.randomUUID()}.png`;
          const { error: errUp } = await supabase.storage
            .from("pix-qr")
            .upload(path, blob, { contentType: "image/png", upsert: false });
          if (errUp) throw new Error(errUp.message);

          const { data: pub } = supabase.storage.from("pix-qr").getPublicUrl(path);
          const url = pub?.publicUrl;
          if (!url) throw new Error("URL pública do QR não disponível.");

          const { error: errRpc } = await (supabase as any).rpc("registrar_pix_qr_url_provisao", {
            p_provisao_id: provisaoId,
            p_url: url,
          });
          if (errRpc) throw new Error(errRpc.message);

          qc.invalidateQueries({ queryKey: ["provisao-pix-qr", provisaoId] });
        } catch (e: any) {
          // Falha no upload NÃO invalida o QR da tela nem o copia-e-cola.
          subindoRef.current = false;
          toast({
            title: "Imagem do QR não foi salva",
            description: `O QR e o copia-e-cola continuam válidos, mas a imagem para e-mail não pôde ser salva. ${e?.message ?? ""}`.trim(),
            variant: "destructive",
          });
        }
      }, "image/png");
    }, 120);

    return () => clearTimeout(t);
  }, [ehPix, payload, provisaoId, qrUrl, qc, toast]);

  if (!ehPix) return null;

  const copiar = () => {
    if (!payload) return;
    navigator.clipboard.writeText(payload).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1400);
      toast({ title: "Copiado", description: "Copia e cola PIX copiado." });
    });
  };

  const copiarLink = () => {
    if (!linkPublico) return;
    navigator.clipboard.writeText(linkPublico).then(() => {
      setCopiadoLink(true);
      setTimeout(() => setCopiadoLink(false), 1400);
      toast({ title: "Copiado", description: "Link da página de pagamento copiado." });
    });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">QR Code PIX da cobrança</span>
          </div>
          {temQr && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => gerar.mutate({ provisaoId, pedido_id: pedidoId })}
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

        {/* canvas oculto — fonte do PNG 320x320 com fundo branco sólido */}
        {payload && (
          <div style={{ position: "absolute", left: -9999, top: -9999 }} aria-hidden>
            <QRCodeCanvas
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

        {!temQr ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              O QR Code é gerado pelo próprio SNCF, com valor exato e identificador único.
            </p>
            <Button
              size="sm"
              onClick={() => gerar.mutate({ provisaoId, pedido_id: pedidoId })}
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

              {linkPublico && (
                <div className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Página de pagamento
                  </span>
                  <div className="flex items-start gap-2 min-w-0">
                    <code className="flex-1 min-w-0 truncate font-mono text-[11px] bg-muted text-muted-foreground rounded px-2 py-1.5">
                      {linkPublico}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={copiarLink}
                      title="Copiar link"
                    >
                      {copiadoLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild title="Abrir">
                      <a href={linkPublico} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    É o link que o cliente abre para pagar.
                  </p>
                </div>
              )}

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
