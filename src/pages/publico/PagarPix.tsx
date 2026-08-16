import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface PagamentoPublico {
  estado: "aberto" | "encerrado" | "invalido";
  payload?: string | null;
  qr_url?: string | null;
  txid?: string | null;
  valor?: number | string | null;
  vencimento?: string | null;
  pedido?: string | null;
  cliente?: string | null;
  beneficiario?: string | null;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) =>
  s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : null;

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F5F0E8] px-4 py-8 flex flex-col items-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1
            className="text-4xl font-medium tracking-tight"
            style={{ color: "#1a3d2b", fontFamily: "Georgia, serif" }}
          >
            Fetély.
          </h1>
          <p className="mt-1 text-[11px] tracking-wider text-muted-foreground">
            #celebreoqueimporta
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-lg sm:p-7">{children}</div>

        <p className="text-center text-xs text-muted-foreground">
          Fetély · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

export default function PagarPix() {
  const { token } = useParams<{ token: string }>();
  const [copiado, setCopiado] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["pagamento-publico", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("obter_pagamento_publico", {
        p_token: token,
      });
      if (error) throw new Error(error.message);
      return (data ?? { estado: "invalido" }) as PagamentoPublico;
    },
  });

  if (isLoading) {
    return (
      <Moldura>
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando pagamento…
        </div>
      </Moldura>
    );
  }

  const estado = isError ? "invalido" : data?.estado ?? "invalido";

  if (estado === "invalido") {
    return (
      <Moldura>
        <div className="space-y-3 text-center">
          <h2 className="text-xl font-medium" style={{ color: "#1a3d2b" }}>
            Link inválido
          </h2>
          <p className="text-sm text-muted-foreground">
            Este link de pagamento não é válido. Verifique se ele foi copiado por completo.
          </p>
        </div>
      </Moldura>
    );
  }

  if (estado === "encerrado") {
    return (
      <Moldura>
        <div className="space-y-3 text-center">
          <h2 className="text-xl font-medium" style={{ color: "#1a3d2b" }}>
            Este pagamento já foi encerrado
          </h2>
          <p className="text-sm text-muted-foreground">
            Não há nada pendente por aqui. Se você acredita que ainda falta pagar algo, responda o
            e-mail que recebeu da Fetély ou fale com seu contato comercial. A gente resolve junto.
          </p>
        </div>
      </Moldura>
    );
  }

  const payload = data?.payload ?? null;
  const valor = data?.valor != null ? Number(data.valor) : null;
  const vencimento = fmtData(data?.vencimento);

  const copiar = () => {
    if (!payload) return;
    navigator.clipboard.writeText(payload).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    });
  };

  return (
    <Moldura>
      <div className="space-y-5">
        <div className="space-y-1 text-center">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Pagamento via PIX
          </p>
          {valor != null && (
            <p className="text-3xl font-medium" style={{ color: "#1a3d2b" }}>
              {fmtBRL.format(valor)}
            </p>
          )}
          {data?.cliente && <p className="text-sm text-foreground">{data.cliente}</p>}
          <p className="text-xs text-muted-foreground">
            {data?.pedido ? `Pedido ${data.pedido}` : null}
            {data?.pedido && vencimento ? " · " : null}
            {vencimento ? `Vence em ${vencimento}` : null}
          </p>
        </div>

        {payload && (
          <div className="flex justify-center">
            <div className="rounded-xl border bg-white p-3">
              <QRCodeSVG value={payload} size={232} level="M" marginSize={1} bgColor="#FFFFFF" />
            </div>
          </div>
        )}

        <Button
          onClick={copiar}
          disabled={!payload}
          className="h-14 w-full text-base"
          style={{ backgroundColor: copiado ? "#234820" : "#2d5a27" }}
        >
          {copiado ? (
            <>
              <Check className="mr-2 h-5 w-5" /> Código copiado!
            </>
          ) : (
            <>
              <Copy className="mr-2 h-5 w-5" /> Copiar código PIX
            </>
          )}
        </Button>

        {payload && (
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              PIX copia e cola
            </p>
            <code
              className="block select-all rounded-md bg-muted px-3 py-2 text-left font-mono text-[11px] leading-relaxed text-foreground"
              style={{ wordBreak: "break-all" }}
            >
              {payload}
            </code>
          </div>
        )}

        <div className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
          {data?.txid && (
            <p>
              Identificador no extrato: <span className="font-mono">{data.txid}</span>
            </p>
          )}
          {data?.beneficiario && <p>Beneficiário: {data.beneficiario}</p>}
          <p>
            Código de uso único e do valor exato acima. Pagamentos com valor diferente podem não ser
            identificados automaticamente.
          </p>
        </div>
      </div>
    </Moldura>
  );
}
