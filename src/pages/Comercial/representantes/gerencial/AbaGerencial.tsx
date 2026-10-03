import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FileText, Loader2, Printer } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatError } from "@/lib/format-error";
import { fmtBRL, fmtCompetencia, fmtData } from "../../comissoes/fmt";
import { fmtInt } from "@/pages/Comercial/representantes/dados";
import { GraficoCustoDesconto } from "./GraficoCustoDesconto";
import { Badge } from "@/components/ui/badge";
import { rotuloSituacao, usePagamentoMes } from "./pagamentoMes";
import { colunasCC, LEGENDA_CC, useContaCorrente } from "./contaCorrente";
import { competenciaPadrao, mesSeguinte, num, primeiroDia, useGerencial } from "./dados";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const mesUrl = searchParams.get("mes");
  const [competencia, setCompetencia] = useState(
    mesUrl && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesUrl) ? mesUrl : competenciaPadrao(),
  );
  const opcoes = useMemo(opcoesCompetencia, []);
  const g = useGerencial(competencia);
  const cc = useContaCorrente(competencia);
  const rotulo = fmtCompetencia(primeiroDia(competencia));
  const mesPagamento = mesSeguinte(competencia);
  const rotuloPagamento = fmtCompetencia(primeiroDia(mesPagamento));

  const alterarCompetencia = (novaCompetencia: string) => {
    setCompetencia(novaCompetencia);
    const proximos = new URLSearchParams(searchParams);
    proximos.set("aba", "gerencial");
    proximos.set("mes", novaCompetencia);
    setSearchParams(proximos, { replace: true });
  };

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
        <Select value={competencia} onValueChange={alterarCompetencia}>
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
            to={`/comercial/representantes/gerencial-impressao?competencia=${competencia}`}
          >
            <Printer className="mr-1 h-4 w-4" />
            Baixar PDF
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`/comercial/representantes/extratos-impressao?competencia=${mesPagamento}`}>
            <FileText className="mr-1 h-4 w-4" />
            Extratos dos representantes (PDF)
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
              titulo="Comissão a pagar"
              valor={fmtBRL(num(g.mes?.total_a_pagar))}
              detalhe={
                num(g.mes?.total_a_pagar) > 0 && g.mes?.pagar_ate
                  ? `Das NFs pagas em ${rotulo} · pagar até ${fmtData(g.mes.pagar_ate)}`
                  : "Nenhuma NF paga neste mês"
              }
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
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Representantes ativos</TableHead>
                    <TableHead className="text-right">Clientes novos</TableHead>
                    <TableHead className="text-right">Notas</TableHead>
                    <TableHead className="text-right">Base faturada</TableHead>
                    <TableHead className="text-right">Comissão apurada</TableHead>
                    <TableHead className="text-right">Custo %</TableHead>
                    <TableHead className="text-right">Desconto médio %</TableHead>
                    <TableHead className="text-right">Comissão a pagar</TableHead>
                    <TableHead className="text-right">Saldo a liberar</TableHead>
                    <TableHead className="text-right">Saldo devido</TableHead>
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
                      <TableCell className="text-right tabular-nums">{fmtBRL(cc.historico.get(String(l.competencia).slice(0, 10))?.a_liberar_final ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(cc.historico.get(String(l.competencia).slice(0, 10))?.a_pagar_final ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Cada mês mostra o que aconteceu nele: NFs faturadas, comissão apurada e NFs pagas pelos clientes. A comissão das NFs pagas é paga ao representante até o dia 15 do mês seguinte.
              </p>
              <GraficoCustoDesconto historico={g.historico} altura={240} />
              <p className="text-xs text-muted-foreground">
                Quando o desconto médio sobe, o custo da comissão cai pela régua. A margem é o que fica entre as duas linhas.
              </p>
            </CardContent>
          </Card>

          <BlocoContaCorrente cc={cc} rotulo={rotulo} />

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
                      <TableHead className="text-right">Comissão a pagar</TableHead>
                      <TableHead className="w-10" />
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
                        <TableCell className="w-10 p-1">
                          {r.aPagar !== 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                                    <Link
                                      to={`/comercial/representantes/${r.vendedorId}/extrato-impressao?competencia=${mesPagamento}`}
                                      aria-label={`Extrato de ${r.representante} (pagamento ${rotuloPagamento})`}
                                    ><FileText className="h-4 w-4" /></Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Extrato do representante (pagamento {rotuloPagamento})</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
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
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
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
          <p className="text-xs text-muted-foreground">
            Clientes novos: primeiro pedido registrado no SNCF (base desde 05/2026). Cliente que comprava antes disso aparece como novo no primeiro pedido registrado.
          </p>
        </>
      )}

      {!g.carregando && !g.erro && <BlocoPagamentoMes competencia={competencia} rotulo={rotulo} />}
    </div>
  );
}

