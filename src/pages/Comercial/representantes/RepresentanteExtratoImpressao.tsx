import { useMemo } from "react";
import { BarraImpressao } from "@/components/impressao/BarraImpressao";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hojeISO } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { fmtBRL, fmtCompetencia, fmtData, fmtPct } from "../comissoes/fmt";
import { TIPOS_ESTORNO } from "../comissoes/Estornos";
import { lerTudo, type Linha } from "./dados";
import {
  dataDoFechamento, extratoDaCompetencia, lerExtratosDoRepresentante, opcoesCompetencia,
} from "./extratoCompetencias";

const EMPRESA = "Fetély Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48";
const NOTA_LEGAL =
  "A comissão nasce na nota fiscal, sobre o valor da NF menos frete, e só é liberada quando o cliente paga. Pagamento até o dia 15 do mês subsequente à liquidação, mediante nota fiscal de serviço (Lei 4.886/1965, art. 32). Dúvidas podem ser registradas pelo portal do representante.";
const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

function proximoMes(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes, 1));
  return `${proximo.getUTCFullYear()}-${String(proximo.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function rotuloCompetencia(competencia: string) {
  return fmtCompetencia(`${competencia}-01`);
}

function numero(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function Inteiro({ valor }: { valor: unknown }) {
  return <>{numero(valor).toLocaleString("pt-BR")}</>;
}

function ValorGrande({ titulo, valor, detalhe }: { titulo: string; valor: unknown; detalhe?: string }) {
  return (
    <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0">
      <div className="text-[8pt] text-muted-foreground">{titulo}</div>
      <div className="mt-1 whitespace-nowrap text-[17pt] font-medium tabular-nums leading-none">{fmtBRL(numero(valor))}</div>
      {detalhe && <div className="mt-1 text-[7.5pt] text-muted-foreground">{detalhe}</div>}
    </div>
  );
}

function Metrica({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-2">
      <div className="text-[7.5pt] text-muted-foreground">{titulo}</div>
      <div className="mt-0.5 text-[10pt] font-medium tabular-nums">{children}</div>
    </div>
  );
}

function Rodape({ pagina, legal = false }: { pagina: 1 | 2; legal?: boolean }) {
  return (
    <footer className="absolute inset-x-0 bottom-0 border-t border-border pt-2 text-[6.5pt] leading-snug text-muted-foreground">
      {legal && <p className="mb-2 max-w-[154mm]">{NOTA_LEGAL}</p>}
      <div className="flex items-end justify-between gap-4">
        <span>{EMPRESA}</span>
        <span className="shrink-0 tabular-nums">Página {pagina} de 2</span>
      </div>
    </footer>
  );
}

function TabelaHistorico({ serie }: { serie: Linha[] }) {
  const mesAtual = hojeISO().slice(0, 7);
  const linhas = [...serie]
    .filter((linha) => String(linha.mes ?? "").slice(0, 7) <= mesAtual)
    .sort((a, b) => String(b.mes ?? "").localeCompare(String(a.mes ?? "")))
    .slice(0, 6)
    .reverse();
  return (
    <section className="mt-5">
      <h2 className="text-[11pt] font-medium">Comissão apurada por mês</h2>
      {linhas.length === 0 ? (
        <p className="mt-2 text-[8pt] text-muted-foreground">Ainda não há histórico mensal apurado.</p>
      ) : (
        <table className="mt-2 w-full table-fixed border-collapse text-[8pt]">
          <thead>
            <tr className="border-y border-border text-muted-foreground">
              <th className="py-1.5 text-left font-medium">Mês</th>
              <th className="py-1.5 text-right font-medium">Vendido</th>
              <th className="py-1.5 text-right font-medium">Comissão apurada</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={String(linha.mes)} className="border-b border-border/70">
                <td className="py-1.5">{fmtCompetencia(linha.mes)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtBRL(numero(linha.base_faturada))}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtBRL(numero(linha.comissao_apurada))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function PaginaResumo({ representante, serie }: { representante: Linha; serie: Linha[] }) {
  const travada = numero(representante.comissao_travada_inadimplencia);
  const proximaData = representante.proximo_recebimento_data ? fmtData(representante.proximo_recebimento_data) : "Sem previsão";
  const periodo = `${fmtData(representante.primeira_venda)} → ${fmtData(representante.ultima_venda)}`;
  return (
    <section className="pagina-a4 relative bg-card text-card-foreground">
      <header className="border-b border-border pb-4">
        <div className="font-display text-[25pt] font-medium leading-none text-gold">FETÉLY</div>
        <div className="mt-1 text-[9pt] text-muted-foreground">Extrato do Representante</div>
      </header>

      <section className="mt-4 grid grid-cols-[1fr_auto] gap-6">
        <div>
          <h1 className="text-[18pt] font-medium leading-tight">{representante.representante}</h1>
            <p className="mt-1 text-[8.5pt] text-muted-foreground">
              {representante.email_contato || "E-mail não informado"}
            </p>
            {representante.regiao && (
              <p className="text-[8.5pt] text-muted-foreground">Região: {representante.regiao}</p>
            )}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-[7.5pt]">
          <dt className="text-muted-foreground">Relacionamento</dt><dd className="text-right tabular-nums">{periodo}</dd>
          <dt className="text-muted-foreground">Emissão</dt><dd className="text-right tabular-nums">{fmtData(hojeISO())}</dd>
        </dl>
      </section>

      <section className="mt-5 border-y border-border py-4">
        <h2 className="mb-3 text-[11pt] font-medium">Sua situação hoje</h2>
        <div className="grid grid-cols-3 gap-4">
          <ValorGrande titulo="Recebida" valor={representante.comissao_recebida} />
          <ValorGrande titulo="A receber" valor={representante.comissao_a_receber} />
          <ValorGrande titulo="Próximo recebimento" valor={representante.proximo_recebimento} detalhe={proximaData} />
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-7">
        <section>
          <h2 className="text-[11pt] font-medium">Seu desempenho</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2">
            <Metrica titulo="Vendido no total">{fmtBRL(numero(representante.valor_vendido_bruto))}</Metrica>
            <Metrica titulo="Pedidos"><Inteiro valor={representante.pedidos_total} /></Metrica>
            <Metrica titulo="Clientes atendidos"><Inteiro valor={representante.clientes_distintos} /></Metrica>
            <Metrica titulo="Clientes abertos por você"><Inteiro valor={representante.clientes_novos_total} /></Metrica>
            <Metrica titulo="Clientes novos nos últimos 90 dias"><Inteiro valor={representante.clientes_novos_90d} /></Metrica>
            <Metrica titulo="Clientes que já eram da Fetély"><Inteiro valor={representante.clientes_recompra} /></Metrica>
            <Metrica titulo="Ticket médio">{fmtBRL(numero(representante.ticket_medio))}</Metrica>
            <Metrica titulo="Última venda">
              {representante.ultima_venda_valor == null ? "—" : `${fmtBRL(numero(representante.ultima_venda_valor))} · ${fmtData(representante.ultima_venda_data)}`}
            </Metrica>
            <Metrica titulo="Média mensal (3m)">{fmtBRL(numero(representante.media_mensal_3m))}</Metrica>
          </div>
        </section>

        <section>
          <h2 className="text-[11pt] font-medium">Carteira dos seus clientes</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2">
            <Metrica titulo="Carteira a receber">{fmtBRL(numero(representante.carteira_a_receber))}</Metrica>
            <Metrica titulo="Carteira vencida">
              <span className={cn(numero(representante.carteira_vencida) > 0 && "text-destructive-strong")}>{fmtBRL(numero(representante.carteira_vencida))}</span>
            </Metrica>
            <Metrica titulo="Parcelas vencidas"><Inteiro valor={representante.parcelas_vencidas} /></Metrica>
            <Metrica titulo="Maior atraso"><Inteiro valor={representante.maior_atraso_dias} /> dias</Metrica>
          </div>
          {travada > 0 && (
            <p className="mt-3 border-l-2 border-destructive pl-2 text-[7.5pt] leading-relaxed text-destructive-strong">
              {fmtBRL(travada)} de comissão está aguardando clientes inadimplentes. O valor não foi estornado e será liberado quando o cliente pagar.
            </p>
          )}
        </section>
      </div>

      <TabelaHistorico serie={serie} />
      <Rodape pagina={1} />
    </section>
  );
}

function PaginaExtrato({ competencia, selo, detalhes, estornos }: { competencia: string; selo: string; detalhes: Linha[]; estornos: Linha[] }) {
  const grupos = useMemo(() => {
    const porApuracao = new Map<string, Linha[]>();
    for (const linha of detalhes) {
      const chave = String(linha.apuracao_id ?? linha.nf_id ?? linha.nf ?? "");
      const grupo = porApuracao.get(chave) ?? [];
      grupo.push(linha);
      porApuracao.set(chave, grupo);
    }
    return [...porApuracao.values()];
  }, [detalhes]);
  const totalApurado = grupos.reduce((soma, grupo) => soma + numero(grupo[0]?.comissao_da_nota), 0);
  const totalLiberado = detalhes.reduce((soma, linha) => soma + numero(linha.valor_liberado), 0);
  const totalEstornado = estornos.reduce((soma, estorno) => soma + numero(estorno.valor_estornado), 0);
  const totalALiberar = Math.max(0, totalApurado - totalLiberado - totalEstornado);

  return (
    <section className="pagina-a4 quebra-pagina relative bg-card text-card-foreground">
      <header className="flex items-end justify-between border-b border-border pb-3">
        <div>
          <div className="font-display text-[17pt] font-medium leading-none text-gold">FETÉLY</div>
          <h1 className="mt-2 text-[16pt] font-medium">Extrato de {rotuloCompetencia(competencia)}</h1>
          <p className="mt-1 text-[7.5pt] text-muted-foreground">{selo}</p>
        </div>
        <div className="text-[7.5pt] text-muted-foreground">Emitido em {fmtData(hojeISO())}</div>
      </header>

      {detalhes.length === 0 ? (
        <div className="mt-12 border-y border-border py-8 text-center text-[10pt] text-muted-foreground">
          Nenhuma comissão apurada nesta competência.
        </div>
      ) : (
        <table className="mt-4 w-full table-fixed border-collapse text-[6.8pt] leading-tight">
          <colgroup>
            <col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[21%]" /><col className="w-[13%]" />
            <col className="w-[7%]" /><col className="w-[10%]" /><col className="w-[18%]" /><col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-y border-border text-muted-foreground">
              <th className="py-1.5 pr-1 text-left font-medium">NF</th>
              <th className="px-1 py-1.5 text-left font-medium">Pedido</th>
              <th className="px-1 py-1.5 text-left font-medium">Cliente</th>
              <th className="px-1 py-1.5 text-right font-medium">Comissão NF</th>
              <th className="px-1 py-1.5 text-center font-medium">Parc.</th>
              <th className="px-1 py-1.5 text-center font-medium">Vencimento</th>
              <th className="px-1 py-1.5 text-left font-medium">Situação</th>
              <th className="py-1.5 pl-1 text-right font-medium">Comissão parcela</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo) =>
              [...grupo]
                .sort((a, b) => numero(a.numero_parcela) - numero(b.numero_parcela))
                .map((linha, indice) => (
                  <tr key={`${linha.apuracao_id}-${linha.titulo_id ?? indice}`} className={cn("border-b border-border/70", indice === 0 && "border-t border-t-foreground/30")}>
                    <td className="py-1.5 pr-1 align-top">{indice === 0 ? linha.nf || "—" : ""}</td>
                    <td className="px-1 py-1.5 align-top">{indice === 0 ? linha.pedido || "—" : ""}</td>
                    <td className="break-words px-1 py-1.5 align-top">{indice === 0 ? linha.cliente || "—" : ""}</td>
                    <td className="px-1 py-1.5 text-right align-top tabular-nums">{indice === 0 ? fmtBRL(numero(linha.comissao_da_nota)) : ""}</td>
                    <td className="px-1 py-1.5 text-center align-top tabular-nums">{linha.numero_parcela ? `${linha.numero_parcela}/${linha.total_parcelas ?? "?"}` : "—"}</td>
                    <td className="px-1 py-1.5 text-center align-top tabular-nums">{fmtData(linha.vencimento)}</td>
                    <td className="break-words px-1 py-1.5 align-top">{situacao(linha.situacao_parcela)}</td>
                    <td className="py-1.5 pl-1 text-right align-top tabular-nums">{fmtBRL(numero(linha.comissao_da_parcela))}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      )}

      {estornos.length > 0 && (
        <section className="mt-4">
          <h2 className="text-[8pt] font-medium">Estornos da competência</h2>
          <div className="mt-1 border-y border-border">
            {estornos.map((estorno) => (
              <div key={String(estorno.id)} className="grid grid-cols-[25mm_1fr_28mm] gap-2 border-b border-border/70 py-1.5 text-[6.8pt] last:border-b-0">
                <span>{TIPOS_ESTORNO[String(estorno.tipo)] ?? estorno.tipo}</span>
                <span className="break-words text-muted-foreground">{estorno.motivo}</span>
                <span className="text-right tabular-nums text-destructive-strong">− {fmtBRL(numero(estorno.valor_estornado))}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-4 ml-auto grid w-[92mm] grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-foreground pt-2 text-[8pt]">
        <span>Total apurado</span><span className="text-right font-medium tabular-nums">{fmtBRL(totalApurado)}</span>
        <span>Total liberado</span><span className="text-right font-medium tabular-nums">{fmtBRL(totalLiberado)}</span>
        <span>Total a liberar</span><span className="text-right font-medium tabular-nums">{fmtBRL(totalALiberar)}</span>
      </section>

      <Rodape pagina={2} legal />
    </section>
  );
}

/* Competência FECHADA: o documento lê o detalhe congelado em comissao_extrato.
   Nada é recalculado aqui — é o mesmo conteúdo que o representante recebeu. */
type ItemCongelado = Record<string, any>;

function PaginaExtratoCongelado({ competencia, selo, itens, valorTotal }: {
  competencia: string; selo: string; itens: ItemCongelado[]; valorTotal: number;
}) {
  const liberacoes = itens.filter((i) => String(i.tipo ?? "liberacao") !== "estorno");
  const estornos = itens.filter((i) => String(i.tipo) === "estorno");
  const totalLiberado = liberacoes.reduce((s, i) => s + numero(i.valor), 0);
  const totalEstornado = estornos.reduce((s, i) => s + Math.abs(numero(i.valor)), 0);

  return (
    <section className="pagina-a4 quebra-pagina relative bg-card text-card-foreground">
      <header className="flex items-end justify-between border-b border-border pb-3">
        <div>
          <div className="font-display text-[17pt] font-medium leading-none text-gold">FETÉLY</div>
          <h1 className="mt-2 text-[16pt] font-medium">Extrato de {rotuloCompetencia(competencia)}</h1>
          <p className="mt-1 text-[7.5pt] text-muted-foreground">{selo}</p>
        </div>
        <div className="text-[7.5pt] text-muted-foreground">Emitido em {fmtData(hojeISO())}</div>
      </header>

      {liberacoes.length === 0 ? (
        <div className="mt-12 border-y border-border py-8 text-center text-[10pt] text-muted-foreground">
          Nenhuma comissão liberada nesta competência.
        </div>
      ) : (
        <table className="mt-4 w-full table-fixed border-collapse text-[6.8pt] leading-tight">
          <colgroup>
            <col className="w-[12%]" /><col className="w-[16%]" /><col className="w-[10%]" />
            <col className="w-[16%]" /><col className="w-[18%]" /><col className="w-[10%]" /><col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr className="border-y border-border text-muted-foreground">
              <th className="py-1.5 pr-1 text-left font-medium">NF</th>
              <th className="px-1 py-1.5 text-left font-medium">Pedido</th>
              <th className="px-1 py-1.5 text-center font-medium">Parc.</th>
              <th className="px-1 py-1.5 text-center font-medium">Liquidação</th>
              <th className="px-1 py-1.5 text-right font-medium">Comissão da NF</th>
              <th className="px-1 py-1.5 text-right font-medium">Proporção</th>
              <th className="py-1.5 pl-1 text-right font-medium">Valor liberado</th>
            </tr>
          </thead>
          <tbody>
            {liberacoes.map((i, indice) => (
              <tr key={String(i.liberacao_id ?? indice)} className="border-b border-border/70">
                <td className="py-1.5 pr-1 align-top">{i.nf || "—"}</td>
                <td className="px-1 py-1.5 align-top">{i.pedido || "—"}</td>
                <td className="px-1 py-1.5 text-center align-top tabular-nums">{i.parcela ?? "—"}</td>
                <td className="px-1 py-1.5 text-center align-top tabular-nums">{fmtData(i.data_liquidacao)}</td>
                <td className="px-1 py-1.5 text-right align-top tabular-nums">{fmtBRL(numero(i.comissao_da_nota))}</td>
                <td className="px-1 py-1.5 text-right align-top tabular-nums">{i.proporcao != null ? fmtPct(numero(i.proporcao) * 100) : "—"}</td>
                <td className="py-1.5 pl-1 text-right align-top tabular-nums">{fmtBRL(numero(i.valor))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {estornos.length > 0 && (
        <section className="mt-4">
          <h2 className="text-[8pt] font-medium">Estornos abatidos nesta competência</h2>
          <div className="mt-1 border-y border-border">
            {estornos.map((e, indice) => (
              <div key={String(e.estorno_id ?? indice)} className="grid grid-cols-[25mm_1fr_28mm] gap-2 border-b border-border/70 py-1.5 text-[6.8pt] last:border-b-0">
                <span>{TIPOS_ESTORNO[String(e.estorno_tipo)] ?? e.estorno_tipo ?? "Estorno"}</span>
                <span className="break-words text-muted-foreground">
                  {e.motivo}{e.parcial ? " (abatimento parcial)" : ""}
                </span>
                <span className="text-right tabular-nums text-destructive-strong">− {fmtBRL(Math.abs(numero(e.valor)))}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-4 ml-auto grid w-[92mm] grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-foreground pt-2 text-[8pt]">
        <span>Comissão liberada</span><span className="text-right font-medium tabular-nums">{fmtBRL(totalLiberado)}</span>
        <span>Estornos abatidos</span><span className="text-right font-medium tabular-nums">− {fmtBRL(totalEstornado)}</span>
        <span className="font-medium">Valor do extrato</span><span className="text-right font-medium tabular-nums">{fmtBRL(valorTotal)}</span>
      </section>

      <Rodape pagina={2} legal />
    </section>
  );
}

function situacao(valor: unknown) {
  const labels: Record<string, string> = {
    liberada: "Liberada",
    paga_aguarda_liberacao: "Paga, aguarda liberação",
    vencida: "Vencida",
    a_vencer: "A vencer",
  };
  const chave = String(valor ?? "");
  return labels[chave] ?? (chave.replace(/_/g, " ") || "—");
}

const ESTILOS_IMPRESSAO = `
  [aria-label="Minhas tarefas"] { display: none !important; }
  .documento-extrato { min-height: 100vh; background: hsl(var(--muted)); padding: 12mm 0; }
  .pagina-a4 { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto 10mm; padding: 15mm; box-shadow: 0 1mm 4mm hsl(var(--foreground) / 0.12); font-family: 'DM Sans', system-ui, sans-serif; font-weight: 400; }
  @page { size: A4; margin: 15mm; }
  @media print {
    html, body, #root { margin: 0 !important; padding: 0 !important; background: hsl(var(--card)) !important; }
    .documento-extrato { min-height: 0; padding: 0; background: hsl(var(--card)); }
    .pagina-a4 { width: 180mm; height: 267mm; min-height: 267mm; margin: 0; padding: 0; box-shadow: none; overflow: hidden; }
    .quebra-pagina { break-before: page; page-break-before: always; }
    .seletor-competencia { display: none !important; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

export default function RepresentanteExtratoImpressao() {
  const { vendedorId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const competenciaParam = params.get("competencia");
  const competencia = competenciaParam ?? hojeISO().slice(0, 7);
  const competenciaValida = RE_COMPETENCIA.test(competencia);
  const inicio = competenciaValida ? `${competencia}-01` : "";
  const fim = competenciaValida ? proximoMes(competencia) : "";

  const representanteQ = useQuery({
    queryKey: ["representante-extrato-impressao", vendedorId],
    queryFn: () => lerTudo("vw_representante_financeiro", (q) => q.eq("vendedor_id", vendedorId)),
    enabled: Boolean(vendedorId) && competenciaValida,
  });
  const serieQ = useQuery({
    queryKey: ["representante-extrato-serie", vendedorId],
    queryFn: () => lerTudo("vw_representante_serie_mensal", (q) => q.eq("vendedor_id", vendedorId), { col: "mes" }),
    enabled: Boolean(vendedorId) && competenciaValida,
  });
  const extratosQ = useQuery({
    queryKey: ["representante-extratos-fechados", vendedorId],
    queryFn: () => lerExtratosDoRepresentante(vendedorId),
    enabled: Boolean(vendedorId),
  });
  const extrato = extratosQ.data ? extratoDaCompetencia(extratosQ.data, competencia) : undefined;
  const fechada = Boolean(extrato);
  const aoVivo = extratosQ.isSuccess && !fechada;

  const detalhesQ = useQuery({
    queryKey: ["representante-extrato-competencia", vendedorId, competencia],
    queryFn: () => lerTudo(
      "vw_comissao_detalhe",
      (q) => q.eq("vendedor_id", vendedorId).gte("competencia", inicio).lt("competencia", fim),
      { col: "nf_emissao", asc: true },
    ),
    enabled: Boolean(vendedorId) && competenciaValida && aoVivo,
  });
  const apuracoes = useMemo(
    () => [...new Set((detalhesQ.data ?? []).map((linha) => String(linha.apuracao_id ?? "")).filter(Boolean))],
    [detalhesQ.data],
  );
  const estornosQ = useQuery({
    queryKey: ["representante-extrato-estornos", vendedorId, competencia, apuracoes],
    queryFn: async () => {
      if (apuracoes.length === 0) return [] as Linha[];
      const { data, error } = await (supabase as any)
        .from("comissao_estorno")
        .select("id,apuracao_id,tipo,motivo,valor_estornado")
        .eq("vendedor_id", vendedorId)
        .in("apuracao_id", apuracoes)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
    enabled: detalhesQ.isSuccess && aoVivo,
  });

  const carregando = representanteQ.isLoading || serieQ.isLoading || extratosQ.isLoading
    || (aoVivo && (detalhesQ.isLoading || estornosQ.isLoading));
  const erro = representanteQ.error || serieQ.error || extratosQ.error || detalhesQ.error || estornosQ.error;
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

  const selo = extrato
    ? `Extrato fechado em ${fmtData(extrato.fechado_em)}`
    : `Prévia — sujeita a alteração até o fechamento em ${dataDoFechamento(competencia)}`;
  const opcoes = opcoesCompetencia(extratosQ.data ?? []);

  return (
    <main className="documento-extrato">
      <style>{ESTILOS_IMPRESSAO}</style>
      <BarraImpressao />
      <div className="seletor-competencia mx-auto mb-3 flex w-[210mm] max-w-full items-center gap-2 px-4 text-sm">
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
      </div>
      <PaginaResumo representante={representante} serie={serieQ.data ?? []} />
      {extrato ? (
        <PaginaExtratoCongelado
          competencia={competencia}
          selo={selo}
          itens={Array.isArray(extrato.detalhe) ? extrato.detalhe : []}
          valorTotal={numero(extrato.valor_total)}
        />
      ) : (
        <PaginaExtrato competencia={competencia} selo={selo} detalhes={detalhesQ.data ?? []} estornos={estornosQ.data ?? []} />
      )}
    </main>
  );
}
