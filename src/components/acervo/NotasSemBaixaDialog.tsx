import { useQuery } from "@tanstack/react-query";
import { FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";

type NotaPendente = {
  nf_chave: string;
  nf_numero: string | null;
  nf_data: string | null;
  cnpj_emitente: string | null;
  centro_sugerido: string | null;
  itens: number | null;
  unidades: number | null;
  cfops: string | string[] | null;
  destinatario: string | null;
};

export const CHAVE_NOTAS_SEM_BAIXA = ["baixa-pendente-nf"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useNotasSemBaixa() {
  return useQuery({
    queryKey: CHAVE_NOTAS_SEM_BAIXA,
    queryFn: async () => {
      const { data, error } = await sb.from("vw_baixa_pendente_nf").select("*").order("nf_data");
      if (error) throw error;
      return (data ?? []) as NotaPendente[];
    },
  });
}

const fmtCfops = (c: NotaPendente["cfops"]) => (Array.isArray(c) ? c.join(", ") : c ?? "—");

export function NotasSemBaixaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const notas = useNotasSemBaixa();

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Notas sem baixa</DialogTitle>
        <DialogDescription>Notas fiscais cuja baixa de estoque ainda não foi lançada. A resolução acontece no módulo de origem de cada nota (venda, transferência, consignação, devolução) — não aqui.</DialogDescription>
      </DialogHeader>
      {notas.error && <p className="text-sm text-destructive">Não foi possível carregar as notas: {formatError(notas.error)}</p>}
      {notas.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
        !notas.error && <Table>
          <TableHeader><TableRow>
            <TableHead>NF</TableHead><TableHead>Data</TableHead><TableHead>CFOP</TableHead><TableHead>Destinatário</TableHead>
            <TableHead className="text-right">Itens</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead>Centro sugerido</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(notas.data ?? []).map(n => <TableRow key={n.nf_chave}>
              <TableCell className="font-medium">{n.nf_numero ?? "—"}</TableCell>
              <TableCell>{n.nf_data ? fmtData(n.nf_data) : "—"}</TableCell>
              <TableCell>{fmtCfops(n.cfops)}</TableCell>
              <TableCell className="max-w-56 truncate">{n.destinatario ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{n.itens ?? 0}</TableCell>
              <TableCell className="text-right tabular-nums">{n.unidades ?? 0}</TableCell>
              <TableCell>{n.centro_sugerido ?? "—"}</TableCell>
            </TableRow>)}
            {!notas.data?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma nota pendente.</TableCell></TableRow>}
          </TableBody>
        </Table>}
    </DialogContent>
  </Dialog>;
}

export { FileWarning };
