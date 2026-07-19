import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Props {
  vinculoId: string;
}

interface NFRow {
  vinculo_id: string;
  pessoa_id: string;
  pessoa: string | null;
  cnpj_prestador: string | null;
  nf_id: string;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_data_emissao: string | null;
  valor: number | null;
  status: string | null;
  data_vencimento: string | null;
}

const fmtBRL = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

export default function VinculoFinanceiroPJSection({ vinculoId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["pj-notas-fiscais", vinculoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pj_notas_fiscais")
        .select("*")
        .eq("vinculo_id", vinculoId)
        .order("nf_data_emissao", { ascending: false });
      if (error) throw error;
      return (data || []) as NFRow[];
    },
  });

  useEffect(() => {
    if (error) toast.error(humanizeError((error as any)?.message));
  }, [error]);

  const rows = data || [];
  const total = rows.reduce((acc, r) => acc + (Number(r.valor) || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Notas Fiscais (Finanças)
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
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Quantidade de NFs</div>
                <div className="text-xl font-semibold">{rows.length}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Valor total</div>
                <div className="text-xl font-semibold">{fmtBRL(total)}</div>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma nota fiscal encontrada para este CNPJ em Finanças.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Série</TableHead>
                      <TableHead>Emissão</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Vencimento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.nf_id}>
                        <TableCell>{r.nf_numero || "—"}</TableCell>
                        <TableCell>{r.nf_serie || "—"}</TableCell>
                        <TableCell>{fmtDate(r.nf_data_emissao)}</TableCell>
                        <TableCell className="text-right">{fmtBRL(r.valor)}</TableCell>
                        <TableCell>
                          {r.status ? <Badge variant="secondary">{r.status}</Badge> : "—"}
                        </TableCell>
                        <TableCell>{fmtDate(r.data_vencimento)}</TableCell>
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
