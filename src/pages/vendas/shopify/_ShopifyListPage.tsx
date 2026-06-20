import { useMemo, useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy HH:mm"); } catch { return "—"; }
}
export function txt(s: any): string {
  return s !== null && s !== undefined && String(s).trim() !== "" ? String(s) : "—";
}

type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
};

type DetailField = string;

interface Props<T> {
  titulo: string;
  table: string;
  orderBy?: { column: string; ascending?: boolean };
  searchFields: string[];
  columns: Column<T>[];
  detailFields: DetailField[];
}

export function ShopifyListPage<T extends Record<string, any>>({
  titulo, table, orderBy, searchFields, columns, detailFields,
}: Props<T>) {
  const [busca, setBusca] = useState("");
  const [detalheRow, setDetalheRow] = useState<T | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shopify-list", table],
    queryFn: async () => {
      let q = (supabase as any).from(table).select("*");
      if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? false });
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });

  const filtrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((row) =>
      searchFields.some((f) => String(row[f] ?? "").toLowerCase().includes(term))
    );
  }, [data, busca, searchFields]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-serif">{titulo}</h1>
        <Input
          placeholder="Buscar..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => <TableHead key={c.header}>{c.header}</TableHead>)}
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={columns.length + 1}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground py-8">
                  Nenhum registro.
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((row, idx) => (
                <TableRow key={(row as any).id ?? idx}>
                  {columns.map((c) => <TableCell key={c.header}>{c.cell(row)}</TableCell>)}
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setDetalheRow(row)}>
                      Ver detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!detalheRow} onOpenChange={(o) => !o && setDetalheRow(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes</DialogTitle>
          </DialogHeader>
          {detalheRow && (
            <div className="space-y-4">
              {detailFields.map((f) => (
                <div key={f}>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">{f}</div>
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-80">
                    {JSON.stringify((detalheRow as any)[f] ?? null, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
