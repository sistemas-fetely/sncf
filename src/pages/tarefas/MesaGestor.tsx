// Mesa do Gestor — quem responde por qual trabalho no meu time e quanto isso pesa.
//
// REGRA DURA (igual à tela de Atribuições e Carga): minutos_fluxo_dia e
// minutos_estoque NUNCA se somam nem viram total único.
//  - fluxo   = trabalho que entra por dia → dimensiona equipe
//  - estoque = acumulado parado na fila   → dívida operacional, pede mutirão
// A ocupação é calculada só sobre o fluxo.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ArrowRight, Gauge, Info, Loader2, Users } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Selo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatError } from "@/lib/format-error";

const QK = ["mesa-gestor"] as const;

interface LinhaMesa {
  pessoa_id: string;
  pessoa_nome: string | null;
  gestor_pessoa_id: string | null;
  gestor_nome: string | null;
  atribuicoes: number | null;
  atribuicoes_sem_numero: number | null;
  dono_sem_acesso: boolean | null;
  minutos_fluxo_dia: number | null;
  minutos_estoque: number | null;
  itens_em_estoque: number | null;
  minutos_capacidade_dia: number | null;
  capacidade_presumida: boolean | null;
  ocupacao_pct: number | null;
}

/** Forma devolvida por fn_mesa_ver_como — a RPC valida permissão no banco. */
interface LinhaCargaPessoa {
  atribuicao_id: string;
  nome: string;
  fonte_volume: string | null;
  tempo_unitario_min: number | null;
  fluxo_diario_estimado: number | null;
  estoque_atual: number | null;
  minutos_fluxo_dia: number | null;
  minutos_estoque: number | null;
  furo_sem_numero: boolean | null;
}

/** A RPC lança exceção quando a pessoa não está no time visível. */
function semPermissao(erro: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = erro as any;
  const msg = String(e?.message ?? "").toLowerCase();
  return (
    e?.code === "42501" ||
    msg.includes("permiss") ||
    msg.includes("não autorizado") ||
    msg.includes("nao autorizado") ||
    msg.includes("visível") ||
    msg.includes("visivel")
  );
}

