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

import { TabelaFetely } from "@/components/ui/tabela-fetely";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const ROTULO_SITUACAO_SALDO: Record<string, string> = {
  sem_nf: "Sem NF",
  faturado_nao_conferido: "Faturado, não conferido",
  conferido_parcial: "Conferido parcial",
  conferido_total: "Conferido",
  recebido_sem_nf: "Recebido sem NF",
};

export const ROTULO_FASE_CALCULADA: Record<string, string> = {
  sem_nf: "Sem NF",
  nf_parcial: "NF parcial",
  faturado_nao_conferido: "Faturado, não conferido",
  conferido_parcial: "Conferido parcial",
  conferido_total: "Conferido",
};

export function rotuloFaseCalculada(v: string | null | undefined): string {
  if (!v) return "—";
  return ROTULO_FASE_CALCULADA[v] ?? v;
}

interface SaldoPedido {
  pedido_id: number;
  numero_pedido: string | null;
  status_declarado: string | null;
  fase_calculada: string | null;
  divergencia_status: string | null;
  qtd_pedida: number | null;
  qtd_nf: number | null;
  qtd_conferida: number | null;
  saldo_a_faturar: number | null;
  saldo_a_receber: number | null;
}

interface SaldoSku {
  pedido_id: number;
  sku: string | null;
  nome_comercial: string | null;
  qtd_pedida: number | null;
  qtd_nf: number | null;
  qtd_conferida: number | null;
  qtd_avarias: number | null;
  qtd_falta: number | null;
  saldo_a_faturar: number | null;
  saldo_a_receber: number | null;
  custo_unitario_nf: number | null;
  situacao: string | null;
  alerta_faturado_sem_conferencia: boolean | null;
  alerta_sem_custo_real: boolean | null;
}

const NUM = new Intl.NumberFormat("pt-BR");

function fmtQtd(v: number | null | undefined): string {
  if (v == null) return "—";
  return NUM.format(Number(v));
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <CardIndicador compacto rotulo={rotulo} valor={valor} />;
}


export default function SaldoPedidoTab({ pedidoId }: { pedidoId: number }) {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<string>("todos");

  const resumoQ = useQuery({
    queryKey: ["importacao-saldo-pedido", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_saldo_pedido")
        .select(
          "pedido_id, numero_pedido, status_declarado, fase_calculada, divergencia_status, qtd_pedida, qtd_nf, qtd_conferida, saldo_a_faturar, saldo_a_receber",
        )
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SaldoPedido | null;
    },
  });

  const skusQ = useQuery({
    queryKey: ["importacao-saldo-sku", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_saldo_sku")
        .select(
          "pedido_id, sku, nome_comercial, qtd_pedida, qtd_nf, qtd_conferida, qtd_avarias, qtd_falta, saldo_a_faturar, saldo_a_receber, custo_unitario_nf, situacao, alerta_faturado_sem_conferencia, alerta_sem_custo_real",
        )
        .eq("pedido_id", pedidoId);
      if (error) throw error;
      return (data ?? []) as SaldoSku[];
    },
  });

  const todas = skusQ.data ?? [];

  const situacoes = useMemo(() => {
    const set = new Set<string>();
    todas.forEach((l) => l.situacao && set.add(l.situacao));
    return Array.from(set);
  }, [todas]);

  const ordenadas = useMemo(() => {
    return [...todas].sort((a, b) => {
      const r = Number(b.saldo_a_receber ?? 0) - Number(a.saldo_a_receber ?? 0);
      if (r !== 0) return r;
      return Number(b.saldo_a_faturar ?? 0) - Number(a.saldo_a_faturar ?? 0);
    });
  }, [todas]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return ordenadas.filter((l) => {
      if (situacao !== "todos" && l.situacao !== situacao) return false;
      if (!t) return true;
      return (
        (l.sku ?? "").toLowerCase().includes(t) ||
        (l.nome_comercial ?? "").toLowerCase().includes(t)
      );
    });
  }, [ordenadas, busca, situacao]);

  const resumo = resumoQ.data;

  return (
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
                  <div className="text-[11px] text-muted-foreground">Fase declarada</div>
                  <div className="mt-0.5 text-sm">{resumo.status_declarado ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Fase calculada</div>
                  <div className="mt-0.5">
                    <Selo estado="info">{rotuloFaseCalculada(resumo.fase_calculada)}</Selo>
                  </div>
                </div>
              </div>

              {resumo.divergencia_status && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <p className="text-sm text-warning">{resumo.divergencia_status}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Numero rotulo="Pedida" valor={fmtQtd(resumo.qtd_pedida)} />
                <Numero rotulo="Na NF" valor={fmtQtd(resumo.qtd_nf)} />
                <Numero rotulo="Conferida" valor={fmtQtd(resumo.qtd_conferida)} />
                <Numero rotulo="A faturar" valor={fmtQtd(resumo.saldo_a_faturar)} />
                <Numero rotulo="A receber" valor={fmtQtd(resumo.saldo_a_receber)} />
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
              variant={situacao === "todos" ? "secondary" : "ghost"}
              onClick={() => setSituacao("todos")}
            >
              Todos
            </Button>
            {situacoes.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={situacao === s ? "secondary" : "ghost"}
                onClick={() => setSituacao(s)}
              >
                {ROTULO_SITUACAO_SALDO[s] ?? s}
              </Button>
            ))}
          </div>
        }
        carregando={skusQ.isLoading}
        erro={skusQ.isError ? formatError(skusQ.error) : null}
        aoTentarNovamente={() => skusQ.refetch()}
        vazio={{ mensagem: "Nenhum SKU com saldo apurado neste pedido." }}
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
                <TableHead className="text-right">Pedida</TableHead>
                <TableHead className="text-right">Na NF</TableHead>
                <TableHead className="text-right">Conferida</TableHead>
                <TableHead className="text-right">Avarias</TableHead>
                <TableHead className="text-right">Falta</TableHead>
                <TableHead className="text-right">A faturar</TableHead>
                <TableHead className="text-right">A receber</TableHead>
                <TableHead className="text-right">Custo un.</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l, i) => {
                const atencao =
                  !!l.alerta_faturado_sem_conferencia || !!l.alerta_sem_custo_real;
                return (
                  <TableRow key={`${l.sku ?? "sem-sku"}-${i}`} className={cn(atencao && "bg-warning/10")}>
                    <TableCell className="font-medium">{l.sku ?? "—"}</TableCell>
                    <TableCell>
                      <div>{l.nome_comercial ?? "—"}</div>
                      {atencao && (
                        <div className="text-[11px] text-warning">
                          {l.alerta_faturado_sem_conferencia
                            ? "Faturado sem conferência"
                            : "Sem custo real"}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQtd(l.qtd_pedida)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQtd(l.qtd_nf)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQtd(l.qtd_conferida)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQtd(l.qtd_avarias)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQtd(l.qtd_falta)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQtd(l.saldo_a_faturar)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQtd(l.saldo_a_receber)}</TableCell>
                    <CelulaDinheiro valor={l.custo_unitario_nf} indisponivel={l.custo_unitario_nf == null} />
                    <TableCell>
                      {l.situacao ? (
                        <span className="text-sm text-muted-foreground">
                          {ROTULO_SITUACAO_SALDO[l.situacao] ?? l.situacao}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </TabelaFetely>
    </div>
  );
}
