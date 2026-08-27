import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Selo } from "@/components/ui/selo";
import { CelulaDinheiro } from "@/components/ui/celula-dinheiro";
import { CardIndicador } from "@/components/ui/card-indicador";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
 *   Pedido → Declarado (NF) → Confirmado (XPM)
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
  "XPM deve confirmacao": "XPM deve confirmação",
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
  a_faturar: number | null;
  a_confirmar: number | null;
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
  a_faturar: number | null;
  a_confirmar: number | null;
  falta_xpm: number | null;
  excesso_xpm: number | null;
  nao_conforme_xpm: number | null;
  valor_nf: number | null;
  custo_medio_nf: number | null;
  custo_acordado: number | null;
  custo_vigente: number | null;
  custo_reposicao: number | null;
  custo_incompleto: boolean | null;
  quem_deve: string | null;
  ultimo_termo: string | null;
  nome_comercial?: string | null;
}

const NUM = new Intl.NumberFormat("pt-BR");
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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

  const resumoQ = useQuery({
    queryKey: ["compra-tres-camadas-pedido", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_compra_tres_camadas_pedido")
        .select(
          "pedido_id, numero_pedido, modalidade, data_pedido, prazo_entrega_acordado, pedida, declarada_nf, confirmada_xpm, a_faturar, a_confirmar, falta_xpm, excesso_xpm, nao_conforme_xpm, pct_faturado, pct_confirmado, valor_a_faturar_acordado, valor_a_faturar_vigente, skus_custo_incompleto, dias_atraso, quem_deve",
        )
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TresCamadasPedido | null;
    },
  });

  const skusQ = useQuery({
    queryKey: ["compra-tres-camadas-sku", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_compra_tres_camadas")
        .select(
          "pedido_id, sku, pedida, declarada_nf, confirmada_xpm, a_faturar, a_confirmar, falta_xpm, excesso_xpm, nao_conforme_xpm, valor_nf, custo_medio_nf, custo_acordado, custo_vigente, custo_reposicao, custo_incompleto, quem_deve, ultimo_termo",
        )
        .eq("pedido_id", pedidoId);
      if (error) throw error;
      const linhas = (data ?? []) as TresCamadasSku[];

      // A view não traz nome do produto — vem de sncf_produtos, como nas outras telas.
      const skus = Array.from(new Set(linhas.map((l) => l.sku).filter(Boolean))) as string[];
      const nomes = new Map<string, string>();
      if (skus.length) {
        const { data: prods, error: errProd } = await (supabase as any)
          .from("sncf_produtos")
          .select("sku, nome_comercial")
          .in("sku", skus);
        if (errProd) throw errProd;
        for (const p of (prods ?? []) as Array<{ sku: string; nome_comercial: string | null }>) {
          if (p.nome_comercial) nomes.set(p.sku, p.nome_comercial);
        }
      }
      return linhas.map((l) => ({
        ...l,
        nome_comercial: l.sku ? nomes.get(l.sku) ?? null : null,
      }));
    },
  });

  const todas = skusQ.data ?? [];

  const donos = useMemo(() => {
    const set = new Set<string>();
    todas.forEach((l) => l.quem_deve && set.add(l.quem_deve));
    return Array.from(set);
  }, [todas]);

  const ordenadas = useMemo(() => {
    return [...todas].sort((a, b) => {
      const r = Number(b.a_faturar ?? 0) - Number(a.a_faturar ?? 0);
      if (r !== 0) return r;
      return Number(b.a_confirmar ?? 0) - Number(a.a_confirmar ?? 0);
    });
  }, [todas]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return ordenadas.filter((l) => {
      if (quemDeve !== "todos" && l.quem_deve !== quemDeve) return false;
      if (!t) return true;
      return (
        (l.sku ?? "").toLowerCase().includes(t) ||
        (l.nome_comercial ?? "").toLowerCase().includes(t)
      );
    });
  }, [ordenadas, busca, quemDeve]);

  const resumo = resumoQ.data;
  const aFaturar = Number(resumo?.a_faturar ?? 0);
  const aConfirmar = Number(resumo?.a_confirmar ?? 0);
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
                    rotulo="Confirmado (XPM)"
                    valor={fmtQtd(resumo.confirmada_xpm)}
                    nota={
                      resumo.pct_confirmado == null
                        ? null
                        : `${NUM.format(Number(resumo.pct_confirmado))}% confirmado`
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
                    rotulo="A confirmar"
                    valor={fmtQtd(resumo.a_confirmar)}
                    nota="XPM deve conferência"
                    tom={aConfirmar > 0 ? "atencao" : "neutro"}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <TabelaFetely
          busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar SKU ou produto…" }}
          filtros={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={quemDeve === "todos" ? "secondary" : "ghost"}
                onClick={() => setQuemDeve("todos")}
              >
                Todos
              </Button>
              {donos.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={quemDeve === d ? "secondary" : "ghost"}
                  onClick={() => setQuemDeve(d)}
                >
                  {rotuloQuemDeve(d)}
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
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Pedido</TableHead>
                  <TableHead className="text-right">Declarado (NF)</TableHead>
                  <TableHead className="text-right">Confirmado (XPM)</TableHead>
                  <TableHead className="bg-muted/50 text-right">A faturar</TableHead>
                  <TableHead className="bg-muted/50 text-right">A confirmar</TableHead>
                  <TableHead className="text-right">Falta</TableHead>
                  <TableHead className="text-right">Excesso</TableHead>
                  <TableHead className="text-right">Não conforme</TableHead>
                  <TableHead className="text-right">Custo acordado</TableHead>
                  <TableHead className="text-right">Custo reposição</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((l, i) => {
                  const atencao =
                    Number(l.nao_conforme_xpm ?? 0) > 0 || Number(l.excesso_xpm ?? 0) > 0;
                  const linhaAFaturar = Number(l.a_faturar ?? 0);
                  const linhaAConfirmar = Number(l.a_confirmar ?? 0);
                  return (
                    <TableRow
                      key={`${l.sku ?? "sem-sku"}-${i}`}
                      className={cn(atencao && "bg-warning/10")}
                    >
                      <TableCell className="font-medium">{l.sku ?? "—"}</TableCell>
                      <TableCell>{l.nome_comercial ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtQtd(l.pedida)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtQtd(l.declarada_nf)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtQtd(l.confirmada_xpm)}
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
                          linhaAConfirmar > 0 && "text-warning",
                        )}
                      >
                        {fmtQtd(l.a_confirmar)}
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
                      <CelulaDinheiro
                        valor={l.custo_acordado}
                        indisponivel={l.custo_acordado == null}
                      />
                      <TableCell className="text-right tabular-nums">
                        <div className="flex flex-col items-end gap-0.5">
                          <span>
                            {l.custo_reposicao == null
                              ? "—"
                              : BRL.format(Number(l.custo_reposicao))}
                          </span>
                          {l.custo_incompleto && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Selo estado="warning">custo incompleto</Selo>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                frete de entrada pendente de apuração
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Selo estado={ESTADO_QUEM_DEVE[l.quem_deve ?? ""] ?? "muted"}>
                          {rotuloQuemDeve(l.quem_deve)}
                        </Selo>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabelaFetely>
      </div>
    </TooltipProvider>
  );
}
