import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { hojeISO } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { fmtBRL, fmtCompetencia, fmtData, fmtPct } from "../comissoes/fmt";
import { lerTudo, type Linha } from "./dados";
import { ajustesDoExtrato, carteiraPorPedido, complementosNaCarteira, pagamentosDoExtrato, rotuloParcelas, rotuloTaxas } from "./extratoMensal";
import type { ExtratoFechadoDoRepresentante } from "./extratoCompetencias";
import {
  competenciaFechada, dataDoFechamento, extratoDaCompetencia, lerExtratosDoRepresentante, opcoesCompetencia,
} from "./extratoCompetencias";

const EMPRESA = "Fetély Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48";
const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

function rotuloCompetencia(competencia: string) {
  return fmtCompetencia(`${competencia}-01`);
}

function numero(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function RodapeMensal() {
  return <footer className="rodape-mensal mt-6 border-t border-border pt-3 text-[7pt] leading-relaxed text-muted-foreground"><p>{EMPRESA}</p></footer>;
}

function CarteiraTabela({ parcelas, complementos = [], atrasada = false }: { parcelas: Linha[]; complementos?: Linha[]; atrasada?: boolean }) {
  const linhas: Linha[] = atrasada
    ? parcelas.filter(p => p.situacao_parcela === "vencida")
      .map((p): Linha => ({ ...p, comissao: numero(p.comissao_da_parcela) }))
      .sort((a, b) => String(a.cliente ?? "").localeCompare(String(b.cliente ?? ""), "pt-BR") || String(a.vencimento ?? "").localeCompare(String(b.vencimento ?? "")))
    : [...carteiraPorPedido(parcelas, "a_vencer"), ...complementosNaCarteira(complementos)]
      .sort((a, b) => String(a.cliente ?? "").localeCompare(String(b.cliente ?? ""), "pt-BR") || String(a.pedido ?? "").localeCompare(String(b.pedido ?? ""), "pt-BR"));
  if (atrasada && !linhas.length) return null;
  return <section className="bloco-mensal mt-6">
    <h2 className="text-[12pt] font-medium">{atrasada ? "Travado por atraso do cliente" : "A receber"}</h2>
    {!atrasada && <p className="mt-1 text-[7.5pt] text-muted-foreground">Posição em {fmtData(hojeISO())}</p>}
    {!linhas.length ? <p className="mt-3 text-[9pt] text-muted-foreground">Nada a receber no momento</p> : <table className="tabela-mensal mt-3 w-full table-fixed border-collapse text-[8pt]">
      <colgroup><col className="w-[31%]"/><col className="w-[15%]"/><col className="w-[17%]"/><col className="w-[17%]"/><col className="w-[20%]"/></colgroup>
      <thead><tr><th>Cliente</th><th>Pedido</th><th className="text-right">{atrasada ? "Vencido desde" : "Parcelas"}</th><th className="text-right">{atrasada ? "Dias em atraso" : "Próximo vencimento"}</th><th className="text-right">{atrasada ? "Comissão travada" : "Comissão a receber"}</th></tr></thead>
      <tbody>{linhas.map((l, i) => <tr key={i}><td>{l.cliente || "—"}</td><td>{l.pedido || "—"}</td><td className="text-right tabular-nums">{atrasada ? fmtData(l.vencimento) : (l.complemento ? "—" : rotuloParcelas(l.parcelas_lista ?? [], l.total_parcelas ?? 0))}</td><td className="text-right tabular-nums">{atrasada ? l.dias_atraso : l.complemento ? "—" : fmtData(l.vencimento)}</td><td className="text-right tabular-nums">{fmtBRL(l.comissao)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={4}>Total</td><td className="text-right tabular-nums">{fmtBRL(linhas.reduce((t, l) => t + numero(l.comissao), 0))}</td></tr></tfoot>
    </table>}
  </section>;
}

function DocumentoMensal({ competencia, representante, extrato, parcelas, complementos, pagamentos }: {
  competencia: string; representante: Linha; extrato?: ExtratoFechadoDoRepresentante; parcelas: Linha[]; complementos: Linha[]; pagamentos: Linha[];
}) {
  const fechadaSemExtrato = !extrato && competenciaFechada(competencia);
  const ajustes = ajustesDoExtrato(Array.isArray(extrato?.detalhe) ? extrato.detalhe : []);
  return <section className="pagina-a4 pagina-mensal bg-card text-card-foreground">
    <header className="flex items-end justify-between gap-4 border-b border-border pb-4">
      <div><div className="font-display text-[25pt] font-medium leading-none text-gold">FETÉLY</div><h1 className="mt-3 text-[17pt] font-medium">Extrato de {rotuloCompetencia(competencia)}</h1><p className="mt-1 text-[10pt]">{representante.representante}</p></div>
      <p className="text-right text-[7.5pt] text-muted-foreground">Emitido em {fmtData(hojeISO())}</p>
    </header>
    <section className="bloco-mensal border-b border-border py-6">
      <h2 className="text-[12pt] font-medium">Você recebe</h2>
      {extrato ? <><div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2"><strong className="text-[29pt] font-medium tabular-nums leading-tight">{fmtBRL(numero(extrato.valor_total))}</strong><span className="text-[12pt]">até {fmtData(extrato.pagar_ate)}</span></div><p className="mt-2 text-[8pt] text-muted-foreground">Extrato {rotuloCompetencia(competencia)} · fechado em {fmtData(extrato.fechado_em)}</p></> : fechadaSemExtrato ? <div className="mt-3"><strong className="text-[29pt] font-medium tabular-nums leading-tight">{fmtBRL(0)}</strong></div> : <p className="mt-3 text-[10pt] text-muted-foreground">Prévia — valor a pagar disponível após o fechamento em {dataDoFechamento(competencia)}.</p>}
    </section>
    {!fechadaSemExtrato && <section className="bloco-mensal mt-6">
      <h2 className="text-[12pt] font-medium">De onde vem</h2>
      {!pagamentos.length ? <p className="mt-3 text-[9pt] text-muted-foreground">{extrato ? "Nenhuma parcela paga neste extrato." : "As parcelas deste extrato serão identificadas após o fechamento."}</p> : <table className="tabela-mensal mt-3 w-full table-fixed border-collapse text-[8pt]">
        <colgroup><col className="w-[28%]"/><col className="w-[14%]"/><col className="w-[26%]"/><col className="w-[16%]"/><col className="w-[16%]"/></colgroup>
        <thead><tr><th>Cliente</th><th>Pedido</th><th>Cliente pagou</th><th className="text-right">Taxa</th><th className="text-right">Comissão</th></tr></thead>
        <tbody>{pagamentos.map((p, i) => <tr key={String(p.liberacao_id)}><td>{i === 0 || pagamentos[i - 1].cliente !== p.cliente ? p.cliente || "—" : ""}</td><td>{p.pedido || "—"}</td><td><span className="tabular-nums">{fmtBRL(numero(p.valor_parcela))}</span><span> · parc. {p.numero_parcela}/{p.total_parcelas}</span></td><td className="text-right tabular-nums">{rotuloTaxas(p.taxas_linhas, p.pct_efetivo)}</td><td className="text-right tabular-nums">{fmtBRL(numero(p.valor_liberado))}</td></tr>)}</tbody>
      </table>}
    </section>}
    <CarteiraTabela parcelas={parcelas} complementos={complementos}/><CarteiraTabela parcelas={parcelas} atrasada/>
    {ajustes.length > 0 && <section className="bloco-mensal mt-6"><h2 className="text-[12pt] font-medium">Ajustes</h2><div className="mt-3 border-t border-border">{ajustes.map((a, i) => <div key={String(a.liberacao_id ?? a.estorno_id ?? i)} className="flex justify-between gap-5 border-b border-border py-3 text-[8pt]"><div className="flex gap-4"><span className="font-medium">{a.tipo === "estorno" ? "Estorno" : "Complemento"}</span><span>{a.pedido || "—"}</span></div><span className="shrink-0 text-right tabular-nums">{a.tipo === "estorno" ? "−" : "+"} {fmtBRL(Math.abs(numero(a.valor)))}</span></div>)}</div></section>}
    <RodapeMensal/>
  </section>;
}

/** Estilos de impressão do extrato — aplicar uma única vez por página (ver EstilosExtrato). */
export const ESTILOS_IMPRESSAO = `
  [aria-label="Minhas tarefas"] { display: none !important; }
  .documento-extrato { min-height: 100vh; background: hsl(var(--muted)); padding: 12mm 0; }
  .documento-extrato .pagina-a4 { box-sizing: border-box; width: 210mm; max-width: 100%; min-height: 297mm; margin: 0 auto 10mm; padding: 15mm; box-shadow: 0 1mm 4mm hsl(var(--foreground) / 0.12); font-family: 'DM Sans', system-ui, sans-serif; font-weight: 400; }
  .documento-extrato table { word-break: normal; overflow-wrap: normal; }
  .documento-extrato thead { display: table-header-group; }
  .documento-extrato tr, .documento-extrato tbody { break-inside: avoid; }
  .documento-extrato .tabela-mensal th { font-weight: 500; text-align: left; color: hsl(var(--muted-foreground)); border-block: 1px solid hsl(var(--border)); }
  .documento-extrato .tabela-mensal th.text-right { text-align: right; }
  .documento-extrato .tabela-mensal td { border-bottom: 1px solid hsl(var(--border)); vertical-align: top; }
  .documento-extrato .tabela-mensal th, .documento-extrato .tabela-mensal td { padding: 8px 4px; }
  .documento-extrato tfoot { font-weight: 500; }
  .documento-extrato .tabela-mensal td.tabular-nums { white-space: nowrap; }
  @media screen and (max-width: 700px) {
    .documento-extrato .pagina-a4 { padding: 20px; min-height: 0; }
  }
  @page { size: A4; margin: 15mm; }
  @media print {
    html, body, #root { margin: 0 !important; padding: 0 !important; background: hsl(var(--card)) !important; }
    .documento-extrato { min-height: 0; padding: 0; background: hsl(var(--card)); }
    .documento-extrato .pagina-a4 { width: 180mm; max-width: none; min-height: 0; height: auto; margin: 0; padding: 0; box-shadow: none; overflow: visible; }
    .quebra-pagina { break-before: page; page-break-before: always; }
    .documento-extrato .bloco-mensal h2 { break-after: avoid; }
    .documento-extrato .bloco-mensal.mt-6 { margin-top: 16px; }
    .documento-extrato .bloco-mensal.py-6 { padding-top: 18px; padding-bottom: 18px; }
    .documento-extrato .rodape-mensal { margin-top: 16px; }
    .documento-extrato tbody { break-inside: auto; }
    .documento-extrato .rodape-mensal { break-inside: avoid; }
    .tela-apenas, .seletor-competencia { display: none !important; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

export function EstilosExtrato() {
  return <style>{ESTILOS_IMPRESSAO}</style>;
}

/** Prestação de contas mensal compartilhada entre individual e lote. */
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
  const complementosQ = useQuery({
    queryKey: ["representante-extrato-complemento-pendente", vendedorId],
    queryFn: () => lerTudo("vw_comissao_complemento_pendente", q => q.eq("vendedor_id", vendedorId)),
    enabled: Boolean(vendedorId) && competenciaValida,
  });
  const carregando = representanteQ.isLoading || extratosQ.isLoading || detalhesQ.isLoading || complementosQ.isLoading;
  const erro = representanteQ.error || extratosQ.error || detalhesQ.error || complementosQ.error;
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
  const selo = extrato ? `Fechado em ${fmtData(extrato.fechado_em)}` : competenciaFechada(competencia) ? "Sem extrato" : "Prévia";
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
      <DocumentoMensal competencia={competencia} representante={representante} extrato={extrato} parcelas={detalhesQ.data ?? []} complementos={complementosQ.data ?? []} pagamentos={pagamentos}/>
    </>
  );
}
