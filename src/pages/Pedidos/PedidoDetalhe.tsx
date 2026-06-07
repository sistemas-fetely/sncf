import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

import { usePedidoDetalhe } from "@/hooks/pedidos/usePedidoDetalhe";
import { usePedidoTitulos } from "@/hooks/pedidos/usePedidoTitulos";
import { usePedidoPriorizado } from "@/hooks/pedidos/useFilaPedidosPriorizada";
import { useAtualizarUrgencia } from "@/hooks/pedidos/useAtualizarUrgencia";

import { isEstagioFinal } from "@/lib/pedidoTransicoes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PedidoStepper } from "@/components/pedidos/PedidoStepper";
import { PedidoTimeline } from "@/components/pedidos/PedidoTimeline";
import { BadgePriorizacao } from "@/components/pedidos/BadgePriorizacao";
import { EstagioBadge, FormatoIdade } from "@/components/pedidos/BadgesPedido";
import { CardAnalisePedido } from "@/components/pedidos/CardAnalisePedido";
import { BadgesContextuais } from "@/components/credito/BadgesContextuais";
import { EditarProgramaInline } from "@/components/credito/EditarProgramaInline";
import { TriarPedidoDialog } from "@/components/pedidos/dialogs/TriarPedidoDialog";
import { CancelarPedidoDialog } from "@/components/pedidos/dialogs/CancelarPedidoDialog";
import { AnotarPedidoDialog } from "@/components/pedidos/dialogs/AnotarPedidoDialog";
import { EnviarBlingDialog } from "@/components/pedidos/dialogs/EnviarBlingDialog";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";

import { AREA_LABELS, STATUS_TITULO_LABELS, URGENCIA_LABELS } from "@/types/pedido";
import type { AreaPedido, EstagioPedido, StatusTitulo, TipoTituloPagamento, TituloAReceber, UrgenciaDeclarada } from "@/types/pedido";
import { ArrowLeft, AlertCircle, ExternalLink, Receipt, Loader2, Sparkles, Clock, CheckCircle2, ArrowRight, Package, Copy, Truck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useTransportadoras } from "@/hooks/pedidos/useTransportadoras";
import { useSalvarDadosEnvio } from "@/hooks/pedidos/useSalvarDadosEnvio";
import { useFreteEstimado } from "@/hooks/transportadoras/useFreteEstimado";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) => s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (s: string | null | undefined) => s ? new Date(s).toLocaleString("pt-BR") : "—";

const TIPO_LABEL: Record<TipoTituloPagamento, string> = { boleto: "Boleto", pix: "PIX", cartao: "Cartão", troca_mercadoria: "Troca" };
const STATUS_CORES: Record<StatusTitulo, string> = {
  aguardando_pagamento: "bg-amber-500 text-white border-0", aguardando_envio_bling: "bg-sky-500 text-white border-0",
  aguardando_emissao_nf: "bg-sky-600 text-white border-0", vigente: "bg-blue-500 text-white border-0",
  vigente_parcial: "bg-blue-400 text-white border-0", pago: "bg-emerald-500 text-white border-0",
  pago_com_atraso: "bg-emerald-600 text-white border-0", pago_judicial: "bg-emerald-700 text-white border-0",
  vencido: "bg-red-500 text-white border-0", vencido_suspenso: "bg-red-600 text-white border-0",
  em_juridico: "bg-red-700 text-white border-0", renegociado: "bg-purple-500 text-white border-0",
  baixado_por_perda: "bg-muted text-muted-foreground border-0", cancelado: "bg-muted text-muted-foreground border-0",
  cancelado_recuperacao: "bg-muted text-muted-foreground border-0",
};

function Linha({ label, value, destaque }: { label: string; value?: string | number | null; destaque?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right", destaque && "font-semibold")}>{value ?? "—"}</span>
    </div>
  );
}

