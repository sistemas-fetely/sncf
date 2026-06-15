import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check } from "lucide-react";

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

function LinkCell({ url }: { url?: string | null }) {
  const [copiado, setCopiado] = useState(false);
  if (!url) return <span className="text-muted-foreground">—</span>;
  const copiar = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1400);
    });
  };
  return (
    <div className="flex items-center gap-2 max-w-[260px]">
      <span className="truncate text-xs text-primary underline cursor-pointer" onClick={copiar} title={url}>
        {url}
      </span>
      <button onClick={copiar} className="shrink-0 text-muted-foreground hover:text-primary transition-colors">
        {copiado ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export function PortaoLinksPanel({ pedidoId }: { pedidoId: string }) {
  const portaoQ = useQuery({
    queryKey: ["portao-links", pedidoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedido_portao")
        .select("sequencia, valor, data_vencimento, tipo_pagamento, link_pagamento, plano_restante, status")
        .eq("pedido_id", pedidoId)
        .eq("status", "provisorio")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (portaoQ.isLoading) return <Skeleton className="h-32 w-full" />;

  const portao = portaoQ.data;

  // Sem portao provisorio -> mensagem padrao (comportamento antigo)
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
          Ainda não há título a receber (ele nasce quando o portão é pago). Os links abaixo já estão salvos e podem ser enviados pelo botão "Enviar cobrança".
        </p>
      </div>

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
                <TableCell><LinkCell url={l.link} /></TableCell>
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
