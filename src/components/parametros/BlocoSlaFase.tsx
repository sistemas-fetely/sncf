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

type SlaFase = {
  estagio: string;
  ordem: number;
  tipo_sla: string;
  sla_dias: number | null;
  dias_uteis: boolean | null;
  fonte_externa: string | null;
  observacao: string | null;
  updated_at: string;
};

type Rascunho = { sla_dias: string; dias_uteis: boolean; observacao: string };

function fmtData(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const FONTES: Record<string, string> = {
  vencimento_titulo: "Cliente (vencimento do título)",
  eta_compra: "Reposição (ETA da compra)",
  frete_transportadora: "Transportadora (prazo do frete)",
};

function responsavel(l: SlaFase) {
  if (l.tipo_sla === "interno") return "Fetely";
  if (!l.fonte_externa) return "—";
  return FONTES[l.fonte_externa] ?? l.fonte_externa;
}

export function BlocoSlaFase() {
  const qc = useQueryClient();
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const faseQ = useQuery({
    queryKey: ["sla-fase-pedido"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sla_fase_pedido")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as SlaFase[];
    },
  });

  const linhas = useMemo(() => faseQ.data ?? [], [faseQ.data]);

  useEffect(() => {
    setRascunhos(
      Object.fromEntries(
        linhas.map((l) => [
          l.estagio,
          {
            sla_dias: l.sla_dias == null ? "" : String(l.sla_dias),
            dias_uteis: l.dias_uteis ?? false,
            observacao: l.observacao ?? "",
          },
        ]),
      ),
    );
  }, [linhas]);

  const salvar = useMutation({
    mutationFn: async (estagio: string) => {
      const l = linhas.find((x) => x.estagio === estagio);
      if (!l) throw new Error("Fase não encontrada.");
      const r = rascunhos[estagio];
      const patch: Record<string, unknown> = {
        observacao: r.observacao.trim() === "" ? null : r.observacao.trim(),
      };
      if (l.tipo_sla === "interno") {
        const texto = (r.sla_dias ?? "").trim();
        const dias = Number(texto);
        if (texto === "" || !Number.isInteger(dias) || dias < 0) {
          throw new Error(
            "Fase interna precisa de um SLA em dias. Use 0 para fase que deve avançar no mesmo dia.",
          );
        }
        patch.sla_dias = dias;
        patch.dias_uteis = r.dias_uteis;
      }
      const { error } = await (supabase as any)
        .from("sla_fase_pedido")
        .update(patch)
        .eq("estagio", estagio);
      if (error) throw error;
      return estagio;
    },
    onMutate: (estagio: string) => setSalvando(estagio),
    onSuccess: (estagio) => {
      toast.success(`SLA da fase ${estagio} salvo`);
      qc.invalidateQueries({ queryKey: ["sla-fase-pedido"] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["farol"] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Erro ao salvar o SLA da fase");
    },
    onSettled: () => setSalvando(null),
  });

  function alterar(estagio: string, patch: Partial<Rascunho>) {
    setRascunhos((prev) => ({ ...prev, [estagio]: { ...prev[estagio], ...patch } }));
  }

  function sujo(l: SlaFase) {
    const r = rascunhos[l.estagio];
    if (!r) return false;
    if (r.observacao.trim() !== (l.observacao ?? "")) return true;
    if (l.tipo_sla !== "interno") return false;
    const diasOriginal = l.sla_dias == null ? "" : String(l.sla_dias);
    return r.sla_dias.trim() !== diasOriginal || r.dias_uteis !== (l.dias_uteis ?? false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fases do pedido</CardTitle>
        <p className="text-sm text-muted-foreground">
          Prazo interno de cada fase do pedido. Só fase de tipo interno tem meta: espera externa,
          trânsito e fase terminal dependem de terceiro ou não têm relógio.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Alterar aqui muda o farol e a previsão de entrega em tela. A data prometida já gravada
            nos pedidos existentes NÃO muda — ela é cravada uma vez, quando o pedido nasce.
          </AlertDescription>
        </Alert>

        {faseQ.isError ? (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-sm text-destructive">
              {(faseQ.error as Error)?.message ?? "Erro ao carregar o SLA das fases do pedido"}
            </CardContent>
          </Card>
        ) : faseQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">Ordem</TableHead>
                  <TableHead className="w-[180px]">Fase</TableHead>
                  <TableHead className="w-[110px]">Tipo</TableHead>
                  <TableHead className="w-[120px]">SLA (dias)</TableHead>
                  <TableHead className="w-[100px]">Dias úteis</TableHead>
                  <TableHead className="w-[200px]">Responsável</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead className="w-[160px]">Última alteração</TableHead>
                  <TableHead className="w-[110px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Nenhuma fase cadastrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhas.map((l) => {
                    const r = rascunhos[l.estagio];
                    const interno = l.tipo_sla === "interno";
                    return (
                      <TableRow key={l.estagio}>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {l.ordem}
                        </TableCell>
                        <TableCell className="font-medium">{l.estagio}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{l.tipo_sla}</TableCell>
                        <TableCell>
                          {interno ? (
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={r?.sla_dias ?? ""}
                              onChange={(e) => alterar(l.estagio, { sla_dias: e.target.value })}
                              className="h-9 tabular-nums"
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {interno ? (
                            <Switch
                              checked={r?.dias_uteis ?? false}
                              onCheckedChange={(v) => alterar(l.estagio, { dias_uteis: v })}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {responsavel(l)}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={r?.observacao ?? ""}
                            onChange={(e) => alterar(l.estagio, { observacao: e.target.value })}
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
                            disabled={!sujo(l) || salvando === l.estagio}
                            onClick={() => salvar.mutate(l.estagio)}
                            className="gap-2"
                          >
                            {salvando === l.estagio && (
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