function ParcelasTab({ pedidoId }: { pedidoId: string }) {
  const { data: titulos, isLoading } = usePedidoTitulos(pedidoId);
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!titulos || titulos.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground space-y-2">
        <Receipt className="h-8 w-8 mx-auto opacity-30" />
        <p className="text-sm">Nenhum título gerado ainda.</p>
        <p className="text-xs">Títulos nascem ao chegar em Pré-Faturado.</p>
      </div>
    );
  }
  const total = titulos.reduce((acc, t) => acc + Number(t.valor_atual || 0), 0);
  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead><TableHead>Tipo</TableHead><TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead><TableHead>Forma</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {titulos.map((t: TituloAReceber) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.numero_parcela}/{t.total_parcelas}</TableCell>
                <TableCell>{t.eh_entrada ? <Badge variant="outline" className="border-emerald-500 text-emerald-700">Entrada</Badge> : <Badge variant="outline">Parcela</Badge>}</TableCell>
                <TableCell className="text-sm">{fmtDate(t.data_vencimento_atual)}</TableCell>
                <TableCell className="font-semibold">{fmtBRL.format(Number(t.valor_atual || 0))}</TableCell>
                <TableCell className="text-sm">{TIPO_LABEL[t.tipo_pagamento]}</TableCell>
                <TableCell><Badge className={cn(STATUS_CORES[t.status])}>{STATUS_TITULO_LABELS[t.status]}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end text-sm gap-2">
        <span className="text-muted-foreground">Total:</span>
        <span className="font-bold">{fmtBRL.format(total)}</span>
      </div>
    </div>
  );
}

function AcaoPrimaria({ pedido, parceiro, estagio }: { pedido: any; parceiro: any; estagio: EstagioPedido }) {
  const navigate = useNavigate();
  if (estagio === "recebido") return (
    <TriarPedidoDialog pedido_id={pedido.id} perfil_credito={parceiro?.perfil_credito} estagio_atual={estagio} forma_solicitada={pedido.forma_solicitada} triggerLabel="Encaminhar pedido" triggerVariant="default" />
  );
  if (estagio === "cobranca") return (
    <Button className="w-full gap-2" onClick={() => navigate(`/recebimento/cobranca/${pedido.id}`)}>
      <Package className="h-4 w-4" />Operacionar cobrança
    </Button>
  );
  if (estagio === "aguardando_pagamento") return <ConfirmarPagamentoDialog pedido_id={pedido.id} valor_pedido={pedido.valor_liquido} />;
  if (estagio === "pre_faturado" && !pedido.bling_id_destino) return (
    <EnviarBlingDialog pedido_id={pedido.id} parceiro_id={pedido.parceiro_id} id_externo={pedido.id_externo} valor_liquido={pedido.valor_liquido} forma_solicitada={pedido.forma_solicitada} />
  );
  if (estagio === "em_analise_credito") return (
    <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-700 dark:text-blue-300 flex gap-2">
      <Clock className="h-4 w-4 mt-0.5 shrink-0" /><span>Em análise de crédito — aguardando decisão.</span>
    </div>
  );
  return null;
}


