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
import { Info, Loader2 } from "lucide-react";

type Parametro = {
  chave: string;
  grupo: string;
  label: string;
  valor: number;
  unidade: string;
  descricao: string | null;
  ativo: boolean;
  updated_at: string;
};

type FreteSla = {
  modalidade: string;
  dias_corridos: number | null;
  descricao: string | null;
  ativo: boolean;
  updated_at: string;
};

type RascunhoParam = { valor: string; ativo: boolean };
type RascunhoFrete = { dias: string; descricao: string; ativo: boolean };

function fmtData(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const UNIDADES: Record<string, string> = {
  dias_uteis: "dias úteis",
  dias_corridos: "dias corridos",
  horas: "horas",
};

export function BlocoSlaFrete() {
  const qc = useQueryClient();
  const [rascParam, setRascParam] = useState<Record<string, RascunhoParam>>({});
  const [rascFrete, setRascFrete] = useState<Record<string, RascunhoFrete>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const paramQ = useQuery({
    queryKey: ["sla-parametro", "meta_entrega"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sla_parametro")
        .select("*")
        .eq("grupo", "meta_entrega")
        .order("chave");
      if (error) throw error;
      return (data ?? []) as Parametro[];
    },
  });

  const freteQ = useQuery({
    queryKey: ["shopify-frete-sla"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shopify_frete_sla")
        .select("*")
        .order("modalidade");
      if (error) throw error;
      return (data ?? []) as FreteSla[];
    },
  });

  const parametros = useMemo(() => paramQ.data ?? [], [paramQ.data]);
  const fretes = useMemo(() => freteQ.data ?? [], [freteQ.data]);

  useEffect(() => {
    setRascParam(
      Object.fromEntries(
        parametros.map((p) => [p.chave, { valor: String(p.valor ?? ""), ativo: p.ativo }]),
      ),
    );
  }, [parametros]);

  useEffect(() => {
    setRascFrete(
      Object.fromEntries(
        fretes.map((f) => [
          f.modalidade,
          {
            dias: f.dias_corridos == null ? "" : String(f.dias_corridos),
            descricao: f.descricao ?? "",
            ativo: f.ativo,
          },
        ]),
      ),
    );
  }, [fretes]);

  const salvarParam = useMutation({
    mutationFn: async (chave: string) => {
      const r = rascParam[chave];
      const texto = (r?.valor ?? "").trim();
      const valor = Number(texto);
      if (texto === "" || !Number.isInteger(valor) || valor < 0) {
        throw new Error("O valor precisa ser um número inteiro maior ou igual a zero.");
      }
      const { error } = await (supabase as any)
        .from("sla_parametro")
        .update({ valor, ativo: r.ativo })
        .eq("chave", chave);
      if (error) throw error;
      return chave;
    },
    onMutate: (chave: string) => setSalvando(`param:${chave}`),
    onSuccess: () => {
      toast.success("Parâmetro salvo");
      qc.invalidateQueries({ queryKey: ["sla-parametro"] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["farol"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar o parâmetro"),
    onSettled: () => setSalvando(null),
  });

  const salvarFrete = useMutation({
    mutationFn: async (modalidade: string) => {
      const r = rascFrete[modalidade];
      const texto = (r?.dias ?? "").trim();
      const dias = Number(texto);
      if (texto === "" || !Number.isInteger(dias) || dias <= 0) {
        throw new Error("Dias corridos precisa ser um número inteiro maior que zero.");
      }
      const { error } = await (supabase as any)
        .from("shopify_frete_sla")
        .update({
          dias_corridos: dias,
          descricao: r.descricao.trim() === "" ? null : r.descricao.trim(),
          ativo: r.ativo,
        })
        .eq("modalidade", modalidade);
      if (error) throw error;
      return modalidade;
    },
    onMutate: (modalidade: string) => setSalvando(`frete:${modalidade}`),
    onSuccess: () => {
      toast.success("Prazo de frete salvo");
      qc.invalidateQueries({ queryKey: ["shopify-frete-sla"] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["farol"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar o prazo de frete"),
    onSettled: () => setSalvando(null),
  });

  function paramSujo(p: Parametro) {
    const r = rascParam[p.chave];
    if (!r) return false;
    return r.valor.trim() !== String(p.valor ?? "") || r.ativo !== p.ativo;
  }

  function freteSujo(f: FreteSla) {
    const r = rascFrete[f.modalidade];
    if (!r) return false;
    return (
      r.dias.trim() !== (f.dias_corridos == null ? "" : String(f.dias_corridos)) ||
      r.descricao.trim() !== (f.descricao ?? "") ||
      r.ativo !== f.ativo
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trânsito e frete</CardTitle>
        <p className="text-sm text-muted-foreground">
          Prazos de transporte usados para calcular a data prometida quando ainda não há CT-e nem
          prazo da transportadora.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            O trânsito padrão só é usado enquanto o pedido não tem transportadora definida. Assim
            que o CT-e chega, o prazo real da transportadora manda.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Meta de entrega</h3>
          {paramQ.isError ? (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-sm text-destructive">
                {(paramQ.error as Error)?.message ?? "Erro ao carregar os parâmetros de entrega"}
              </CardContent>
            </Card>
          ) : paramQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parâmetro</TableHead>
                    <TableHead className="w-[220px]">Valor</TableHead>
                    <TableHead className="w-[90px]">Ativo</TableHead>
                    <TableHead className="w-[160px]">Última alteração</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parametros.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhum parâmetro cadastrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    parametros.map((p) => {
                      const r = rascParam[p.chave];
                      return (
                        <TableRow key={p.chave}>
                          <TableCell>
                            <div className="font-medium">{p.label}</div>
                            {p.descricao && (
                              <div className="text-xs text-muted-foreground">{p.descricao}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                value={r?.valor ?? ""}
                                onChange={(e) =>
                                  setRascParam((prev) => ({
                                    ...prev,
                                    [p.chave]: { ...prev[p.chave], valor: e.target.value },
                                  }))
                                }
                                className="h-9 w-24 tabular-nums"
                              />
                              <span className="text-xs text-muted-foreground">
                                {UNIDADES[p.unidade] ?? p.unidade}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={r?.ativo ?? false}
                              onCheckedChange={(v) =>
                                setRascParam((prev) => ({
                                  ...prev,
                                  [p.chave]: { ...prev[p.chave], ativo: v },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {fmtData(p.updated_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!paramSujo(p) || salvando === `param:${p.chave}`}
                              onClick={() => salvarParam.mutate(p.chave)}
                              className="gap-2"
                            >
                              {salvando === `param:${p.chave}` && (
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
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Prazo por modalidade de frete</h3>
          {freteQ.isError ? (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-sm text-destructive">
                {(freteQ.error as Error)?.message ?? "Erro ao carregar os prazos de frete"}
              </CardContent>
            </Card>
          ) : freteQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Modalidade</TableHead>
                    <TableHead className="w-[140px]">Dias corridos</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[90px]">Ativo</TableHead>
                    <TableHead className="w-[160px]">Última alteração</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fretes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma modalidade cadastrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    fretes.map((f) => {
                      const r = rascFrete[f.modalidade];
                      return (
                        <TableRow key={f.modalidade}>
                          <TableCell className="font-medium">{f.modalidade}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              value={r?.dias ?? ""}
                              onChange={(e) =>
                                setRascFrete((prev) => ({
                                  ...prev,
                                  [f.modalidade]: { ...prev[f.modalidade], dias: e.target.value },
                                }))
                              }
                              className="h-9 tabular-nums"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={r?.descricao ?? ""}
                              onChange={(e) =>
                                setRascFrete((prev) => ({
                                  ...prev,
                                  [f.modalidade]: {
                                    ...prev[f.modalidade],
                                    descricao: e.target.value,
                                  },
                                }))
                              }
                              className="h-9"
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={r?.ativo ?? false}
                              onCheckedChange={(v) =>
                                setRascFrete((prev) => ({
                                  ...prev,
                                  [f.modalidade]: { ...prev[f.modalidade], ativo: v },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {fmtData(f.updated_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!freteSujo(f) || salvando === `frete:${f.modalidade}`}
                              onClick={() => salvarFrete.mutate(f.modalidade)}
                              className="gap-2"
                            >
                              {salvando === `frete:${f.modalidade}` && (
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
        </div>
      </CardContent>
    </Card>
  );
}
