import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import { ListaLotesRetorno } from "@/components/regularizacao/ListaLotesRetorno";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { parseDataPura } from "@/lib/data";
import { Loader2, PackageCheck } from "lucide-react";
import { TransferenciasSemBaixaPainel } from "@/components/estoque/TransferenciasSemBaixaPainel";


interface CentroDestino {
  codigo: string;
  rotulo_curto: string | null;
  nome: string;
}


interface TransferenciaRow {
  id: string;
  id_externo: string | null;
  estagio: string | null;
  destino_interno: string | null;
  observacao_pedido: string | null;
  data_pedido: string | null;
  valor_bruto: number | null;
  qtd_itens: number | null;
  qtd_total_pecas: number | null;
  tipo_transferencia: string | null;
  regularizacao_lote_id: string | null;
  regularizacao_lote_codigo: string | null;
  origem_codigo: string | null;
  destino_codigo: string | null;
  orfao: boolean | null;
  sem_origem: boolean | null;
  sem_destino: boolean | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_situacao: string | null;
  nf_data_emissao: string | null;
  data_entrega_prevista: string | null;
  entregue_em: string | null;
  canal: string | null;
}

/** Tipo da transferência: física, regularização (sem movimento físico) ou com retorno de remessa (lote). */
function SeloTipo({ t }: { t: TransferenciaRow }) {
  if (t.tipo_transferencia === "com_retorno") {
    const rotulo = `Com retorno${t.regularizacao_lote_codigo ? ` · ${t.regularizacao_lote_codigo}` : ""}`;
    return t.regularizacao_lote_id ? (
      <Link to={`/pedidos/transferencias/retorno/${t.regularizacao_lote_id}`} onClick={(e) => e.stopPropagation()} className="inline-flex">
        <Badge variant="outline" className="whitespace-nowrap text-primary">{rotulo}</Badge>
      </Link>
    ) : <Badge variant="outline" className="whitespace-nowrap">{rotulo}</Badge>;
  }
  if (t.tipo_transferencia === "regularizacao") return <Badge variant="secondary" className="whitespace-nowrap" title="Sem movimento físico">Regularização</Badge>;
  if (t.tipo_transferencia === "fisica") return <Badge variant="outline" className="whitespace-nowrap">Física</Badge>;
  return <span className="text-sm text-muted-foreground">—</span>;
}

/** Estágio da transferência: usa o mesmo selo da Casa dos Pedidos quando é
 *  um estágio canônico; fora da esteira, mostra o valor cru sem fingir cor. */
function SeloEstagio({ estagio }: { estagio: string | null }) {
  if (!estagio) return <span className="text-sm text-muted-foreground">—</span>;
  if (estagio in ESTAGIO_LABELS) {
    return <EstagioBadge estagio={estagio as EstagioPedido} />;
  }
  return <Badge variant="outline">{estagio}</Badge>;
}