export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading } = usePedidoDetalhe(id);
  const { data: priorizado } = usePedidoPriorizado(id);
  const atualizarUrgencia = useAtualizarUrgencia();
  const [urgencia, setUrgencia] = useState<UrgenciaDeclarada>("normal");
  const [obsUrgencia, setObsUrgencia] = useState("");
  const [transportadoraId, setTransportadoraId] = useState("");
  const [pesoBruto, setPesoBruto] = useState("");
  const [freteTipo, setFreteTipo] = useState("");
  const [valorFrete, setValorFrete] = useState("");
  const transportadoras = useTransportadoras();
  const salvarDadosEnvio = useSalvarDadosEnvio();

  const pesoBrutoNum = parseFloat(pesoBruto) || Number(data?.pedido?.peso_bruto_total) || 0;
  const cubagemTotal = Number(data?.pedido?.cubagem_total) || 0;
  const pesoCobradoEst = cubagemTotal > 0 ? Math.max(pesoBrutoNum, cubagemTotal * 300) : pesoBrutoNum;
  const cepEstimativa = data?.pedido?.endereco_entrega?.cep ?? data?.parceiro?.cep ?? null;
  const freteEst = useFreteEstimado(
    transportadoraId || null,
    cepEstimativa,
    pesoCobradoEst > 0 ? pesoCobradoEst : null
  );

  useEffect(() => {
    if (priorizado) {
      setUrgencia(priorizado.urgencia_declarada || "normal");
      setObsUrgencia(priorizado.urgencia_observacao || "");
    }
  }, [priorizado]);

  useEffect(() => {
    if (data?.pedido) {
      setTransportadoraId(data.pedido.transportadora_id ?? "");
      setPesoBruto(String(data.pedido.peso_bruto_total ?? ""));
      setFreteTipo(data.pedido.frete_tipo ?? "");
      setValorFrete(String(data.pedido.valor_frete ?? ""));
    }
  }, [data?.pedido]);

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!data) return <div className="p-6">Pedido não encontrado.</div>;

  const { pedido, parceiro, itens, eventos, analiseCredito, analisesAnteriores, idade_minutos, sla_estourado } = data;
  const estagio = pedido.estagio as EstagioPedido;
  const estagioFinal = isEstagioFinal(estagio);

  return (
    <div className="min-h-screen bg-background">
      <div className="px-6 pt-4">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground" onClick={() => navigate("/pedidos")}>
          <ArrowLeft className="h-4 w-4" />Casa dos Pedidos
        </Button>
      </div>

      <div className="px-6 pb-4">
        <PedidoStepper
          estagioAtual={estagio}
          onClickEstagio={(e) => navigate(`/pedidos?estagio=${e}`)}
        />
      </div>

      <div className="px-6 pt-2 pb-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{parceiro?.razao_social || pedido.cliente_nome_snapshot || "Cliente"}</h1>
            <p className="text-xs text-muted-foreground font-mono">CNPJ {parceiro?.cnpj} · Pedido {pedido.id_externo}</p>
            {parceiro?.email && (
              <a href={`mailto:${parceiro.email}`} className="text-xs text-primary hover:underline truncate block">
                {parceiro.email}
              </a>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <EstagioBadge estagio={estagio} />
              {priorizado && <BadgePriorizacao score={priorizado.score_total} breakdown={priorizado.score_breakdown} compact />}
              <span className="text-xs text-muted-foreground"><FormatoIdade minutos={idade_minutos} /></span>
              {sla_estourado && <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" />SLA estourado</Badge>}
            </div>
          </div>

          {!estagioFinal && (
            <div className="space-y-2 lg:min-w-[240px] lg:max-w-xs">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Próxima ação</p>
              {pedido.proxima_acao && <p className="text-xs text-muted-foreground italic">{pedido.proxima_acao}</p>}
              <AcaoPrimaria pedido={pedido} parceiro={parceiro} estagio={estagio} />
              <CancelarPedidoDialog pedido_id={pedido.id} />
            </div>
          )}
        </div>
      </div>


      <Separator />

      <div className="flex flex-col lg:flex-row">

        {/* COLUNA ESQUERDA */}
        <div className="flex-1 min-w-0 px-6 py-5 space-y-6">

          {estagio === "recebido" && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Revisar e encaminhar</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><p className="text-muted-foreground uppercase tracking-wide mb-0.5">Perfil</p><p className="font-semibold capitalize">{parceiro?.perfil_credito ? String(parceiro.perfil_credito).split("_").join(" ") : "—"}</p></div>
                <div><p className="text-muted-foreground uppercase tracking-wide mb-0.5">Valor</p><p className="font-semibold">{fmtBRL.format(pedido.valor_liquido || 0)}</p></div>
                <div><p className="text-muted-foreground uppercase tracking-wide mb-0.5">Condição</p><p className="font-semibold">{pedido.condicao_solicitada}</p></div>
                <div><p className="text-muted-foreground uppercase tracking-wide mb-0.5">Forma</p><p className="font-semibold">{pedido.forma_solicitada}</p></div>
              </div>
              <div className="pt-1">
                <BadgesContextuais
                  parceiro={parceiro || {}}
                  analisesAnteriores={analisesAnteriores}
                  valorPedido={pedido?.valor_liquido}
                />
              </div>
            </div>
          )}

          {/* Pedido + Envio — sempre visível, acima dos itens */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Pedido</p>
              <Linha label="ID externo" value={pedido.id_externo} />
              {parceiro?.id && (
                <div className="py-1">
                  <EditarProgramaInline parceiro_id={parceiro.id} nivel_atual={parceiro.nivel_programa || "convive"} categoria_ka_atual={parceiro.categoria_ka ?? null} />
                </div>
              )}
              <Linha label="Data" value={fmtDate(pedido.data_pedido)} />
              <Linha label="Recebido em" value={fmtDateTime(pedido.recebido_em)} />
              <Linha label="Via" value={pedido.recebido_via} />
              <Linha label="Vendedor" value={pedido.vendedor} />
              <Linha label="Valor bruto" value={fmtBRL.format(pedido.valor_bruto || 0)} />
              {(() => {
                const bruto = pedido.valor_bruto || 0;
                const liquido = pedido.valor_liquido || 0;
                const diff = bruto - liquido;
                if (diff <= 0.01) return null;
                const pct = ((diff / bruto) * 100).toFixed(2);
                return (
                  <Linha
                    label="Desconto"
                    value={`${pct}% (−${fmtBRL.format(diff)})`}
                  />
                );
              })()}
              <Linha label="Valor líquido" value={fmtBRL.format(pedido.valor_liquido || 0)} destaque />
              <Linha label="Condição" value={pedido.condicao_solicitada} />
              <Linha label="Forma" value={pedido.forma_solicitada} />

              <Linha
                label="Frete"
                value={pedido.valor_frete > 0 ? fmtBRL.format(pedido.valor_frete) : "—"}
              />
              {pedido.frete_tipo && (
                <Linha label="Tipo frete" value={pedido.frete_tipo} />
              )}
              {pedido.bling_id_destino && <Linha label="Bling ID" value={`#${pedido.bling_id_destino}`} />}
            </div>
            {estagio !== "cancelado" && (
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    Dados de Envio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Transportadora</label>
                      <Select value={transportadoraId || "__none__"} onValueChange={(v) => setTransportadoraId(v === "__none__" ? "" : v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Nenhuma —</SelectItem>
                          {(transportadoras.data ?? []).map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.razao_social}
                              {t.cnpj && <span className="text-muted-foreground ml-2 text-xs">{t.cnpj}</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Peso bruto total (kg)</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={pesoBruto}
                        onChange={(e) => setPesoBruto(e.target.value)}
                        placeholder="0.000"
                        className="w-full h-9 text-sm rounded-md border border-input bg-background px-3 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>

                    <Button
                      size="sm"
                      className="h-9"
                      disabled={salvarDadosEnvio.isPending || !!pedido.bling_id_destino}
                      onClick={() =>
                        id && salvarDadosEnvio.mutate({
                          pedidoId: id,
                          transportadoraId: transportadoraId || null,
                          pesoBrutoTotal: parseFloat(pesoBruto) || 0,
                          freteTipo: freteTipo || null,
                          valorFrete: parseFloat(valorFrete) || null,
                        })
                      }
                    >
                      {salvarDadosEnvio.isPending ? (
                        <><Loader2 className="h-3 w-3 animate-spin mr-1" />Salvando…</>
                      ) : (
                        "Salvar"
                      )}
                    </Button>
                  </div>

                  {freteEst.isLoading && transportadoraId && (
                    <p className="text-xs text-muted-foreground mt-3">Calculando frete...</p>
                  )}
                  {freteEst.data && freteEst.data.erro && (
                    <p className="text-xs text-destructive mt-3">{freteEst.data.erro}</p>
                  )}
                  {freteEst.data && !freteEst.data.erro && (
                    <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Estimativa Icaro</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-semibold">
                          {freteEst.data.valor_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                        {pedido.valor_bruto > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({((freteEst.data.valor_estimado / pedido.valor_bruto) * 100).toFixed(2)}% do bruto)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Prazo {freteEst.data.prazo_dias}d · {freteEst.data.tarifa_code}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Base: R$ {freteEst.data.breakdown.base.toFixed(2)} · GRIS: R$ {freteEst.data.breakdown.gris.toFixed(2)} · Pedágio: R$ {freteEst.data.breakdown.pedagio.toFixed(2)} · TAS: R$ {freteEst.data.breakdown.tas.toFixed(2)}
                      </p>
                    </div>
                  )}


      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
        <div className="col-span-2">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Tipo frete</label>
          <Select value={freteTipo} onValueChange={setFreteTipo}>
            <SelectTrigger className="h-8 text-sm mt-0.5">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FOB">FOB — Frete cobrado do cliente</SelectItem>
              <SelectItem value="CIF">CIF — Benefício comercial (Fetely absorve)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor frete (R$)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={valorFrete}
            onChange={(e) => setValorFrete(e.target.value)}
            placeholder="0,00"
            className="w-full h-8 text-sm rounded-md border border-input bg-background px-3 mt-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cubagem</p>
          <p className="text-sm font-medium">
            {pedido.cubagem_total > 0
              ? `${Number(pedido.cubagem_total).toFixed(4)} m³`
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Peso Cubagem</p>
          <p className="text-sm font-medium">
            {pedido.cubagem_total > 0
              ? `${(Number(pedido.cubagem_total) * 300).toFixed(3)} kg`
              : "—"}
          </p>
        </div>
      </div>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Itens + Tabs lado a lado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Itens do pedido</p>
                <span className="text-xs text-muted-foreground">{itens.length} {itens.length === 1 ? "item" : "itens"}</span>
              </div>
              {itens.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-6">Itens ainda não importados.</p>
                : itens.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.descricao}</p>
                      <p className="text-xs text-muted-foreground">{item.sku && `SKU ${item.sku} · `}{item.quantidade} × {fmtBRL.format(item.valor_unitario)}{item.desconto_pct > 0 && ` · ${item.desconto_pct}% desc`}</p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">{fmtBRL.format(item.subtotal || 0)}</p>
                  </div>
                ))
              }
            </div>

            <Tabs defaultValue="parcelas" className="space-y-3">
              <TabsList>
                <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
                <TabsTrigger value="analise">Análise IA</TabsTrigger>
                <TabsTrigger value="timeline">Histórico</TabsTrigger>
                <TabsTrigger value="urgencia">Urgência</TabsTrigger>
              </TabsList>

              <TabsContent value="parcelas"><ParcelasTab pedidoId={pedido.id} /></TabsContent>
              <TabsContent value="analise">
                <CardAnalisePedido pedido_id={pedido.id} status={pedido.analise_pedido_status ?? null} motivo={pedido.analise_pedido_motivo ?? null} detalhes={pedido.analise_pedido_detalhes ?? null} executada_em={pedido.analise_pedido_executada_em ?? null} />
              </TabsContent>
              <TabsContent value="timeline"><PedidoTimeline eventos={eventos} /></TabsContent>
              <TabsContent value="urgencia">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Urgência</p>
                  </div>
                  <Select value={urgencia} onValueChange={(v) => setUrgencia(v as UrgenciaDeclarada)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-gray-400" />{URGENCIA_LABELS.normal}</span></SelectItem>
                      <SelectItem value="alta"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-yellow-500" />{URGENCIA_LABELS.alta}</span></SelectItem>
                      <SelectItem value="critica"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" />{URGENCIA_LABELS.critica}</span></SelectItem>
                    </SelectContent>
                  </Select>
                  <textarea
                    value={obsUrgencia}
                    onChange={(e) => setObsUrgencia(e.target.value)}
                    placeholder="Justificativa opcional…"
                    rows={2}
                    className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                  />
                  <Button size="sm" variant="outline" className="w-full"
                    onClick={() => id && atualizarUrgencia.mutate({ pedidoId: id, urgencia, observacao: obsUrgencia })}
                    disabled={atualizarUrgencia.isPending}>
                    {atualizarUrgencia.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Salvando…</> : "Salvar urgência"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>




          {estagioFinal && (
            <div className={cn("rounded-lg border p-4 text-sm", pedido.estagio === "cancelado" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700")}>
              <p className="font-medium">{pedido.estagio === "cancelado" ? "Pedido cancelado" : "Pedido entregue"}{pedido.cancelado_motivo && ` · ${pedido.cancelado_motivo}`}</p>
              <p className="text-xs opacity-70 mt-0.5">{pedido.cancelado_em ? fmtDateTime(pedido.cancelado_em) : fmtDateTime(pedido.entregue_em)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