function BlocoPagamentoMes({ competencia, rotulo }: { competencia: string; rotulo: string }) {
  const p = usePagamentoMes(competencia);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">NFs pagas pelos clientes em {rotulo}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {p.pagarAte ? `Comissão a pagar ao representante até ${fmtData(p.pagarAte)}` : "Comissão a pagar ao representante"}
        </p>
      </CardHeader>
      <CardContent>
        {p.carregando ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : p.erro ? (
          <p className="py-6 text-center text-sm text-destructive-strong">Falha ao carregar: {formatError(p.erro)}</p>
        ) : p.linhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma NF paga pelos clientes neste mês.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Representante</TableHead>
                <TableHead>NF</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Cliente pagou em</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.grupos.map((g) => (
                <Fragment key={g.representante}>
                  {g.linhas.map((l, i) => {
                    const estorno = l.tipo_linha === "estorno";
                    return (
                      <TableRow key={`${g.representante}-${l.liberacao_id ?? i}-${i}`}>
                        <TableCell>{l.representante ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{estorno ? "—" : l.nf_numero ?? "—"}</TableCell>
                        <TableCell>{estorno ? "—" : l.pedido ?? "—"}</TableCell>
                        <TableCell>{l.cliente ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{l.cliente_pagou_em ? fmtData(l.cliente_pagou_em) : "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums ${estorno ? "text-destructive" : ""}`}>{fmtBRL(Number(l.valor ?? 0))}</TableCell>
                        <TableCell><Badge variant="outline">{rotuloSituacao(l)}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow key={`sub-${g.representante}`} className="bg-muted/40">
                    <TableCell colSpan={5} className="text-xs text-muted-foreground">Subtotal · {g.representante}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtBRL(g.subtotal)}</TableCell>
                    <TableCell />
                  </TableRow>
                </Fragment>
              ))}
              <TableRow className="border-t-2 border-foreground/30 font-medium">
                <TableCell colSpan={5}>Total geral</TableCell>
                <TableCell className="text-right tabular-nums">{fmtBRL(p.total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function BlocoContaCorrente({ cc, rotulo }: { cc: ReturnType<typeof useContaCorrente>; rotulo: string }) {
  const { liberar, pagar } = colunasCC(cc.temEstornoLiberar, cc.temEstornoPagar);
  const cel = (v: number, c: string) => (
    <TableCell className={`text-right tabular-nums ${c === "a_liberar_vencido" && v > 0 ? "text-destructive" : ""} ${c === "a_liberar_final" || c === "a_pagar_final" ? "font-medium" : ""}`}>{fmtBRL(v)}</TableCell>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conta corrente de comissões em {rotulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {cc.carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : cc.erro ? (
          <p className="text-sm text-destructive">Falha ao carregar: {formatError(cc.erro)}</p>
        ) : cc.linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem saldo de comissões neste mês.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom">Representante</TableHead>
                <TableHead colSpan={liberar.length} className="border-l text-center">A liberar (esperando o cliente)</TableHead>
                <TableHead colSpan={pagar.length} className="border-l text-center">A pagar ao representante</TableHead>
              </TableRow>
              <TableRow>
                {liberar.map((c, i) => <TableHead key={"l" + c.c} className={`text-right ${i === 0 ? "border-l" : ""}`}>{c.r}</TableHead>)}
                {pagar.map((c, i) => <TableHead key={"p" + c.c} className={`text-right ${i === 0 ? "border-l" : ""}`}>{c.r}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cc.linhas.map((l) => (
                <TableRow key={l.vendedor_id ?? l.representante}>
                  <TableCell>{l.representante}</TableCell>
                  {liberar.map((c) => <Fragment key={"l" + c.c}>{cel(l[c.c], c.c)}</Fragment>)}
                  {pagar.map((c) => <Fragment key={"p" + c.c}>{cel(l[c.c], c.c)}</Fragment>)}
                </TableRow>
              ))}
              <TableRow className="font-medium">
                <TableCell>Total</TableCell>
                {liberar.map((c) => <Fragment key={"l" + c.c}>{cel(cc.total[c.c], c.c)}</Fragment>)}
                {pagar.map((c) => <Fragment key={"p" + c.c}>{cel(cc.total[c.c], c.c)}</Fragment>)}
              </TableRow>
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">{LEGENDA_CC}</p>
      </CardContent>
    </Card>
  );
}
