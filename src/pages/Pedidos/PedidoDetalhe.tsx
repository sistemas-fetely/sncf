import { useParams, useNavigate, useLocation } from "react-router-dom";
import { usePedidoDetalhe } from "@/hooks/pedidos/usePedidoDetalhe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, ExternalLink, FileText, AlertCircle,
} from "lucide-react";
import { CardAnalisePedido } from "@/components/pedidos/CardAnalisePedido";
import { EditarProgramaInline } from "@/components/credito/EditarProgramaInline";
import { EstagioBadge, BadgesContextuaisPedido, FormatoIdade } from "@/components/pedidos/BadgesPedido";
import { PedidoTimeline } from "@/components/pedidos/PedidoTimeline";
import { TransicionarPedidoDialog } from "@/components/pedidos/dialogs/TransicionarPedidoDialog";
import { CancelarPedidoDialog } from "@/components/pedidos/dialogs/CancelarPedidoDialog";
import { AnotarPedidoDialog } from "@/components/pedidos/dialogs/AnotarPedidoDialog";
import { isEstagioFinal } from "@/lib/pedidoTransicoes";
import { AREA_LABELS, ESTAGIO_LABELS } from "@/types/pedido";
import type { AreaPedido, EstagioPedido } from "@/types/pedido";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("pt-BR") : "—";

function Linha({
  label, value, destaque,
}: { label: string; value: string | number | null | undefined; destaque?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={destaque ? "font-semibold text-right" : "text-right"}>{value ?? "—"}</span>
    </div>
  );
}

