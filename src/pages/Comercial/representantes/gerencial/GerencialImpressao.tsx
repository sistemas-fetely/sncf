import { Fragment, useMemo } from "react";
import { BarraImpressao } from "@/components/impressao/BarraImpressao";
import { useSearchParams } from "react-router-dom";
import { hojeISO } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import type { Linha } from "@/pages/Comercial/representantes/dados";
import { fmtBRL, fmtCompetencia, fmtData, fmtPct } from "../../comissoes/fmt";
import { GraficoCustoDesconto } from "./GraficoCustoDesconto";
import { rotuloSituacao, usePagamentoMes } from "./pagamentoMes";
import { colunasCC, LEGENDA_CC, useContaCorrente, type ValoresCC } from "./contaCorrente";
import {
  competenciaPadrao,
  num,
  primeiroDia,
  RE_COMPETENCIA,
  useGerencial,
  type LinhaRepresentante,
} from "./dados";

const EMPRESA = "Fetély Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48 · Documento interno";

function inteiro(v: unknown) {
  return num(v).toLocaleString("pt-BR");
}

function Rodape({ pagina, total = 3, fluido = false }: { pagina: 1 | 2 | 3; total?: 1 | 2 | 3; fluido?: boolean }) {
  return (
    <footer className={`${fluido ? "mt-6" : "absolute inset-x-0 bottom-0"} flex items-end justify-between gap-4 border-t border-border pt-2 text-[6.5pt] leading-snug text-muted-foreground`}>
      <span>{EMPRESA}</span>
      <span className="shrink-0 tabular-nums">Página {pagina} de {total}</span>
    </footer>
  );
}

function Cabecalho({ rotulo }: { rotulo: string }) {
  return (
    <header className="flex items-end justify-between border-b border-border pb-3">
      <div>
        <div className="font-display text-[22pt] font-medium leading-none text-gold">FETÉLY</div>
        <h1 className="mt-2 text-[15pt] font-medium">Relatório Gerencial de Comissões · {rotulo}</h1>
      </div>
      <div className="text-[7.5pt] text-muted-foreground">Emitido em {fmtData(hojeISO())}</div>
    </header>
  );
}

function Numerao({ titulo, valor, detalhe, destaque }: { titulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0">
      <div className="text-[7.5pt] text-muted-foreground">{titulo}</div>
      <div
        className={
          destaque
            ? "mt-1 whitespace-nowrap text-[26pt] font-medium leading-none tabular-nums text-primary"
            : "mt-1 whitespace-nowrap text-[15pt] font-medium leading-none tabular-nums"
        }
      >
        {valor}
      </div>
      {detalhe && <div className="mt-1 text-[7pt] text-muted-foreground">{detalhe}</div>}
    </div>
  );
}

