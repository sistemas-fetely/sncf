import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Copy, Search, Sparkles, Loader2, Undo2 } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { RetomarOportunidadeDialog } from "@/components/comercial/RetomarOportunidadeDialog";
import { BadgeLinkFila } from "@/components/pedidos/LinkPagamentoCard";
import { useLinksPagamentoFila } from "@/hooks/pedidos/useLinkPagamentoPedido";
import { PedidoOportunidadeDialog } from "@/components/comercial/PedidoOportunidadeDialog";


type OrigemOportunidade = "portao_vencido" | "estoque_inadimplente" | "manual";

interface OportunidadeRow {
  pedido_id: string;
  id_externo: string | null;
  origem: OrigemOportunidade;
  motivo: string | null;
  justificativa: string | null;
  retomavel_para: string | null;
  migrado_em: string | null;
  dias_na_fila: number | null;
  data_pedido: string | null;
  dias_desde_pedido: number | null;
  valor_em_jogo: number | null;
  vendedor: string | null;
  condicao_solicitada: string | null;
  forma_solicitada: string | null;
  observacao_cliente: string | null;
  pai_id: string | null;
  pai_id_externo: string | null;
  parceiro_id: string | null;
  cliente: string | null;
  apelido: string | null;

  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  portao_id: string | null;
  valor_portao: number | null;
  tipo_portao: string | null;
  vencimento_portao: string | null;
  dias_portao_vencido: number | null;
  link_pagamento: string | null;
  valor_pago: number | null;
  valor_vencido: number | null;
  dias_atraso_max: number | null;
  dias_referencia: number | null;
  situacao_financeira: string | null;
  situacao_rotulo: string | null;
  alerta_operacional: string | null;
  pai_valor_pago: number | null;
  pai_valor_aberto: number | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  eh_primeira_compra: boolean | null;
  cliente_pedidos_faturados: number | null;
  cliente_valor_faturado: number | null;
  cliente_primeira_compra: string | null;
  cliente_ultima_compra: string | null;
  cliente_dias_sem_comprar: number | null;
  cliente_ticket_medio: number | null;
  temperatura: string | null;
  temperatura_score: number | null;
  fase: string | null;
  estagio: string | null;
  portao_linhas: number | null;
}


/** "DD/MM" curto para a linha de histórico do cliente. */
function formatDataCurta(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor + (valor.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}



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

const TEMPERATURA_LABEL: Record<string, string> = {
  quente: "QUENTE",
  morno: "Morno",
  frio: "Frio",
  nao_cobrar: "Não cobrar",
};

const TEMPERATURA_CLASSES: Record<string, string> = {
  quente: "border-destructive/50 text-destructive",
  morno: "border-warning/50 text-warning",
  frio: "border-muted-foreground/40 text-muted-foreground",
  nao_cobrar: "border-muted-foreground/40 text-muted-foreground",
};

type FiltroTemperatura = "todas" | "quente" | "morno" | "frio" | "nao_cobrar";

async function copiar(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Link de pagamento copiado");
  } catch {
    toast.error("Não foi possível copiar o link");
  }
}

