import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePedidoDetalhe } from "@/hooks/pedidos/usePedidoDetalhe";
import { usePedidoTitulos } from "@/hooks/pedidos/usePedidoTitulos";
import { usePedidoPriorizado } from "@/hooks/pedidos/useFilaPedidosPriorizada";
import { useAtualizarUrgencia } from "@/hooks/pedidos/useAtualizarUrgencia";
import { useTransicionarPedido } from "@/hooks/pedidos/useTransicionarPedido";
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
import { ArrowLeft, AlertCircle, ExternalLink, Receipt, Loader2, Sparkles, Clock, CheckCircle2, ArrowRight, Package, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
    <EnviarBlingDialog pedido_id={pedido.id} id_externo={pedido.id_externo} valor_liquido={pedido.valor_liquido} forma_solicitada={pedido.forma_solicitada} />
  );
  if (estagio === "em_analise_credito") return (
    <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-700 dark:text-blue-300 flex gap-2">
      <Clock className="h-4 w-4 mt-0.5 shrink-0" /><span>Em análise de crédito — aguardando decisão.</span>
    </div>
  );
  if (estagio === "credito_aprovado") return <BotaoAvancarCobranca pedidoId={pedido.id} />;
  return null;
}

function BotaoAvancarCobranca({ pedidoId }: { pedidoId: string }) {
  const transicionar = useTransicionarPedido();
  const qc = useQueryClient();
  const handleClick = () => {
    transicionar.mutate(
      {
        pedido_id: pedidoId,
        para_estagio: "cobranca",
        proxima_acao: "Materializar proposta de cobrança",
        motivo: "Avanço manual para cobrança (SOps)",
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
          qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
        },
      }
    );
  };
  return (
    <Button className="w-full gap-2" onClick={handleClick} disabled={transicionar.isPending}>
      {transicionar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
      Avançar pra Cobrança
    </Button>
  );
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

  useEffect(() => {
    if (priorizado) {
      setUrgencia(priorizado.urgencia_declarada || "normal");
      setObsUrgencia(priorizado.urgencia_observacao || "");
    }
  }, [priorizado]);

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

      <div className="px-6 pt-2 pb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{parceiro?.razao_social || pedido.cliente_nome_snapshot || "Cliente"}</h1>
          <p className="text-xs text-muted-foreground font-mono">CNPJ {parceiro?.cnpj} · Pedido {pedido.id_externo}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <EstagioBadge estagio={estagio} />
            {priorizado && <BadgePriorizacao score={priorizado.score_total} breakdown={priorizado.score_breakdown} compact />}
            <span className="text-xs text-muted-foreground"><FormatoIdade minutos={idade_minutos} /></span>
            {sla_estourado && <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-3 w-3" />SLA estourado</Badge>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor líquido</p>
          <p className="text-2xl font-bold">{fmtBRL.format(pedido.valor_liquido || 0)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{pedido.condicao_solicitada} · {pedido.forma_solicitada}</p>
        </div>
      </div>

      <div className="px-6 pb-4">
        <PedidoStepper
          estagioAtual={estagio}
          onClickEstagio={(e) => navigate(`/pedidos?estagio=${e}`)}
        />
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

          {/* Pedido + Cliente — sempre visível, acima dos itens */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Pedido</p>
              <Linha label="ID externo" value={pedido.id_externo} />
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
              <Linha
                label="Frete"
                value={pedido.valor_frete > 0 ? fmtBRL.format(pedido.valor_frete) : "—"}
              />
              {pedido.frete_tipo && (
                <Linha label="Tipo frete" value={pedido.frete_tipo} />
              )}
              {pedido.bling_id_destino && <Linha label="Bling ID" value={`#${pedido.bling_id_destino}`} />}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Cliente</p>
              <Linha label="Razão social" value={parceiro?.razao_social} />
              <div className="flex justify-between gap-3 text-sm py-1.5 border-b border-border/40">
                <span className="text-muted-foreground shrink-0">CNPJ</span>
                <span className="text-right flex items-center gap-1.5">
                  {parceiro?.cnpj ?? "—"}
                  {parceiro?.cnpj && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(parceiro.cnpj!);
                        toast({ title: "CNPJ copiado" });
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Copiar CNPJ"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
              {(() => {
                const emails: { label: string; email: string }[] = [];
                const push = (label: string, email?: string | null) => {
                  const e = (email || "").trim();
                  if (e && !emails.some((x) => x.email.toLowerCase() === e.toLowerCase())) emails.push({ label, email: e });
                };
                push("Principal", parceiro?.email);
                const c = parceiro?.contatos;
                if (c && typeof c === "object" && !Array.isArray(c)) {
                  push("Contato", c?.contato?.email);
                  push("Financeiro", c?.financeiro?.email);
                  push("Fiscal", c?.fiscal?.email);
                } else if (Array.isArray(c)) {
                  c.forEach((it: any, i: number) => push(it?.tipo || it?.nome || `Contato ${i + 1}`, it?.email));
                }
                if (emails.length === 0) return <Linha label="E-mail" value="—" />;
                return (
                  <div className="py-1.5">
                    <p className="text-xs text-muted-foreground mb-1">E-mails cadastrados</p>
                    <div className="space-y-1">
                      {emails.map((e) => (
                        <div key={e.email} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0">{e.label}</span>
                          <a href={`mailto:${e.email}`} className="font-medium text-primary hover:underline truncate" title={e.email}>{e.email}</a>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {parceiro?.id && <div className="py-2"><EditarProgramaInline parceiro_id={parceiro.id} nivel_atual={parceiro.nivel_programa || "convive"} categoria_ka_atual={parceiro.categoria_ka ?? null} /></div>}
              <Button variant="outline" size="sm" className="w-full gap-2 mt-2" onClick={() => parceiro?.id && navigate(`/parceiros/${parceiro.id}`, { state: { from: location.pathname } })}>
                <ExternalLink className="h-3.5 w-3.5" />Ver perfil completo
              </Button>
              {parceiro && <DadosPagadorCard parceiro={parceiro} />}
            </div>
          </div>

          <Separator />

          {/* Itens */}
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
            </TabsList>

            <TabsContent value="parcelas"><ParcelasTab pedidoId={pedido.id} /></TabsContent>
            <TabsContent value="analise">
              <CardAnalisePedido pedido_id={pedido.id} status={pedido.analise_pedido_status ?? null} motivo={pedido.analise_pedido_motivo ?? null} detalhes={pedido.analise_pedido_detalhes ?? null} executada_em={pedido.analise_pedido_executada_em ?? null} />
            </TabsContent>
            <TabsContent value="timeline"><PedidoTimeline eventos={eventos} /></TabsContent>
          </Tabs>

          {estagioFinal && (
            <div className={cn("rounded-lg border p-4 text-sm", pedido.estagio === "cancelado" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700")}>
              <p className="font-medium">{pedido.estagio === "cancelado" ? "Pedido cancelado" : "Pedido entregue"}{pedido.cancelado_motivo && ` · ${pedido.cancelado_motivo}`}</p>
              <p className="text-xs opacity-70 mt-0.5">{pedido.cancelado_em ? fmtDateTime(pedido.cancelado_em) : fmtDateTime(pedido.entregue_em)}</p>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA — sidebar sticky */}
        <div className="w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border">
          <div className="sticky top-14 max-h-[calc(100vh-56px)] overflow-y-auto px-5 py-5 space-y-5">

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Estágio</p>
                <EstagioBadge estagio={estagio} />
              </div>
              <div className="text-right space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Área</p>
                <p className="text-sm font-medium">{AREA_LABELS[pedido.area_atual as AreaPedido] || pedido.area_atual}</p>
              </div>
            </div>

            <Separator />

            {!estagioFinal && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Próxima ação</p>
                {pedido.proxima_acao && <p className="text-xs text-muted-foreground italic">{pedido.proxima_acao}</p>}
                <AcaoPrimaria pedido={pedido} parceiro={parceiro} estagio={estagio} />
                <CancelarPedidoDialog pedido_id={pedido.id} />
              </div>
            )}

            {pedido.observacao_pedido && pedido.observacao_pedido.trim().length > 0 && (
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Observação do pedido</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-sm whitespace-pre-wrap">{pedido.observacao_pedido}</p>
                  <p className="text-xs text-muted-foreground">Registrada pelo vendedor no FOP.</p>
                </CardContent>
              </Card>
            )}

            <Separator />

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

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Notas & Histórico</p>
                <AnotarPedidoDialog pedido_id={pedido.id} />
              </div>
              {eventos && eventos.length > 0 ? (
                <div className="space-y-3">
                  {eventos.slice(0, 30).map((ev: any) => (
                    <div key={ev.id} className="flex gap-2.5">
                      <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-border shrink-0" />
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-medium leading-snug">{ev.descricao || ev.tipo}</p>
                        {ev.detalhe && <p className="text-[11px] text-muted-foreground leading-snug">{ev.detalhe}</p>}
                        <p className="text-[10px] text-muted-foreground">{fmtDateTime(ev.criado_em)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum evento ainda.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
