import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Search, Sparkles, Loader2 } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { apelidoParceiro } from "@/lib/parceiros/nome";
import { BadgeLinkFila } from "@/components/pedidos/LinkPagamentoCard";
import { useLinksPagamentoFila } from "@/hooks/pedidos/useLinkPagamentoPedido";
import { PedidoOportunidadeDialog } from "@/components/comercial/PedidoOportunidadeDialog";
import { AcoesMesaLinha } from "@/components/comercial/AcoesMesaLinha";
import {
  StatusComercialChip, PagamentoEstadoChip,
} from "@/components/comercial/StatusComercialChip";
import {
  useMesaComercial,
  usePagamentoEstadoOpcoes,
  useStatusComercialOpcoes,
  useVendedorAtual,
  type GrupoMesa,
  type MesaComercialRow,
} from "@/hooks/comercial/useMesaComercial";

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

type FiltroTemperatura = "todas" | "quente" | "morno" | "frio" | "nao_cobrar";
type FiltroFase = FaseMesa | "todas";

const FASES: { valor: FiltroFase; rotulo: string }[] = [
  { valor: "oportunidade", rotulo: "Oportunidades" },
  { valor: "pos_faturamento", rotulo: "Pós-faturamento" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "todas", rotulo: "Todas" },
];

