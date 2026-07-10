import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useTitulosCobranca,
  calcularKpis,
  type TituloCobranca,
  type StatusGestao,
} from "@/hooks/credito/useTitulosCobranca";
import { useEnviarEmailBoleto } from "@/hooks/credito/useEnviarEmailBoleto";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Copy, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import { formatCNPJ } from "@/lib/cnpj";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { BadgeBoletoStatus } from "@/components/credito/BadgeBoletoStatus";
import { BaixaManualDialog } from "@/components/credito/BaixaManualDialog";
import { ConverterTituloHaverDialog } from "@/components/credito/ConverterTituloHaverDialog";
import { ReemitirBoletoDialog } from "@/components/credito/ReemitirBoletoDialog";
import { ProrrogarVencimentoDialog } from "@/components/credito/ProrrogarVencimentoDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";

type TipoFiltro = "todos" | "boleto" | "pix" | "cartao" | "haver" | "troca";

const STATUS_LABEL: Record<StatusGestao, string> = {
  a_vencer: "A vencer",
  vence_hoje: "Vence hoje",
  atrasado: "Atrasado",
  pago: "Pago",
  cancelado: "Cancelado",
};

const STATUS_BADGE: Record<StatusGestao, string> = {
  a_vencer: "bg-muted text-muted-foreground border border-border",
  vence_hoje: "bg-amber-50 text-amber-700 border border-amber-200",
  atrasado: "bg-red-50 text-red-700 border border-red-200",
  pago: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelado: "bg-muted text-muted-foreground line-through",
};

function BadgeStatusGestao({ status }: { status: StatusGestao }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        STATUS_BADGE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function MotivoRejeicaoSafra({ codigo }: { codigo: string }) {
  const { data } = useQuery({
    queryKey: ["safra-motivo-rejeicao", codigo],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (c: string, v: string) => {
              maybeSingle: () => Promise<{ data: { descricao: string; observacao: string | null } | null; error: unknown }>;
            };
          };
        };
      })
        .from("safra_motivos_rejeicao")
        .select("descricao, observacao")
        .eq("codigo", codigo)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    staleTime: 5 * 60_000,
  });
  if (!data) {
    return (
      <div className="text-xs text-red-700">
        Rejeição {codigo}
      </div>
    );
  }
  return (
    <div className="text-xs text-red-700 space-y-0.5">
      <div>Rejeição {codigo} — {data.descricao}</div>
      {data.observacao && (
        <div className="text-[11px] text-muted-foreground">{data.observacao}</div>
      )}
    </div>
  );
}

function KpiCard({
  label, qtd, valor, ativo, onClick, tone,
}: {
  label: string;
  qtd: number;
  valor: number;
  ativo: boolean;
  onClick: () => void;
  tone?: "default" | "danger" | "warn";
}) {
  const toneCls =
    tone === "danger"
      ? "border-red-300 text-red-700"
      : tone === "warn"
      ? "border-amber-300 text-amber-700"
      : "border-border";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-3 rounded-lg border transition-all bg-card hover:bg-muted/40",
        toneCls,
        ativo && "ring-2 ring-foreground/40 bg-muted",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{qtd}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{formatBRL(valor)}</div>
    </button>
  );
}

function tipoLabel(t: string): string {
  const map: Record<string, string> = {
    boleto: "Boleto",
    pix: "PIX",
    cartao: "Cartão",
    cartao_credito: "Cartão",
    cartao_debito: "Cartão",
    cartao_sem_juros: "Cartão s/j",
    haver: "Haver",
    troca: "Troca",
  };
  return map[t] ?? t ?? "—";
}

function matchTipo(filtro: TipoFiltro, tipo: string): boolean {
  if (filtro === "todos") return true;
  if (filtro === "cartao") return (tipo ?? "").startsWith("cartao");
  return tipo === filtro;
}

