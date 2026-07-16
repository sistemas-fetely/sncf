import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDownToLine, Inbox, CheckCircle2, ChevronDown, ChevronRight, AlertTriangle, RefreshCw } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { toast } from "sonner";

type Credito = {
  id: string;
  data_transacao: string;
  descricao: string | null;
  valor: number;
  conta_bancaria_id: string | null;
};

type Sugestao = {
  titulo_id: string;
  numero_titulo: string | null;
  cliente: string | null;
  valor_atual: number;
  data_vencimento_atual: string | null;
  status: string;
  diff_valor: number;
  dias_distancia: number;
};

type StatusGrupo = "a_receber" | "vencido" | "pago" | "cancelado";

const GRUPO_DE_STATUS: Record<string, StatusGrupo> = {
  aguardando_pagamento: "a_receber",
  aguardando_envio_bling: "a_receber",
  aguardando_emissao_nf: "a_receber",
  vigente: "a_receber",
  vigente_parcial: "a_receber",
  renegociado: "a_receber",
  vencido: "vencido",
  vencido_suspenso: "vencido",
  em_juridico: "vencido",
  pago: "pago",
  pago_com_atraso: "pago",
  pago_judicial: "pago",
  cancelado: "cancelado",
  cancelado_recuperacao: "cancelado",
  baixado_por_perda: "cancelado",
};

const GRUPO_LABEL: Record<StatusGrupo, string> = {
  a_receber: "A receber",
  vencido: "Vencido",
  pago: "Pago",
  cancelado: "Cancelado",
};

const GRUPO_BADGE: Record<StatusGrupo, string> = {
  a_receber: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  vencido: "bg-red-100 text-red-800 hover:bg-red-100",
  pago: "bg-green-100 text-green-800 hover:bg-green-100",
  cancelado: "bg-gray-100 text-gray-700 hover:bg-gray-100",
};

const QUERY_KEY = ["recebimentos-conciliar-creditos"];

