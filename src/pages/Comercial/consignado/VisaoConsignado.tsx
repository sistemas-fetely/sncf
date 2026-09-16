import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

/**
 * VISÃO DO CONSIGNADO — leitura pura das views do banco.
 * Nenhum número é inventado aqui: só as duas divisões pedidas
 * (semanas→meses e cobertura de reposição) acontecem no front.
 */

export interface KpiConsignadoRow {
  parceiro_id: string;
  razao_social: string | null;
  consignado_modelo: string | null;
  packs_enviados: number | null;
  valor_remessa: number | null;
  packs_vendidos: number | null;
  receita: number | null;
  custo_vendido: number | null;
  margem_bruta: number | null;
  margem_pct: number | null;
  packs_saldo: number | null;
  saldo_valor_remessa: number | null;
  capital_parado: number | null;
  giro_pct: number | null;
  skus_enviados: number | null;
  skus_com_venda: number | null;
  skus_esgotados: number | null;
  cobertura_catalogo_pct: number | null;
  n_ciclos: number | null;
  primeiro_periodo: string | null;
  ultimo_periodo: string | null;
  total_liquidado: number | null;
  semanas_vitrine: number | null;
  ritmo_packs_semana: number | null;
  ritmo_receita_semana: number | null;
  semanas_para_escoar: number | null;
  retorno_capital_pct: number | null;
}

interface SkuRow {
  parceiro_id: string;
  sku: string | null;
  nome_completo: string | null;
  colecao: string | null;
  categoria: string | null;
  tipo: string | null;
  qtd_enviada: number | null;
  qtd_vendida: number | null;
  receita: number | null;
  saldo: number | null;
  saldo_valor_remessa: number | null;
  saldo_valor_custo: number | null;
  margem_bruta: number | null;
}

interface DimensaoRow {
  parceiro_id: string;
  dimensao: string;
  valor: string | null;
  enviados: number | null;
  vendidos: number | null;
  receita: number | null;
  margem: number | null;
  saldo: number | null;
  capital_parado: number | null;
  giro_pct: number | null;
}

interface CicloRow {
  parceiro_id: string;
  acerto_id: string;
  numero: string | null;
  competencia: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  status: string | null;
  semanas: number | null;
  packs: number | null;
  receita: number | null;
  custo: number | null;
  margem: number | null;
  skus: number | null;
}