export default function Oportunidades({ embutido = false }: { embutido?: boolean } = {}) {
  const [busca, setBusca] = useState("");
  const [temperatura, setTemperatura] = useState<FiltroTemperatura>("todas");

  const [retomando, setRetomando] = useState<OportunidadeRow | null>(null);
  const [detalhe, setDetalhe] = useState<OportunidadeRow | null>(null);
  const navigate = useNavigate();


  const { data = [], isLoading } = useQuery({
    queryKey: ["oportunidades-comercial"],
    queryFn: async (): Promise<OportunidadeRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_oportunidades_comercial")
        .select("*")
        .order("dias_referencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OportunidadeRow[];
    },
  });

  const contagens = useMemo(() => {
    const c = { todas: data.length, quente: 0, morno: 0, frio: 0, nao_cobrar: 0 };
    for (const r of data) {
      const t = r.temperatura ?? "";
      if (t === "quente" || t === "morno" || t === "frio" || t === "nao_cobrar") c[t]++;
    }
    return c;
  }, [data]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let base =
      temperatura === "todas" ? data : data.filter((r) => r.temperatura === temperatura);
    if (q) {
      base = base.filter((r) =>
        [r.id_externo, r.cliente, r.apelido, r.cnpj, r.vendedor]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    // TEMPERATURA-MANDA-NA-ORDEM: faixa primeiro, valor em jogo decrescente dentro dela.
    return [...base].sort((a, b) => {
      const pa = TEMPERATURA_PESO[a.temperatura ?? ""] ?? 99;
      const pb = TEMPERATURA_PESO[b.temperatura ?? ""] ?? 99;
      if (pa !== pb) return pa - pb;
      return Number(b.valor_em_jogo || 0) - Number(a.valor_em_jogo || 0);
    });
  }, [data, busca, temperatura]);


  const { data: linksFila } = useLinksPagamentoFila(data.map((r) => r.pedido_id));

  const kpis = useMemo(() => {
    const qtd = filtradas.length;
    const valor = filtradas.reduce((s, r) => s + Number(r.valor_em_jogo || 0), 0);
    const vencido = filtradas.reduce((s, r) => s + Number(r.valor_vencido || 0), 0);
    const media =
      qtd > 0
        ? filtradas.reduce((s, r) => s + Number(r.dias_referencia || 0), 0) / qtd
        : 0;
    return { qtd, valor, vencido, media };
  }, [filtradas]);

  return (
    <TooltipProvider>
      <div className={embutido ? "space-y-6" : "space-y-6 p-4 md:p-6"}>
        {!embutido && (
          <CasaPageHeader
            breadcrumb={[{ label: "Comercial" }, { label: "Oportunidades" }]}
            title="Oportunidades"
            subtitle="Fila única do Comercial: pedidos migrados manualmente, portão vencido ou remessas cujo pai tem parcela vencida. Retome quando o cliente estiver pronto."
          />
        )}


        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Oportunidades" value={String(kpis.qtd)} />
          <KpiCard label="Valor em jogo" value={formatBRL(kpis.valor)} />
          <KpiCard label="Valor vencido" value={formatBRL(kpis.vencido)} />
          <KpiCard
            label="Média de dias"
            value={kpis.qtd > 0 ? `${kpis.media.toFixed(0)} dias` : "—"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border overflow-hidden">
            <FiltroBtn ativo={temperatura === "todas"} onClick={() => setTemperatura("todas")}>
              Todas ({contagens.todas})
            </FiltroBtn>
            <FiltroBtn
              ativo={temperatura === "quente"}
              onClick={() => setTemperatura("quente")}
            >
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
          <div className="relative w-full md:w-96 md:ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por pedido, cliente, nome fantasia, CNPJ, vendedor…"
              className="pl-8 h-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtradas.length === 0 ? (
              <div className="text-center py-16 px-6">
                <Sparkles className="h-8 w-8 text-muted-foreground/60 mx-auto mb-3" />
                <p className="text-sm font-medium">
                  Nenhuma oportunidade encontrada com os filtros atuais.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ajuste a busca ou o filtro de origem para ver a fila completa.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Temp.</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Valor em jogo</TableHead>
                      <TableHead className="text-right">Tempo</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((r) => (
                      <TableRow key={`${r.origem}-${r.pedido_id}`}>
                        <TableCell className="align-top">
                          {TEMPERATURA_LABEL[r.temperatura ?? ""] && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded px-1.5 py-0 text-[10px]",
                                TEMPERATURA_CLASSES[r.temperatura ?? ""],
                              )}
                              title={`Score ${r.temperatura_score ?? 0}`}
                            >
                              {TEMPERATURA_LABEL[r.temperatura ?? ""]}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs align-top">
                          <button
                            type="button"
                            className="font-mono text-primary underline-offset-2 hover:underline cursor-pointer"
                            onClick={() => setDetalhe(r)}
                          >
                            {r.id_externo || "—"}
                          </button>
                          {r.fase && (
                            <div className="mt-1">
                              <Badge
                                variant="outline"
                                className="rounded px-1.5 py-0 text-[10px]"
                              >
                                {r.fase}
                              </Badge>
                            </div>
                          )}
                          {r.pai_id_externo && (

                            <div className="mt-1">
                              <Badge
                                variant="outline"
                                className="rounded px-1.5 py-0 text-[10px]"
                                title={`Pago no pai: ${formatBRL(r.pai_valor_pago ?? 0)} · Em aberto no pai: ${formatBRL(r.pai_valor_aberto ?? 0)}`}
                              >
                                split de {r.pai_id_externo}
                              </Badge>
                            </div>
                          )}
                          {r.origem === "portao_vencido" && r.vencimento_portao && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              venc. {formatDateBR(r.vencimento_portao)}
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
                            {r.apelido || r.cliente || "—"}
                          </button>
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
                          <div className="text-xs text-muted-foreground truncate">
                            {r.eh_primeira_compra ? (
                              <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                                1ª COMPRA
                              </Badge>
                            ) : (
                              <>
                                {`${r.cliente_pedidos_faturados ?? 0} pedidos · ${formatBRL(r.cliente_valor_faturado ?? 0)}`}
                                {r.cliente_ultima_compra
                                  ? ` · última em ${formatDataCurta(r.cliente_ultima_compra)} (${r.cliente_dias_sem_comprar ?? 0}d)`
                                  : ""}
                              </>
                            )}
                          </div>
                          {r.justificativa?.trim() && (
                            <div
                              title={r.justificativa}
                              className="text-xs text-muted-foreground truncate mt-0.5"
                            >
                              {r.justificativa}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          {formatBRL(r.valor_em_jogo ?? 0)}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="text-sm">{r.dias_desde_pedido ?? 0}d do pedido</div>
                          <div className="text-xs text-muted-foreground">
                            {r.dias_na_fila ?? 0}d na fila
                          </div>
                        </TableCell>
                        <TableCell className="text-xs align-top">{r.vendedor_nome || "—"}</TableCell>

                        <TableCell className="align-middle">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 gap-1.5 w-[110px] justify-center"
                              onClick={() => setRetomando(r)}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Retomar
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title={r.link_pagamento ? "Copiar link de pagamento" : "Sem link de pagamento"}
                              disabled={!r.link_pagamento}
                              onClick={() => r.link_pagamento && copiar(r.link_pagamento)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {retomando && (
          <RetomarOportunidadeDialog
            open={!!retomando}
            onOpenChange={(v) => !v && setRetomando(null)}
            pedidoId={retomando.pedido_id}
            idExterno={retomando.id_externo}
            cliente={retomando.cliente}
            retomavelPara={retomando.retomavel_para}
            invalidateKeys={[["oportunidades-comercial"]]}
          />
        )}

        {detalhe && (
          <PedidoOportunidadeDialog
            open={!!detalhe}
            onOpenChange={(v) => !v && setDetalhe(null)}
            pedidoId={detalhe.pedido_id}
            idExterno={detalhe.id_externo}
            cliente={detalhe.apelido || detalhe.cliente}
            valorEmJogo={detalhe.valor_em_jogo}
            situacaoFinanceira={detalhe.situacao_financeira}
            alertaOperacional={detalhe.alerta_operacional}
            tipoPortao={detalhe.tipo_portao}
            valorPortao={detalhe.valor_portao}
            vencimentoPortao={detalhe.vencimento_portao}
            portaoLinhas={detalhe.portao_linhas}
            linkPagamento={detalhe.link_pagamento}

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
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
