import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface Comprovante {
  estado: "concluido" | "invalido";
  tipo?: "estorno" | "cancelamento" | "devolucao_pix";
  meio?: string | null;
  pedido?: string | null;
  cliente?: string | null;
  valor?: number | string | null;
  pago_em?: string | null;
  reembolsado_em?: string | null;
  cartao_bandeira?: string | null;
  cartao_final?: string | null;
  nsu_venda?: string | null;
  id_operacao?: string | null;
  e2e_devolucao?: string | null;
  beneficiario?: string | null;
  cnpj?: string | null;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDataHora = (s?: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : null;

const TEXTO: Record<string, string> = {
  estorno: "A compra foi estornada no mesmo dia do pagamento: ela deixa de aparecer na fatura do seu cartão. Se ainda aparecer como pendente no app do banco, some em alguns dias.",
  cancelamento: "O valor foi devolvido ao seu cartão. O crédito aparece em uma das próximas faturas, conforme o prazo do banco emissor.",
  devolucao_pix: "O valor foi devolvido por PIX para a conta de origem do pagamento.",
};

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F5F0E8] px-4 py-8 flex flex-col items-center print:bg-white print:p-0">
      <style>{`@media print { @page { size: A4; margin: 15mm; } .no-print { display: none !important; } .print-card { box-shadow: none !important; } }`}</style>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-medium tracking-tight" style={{ color: "#1a3d2b", fontFamily: "Georgia, serif" }}>Fetély.</h1>
          <p className="mt-1 text-[11px] tracking-wider text-muted-foreground">#celebreoqueimporta</p>
        </div>
        <div className="print-card rounded-2xl bg-white p-5 shadow-lg sm:p-7">{children}</div>
        <p className="text-center text-xs text-muted-foreground">Fetély · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right break-all">{valor}</span>
    </div>
  );
}

export default function ComprovanteReembolso() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["comprovante-reembolso", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("obter_comprovante_reembolso_publico", { p_token: token });
      if (error) throw new Error(error.message);
      return (data ?? { estado: "invalido" }) as Comprovante;
    },
  });

  if (isLoading) {
    return (
      <Moldura>
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando comprovante…
        </div>
      </Moldura>
    );
  }

  if (isError || !data || data.estado !== "concluido") {
    return (
      <Moldura>
        <p className="py-4 text-center text-sm text-muted-foreground">Comprovante não encontrado.</p>
      </Moldura>
    );
  }

  const cartao = data.meio?.toLowerCase().includes("cart") || data.tipo === "estorno" || data.tipo === "cancelamento";
  const meioTxt = cartao
    ? `Cartão${data.cartao_bandeira ? ` ${data.cartao_bandeira}` : ""}${data.cartao_final ? ` final ${data.cartao_final}` : ""}`
    : "PIX";
  const valor = data.valor != null ? Number(data.valor) : null;

  return (
    <Moldura>
      <div className="space-y-5">
        <div className="space-y-1 text-center">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Comprovante de reembolso</p>
          {valor != null && <p className="text-3xl font-medium tabular-nums" style={{ color: "#1a3d2b" }}>{fmtBRL.format(valor)}</p>}
          {data.cliente && <p className="text-sm text-foreground">{data.cliente}</p>}
          {data.pedido && <p className="text-xs text-muted-foreground">Pedido {data.pedido}</p>}
        </div>

        <div className="flex flex-col items-center gap-1 rounded-xl bg-success/10 py-3 text-success">
          <span className="flex items-center gap-1.5 text-sm font-medium"><CheckCircle2 className="h-4 w-4" /> Reembolso realizado</span>
          {data.reembolsado_em && <span className="text-xs">{fmtDataHora(data.reembolsado_em)}</span>}
        </div>

        <div className="divide-y rounded-xl border px-3">
          <p className="py-2 text-[11px] uppercase tracking-wider text-muted-foreground">Detalhes</p>
          <Linha rotulo="Meio" valor={meioTxt} />
          <Linha rotulo="Data do pagamento original" valor={fmtDataHora(data.pago_em)} />
          {cartao && <Linha rotulo="NSU da venda" valor={data.nsu_venda} />}
          {cartao ? <Linha rotulo="Identificador da operação" valor={data.id_operacao} /> : <Linha rotulo="E2E da devolução" valor={data.e2e_devolucao} />}
          <Linha rotulo="Beneficiário" valor={[data.beneficiario, data.cnpj].filter(Boolean).join(" · ")} />
        </div>

        {data.tipo && TEXTO[data.tipo] && <p className="text-sm text-muted-foreground">{TEXTO[data.tipo]}</p>}

        <Button className="no-print w-full" variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Baixar PDF
        </Button>
      </div>
    </Moldura>
  );
}