export default function RecebimentosConciliar() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [baixandoTitulo, setBaixandoTitulo] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_bancarias")
        .select("id, data_transacao, descricao, valor, conta_bancaria_id")
        .eq("tipo", "credito")
        .eq("conciliado", false)
        .order("data_transacao", { ascending: false });
      if (error) throw error;
      return (data || []) as Credito[];
    },
  });

  const creditos = data || [];
  const totalValor = creditos.reduce((s, c) => s + Number(c.valor || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ArrowDownToLine className="h-6 w-6 text-admin" />
          Recebimentos a conciliar
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Créditos do extrato bancário ainda não vinculados a um título a receber.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Créditos não conciliados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{creditos.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Soma dos créditos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatBRL(totalValor)}</div>
          </CardContent>
        </Card>
      </div>

      <DivergenciasCobrancaSection />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Não foi possível carregar os créditos. Tente novamente em instantes.
            </div>
          ) : creditos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-admin-muted">
                <Inbox className="h-8 w-8 text-admin" />
              </div>
              <p className="text-lg font-semibold">Nenhum crédito aguardando conciliação.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creditos.map((c) => {
                    const open = expandedId === c.id;
                    return (
                      <RowComCandidatos
                        key={c.id}
                        credito={c}
                        open={open}
                        onToggle={() => setExpandedId(open ? null : c.id)}
                        baixandoTitulo={baixandoTitulo}
                        onDarBaixa={async (titulo) => {
                          setBaixandoTitulo(titulo.titulo_id);
                          try {
                            const { data: result, error } = await supabase.rpc(
                              "baixar_titulo_conciliacao",
                              {
                                p_titulo_id: titulo.titulo_id,
                                p_movimentacao_id: c.id,
                              }
                            );
                            if (error) {
                              toast.error(`Erro ao baixar título: ${error.message}`);
                              return;
                            }
                            const r = result as { ok?: boolean; numero_titulo?: string; error?: string } | null;
                            if (!r || r.ok !== true) {
                              toast.error(
                                `Não foi possível baixar o título: ${r?.error || "resposta inesperada do servidor"}`
                              );
                              return;
                            }
                            toast.success(`Título ${r.numero_titulo || titulo.numero_titulo || ""} baixado`);
                            await qc.invalidateQueries({ queryKey: QUERY_KEY });
                            setExpandedId(null);
                          } catch (e: unknown) {
                            const msg = e instanceof Error ? e.message : "Erro inesperado";
                            toast.error(`Erro ao baixar título: ${msg}`);
                          } finally {
                            setBaixandoTitulo(null);
                          }
                        }}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RowComCandidatos({
  credito,
  open,
  onToggle,
  onDarBaixa,
  baixandoTitulo,
}: {
  credito: Credito;
  open: boolean;
  onToggle: () => void;
  onDarBaixa: (t: Sugestao) => void | Promise<void>;
  baixandoTitulo: string | null;
}) {
  const { data: sugestoes, isLoading } = useQuery({
    queryKey: ["sugerir-titulos", credito.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sugerir_titulos_para_credito", {
        p_movimentacao_id: credito.id,
        p_janela_dias: 7,
      });
      if (error) throw error;
      return (data || []) as Sugestao[];
    },
  });

  return (
    <>
      <TableRow>
        <TableCell>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onToggle}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap">{formatDateBR(credito.data_transacao)}</TableCell>
        <TableCell className="max-w-md truncate">{credito.descricao || "—"}</TableCell>
        <TableCell className="text-right font-mono whitespace-nowrap text-green-700">
          {formatBRL(Number(credito.valor || 0))}
        </TableCell>
        <TableCell className="text-right">
          <Button size="sm" variant={open ? "secondary" : "default"} onClick={onToggle}>
            Conciliar
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/30 p-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !sugestoes || sugestoes.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhum título candidato encontrado na janela de ±7 dias.
              </div>
            ) : (
              <div className="border rounded-md bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº título</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sugestoes.map((s) => {
                      const grupo = GRUPO_DE_STATUS[s.status] ?? null;
                      const exato = Number(s.diff_valor) === 0;
                      return (
                        <TableRow key={s.titulo_id}>
                          <TableCell className="font-mono text-xs">{s.numero_titulo || "—"}</TableCell>
                          <TableCell>{s.cliente || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDateBR(s.data_vencimento_atual)}
                          </TableCell>
                          <TableCell className="text-right font-mono whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {exato && (
                                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  valor exato
                                </Badge>
                              )}
                              {formatBRL(Number(s.valor_atual || 0))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={grupo ? GRUPO_BADGE[grupo] : "bg-muted"}>
                              {grupo ? GRUPO_LABEL[grupo] : s.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              disabled={baixandoTitulo === s.titulo_id}
                              onClick={() => onDarBaixa(s)}
                            >
                              {baixandoTitulo === s.titulo_id ? "Baixando..." : "Dar baixa"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

type Divergencia = {
  dia: string;
  valor_extrato: number;
  soma_sinteticas: number;
  diferenca: number;
  qtd_sinteticas: number;
};

function DivergenciasCobrancaSection() {
  const qc = useQueryClient();
  const [reprocessando, setReprocessando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["cobranca-divergencias"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_divergencias")
        .select("dia, valor_extrato, soma_sinteticas, diferenca, qtd_sinteticas")
        .order("dia", { ascending: false });
      if (error) throw error;
      return (data || []) as Divergencia[];
    },
  });

  const divs = data || [];

  async function handleReprocessar() {
    setReprocessando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: r, error } = await (supabase as any).rpc("fn_casar_sinteticas_extrato");
      if (error) throw error;
      const res = (r || {}) as { linhas_extrato_casadas?: number; sinteticas_casadas?: number };
      toast.success(
        `Casamento reprocessado — ${Number(res.linhas_extrato_casadas || 0)} linhas / ${Number(res.sinteticas_casadas || 0)} boletos`
      );
      await qc.invalidateQueries({ queryKey: ["cobranca-divergencias"] });
    } catch (e) {
      toast.error("Erro no reprocessamento: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReprocessando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Divergências de cobrança (boletos)
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReprocessar}
          disabled={reprocessando}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${reprocessando ? "animate-spin" : ""}`} />
          Reprocessar casamento
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : divs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma divergência — extrato e liquidações batem ✓
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead className="text-right">Valor no extrato</TableHead>
                  <TableHead className="text-right">Soma liquidações</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="text-right">Qtd boletos</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {divs.map((d) => {
                  const diff = Number(d.diferenca || 0);
                  const qtd = Number(d.qtd_sinteticas || 0);
                  const semLiq = qtd === 0 && Number(d.valor_extrato || 0) > 0;
                  return (
                    <TableRow key={d.dia}>
                      <TableCell className="whitespace-nowrap">{formatDateBR(d.dia)}</TableCell>
                      <TableCell className="text-right font-mono">{formatBRL(Number(d.valor_extrato || 0))}</TableCell>
                      <TableCell className="text-right font-mono">{formatBRL(Number(d.soma_sinteticas || 0))}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${diff !== 0 ? "text-red-600" : ""}`}>
                        {formatBRL(diff)}
                      </TableCell>
                      <TableCell className="text-right">{qtd}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {semLiq ? "crédito de cobrança sem liquidações internas — retorno não processado ou era pré-sistema" : ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
