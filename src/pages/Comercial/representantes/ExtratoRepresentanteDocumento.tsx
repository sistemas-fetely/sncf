import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { hojeISO } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { fmtBRL, fmtCompetencia, fmtData, fmtPct } from "../comissoes/fmt";
import { lerTudo, type Linha } from "./dados";
import { ajustesDoExtrato, carteiraPorPedido, pagamentosDoExtrato } from "./extratoMensal";
import type { ExtratoFechadoDoRepresentante } from "./extratoCompetencias";
import {
  dataDoFechamento, extratoDaCompetencia, lerExtratosDoRepresentante, opcoesCompetencia,
} from "./extratoCompetencias";

const EMPRESA = "Fetély Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48";
const NOTA_LEGAL =
  "A comissão nasce na nota fiscal, sobre o valor da NF menos frete, e só é liberada quando o cliente paga. Pagamento até o dia 15 do mês subsequente à liquidação, mediante nota fiscal de serviço (Lei 4.886/1965, art. 32). Dúvidas podem ser registradas pelo portal do representante.";
const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mês anterior ao mês de pagamento — o período medido pelo extrato. */
function mesAnterior(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rotuloCompetencia(competencia: string) {
  return fmtCompetencia(`${competencia}-01`);
}

function numero(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function RodapeMensal() {
  return <footer className="rodape-mensal mt-6 border-t border-border pt-3 text-[7pt] leading-relaxed text-muted-foreground"><p>{NOTA_LEGAL}</p><p className="mt-2">{EMPRESA}</p></footer>;
}

function CarteiraTabela({ parcelas, atrasada = false }: { parcelas: Linha[]; atrasada?: boolean }) {
  const linhas = carteiraPorPedido(parcelas, atrasada ? "vencida" : "a_vencer");
  if (atrasada && !linhas.length) return null;
  return <section className="bloco-mensal mt-6">
    <h2 className="text-[12pt] font-medium">{atrasada ? "Travado por atraso do cliente" : "A receber"}</h2>
    {!atrasada && <p className="mt-1 text-[7.5pt] text-muted-foreground">Posição em {fmtData(hojeISO())}</p>}
    {!linhas.length ? <p className="mt-3 text-[9pt] text-muted-foreground">Nada a receber no momento</p> : <table className="tabela-mensal mt-3 w-full table-fixed border-collapse text-[8pt]">
      <colgroup><col className="w-[31%]"/><col className="w-[15%]"/><col className="w-[17%]"/><col className="w-[17%]"/><col className="w-[20%]"/></colgroup>
      <thead><tr><th>Cliente</th><th>Pedido</th><th className="text-right">{atrasada ? "Vencido desde" : "Parcelas restantes"}</th><th className="text-right">{atrasada ? "Dias em atraso" : "Próximo vencimento"}</th><th className="text-right">{atrasada ? "Comissão travada" : "Comissão a receber"}</th></tr></thead>
      <tbody>{linhas.map((l, i) => <tr key={i}><td>{l.cliente || "—"}</td><td>{l.pedido || "—"}</td><td className="text-right tabular-nums">{atrasada ? fmtData(l.vencimento) : l.parcelas}</td><td className="text-right tabular-nums">{atrasada ? l.dias_atraso : fmtData(l.vencimento)}</td><td className="text-right tabular-nums">{fmtBRL(l.comissao)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={4}>Total</td><td className="text-right tabular-nums">{fmtBRL(linhas.reduce((t, l) => t + numero(l.comissao), 0))}</td></tr></tfoot>
    </table>}
  </section>;
}

function DocumentoMensal({ competencia, representante, extrato, parcelas, pagamentos }: {
  competencia: string; representante: Linha; extrato?: ExtratoFechadoDoRepresentante; parcelas: Linha[]; pagamentos: Linha[];
}) {
  const ajustes = ajustesDoExtrato(Array.isArray(extrato?.detalhe) ? extrato.detalhe : []);
  return <section className="pagina-a4 pagina-mensal bg-card text-card-foreground">
    <header className="flex items-end justify-between gap-4 border-b border-border pb-4">
      <div><div className="font-display text-[25pt] font-medium leading-none text-gold">FETÉLY</div><h1 className="mt-3 text-[17pt] font-medium">Extrato de {rotuloCompetencia(competencia)}</h1><p className="mt-1 text-[10pt]">{representante.representante}</p></div>
      <p className="text-right text-[7.5pt] text-muted-foreground">Emitido em {fmtData(hojeISO())}</p>
    </header>
    <section className="bloco-mensal border-b border-border py-6">
      <h2 className="text-[12pt] font-medium">Você recebe</h2>
      {extrato ? <><div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2"><strong className="text-[29pt] font-medium tabular-nums leading-tight">{fmtBRL(numero(extrato.valor_total))}</strong><span className="text-[12pt]">até {fmtData(extrato.pagar_ate)}</span></div><p className="mt-2 text-[8pt] text-muted-foreground">Extrato {rotuloCompetencia(competencia)} · fechado em {fmtData(extrato.fechado_em)}</p></> : <p className="mt-3 text-[10pt] text-muted-foreground">Prévia — valor a pagar disponível após o fechamento em {dataDoFechamento(competencia)}.</p>}
    </section>
    <section className="bloco-mensal mt-6">
      <h2 className="text-[12pt] font-medium">De onde vem</h2>
      {!pagamentos.length ? <p className="mt-3 text-[9pt] text-muted-foreground">{extrato ? "Nenhuma parcela paga neste extrato." : "As parcelas deste extrato serão identificadas após o fechamento."}</p> : <table className="tabela-mensal mt-3 w-full table-fixed border-collapse text-[8pt]">
        <colgroup><col className="w-[28%]"/><col className="w-[14%]"/><col className="w-[26%]"/><col className="w-[16%]"/><col className="w-[16%]"/></colgroup>
        <thead><tr><th>Cliente</th><th>Pedido</th><th>Cliente pagou</th><th className="text-right">Taxa</th><th className="text-right">Comissão</th></tr></thead>
        <tbody>{pagamentos.map((p, i) => <tr key={String(p.liberacao_id)}><td>{i === 0 || pagamentos[i - 1].cliente !== p.cliente ? p.cliente || "—" : ""}</td><td>{p.pedido || "—"}</td><td><span className="tabular-nums">{fmtBRL(numero(p.valor_parcela))}</span><span> · parc. {p.numero_parcela}/{p.total_parcelas}</span><div className="mt-1 text-[7pt] text-muted-foreground">{fmtData(p.pago_em)}</div></td><td className="text-right tabular-nums">{fmtPct(p.pct_efetivo)}{numero(p.ajuste_pp) > 0 && <div className="mt-1 text-[7pt] leading-relaxed text-muted-foreground">desc. {fmtPct(Math.round(numero(p.desconto_considerado_pct) * 10) / 10, "%", 1)} → −{fmtPct(p.ajuste_pp, " p.p.")}</div>}</td><td className="text-right tabular-nums">{fmtBRL(numero(p.valor_liberado))}</td></tr>)}</tbody>
      </table>}
    </section>
    <CarteiraTabela parcelas={parcelas}/><CarteiraTabela parcelas={parcelas} atrasada/>
    {ajustes.length > 0 && <section className="bloco-mensal mt-6"><h2 className="text-[12pt] font-medium">Ajustes</h2><div className="mt-3 border-t border-border">{ajustes.map((a, i) => <div key={String(a.liberacao_id ?? a.estorno_id ?? i)} className="flex justify-between gap-5 border-b border-border py-3 text-[8pt]"><div>{a.pedido && <p className="font-medium">{a.pedido}</p>}<p className="text-muted-foreground">{a.motivo || "Motivo não informado"}</p></div><span className="shrink-0 text-right tabular-nums">{a.tipo === "estorno" ? "−" : "+"} {fmtBRL(Math.abs(numero(a.valor)))}</span></div>)}</div></section>}
    <RodapeMensal/>
  </section>;
}

type LinhaMemoria = {
  linha?: string;
  base?: number | string;
  pct_tabela?: number | string;
  ajuste_pp?: number | string;
  pct_aplicado?: number | string;
  comissao?: number | string;
};

function linhasDaMemoria(nf: Linha): LinhaMemoria[] {
  if (Array.isArray(nf.linhas) && nf.linhas.length > 0) return nf.linhas as LinhaMemoria[];
  return [{
    linha: "—",
    base: nf.base,
    pct_tabela: nf.pct_linha,
    ajuste_pp: nf.ajuste_pp,
    pct_aplicado: nf.pct_aplicado,
    comissao: nf.comissao,
  }];
}

function fmtAjuste(v: unknown) {
  const n = numero(v);
  if (n === 0) return "—";
  return `${n > 0 ? "−" : "+"}${fmtPct(Math.abs(n), " p.p.")}`;
}

function MemoriaCalculoNF({ memoria }: { memoria: Linha[] }) {
  const mostrarFrete = memoria.some(nf => numero(nf.frete) !== 0);
  const retificadas = memoria.filter((nf) => Boolean(nf.retificacao_motivo));
  const indiceRetificacao = new Map(retificadas.map((nf, indice) => [String(nf.apuracao_id ?? nf.nf_id), indice + 1]));
  const totais = memoria.reduce((acc, nf) => {
    const linhas = linhasDaMemoria(nf);
    return {
      valor: acc.valor + numero(nf.valor_nf),
      frete: acc.frete + numero(nf.frete),
      base: acc.base + numero(nf.base),
      comissao: acc.comissao + linhas.reduce((soma, linha) => soma + numero(linha.comissao), 0),
    };
  }, { valor: 0, frete: 0, base: 0, comissao: 0 });

  return (
    <section className="mt-4">
      <h2 className="text-[8pt] font-medium">Memória de cálculo</h2>
      <p className="mt-1 text-[7pt] leading-relaxed text-muted-foreground">
        Base = valor da NF − frete. % aplicado = % da tabela da linha − ajuste da régua de desconto. Comissão = base × % aplicado, por linha de produto.
      </p>
      {memoria.length === 0 ? (
        <p className="mt-2 border-y border-border py-3 text-[7.5pt] text-muted-foreground">Nenhuma NF emitida ou paga neste período.</p>
      ) : (
        <table className="memoria-nf mt-2 w-full table-fixed border-collapse text-[7pt] leading-tight">
          <colgroup>
            <col className="w-[7%]"/><col className="w-[9%]"/><col className={mostrarFrete ? "w-[12%]" : "w-[15%]"}/><col className="w-[11%]"/>
            {mostrarFrete && <col className="w-[7%]"/>}<col className="w-[11%]"/><col className="w-[8%]"/><col className="w-[6%]"/>
            <col className="w-[9%]"/><col className="w-[6%]"/><col className="w-[6%]"/><col className={mostrarFrete ? "w-[8%]" : "w-[12%]"}/>
          </colgroup>
          <thead style={{ display: "table-header-group" }}>
            <tr className="border-y border-border text-muted-foreground">
              <th className="py-1 text-left font-medium">NF</th>
              <th className="px-0.5 py-1 text-left font-medium">Emissão</th>
              <th className="px-0.5 py-1 text-left font-medium">Cliente</th>
              <th className="px-0.5 py-1 text-right font-medium">Valor NF</th>
              {mostrarFrete && <th className="px-0.5 py-1 text-right font-medium">Frete</th>}
              <th className="px-0.5 py-1 text-right font-medium">Base</th>
              <th className="px-0.5 py-1 text-right font-medium">Desconto</th>
              <th className="px-0.5 py-1 text-right font-medium">Ajuste</th>
              <th className="px-0.5 py-1 text-left font-medium">Linha</th>
              <th className="px-0.5 py-1 text-right font-medium">% tabela</th>
              <th className="px-0.5 py-1 text-right font-medium">% aplicado</th>
              <th className="py-1 pl-0.5 text-right font-medium">Comissão</th>
            </tr>
          </thead>
          {memoria.map((nf) => {
              const linhas = linhasDaMemoria(nf);
              const subtotal = linhas.reduce((soma, linha) => soma + numero(linha.comissao), 0);
              const indice = indiceRetificacao.get(String(nf.apuracao_id ?? nf.nf_id));
              return (
                <tbody key={String(nf.apuracao_id ?? nf.nf_id ?? nf.nf_numero)} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                  {linhas.map((linha, linhaIndice) => (
                    <tr key={`${nf.apuracao_id ?? nf.nf_id}-${linhaIndice}`} className={cn("border-b border-border/60", linhaIndice === 0 && "border-t border-t-foreground/30")} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                      <td className="py-1 align-top tabular-nums">{linhaIndice === 0 ? <>{nf.nf_numero ?? "—"}{indice ? <sup>{indice}</sup> : null}</> : ""}</td>
                      <td className="px-0.5 py-1 align-top tabular-nums">{linhaIndice === 0 ? fmtData(nf.nf_emissao) : ""}</td>
                      <td className="px-0.5 py-1 align-top">{linhaIndice === 0 ? nf.cliente || "—" : ""}</td>
                      <td className="px-0.5 py-1 text-right align-top tabular-nums">{linhaIndice === 0 ? fmtBRL(numero(nf.valor_nf)) : ""}</td>
                      {mostrarFrete && <td className="px-0.5 py-1 text-right align-top tabular-nums">{linhaIndice === 0 ? fmtBRL(numero(nf.frete)) : ""}</td>}
                      <td className="px-0.5 py-1 text-right align-top tabular-nums">
                        {fmtBRL(numero(linhas.length > 1 ? linha.base : nf.base))}
                      </td>
                      <td className="px-0.5 py-1 text-right align-top tabular-nums">{linhaIndice === 0 ? fmtPct(nf.desconto_regua_pct) : ""}</td>
                      <td className="px-0.5 py-1 text-right align-top tabular-nums">{linhaIndice === 0 ? fmtAjuste(nf.ajuste_pp) : ""}</td>
                      <td className="px-0.5 py-1 align-top">{linha.linha || "—"}</td>
                      <td className="px-0.5 py-1 text-right align-top tabular-nums">{fmtPct(linha.pct_tabela)}</td>
                      <td className="px-0.5 py-1 text-right align-top tabular-nums">{fmtPct(linha.pct_aplicado)}</td>
                      <td className="py-1 pl-0.5 text-right align-top tabular-nums">{fmtBRL(numero(linha.comissao))}</td>
                    </tr>
                  ))}
                  {linhas.length > 1 && (
                    <tr className="border-b border-border bg-muted/30 font-medium">
                      <td colSpan={mostrarFrete ? 11 : 10} className="py-1 text-right">Subtotal NF {nf.nf_numero}</td>
                      <td className="py-1 pl-0.5 text-right tabular-nums">{fmtBRL(subtotal)}</td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          <tfoot>
            <tr className="border-t border-foreground/50 font-medium">
              <td colSpan={3} className="py-1.5">Total</td>
              <td className="px-0.5 py-1.5 text-right tabular-nums">{fmtBRL(totais.valor)}</td>
              {mostrarFrete && <td className="px-0.5 py-1.5 text-right tabular-nums">{fmtBRL(totais.frete)}</td>}
              <td className="px-0.5 py-1.5 text-right tabular-nums">{fmtBRL(totais.base)}</td>
              <td colSpan={5} />
              <td className="py-1.5 pl-0.5 text-right tabular-nums">{fmtBRL(totais.comissao)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      {retificadas.length > 0 && (
        <div className="mt-1.5 space-y-0.5 text-[7pt] leading-relaxed text-muted-foreground">
          {retificadas.map((nf, indice) => (
            <p key={String(nf.apuracao_id ?? nf.nf_id)}>
              <sup>{indice + 1}</sup> NF {nf.nf_numero}: {nf.retificacao_motivo}
              {nf.retificado_em ? ` (retificado em ${fmtData(nf.retificado_em)})` : ""}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** Estilos de impressão do extrato — aplicar uma única vez por página (ver EstilosExtrato). */
export const ESTILOS_IMPRESSAO = `
  [aria-label="Minhas tarefas"] { display: none !important; }
  .documento-extrato { min-height: 100vh; background: hsl(var(--muted)); padding: 12mm 0; }
  .documento-extrato .pagina-a4 { box-sizing: border-box; width: 210mm; max-width: 100%; min-height: 297mm; margin: 0 auto 10mm; padding: 15mm; box-shadow: 0 1mm 4mm hsl(var(--foreground) / 0.12); font-family: 'DM Sans', system-ui, sans-serif; font-weight: 400; }
  .documento-extrato .anexo-tela { min-height: 0; }
  .documento-extrato .anexo-print { display: none; }
  .documento-extrato table { word-break: normal; overflow-wrap: normal; }
  .documento-extrato thead { display: table-header-group; }
  .documento-extrato tr, .documento-extrato tbody { break-inside: avoid; }
  .documento-extrato .tabela-mensal th { font-weight: 500; text-align: left; color: hsl(var(--muted-foreground)); border-block: 1px solid hsl(var(--border)); }
  .documento-extrato .tabela-mensal th.text-right { text-align: right; }
  .documento-extrato .tabela-mensal td { border-bottom: 1px solid hsl(var(--border)); vertical-align: top; }
  .documento-extrato .tabela-mensal th, .documento-extrato .tabela-mensal td { padding: 8px 4px; }
  .documento-extrato tfoot { font-weight: 500; }
  .documento-extrato .memoria-nf th, .documento-extrato .memoria-nf td { padding: 5px 3px; }
  .documento-extrato .memoria-nf th { white-space: normal; }
  .documento-extrato .memoria-nf td { white-space: normal; }
  .documento-extrato .memoria-nf tbody td:first-child, .documento-extrato .memoria-nf tbody td:nth-child(2) { white-space: nowrap; }
  .documento-extrato .tabela-mensal td.tabular-nums { white-space: nowrap; }
  @media screen and (max-width: 700px) {
    .documento-extrato .pagina-a4 { padding: 20px; min-height: 0; }
    .documento-extrato .anexo-conteudo { overflow-x: auto; }
    .documento-extrato .memoria-nf { min-width: 680px; }
  }
  @page { size: A4; margin: 15mm; }
  @media print {
    html, body, #root { margin: 0 !important; padding: 0 !important; background: hsl(var(--card)) !important; }
    .documento-extrato { min-height: 0; padding: 0; background: hsl(var(--card)); }
    .documento-extrato .pagina-a4 { width: 180mm; max-width: none; min-height: 0; height: auto; margin: 0; padding: 0; box-shadow: none; overflow: visible; }
    .documento-extrato .anexo-tela { display: none !important; }
    .documento-extrato .anexo-print { display: block; break-before: page; }
    .quebra-pagina { break-before: page; page-break-before: always; }
    .documento-extrato .bloco-mensal h2 { break-after: avoid; }
    .documento-extrato .bloco-mensal.mt-6 { margin-top: 16px; }
    .documento-extrato .bloco-mensal.py-6 { padding-top: 18px; padding-bottom: 18px; }
    .documento-extrato .rodape-mensal { margin-top: 16px; }
    .documento-extrato tbody { break-inside: auto; }
    .documento-extrato .memoria-nf tbody { break-inside: avoid; }
    .documento-extrato .rodape-mensal { break-inside: avoid; }
    .tela-apenas, .seletor-competencia { display: none !important; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

export function EstilosExtrato() {
  return <style>{ESTILOS_IMPRESSAO}</style>;
}

/** Prestação de contas mensal e anexo compartilhados entre individual e lote. */
export function ExtratoRepresentanteDocumento({ vendedorId, competencia: competenciaProp, mostrarSeletor }: {
  vendedorId: string; competencia: string | null; mostrarSeletor: boolean;
}) {
  const [, setParams] = useSearchParams();
  const competencia = competenciaProp ?? hojeISO().slice(0, 7);
  const competenciaValida = RE_COMPETENCIA.test(competencia);
  const representanteQ = useQuery({
    queryKey: ["representante-extrato-impressao", vendedorId],
    queryFn: () => lerTudo("vw_representante_financeiro", (q) => q.eq("vendedor_id", vendedorId)),
    enabled: Boolean(vendedorId) && competenciaValida,
  });
  const extratosQ = useQuery({
    queryKey: ["representante-extratos-fechados", vendedorId],
    queryFn: () => lerExtratosDoRepresentante(vendedorId),
    enabled: Boolean(vendedorId),
  });
  const extrato = extratosQ.data ? extratoDaCompetencia(extratosQ.data, competencia) : undefined;
  const detalhesQ = useQuery({
    queryKey: ["representante-extrato-posicao", vendedorId, competencia],
    queryFn: () => lerTudo("vw_comissao_detalhe", q => q.eq("vendedor_id", vendedorId), { col: "nf_emissao", asc: true }),
    enabled: Boolean(vendedorId) && competenciaValida,
  });
  const memoriaQ = useQuery({
    queryKey: ["representante-extrato-memoria-nf", vendedorId, competencia],
    queryFn: async () => {
      const linhas = await lerTudo(
        "vw_comissao_memoria_nf",
        (q) => q
          .eq("vendedor_id", vendedorId)
          .or(`competencia.eq.${mesAnterior(competencia)}-01,meses_pagamento_liberados.cs.{${competencia}-01}`),
        { col: "nf_emissao", asc: true },
      );
      return linhas.sort((a, b) => {
        const porEmissao = String(a.nf_emissao ?? "").localeCompare(String(b.nf_emissao ?? ""));
        return porEmissao || String(a.nf_numero ?? "").localeCompare(String(b.nf_numero ?? ""), "pt-BR", { numeric: true });
      });
    },
    enabled: Boolean(vendedorId) && competenciaValida,
  });

  const carregando = representanteQ.isLoading || extratosQ.isLoading || memoriaQ.isLoading || detalhesQ.isLoading;
  const erro = representanteQ.error || extratosQ.error || memoriaQ.error || detalhesQ.error;
  const representante = representanteQ.data?.[0];

  if (!competenciaValida) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-8 text-destructive-strong">Competência inválida. Use o formato AAAA-MM.</div>;
  }
  if (carregando) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Preparando o extrato…</div>;
  }
  if (erro) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-8 text-destructive-strong">Falha ao preparar o extrato: {formatError(erro)}</div>;
  }
  if (!representante) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-8 text-muted-foreground">Representante não encontrado.</div>;
  }

  let pagamentos: Linha[];
  try {
    pagamentos = pagamentosDoExtrato(Array.isArray(extrato?.detalhe) ? extrato.detalhe : [], detalhesQ.data ?? []);
  } catch (e) {
    return <div className="p-8 text-destructive-strong">Falha ao preparar o extrato: {formatError(e)}</div>;
  }
  const selo = extrato ? `Fechado em ${fmtData(extrato.fechado_em)}` : "Prévia";
  const opcoes = opcoesCompetencia(extratosQ.data ?? []);

  return (
    <>
      {mostrarSeletor && <div className="seletor-competencia mx-auto mb-3 flex w-[210mm] max-w-full items-center gap-2 px-4 text-sm">
        <label htmlFor="competencia-extrato" className="text-muted-foreground">Competência</label>
        <select
          id="competencia-extrato"
          className="h-9 rounded-md border border-input bg-background px-2"
          value={competencia}
          onChange={(e) => setParams((p) => {
            const n = new URLSearchParams(p);
            n.set("competencia", e.target.value);
            return n;
          }, { replace: true })}
        >
          {opcoes.map((c) => (
            <option key={c} value={c}>{rotuloCompetencia(c)}</option>
          ))}
        </select>
        <span className="text-muted-foreground">{selo}</span>
      </div>}
      <DocumentoMensal competencia={competencia} representante={representante} extrato={extrato} parcelas={detalhesQ.data ?? []} pagamentos={pagamentos}/>
      <details className="pagina-a4 anexo-tela bg-card text-card-foreground">
        <summary className="cursor-pointer text-[12pt] font-medium">Memória de cálculo</summary>
        <div className="anexo-conteudo"><MemoriaCalculoNF memoria={memoriaQ.data ?? []}/></div>
      </details>
      <section className="pagina-a4 anexo-print bg-card text-card-foreground">
        <header className="mb-4 border-b border-border pb-3"><div className="font-display text-[20pt] text-gold">FETÉLY</div><p className="mt-2 text-[9pt]">{representante.representante} · Extrato {rotuloCompetencia(competencia)} · Anexo</p></header>
        <MemoriaCalculoNF memoria={memoriaQ.data ?? []}/><RodapeMensal/>
      </section>
    </>
  );
}
