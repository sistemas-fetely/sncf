import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarClock } from "lucide-react";

interface Provisao {
  id: string;
  numero_parcela: number;
  total_parcelas: number | null;
  valor: number | null;
  data_prevista: string | null;
  tipo_pagamento: string | null;
  eh_entrada: boolean | null;
  status: string | null;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";

function BadgeStatusProvisao({ status }: { status?: string | null }) {
  if (status === "consumida") {
    return <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-400">Faturada</Badge>;
  }
  if (status === "prevista") {
    return <Badge variant="outline" className="border-sky-500 text-sky-700 dark:text-sky-400">Prevista</Badge>;
  }
  return <Badge variant="outline">{status ?? "—"}</Badge>;
}

export function usePlanoRecebimento(pedidoId: string) {
  return useQuery({
    queryKey: ["provisao-recebimento", pedidoId],
    queryFn: async (): Promise<Provisao[]> => {
      const { data, error } = await (supabase as any)
        .from("provisao_recebimento")
        .select("id, numero_parcela, total_parcelas, valor, data_prevista, tipo_pagamento, eh_entrada, status")
        .eq("pedido_id", pedidoId)
        .order("numero_parcela");
      if (error) throw error;
      return (data ?? []) as Provisao[];
    },
    enabled: !!pedidoId,
  });
}

export function PlanoRecebimentoCard({
  pedidoId,
  compacto = false,
}: { pedidoId: string; compacto?: boolean }) {
  const { data, isLoading, isError, error } = usePlanoRecebimento(pedidoId);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (isError) {
    return (
      <p className="text-xs text-destructive">
        Erro ao carregar plano de recebimento: {(error as any)?.message ?? "falha desconhecida"}
      </p>
    );
  }
  if (!data || data.length === 0) return null;

  const total = data.reduce((acc, p) => acc + Number(p.valor ?? 0), 0);
  const tudoFaturado = data.every((p) => p.status === "consumida");

  const linhas = (
    <div className="space-y-2">
      {compacto ? (
        <div className="space-y-2">
          {data.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs">{p.numero_parcela}/{p.total_parcelas ?? data.length}</span>
                  {p.eh_entrada && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-500 text-emerald-700">entrada</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.tipo_pagamento ?? "—"} · {fmtDate(p.data_prevista)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{fmtBRL.format(Number(p.valor ?? 0))}</p>
                <BadgeStatusProvisao status={p.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parcela</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento previsto</TableHead>
                <TableHead>Tipo de pagamento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    {p.numero_parcela}/{p.total_parcelas ?? data.length}
                    {p.eh_entrada && (
                      <Badge variant="outline" className="ml-2 border-emerald-500 text-emerald-700">Entrada</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">{fmtBRL.format(Number(p.valor ?? 0))}</TableCell>
                  <TableCell className="text-sm">{fmtDate(p.data_prevista)}</TableCell>
                  <TableCell className="text-sm">{p.tipo_pagamento ?? "—"}</TableCell>
                  <TableCell><BadgeStatusProvisao status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Total previsto</span>
        <span className="font-bold">{fmtBRL.format(total)}</span>
      </div>

      {tudoFaturado && (
        <p className="text-xs text-muted-foreground">Plano faturado — ver títulos abaixo</p>
      )}
    </div>
  );

  if (compacto) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          Plano de Recebimento (provisões)
        </p>
        {linhas}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Plano de Recebimento (provisões)
        </CardTitle>
      </CardHeader>
      <CardContent>{linhas}</CardContent>
    </Card>
  );
}
