import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { hojeISO } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { fmtBRL, fmtCompetencia, fmtData } from "../comissoes/fmt";
import { lerTudo, type Linha } from "./dados";
import { agendaRecebiveis, ajustesDoExtrato, baseDaLiberacao, liberacoesEmExtratos, pagamentosDoExtrato, parcelaAReceber, parcelasEmAtraso, rotuloTaxas, somarMeses } from "./extratoMensal";
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

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesNome = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] ?? "";
const mesAno = (ym: string) => `${mesNome(ym)}/${ym.slice(0, 4)}`;
const mesCurto = (ym: string) => `${mesNome(ym).slice(0, 3)}/${ym.slice(2, 4)}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ddmm = (d: unknown) => d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : "—";
const brl0 = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v)}%`;

function Cartao({ rotulo, valor, sub, alerta }: { rotulo: string; valor: string; sub?: string; alerta?: boolean }) {
  return <div className="rounded-md bg-muted px-3 py-2.5">
    <div className="text-[7pt] text-muted-foreground">{rotulo}</div>
    <div className={`mt-1 text-[13pt] font-medium tabular-nums leading-tight ${alerta ? "text-destructive" : ""}`}>{valor}</div>
    <div className="mt-0.5 min-h-[9pt] text-[6.5pt] text-muted-foreground">{sub ?? ""}</div>
  </div>;
}

