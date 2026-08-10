import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProvisaoCaixa {
  provisao_id: string;
  numero_parcela: number;
  total_parcelas: number | null;
  valor_provisao: number | null;
  data_prevista: string | null;
  tipo_pagamento: string | null;
  eh_entrada: boolean | null;
  adiantado_no_pedido: number | null;
  coberta_por_adiantamento: boolean | null;
  valor_a_receber: number | null;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";

function BadgeStatusProvisao({ coberta }: { coberta?: boolean | null }) {
  if (coberta) {
    return (
      <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-400">
        Paga por adiantamento
      </Badge>
    );
  }
  return <Badge variant="outline" className="border-sky-500 text-sky-700 dark:text-sky-400">Prevista</Badge>;
}

export function usePlanoRecebimento(pedidoId: string) {
  return useQuery({
    queryKey: ["provisao-caixa", pedidoId],
    queryFn: async (): Promise<ProvisaoCaixa[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_provisao_caixa")
        .select(
          "provisao_id, numero_parcela, total_parcelas, valor_provisao, data_prevista, tipo_pagamento, eh_entrada, adiantado_no_pedido, coberta_por_adiantamento, valor_a_receber",
        )
        .eq("pedido_id", pedidoId)
        .order("numero_parcela");
      if (error) throw error;
      return (data ?? []) as ProvisaoCaixa[];
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

  const jaRecebido = data
    .filter((p) => p.coberta_por_adiantamento)
    .reduce((acc, p) => acc + Number(p.valor_provisao ?? 0), 0);
  const aReceber = data.reduce((acc, p) => acc + Number(p.valor_a_receber ?? 0), 0);
  const temAdiantamento = jaRecebido > 0.005;

  const valorClasse = (coberta?: boolean | null) =>
    cn("font-semibold", coberta && "line-through text-muted-foreground font-normal");

  const linhas = (
    <div className="space-y-2">
      {compacto ? (
        <div className="space-y-2">
          {data.map((p) => (
            <div key={p.provisao_id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
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
                <p className={cn("text-sm", valorClasse(p.coberta_por_adiantamento))}>
                  {fmtBRL.format(Number(p.valor_provisao ?? 0))}
                </p>
                <BadgeStatusProvisao coberta={p.coberta_por_adiantamento} />
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
                <TableRow key={p.provisao_id}>
                  <TableCell className="font-mono text-xs">
                    {p.numero_parcela}/{p.total_parcelas ?? data.length}
                    {p.eh_entrada && (
                      <Badge variant="outline" className="ml-2 border-emerald-500 text-emerald-700">Entrada</Badge>
                    )}
                  </TableCell>
                  <TableCell className={valorClasse(p.coberta_por_adiantamento)}>
                    {fmtBRL.format(Number(p.valor_provisao ?? 0))}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(p.data_prevista)}</TableCell>
                  <TableCell className="text-sm">{p.tipo_pagamento ?? "—"}</TableCell>
                  <TableCell><BadgeStatusProvisao coberta={p.coberta_por_adiantamento} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {temAdiantamento && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Já recebido (adiantamento)</span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            {fmtBRL.format(jaRecebido)}
          </span>
        </div>
      )}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Ainda a receber</span>
        <span className="font-bold">{fmtBRL.format(aReceber)}</span>
      </div>
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