export default function TransferenciasInternas() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const permRetorno = usePermissoesTela("tela.regularizacao_estoque");
  const [abaUrl, setAba] = useAbaUrl("transferencias");
  // Aba válida: "retorno" só com permissão; qualquer outra → "transferencias".
  const aba = abaUrl === "retorno" && permRetorno.podeVer ? "retorno" : "transferencias";
  // Compatibilidade: link salvo com ?aba=receber vai para a tela própria.
  useEffect(() => {
    if (abaUrl === "receber") navigate("/vendas/produto/estoque/recebimento-centro", { replace: true });
  }, [abaUrl, navigate]);
  const [soOrfaos, setSoOrfaos] = useState(false);
  const semBaixaRef = useRef<HTMLDivElement>(null);

  const listaQ = useQuery({
    queryKey: ["transferencias-internas"],
    queryFn: async (): Promise<TransferenciaRow[]> => {
      const { data, error } = await supabase
        .from("v_transferencias_internas")
        .select(
          "id, id_externo, estagio, destino_interno, observacao_pedido, data_pedido, valor_bruto, qtd_itens, qtd_total_pecas, tipo_transferencia, regularizacao_lote_id, regularizacao_lote_codigo, origem_codigo, destino_codigo, orfao, sem_origem, sem_destino, nf_numero, nf_serie, nf_situacao, nf_data_emissao, nf_chave, data_entrega_prevista, entregue_em, canal"
        )
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransferenciaRow[];
    },
  });
  const nOrfaos = (listaQ.data ?? []).filter((t) => t.orfao === true).length;

  const idsLista = (listaQ.data ?? []).map((t) => t.id);
  const recebQ = useQuery({
    queryKey: ["trs-recebimento", idsLista.join("|")],
    enabled: idsLista.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("trs_recebimento")
        .select("pedido_id, data_recebimento, divergencias")
        .in("pedido_id", idsLista);
      if (error) throw error;
      return (data ?? []) as { pedido_id: string; data_recebimento: string; divergencias: unknown[] | null }[];
    },
  });
  useEffect(() => {
    if (recebQ.isError) toast.error(formatError(recebQ.error));
  }, [recebQ.isError, recebQ.error]);
  const recebMap = new Map((recebQ.data ?? []).map((r) => [r.pedido_id, r]));
  useEffect(() => {
    if (listaQ.isError) toast.error(formatError(listaQ.error));
  }, [listaQ.isError, listaQ.error]);

  // Mesma chave/consulta do TransferenciasSemBaixaPainel (cache compartilhado).
  const semBaixaQ = useQuery({
    queryKey: ["transferencia-nf-sem-baixa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_transferencia_nf_sem_baixa")
        .select("pedido_id, id_externo, estagio, data_pedido, destino_pedido, nf_numero, nf_data, nf_chave, cfops, itens, unidades, destino_pela_regra")
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown[];
    },
  });
  useEffect(() => {
    if (semBaixaQ.isError) toast.error(formatError(semBaixaQ.error));
  }, [semBaixaQ.isError, semBaixaQ.error]);
  const nSemBaixa = semBaixaQ.data?.length ?? 0;
  const nAReceber = (listaQ.data ?? []).filter(
    (t) =>
      t.sem_destino !== true &&
      (t.estagio === "em_transito" || t.estagio === "em_transporte" || t.estagio === "entregue") &&
      !recebMap.has(t.id),
  ).length;
  const temPendencia = nSemBaixa > 0 || nAReceber > 0 || nOrfaos > 0;

  return (
    <PageShell>
      <PageHeader
        titulo="Transferências Internas"
        breadcrumb={[{ label: "Operação" }, { label: "Transferências Internas" }]}
        icone={PackageCheck}
        estado="Movimentação entre pontos Fetely — sem cobrança, precificada a custo"
        acoes={
          <Button size="sm" onClick={() => navigate("/pedidos/transferencias/nova")}>
            <Plus className="mr-1 h-4 w-4" /> Nova transferência
          </Button>
        }
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="transferencias">Transferências</TabsTrigger>
          {permRetorno.podeVer && (
            <TabsTrigger value="retorno">Com retorno de remessa</TabsTrigger>
          )}
        </TabsList>
        {permRetorno.podeVer && (
          <TabsContent value="retorno">
            <ListaLotesRetorno />
          </TabsContent>
        )}
        <TabsContent value="transferencias" className="space-y-6">
      {temPendencia && (
        <div className="flex flex-wrap gap-3">
          {nSemBaixa > 0 && (
            <button
              type="button"
              onClick={() => semBaixaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="rounded-md border bg-card px-4 py-2 text-left text-sm hover:bg-muted/50"
            >
              Notas sem baixa <span className="font-semibold tabular-nums">({nSemBaixa})</span>
            </button>
          )}
          {nAReceber > 0 && (
            <button
              type="button"
              onClick={() => navigate("/vendas/produto/estoque/recebimento-centro")}
              className="rounded-md border bg-card px-4 py-2 text-left text-sm hover:bg-muted/50"
            >
              A receber no destino <span className="font-semibold tabular-nums">({nAReceber})</span>
            </button>
          )}
          {nOrfaos > 0 && (
            <button
              type="button"
              aria-pressed={soOrfaos}
              onClick={() => setSoOrfaos((v) => !v)}
              className={cn(
                "rounded-md border px-4 py-2 text-left text-sm hover:bg-muted/50",
                soOrfaos ? "border-primary bg-primary/10" : "bg-card",
              )}
            >
              Sem origem/destino <span className="font-semibold tabular-nums">({nOrfaos})</span>
              {soOrfaos && <span className="ml-1 text-xs text-muted-foreground">· filtrando</span>}
            </button>
          )}
        </div>
      )}

      <div ref={semBaixaRef} className="scroll-mt-4">
        <TransferenciasSemBaixaPainel onLancado={() => listaQ.refetch()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Transferências
            {nOrfaos > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {nOrfaos} {nOrfaos === 1 ? "sem origem/destino declarado" : "sem origem/destino declarados"}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listaQ.isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : listaQ.isError ? (
            <p className="p-6 text-sm text-destructive">
              Falha ao carregar transferências: {(listaQ.error as Error).message}
            </p>
          ) : (listaQ.data ?? []).length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma transferência interna registrada ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead>NF</TableHead>
                  <TableHead className="text-right">Qtd. itens</TableHead>
                  <TableHead className="text-right">Qtd. peças</TableHead>
                  <TableHead className="text-right">Valor (a custo)</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Previsão</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Recebimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listaQ.data ?? []).filter((t) => !soOrfaos || t.orfao === true).map((t) => {
                  const abrir = () => navigate(`/pedidos/${t.id}`);
                  return (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/50"
                      role="link"
                      tabIndex={0}
                      onClick={abrir}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") abrir();
                      }}
                    >
                      <TableCell className="font-medium tabular-nums">
                        <span
                          className="text-primary underline-offset-2 hover:underline"
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrir();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              abrir();
                            }
                          }}
                        >
                          {t.id_externo ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell onKeyDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <SeloTipo t={t} />
                          {(t.sem_origem || t.sem_destino) && (
                            <Badge
                              variant="outline"
                              title="Transferência nascida fora do fluxo TRS — origem e/ou destino não foram declarados."
                            >
                              {t.sem_origem && t.sem_destino
                                ? "Sem origem nem destino"
                                : t.sem_origem
                                  ? "Sem origem"
                                  : "Sem destino"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {t.origem_codigo ? (
                          t.origem_codigo
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{t.destino_interno ?? "—"}</TableCell>
                      <TableCell>
                        <SeloEstagio estagio={t.estagio} />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          if (!t.nf_numero) return <span className="text-muted-foreground">—</span>;
                          const alerta = t.nf_situacao && t.nf_situacao !== "autorizada";
                          return (
                            <span
                              className={cn("tabular-nums", alerta && "text-warning")}
                              title={`NF ${t.nf_numero}/${t.nf_serie} · emitida em ${formatDateBR(t.nf_data_emissao)} · ${t.nf_situacao}`}
                            >
                              {t.nf_numero}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {t.qtd_itens ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {t.qtd_total_pecas ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatBRL(t.valor_bruto)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateBR(t.data_pedido)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.data_entrega_prevista ? formatDateBR(t.data_entrega_prevista) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.entregue_em ? formatDateBR(t.entregue_em) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        {(() => {
                          const rec = recebMap.get(t.id);
                          if (rec) {
                            const n = Array.isArray(rec.divergencias) ? rec.divergencias.length : 0;
                            return (
                              <div className="flex items-center gap-1.5">
                                <Badge variant="secondary">Recebido em {formatDateBR(rec.data_recebimento)}</Badge>
                                {n > 0 && (
                                  <span className="text-xs font-medium text-destructive">
                                    · {n} {n === 1 ? "diferença" : "diferenças"}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          if (t.sem_destino === true) {
                            return (
                              <span className="text-xs text-muted-foreground">
                                Declare o destino primeiro
                              </span>
                            );
                          }
                          if (t.estagio === "em_transito" || t.estagio === "em_transporte" || t.estagio === "entregue") {
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate("/vendas/produto/estoque/recebimento-centro");
                                }}
                                className="text-xs text-primary underline-offset-2 hover:underline"
                              >
                                Receber no destino
                              </button>
                            );
                          }
                          return <span className="text-sm text-muted-foreground">—</span>;
                        })()}
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
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
