import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEstadoTela, useFocoAoVoltar, useRestaurarScroll, abrirDetalhe } from "@/lib/navegacao";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Eye, Loader2, PackageCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TransferenciasSemBaixaPainel } from "@/components/estoque/TransferenciasSemBaixaPainel";
import { NovaTransferenciaForm } from "@/components/transferencias/NovaTransferenciaForm";
import { TransferenciaInternaPainel } from "@/components/estoque/TransferenciaInternaPainel";
import { ReceberNoDestinoPainel } from "@/components/transferencias/ReceberNoDestinoPainel";


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
  finalidade_codigo: string | null;
  finalidade_rotulo: string | null;
  remessa_venda_fora_nf: string | null;
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
  // Aba válida: "nova"/"receber"; "retorno" só com permissão; qualquer outra → "transferencias".
  const aba =
    abaUrl === "nova" || abaUrl === "receber" ? abaUrl
    : abaUrl === "retorno" && permRetorno.podeVer ? "retorno"
    : "transferencias";
  const location = useLocation();
  // Filtros da lista (aba Transferências) na URL, prefixo "tr".
  const [nav, setNav] = useEstadoTela({ orfaos: false, vendaFora: false, finalidade: "todas" }, { prefixo: "tr" });
  const soOrfaos = nav.orfaos;
  const setSoOrfaos = (v: boolean | ((p: boolean) => boolean)) => setNav({ orfaos: typeof v === "function" ? v(nav.orfaos) : v });
  // Venda fora (Casa 22) é operação de consignado: fica fora da lista e dos
  // contadores da tela até o chip "Mostrar venda fora" ser ligado.
  const mostrarVendaFora = nav.vendaFora;
  const setMostrarVendaFora = (v: boolean | ((p: boolean) => boolean)) => setNav({ vendaFora: typeof v === "function" ? v(nav.vendaFora) : v });
  const semBaixaRef = useRef<HTMLDivElement>(null);

  const filtroFinalidade = nav.finalidade;
  const setFiltroFinalidade = (v: string) => setNav({ finalidade: v });
  const finalidadesFiltroQ = useQuery({
    queryKey: ["transferencia-finalidades-todas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transferencia_finalidade")
        .select("codigo, rotulo")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (finalidadesFiltroQ.isError) toast.error(formatError(finalidadesFiltroQ.error));
  }, [finalidadesFiltroQ.isError, finalidadesFiltroQ.error]);

  const listaQ = useQuery({
    queryKey: ["transferencias-internas"],
    queryFn: async (): Promise<TransferenciaRow[]> => {
      const { data, error } = await supabase
        .from("v_transferencias_internas")
        .select(
          "id, id_externo, estagio, destino_interno, observacao_pedido, data_pedido, valor_bruto, qtd_itens, qtd_total_pecas, tipo_transferencia, regularizacao_lote_id, regularizacao_lote_codigo, origem_codigo, destino_codigo, orfao, sem_origem, sem_destino, nf_numero, nf_serie, nf_situacao, nf_data_emissao, nf_chave, data_entrega_prevista, entregue_em, canal, finalidade_codigo, finalidade_rotulo, remessa_venda_fora_nf"
        )
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransferenciaRow[];
    },
  });
  // Lista visível = tudo que a tela mostra e conta. Venda fora só entra quando o
  // chip está ligado; os contadores abaixo usam esta lista, não a consulta crua.
  const linhas = listaQ.data ?? [];
  const visiveis = mostrarVendaFora
    ? linhas
    : linhas.filter((t) => t.finalidade_codigo !== "venda_fora");
  const nVendaFora = linhas.length - visiveis.length;
  useFocoAoVoltar({ pronto: listaQ.isSuccess, idsVisiveis: visiveis.map((t) => t.id), focoParam: "tr_foco" });
  useRestaurarScroll(null, listaQ.isSuccess);
  const nOrfaos = visiveis.filter((t) => t.orfao === true).length;

  const idsLista = linhas.map((t) => t.id);
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
  const nAReceber = visiveis.filter(
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
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="transferencias">Painel</TabsTrigger>
          <TabsTrigger value="nova">Nova transferência</TabsTrigger>
          <TabsTrigger value="receber">Receber no destino</TabsTrigger>
          {permRetorno.podeVer && (
            <TabsTrigger value="retorno">Com retorno de remessa</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="nova">
          <NovaTransferenciaForm onCriado={() => setAba("transferencias")} onCancelar={() => setAba("transferencias")} />
        </TabsContent>
        <TabsContent value="receber">
          <ReceberNoDestinoPainel />
        </TabsContent>
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
              Notas sem baixa <span className="font-medium tabular-nums">({nSemBaixa})</span>
            </button>
          )}
          {nAReceber > 0 && (
            <button
              type="button"
              onClick={() => setAba("receber")}
              className="rounded-md border bg-card px-4 py-2 text-left text-sm hover:bg-muted/50"
            >
              A receber no destino <span className="font-medium tabular-nums">({nAReceber})</span>
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
              Sem origem/destino <span className="font-medium tabular-nums">({nOrfaos})</span>
              {soOrfaos && <span className="ml-1 text-xs text-muted-foreground">· filtrando</span>}
            </button>
          )}
        </div>
      )}

      <div ref={semBaixaRef} className="scroll-mt-4">
        <TransferenciasSemBaixaPainel onLancado={() => listaQ.refetch()} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            Transferências
            {nOrfaos > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {nOrfaos} {nOrfaos === 1 ? "sem origem/destino declarado" : "sem origem/destino declarados"}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={mostrarVendaFora}
              onClick={() => setMostrarVendaFora((v) => !v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs hover:bg-muted/50",
                mostrarVendaFora
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground",
              )}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Mostrar venda fora (Casa 22)
              {nVendaFora > 0 && <span className="tabular-nums">({nVendaFora})</span>}
            </button>
            <Select value={filtroFinalidade} onValueChange={setFiltroFinalidade}>
              <SelectTrigger className="h-8 w-[220px]" aria-label="Filtrar por finalidade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as finalidades</SelectItem>
                {(finalidadesFiltroQ.data ?? []).map((f) => (
                  <SelectItem key={f.codigo} value={f.codigo}>{f.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          ) : visiveis.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma transferência interna registrada ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead>Descrição</TableHead>
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
                {visiveis.filter((t) => !soOrfaos || t.orfao === true).filter((t) => filtroFinalidade === "todas" || t.finalidade_codigo === filtroFinalidade).map((t) => {
                  const abrir = () => abrirDetalhe(navigate, location, `/pedidos/${t.id}`, { foco: t.id, label: "Transferências", focoParam: "tr_foco" });
                  return (
                    <TableRow
                      key={t.id}
                      data-foco-id={t.id}
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
                      <TableCell>
                        {t.finalidade_rotulo ? (
                          <Badge variant="secondary" className="whitespace-nowrap">{t.finalidade_rotulo}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.observacao_pedido?.trim() ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block max-w-[40ch] truncate">{t.observacao_pedido}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm whitespace-pre-wrap">{t.observacao_pedido}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
                          if (!t.nf_numero && !t.remessa_venda_fora_nf) return <span className="text-muted-foreground">—</span>;
                          const alerta = t.nf_situacao && t.nf_situacao !== "autorizada";
                          return (
                            <div className="flex items-center gap-1.5">
                              {t.nf_numero && (
                                <span
                                  className={cn("tabular-nums", alerta && "text-warning")}
                                  title={`NF ${t.nf_numero}/${t.nf_serie} · emitida em ${formatDateBR(t.nf_data_emissao)} · ${t.nf_situacao}`}
                                >
                                  {t.nf_numero}
                                </span>
                              )}
                              {t.remessa_venda_fora_nf && (
                                <Badge
                                  variant="outline"
                                  className="whitespace-nowrap text-xs font-normal text-muted-foreground"
                                  title="NF de remessa para venda fora do estabelecimento (CFOP 5904) que esta transferência abasteceu."
                                >
                                  Remessa 5904: NF {t.remessa_venda_fora_nf}
                                </Badge>
                              )}
                            </div>
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
                                  setAba("receber");
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
      <Card>
        <CardHeader><CardTitle className="text-base">Entre CDs de SP</CardTitle></CardHeader>
        <CardContent>
          <TransferenciaInternaPainel mostrarFormulario={false} tituloHistorico="Transferências sem NF" seloSemNf />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
