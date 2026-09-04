import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Search, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { apelidoParceiro } from "@/lib/parceiros/nome";
import { BadgeLinkFila } from "@/components/pedidos/LinkPagamentoCard";
import { useLinksPagamentoFila } from "@/hooks/pedidos/useLinkPagamentoPedido";
import { PedidoOportunidadeDialog } from "@/components/comercial/PedidoOportunidadeDialog";
import {
  ClienteHistoricoBloco,
  PrimeiraCompraBadge,
} from "@/components/comercial/ClienteHistorico";
import { AcoesMesaLinha } from "@/components/comercial/AcoesMesaLinha";
import {
  StatusComercialChip, PagamentoEstadoChip,
} from "@/components/comercial/StatusComercialChip";
import {
  useMesaComercial,
  usePagamentoEstadoOpcoes,
  useStatusComercialOpcoes,
  useVendedorAtual,
  PAGAMENTO_ESTADO_TAREFA,
  type GrupoMesa,
  type MesaComercialRow,
} from "@/hooks/comercial/useMesaComercial";
import { usePermissoesMesa } from "@/hooks/comercial/usePermissoesMesa";
import { useMesaEntrega } from "@/hooks/comercial/useMesaEntrega";
import { FaseEntregaCelula } from "@/components/comercial/FaseEntregaCelula";



/**
 * MESA-UNICA-DO-COMERCIAL: uma tela, uma fonte (`vw_mesa_comercial`), a
 * carteira B2B ativa inteira. As fases são filtro, não telas diferentes.
 */
const AVISO_EXCECAO_SITUACAO: Record<string, string> = {
  coberto_haver: "NÃO COBRAR · pré-pago por crédito",
  sem_cobranca: "NÃO É VENDA · não gera título",
  parcial_pago: "JÁ ADIANTOU · cobrar só o saldo",
};

/** Ordem das faixas de temperatura na mesa — peso por map, nunca if encadeado. */
const TEMPERATURA_PESO: Record<string, number> = {
  quente: 0,
  morno: 1,
  frio: 2,
  nao_cobrar: 3,
};

type FiltroGrupo = GrupoMesa | "todas";

const GRUPOS: { valor: FiltroGrupo; rotulo: string }[] = [
  { valor: "oportunidade", rotulo: "Oportunidades" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "todas", rotulo: "Todas" },
];

function mensagemErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e ?? "erro desconhecido");
}

function pareceTimeout(m: string): boolean {
  const lower = m.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("canceling statement") ||
    lower.includes("57014")
  );
}

