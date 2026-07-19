import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Props {
  vinculoId: string;
}

interface PagRow {
  vinculo_id: string;
  pessoa_id: string;
  pessoa: string | null;
  cnpj_prestador: string | null;
  cpr_id: string;
  descricao: string | null;
  valor: number | null;
  valor_pago: number | null;
  status: string | null;
  tipo: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
}

const fmtBRL = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

export default function VinculoPagamentosPJSection({ vinculoId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["pj-pagamentos", vinculoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pj_pagamentos")
        .select("*")
        .eq("vinculo_id", vinculoId)
        .order("data_vencimento", { ascending: false });
      if (error) throw error;
      return (data || []) as PagRow[];
    },
  });

  useEffect(() => {
    if (error) toast.error(humanizeError((error as any)?.message));
  }, [error]);

  const rows = data || [];
  const totalTitulos = rows.reduce((acc, r) => acc + (Number(r.valor) || 0), 0);
  const totalPago = rows.reduce((acc, r) => acc + (Number(r.valor_pago) || 0), 0);
  const emAberto = totalTitulos - totalPago;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Pagamentos (Finanças)
        </CardTitle>
        <p className="text-xs italic text-muted-foreground">
          Espelho do módulo financeiro — somente leitura.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Total em títulos</div>
                <div className="text-xl font-semibold">{fmtBRL(totalTitulos)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Total pago</div>
                <div className="text-xl font-semibold">{fmtBRL(totalPago)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Em aberto</div>
                <div className="text-xl font-semibold">{fmtBRL(emAberto)}</div>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum pagamento encontrado para este CNPJ em Finanças.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Pago</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Pagamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.cpr_id}>
                        <TableCell>{r.descricao || "—"}</TableCell>
                        <TableCell className="text-right">{fmtBRL(r.valor)}</TableCell>
                        <TableCell className="text-right">
                          {r.valor_pago == null ? "—" : fmtBRL(r.valor_pago)}
                        </TableCell>
                        <TableCell>
                          {r.status ? <Badge variant="secondary">{r.status}</Badge> : "—"}
                        </TableCell>
                        <TableCell>{fmtDate(r.data_vencimento)}</TableCell>
                        <TableCell>{fmtDate(r.data_pagamento)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