export default function Oportunidades({ embutido = false }: { embutido?: boolean } = {}) {
  const [busca, setBusca] = useState("");
  const [temperatura, setTemperatura] = useState<FiltroTemperatura>("todas");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [fase, setFase] = useState<FiltroFase>("oportunidade");
  const [meus, setMeus] = useState(true);

  const [detalhe, setDetalhe] = useState<MesaComercialRow | null>(null);
  const [abaDetalhe, setAbaDetalhe] =
    useState<"itens" | "obs" | "pagamento" | "entrega">("itens");
  const navigate = useNavigate();

  const { data = [], isLoading, isFetching } = useMesaComercial();
  const { data: vendedorAtual } = useVendedorAtual();
  const { data: statusOpcoes = [] } = useStatusComercialOpcoes();

  // "Meus" só faz sentido com vendedor vinculado; sem vínculo, mostra tudo.
  const filtrarMeus = meus && !!vendedorAtual;

  /** Base da fase + escopo do vendedor: os contadores dos filtros nascem daqui. */
  const baseFase = useMemo(() => {
    let base = fase === "todas" ? data : data.filter((r) => r.fase_mesa === fase);
    if (filtrarMeus) base = base.filter((r) => r.vendedor_id === vendedorAtual?.id);
    return base;
  }, [data, fase, filtrarMeus, vendedorAtual?.id]);

  const contagensFase = useMemo(() => {
    const c: Record<FiltroFase, number> = {
      oportunidade: 0,
      pos_faturamento: 0,
      em_andamento: 0,
      todas: 0,
    };
    const escopo = filtrarMeus
      ? data.filter((r) => r.vendedor_id === vendedorAtual?.id)
      : data;
    for (const r of escopo) {
      c.todas++;
      if (r.fase_mesa && r.fase_mesa in c) c[r.fase_mesa]++;
    }
    return c;
  }, [data, filtrarMeus, vendedorAtual?.id]);

  const contagens = useMemo(() => {
    const c = { todas: baseFase.length, quente: 0, morno: 0, frio: 0, nao_cobrar: 0 };
    for (const r of baseFase) {
      const t = r.temperatura_sistema ?? "";
      if (t === "quente" || t === "morno" || t === "frio" || t === "nao_cobrar") c[t]++;
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
    let base =
      temperatura === "todas"
        ? baseFase
        : baseFase.filter((r) => r.temperatura_sistema === temperatura);
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
  }, [baseFase, busca, temperatura, statusFiltro]);

  const { data: linksFila } = useLinksPagamentoFila(filtradas.map((r) => r.pedido_id));

  const kpis = useMemo(() => {
    const qtd = filtradas.length;
    const valor = filtradas.reduce((s, r) => s + Number(r.valor || 0), 0);
    const aberto = filtradas.reduce((s, r) => s + Number(r.boletos_valor_aberto || 0), 0);
    const media =
      qtd > 0
        ? filtradas.reduce((s, r) => s + Number(r.dias_desde_pedido || 0), 0) / qtd
        : 0;
    return { qtd, valor, aberto, media };
  }, [filtradas]);

  const abrirDetalhe = (r: MesaComercialRow, aba: typeof abaDetalhe = "itens") => {
    setAbaDetalhe(aba);
    setDetalhe(r);
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
          <KpiCard label="Pedidos na mesa" value={String(kpis.qtd)} />
          <KpiCard label="Valor" value={formatBRL(kpis.valor)} />
          <KpiCard label="Boletos em aberto" value={formatBRL(kpis.aberto)} />
          <KpiCard
            label="Média de dias"
            value={kpis.qtd > 0 ? `${kpis.media.toFixed(0)} dias` : "—"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border overflow-hidden">
            {FASES.map((f) => (
              <FiltroBtn key={f.valor} ativo={fase === f.valor} onClick={() => setFase(f.valor)}>
                {f.rotulo} ({contagensFase[f.valor]})
              </FiltroBtn>
            ))}
          </div>

          <div className="inline-flex rounded-md border overflow-hidden">
            <FiltroBtn
              ativo={filtrarMeus}
              onClick={() => setMeus(true)}
              title={
                vendedorAtual
                  ? `Só os pedidos de ${vendedorAtual.nome}`
                  : "Seu usuário não está vinculado a um vendedor — a mesa mostra a carteira inteira."
              }
            >
              Meus pedidos
            </FiltroBtn>
            <FiltroBtn ativo={!filtrarMeus} onClick={() => setMeus(false)}>
              Todos
            </FiltroBtn>
          </div>

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
          <div className="inline-flex rounded-md border overflow-hidden">
            <FiltroBtn ativo={temperatura === "todas"} onClick={() => setTemperatura("todas")}>
              Todas ({contagens.todas})
            </FiltroBtn>
            <FiltroBtn ativo={temperatura === "quente"} onClick={() => setTemperatura("quente")}>
              Quente ({contagens.quente})
            </FiltroBtn>
            <FiltroBtn ativo={temperatura === "morno"} onClick={() => setTemperatura("morno")}>
              Morno ({contagens.morno})
            </FiltroBtn>
            <FiltroBtn ativo={temperatura === "frio"} onClick={() => setTemperatura("frio")}>
              Frio ({contagens.frio})
            </FiltroBtn>
            <FiltroBtn
              ativo={temperatura === "nao_cobrar"}
              onClick={() => setTemperatura("nao_cobrar")}
            >
              Não cobrar ({contagens.nao_cobrar})
            </FiltroBtn>
          </div>

          {/* DIMENSAO-VIA-TABELA: os status vêm de oportunidade_status_comercial. */}
          <div className="inline-flex rounded-md border overflow-hidden">
            <FiltroBtn ativo={statusFiltro === "todos"} onClick={() => setStatusFiltro("todos")}>
              Status: todos
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
                      <TableHead className="text-right">Tempo</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((r) => (
                      <TableRow key={r.pedido_id}>
                        <TableCell className="align-top">
                          {/* Dois chips distintos: o do sistema e o da mão do Comercial. */}
                          <div className="flex flex-col items-start gap-1">
                            <TemperaturaChip
                              temperatura={r.temperatura_sistema}
                              score={r.temperatura_score}
                            />
                            <StatusComercialChip
                              pedidoId={r.pedido_id}
                              slug={r.status_comercial_slug}
                              rotulo={r.status_comercial_rotulo}
                              cor={r.status_comercial_cor}
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
                          {(r.boletos_qtd ?? 0) > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {r.boletos_qtd} boleto(s) ·{" "}
                              {formatBRL(r.boletos_valor_aberto ?? 0)} em aberto
                            </div>
                          )}
                        </TableCell>
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
            nfPdfUrl={detalhe.nf_pdf_url}
            nfXmlUrl={detalhe.nf_xml_url}
            temPdf={detalhe.tem_pdf}
            temXml={detalhe.tem_xml}
            boletosValorAberto={detalhe.boletos_valor_aberto}
            comprovantesQtd={detalhe.comprovantes_qtd}
            comprovanteStatus={detalhe.comprovante_status}
            abaInicial={abaDetalhe}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-medium mt-1">{value}</p>
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