export default function Oportunidades({ embutido = false }: { embutido?: boolean } = {}) {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [pagamentoFiltro, setPagamentoFiltro] = useState<string>("todos");
  // O valor da mesa está em "Em andamento" (NF, boleto, prazo de entrega).

  const [grupo, setGrupo] = useState<FiltroGrupo>("em_andamento");
  const [meus, setMeus] = useState(true);

  const [detalhe, setDetalhe] = useState<MesaComercialRow | null>(null);
  const [abaDetalhe, setAbaDetalhe] =
    useState<"itens" | "obs" | "pagamento" | "entrega">("itens");
  const navigate = useNavigate();

  const {
    data = [],
    isLoading,
    isFetching,
    isError: isErroMesa,
    error: erroMesa,
    refetch: refetchMesa,
  } = useMesaComercial();
  const {
    data: vendedorAtual,
    isLoading: carregandoVendedor,
    isError: isErroVendedor,
    error: erroVendedor,
  } = useVendedorAtual();
  const {
    data: statusOpcoes = [],
    isError: isErroStatusOpcoes,
    error: erroStatusOpcoes,
  } = useStatusComercialOpcoes();
  const {
    data: pagamentoOpcoes = [],
    isError: isErroPagamentoOpcoes,
    error: erroPagamentoOpcoes,
  } = usePagamentoEstadoOpcoes();
  const { podeVerTodos, carregando: carregandoPerms } = usePermissoesMesa();
  /** Fase & entrega só interessa em "Em andamento" — em Oportunidades o eixo é comercial. */
  const mostrarFaseEntrega = grupo === "em_andamento";
  const {
    data: entrega,
    isError: isErroEntrega,
    error: erroEntrega,
  } = useMesaEntrega();


  /**

   * CARTEIRA-SEGUE-A-PERMISSAO: com `acao.mesa_ver_todos` a pessoa escolhe entre
   * a própria carteira e a de todos. Sem a permissão, vê SOMENTE a própria —
   * o toggle nem existe. Sem vendedor vinculado, a lista fica vazia e explica;
   * nunca cai em "vê tudo" por fallback, que seria vazamento de dado.
   */
  const filtrarMeus = podeVerTodos ? meus && !!vendedorAtual : true;
  const semVendedorVinculado =
    !podeVerTodos && !carregandoPerms && !carregandoVendedor && !vendedorAtual;

  /** Escopo do vendedor aplicado antes de tudo — KPIs e contadores herdam dele. */
  const escopoCarteira = useMemo(() => {
    if (semVendedorVinculado) return [];
    if (!filtrarMeus) return data;
    if (!vendedorAtual) return [];
    return data.filter((r) => r.vendedor_id === vendedorAtual.id);
  }, [data, filtrarMeus, vendedorAtual, semVendedorVinculado]);

  /** Base do grupo + escopo do vendedor: os contadores dos filtros nascem daqui. */
  const baseFase = useMemo(
    () =>
      grupo === "todas"
        ? escopoCarteira
        : escopoCarteira.filter((r) => r.grupo_mesa === grupo),
    [escopoCarteira, grupo],
  );

  const contagensGrupo = useMemo(() => {
    const c: Record<FiltroGrupo, number> = {
      oportunidade: 0,
      em_andamento: 0,
      todas: 0,
    };
    for (const r of escopoCarteira) {
      c.todas++;
      if (r.grupo_mesa && r.grupo_mesa in c) c[r.grupo_mesa]++;
    }
    return c;
  }, [escopoCarteira]);

  /** DIMENSAO-VIA-TABELA: rótulo/cor do eixo 2 sempre de pagamento_estado_dim. */
  const pagamentoDim = useMemo(
    () => new Map(pagamentoOpcoes.map((o) => [o.slug, o])),
    [pagamentoOpcoes],
  );

  const contagensPagamento = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of baseFase) {
      const s = r.pagamento_estado_slug;
      if (s) c.set(s, (c.get(s) ?? 0) + 1);
    }
    return c;
  }, [baseFase]);

  const contagensStatus = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of baseFase) {
      const s = r.status_comercial_slug ?? "__sem__";
      c.set(s, (c.get(s) ?? 0) + 1);
    }
    return c;
  }, [baseFase]);

  const filtradas = useMemo(() => {

    const q = busca.trim().toLowerCase();
    let base = baseFase;
    if (pagamentoFiltro !== "todos") {
      base = base.filter((r) => r.pagamento_estado_slug === pagamentoFiltro);
    }
    if (statusFiltro !== "todos") {

      base = base.filter((r) =>
        statusFiltro === "__sem__"
          ? !r.status_comercial_slug
          : r.status_comercial_slug === statusFiltro,
      );
    }
    if (q) {
      base = base.filter((r) =>
        [r.id_externo, r.cliente, r.apelido, r.cnpj, r.vendedor_nome]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    // TEMPERATURA-MANDA-NA-ORDEM: faixa primeiro, valor decrescente dentro dela.
    return [...base].sort((a, b) => {
      const pa = TEMPERATURA_PESO[a.temperatura_sistema ?? ""] ?? 99;
      const pb = TEMPERATURA_PESO[b.temperatura_sistema ?? ""] ?? 99;
      if (pa !== pb) return pa - pb;
      return Number(b.valor || 0) - Number(a.valor || 0);
    });
  }, [baseFase, busca, pagamentoFiltro, statusFiltro]);

  const {
    data: linksFila,
    isError: isErroLinks,
    error: erroLinks,
  } = useLinksPagamentoFila(filtradas.map((r) => r.pedido_id));

  /** KPIs fixos em Oportunidades: os cards são o painel de estado da mesa,
   *  não um resumo do filtro atual. Continuam respeitando o escopo do vendedor. */
  const baseKpis = useMemo(
    () => escopoCarteira.filter((r) => r.grupo_mesa === "oportunidade"),
    [escopoCarteira],
  );

  const kpis = useMemo(() => {
    const qtd = baseKpis.length;
    const valor = baseKpis.reduce((s, r) => s + Number(r.valor || 0), 0);
    const media =
      qtd > 0
        ? baseKpis.reduce((s, r) => s + Number(r.dias_desde_pedido || 0), 0) / qtd
        : 0;
    const precisamAcao = baseKpis.filter((r) =>
      PAGAMENTO_ESTADO_TAREFA.has(r.pagamento_estado_slug ?? ""),
    );
    const precisamAcaoQtd = precisamAcao.length;
    const precisamAcaoValor = precisamAcao.reduce((s, r) => s + Number(r.valor || 0), 0);
    return { qtd, valor, media, precisamAcaoQtd, precisamAcaoValor };
  }, [baseKpis]);

  const abrirDetalhe = (r: MesaComercialRow, aba: typeof abaDetalhe = "itens") => {
    setAbaDetalhe(aba);
    setDetalhe(r);
  };

  /** FILTRO-QUE-NAO-SE-APLICA-NAO-RENDERIZA: esconder uma faixa sem resetar
   *  o estado deixaria o filtro ativo invisível — armadilha de UX. */
  const mudarGrupo = (novo: FiltroGrupo) => {
    setGrupo(novo);
    if (novo !== "oportunidade") setPagamentoFiltro("todos");
  };

  return (

    <TooltipProvider>
      <div className={embutido ? "space-y-6" : "space-y-6 p-4 md:p-6"}>
        {!embutido && (
          <CasaPageHeader
            breadcrumb={[{ label: "Comercial" }, { label: "Mesa Comercial" }]}
            title="Mesa Comercial"
            subtitle="Carteira B2B ativa do Comercial: oportunidades, pós-faturamento e pedidos em andamento na mesma mesa. O status comercial é seu; a temperatura é do sistema."
          />
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Oportunidades" value={isErroMesa ? "—" : String(kpis.qtd)} />
          <KpiCard label="Valor em oportunidades" value={isErroMesa ? "—" : formatBRL(kpis.valor)} />
          <KpiCard
            label="Precisam de ação"
            value={isErroMesa ? "—" : String(kpis.precisamAcaoQtd)}
            subtitle={
              isErroMesa
                ? undefined
                : kpis.precisamAcaoQtd > 0
                  ? formatBRL(kpis.precisamAcaoValor)
                  : undefined
            }
          />
          <KpiCard
            label="Média de dias parados"
            value={isErroMesa ? "—" : kpis.qtd > 0 ? `${kpis.media.toFixed(0)} dias` : "—"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border overflow-hidden">
            {GRUPOS.map((g) => (
              <FiltroBtn
                key={g.valor}
                ativo={grupo === g.valor}
                onClick={() => mudarGrupo(g.valor)}
              >
                {g.rotulo} ({contagensGrupo[g.valor]})
              </FiltroBtn>
            ))}
          </div>

          {/* O toggle só existe para quem tem `acao.mesa_ver_todos`. */}

          {podeVerTodos && (
            <div className="inline-flex rounded-md border overflow-hidden">
              <FiltroBtn
                ativo={filtrarMeus}
                onClick={() => setMeus(true)}
                title={
                  vendedorAtual
                    ? `Só os pedidos de ${vendedorAtual.nome}`
                    : "Seu usuário não está vinculado a um vendedor — ative 'Todos' para ver a carteira."
                }
              >
                Meus pedidos
              </FiltroBtn>
              <FiltroBtn ativo={!filtrarMeus} onClick={() => setMeus(false)}>
                Todos
              </FiltroBtn>
            </div>
          )}

          {isFetching && !isLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}

          <div className="relative w-full md:w-80 md:ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por pedido, cliente, nome fantasia, CNPJ, vendedor…"
              className="pl-8 h-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* EIXO 1 — julgamento comercial. DIMENSAO-VIA-TABELA. */}
          <div className="inline-flex rounded-md border overflow-hidden">
            <FiltroBtn ativo={statusFiltro === "todos"} onClick={() => setStatusFiltro("todos")}>
              Todas ({baseFase.length})
            </FiltroBtn>
            {statusOpcoes.map((o) => (
              <FiltroBtn
                key={o.slug}
                ativo={statusFiltro === o.slug}
                onClick={() => setStatusFiltro(o.slug)}
              >
                {o.rotulo} ({contagensStatus.get(o.slug) ?? 0})
              </FiltroBtn>
            ))}
            <FiltroBtn
              ativo={statusFiltro === "__sem__"}
              onClick={() => setStatusFiltro("__sem__")}
            >
              Sem status ({contagensStatus.get("__sem__") ?? 0})
            </FiltroBtn>
          </div>

          {/* EIXO 2 — estado do pagamento, derivado. Só faz sentido no grupo
              Oportunidades, onde `pagamento_estado_slug` é calculado. */}
          {grupo === "oportunidade" && (
            <div className="inline-flex rounded-md border overflow-hidden">
              <FiltroBtn
                ativo={pagamentoFiltro === "todos"}
                onClick={() => setPagamentoFiltro("todos")}
                title="Estado do pagamento — calculado pelo sistema"
              >
                Todos ({baseFase.length})
              </FiltroBtn>
              {pagamentoOpcoes.map((o) => (
                <FiltroBtn
                  key={o.slug}
                  ativo={pagamentoFiltro === o.slug}
                  onClick={() => setPagamentoFiltro(o.slug)}
                >
                  {o.rotulo} ({contagensPagamento.get(o.slug) ?? 0})
                </FiltroBtn>
              ))}
            </div>
          )}
        </div>


        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Montando a carteira completa — leva alguns segundos.
                </p>
              </div>
            ) : semVendedorVinculado ? (
              <div className="text-center py-16 px-6">
                <Sparkles className="h-8 w-8 text-muted-foreground/60 mx-auto mb-3" />
                <p className="text-sm font-medium">
                  Seu usuário não está vinculado a um vendedor.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  A mesa mostra apenas a sua carteira. Peça a Operações para vincular seu
                  usuário ao cadastro de vendedor — ou a permissão de ver todos.
                </p>
              </div>
            ) : filtradas.length === 0 ? (
              <div className="text-center py-16 px-6">
                <Sparkles className="h-8 w-8 text-muted-foreground/60 mx-auto mb-3" />
                <p className="text-sm font-medium">
                  Nenhum pedido encontrado com os filtros atuais.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ajuste a fase, o escopo, o status ou a busca.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      {mostrarFaseEntrega && <TableHead>Fase &amp; entrega</TableHead>}
                      <TableHead className="text-right">Tempo</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>

                  </TableHeader>
                  <TableBody>
                    {filtradas.map((r) => (
                      <TableRow key={r.pedido_id}>
                        <TableCell className="align-top">
                          {/* EIXO 1 (manual) + EIXO 2 (derivado). Vocabulários distintos. */}
                          <div className="flex flex-col items-start gap-1">
                            <StatusComercialChip
                              pedidoId={r.pedido_id}
                              slug={r.status_comercial_slug}
                              rotulo={r.status_comercial_rotulo}
                              cor={r.status_comercial_cor}
                              temperaturaSistema={r.temperatura_sistema}
                              temperaturaScore={r.temperatura_score}
                            />
                            <PagamentoEstadoChip
                              slug={r.pagamento_estado_slug}
                              rotulo={pagamentoDim.get(r.pagamento_estado_slug ?? "")?.rotulo ?? null}
                              cor={pagamentoDim.get(r.pagamento_estado_slug ?? "")?.cor ?? null}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs align-top">
                          <button
                            type="button"
                            className="font-mono text-primary underline-offset-2 hover:underline cursor-pointer"
                            onClick={() => abrirDetalhe(r)}
                          >
                            {r.id_externo || "—"}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {r.bloqueio_rotulo && (
                              <Badge
                                variant="outline"
                                className="rounded px-1.5 py-0 text-[10px] border-warning/50 text-warning"
                              >
                                {r.bloqueio_rotulo}
                              </Badge>
                            )}
                            {(r.solicitacoes_abertas ?? 0) > 0 && (
                              <Badge
                                variant="outline"
                                className="rounded px-1.5 py-0 text-[10px] border-primary/50 text-primary"
                                title="Solicitações abertas no SOPS"
                              >
                                SOPS {r.solicitacoes_abertas}
                              </Badge>
                            )}
                            {r.nf_numero && (
                              <Badge
                                variant="outline"
                                className="rounded px-1.5 py-0 text-[10px]"
                                title={r.nf_chave ?? undefined}
                              >
                                NF {r.nf_numero}
                              </Badge>
                            )}
                          </div>
                          {r.data_entrega_prevista && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              entrega {formatDateBR(r.data_entrega_prevista)}
                              {r.meta_provisoria ? " (provisória)" : ""}
                            </div>
                          )}
                          <div className="mt-1">
                            <BadgeLinkFila linha={linksFila?.[r.pedido_id]} />
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[280px] align-top">
                          <button
                            type="button"
                            className="block max-w-full truncate font-medium text-left text-primary underline-offset-2 hover:underline cursor-pointer"
                            onClick={() => navigate(`/parceiros/${r.parceiro_id}`)}
                          >
                            {r.cliente || "—"}
                          </button>
                          {apelidoParceiro(r.cliente, r.apelido) && (
                            <div className="text-xs text-muted-foreground truncate">
                              {apelidoParceiro(r.cliente, r.apelido)}
                            </div>
                          )}
                          <div className="mt-0.5">
                            <PrimeiraCompraBadge eh_primeira_compra={r.eh_primeira_compra} />
                          </div>
                          {AVISO_EXCECAO_SITUACAO[r.situacao_financeira ?? ""] && (
                            <div className="mt-0.5">
                              <Badge
                                variant="outline"
                                className="rounded px-1.5 py-0 text-[10px] border-warning/50 text-warning"
                                title={r.alerta_operacional ?? undefined}
                              >
                                {AVISO_EXCECAO_SITUACAO[r.situacao_financeira ?? ""]}
                              </Badge>
                            </div>
                          )}
                          {r.status_comercial_motivo && (
                            <div
                              className="text-xs text-muted-foreground truncate mt-0.5"
                              title={r.status_comercial_motivo}
                            >
                              {r.status_comercial_motivo}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          {formatBRL(r.valor ?? 0)}
                          {/* CONDICAO-NA-LINHA: o comercial decide olhando a condição. */}
                          {(r.condicao_solicitada || r.forma_pagamento_nome) && (
                            <div
                              className="text-xs text-muted-foreground truncate"
                              title={
                                [r.forma_pagamento_nome, r.condicao_solicitada]
                                  .filter(Boolean)
                                  .join(" · ") || undefined
                              }
                            >
                              {r.condicao_solicitada || r.forma_pagamento_nome}
                            </div>
                          )}
                          {(r.boletos_qtd ?? 0) > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {r.boletos_qtd} boleto(s) ·{" "}
                              {formatBRL(r.boletos_valor_aberto ?? 0)} em aberto
                            </div>
                          )}
                        </TableCell>
                        {mostrarFaseEntrega && (
                          <TableCell className="align-top">
                            <FaseEntregaCelula linha={entrega?.porPedido.get(r.pedido_id)} />
                          </TableCell>
                        )}
                        <TableCell className="text-right align-top">
                          <div className="text-sm">{r.dias_desde_pedido ?? 0}d do pedido</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateBR(r.data_pedido)}
                          </div>
                        </TableCell>

                        <TableCell className="text-xs align-top">
                          {r.vendedor_nome || "—"}
                        </TableCell>
                        <TableCell className="align-middle">
                          <AcoesMesaLinha
                            linha={r}
                            onVerBoletos={() => abrirDetalhe(r, "entrega")}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {detalhe && (
          <PedidoOportunidadeDialog
            open={!!detalhe}
            onOpenChange={(v) => !v && setDetalhe(null)}
            pedidoId={detalhe.pedido_id}
            idExterno={detalhe.id_externo}
            cliente={detalhe.cliente}
            apelido={detalhe.apelido}
            valorEmJogo={detalhe.valor}
            situacaoFinanceira={detalhe.situacao_financeira}
            alertaOperacional={detalhe.alerta_operacional}
            linkPagamento={detalhe.link_pagamento}
            dataEntregaPrevista={detalhe.data_entrega_prevista}
            metaOriginal={detalhe.meta_original}
            metaProvisoria={detalhe.meta_provisoria}
            nfNumero={detalhe.nf_numero}
            nfChave={detalhe.nf_chave}
            nfId={detalhe.nf_id}
            nfSerie={detalhe.nf_serie}
            temPdf={detalhe.tem_pdf}

            temXml={detalhe.tem_xml}
            boletosValorAberto={detalhe.boletos_valor_aberto}
            comprovantesQtd={detalhe.comprovantes_qtd}
            comprovanteStatus={detalhe.comprovante_status}
            abaInicial={abaDetalhe}
            historicoCliente={{
              eh_primeira_compra: detalhe.eh_primeira_compra,
              cliente_pedidos_faturados: detalhe.cliente_pedidos_faturados,
              cliente_valor_faturado: detalhe.cliente_valor_faturado,
              cliente_primeira_compra: detalhe.cliente_primeira_compra,
              cliente_ultima_compra: detalhe.cliente_ultima_compra,
              cliente_dias_sem_comprar: detalhe.cliente_dias_sem_comprar,
              cliente_ticket_medio: detalhe.cliente_ticket_medio,
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-medium mt-1">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function FiltroBtn({
  ativo,
  onClick,
  children,
  title,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "px-3 py-1.5 text-xs font-medium border-r last:border-r-0 transition-colors",
        ativo
          ? "bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
