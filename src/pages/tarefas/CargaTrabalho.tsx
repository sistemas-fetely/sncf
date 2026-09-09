// Carga de trabalho (/tarefas/carga) — F4.
// A matriz antiga de 6 semanas por estimativa_horas foi aposentada: ninguém
// preenchia estimativa e a medição por fila (vw_fila_pressao) substituiu.
// REGRA: inadiável, adiável e dívida NUNCA se somam.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, ExternalLink, Gauge } from "lucide-react";
import { toast } from "sonner";

import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead, ordenarPor, type SortState } from "@/components/shared/SortableTableHead";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { fmtData, diasAtraso, estaVencido } from "@/lib/data";
import { cn } from "@/lib/utils";

const QK = ["fila-pressao"] as const;

interface LinhaPressao {
  fila_id: string | null;
  chave: string;
  nome: string | null;
  area_nome: string | null;
  severidade: string | null;
  rota: string | null;
  prazo_dias: number | null;
  prazo_proprio: boolean | null;
  tempo_unit_min: number | null;
  tempo_origem: string | null;
  responsavel_nome: string | null;
  itens_total: number | null;
  itens_divida: number | null;
  itens_inadiaveis: number | null;
  itens_adiaveis: number | null;
  vencimento_mais_antigo: string | null;
  minutos_inadiaveis: number | null;
  minutos_adiaveis: number | null;
  minutos_divida: number | null;
}

type Coluna =
  | "fila"
  | "prazo"
  | "inadiavel"
  | "adiavel"
  | "divida"
  | "antigo"
  | "tempo";

