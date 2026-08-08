import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Divergencia = {
  expedicao_codigo: string;
  nf_numero: string | null;
  data_expedicao: string | null;
  pedido_id: string;
  pedido: string;
  cliente: string | null;
  estagio_sncf: string;
  ultimo_evento_xpm: string;
  evento_em: string | null;
  horas_desde_evento: number | null;
  motivo: string;
};

const nf1 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export default function AlertaDivergencia() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["xpm-divergencia"],
    refetchInterval: 300000,
    queryFn: async (): Promise<Divergencia[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_divergencia_estagio")
        .select("*")
        .order("horas_desde_evento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Divergencia[];
    },
  });

  if (isLoading) return null;

  if (isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6 text-sm text-destructive">
          Erro ao carregar divergências de estágio: {(error as any)?.message ?? "erro desconhecido"}
        </CardContent>
      </Card>
    );
  }

  const linhas = data ?? [];
  if (linhas.length === 0) return null;

  return (
    <Card className="border-destructive">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base text-destructive">Divergência de estágio</CardTitle>
        <p className="text-sm text-muted-foreground">
          A XPM registrou embarque ou expedição, mas o pedido não avançou no SNCF. Isso indica falha
          na integração.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Estágio no SNCF</TableHead>
              <TableHead>Último evento XPM</TableHead>
              <TableHead className="text-right">Horas desde o evento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((d) => (
              <TableRow key={`${d.expedicao_codigo}-${d.pedido_id}`}>
                <TableCell>
                  <div className="font-medium">{d.pedido}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.expedicao_codigo}
                    {d.nf_numero ? ` · NF ${d.nf_numero}` : ""}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{d.cliente ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="destructive">{d.estagio_sncf}</Badge>
                </TableCell>
                <TableCell className="text-sm">{d.ultimo_evento_xpm}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.horas_desde_evento == null ? "—" : nf1.format(d.horas_desde_evento)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