/** Minutos → "2h 30min". Nunca soma fluxo com estoque. */
function minutos(v: number | null | undefined) {
  if (v == null) return "—";
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function num(v: number | null | undefined) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pct(v: number | null | undefined) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

function tomOcupacao(v: number | null | undefined): "success" | "warning" | "destructive" | "muted" {
  if (v == null) return "muted";
  const n = Number(v);
  if (n >= 100) return "destructive";
  if (n >= 85) return "warning";
  return "success";
}

export default function MesaGestor() {
  const [pessoaSel, setPessoaSel] = useState<string>("time");
  const [detalhe, setDetalhe] = useState<LinhaMesa | null>(null);

  const visiveis = useQuery({
    queryKey: [...QK, "visiveis"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any).rpc("fn_mesa_pessoas_visiveis");
      if (error) throw error;
      const linhas = (data ?? []) as unknown;
      if (!Array.isArray(linhas)) return [];
      return linhas
        .map((l: any) => (typeof l === "string" ? l : l?.pessoa_id))
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    },
  });

  const mesa = useQuery({
    queryKey: [...QK, "linhas"],
    queryFn: async (): Promise<LinhaMesa[]> => {
      const { data, error } = await (supabase as any).from("vw_mesa_gestor").select("*");
      if (error) throw error;
      return (data ?? []) as LinhaMesa[];
    },
  });

  /** Furos do catálogo — serve para o estado inicial dizer o que falta declarar. */
  const furos = useQuery({
    queryKey: [...QK, "furos-catalogo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_carga_atribuicao")
        .select("atribuicao_id, furo_sem_numero, furo_sem_dono");
      if (error) throw error;
      const linhas = (data ?? []) as Array<{
        furo_sem_numero: boolean | null;
        furo_sem_dono: boolean | null;
      }>;
      return {
        total: linhas.length,
        aguardando: linhas.filter((l) => l.furo_sem_numero || l.furo_sem_dono).length,
      };
    },
  });

  // O detalhe vem da RPC, não da view: quem decide se este gestor pode ver a
  // mesa de alguém é o banco. Erro dela é resposta legítima, não tela quebrada.
  const detalhePessoa = useQuery({
    queryKey: [...QK, "detalhe", detalhe?.pessoa_id],
    enabled: !!detalhe?.pessoa_id,
    retry: false,
    queryFn: async (): Promise<LinhaCargaPessoa[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_mesa_ver_como", {
        _pessoa_id: detalhe!.pessoa_id,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((d) => ({
        atribuicao_id: String(d.atribuicao_id),
        nome: String(d.atribuicao_nome ?? "—"),
        fonte_volume: d.fonte_volume ?? null,
        tempo_unitario_min: d.tempo_unitario_min ?? null,
        fluxo_diario_estimado: d.fluxo_diario_estimado ?? null,
        estoque_atual: d.estoque_atual ?? null,
        minutos_fluxo_dia: d.minutos_fluxo_dia ?? null,
        minutos_estoque: d.minutos_estoque ?? null,
        furo_sem_numero: d.furo_sem_numero ?? null,
      })) as LinhaCargaPessoa[];
    },
  });

  const permitidas = useMemo(() => new Set(visiveis.data ?? []), [visiveis.data]);

  const linhasTime = useMemo(
    () =>
      (mesa.data ?? [])
        .filter((l) => permitidas.has(l.pessoa_id))
        .sort((a, b) => (a.pessoa_nome ?? "").localeCompare(b.pessoa_nome ?? "", "pt-BR")),
    [mesa.data, permitidas],
  );

  const linhas = useMemo(
    () => (pessoaSel === "time" ? linhasTime : linhasTime.filter((l) => l.pessoa_id === pessoaSel)),
    [linhasTime, pessoaSel],
  );

  const carregando = mesa.isLoading || visiveis.isLoading;
  const erro = mesa.error ?? visiveis.error;

  const totais = useMemo(() => {
    const semNumero = linhas.reduce((s, l) => s + Number(l.atribuicoes_sem_numero ?? 0), 0);
    return {
      pessoas: linhas.length,
      atribuicoes: linhas.reduce((s, l) => s + Number(l.atribuicoes ?? 0), 0),
      semNumero,
      semAcesso: linhas.filter((l) => l.dono_sem_acesso).length,
    };
  }, [linhas]);

  return (
    <PageShell>
      <PageHeader
        titulo="Mesa do Gestor"
        icone={Users}
        estado={
          carregando
            ? "carregando"
            : linhasTime.length === 0
              ? "nenhuma atribuição com responsável e número declarados"
              : `${totais.pessoas} pessoa(s) · ${totais.atribuicoes} atribuições · ${totais.semNumero} sem número declarado`
        }
        acoes={
          linhasTime.length > 0 ? (
            <Select value={pessoaSel} onValueChange={setPessoaSel}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Meu time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time">Meu time</SelectItem>
                {linhasTime.map((l) => (
                  <SelectItem key={l.pessoa_id} value={l.pessoa_id}>
                    {l.pessoa_nome ?? "sem nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      <p className="text-xs text-muted-foreground">
        As duas medidas de carga vivem separadas de propósito: <strong>Carga por dia</strong> é o
        trabalho que entra e dimensiona a equipe; <strong>Acumulado na fila</strong> é dívida já
        parada, que pede mutirão. Elas nunca se somam. A ocupação é calculada só sobre o fluxo.
      </p>

      {erro && <p className="text-sm text-destructive">{formatError(erro)}</p>}

      {carregando && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {/* ESTADO INICIAL — pauta, não vazio. */}
      {!carregando && !erro && linhasTime.length === 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">A Mesa ainda não tem o que mostrar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A Mesa se alimenta do catálogo de atribuições: ela só consegue mostrar carga depois que
              cada tipo de trabalho tiver um responsável e um número declarado (tempo por unidade e
              volume que entra por dia). Enquanto isso não existir, não há carga para calcular — e
              inventar número seria pior que não mostrar nada.
            </p>
            {furos.data && (
              <p className="text-sm">
                <span className="tabular-nums font-medium">{furos.data.aguardando}</span> de{" "}
                <span className="tabular-nums">{furos.data.total}</span> atribuições do catálogo estão
                aguardando declaração de responsável ou de número.
              </p>
            )}
            <Button asChild size="sm">
              <Link to="/admin/atribuicoes">
                Declarar no catálogo de atribuições
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!carregando && !erro && linhasTime.length > 0 && (
        <TooltipProvider>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Carga por pessoa{" "}
                <span className="font-normal text-muted-foreground">({linhas.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="text-right">Atribuições</TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1">
                        Carga por dia
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px] text-xs">
                            Trabalho que entra por dia. É o que dimensiona a equipe. Nunca somado ao
                            acumulado da fila.
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1">
                        Acumulado na fila
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px] text-xs">
                            Dívida operacional já parada na fila. Pede mutirão, não dimensionamento.
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-right">Capacidade/dia</TableHead>
                    <TableHead className="text-right">Ocupação do fluxo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow
                      key={l.pessoa_id}
                      className="cursor-pointer"
                      onClick={() => setDetalhe(l)}
                    >
                      <TableCell>
                        <p className="text-sm">{l.pessoa_nome ?? "sem nome"}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {l.gestor_nome && (
                            <span className="text-[11px] text-muted-foreground">
                              gestor: {l.gestor_nome}
                            </span>
                          )}
                          {Number(l.atribuicoes_sem_numero ?? 0) > 0 && (
                            <Selo estado="warning">
                              carga subestimada · {l.atribuicoes_sem_numero} sem número
                            </Selo>
                          )}
                          {l.dono_sem_acesso && <Selo estado="destructive">sem login</Selo>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(l.atribuicoes)}
                      </TableCell>
                      <TableCell className="border-l border-border/60 text-right tabular-nums">
                        {minutos(l.minutos_fluxo_dia)}
                      </TableCell>
                      <TableCell className="border-l border-border/60 text-right">
                        <span className="tabular-nums">{minutos(l.minutos_estoque)}</span>
                        {Number(l.itens_em_estoque ?? 0) > 0 && (
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {num(l.itens_em_estoque)} itens parados
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="tabular-nums">{minutos(l.minutos_capacidade_dia)}</span>
                        {l.capacidade_presumida && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="cursor-help text-[11px] text-warning">presumida</p>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[260px] text-xs">
                              Ninguém cadastrou a capacidade real desta pessoa. A Mesa presumiu
                              40h/semana. A ocupação abaixo é estimativa em cima de capacidade
                              chutada, não medida.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex flex-col items-end gap-1">
                          <Selo estado={tomOcupacao(l.ocupacao_pct)}>
                            {pct(l.ocupacao_pct)}
                            {l.capacidade_presumida ? " (presumida)" : ""}
                          </Selo>
                          {Number(l.atribuicoes_sem_numero ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-warning">
                              <AlertTriangle className="h-3 w-3" /> mínimo, não real
                            </span>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TooltipProvider>
      )}

      <Sheet open={!!detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              {detalhe?.pessoa_nome ?? "Pessoa"}
            </SheetTitle>
            <SheetDescription>
              Atribuições que compõem a carga desta pessoa. Carga por dia e acumulado na fila são
              medidas diferentes e continuam separadas aqui.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {detalhe?.capacidade_presumida && (
              <p className="rounded-lg border border-border/60 bg-card p-3 text-xs text-warning">
                Capacidade presumida em 40h/semana — ninguém cadastrou a real. A ocupação de{" "}
                {pct(detalhe.ocupacao_pct)} é estimativa.
              </p>
            )}
            {Number(detalhe?.atribuicoes_sem_numero ?? 0) > 0 && (
              <p className="rounded-lg border border-border/60 bg-card p-3 text-xs text-warning">
                {detalhe?.atribuicoes_sem_numero} atribuição(ões) sem número declarado: a carga desta
                pessoa está subestimada.
              </p>
            )}

            {detalhePessoa.isLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> carregando
              </p>
            )}
            {detalhePessoa.isError && (
              <div className="rounded-md border border-destructive/40 bg-card p-3">
                <p className="text-sm text-destructive">
                  {semPermissao(detalhePessoa.error)
                    ? "Sem permissão para ver esta mesa. Ela só abre para o seu time direto e para quem lhe foi delegado."
                    : formatError(detalhePessoa.error)}
                </p>
              </div>
            )}
            {!detalhePessoa.isLoading &&
              !detalhePessoa.isError &&
              (detalhePessoa.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma atribuição declarada para esta pessoa.
              </p>
            )}
            {(detalhePessoa.data ?? []).length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atribuição</TableHead>
                    <TableHead>Fonte de volume</TableHead>
                    <TableHead className="text-right">Tempo unitário</TableHead>
                    <TableHead className="text-right">Fluxo diário</TableHead>
                    <TableHead className="text-right">Carga por dia</TableHead>
                    <TableHead className="text-right">Acumulado na fila</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detalhePessoa.data ?? []).map((a) => (
                    <TableRow key={a.atribuicao_id}>
                      <TableCell>
                        <p className="text-sm">{a.nome}</p>
                        {a.furo_sem_numero && <Selo estado="warning">sem número</Selo>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.fonte_volume ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {a.tempo_unitario_min == null ? "—" : `${num(a.tempo_unitario_min)} min`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(a.fluxo_diario_estimado)}
                      </TableCell>
                      <TableCell className="border-l border-border/60 text-right tabular-nums">
                        {minutos(a.minutos_fluxo_dia)}
                      </TableCell>
                      <TableCell className="border-l border-border/60 text-right tabular-nums">
                        {minutos(a.minutos_estoque)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