export default function TitulosTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: titulos = [], isLoading } = useTitulosCobranca();
  const enviarBoleto = useEnviarEmailBoleto();

  const [cardsAtivos, setCardsAtivos] = useState<Set<string>>(
    new Set(["a_vencer", "vence_hoje", "atrasado"]),
  );
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [busca, setBusca] = useState("");
  const [vencDe, setVencDe] = useState("");
  const [vencAte, setVencAte] = useState("");
  const [detalhe, setDetalhe] = useState<TituloCobranca | null>(null);
  const [baixando, setBaixando] = useState<TituloCobranca | null>(null);
  const [convertendo, setConvertendo] = useState<TituloCobranca | null>(null);
  const [reemitindo, setReemitindo] = useState<TituloCobranca | null>(null);
  const [cancelandoReemissao, setCancelandoReemissao] = useState<TituloCobranca | null>(null);

  const kpis = useMemo(() => calcularKpis(titulos), [titulos]);
  const mesAtual = new Date().toISOString().slice(0, 7);

  function toggleCard(key: string) {
    setCardsAtivos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return titulos.filter((t) => {
      // Filtro por cards
      if (cardsAtivos.has("todos")) {
        // mostra tudo
      } else {
        const passa =
          (cardsAtivos.has("a_vencer") && t.status_gestao === "a_vencer") ||
          (cardsAtivos.has("vence_hoje") && t.status_gestao === "vence_hoje") ||
          (cardsAtivos.has("atrasado") && t.status_gestao === "atrasado") ||
          (cardsAtivos.has("pago_no_mes") &&
            t.status_gestao === "pago" &&
            (t.data_liquidacao_real ?? "").slice(0, 7) === mesAtual);
        if (!passa) return false;
        // cancelados só quando "todos"
        if (t.status_gestao === "cancelado") return false;
      }

      if (!matchTipo(tipoFiltro, t.tipo_pagamento)) return false;

      if (q) {
        const alvo = [
          t.parceiro_razao_social,
          t.parceiro_cnpj,
          t.pedido_id_externo,
          t.numero_titulo,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(q)) return false;
      }

      if (vencDe && (t.data_vencimento_atual ?? "") < vencDe) return false;
      if (vencAte && (t.data_vencimento_atual ?? "") > vencAte) return false;

      return true;
    });
  }, [titulos, cardsAtivos, tipoFiltro, busca, vencDe, vencAte, mesAtual]);

  const totalFiltrado = filtrados.reduce((acc, t) => acc + (t.valor_efetivo ?? 0), 0);

  async function copiar(txt: string) {
    try {
      await navigator.clipboard.writeText(txt);
      toast({ title: "Copiado!" });
    } catch {
      toast({ title: "Falha ao copiar", variant: "destructive" });
    }
  }

  const podeReenviarBoleto = (t: TituloCobranca) =>
    t.tipo_pagamento === "boleto" && t.boleto_status === "registrado" && !!t.linha_digitavel;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="A vencer"
          qtd={kpis.aVencer.qtd}
          valor={kpis.aVencer.valor}
          ativo={cardsAtivos.has("a_vencer")}
          onClick={() => toggleCard("a_vencer")}
        />
        <KpiCard
          label="Vence hoje"
          qtd={kpis.venceHoje.qtd}
          valor={kpis.venceHoje.valor}
          ativo={cardsAtivos.has("vence_hoje")}
          onClick={() => toggleCard("vence_hoje")}
          tone="warn"
        />
        <KpiCard
          label="Atrasado"
          qtd={kpis.atrasado.qtd}
          valor={kpis.atrasado.valor}
          ativo={cardsAtivos.has("atrasado")}
          onClick={() => toggleCard("atrasado")}
          tone="danger"
        />
        <KpiCard
          label="Pago no mês"
          qtd={kpis.pagoNoMes.qtd}
          valor={kpis.pagoNoMes.valor}
          ativo={cardsAtivos.has("pago_no_mes")}
          onClick={() => toggleCard("pago_no_mes")}
        />
        <KpiCard
          label="Todos"
          qtd={kpis.total.qtd}
          valor={kpis.total.valor}
          ativo={cardsAtivos.has("todos")}
          onClick={() => toggleCard("todos")}
        />
      </div>

      {/* Filtros secundários */}
      <div className="flex flex-wrap items-center gap-3">
        {(["todos", "boleto", "pix", "cartao", "haver", "troca"] as TipoFiltro[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setTipoFiltro(f)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors",
              tipoFiltro === f
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:border-foreground/40",
            )}
          >
            {f === "todos" ? "Todos" : tipoLabel(f)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, CNPJ, pedido ou título..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Venc. de</span>
          <Input
            type="date"
            value={vencDe}
            onChange={(e) => setVencDe(e.target.value)}
            className="w-40"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={vencAte}
            onChange={(e) => setVencAte(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>NF</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Liquidação</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="py-6">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhum título encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtrados.map((t) => {
              const liquid = t.data_liquidacao_real
                ? formatDateBR(t.data_liquidacao_real)
                : t.data_liquidacao_prevista
                ? `prev. ${formatDateBR(t.data_liquidacao_prevista)}`
                : "—";
              return (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setDetalhe(t)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{t.numero_titulo}</span>
                      {t.eh_entrada && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Entrada
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      parcela {t.numero_parcela}/{t.total_parcelas}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{t.parceiro_razao_social ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.parceiro_cnpj ? formatCNPJ(t.parceiro_cnpj) : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    {t.pedido_id_externo ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/pedidos/${t.pedido_id}`);
                        }}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {t.pedido_id_externo}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{t.nf_numero ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {tipoLabel(t.tipo_pagamento)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-sm",
                      t.dias_atraso > 0 && "text-red-700 font-medium",
                    )}
                  >
                    {formatDateBR(t.data_vencimento_atual)}
                    {t.dias_atraso > 0 && (
                      <div className="text-xs text-red-600">há {t.dias_atraso}d</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{liquid}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatBRL(t.valor_efetivo)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <BadgeStatusGestao status={t.status_gestao} />
                      {t.tipo_pagamento === "boleto" && t.boleto_status && (
                        <BadgeBoletoStatus
                          status={t.boleto_status}
                          codigoRejeicao={t.boleto_codigo_rejeicao}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtrados.length} título{filtrados.length !== 1 ? "s" : ""} · {formatBRL(totalFiltrado)}
      </p>

      {/* Drawer detalhe */}
      <Sheet open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detalhe && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between gap-3">
                  <SheetTitle className="font-mono text-base">{detalhe.numero_titulo}</SheetTitle>
                  <BadgeStatusGestao status={detalhe.status_gestao} />
                </div>
                <SheetDescription className="text-2xl font-semibold text-foreground pt-2">
                  {formatBRL(detalhe.valor_efetivo)}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-6 text-sm">
                <section>
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Cliente
                  </h4>
                  <p className="font-medium">{detalhe.parceiro_razao_social ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {detalhe.parceiro_cnpj ? formatCNPJ(detalhe.parceiro_cnpj) : ""}
                  </p>
                  {detalhe.pedido_id_externo && (
                    <button
                      onClick={() => navigate(`/pedidos/${detalhe.pedido_id}`)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Pedido {detalhe.pedido_id_externo}
                    </button>
                  )}
                </section>

                <section>
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Datas
                  </h4>
                  <dl className="grid grid-cols-2 gap-y-1 gap-x-3 text-xs">
                    <dt className="text-muted-foreground">Vencimento original</dt>
                    <dd>{formatDateBR(detalhe.data_vencimento_original)}</dd>
                    <dt className="text-muted-foreground">Vencimento atual</dt>
                    <dd>{formatDateBR(detalhe.data_vencimento_atual)}</dd>
                    <dt className="text-muted-foreground">Liquidação prevista</dt>
                    <dd>{formatDateBR(detalhe.data_liquidacao_prevista)}</dd>
                    <dt className="text-muted-foreground">Liquidação real</dt>
                    <dd>{formatDateBR(detalhe.data_liquidacao_real)}</dd>
                    <dt className="text-muted-foreground">Pago em (banco)</dt>
                    <dd>{formatDateBR(detalhe.data_pagamento_banco)}</dd>
                  </dl>
                </section>

                {detalhe.tipo_pagamento === "boleto" && (
                  <section>
                    <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      Boleto
                    </h4>
                    <div className="space-y-2">
                      <BadgeBoletoStatus
                        status={detalhe.boleto_status}
                        codigoRejeicao={detalhe.boleto_codigo_rejeicao}
                      />
                      {detalhe.boleto_status === "rejeitado" && detalhe.boleto_codigo_rejeicao && (
                        <MotivoRejeicaoSafra codigo={detalhe.boleto_codigo_rejeicao} />
                      )}
                      <div className="text-xs">
                        <span className="text-muted-foreground">Nosso número: </span>
                        <span className="font-mono">{detalhe.nosso_numero_seq ?? "—"}</span>
                      </div>
                      {detalhe.linha_digitavel && (
                        <div className="flex items-center gap-2">
                          <code className="text-[11px] break-all bg-muted px-2 py-1 rounded flex-1">
                            {detalhe.linha_digitavel}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copiar(detalhe.linha_digitavel!)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Boleto enviado em:{" "}
                        {detalhe.boleto_enviado_em
                          ? new Date(detalhe.boleto_enviado_em).toLocaleString("pt-BR")
                          : "—"}
                      </div>
                      {detalhe.boleto_status === "baixa_solicitada" && detalhe.reemissao_nova_data && (
                        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                          <AlertTriangle className="h-4 w-4 !text-amber-700" />
                          <AlertDescription className="text-xs space-y-2">
                            <div>
                              <span className="font-medium">Reemissão agendada</span> — novo vencimento{" "}
                              {formatDateBR(detalhe.reemissao_nova_data)}
                              {detalhe.reemissao_novo_valor != null
                                ? `, novo valor ${formatBRL(detalhe.reemissao_novo_valor)}`
                                : ""}
                              . Gere a remessa de baixa na aba Banco para efetivar.
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setCancelandoReemissao(detalhe)}
                            >
                              Cancelar reemissão
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}
                      {detalhe.reemissao_aplicada_em && (
                        <div className="text-xs text-muted-foreground">
                          Reemitido em{" "}
                          {new Date(detalhe.reemissao_aplicada_em).toLocaleString("pt-BR")}
                          {detalhe.reemissao_motivo ? ` — motivo: ${detalhe.reemissao_motivo}` : ""}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section>
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Valores
                  </h4>
                  <dl className="grid grid-cols-2 gap-y-1 gap-x-3 text-xs">
                    <dt className="text-muted-foreground">Bruto</dt>
                    <dd className="font-mono">{formatBRL(detalhe.valor_bruto)}</dd>
                    <dt className="text-muted-foreground">Juros</dt>
                    <dd className="font-mono">{formatBRL(detalhe.valor_juros)}</dd>
                    <dt className="text-muted-foreground">Multa</dt>
                    <dd className="font-mono">{formatBRL(detalhe.valor_multa)}</dd>
                    <dt className="text-muted-foreground">Desconto</dt>
                    <dd className="font-mono">-{formatBRL(detalhe.valor_desconto)}</dd>
                    <dt className="text-muted-foreground font-medium">Efetivo</dt>
                    <dd className="font-mono font-medium">{formatBRL(detalhe.valor_efetivo)}</dd>
                  </dl>
                </section>
              </div>

              <SheetFooter className="mt-6 flex-col gap-2 sm:flex-col">
                {detalhe.status_gestao !== "pago" && detalhe.status_gestao !== "cancelado" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBaixando(detalhe);
                    }}
                  >
                    Baixa manual
                  </Button>
                )}
                {detalhe.linha_digitavel && (
                  <Button variant="outline" onClick={() => copiar(detalhe.linha_digitavel!)}>
                    Copiar linha digitável
                  </Button>
                )}
                {detalhe.tipo_pagamento === "boleto" && (() => {
                  const isVencido = detalhe.boleto_status === "vencido";
                  const isRejeitado = detalhe.boleto_status === "rejeitado";
                  const bloqueado = isVencido || isRejeitado;
                  if (!podeReenviarBoleto(detalhe) && !bloqueado) return null;
                  const tooltipMsg = isVencido
                    ? "Boleto vencido não é pagável — use Reemitir boleto."
                    : isRejeitado
                    ? "Boleto rejeitado pelo banco."
                    : null;
                  const btn = (
                    <Button
                      variant="outline"
                      disabled={bloqueado || enviarBoleto.isPending}
                      onClick={() => !bloqueado && enviarBoleto.mutate(detalhe.id)}
                    >
                      {enviarBoleto.isPending ? "Enviando..." : "Reenviar boleto por e-mail"}
                    </Button>
                  );
                  if (!tooltipMsg) return btn;
                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
                        <TooltipContent>{tooltipMsg}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
                {detalhe.tipo_pagamento === "boleto" &&
                  (detalhe.boleto_status === "vencido" || detalhe.boleto_status === "rejeitado") &&
                  detalhe.status_gestao !== "pago" &&
                  detalhe.status_gestao !== "cancelado" && (
                    <Button variant="outline" onClick={() => setReemitindo(detalhe)}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reemitir boleto
                    </Button>
                  )}
                {detalhe.status_gestao === "pago" && (
                  <Button variant="outline" onClick={() => setConvertendo(detalhe)}>
                    Converter em crédito
                  </Button>
                )}
                {detalhe.pedido_id_externo && (
                  <Button onClick={() => navigate(`/pedidos/${detalhe.pedido_id}`)}>
                    Abrir pedido
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {baixando && (
        <BaixaManualDialog
          titulo={{
            id: baixando.id,
            numero_titulo: baixando.numero_titulo,
            data_vencimento_atual: baixando.data_vencimento_atual,
            valor_bruto: baixando.valor_bruto,
            valor_atual: baixando.valor_efetivo,
            boleto_status: baixando.boleto_status,
          }}
          onClose={() => {
            setBaixando(null);
            qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
          }}
        />
      )}

      {convertendo && (
        <ConverterTituloHaverDialog
          open={!!convertendo}
          onOpenChange={(v) => {
            if (!v) setConvertendo(null);
            qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
          }}
          tituloId={convertendo.id}
          numeroTitulo={convertendo.numero_titulo}
          valor={convertendo.valor_efetivo}
        />
      )}

      {reemitindo && (
        <ReemitirBoletoDialog
          titulo={reemitindo}
          open={!!reemitindo}
          onClose={() => setReemitindo(null)}
        />
      )}

      <AlertDialog
        open={!!cancelandoReemissao}
        onOpenChange={(v) => !v && setCancelandoReemissao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar reemissão?</AlertDialogTitle>
            <AlertDialogDescription>
              O boleto voltará ao status vencido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!cancelandoReemissao) return;
                const id = cancelandoReemissao.id;
                setCancelandoReemissao(null);
                const { error } = await (supabase as any).rpc("cancelar_reemissao_boleto", {
                  p_titulo_id: id,
                });
                if (error) {
                  sonnerToast.error(error.message ?? "Erro ao cancelar reemissão.");
                  return;
                }
                sonnerToast.success("Reemissão cancelada.");
                qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
                setDetalhe(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
