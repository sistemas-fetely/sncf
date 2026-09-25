import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Printer } from "lucide-react";
import { formatError } from "@/lib/format-error";
import { fmtBRL, fmtCompetencia, fmtData } from "../fmt";
import { fmtInt } from "@/pages/Comercial/representantes/dados";
import { GraficoCustoDesconto } from "./GraficoCustoDesconto";
import { competenciaPadrao, num, primeiroDia, useGerencial } from "./dados";

function pct(v: unknown, casas = 2): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** Últimos 24 meses como opções de competência. */
function opcoesCompetencia(): string[] {
  const hoje = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function Numerao({ titulo, valor, detalhe, destaque }: { titulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <Card className={destaque ? "border-primary/40 bg-primary/5" : undefined}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{titulo}</div>
        <div className={`mt-1 font-medium tabular-nums ${destaque ? "text-3xl text-primary" : "text-2xl"}`}>{valor}</div>
        {detalhe && <div className="mt-1 text-xs text-muted-foreground">{detalhe}</div>}
      </CardContent>
    </Card>
  );
}

export function AbaGerencial() {
  const [competencia, setCompetencia] = useState(competenciaPadrao());
  const opcoes = useMemo(opcoesCompetencia, []);
  const g = useGerencial(competencia);
  const rotulo = fmtCompetencia(primeiroDia(competencia));

  const totais = useMemo(
    () =>
      g.representantes.reduce(
        (acc, r) => ({
          notas: acc.notas + r.notas,
          base: acc.base + r.baseFaturada,
          apurada: acc.apurada + r.comissaoApurada,
          liberada: acc.liberada + r.comissaoLiberada,
          aPagar: acc.aPagar + r.aPagar,
          clientesNovos: acc.clientesNovos + r.clientesNovos,
        }),
        { notas: 0, base: 0, apurada: 0, liberada: 0, aPagar: 0, clientesNovos: 0 },
      ),
    [g.representantes],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={competencia} onValueChange={setCompetencia}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((c) => (
              <SelectItem key={c} value={c}>
                {fmtCompetencia(primeiroDia(c))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button asChild size="sm" variant="outline">
          <Link
            to={`/comercial/comissoes/gerencial-impressao?competencia=${competencia}`}
          >
            <Printer className="mr-1 h-4 w-4" />
            Baixar PDF
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Relatório Gerencial de Comissões · {rotulo} · emitido em {fmtData(new Date().toISOString().slice(0, 10))}
      </p>

      {g.erro && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Falha ao carregar o relatório: {formatError(g.erro)}</AlertDescription>
        </Alert>
      )}

      {g.carregando && (
        <div className="flex justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!g.carregando && !g.erro && g.semMovimento && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma comissão apurada em {rotulo}.
          </CardContent>
        </Card>
      )}

      {!g.carregando && !g.erro && !g.semMovimento && (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <Numerao titulo="Base faturada pelos representantes" valor={fmtBRL(num(g.mes?.base_faturada))} />
            <Numerao titulo="Comissão apurada" valor={fmtBRL(num(g.mes?.comissao_apurada))} />
            <Numerao
              titulo="Custo da comissão"
              valor={pct(g.mes?.custo_comissao_pct)}
              detalhe="Comissão apurada sobre a base faturada"
              destaque
            />
            <Numerao
              titulo="Total a pagar no mês"
              valor={fmtBRL(num(g.mes?.total_a_pagar))}
              detalhe={g.mes?.pagar_ate ? `Pagar até ${fmtData(g.mes.pagar_ate)}` : "Sem data limite definida"}
            />
            <Numerao
              titulo="Clientes novos abertos"
              valor={fmtInt(g.mes?.clientes_novos_rep)}
              detalhe={`${fmtInt(g.mes?.clientes_recompra_rep)} recompras`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comparativo com os meses anteriores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead className="text-right">Representantes ativos</TableHead>
                    <TableHead className="text-right">Clientes novos</TableHead>
                    <TableHead className="text-right">Notas</TableHead>
                    <TableHead className="text-right">Base faturada</TableHead>
                    <TableHead className="text-right">Comissão apurada</TableHead>
                    <TableHead className="text-right">Custo %</TableHead>
                    <TableHead className="text-right">Desconto médio %</TableHead>
                    <TableHead className="text-right">Total a pagar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...g.historico].reverse().map((l) => (
                    <TableRow key={String(l.competencia)}>
                      <TableCell>{fmtCompetencia(l.competencia)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(l.representantes_ativos)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(l.clientes_novos_rep)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(l.notas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(num(l.base_faturada))}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(num(l.comissao_apurada))}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(l.custo_comissao_pct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(l.desconto_medio_pct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(num(l.total_a_pagar))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <GraficoCustoDesconto historico={g.historico} altura={240} />
              <p className="text-xs text-muted-foreground">
                Quando o desconto médio sobe, o custo da comissão cai pela régua. A margem é o que fica entre as duas linhas.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por representante em {rotulo}</CardTitle>
            </CardHeader>
            <CardContent>
              {g.representantes.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma comissão apurada em {rotulo}.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Representante</TableHead>
                      <TableHead className="text-right">Novos</TableHead>
                      <TableHead className="text-right">Notas</TableHead>
                      <TableHead className="text-right">Base faturada</TableHead>
                      <TableHead className="text-right">Desconto médio %</TableHead>
                      <TableHead className="text-right">% efetivo</TableHead>
                      <TableHead className="text-right">Comissão apurada</TableHead>
                      <TableHead className="text-right">Comissão liberada</TableHead>
                      <TableHead className="text-right">A pagar neste ciclo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.representantes.map((r) => (
                      <TableRow key={r.vendedorId}>
                        <TableCell className="font-medium">{r.representante}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(r.clientesNovos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(r.notas)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBRL(r.baseFaturada)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(r.descontoMedioPct)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(r.pctEfetivo)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBRL(r.comissaoApurada)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBRL(r.comissaoLiberada)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBRL(r.aPagar)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-foreground/30 font-medium">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(totais.clientesNovos)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(totais.notas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(totais.base)}</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right tabular-nums">{fmtBRL(totais.apurada)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(totais.liberada)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(totais.aPagar)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pontos de atenção</CardTitle>
              </CardHeader>
              <CardContent>
                {g.atencao.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum ponto de atenção nesta competência.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {g.atencao.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inadimplência que trava comissão</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {g.travadaInadimplencia === 0 && g.carteiraVencida === 0 ? (
                  <p className="text-muted-foreground">Não há inadimplência travando comissão.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Comissão travada por inadimplência</div>
                      <div className="mt-0.5 text-lg font-medium tabular-nums text-destructive-strong">
                        {fmtBRL(g.travadaInadimplencia)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Carteira vencida dos clientes</div>
                      <div className="mt-0.5 text-lg font-medium tabular-nums">{fmtBRL(g.carteiraVencida)}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">
            Clientes novos: primeiro pedido registrado no SNCF (base desde 05/2026). Cliente que comprava antes disso aparece como novo no primeiro pedido registrado.
          </p>
        </>
      )}
    </div>
  );
}
