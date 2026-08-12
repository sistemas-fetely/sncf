import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PixQrCodePortao } from "@/components/pedidos/PixQrCodePortao";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—";

interface ParcelaPlano {
  numero_parcela?: number | string;
  valor_bruto?: number | string;
  data_vencimento?: string;
  tipo_pagamento?: string;
  link_pagamento?: string;
}

const BOLETO_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Aguardando remessa", variant: "secondary" },
  remessa_gerada: { label: "Remessa gerada", variant: "outline" },
  registrado: { label: "Registrado no banco", variant: "default" },
  rejeitado: { label: "Rejeitado", variant: "destructive" },
  pago_manual: { label: "Pago manualmente", variant: "default" },
  pago_banco: { label: "Pago pelo banco", variant: "default" },
};

function BoletoEntradaCell({ tituloEntrada }: { tituloEntrada: any }) {
  if (!tituloEntrada) {
    return <span className="text-muted-foreground text-xs">Boleto não gerado ainda</span>;
  }
  const cfg = BOLETO_STATUS_LABEL[tituloEntrada.boleto_status ?? ""] ?? {
    label: tituloEntrada.boleto_status ?? "—",
    variant: "secondary" as const,
  };
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={cfg.variant} className="text-[10px] w-fit">{cfg.label}</Badge>
      {tituloEntrada.linha_digitavel && (
        <span className="font-mono text-[10px] text-muted-foreground">{tituloEntrada.linha_digitavel}</span>
      )}
    </div>
  );
}

export function PortaoLinksPanel({ pedidoId }: { pedidoId: string }) {
  const portaoQ = useQuery({
    queryKey: ["portao-links", pedidoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedido_portao")
        .select("id, sequencia, valor, data_vencimento, tipo_pagamento, link_pagamento, plano_restante, status, pix_txid, pix_gerado_em")
        .eq("pedido_id", pedidoId)
        .eq("status", "provisorio")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const tituloEntradaQ = useQuery({
    queryKey: ["portao-titulo-entrada", pedidoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("titulo_a_receber")
        .select("id, boleto_status, linha_digitavel, numero_titulo")
        .eq("pedido_id", pedidoId)
        .eq("eh_entrada", true)
        .not("status", "eq", "cancelado")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!pedidoId,
  });

  if (portaoQ.isLoading || tituloEntradaQ.isLoading) return <Skeleton className="h-32 w-full" />;

  const portao = portaoQ.data;

  if (!portao) {
    return <p className="text-sm text-muted-foreground">Nenhum título em aberto para este pedido.</p>;
  }

  const planoRaw = portao.plano_restante;
  const plano: ParcelaPlano[] = Array.isArray(planoRaw) ? planoRaw : [];

  const linhas = [
    {
      parcela: String(portao.sequencia ?? 1),
      eh_gate: true,
      valor: Number(portao.valor ?? 0),
      vencimento: (portao.data_vencimento ?? null) as string | null,
      tipo: (portao.tipo_pagamento ?? null) as string | null,
      link: (portao.link_pagamento ?? null) as string | null,
    },
    ...plano.map((p) => ({
      parcela: String(p.numero_parcela ?? ""),
      eh_gate: false,
      valor: Number(p.valor_bruto ?? 0),
      vencimento: (p.data_vencimento ?? null) as string | null,
      tipo: (p.tipo_pagamento ?? null) as string | null,
      link: (p.link_pagamento ?? null) as string | null,
    })),
  ];

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium text-foreground">
          Cobrança via portão — aguardando 1º pagamento à vista
        </h4>
        <p className="text-xs text-muted-foreground mt-1">
          {portao.tipo_pagamento === "boleto"
            ? "O boleto de entrada foi gerado e aguarda inclusão na remessa Safra. Após o pagamento ser confirmado pelo banco, as parcelas restantes serão criadas automaticamente."
            : 'Ainda não há título a receber (ele nasce quando o portão é pago). O link de pagamento é ÚNICO para o pedido — não existe um link por parcela — e pode ser enviado pelo botão "Enviar cobrança".'}
        </p>
      </div>

      <PixQrCodePortao
        portaoId={portao.id}
        pedidoId={pedidoId}
        tipoPagamento={portao.tipo_pagamento}
        linkPagamento={portao.link_pagamento}
        pixTxid={portao.pix_txid}
        valor={Number(portao.valor ?? 0)}
      />

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Parcela</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Link de pagamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">
                  {l.parcela}
                  {l.eh_gate && <Badge variant="secondary" className="ml-2 text-[10px]">Portão</Badge>}
                </TableCell>
                <TableCell>{fmtBRL.format(l.valor)}</TableCell>
                <TableCell>{fmtDate(l.vencimento)}</TableCell>
                <TableCell>{l.tipo ?? "—"}</TableCell>
                <TableCell>
                  {l.eh_gate && l.tipo === "boleto" ? (
                    <BoletoEntradaCell tituloEntrada={tituloEntradaQ.data} />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {l.link ? "mesmo link do pedido" : "—"}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {linhas.length === 0 && (
          <p className="text-sm text-muted-foreground p-4">Nenhuma parcela encontrada.</p>
        )}
      </div>
    </div>
  );
}