function DocumentoMensal({ competencia, representante, extrato, extratos, parcelas, complementos, pagamentos, kpis }: {
  competencia: string; representante: Linha; extrato?: ExtratoFechadoDoRepresentante; extratos: Linha[]; parcelas: Linha[]; complementos: Linha[]; pagamentos: Linha[]; kpis: Linha[];
}) {
  const fechadaSemExtrato = !extrato && competenciaFechada(competencia);
  const ajustes = ajustesDoExtrato(Array.isArray(extrato?.detalhe) ? extrato.detalhe : []);
  const clientePorPedido = new Map(parcelas.map(p => [String(p.pedido), p.cliente]));
  const agenda = agendaRecebiveis(parcelas, complementos, extratos, competencia);
  const atraso = parcelasEmAtraso(parcelas);
  const totalAgenda = agenda.reduce((t, m) => t + m.total, 0);
  const totalAtraso = atraso.reduce((t, p) => t + numero(p.comissao_da_parcela), 0);
  const mesVendas = somarMeses(competencia, -1);
  const kMes = kpis.find(k => String(k.competencia).slice(0, 7) === mesVendas) ?? {};
  const ano = kpis.filter(k => String(k.competencia).slice(0, 4) === mesVendas.slice(0, 4) && String(k.competencia).slice(0, 7) <= mesVendas);
  const soma = (c: string) => ano.reduce((t, k) => t + numero(k[c]), 0);
  const linhasPagas = [
    ...pagamentos.map(p => ({ k: String(p.liberacao_id), cliente: p.cliente, pedido: p.pedido, parcela: `${p.numero_parcela}/${p.total_parcelas} · ${ddmm(p.pago_em ?? p.data_liquidacao)}`, base: fmtBRL(baseDaLiberacao(p)), taxa: rotuloTaxas(p.taxas_linhas), valor: numero(p.valor_liberado) })),
    ...ajustes.map((a, i) => ({ k: String(a.liberacao_id ?? a.estorno_id ?? i), cliente: a.cliente ?? clientePorPedido.get(String(a.pedido)), pedido: a.pedido, parcela: a.tipo === "estorno" ? "estorno" : "complemento", base: "—", taxa: "—", valor: numero(a.valor) })),
  ];
  return <section className="pagina-a4 pagina-mensal bg-card text-card-foreground">
    <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
      <div>
        <div className="font-display text-[20pt] font-medium leading-none text-gold">FETÉLY</div>
        <h1 className="mt-3 text-[22pt] font-medium leading-tight">{representante.representante}</h1>
        <p className="mt-1 text-[9pt] text-muted-foreground">Extrato de comissão · {mesAno(competencia)}</p>
      </div>
      <div className="text-right">
        <div className="text-[8pt] text-muted-foreground">Pagamento de {mesNome(competencia)}</div>
        {extrato ? <><div className="mt-1 text-[26pt] font-medium tabular-nums leading-tight">{fmtBRL(numero(extrato.valor_total))}</div><div className="text-[9pt]">até {fmtData(extrato.pagar_ate)}</div></>
          : fechadaSemExtrato ? <div className="mt-1 text-[26pt] font-medium tabular-nums leading-tight">{fmtBRL(0)}</div>
          : <div className="mt-1 text-[9pt] text-muted-foreground">Prévia · fechamento em {dataDoFechamento(competencia)}</div>}
      </div>
    </header>
    <section className="bloco-mensal mt-5">
      <div className="grid grid-cols-5 gap-2">
        <Cartao rotulo={`Vendido em ${mesNome(mesVendas)}`} valor={brl0(numero(kMes.vendido))} sub={`${numero(kMes.pedidos)} pedidos · ${numero(kMes.clientes)} clientes`}/>
        <Cartao rotulo="Comissão gerada" valor={brl0(numero(kMes.comissao_gerada))} sub={`taxa média ${pct(numero(kMes.taxa_media_pct))}`}/>
        <Cartao rotulo="Desconto médio" valor={pct(numero(kMes.desconto_medio_pct))} sub={numero(kMes.desconto_medio_pct) < 5 ? "sem redução de taxa" : ""}/>
        <Cartao rotulo="A receber" valor={fmtBRL(totalAgenda)} sub={agenda.length ? `${mesCurto(agenda[0].mes)} a ${mesCurto(agenda[agenda.length - 1].mes)}` : ""}/>
        <Cartao rotulo="Em atraso" valor={totalAtraso > 0 ? fmtBRL(totalAtraso) : "R$ 0"} alerta={totalAtraso > 0} sub={`${atraso.length} parcela${atraso.length === 1 ? "" : "s"}`}/>
      </div>
      <p className="mt-2 text-[7pt] text-muted-foreground">Acumulado {mesVendas.slice(0, 4)} · vendido {brl0(soma("vendido"))} · comissão {brl0(soma("comissao_gerada"))} · {soma("pedidos")} pedidos</p>
    </section>
    {extrato && linhasPagas.length > 0 && <section className="bloco-mensal mt-6">
      <h2 className="text-[11pt] font-medium">Comissões pagas em {mesNome(competencia)}</h2>
      <table className="tabela-mensal mt-2 w-full table-fixed border-collapse text-[8pt]">
        <colgroup><col className="w-[28%]"/><col className="w-[13%]"/><col className="w-[17%]"/><col className="w-[16%]"/><col className="w-[11%]"/><col className="w-[15%]"/></colgroup>
        <thead><tr><th>Cliente</th><th>Pedido</th><th>Parcela</th><th className="text-right">Base</th><th className="text-right">Taxa</th><th className="text-right">Comissão</th></tr></thead>
        <tbody>{linhasPagas.map(l => <tr key={l.k}><td>{l.cliente || "—"}</td><td>{l.pedido || "—"}</td><td className="tabular-nums">{l.parcela}</td><td className="text-right tabular-nums">{l.base}</td><td className="text-right tabular-nums">{l.taxa}</td><td className="text-right tabular-nums">{fmtBRL(l.valor)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={5}>Total</td><td className="text-right tabular-nums">{fmtBRL(linhasPagas.reduce((t, l) => t + l.valor, 0))}</td></tr></tfoot>
      </table>
    </section>}
    {agenda.length > 0 && <section className="bloco-mensal mt-6">
      <h2 className="text-[11pt] font-medium">Próximos pagamentos</h2>
      <table className="tabela-mensal tabela-recebiveis mt-2 w-full table-fixed border-collapse text-[8pt]">
        <colgroup><col className="w-[22%]"/><col className="w-[12%]"/><col className="w-[13%]"/><col className="w-[15%]"/><col className="w-[14%]"/><col className="w-[11%]"/><col className="w-[13%]"/></colgroup>
        <thead><tr><th>Cliente</th><th>Pedido</th><th>Parcela</th><th>Vencimento do cliente</th><th className="text-right">Base</th><th className="text-right">Taxa</th><th className="text-right">Comissão</th></tr></thead>
        {agenda.map(m => <tbody key={m.mes} className="mes-agenda">
          <tr className="cabecalho-mes"><td colSpan={6}>{capital(mesAno(m.mes))} · até {ddmm(m.pagarAte)}</td><td className="text-right tabular-nums">{fmtBRL(m.total)}</td></tr>
          {m.itens.map((it, i) => <tr key={i}><td className="truncate" title={it.cliente || undefined}>{it.cliente || "—"}</td><td className="whitespace-nowrap">{it.pedido || "—"}</td><td className="tabular-nums">{it.parcela}</td><td className="tabular-nums">{it.parcela === "complemento" ? "—" : it.pago ? `pago ${ddmm(it.vencimento)}` : ddmm(it.vencimento)}</td><td className="text-right tabular-nums">{it.base === null ? "—" : fmtBRL(it.base)}</td><td className="text-right tabular-nums">{rotuloTaxas(it.taxas)}</td><td className="text-right tabular-nums">{fmtBRL(it.comissao)}</td></tr>)}
        </tbody>)}
        <tfoot><tr><td colSpan={6}>Total a receber</td><td className="text-right tabular-nums">{fmtBRL(totalAgenda)}</td></tr></tfoot>
      </table>
    </section>}
    {atraso.length > 0 && <section className="bloco-mensal mt-6">
      <h2 className="text-[11pt] font-medium text-destructive">Em atraso</h2>
      <table className="tabela-mensal tabela-recebiveis mt-2 w-full table-fixed border-collapse text-[8pt]">
        <colgroup><col className="w-[22%]"/><col className="w-[12%]"/><col className="w-[13%]"/><col className="w-[15%]"/><col className="w-[14%]"/><col className="w-[11%]"/><col className="w-[13%]"/></colgroup>
        <thead><tr><th>Cliente</th><th>Pedido</th><th>Parcela</th><th>Venceu em</th><th className="text-right">Base</th><th className="text-right">Taxa</th><th className="text-right">Comissão</th></tr></thead>
        <tbody>{atraso.map((p, i) => <tr key={i}><td className="truncate" title={p.cliente || undefined}>{p.cliente || "—"}</td><td className="whitespace-nowrap">{p.pedido || "—"}</td><td className="tabular-nums">{p.numero_parcela}/{p.total_parcelas}</td><td className="tabular-nums">{ddmm(p.vencimento)} · {numero(p.dias_atraso)} dias</td><td className="text-right tabular-nums">{fmtBRL(numero(p.base_parcela))}</td><td className="text-right tabular-nums">{rotuloTaxas(p.taxas_linhas)}</td><td className="text-right tabular-nums">{fmtBRL(numero(p.comissao_da_parcela))}</td></tr>)}</tbody>
      </table>
    </section>}
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
  .documento-extrato tfoot { display: table-row-group; font-weight: 500; }
  .documento-extrato .tabela-mensal tr.cabecalho-mes td { background: hsl(var(--muted)); font-weight: 600; }
  .documento-extrato .tabela-mensal tr.cabecalho-mes { break-after: avoid; page-break-after: avoid; }
  .documento-extrato .tabela-mensal td.tabular-nums { white-space: nowrap; }
  .documento-extrato .tabela-recebiveis th { word-break: normal; overflow-wrap: normal; }
  .documento-extrato .tabela-recebiveis th, .documento-extrato .tabela-recebiveis td { padding-inline: 3px; }
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
  const anoVendas = somarMeses(competencia, -1).slice(0, 4);
  const kpisQ = useQuery({
    queryKey: ["representante-extrato-kpis", vendedorId, anoVendas],
    queryFn: () => lerTudo("vw_comissao_kpi_representante_mes", q => q.eq("vendedor_id", vendedorId).gte("competencia", `${anoVendas}-01-01`).lte("competencia", `${anoVendas}-12-31`)),
    enabled: Boolean(vendedorId) && competenciaValida,
  });
  const carregando = kpisQ.isLoading || representanteQ.isLoading || extratosQ.isLoading || detalhesQ.isLoading || complementosQ.isLoading;
  const erro = kpisQ.error || representanteQ.error || extratosQ.error || detalhesQ.error || complementosQ.error;
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
  const liberacoes = liberacoesEmExtratos(extratosQ.data ?? []);
  const parcelas = detalhesQ.data ?? [];
  if (!extrato && !(complementosQ.data?.length) && !parcelas.some(p => p.situacao_parcela === "vencida" || parcelaAReceber(p, liberacoes))) return null;

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
      <DocumentoMensal competencia={competencia} representante={representante} extrato={extrato} parcelas={parcelas} complementos={complementosQ.data ?? []} pagamentos={pagamentos} extratos={extratosQ.data ?? []} kpis={kpisQ.data ?? []}/>
    </>
  );
}
