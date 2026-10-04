import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { baixarRelatorioDivergencia, temDivergenciaLiquida, type LinhaDivergencia, type LinhaLiquida } from "@/lib/compras/relatorio-divergencia-xlsx";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Selo } from "@/components/ui/selo";
import { CardIndicador } from "@/components/ui/card-indicador";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEFAULT_PAGE_SIZE,
  RodapePaginacao,
  type PageSizeOption,
} from "@/components/tabela/RodapePaginacao";

import { TabelaFetely } from "@/components/ui/tabela-fetely";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Léxico único de Compras de Mercadoria — três camadas, dois saldos:
 *   Pedido → Declarado (NF) → Recebido
 *   A faturar  = Pedido − Declarado    → fornecedor deve NF
 *   A confirmar = Declarado − Confirmado → XPM deve conferência
 * As palavras "A entregar", "A receber" e "Furo" não existem mais neste módulo.
 */

/** Estado do selo por dono da pendência (vem pronto da view, em `quem_deve`). */
export const ESTADO_QUEM_DEVE: Record<string, "success" | "warning" | "destructive" | "info"> = {
  "fornecedor deve NF": "warning",
  "XPM deve confirmacao": "info",
  "divergencia no recebimento": "destructive",
  "ciclo completo": "success",
};

export const ROTULO_QUEM_DEVE: Record<string, string> = {
  "fornecedor deve NF": "Fornecedor deve NF",
  "XPM deve confirmacao": "Aguarda recebimento",
  "divergencia no recebimento": "Divergência no recebimento",
  "ciclo completo": "Ciclo completo",
};

export function rotuloQuemDeve(v: string | null | undefined): string {
  if (!v) return "—";
  return ROTULO_QUEM_DEVE[v] ?? v;
}

interface TresCamadasPedido {
  pedido_id: number;
  numero_pedido: string | null;
  modalidade: string | null;
  data_pedido: string | null;
  prazo_entrega_acordado: string | null;
  pedida: number | null;
  declarada_nf: number | null;
  confirmada_xpm: number | null;
  qtd_conferida?: number | null;
  recebido_por_centro?: CentroRecebimento[];
  a_faturar: number | null;
  a_confirmar: number | null;
  aguarda_recebimento: number | null;
  falta_xpm: number | null;
  excesso_xpm: number | null;
  nao_conforme_xpm: number | null;
  pct_faturado: number | null;
  pct_confirmado: number | null;
  valor_a_faturar_acordado: number | null;
  valor_a_faturar_vigente: number | null;
  skus_custo_incompleto: number | null;
  dias_atraso: number | null;
  quem_deve: string | null;
}

interface TresCamadasSku {
  pedido_id: number;
  sku: string | null;
  pedida: number | null;
  declarada_nf: number | null;
  confirmada_xpm: number | null;
  qtd_conferida?: number | null;
  recebido_por_centro?: CentroRecebimento[];
  a_faturar: number | null;
  a_confirmar: number | null;
  aguarda_recebimento: number | null;
  falta_xpm: number | null;
  excesso_xpm: number | null;
  nao_conforme_xpm: number | null;
  quem_deve: string | null;
  estados: string[] | null;
  ultimo_termo: string | null;
  nome_comercial?: string | null;
  cod_cadastro?: string | null;
}

const ORDEM_ESTADOS = ["fornecedor deve NF", "XPM deve confirmacao", "divergencia no recebimento"];

/** SKU conta em CADA estado do array; array vazio = ciclo completo. */
function temEstado(l: TresCamadasSku, chave: string): boolean {
  const est = l.estados ?? [];
  return chave === "ciclo completo" ? est.length === 0 : est.includes(chave);
}

const NUM = new Intl.NumberFormat("pt-BR");
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface CentroRecebimento {
  centro_codigo: string;
  centro_nome: string;
  qtd: number;
}

