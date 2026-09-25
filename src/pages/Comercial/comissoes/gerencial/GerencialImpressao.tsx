import { useMemo } from "react";
import { BarraImpressao } from "@/components/impressao/BarraImpressao";
import { useSearchParams } from "react-router-dom";
import { hojeISO } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import type { Linha } from "@/pages/Comercial/representantes/dados";
import { fmtBRL, fmtCompetencia, fmtData } from "../fmt";
import { GraficoCustoDesconto } from "./GraficoCustoDesconto";
import {
  competenciaPadrao,
  num,
  primeiroDia,
  RE_COMPETENCIA,
  useGerencial,
  type LinhaRepresentante,
} from "./dados";

const EMPRESA = "Fetély Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48 · Documento interno";

function pct(v: unknown, casas = 2): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

function inteiro(v: unknown) {
  return num(v).toLocaleString("pt-BR");
}

function Rodape({ pagina, total = 2 }: { pagina: 1 | 2; total?: 1 | 2 }) {
  return (
    <footer className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 border-t border-border pt-2 text-[6.5pt] leading-snug text-muted-foreground">
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

function PaginaResumo({ mes, historico, rotulo }: { mes: Linha | null; historico: Linha[]; rotulo: string }) {
  return (
    <section className="pagina-a4 relative bg-card text-card-foreground">
      <Cabecalho rotulo={rotulo} />

      <section className="mt-5 grid grid-cols-5 gap-4 border-b border-border pb-4">
        <Numerao titulo="Base faturada pelos representantes" valor={fmtBRL(num(mes?.base_faturada))} />
        <Numerao titulo="Comissão apurada" valor={fmtBRL(num(mes?.comissao_apurada))} />
        <Numerao
          titulo="Custo da comissão"
          valor={pct(mes?.custo_comissao_pct)}
          detalhe="Comissão apurada sobre a base faturada"
          destaque
        />
        <Numerao
          titulo="Total a pagar no mês"
          valor={fmtBRL(num(mes?.total_a_pagar))}
          detalhe={mes?.pagar_ate ? `Pagar até ${fmtData(mes.pagar_ate)}` : "Sem data limite definida"}
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
            <col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[6%]" /><col className="w-[14%]" />
            <col className="w-[14%]" /><col className="w-[9%]" /><col className="w-[13%]" /><col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr className="border-y border-border text-muted-foreground">
              <th className="py-1.5 text-left font-medium">Competência</th>
              <th className="px-1 py-1.5 text-right font-medium">Repres.</th>
              <th className="px-1 py-1.5 text-right font-medium">Clientes novos</th>
              <th className="px-1 py-1.5 text-right font-medium">Notas</th>
              <th className="px-1 py-1.5 text-right font-medium">Base faturada</th>
              <th className="px-1 py-1.5 text-right font-medium">Comissão apurada</th>
              <th className="px-1 py-1.5 text-right font-medium">Custo %</th>
              <th className="px-1 py-1.5 text-right font-medium">Desconto médio %</th>
              <th className="py-1.5 pl-1 text-right font-medium">Total a pagar</th>
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
                <td className="px-1 py-1.5 text-right tabular-nums">{pct(l.custo_comissao_pct)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{pct(l.desconto_medio_pct)}</td>
                <td className="py-1.5 pl-1 text-right tabular-nums">{fmtBRL(num(l.total_a_pagar))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-5">
        <GraficoCustoDesconto historico={historico} altura={175} />
        <p className="mt-2 text-[7pt] leading-relaxed text-muted-foreground">
          Quando o desconto médio sobe, o custo da comissão cai pela régua. A margem é o que fica entre as duas linhas.
        </p>
      </section>

      <Rodape pagina={1} />
    </section>
  );
}

function PaginaDetalhe({
  rotulo,
  representantes,
  atencao,
  travada,
  vencida,
}: {
  rotulo: string;
  representantes: LinhaRepresentante[];
  atencao: string[];
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
                <th className="py-1.5 pl-1 text-right font-medium">A pagar</th>
              </tr>
            </thead>
            <tbody>
              {representantes.map((r) => (
                <tr key={r.vendedorId} className="border-b border-border/70">
                  <td className="truncate py-1.5" title={r.representante}>{r.representante}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{inteiro(r.clientesNovos)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{inteiro(r.notas)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtBRL(r.baseFaturada)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{pct(r.descontoMedioPct)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{pct(r.pctEfetivo)}</td>
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
        <h2 className="text-[10.5pt] font-medium">Pontos de atenção</h2>
        {atencao.length === 0 ? (
          <p className="mt-2 text-[8pt] text-muted-foreground">Nenhum ponto de atenção nesta competência.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {atencao.map((item) => (
              <li key={item} className="flex gap-2 text-[8pt] leading-relaxed">
                <span className="mt-[0.35em] h-[3px] w-[3px] shrink-0 rounded-full bg-warning" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
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

      <Rodape pagina={2} />
    </section>
  );
}

const ESTILOS_IMPRESSAO = `
  [aria-label="Minhas tarefas"] { display: none !important; }
  .documento-gerencial { min-height: 100vh; background: hsl(var(--muted)); padding: 12mm 0; }
  .pagina-a4 { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto 10mm; padding: 15mm; box-shadow: 0 1mm 4mm hsl(var(--foreground) / 0.12); font-family: 'DM Sans', system-ui, sans-serif; font-weight: 400; }
  @page { size: A4; margin: 15mm; }
  @media print {
    html, body, #root { margin: 0 !important; padding: 0 !important; background: hsl(var(--card)) !important; }
    .documento-gerencial { min-height: 0; padding: 0; background: hsl(var(--card)); }
    .pagina-a4 { width: 180mm; height: 267mm; min-height: 267mm; margin: 0; padding: 0; box-shadow: none; overflow: hidden; }
    .quebra-pagina { break-before: page; page-break-before: always; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

export default function GerencialImpressao() {
  const [params] = useSearchParams();
  const competencia = params.get("competencia") ?? competenciaPadrao();
  const valida = RE_COMPETENCIA.test(competencia);
  const g = useGerencial(valida ? competencia : competenciaPadrao());
  const rotulo = useMemo(() => fmtCompetencia(primeiroDia(valida ? competencia : competenciaPadrao())), [competencia, valida]);

  const pronto = valida && !g.carregando && !g.erro;


  if (!valida) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8 text-destructive-strong">
        Competência inválida. Use o formato AAAA-MM.
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
    return (
      <main className="documento-gerencial">
        <style>{ESTILOS_IMPRESSAO}</style>
        <BarraImpressao />
        <section className="pagina-a4 relative bg-card text-card-foreground">
          <Cabecalho rotulo={rotulo} />
          <div className="mt-12 border-y border-border py-8 text-center text-[10pt] text-muted-foreground">
            Nenhuma comissão apurada em {rotulo}.
          </div>
          <Rodape pagina={1} total={1} />
        </section>
      </main>
    );
  }

  return (
    <main className="documento-gerencial">
      <style>{ESTILOS_IMPRESSAO}</style>
        <BarraImpressao />
      <PaginaResumo mes={g.mes} historico={g.historico} rotulo={rotulo} />
      <PaginaDetalhe
        rotulo={rotulo}
        representantes={g.representantes}
        atencao={g.atencao}
        travada={g.travadaInadimplencia}
        vencida={g.carteiraVencida}
      />
    </main>
  );
}
