import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Loader2 } from "lucide-react";

type SlaCanal = {
  canal: string;
  horas_sla: number | null;
  ativo: boolean;
  observacao: string | null;
  updated_at: string;
};

type Rascunho = { horas: string; ativo: boolean; observacao: string };

function fmtData(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function BlocoSlaXpm() {
  const qc = useQueryClient();
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const slaQ = useQuery({
    queryKey: ["xpm-sla-canal"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("xpm_sla_canal")
        .select("*")
        .order("canal");
      if (error) throw error;
      return (data ?? []) as SlaCanal[];
    },
  });

  const linhas = useMemo(() => slaQ.data ?? [], [slaQ.data]);

  useEffect(() => {
    setRascunhos(
      Object.fromEntries(
        linhas.map((l) => [
          l.canal,
          {
            horas: l.horas_sla == null ? "" : String(l.horas_sla),
            ativo: l.ativo,
            observacao: l.observacao ?? "",
          },
        ]),
      ),
    );
  }, [linhas]);

  const salvar = useMutation({
    mutationFn: async (canal: string) => {
      const r = rascunhos[canal];
      const horasTexto = (r?.horas ?? "").trim();
      const horas = horasTexto === "" ? null : Number(horasTexto);
      if (horas != null && (Number.isNaN(horas) || horas <= 0)) {
        throw new Error("Horas de SLA precisa ser um número maior que zero, ou vazio.");
      }
      const { error } = await (supabase as any)
        .from("xpm_sla_canal")
        .update({
          horas_sla: horas,
          ativo: r.ativo,
          observacao: r.observacao.trim() === "" ? null : r.observacao.trim(),
        })
        .eq("canal", canal);
      if (error) throw error;
      return canal;
    },
    onMutate: (canal: string) => setSalvando(canal),
    onSuccess: (canal) => {
      toast.success(`SLA do canal ${canal} salvo`);
      qc.invalidateQueries({ queryKey: ["xpm-sla-canal"] });
      qc.invalidateQueries({ queryKey: ["xpm-expedicoes"] });
      qc.invalidateQueries({ queryKey: ["xpm-painel"] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Erro ao salvar o SLA do canal");
    },
    onSettled: () => setSalvando(null),
  });

  function alterar(canal: string, patch: Partial<Rascunho>) {
    setRascunhos((prev) => ({ ...prev, [canal]: { ...prev[canal], ...patch } }));
  }

  function sujo(l: SlaCanal) {
    const r = rascunhos[l.canal];
    if (!r) return false;
    const horasOriginal = l.horas_sla == null ? "" : String(l.horas_sla);
    return (
      r.horas.trim() !== horasOriginal ||
      r.ativo !== l.ativo ||
      r.observacao.trim() !== (l.observacao ?? "")
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">XPM por canal</CardTitle>
        <p className="text-sm text-muted-foreground">
          Meta de horas do ciclo de expedição. O relógio do cliente conta hora corrida; o da XPM
          desconta fim de semana. Os canais vêm da classificação das notas fiscais — não é possível
          criar nem excluir canal aqui.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Alterar o SLA recalcula a aderência de todo o histórico, inclusive dos períodos já
            fechados.
          </AlertDescription>
        </Alert>

        {slaQ.isError ? (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-sm text-destructive">
              {(slaQ.error as Error)?.message ?? "Erro ao carregar o SLA por canal"}
            </CardContent>
          </Card>
        ) : slaQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Canal</TableHead>
                  <TableHead className="w-[140px]">Horas de SLA</TableHead>
                  <TableHead className="w-[90px]">Ativo</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead className="w-[160px]">Última alteração</TableHead>
                  <TableHead className="w-[110px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum canal cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhas.map((l) => {
                    const r = rascunhos[l.canal];
                    return (
                      <TableRow key={l.canal}>
                        <TableCell className="font-medium">{l.canal}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            placeholder="sem SLA"
                            value={r?.horas ?? ""}
                            onChange={(e) => alterar(l.canal, { horas: e.target.value })}
                            className="h-9 tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={r?.ativo ?? false}
                            onCheckedChange={(v) => alterar(l.canal, { ativo: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={r?.observacao ?? ""}
                            onChange={(e) => alterar(l.canal, { observacao: e.target.value })}
                            className="h-9"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtData(l.updated_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!sujo(l) || salvando === l.canal}
                            onClick={() => salvar.mutate(l.canal)}
                            className="gap-2"
                          >
                            {salvando === l.canal && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            )}
                            Salvar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
