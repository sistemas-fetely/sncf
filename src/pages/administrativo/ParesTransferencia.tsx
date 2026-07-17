import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeftRight, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Par = {
  debito_id: string;
  credito_id: string;
  conta_origem_id: string;
  conta_destino_id: string;
  data_debito: string;
  data_credito: string;
  valor: number;
  descricao_debito: string;
  descricao_credito: string;
  contraparte_debito: string | null;
  contraparte_credito: string | null;
  dias_diferenca: number;
  score: number;
};
type Conta = { id: string; nome_exibicao: string };

export default function ParesTransferencia() {
  const qc = useQueryClient();
  const [processando, setProcessando] = useState<string | null>(null);

  const { data: contas = [] } = useQuery({
    queryKey: ["pares-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao");
      if (error) throw error;
      return (data || []) as Conta[];
    },
  });
  const contaMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of contas) m[c.id] = c.nome_exibicao;
    return m;
  }, [contas]);

  const { data: pares = [], isLoading } = useQuery({
    queryKey: ["pares-transferencia"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_pares_transferencia_sugeridos")
        .select("*")
        .order("score", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as Par[];
    },
  });

  async function confirmar(p: Par) {
    setProcessando(p.debito_id + p.credito_id);
    try {
      const { error } = await sb.rpc("confirmar_par_transferencia", {
        p_debito_id: p.debito_id,
        p_credito_id: p.credito_id,
      });
      if (error) throw error;
      toast.success("Par confirmado");
      qc.invalidateQueries({ queryKey: ["pares-transferencia"] });
      qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-admin" />
          Pares de Transferência Sugeridos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Débito em uma conta + crédito em outra, mesmo valor, datas próximas. Confirme para classificar como transferência interna.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Score</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Débito (origem)</TableHead>
                <TableHead>Crédito (destino)</TableHead>
                <TableHead>Δ dias</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </TableCell></TableRow>
              )}
              {!isLoading && pares.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Nenhum par sugerido
                </TableCell></TableRow>
              )}
              {pares.map((p) => {
                const key = p.debito_id + p.credito_id;
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{p.score}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-right whitespace-nowrap">{formatBRL(p.valor)}</TableCell>
                    <TableCell className="text-xs max-w-[280px]">
                      <div className="font-medium">{contaMap[p.conta_origem_id] || "?"}</div>
                      <div className="text-muted-foreground">
                        {formatDateBR(p.data_debito)} · <span className="truncate inline-block max-w-[220px] align-bottom">{p.descricao_debito}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[280px]">
                      <div className="font-medium">{contaMap[p.conta_destino_id] || "?"}</div>
                      <div className="text-muted-foreground">
                        {formatDateBR(p.data_credito)} · <span className="truncate inline-block max-w-[220px] align-bottom">{p.descricao_credito}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{p.dias_diferenca}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processando === key}
                        onClick={() => confirmar(p)}
                        className="gap-1"
                      >
                        {processando === key
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Confirmar par
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