function ValorRecebido({ valor, centros }: { valor: number | null | undefined; centros?: CentroRecebimento[] }) {
  const texto = fmtQtd(valor);
  if (!centros?.length) return <>{texto}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-2">{texto}</span>
      </TooltipTrigger>
      <TooltipPrimitive.Portal>
        <TooltipContent className="space-y-2">
          {centros.map((centro) => (
            <div key={centro.centro_codigo}>
              <div>{centro.centro_codigo} · {fmtQtd(centro.qtd)}</div>
              <div className="text-xs text-muted-foreground">{centro.centro_nome}</div>
            </div>
          ))}
        </TooltipContent>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}

function fmtQtd(v: number | null | undefined): string {
  if (v == null) return "—";
  return NUM.format(Number(v));
}

function fmtPct(v: number | null | undefined): string | null {
  if (v == null) return null;
  return `${NUM.format(Number(v))}% faturado`;
}

function fmtData(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(`${v.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}

export default function SaldoPedidoTab({ pedidoId }: { pedidoId: number }) {
  const [busca, setBusca] = useState("");
  const [quemDeve, setQuemDeve] = useState<string>("todos");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);

  const resumoQ = useQuery({
    queryKey: ["compra-tres-camadas-pedido", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_compra_tres_camadas_pedido")
        .select(
          "pedido_id, numero_pedido, modalidade, data_pedido, prazo_entrega_acordado, pedida, declarada_nf, confirmada_xpm, a_faturar, a_confirmar, aguarda_recebimento, falta_xpm, excesso_xpm, nao_conforme_xpm, pct_faturado, pct_confirmado, valor_a_faturar_acordado, valor_a_faturar_vigente, skus_custo_incompleto, dias_atraso, quem_deve",
        )
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: saldo, error: erroSaldo } = await (supabase as any)
        .from("vw_importacao_saldo_pedido")
        .select("qtd_conferida, recebido_por_centro")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (erroSaldo) throw erroSaldo;
      return { ...data, qtd_conferida: saldo?.qtd_conferida, recebido_por_centro: saldo?.recebido_por_centro ?? [] } as TresCamadasPedido;
    },
  });

  const divergenciaQ = useQuery({
    queryKey: ["recebimento-divergencia", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_recebimento_divergencia")
        .select(
          "nf_numero, nf_data_emissao, termos, data_termo, sku, qtd_nf, qtd_recebida, qtd_falta, qtd_excesso, qtd_nao_conforme, preco_unit_nf, valor_falta, valor_nao_conforme, classificacao, em_aberto, fornecedor, numero_pedido",
        )
        .eq("pedido_id", pedidoId)
        .order("nf_numero")
        .order("sku");
      if (error) throw error;
      return (data ?? []) as LinhaDivergencia[];
    },
  });

  const liquidoQ = useQuery({
    queryKey: ["recebimento-liquido-sku", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_recebimento_liquido_sku")
        .select(
          "numero_pedido, fornecedor, sku, cod_cadastro, nome_comercial, nfs, qtd_nf, qtd_recebida, qtd_recebida_sem_nf, qtd_nao_conforme, falta_liquida, excesso_liquido, preco_unit_nf, valor_falta_liquida, valor_nao_conforme, ocorrencias_abertas, situacao",
        )
        .eq("pedido_id", pedidoId)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as LinhaLiquida[];
    },
  });

  const baixarDivergencia = async () => {
    try {
      const linhas = divergenciaQ.data ?? [];
      const skus = Array.from(new Set(linhas.map((l) => l.sku).filter(Boolean))) as string[];
      const prods = new Map<string, { nome_comercial: string | null; cod_cadastro: string | null }>();
      if (skus.length) {
        const { data, error } = await (supabase as any)
          .from("sncf_produtos")
          .select("sku, nome_comercial, cod_cadastro")
          .in("sku", skus);
        if (error) throw error;
        for (const p of data ?? []) prods.set(p.sku, { nome_comercial: p.nome_comercial, cod_cadastro: p.cod_cadastro });
      }
      baixarRelatorioDivergencia(
        liquidoQ.data ?? [],
        linhas.map((l) => ({
          ...l,
          nome_comercial: l.sku ? prods.get(l.sku)?.nome_comercial ?? null : null,
          cod_cadastro: l.sku ? prods.get(l.sku)?.cod_cadastro ?? null : null,
        })),
      );
    } catch (e) {
      toast.error(`Não foi possível gerar o relatório: ${formatError(e)}`);
    }
  };
  const haDivergencia = (liquidoQ.data ?? []).some(temDivergenciaLiquida);

  const skusQ = useQuery({
    queryKey: ["compra-tres-camadas-sku", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_compra_tres_camadas")
        .select(
          "pedido_id, sku, pedida, declarada_nf, confirmada_xpm, a_faturar, a_confirmar, aguarda_recebimento, estados, falta_xpm, excesso_xpm, nao_conforme_xpm, quem_deve, ultimo_termo",
        )
        .eq("pedido_id", pedidoId);
      if (error) throw error;
      const linhas = (data ?? []) as TresCamadasSku[];

      const { data: saldos, error: erroSaldos } = await (supabase as any)
        .from("vw_importacao_saldo_sku")
        .select("sku, qtd_conferida, recebido_por_centro")
        .eq("pedido_id", pedidoId);
      if (erroSaldos) throw erroSaldos;
      const saldoPorSku = new Map<string, { qtd_conferida: number | null; recebido_por_centro: CentroRecebimento[] }>(
        ((saldos ?? []) as Array<{ sku: string; qtd_conferida: number | null; recebido_por_centro: CentroRecebimento[] | null }>).map((s) => [s.sku, {
          qtd_conferida: s.qtd_conferida,
          recebido_por_centro: s.recebido_por_centro ?? [],
        }]),
      );

      // A view não traz nome do produto — vem de sncf_produtos, como nas outras telas.
      const skus = Array.from(new Set(linhas.map((l) => l.sku).filter(Boolean))) as string[];
      const produtos = new Map<string, { nome_comercial: string | null; cod_cadastro: string | null }>();
      if (skus.length) {
        const { data: prods, error: errProd } = await (supabase as any)
          .from("sncf_produtos")
          .select("sku, nome_comercial, cod_cadastro")
          .in("sku", skus);
        if (errProd) throw errProd;
        for (const p of (prods ?? []) as Array<{
          sku: string;
          nome_comercial: string | null;
          cod_cadastro: string | null;
        }>) {
          produtos.set(p.sku, {
            nome_comercial: p.nome_comercial,
            cod_cadastro: p.cod_cadastro,
          });
        }
      }
      return linhas.map((l) => ({
        ...l,
        qtd_conferida: l.sku ? saldoPorSku.get(l.sku)?.qtd_conferida : null,
        recebido_por_centro: l.sku ? saldoPorSku.get(l.sku)?.recebido_por_centro ?? [] : [],
        nome_comercial: l.sku ? produtos.get(l.sku)?.nome_comercial ?? null : null,
        cod_cadastro: l.sku ? produtos.get(l.sku)?.cod_cadastro ?? null : null,
      }));
    },
  });

  const todas = skusQ.data ?? [];

  const opcoesQuemDeve = useMemo(() => {
    const explicacoes: Record<string, string> = {
      "fornecedor deve NF": "O pedido tem mais do que já veio em NF.",
      "XPM deve confirmacao": "Veio em NF, mas a mercadoria ainda não deu entrada no estoque.",
      "divergencia no recebimento": "A XPM conferiu e achou falta, excesso ou não conforme.",
      "ciclo completo": "Tudo o que veio em NF foi conferido sem divergência.",
    };
    return Object.keys(ROTULO_QUEM_DEVE).map((chave) => ({
      chave,
      rotulo: ROTULO_QUEM_DEVE[chave],
      explicacao: explicacoes[chave],
      total: todas.filter((l) => temEstado(l, chave)).length,
    }));
  }, [todas]);

  const ordenadas = useMemo(() => {
    return [...todas].sort((a, b) => {
      const r = Number(b.a_faturar ?? 0) - Number(a.a_faturar ?? 0);
      if (r !== 0) return r;
      return Number(b.aguarda_recebimento ?? 0) - Number(a.aguarda_recebimento ?? 0);
    });
  }, [todas]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return ordenadas.filter((l) => {
      if (quemDeve !== "todos" && !temEstado(l, quemDeve)) return false;
      if (!t) return true;
      return (
        (l.cod_cadastro ?? "").toLowerCase().includes(t) ||
        (l.sku ?? "").toLowerCase().includes(t) ||
        (l.nome_comercial ?? "").toLowerCase().includes(t)
      );
    });
  }, [ordenadas, busca, quemDeve]);

  useEffect(() => {
    setPagina(1);
  }, [busca, quemDeve, tamanho]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / tamanho));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const linhasPagina = filtradas.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);

  const resumo = resumoQ.data;
  const aFaturar = Number(resumo?.a_faturar ?? 0);
  const aguarda = Number(resumo?.aguarda_recebimento ?? 0);
  const faltaR = Number(resumo?.falta_xpm ?? 0);
  const divergencia = faltaR + Number(resumo?.nao_conforme_xpm ?? 0);
  const diasAtraso = Number(resumo?.dias_atraso ?? 0);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            {resumoQ.isError ? (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{formatError(resumoQ.error)}</p>
                <Button size="sm" variant="outline" onClick={() => resumoQ.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            ) : !resumo ? (
              <p className="text-sm text-muted-foreground">
                {resumoQ.isLoading ? "Carregando resumo…" : "Sem resumo de saldo para este pedido."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                  <div>
                    <div className="text-[11px] text-muted-foreground">Quem deve</div>
                    <div className="mt-0.5">
                      <Selo estado={ESTADO_QUEM_DEVE[resumo.quem_deve ?? ""] ?? "muted"}>
                        {rotuloQuemDeve(resumo.quem_deve)}
                      </Selo>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={!haDivergencia}
                    title={
                      haDivergencia
                        ? "Baixar planilha com o que foi faturado em NF e não chegou"
                        : "Sem falta, excesso ou não conforme neste pedido"
                    }
                    onClick={baixarDivergencia}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Relatório de divergência
                  </Button>
                </div>

                {diasAtraso > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-warning">
                      Entrega acordada para {fmtData(resumo.prazo_entrega_acordado)} —{" "}
                      {NUM.format(diasAtraso)} {diasAtraso === 1 ? "dia" : "dias"} de atraso · saldo
                      de {BRL.format(Number(resumo.valor_a_faturar_acordado ?? 0))}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <CardIndicador compacto rotulo="Pedido" valor={fmtQtd(resumo.pedida)} />
                  <CardIndicador
                    compacto
                    rotulo="Declarado (NF)"
                    valor={fmtQtd(resumo.declarada_nf)}
                    nota={fmtPct(resumo.pct_faturado)}
                  />
                  <CardIndicador
                    compacto
                    rotulo="Recebido"
                    valor={<ValorRecebido valor={resumo.qtd_conferida ?? resumo.confirmada_xpm} centros={resumo.recebido_por_centro} />}
                    nota={
                      resumo.pct_confirmado == null
                        ? null
                        : `${NUM.format(Number(resumo.pct_confirmado))}% recebido`
                    }
                  />
                  <CardIndicador
                    compacto
                    rotulo="A faturar"
                    valor={fmtQtd(resumo.a_faturar)}
                    nota="fornecedor deve NF"
                    tom={aFaturar > 0 ? "atencao" : "neutro"}
                  />
                  <CardIndicador
                    compacto
                    rotulo="Aguarda recebimento"
                    valor={fmtQtd(resumo.aguarda_recebimento)}
                    nota="NF ainda sem entrada no estoque"
                    tom={aguarda > 0 ? "atencao" : "neutro"}
                  />
                  <CardIndicador
                    compacto
                    rotulo="Divergência"
                    valor={fmtQtd(divergencia)}
                    nota={`falta ${fmtQtd(faltaR)} · excesso ${fmtQtd(resumo.excesso_xpm)}`}
                    tom={divergencia > 0 ? "atencao" : "neutro"}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <TabelaFetely
          busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar por código ou produto…" }}
          filtros={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={quemDeve === "todos" ? "secondary" : "ghost"}
                onClick={() => setQuemDeve("todos")}
                disabled={todas.length === 0}
                className={cn(todas.length === 0 && "text-muted-foreground")}
              >
                Todos · {todas.length}
              </Button>
              {opcoesQuemDeve.map((opcao) => (
                <Button
                  key={opcao.chave}
                  size="sm"
                  variant={quemDeve === opcao.chave ? "secondary" : "ghost"}
                  onClick={() => setQuemDeve(opcao.chave)}
                  disabled={opcao.total === 0}
                  className={cn(opcao.total === 0 && "text-muted-foreground")}
                  title={opcao.explicacao}
                >
                  {opcao.rotulo} · {opcao.total}
                </Button>
              ))}
            </div>
          }
          carregando={skusQ.isLoading}
          erro={skusQ.isError ? formatError(skusQ.error) : null}
          aoTentarNovamente={() => skusQ.refetch()}
          vazio={{
            mensagem:
              "Nenhum SKU com saldo apurado. Vincule uma NF a este pedido para o saldo por SKU aparecer aqui.",
          }}
          semResultado="Nenhum SKU para esse filtro."
          total={todas.length}
          exibidos={filtradas.length}
          rotulo="SKUs"
        >
          <>
            <div className="overflow-auto max-h-[calc(100vh-18rem)] rounded-md border">
              <Table containerClassName="overflow-visible">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Cód. cadastro</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Pedido</TableHead>
                  <TableHead className="text-right">Declarado (NF)</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="bg-muted text-right">A faturar</TableHead>
                  <TableHead className="bg-muted text-right">Aguarda recebimento</TableHead>
                  <TableHead className="text-right">Falta</TableHead>
                  <TableHead className="text-right">Excesso</TableHead>
                  <TableHead className="text-right">Não conforme</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasPagina.map((l, i) => {
                  const atencao =
                    Number(l.nao_conforme_xpm ?? 0) > 0 || Number(l.excesso_xpm ?? 0) > 0;
                  const linhaAFaturar = Number(l.a_faturar ?? 0);
                  const linhaAguarda = Number(l.aguarda_recebimento ?? 0);
                  return (
                    <TableRow
                      key={`${l.sku ?? "sem-sku"}-${i}`}
                      className={cn(atencao && "bg-warning/10")}
                    >
                      <TableCell>
                        {l.cod_cadastro ? (
                          <>
                            <div className="font-mono text-xs">{l.cod_cadastro}</div>
                            <div className="text-xs text-muted-foreground">{l.sku ?? "—"}</div>
                          </>
                        ) : (
                          <span className="font-mono text-xs">{l.sku ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>{l.nome_comercial ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtQtd(l.pedida)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtQtd(l.declarada_nf)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <ValorRecebido valor={l.qtd_conferida ?? l.confirmada_xpm} centros={l.recebido_por_centro} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          "bg-muted/50 text-right tabular-nums font-medium",
                          linhaAFaturar > 0 && "text-warning",
                        )}
                      >
                        {fmtQtd(l.a_faturar)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "bg-muted/50 text-right tabular-nums font-medium",
                          linhaAguarda > 0 && "text-warning",
                        )}
                      >
                        {fmtQtd(l.aguarda_recebimento)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtQtd(l.falta_xpm)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtQtd(l.excesso_xpm)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtQtd(l.nao_conforme_xpm)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(l.estados ?? []).length === 0 ? (
                            <Selo estado="success">{ROTULO_QUEM_DEVE["ciclo completo"]}</Selo>
                          ) : (
                            ORDEM_ESTADOS.filter((e) => (l.estados ?? []).includes(e)).map((e) => (
                              <Selo key={e} estado={ESTADO_QUEM_DEVE[e] ?? "muted"}>
                                {rotuloQuemDeve(e)}
                              </Selo>
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              </Table>
            </div>
            <RodapePaginacao
              total={filtradas.length}
              pagina={paginaAtual}
              tamanhoPagina={tamanho}
              tela="pedido_saldo"
              onPagina={setPagina}
              onTamanhoPagina={(n) => setTamanho(n as PageSizeOption)}
            />
          </>
        </TabelaFetely>
      </div>
    </TooltipProvider>
  );
}