export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading } = usePedidoDetalhe(id);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return <div className="container mx-auto p-6">Pedido não encontrado.</div>;
  }

  const { pedido, parceiro, itens, eventos, analiseCredito, idade_minutos, sla_estourado } = data;
  const estagioFinal = isEstagioFinal(pedido.estagio as EstagioPedido);

  // Construir badges contextuais a partir do detalhe
  const badgeData = {
    bandeira_vermelha: !!parceiro?.bandeira_vermelha,
    categoria_ka: parceiro?.categoria_ka || null,
    tipo_pagamento: pedido.tipo_pagamento,
    sla_estourado,
    prioridade_score: pedido.prioridade_score || 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return (
    <div className="container mx-auto p-6 space-y-6 pb-32">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => navigate("/pedidos")}
      >
        <ArrowLeft className="h-4 w-4" />
        Casa dos Pedidos
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {parceiro?.razao_social || pedido.cliente_nome_snapshot || "Cliente"}
          </h1>
          <p className="text-sm text-muted-foreground">
            CNPJ {parceiro?.cnpj} · Pedido <span className="font-mono">{pedido.id_externo}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Valor líquido</p>
          <p className="text-2xl font-bold">{fmtBRL.format(pedido.valor_liquido || 0)}</p>
          <p className="text-xs text-muted-foreground">
            {pedido.condicao_solicitada} · {pedido.forma_solicitada}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EstagioBadge estagio={pedido.estagio as EstagioPedido} />
        <BadgesContextuaisPedido p={badgeData} />
        <span className="text-xs text-muted-foreground ml-2">
          Idade: <FormatoIdade minutos={idade_minutos} />
        </span>
      </div>

      {sla_estourado && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm">
              <strong>SLA estourado</strong> — pedido passou de 24h sem ser faturado.
            </p>
          </CardContent>
        </Card>
      )}

      {pedido.proxima_acao && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Próxima ação</p>
            <p className="text-sm font-medium mt-1">{pedido.proxima_acao}</p>
          </CardContent>
        </Card>
      )}

      {/* 3 cards de info */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Linha label="ID externo" value={pedido.id_externo} />
            <Linha label="Data" value={fmtDate(pedido.data_pedido)} />
            <Linha label="Recebido" value={fmtDateTime(pedido.recebido_em)} />
            <Linha label="Via" value={pedido.recebido_via} />
            <Linha label="Origem" value={pedido.origem} />
            <Linha label="Vendedor" value={pedido.vendedor} />
            <Separator />
            <Linha label="Valor bruto" value={fmtBRL.format(pedido.valor_bruto || 0)} />
            <Linha label="Valor líquido" value={fmtBRL.format(pedido.valor_liquido || 0)} destaque />
            <Linha label="Condição" value={pedido.condicao_solicitada} />
            <Linha label="Forma" value={pedido.forma_solicitada} />
            <Linha label="Tipo pagamento" value={pedido.tipo_pagamento} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Linha label="Razão" value={parceiro?.razao_social} />
            <Linha label="CNPJ" value={parceiro?.cnpj} />
            {parceiro?.id && (
              <div className="pt-1">
                <EditarProgramaInline
                  parceiro_id={parceiro.id}
                  nivel_atual={parceiro.nivel_programa || "convive"}
                  categoria_ka_atual={parceiro.categoria_ka ?? null}
                />
              </div>
            )}
            {parceiro?.bandeira_vermelha && (
              <p className="text-sm font-medium text-destructive">🚩 Bandeira Vermelha</p>
            )}
            {parceiro?.cadastro_incompleto && (
              <p className="text-sm text-amber-600">⚠️ Cadastro incompleto</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 mt-2"
              onClick={() => parceiro?.id && navigate(`/parceiros/${parceiro.id}`, { state: { from: location.pathname } })}
            >
              <ExternalLink className="h-4 w-4" />
              Ver perfil completo
            </Button>
          </CardContent>
        </Card>

        <CardAnalisePedido
          pedido_id={pedido.id}
          status={pedido.analise_pedido_status ?? null}
          motivo={pedido.analise_pedido_motivo ?? null}
          detalhes={pedido.analise_pedido_detalhes ?? null}
          executada_em={pedido.analise_pedido_executada_em ?? null}
        />
      </div>

      {/* Itens */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Itens do pedido</span>
            <span className="text-xs text-muted-foreground font-normal">{itens.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Itens ainda não importados (sub-fase do importador FOP).</p>
              {pedido.itens_json && Array.isArray(pedido.itens_json) && pedido.itens_json.length > 0 && (
                <p className="text-xs">
                  Itens em formato bruto: <strong>{pedido.itens_json.length}</strong> no <code>itens_json</code> original.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {itens.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 border-b border-border pb-2 last:border-0">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{item.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.sku && `SKU ${item.sku} · `}
                      {item.quantidade} × {fmtBRL.format(item.valor_unitario)}
                      {item.desconto_pct > 0 && ` · ${item.desconto_pct}% desc`}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{fmtBRL.format(item.subtotal || 0)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Box secundário: Análise de Crédito vinculada */}
      {analiseCredito && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Análise de Crédito vinculada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {analiseCredito.estagio_atual === "entrada" && "Aguardando triagem"}
                {analiseCredito.estagio_atual === "analise" && "Em análise"}
                {analiseCredito.estagio_atual === "decisao" && "Aguardando decisão"}
              </span>
              {analiseCredito.status_final === "aprovado" && (
                <span className="text-xs font-medium text-emerald-600">✓ Aprovado</span>
              )}
              {analiseCredito.status_final === "aprovado_com_ressalva" && (
                <span className="text-xs font-medium text-amber-600">⚠ Aprovado c/ ressalva</span>
              )}
              {analiseCredito.status_final === "reprovado" && (
                <span className="text-xs font-medium text-destructive">✗ Reprovado</span>
              )}
              {analiseCredito.status_final === "cancelado" && (
                <span className="text-xs text-muted-foreground">Cancelado</span>
              )}
            </div>

            {analiseCredito.limite_concedido != null && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="space-y-0.5">
                  <p className="text-muted-foreground">Limite</p>
                  <p className="font-semibold">{fmtBRL.format(analiseCredito.limite_concedido)}</p>
                </div>
                {analiseCredito.prazo_max_dias != null && (
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Prazo máx</p>
                    <p className="font-semibold">{analiseCredito.prazo_max_dias} dias</p>
                  </div>
                )}
                {analiseCredito.validade_ate && (
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Válido até</p>
                    <p className="font-semibold">{fmtDate(analiseCredito.validade_ate)}</p>
                  </div>
                )}
                {analiseCredito.perfil_aplicado && (
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Perfil</p>
                    <p className="font-semibold capitalize">{String(analiseCredito.perfil_aplicado).split("_").join(" ")}</p>
                  </div>
                )}
              </div>
            )}

            {analiseCredito.parecer_final && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Parecer</p>
                <p className="text-sm leading-relaxed">{analiseCredito.parecer_final}</p>
              </div>
            )}
            {analiseCredito.ressalva && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Ressalva</p>
                <p className="text-sm leading-relaxed">{analiseCredito.ressalva}</p>
              </div>
            )}

            {analiseCredito.analise_ia_resumo && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Resumo IA</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{analiseCredito.analise_ia_resumo}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <PedidoTimeline eventos={eventos} />

      {/* Barra fixa de ações */}
      {!estagioFinal && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-lg">
          <div className="container mx-auto py-3 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Estágio: <strong>{ESTAGIO_LABELS[pedido.estagio as EstagioPedido]}</strong>
              {" · "}Área: <strong>{AREA_LABELS[pedido.area_atual as AreaPedido] || pedido.area_atual}</strong>
            </div>
            <div className="flex items-center gap-2">
              <AnotarPedidoDialog pedido_id={pedido.id} />
              <CancelarPedidoDialog pedido_id={pedido.id} />
              <TransicionarPedidoDialog
                pedido_id={pedido.id}
                estagio_atual={pedido.estagio as EstagioPedido}
              />
            </div>
          </div>
        </div>
      )}

      {estagioFinal && (
        <Card className={pedido.estagio === "cancelado" ? "border-destructive bg-destructive/5" : "border-emerald-500 bg-emerald-500/5"}>
          <CardContent className="pt-6 space-y-1">
            <p className="text-sm font-medium">
              {pedido.estagio === "cancelado" ? "Pedido cancelado" : "Pedido entregue"}
              {pedido.cancelado_motivo && ` · Motivo: ${pedido.cancelado_motivo}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {pedido.cancelado_em
                ? `Cancelado em ${fmtDateTime(pedido.cancelado_em)}`
                : pedido.entregue_em
                  ? `Entregue em ${fmtDateTime(pedido.entregue_em)}`
                  : ""}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