function minutos(v: number | null | undefined) {
  if (v == null) return "—";
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function n0(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export default function CargaTrabalho() {
  const qc = useQueryClient();
  const [sort, setSort] = useState<SortState<Coluna> | null>({
    column: "inadiavel",
    direction: "desc",
  });
  const [prazoAlvo, setPrazoAlvo] = useState<LinhaPressao | null>(null);
  const [dias, setDias] = useState("");

  const pressao = useQuery({
    queryKey: [...QK],
    staleTime: 30_000,
    refetchOnMount: "always",
    queryFn: async (): Promise<LinhaPressao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("vw_fila_pressao").select("*");
      if (error) throw error;
      return (data ?? []) as LinhaPressao[];
    },
  });

  const definirPrazo = useMutation({
    mutationFn: async ({ chave, dias }: { chave: string; dias: number | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_fila_prazo_definir", {
        _chave: chave,
        _dias: dias,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data as any;
    },
    onSuccess: (r) => {
      const de = r?.de == null ? "herdado" : `${r.de}d`;
      const para =
        r?.para == null
          ? `herda de ${r?.severidade ?? "severidade"}`
          : `${r.para}d`;
      toast.success(`Prazo alterado: ${de} → ${para}`);
      qc.invalidateQueries({ queryKey: [...QK] });
      setPrazoAlvo(null);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const linhas = pressao.data ?? [];

  const totais = useMemo(
    () => ({
      inadiaveis: linhas.reduce((s, l) => s + n0(l.itens_inadiaveis), 0),
      minInadiaveis: linhas.reduce((s, l) => s + n0(l.minutos_inadiaveis), 0),
      adiaveis: linhas.reduce((s, l) => s + n0(l.itens_adiaveis), 0),
      divida: linhas.reduce((s, l) => s + n0(l.itens_divida), 0),
    }),
    [linhas],
  );

  const ordenadas = useMemo(
    () =>
      ordenarPor<LinhaPressao, Coluna>(linhas, sort, {
        fila: (l) => l.nome ?? l.chave,
        prazo: (l) => l.prazo_dias,
        inadiavel: (l) => n0(l.itens_inadiaveis),
        adiavel: (l) => n0(l.itens_adiaveis),
        divida: (l) => n0(l.itens_divida),
        antigo: (l) => l.vencimento_mais_antigo,
        tempo: (l) => l.tempo_unit_min,
      }),
    [linhas, sort],
  );

  return (
    <PageShell>
      <PageTitle
        titulo="Carga de trabalho"
        estado="O que precisa sair hoje, o que pode esperar e o que virou dívida"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Inadiável hoje</p>
            <p className="text-2xl font-semibold tabular-nums">{totais.inadiaveis}</p>
            {totais.minInadiaveis > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {minutos(totais.minInadiaveis)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Adiável</p>
            <p className="text-2xl font-semibold tabular-nums">{totais.adiaveis}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Dívida acumulada</p>
            <p className="text-2xl font-semibold tabular-nums">{totais.divida}</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Os três não se somam: inadiável é o dia, adiável tem folga, dívida é estoque velho que pede
        mutirão.
      </p>

      {pressao.error && <p className="text-sm text-destructive">{formatError(pressao.error)}</p>}

      {pressao.isLoading && <Skeleton className="h-40 w-full" />}

      {!pressao.isLoading && !pressao.error && linhas.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Gauge className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma fila com data de entrada declarada — sem data de entrada não existe vencimento.
            </p>
          </CardContent>
        </Card>
      )}

      {!pressao.isLoading && !pressao.error && linhas.length > 0 && (
        <Card>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead column="fila" sort={sort} onSort={setSort}>
                    Fila
                  </SortableTableHead>
                  <SortableTableHead column="prazo" sort={sort} onSort={setSort}>
                    Prazo
                  </SortableTableHead>
                  <SortableTableHead
                    column="inadiavel"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                    className="text-right"
                  >
                    Inadiável
                  </SortableTableHead>
                  <SortableTableHead
                    column="adiavel"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                    className="text-right"
                  >
                    Adiável
                  </SortableTableHead>
                  <SortableTableHead
                    column="divida"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                    className="text-right"
                  >
                    Dívida
                  </SortableTableHead>
                  <SortableTableHead column="antigo" sort={sort} onSort={setSort}>
                    Mais antigo
                  </SortableTableHead>
                  <SortableTableHead column="tempo" sort={sort} onSort={setSort}>
                    Tempo unit.
                  </SortableTableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.map((l) => {
                  const urgente = n0(l.itens_inadiaveis) > 0;
                  return (
                    <TableRow
                      key={l.chave}
                      className={cn(urgente && "border-l-2 border-l-warning bg-warning/5")}
                    >
                      <TableCell>
                        <p className="text-sm">{l.nome ?? l.chave}</p>
                        {l.area_nome && (
                          <p className="text-[11px] text-muted-foreground">{l.area_nome}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums">
                          {l.prazo_dias == null ? "—" : `${l.prazo_dias}d`}
                        </span>
                        {l.prazo_proprio ? (
                          <Selo estado="info" className="ml-1.5">
                            próprio
                          </Selo>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            herda de {l.severidade ?? "severidade"}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium tabular-nums">{n0(l.itens_inadiaveis)}</span>
                        {n0(l.minutos_inadiaveis) > 0 && (
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {minutos(l.minutos_inadiaveis)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n0(l.itens_adiaveis)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n0(l.itens_divida)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.vencimento_mais_antigo ? (
                          <>
                            <span className="tabular-nums">{fmtData(l.vencimento_mais_antigo)}</span>
                            {estaVencido(l.vencimento_mais_antigo) && (
                              <p className="tabular-nums">
                                há {diasAtraso(l.vencimento_mais_antigo)} dia(s)
                              </p>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {l.tempo_unit_min == null ? (
                          <p className="text-[11px] text-muted-foreground">
                            sem tempo — ligue uma atribuição a esta fila
                          </p>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-sm tabular-nums">{l.tempo_unit_min} min</span>
                            {l.tempo_origem && (
                              <Selo estado={l.tempo_origem === "medido" ? "success" : "muted"}>
                                {l.tempo_origem}
                              </Selo>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Definir prazo da fila"
                            onClick={() => {
                              setPrazoAlvo(l);
                              setDias(l.prazo_dias == null ? "" : String(l.prazo_dias));
                            }}
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                          {l.rota && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Abrir a tela da fila"
                              asChild
                            >
                              <a href={l.rota}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              Só filas que declaram data de entrada — sem data de entrada não existe vencimento. As
              outras aparecem no Dash como contagem.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!prazoAlvo} onOpenChange={(a) => !a && setPrazoAlvo(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Prazo da fila</DialogTitle>
            <DialogDescription>{prazoAlvo?.nome ?? prazoAlvo?.chave}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="prazo-dias">Dias úteis</Label>
            <Input
              id="prazo-dias"
              type="number"
              min={0}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              disabled={definirPrazo.isPending}
              onClick={() =>
                prazoAlvo && definirPrazo.mutate({ chave: prazoAlvo.chave, dias: null })
              }
            >
              Voltar a herdar da severidade
            </Button>
            <Button
              disabled={definirPrazo.isPending || dias.trim() === ""}
              onClick={() =>
                prazoAlvo &&
                definirPrazo.mutate({ chave: prazoAlvo.chave, dias: Number(dias) })
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