const num = (v: unknown) => Number(v ?? 0);
const pct = (v: unknown, casas = 1) =>
  `${num(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const qtd = (v: unknown) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function useKpiConsignado(parceiroId?: string) {
  return useQuery({
    queryKey: ["consignado-kpi", parceiroId ?? "todos"],
    enabled: parceiroId !== "" ,
    queryFn: async (): Promise<KpiConsignadoRow[]> => {
      let q = (supabase as any).from("vw_consignado_kpi_parceiro").select("*");
      if (parceiroId) q = q.eq("parceiro_id", parceiroId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as KpiConsignadoRow[];
    },
  });
}

function CartaoMetrica({
  titulo,
  valor,
  subtitulo,
}: { titulo: string; valor: string; subtitulo?: string }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-xl font-medium tabular-nums">{valor}</p>
        {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
      </CardContent>
    </Card>
  );
}

function TabelaDimensao({ linhas, giroGeral }: { linhas: DimensaoRow[]; giroGeral: number }) {
  if (linhas.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Sem dados.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Valor</TableHead>
          <TableHead className="text-right">Vendidos</TableHead>
          <TableHead className="text-right">Receita</TableHead>
          <TableHead className="text-right">Giro %</TableHead>
          <TableHead className="text-right">Capital parado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((l) => {
          const acima = num(l.giro_pct) > giroGeral;
          return (
            <TableRow key={`${l.dimensao}-${l.valor}`} className={cn(acima && "text-success")}>
              <TableCell className="font-medium">{l.valor ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{qtd(l.vendidos)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBRL(l.receita)}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(l.giro_pct)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBRL(l.capital_parado)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function VisaoConsignado({ parceiroId }: { parceiroId?: string }) {
  const kpiQ = useKpiConsignado(parceiroId);
  const kpi = kpiQ.data?.[0] ?? null;

  const skusQ = useQuery({
    queryKey: ["consignado-sku-parceiro", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<SkuRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_consignado_sku_parceiro")
        .select("*")
        .eq("parceiro_id", parceiroId);
      if (error) throw error;
      return (data ?? []) as SkuRow[];
    },
  });

  const dimensaoQ = useQuery({
    queryKey: ["consignado-por-dimensao", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<DimensaoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_consignado_por_dimensao")
        .select("*")
        .eq("parceiro_id", parceiroId);
      if (error) throw error;
      return (data ?? []) as DimensaoRow[];
    },
  });

  const ciclosQ = useQuery({
    queryKey: ["consignado-serie-ciclo", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<CicloRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_consignado_serie_ciclo")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .order("competencia", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CicloRow[];
    },
  });

  const giroGeral = num(kpi?.giro_pct);

  const porDimensao = useMemo(() => {
    const grupos: Record<string, DimensaoRow[]> = { colecao: [], categoria: [], tipo: [] };
    for (const l of dimensaoQ.data ?? []) {
      if (grupos[l.dimensao]) grupos[l.dimensao].push(l);
    }
    for (const k of Object.keys(grupos)) {
      grupos[k].sort((a, b) => num(b.giro_pct) - num(a.giro_pct));
    }
    return grupos;
  }, [dimensaoQ.data]);

  const campeoes = useMemo(
    () => [...(skusQ.data ?? [])].sort((a, b) => num(b.receita) - num(a.receita)).slice(0, 8),
    [skusQ.data],
  );

  const ancoras = useMemo(
    () =>
      (skusQ.data ?? [])
        .filter((s) => num(s.qtd_vendida) === 0)
        .sort((a, b) => num(b.saldo_valor_custo) - num(a.saldo_valor_custo))
        .slice(0, 8),
    [skusQ.data],
  );

  const reposicao = useMemo(() => {
    const semanas = num(kpi?.semanas_vitrine);
    if (semanas <= 0) return [];
    return (skusQ.data ?? [])
      .filter((s) => num(s.qtd_vendida) > 0)
      .map((s) => {
        const porSemana = num(s.qtd_vendida) / semanas;
        const cobertura = porSemana > 0 ? num(s.saldo) / porSemana : 0;
        return { ...s, cobertura };
      })
      .filter((s) => s.cobertura < 8)
      .sort((a, b) => a.cobertura - b.cobertura);
  }, [skusQ.data, kpi?.semanas_vitrine]);

  const ciclos = ciclosQ.data ?? [];
  const mesesEscoar = num(kpi?.semanas_para_escoar) / 4.345;

  const erro =
    (kpiQ.error as Error)?.message ??
    (skusQ.error as Error)?.message ??
    (dimensaoQ.error as Error)?.message ??
    (ciclosQ.error as Error)?.message;

  if (kpiQ.isLoading) {
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (erro) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Falha ao carregar a visão: {erro}</AlertDescription>
      </Alert>
    );
  }

  if (!kpi) {
    return (
      <p className="p-10 text-center text-sm text-muted-foreground">
        Ainda não há remessa consignada para este parceiro.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1 — cartões */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <CartaoMetrica
          titulo="Capital parado"
          valor={formatBRL(kpi.capital_parado)}
          subtitulo="custo em prateleira"
        />
        <CartaoMetrica
          titulo="Giro da remessa"
          valor={pct(kpi.giro_pct)}
          subtitulo={`receita ${formatBRL(kpi.receita)} de ${formatBRL(kpi.valor_remessa)}`}
        />
        <CartaoMetrica
          titulo="Margem bruta"
          valor={formatBRL(kpi.margem_bruta)}
          subtitulo={pct(kpi.margem_pct)}
        />
        <CartaoMetrica
          titulo="Retorno sobre capital"
          valor={pct(kpi.retorno_capital_pct)}
          subtitulo="margem ÷ capital parado, no período observado"
        />
        <CartaoMetrica titulo="Ritmo" valor={`${qtd(kpi.ritmo_packs_semana)} packs/semana`} />
        <CartaoMetrica
          titulo="Escoamento"
          valor={`${mesesEscoar.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses no ritmo atual`}
        />
      </div>

      {/* 2 — alerta contextual */}
      {(num(kpi.semanas_para_escoar) > 52 || num(kpi.cobertura_catalogo_pct) < 30) && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-1">
            {num(kpi.semanas_para_escoar) > 52 && (
              <p>
                No ritmo atual o saldo leva{" "}
                {mesesEscoar.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses
                para escoar. Vale rever mix ou canal.
              </p>
            )}
            {num(kpi.cobertura_catalogo_pct) < 30 && (
              <p>Só {pct(kpi.cobertura_catalogo_pct)} dos SKUs enviados registraram venda.</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 3 — onde o dinheiro gira */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl">Onde o dinheiro gira</h2>
        {dimensaoQ.isLoading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="hidden lg:grid lg:grid-cols-3 gap-3">
              {(["colecao", "categoria", "tipo"] as const).map((dim) => (
                <Card key={dim}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm capitalize">
                      {dim === "colecao" ? "Coleção" : dim === "categoria" ? "Categoria" : "Tipo"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <TabelaDimensao linhas={porDimensao[dim]} giroGeral={giroGeral} />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="lg:hidden">
              <CardContent className="p-3">
                <Tabs defaultValue="colecao">
                  <TabsList>
                    <TabsTrigger value="colecao">Coleção</TabsTrigger>
                    <TabsTrigger value="categoria">Categoria</TabsTrigger>
                    <TabsTrigger value="tipo">Tipo</TabsTrigger>
                  </TabsList>
                  {(["colecao", "categoria", "tipo"] as const).map((dim) => (
                    <TabsContent key={dim} value={dim}>
                      <TabelaDimensao linhas={porDimensao[dim]} giroGeral={giroGeral} />
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      {/* 4 — campeões e âncoras */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl">Campeões e âncoras</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[
            { titulo: "Campeões — mais receita", linhas: campeoes },
            { titulo: "Âncoras — capital sem venda", linhas: ancoras },
          ].map((bloco) => (
            <Card key={bloco.titulo}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{bloco.titulo}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {bloco.linhas.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Sem itens.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Vendidos</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right">Capital</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bloco.linhas.map((s) => (
                        <TableRow key={`${bloco.titulo}-${s.sku}`}>
                          <TableCell className="font-medium">{s.nome_completo ?? s.sku ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{qtd(s.qtd_vendida)}</TableCell>
                          <TableCell className="text-right tabular-nums">{qtd(s.saldo)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(s.saldo_valor_custo)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 5 — reposição */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl">Reposição — acaba primeiro</h2>
        <Card>
          <CardContent className="p-0">
            {reposicao.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum item com cobertura abaixo de 8 semanas.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Vendidos</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Cobertura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reposicao.map((s) => (
                    <TableRow key={`rep-${s.sku}`}>
                      <TableCell className="font-medium">{s.nome_completo ?? s.sku ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{qtd(s.qtd_vendida)}</TableCell>
                      <TableCell className="text-right tabular-nums">{qtd(s.saldo)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(s.saldo) <= 0 ? (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            esgotado
                          </Badge>
                        ) : (
                          `${s.cobertura.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} semanas`
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 6 — ciclos */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl">Ciclos</h2>
        {ciclos.length === 1 && (
          <p className="text-sm text-muted-foreground">
            Primeiro ciclo — comparativo mês a mês começa a fazer sentido a partir do segundo.
          </p>
        )}
        {ciclos.length >= 2 && (
          <Card>
            <CardContent className="p-4" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ciclos.map((c) => ({
                    label: c.competencia ? formatDateBR(c.competencia) : c.numero ?? "—",
                    receita: num(c.receita),
                  }))}
                  margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={80} tickFormatter={(v: number) => formatBRL(v)} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="receita" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-0">
            {ciclos.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhum ciclo registrado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Packs</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...ciclos].reverse().map((c) => (
                    <TableRow key={c.acerto_id}>
                      <TableCell className="font-medium">{formatDateBR(c.competencia)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateBR(c.periodo_inicio)} — {formatDateBR(c.periodo_fim)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{qtd(c.packs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(c.receita)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(c.margem)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.status ?? "—"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
