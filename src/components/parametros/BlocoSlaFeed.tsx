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

type FeedSla = {
  modo_alimentacao: string;
  dias_limite: number | null;
  descricao: string | null;
  ativo: boolean;
  updated_at: string;
};

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

type RascunhoFeed = { dias: string; descricao: string; ativo: boolean };
type RascunhoParam = { valor: string; ativo: boolean };

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

export function BlocoSlaFeed() {
  const qc = useQueryClient();
  const [rascFeed, setRascFeed] = useState<Record<string, RascunhoFeed>>({});
  const [rascParam, setRascParam] = useState<Record<string, RascunhoParam>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const feedQ = useQuery({
    queryKey: ["logistica-feed-sla"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("logistica_feed_sla")
        .select("*")
        .order("modo_alimentacao");
      if (error) throw error;
      return (data ?? []) as FeedSla[];
    },
  });

  const paramQ = useQuery({
    queryKey: ["sla-parametro", "vigilancia_logistica"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sla_parametro")
        .select("*")
        .eq("grupo", "vigilancia_logistica")
        .order("chave");
      if (error) throw error;
      return (data ?? []) as Parametro[];
    },
  });

  const feeds = useMemo(() => feedQ.data ?? [], [feedQ.data]);
  const parametros = useMemo(() => paramQ.data ?? [], [paramQ.data]);

  useEffect(() => {
    setRascFeed(
      Object.fromEntries(
        feeds.map((f) => [
          f.modo_alimentacao,
          {
            dias: f.dias_limite == null ? "" : String(f.dias_limite),
            descricao: f.descricao ?? "",
            ativo: f.ativo,
          },
        ]),
      ),
    );
  }, [feeds]);

  useEffect(() => {
    setRascParam(
      Object.fromEntries(
        parametros.map((p) => [p.chave, { valor: String(p.valor ?? ""), ativo: p.ativo }]),
      ),
    );
  }, [parametros]);

  const salvarFeed = useMutation({
    mutationFn: async (modo: string) => {
      const r = rascFeed[modo];
      const texto = (r?.dias ?? "").trim();
      const dias = Number(texto);
      if (texto === "" || !Number.isInteger(dias) || dias <= 0) {
        throw new Error("Dias limite precisa ser um número inteiro maior que zero.");
      }
      const { error } = await (supabase as any)
        .from("logistica_feed_sla")
        .update({
          dias_limite: dias,
          descricao: r.descricao.trim() === "" ? null : r.descricao.trim(),
          ativo: r.ativo,
        })
        .eq("modo_alimentacao", modo);
      if (error) throw error;
      return modo;
    },
    onMutate: (modo: string) => setSalvando(`feed:${modo}`),
    onSuccess: () => {
      toast.success("Limite do feed salvo");
      qc.invalidateQueries({ queryKey: ["logistica-feed-sla"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar o limite do feed"),
    onSettled: () => setSalvando(null),
  });

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
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar o parâmetro"),
    onSettled: () => setSalvando(null),
  });

  function feedSujo(f: FeedSla) {
    const r = rascFeed[f.modo_alimentacao];
    if (!r) return false;
    return (
      r.dias.trim() !== (f.dias_limite == null ? "" : String(f.dias_limite)) ||
      r.descricao.trim() !== (f.descricao ?? "") ||
      r.ativo !== f.ativo
    );
  }

  function paramSujo(p: Parametro) {
    const r = rascParam[p.chave];
    if (!r) return false;
    return r.valor.trim() !== String(p.valor ?? "") || r.ativo !== p.ativo;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vigilância da logística</CardTitle>
        <p className="text-sm text-muted-foreground">
          Limiares que fazem um pedido ou um feed aparecer na fila de atenção.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Estes números não são meta de prazo: são o ponto em que algo parado vira alerta na fila.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Saúde do feed</h3>
          {feedQ.isError ? (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-sm text-destructive">
                {(feedQ.error as Error)?.message ?? "Erro ao carregar os limites do feed"}
              </CardContent>
            </Card>
          ) : feedQ.isLoading ? (
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
                    <TableHead className="w-[200px]">Modo de alimentação</TableHead>
                    <TableHead className="w-[140px]">Dias limite</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[90px]">Ativo</TableHead>
                    <TableHead className="w-[160px]">Última alteração</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeds.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhum modo cadastrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    feeds.map((f) => {
                      const r = rascFeed[f.modo_alimentacao];
                      return (
                        <TableRow key={f.modo_alimentacao}>
                          <TableCell className="font-medium">{f.modo_alimentacao}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              value={r?.dias ?? ""}
                              onChange={(e) =>
                                setRascFeed((prev) => ({
                                  ...prev,
                                  [f.modo_alimentacao]: {
                                    ...prev[f.modo_alimentacao],
                                    dias: e.target.value,
                                  },
                                }))
                              }
                              className="h-9 tabular-nums"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={r?.descricao ?? ""}
                              onChange={(e) =>
                                setRascFeed((prev) => ({
                                  ...prev,
                                  [f.modo_alimentacao]: {
                                    ...prev[f.modo_alimentacao],
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
                                setRascFeed((prev) => ({
                                  ...prev,
                                  [f.modo_alimentacao]: {
                                    ...prev[f.modo_alimentacao],
                                    ativo: v,
                                  },
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
                              disabled={!feedSujo(f) || salvando === `feed:${f.modo_alimentacao}`}
                              onClick={() => salvarFeed.mutate(f.modo_alimentacao)}
                              className="gap-2"
                            >
                              {salvando === `feed:${f.modo_alimentacao}` && (
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
          <h3 className="text-sm font-medium">Limiares de vigilância</h3>
          {paramQ.isError ? (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-sm text-destructive">
                {(paramQ.error as Error)?.message ?? "Erro ao carregar os limiares de vigilância"}
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
      </CardContent>
    </Card>
  );
}