function PaginaResumo({ mes, historico, rotulo, hcc }: { mes: Linha | null; historico: Linha[]; rotulo: string; hcc: Map<string, ValoresCC> }) {
  return (
    <section className="pagina-a4 relative bg-card text-card-foreground">
      <Cabecalho rotulo={rotulo} />

      <section className="mt-5 grid grid-cols-5 gap-4 border-b border-border pb-4">
        <Numerao titulo="Base faturada pelos representantes" valor={fmtBRL(num(mes?.base_faturada))} />
        <Numerao titulo="Comissão apurada" valor={fmtBRL(num(mes?.comissao_apurada))} />
        <Numerao
          titulo="Custo da comissão"
          valor={fmtPct(mes?.custo_comissao_pct, "%", 2)}
          detalhe="Comissão apurada sobre a base faturada"
          destaque
        />
        <Numerao
          titulo="Comissão a pagar"
          valor={fmtBRL(num(mes?.total_a_pagar))}
          detalhe={
            num(mes?.total_a_pagar) > 0 && mes?.pagar_ate
              ? `Das NFs pagas em ${rotulo} · pagar até ${fmtData(mes.pagar_ate)}`
              : "Nenhuma NF paga neste mês"
          }
        />
        <Numerao
          titulo="Clientes novos abertos"
          valor={inteiro(mes?.clientes_novos_rep)}
          detalhe={`${inteiro(mes?.clientes_recompra_rep)} recompras`}
        />
      </section>

      <section className="mt-5">
        <h2 className="text-[10.5pt] font-medium">Comparativo com os meses anteriores</h2>
        <table className="mt-2 w-full table-fixed border-collapse text-[7.2pt]">
          <colgroup>
            <col className="w-[8%]" /><col className="w-[6%]" /><col className="w-[7%]" /><col className="w-[5%]" /><col className="w-[11%]" />
            <col className="w-[11%]" /><col className="w-[7%]" /><col className="w-[9%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-y border-border text-muted-foreground">
              <th className="py-1.5 text-left font-medium">Mês</th>
              <th className="px-1 py-1.5 text-right font-medium">Repres.</th>
              <th className="px-1 py-1.5 text-right font-medium">Clientes novos</th>
              <th className="px-1 py-1.5 text-right font-medium">Notas</th>
              <th className="px-1 py-1.5 text-right font-medium">Base faturada</th>
              <th className="px-1 py-1.5 text-right font-medium">Comissão apurada</th>
              <th className="px-1 py-1.5 text-right font-medium">Custo %</th>
              <th className="px-1 py-1.5 text-right font-medium">Desconto médio %</th>
              <th className="px-1 py-1.5 text-right font-medium">Comissão a pagar</th>
              <th className="px-1 py-1.5 text-right font-medium">Saldo a liberar</th>
              <th className="py-1.5 pl-1 text-right font-medium">Saldo devido</th>
            </tr>
          </thead>
          <tbody>
            {[...historico].reverse().map((l) => (
              <tr key={String(l.competencia)} className="border-b border-border/70">
                <td className="py-1.5">{fmtCompetencia(l.competencia)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{inteiro(l.representantes_ativos)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{inteiro(l.clientes_novos_rep)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{inteiro(l.notas)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(num(l.base_faturada))}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(num(l.comissao_apurada))}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtPct(l.custo_comissao_pct, "%", 2)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtPct(l.desconto_medio_pct, "%", 2)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(num(l.total_a_pagar))}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(hcc.get(String(l.competencia).slice(0, 10))?.a_liberar_final ?? 0)}</td>
                <td className="py-1.5 pl-1 text-right tabular-nums">{fmtBRL(hcc.get(String(l.competencia).slice(0, 10))?.a_pagar_final ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[6.5pt] leading-relaxed text-muted-foreground">
          Cada mês mostra o que aconteceu nele: NFs faturadas, comissão apurada e NFs pagas pelos clientes. A comissão das NFs pagas é paga ao representante até o dia 15 do mês seguinte.
        </p>
      </section>

      <section className="mt-5">
        <GraficoCustoDesconto historico={historico} altura={175} />
        <p className="mt-2 text-[7pt] leading-relaxed text-muted-foreground">
          Quando o desconto médio sobe, o custo da comissão cai pela régua. A margem é o que fica entre as duas linhas.
        </p>
      </section>

      <Rodape pagina={1} total={3} />
    </section>
  );
}

function BlocoPagamentoMesPdf({ competencia, rotulo }: { competencia: string; rotulo: string }) {
  const p = usePagamentoMes(competencia);
  return (
    <section className="mt-5">
      <h2 className="text-[10.5pt] font-medium">NFs pagas pelos clientes em {rotulo}</h2>
      <p className="text-[7pt] text-muted-foreground">
        {p.pagarAte ? `Comissão a pagar ao representante até ${fmtData(p.pagarAte)}` : "Comissão a pagar ao representante"}
      </p>
      {p.carregando ? (
        <p className="mt-2 text-[8pt] text-muted-foreground">Carregando…</p>
      ) : p.erro ? (
        <p className="mt-2 text-[8pt] text-destructive-strong">Falha ao carregar: {formatError(p.erro)}</p>
      ) : p.linhas.length === 0 ? (
        <p className="mt-2 text-[8pt] text-muted-foreground">Nenhuma NF paga pelos clientes neste mês.</p>
      ) : (
        <table className="mt-2 w-full table-fixed border-collapse text-[7.2pt]">
          <colgroup>
            <col className="w-[18%]" /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[24%]" />
            <col className="w-[10%]" /><col className="w-[11%]" /><col className="w-[19%]" />
          </colgroup>
          <thead style={{ display: "table-header-group" }}>
            <tr className="border-y border-border text-muted-foreground">
              <th className="py-1.5 text-left font-medium">Representante</th>
              <th className="px-1 py-1.5 text-left font-medium">NF</th>
              <th className="px-1 py-1.5 text-left font-medium">Pedido</th>
              <th className="px-1 py-1.5 text-left font-medium">Cliente</th>
              <th className="px-1 py-1.5 text-left font-medium">Cliente pagou em</th>
              <th className="px-1 py-1.5 text-right font-medium">Comissão</th>
              <th className="py-1.5 pl-1 text-left font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {p.grupos.map((g) => (
              <Fragment key={g.representante}>
                {g.linhas.map((l, i) => {
                  const estorno = l.tipo_linha === "estorno";
                  return (
                    <tr key={i} className="border-b border-border/70" style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                      <td className="truncate py-1.5" title={l.representante ?? ""}>{l.representante ?? "—"}</td>
                      <td className="px-1 py-1.5 tabular-nums">{estorno ? "—" : l.nf_numero ?? "—"}</td>
                      <td className="truncate px-1 py-1.5">{estorno ? "—" : l.pedido ?? "—"}</td>
                      <td className="truncate px-1 py-1.5" title={l.cliente ?? ""}>{l.cliente ?? "—"}</td>
                      <td className="px-1 py-1.5 tabular-nums">{l.cliente_pagou_em ? fmtData(l.cliente_pagou_em) : "—"}</td>
                      <td className={`px-1 py-1.5 text-right tabular-nums ${estorno ? "text-destructive" : ""}`}>{fmtBRL(Number(l.valor ?? 0))}</td>
                      <td className="truncate py-1.5 pl-1">{rotuloSituacao(l)}</td>
                    </tr>
                  );
                })}
                <tr className="border-b border-border" style={{ breakBefore: "avoid", pageBreakBefore: "avoid", breakInside: "avoid", pageBreakInside: "avoid" }}>
                  <td colSpan={5} className="py-1.5 text-muted-foreground">Subtotal · {g.representante}</td>
                  <td className="px-1 py-1.5 text-right font-medium tabular-nums">{fmtBRL(g.subtotal)}</td>
                  <td />
                </tr>
              </Fragment>
            ))}
            <tr className="border-t border-foreground/40 font-medium" style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
              <td colSpan={5} className="py-1.5">Total geral</td>
              <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(p.total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

function PaginaDetalhe({
  competencia,
  rotulo,
  representantes,
  travada,
  vencida,
}: {
  competencia: string;
  rotulo: string;
  representantes: LinhaRepresentante[];
  travada: number;
  vencida: number;
}) {
  const totais = representantes.reduce(
    (acc, r) => ({
      notas: acc.notas + r.notas,
      base: acc.base + r.baseFaturada,
      apurada: acc.apurada + r.comissaoApurada,
      liberada: acc.liberada + r.comissaoLiberada,
      aPagar: acc.aPagar + r.aPagar,
      clientesNovos: acc.clientesNovos + r.clientesNovos,
    }),
    { notas: 0, base: 0, apurada: 0, liberada: 0, aPagar: 0, clientesNovos: 0 },
  );

  return (
    <section className="pagina-a4 quebra-pagina relative bg-card text-card-foreground">
      <Cabecalho rotulo={rotulo} />

      <section className="mt-4">
        <h2 className="text-[10.5pt] font-medium">Por representante em {rotulo}</h2>
        {representantes.length === 0 ? (
          <p className="mt-2 text-[8pt] text-muted-foreground">Nenhuma comissão apurada em {rotulo}.</p>
        ) : (
          <table className="mt-2 w-full table-fixed border-collapse text-[7.2pt]">
            <colgroup>
              <col className="w-[22%]" /><col className="w-[7%]" /><col className="w-[7%]" /><col className="w-[12%]" /><col className="w-[9%]" />
              <col className="w-[8%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[11%]" />
            </colgroup>
            <thead>
              <tr className="border-y border-border text-muted-foreground">
                <th className="py-1.5 text-left font-medium">Representante</th>
                <th className="px-1 py-1.5 text-right font-medium">Novos</th>
                <th className="px-1 py-1.5 text-right font-medium">Notas</th>
                <th className="px-1 py-1.5 text-right font-medium">Base faturada</th>
                <th className="px-1 py-1.5 text-right font-medium">Desconto %</th>
                <th className="px-1 py-1.5 text-right font-medium">% efetivo</th>
                <th className="px-1 py-1.5 text-right font-medium">Comissão apurada</th>
                <th className="px-1 py-1.5 text-right font-medium">Comissão liberada</th>
                <th className="py-1.5 pl-1 text-right font-medium">Comissão a pagar</th>
              </tr>
            </thead>
            <tbody>
              {representantes.map((r) => (
                <tr key={r.vendedorId} className="border-b border-border/70">
                  <td className="truncate py-1.5" title={r.representante}>{r.representante}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{inteiro(r.clientesNovos)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{inteiro(r.notas)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(r.baseFaturada)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtPct(r.descontoMedioPct, "%", 2)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtPct(r.pctEfetivo, "%", 2)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(r.comissaoApurada)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(r.comissaoLiberada)}</td>
                  <td className="py-1.5 pl-1 text-right tabular-nums">{fmtBRL(r.aPagar)}</td>
                </tr>
              ))}
              <tr className="border-t border-foreground/40 font-medium">
                <td className="py-1.5">Total</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{inteiro(totais.clientesNovos)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{inteiro(totais.notas)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(totais.base)}</td>
                <td /><td />
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(totais.apurada)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(totais.liberada)}</td>
                <td className="py-1.5 pl-1 text-right tabular-nums">{fmtBRL(totais.aPagar)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-5">
        <h2 className="text-[10.5pt] font-medium">Inadimplência que trava comissão</h2>
        {travada === 0 && vencida === 0 ? (
          <p className="mt-2 text-[8pt] text-muted-foreground">Não há inadimplência travando comissão.</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-6">
            <div className="border-t border-border pt-2">
              <div className="text-[7.5pt] text-muted-foreground">Comissão travada por inadimplência</div>
              <div className="mt-0.5 text-[11pt] font-medium tabular-nums text-destructive-strong">{fmtBRL(travada)}</div>
            </div>
            <div className="border-t border-border pt-2">
              <div className="text-[7.5pt] text-muted-foreground">Carteira vencida dos clientes</div>
              <div className="mt-0.5 text-[11pt] font-medium tabular-nums">{fmtBRL(vencida)}</div>
            </div>
          </div>
        )}
      </section>

      <p className="mt-4 text-[6.5pt] leading-relaxed text-muted-foreground">
        Clientes novos: primeiro pedido registrado no SNCF (base desde 05/2026). Cliente que comprava antes disso aparece como novo no primeiro pedido registrado.
      </p>

      <Rodape pagina={2} total={3} />
    </section>
  );
}

function BlocoContaCorrentePdf({ competencia, rotulo }: { competencia: string; rotulo: string }) {
  const cc = useContaCorrente(competencia);
  const { liberar, pagar } = colunasCC(cc.temEstornoLiberar, cc.temEstornoPagar);
  const evitar = { breakInside: "avoid", pageBreakInside: "avoid" } as const;
  const cel = (v: number, c: string, k: string, primeira: boolean) => (
    <td key={k} className={`px-1 py-1.5 text-right tabular-nums ${primeira ? "border-l border-border/70" : ""} ${c === "a_liberar_vencido" && v > 0 ? "text-destructive" : ""}`}>{fmtBRL(v)}</td>
  );
  return (
    <section className="mt-5">
      <h2 className="text-[10.5pt] font-medium">Conta corrente de comissões em {rotulo}</h2>
      {cc.carregando ? (
        <p className="mt-2 text-[8pt] text-muted-foreground">Carregando…</p>
      ) : cc.erro ? (
        <p className="mt-2 text-[8pt] text-destructive-strong">Falha ao carregar: {formatError(cc.erro)}</p>
      ) : cc.linhas.length === 0 ? (
        <p className="mt-2 text-[8pt] text-muted-foreground">Sem saldo de comissões neste mês.</p>
      ) : (
        <table className="mt-2 w-full border-collapse text-[6.6pt]">
          <thead style={{ display: "table-header-group" }}>
            <tr className="border-t border-border text-muted-foreground">
              <th rowSpan={2} className="py-1 text-left align-bottom font-medium">Representante</th>
              <th colSpan={liberar.length} className="border-l border-border/70 px-1 py-1 text-center font-medium">A liberar (esperando o cliente)</th>
              <th colSpan={pagar.length} className="border-l border-border/70 px-1 py-1 text-center font-medium">A pagar ao representante</th>
            </tr>
            <tr className="border-b border-border text-muted-foreground">
              {[...liberar, ...pagar].map((c, i) => <th key={i} className={`px-1 py-1 text-right font-medium ${i === 0 || i === liberar.length ? "border-l border-border/70" : ""}`}>{c.r}</th>)}
            </tr>
          </thead>
          <tbody>
            {cc.linhas.map((l) => (
              <tr key={l.vendedor_id ?? l.representante} className="border-b border-border/70" style={evitar}>
                <td className="py-1.5">{l.representante}</td>
                {[...liberar, ...pagar].map((c, i) => cel(l[c.c], c.c, String(i), i === 0 || i === liberar.length))}
              </tr>
            ))}
            <tr className="border-t border-foreground/40 font-medium" style={evitar}>
              <td className="py-1.5">Total</td>
              {[...liberar, ...pagar].map((c, i) => cel(cc.total[c.c], c.c, String(i), i === 0 || i === liberar.length))}
            </tr>
          </tbody>
        </table>
      )}
      <p className="mt-1.5 text-[6.5pt] leading-relaxed text-muted-foreground">{LEGENDA_CC}</p>
    </section>
  );
}

function PaginaPagamento({ competencia, rotulo, pagina, total }: { competencia: string; rotulo: string; pagina: 2 | 3; total: 2 | 3 }) {
  return (
    <section className="pagina-fluida quebra-pagina relative bg-card text-card-foreground">
      <Cabecalho rotulo={rotulo} />
      <BlocoContaCorrentePdf competencia={competencia} rotulo={rotulo} />
      <BlocoPagamentoMesPdf competencia={competencia} rotulo={rotulo} />
      <Rodape pagina={pagina} total={total} fluido />
    </section>
  );
}

const ESTILOS_IMPRESSAO = `
  [aria-label="Minhas tarefas"] { display: none !important; }
  .documento-gerencial { min-height: 100vh; background: hsl(var(--muted)); padding: 12mm 0; }
  .pagina-a4, .pagina-fluida { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto 10mm; padding: 15mm; box-shadow: 0 1mm 4mm hsl(var(--foreground) / 0.12); font-family: 'DM Sans', system-ui, sans-serif; font-weight: 400; }
  @page { size: A4; margin: 15mm; }
  @media print {
    html, body, #root { margin: 0 !important; padding: 0 !important; background: hsl(var(--card)) !important; }
    .documento-gerencial { min-height: 0; padding: 0; background: hsl(var(--card)); }
    .pagina-a4 { width: 180mm; height: 267mm; min-height: 267mm; margin: 0; padding: 0; box-shadow: none; overflow: hidden; }
    .pagina-fluida { width: 180mm; height: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; overflow: visible; }
    .quebra-pagina { break-before: page; page-break-before: always; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

export default function GerencialImpressao() {
  const [params] = useSearchParams();
  const competencia = params.get("competencia") ?? competenciaPadrao();
  const valida = RE_COMPETENCIA.test(competencia);
  const g = useGerencial(valida ? competencia : competenciaPadrao());
  const pagamento = usePagamentoMes(valida ? competencia : competenciaPadrao());
  const cc = useContaCorrente(valida ? competencia : competenciaPadrao());
  const rotulo = useMemo(() => fmtCompetencia(primeiroDia(valida ? competencia : competenciaPadrao())), [competencia, valida]);

  const pronto = valida && !g.carregando && !g.erro;


  if (!valida) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8 text-destructive-strong">
        Mês inválido. Use o formato AAAA-MM.
      </div>
    );
  }
  if (g.carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Preparando o relatório…
      </div>
    );
  }
  if (g.erro) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8 text-destructive-strong">
        Falha ao preparar o relatório: {formatError(g.erro)}
      </div>
    );
  }
  if (g.semMovimento) {
    const pagamentoEmPaginaPropria = pagamento.linhas.length > 0;
    return (
      <main className="documento-gerencial">
        <style>{ESTILOS_IMPRESSAO}</style>
        <BarraImpressao />
        <section className="pagina-a4 relative bg-card text-card-foreground">
          <Cabecalho rotulo={rotulo} />
          <div className="mt-12 border-y border-border py-8 text-center text-[10pt] text-muted-foreground">
            Nenhuma comissão apurada em {rotulo}.
          </div>
          {!pagamentoEmPaginaPropria && <BlocoContaCorrentePdf competencia={competencia} rotulo={rotulo} />}
          {!pagamentoEmPaginaPropria && <BlocoPagamentoMesPdf competencia={competencia} rotulo={rotulo} />}
          <Rodape pagina={1} total={pagamentoEmPaginaPropria ? 2 : 1} />
        </section>
        {pagamentoEmPaginaPropria && <PaginaPagamento competencia={competencia} rotulo={rotulo} pagina={2} total={2} />}
      </main>
    );
  }

  return (
    <main className="documento-gerencial">
      <style>{ESTILOS_IMPRESSAO}</style>
        <BarraImpressao />
      <PaginaResumo mes={g.mes} historico={g.historico} rotulo={rotulo} hcc={cc.historico} />
      <PaginaDetalhe
        competencia={competencia}
        rotulo={rotulo}
        representantes={g.representantes}
        travada={g.travadaInadimplencia}
        vencida={g.carteiraVencida}
      />
      <PaginaPagamento competencia={competencia} rotulo={rotulo} pagina={3} total={3} />
    </main>
  );
}
