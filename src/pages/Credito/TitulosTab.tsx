import React, { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useTitulosCobranca,
  calcularKpis,
  tituloEntraNoKpi,
  type TituloCobranca,
} from "@/hooks/credito/useTitulosCobranca";
import { useEnviarEmailBoleto } from "@/hooks/credito/useEnviarEmailBoleto";
import { useEnviarEmailCobranca } from "@/hooks/credito/useEnviarEmailCobranca";
import { ConfirmarEnvioEmailDialog } from "@/components/credito/ConfirmarEnvioEmailDialog";
import { useEnviosBoletoTitulo, useHistoricoInstrumento } from "@/hooks/credito/useHistoricoTitulo";
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
import { Search, Copy, ExternalLink, RefreshCw, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { formatCNPJ } from "@/lib/cnpj";
import { apelidoParceiro } from "@/lib/parceiros/nome";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { BadgeBoletoStatus } from "@/components/credito/BadgeBoletoStatus";
import { AvisoBoletosVivos, BoletoVigenteLinhas } from "@/components/credito/AvisoBoletosVivos";
import { EsperaRetornoSafra } from "@/components/credito/EsperaRetornoSafra";
import { BadgeStatusGestao } from "@/lib/financeiro/status-gestao";
import { BaixaManualDialog } from "@/components/credito/BaixaManualDialog";
import { ConverterTituloHaverDialog } from "@/components/credito/ConverterTituloHaverDialog";
import { ReemitirBoletoDialog } from "@/components/credito/ReemitirBoletoDialog";
import { ProrrogarVencimentoDialog } from "@/components/credito/ProrrogarVencimentoDialog";
import { CancelarPedidoDialog } from "@/components/credito/CancelarPedidoDialog";
import { RegistrarDevolucaoDialog } from "@/components/credito/RegistrarDevolucaoDialog";
import { DevolucaoParcialDialog } from "@/components/credito/DevolucaoParcialDialog";
import { BaixarPorPerdaDialog } from "@/components/credito/BaixarPorPerdaDialog";
import { RenegociarTituloDialog } from "@/components/credito/RenegociarTituloDialog";
import { TituloTarefasBloco } from "@/components/credito/TituloTarefasBloco";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { useHistoricoReguaTitulo } from "@/hooks/credito/useReguaFila";
import type { SubestadoAtraso } from "@/hooks/credito/useTitulosCobranca";
import {
  BadgeRecebimento,
  BadgeInstrumento,
  SeloInadimplente,
  PRAZO_CLASSE_TEXTO,
} from "@/lib/financeiro/eixos-estado";
import { SeloPontualidade } from "@/lib/financeiro/pontualidade";
import { agruparPorPedido, grupoEhUnitario, grupoEstadoDividido, resumoComposicao, type GrupoPedido } from "@/lib/financeiro/agrupar-titulos";
import { useInvalidarRecebivel } from "@/hooks/recebivel/useInvalidarRecebivel";




type TipoFiltro = "todos" | "boleto" | "pix" | "cartao" | "haver" | "troca_mercadoria";

const SUBESTADO_LABEL: Record<string, string> = {
  lembrete_amistoso: "Lembrete amistoso",
  cobranca_ativa: "Cobrança ativa",
  cobranca_formal: "Cobrança formal",
  pre_juridico: "Pré-jurídico",
  notificacao_extrajudicial: "Notificação extrajudicial",
  protesto_solicitado: "Protesto solicitado",
  juridico: "Jurídico",
};

function BadgeSubestado({ sub }: { sub: SubestadoAtraso }) {
  if (!sub || sub === "em_dia") return null;
  return (
    <Badge variant="outline" className="text-[10px]">
      {SUBESTADO_LABEL[sub] ?? sub}
    </Badge>
  );
}


function HistoricoReguaSection({ tituloId }: { tituloId: string }) {
  const { data = [], isLoading } = useHistoricoReguaTitulo(tituloId, 5);
  if (isLoading || data.length === 0) return null;
  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Histórico da régua
      </h4>
      <ul className="space-y-1.5">
        {data.map((h) => (
          <li key={h.id} className="text-xs border-l-2 border-border pl-2">
            <div className="flex items-center gap-2">
              <span className="font-mono">{h.etapa_codigo}</span>
              <Badge variant="secondary" className="text-[10px]">{h.resultado}</Badge>
              {h.canal_efetivo && (
                <span className="text-muted-foreground">{h.canal_efetivo}</span>
              )}
            </div>
            <div className="text-muted-foreground">
              {new Date(h.executada_em).toLocaleString("pt-BR")}
            </div>
            {h.observacao && <div className="text-muted-foreground italic">{h.observacao}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

const EVENTO_LABEL: Record<string, string> = {
  reemissao_aplicada: "Reemissão aplicada",
  prorrogacao_confirmada: "Prorrogação confirmada",
  prorrogacao_rejeitada: "Prorrogação rejeitada",
  vencimento_alterado: "Vencimento alterado",
  boleto_marcado_vencido: "Boleto marcado vencido",
  boleto_reativado: "Boleto reativado",
};
function ReincidenteBadge({ tituloId }: { tituloId: string }) {
  const { data = [] } = useHistoricoInstrumento(tituloId, 20);
  const count = data.filter((h) => h.evento === "reemissao_aplicada" || h.evento === "prorrogacao_confirmada").length;
  if (count < 2) return null;
  return (
    <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning text-[10px]">
      Reincidente
    </Badge>
  );
}


function EnviosBoletoSection({ pedidoId, tituloId, fallback }: { pedidoId: string | null; tituloId: string; fallback: string | null }) {
  const { data = [] } = useEnviosBoletoTitulo(pedidoId, tituloId);
  if (data.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        {fallback
          ? `Boleto enviado em: ${new Date(fallback).toLocaleString("pt-BR")}`
          : "Nenhum envio registrado pelo sistema"}
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Envios</div>
      <ul className="space-y-1">
        {data.map((e) => (
          <li key={e.id} className="text-xs border-l-2 border-border pl-2">
            <div>{e.destinatario}</div>
            <div className="text-muted-foreground">
              {new Date(e.enviado_em).toLocaleString("pt-BR")}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoricoInstrumentoSection({ tituloId }: { tituloId: string }) {
  const { data = [], isLoading } = useHistoricoInstrumento(tituloId, 8);
  if (isLoading || data.length === 0) return null;
  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Histórico do instrumento
      </h4>
      <ul className="space-y-1.5">
        {data.map((h) => (
          <li key={h.id} className="text-xs border-l-2 border-border pl-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{EVENTO_LABEL[h.evento] ?? h.evento}</span>
              {h.origem && (
                <span className="text-muted-foreground">· {h.origem}</span>
              )}
            </div>
            {(h.data_anterior || h.data_nova) && (
              <div className="text-muted-foreground">
                {h.data_anterior ? formatDateBR(h.data_anterior) : "—"} → {h.data_nova ? formatDateBR(h.data_nova) : "—"}
              </div>
            )}
            {h.detalhe && <div className="text-muted-foreground italic">{h.detalhe}</div>}
            <div className="text-muted-foreground">
              {new Date(h.created_at).toLocaleString("pt-BR")}
            </div>
          </li>
        ))}
      </ul>
    </section>
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
      <div className="text-xs text-destructive">
        Rejeição {codigo}
      </div>
    );
  }
  return (
    <div className="text-xs text-destructive space-y-0.5">
      <div>Rejeição {codigo} — {data.descricao}</div>
      {data.observacao && (
        <div className="text-[11px] text-muted-foreground">{data.observacao}</div>
      )}
    </div>
  );
}

function KpiCard({
  label, qtd, valor, ativo, onClick, tone, labelTooltip, sublinha,
}: {
  label: string;
  qtd: number;
  valor: number;
  ativo: boolean;
  onClick: () => void;
  tone?: "default" | "danger" | "warn";
  labelTooltip?: string;
  sublinha?: string;
}) {
  const toneCls =
    tone === "danger"
      ? "border-destructive/40 text-destructive"
      : tone === "warn"
      ? "border-warning/40 text-warning"
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
      {labelTooltip ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs text-muted-foreground cursor-help">{label}</div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{labelTooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <div className="text-xs text-muted-foreground">{label}</div>
      )}
      <div className="text-lg font-medium mt-1">{qtd}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{formatBRL(valor)}</div>
      {sublinha && <div className="text-[10px] text-muted-foreground mt-0.5">{sublinha}</div>}
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
    troca_mercadoria: "Troca",
  };
  return map[t] ?? t ?? "—";
}

const TIPOS_FILTRO: TipoFiltro[] = [
  "todos",
  "boleto",
  "pix",
  "cartao",
  "haver",
  "troca_mercadoria",
];

function matchTipo(filtro: TipoFiltro, tipo: string): boolean {
  if (filtro === "todos") return true;
  if (filtro === "cartao") return (tipo ?? "").startsWith("cartao");
  return tipo === filtro;
}

/* ── predicados puros: cada estágio do filtro usa exatamente estes ── */

function matchBusca(t: TituloCobranca, q: string): boolean {
  if (!q) return true;
  const alvo = [
    t.parceiro_razao_social,
    t.parceiro_nome_fantasia,
    t.parceiro_cnpj,
    t.pedido_id_externo,
    t.numero_titulo,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return alvo.includes(q);
}

function matchData(t: TituloCobranca, vencDe: string, vencAte: string): boolean {
  if (vencDe && (t.data_vencimento_atual ?? "") < vencDe) return false;
  if (vencAte && (t.data_vencimento_atual ?? "") > vencAte) return false;
  return true;
}

/** "Todos" LISTA tudo, inclusive encerrados, que seguem fora dos números dos cards. */
function matchCards(t: TituloCobranca, cards: Set<string>, mesAtual: string): boolean {
  if (cards.has("todos")) return true;
  // Terminais que não são dívida: filtro próprio, fora dos KPIs de cobrança.
  if (cards.has("devolvido") && t.status_gestao === "devolvido") return true;
  if (cards.has("baixado_por_perda") && t.status_gestao === "baixado_por_perda") return true;
  const passa =
    (cards.has("a_vencer") && t.status_gestao === "a_vencer") ||
    (cards.has("vence_hoje") && t.status_gestao === "vence_hoje") ||
    (cards.has("atrasado") && t.status_gestao === "atrasado") ||
    (cards.has("pago_no_mes") &&
      (t.status_gestao === "pago" ||
        t.status_gestao === "pago_com_atraso" ||
        t.status_gestao === "pago_judicial") &&
      (t.data_pago_efetiva ?? "").slice(0, 7) === mesAtual);
  if (!passa) return false;
  return tituloEntraNoKpi(t);
}



function LinhaTitulo({
  t, aninhada, onAbrir, onPedido,
}: {
  t: TituloCobranca;
  aninhada?: boolean;
  onAbrir: (t: TituloCobranca) => void;
  onPedido: (pedidoId: string) => void;
}) {
  let liquid: React.ReactNode;
  if (t.data_liquidacao_real) {
    liquid = formatDateBR(t.data_liquidacao_real);
  } else if (t.data_pago_efetiva) {
    liquid = (
      <>
        <div className="text-sm">pago {formatDateBR(t.data_pago_efetiva)}</div>
        {t.data_liquidacao_prevista && (
          <div className="text-[10px] text-muted-foreground">
            prev. {formatDateBR(t.data_liquidacao_prevista)}
          </div>
        )}
      </>
    );
  } else if (t.data_liquidacao_prevista) {
    liquid = (
      <div className="text-sm text-muted-foreground">
        prev. {formatDateBR(t.data_liquidacao_prevista)}
      </div>
    );
  } else {
    liquid = "—";
  }
  const encerrada = t.eixo_status === "cancelado" || t.eixo_status === "devolvido";
  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-muted/50",
        aninhada && "bg-muted/10",
        encerrada && "opacity-60",
      )}
      onClick={() => onAbrir(t)}
    >
      <TableCell className={cn(aninhada && "pl-10")}>
        <div className="flex items-center gap-2">
          <span className={cn("font-mono text-xs", encerrada && "line-through")}>
            {t.numero_titulo}
          </span>
          {t.eh_entrada && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Entrada</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          parcela {t.numero_parcela}/{t.total_parcelas}
        </div>
      </TableCell>
      <TableCell>
        {!aninhada && (
          <>
            <p className="text-sm font-medium">{t.parceiro_razao_social ?? "—"}</p>
            {apelidoParceiro(t.parceiro_razao_social, t.parceiro_nome_fantasia) && (
              <p className="text-xs text-muted-foreground truncate">
                {apelidoParceiro(t.parceiro_razao_social, t.parceiro_nome_fantasia)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t.parceiro_cnpj ? formatCNPJ(t.parceiro_cnpj) : ""}
            </p>
          </>
        )}
      </TableCell>
      <TableCell>
        {aninhada ? null : t.pedido_id_externo ? (
          <button
            onClick={(e) => { e.stopPropagation(); onPedido(t.pedido_id); }}
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
        <Badge variant="outline" className="text-xs">{tipoLabel(t.tipo_pagamento)}</Badge>
      </TableCell>
      <TableCell className={cn("text-sm", PRAZO_CLASSE_TEXTO[t.eixo_prazo] ?? "")}>
        {formatDateBR(t.data_vencimento_atual)}
        {t.dias_atraso > 0 && <div className="text-xs text-destructive">há {t.dias_atraso}d</div>}
      </TableCell>
      <TableCell className="text-sm">{liquid}</TableCell>
      <TableCell className="text-right font-medium">{formatBRL(t.valor_efetivo)}</TableCell>
      <TableCell>
        <BadgeInstrumento eixo={t.eixo_instrumento} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <BadgeRecebimento eixo={t.eixo_recebimento} compensadoPor={t.compensado_por} />
          {t.eh_inadimplente === true && <SeloInadimplente />}
          <SeloPontualidade
            relogio={t.relogio_pontualidade}
            dias={t.dias_pontualidade}
            aguardandoCredito={t.aguardando_credito}
            statusGestao={t.status_gestao}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

function LinhaGrupo({
  g, aberto, onToggle, onPedido,
}: {
  g: GrupoPedido;
  aberto: boolean;
  onToggle: () => void;
  onPedido: (pedidoId: string) => void;
}) {
  const c = g.cabeca;
  const regerado = g.totalParcelasDeclarado > 0 && g.titulos.length > g.totalParcelasDeclarado;
  return (
    <TableRow className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={onToggle}>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {aberto
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs font-medium">
            {g.titulos.length} parcela{g.titulos.length !== 1 ? "s" : ""}
            {g.totalParcelasDeclarado > 0 ? ` de ${g.totalParcelasDeclarado}` : ""}
          </span>
        </div>
        {regerado && (
          <div className="text-[10px] text-warning pl-5">título regerado</div>
        )}
      </TableCell>
      <TableCell>
        <p className="text-sm font-medium">{c.parceiro_razao_social ?? "—"}</p>
        {apelidoParceiro(c.parceiro_razao_social, c.parceiro_nome_fantasia) && (
          <p className="text-xs text-muted-foreground truncate">
            {apelidoParceiro(c.parceiro_razao_social, c.parceiro_nome_fantasia)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {c.parceiro_cnpj ? formatCNPJ(c.parceiro_cnpj) : ""}
        </p>
      </TableCell>
      <TableCell>
        {g.pedidoRef && g.pedidoId ? (
          <button
            onClick={(e) => { e.stopPropagation(); onPedido(g.pedidoId!); }}
            className="font-mono text-xs text-primary hover:underline"
          >
            {g.pedidoRef}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm">{g.nfs.length > 0 ? g.nfs.join(", ") : "—"}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {g.formas.map((f) => (
            <Badge key={f} variant="outline" className="text-xs">{tipoLabel(f)}</Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className={cn("text-sm", g.atrasoMax > 0 && "text-destructive font-medium")}>
        {g.proximoVencimento ? formatDateBR(g.proximoVencimento) : "—"}
        {g.atrasoMax > 0 && <div className="text-xs text-destructive">há {g.atrasoMax}d</div>}
        {!g.proximoVencimento && (
          <div className="text-[10px] text-muted-foreground">nada em aberto</div>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">—</TableCell>
      <TableCell className="text-right">
        <div className="font-medium">{formatBRL(g.totalVisivel)}</div>
        <div className="text-[10px] text-muted-foreground">
          {g.ocultos > 0 ? `+${g.ocultos} fora do filtro` : "visível"}
          {g.encerradosVisiveis > 0
            ? ` · ${g.encerradosVisiveis} encerrada${g.encerradosVisiveis !== 1 ? "s" : ""} fora do total`
            : ""}
        </div>
      </TableCell>
      <TableCell>
        {g.instrumentoPrevalente
          ? <BadgeInstrumento eixo={g.instrumentoPrevalente} />
          : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <BadgeRecebimento eixo={g.recebimentoPrevalente} />
          {g.temInadimplente && <SeloInadimplente />}
        </div>
        {grupoEstadoDividido(g) && (
          <div className="text-[10px] text-muted-foreground">{resumoComposicao(g)}</div>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function TitulosTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidarRecebivel = useInvalidarRecebivel();
  const { toast } = useToast();
  const { data: titulos = [], isLoading } = useTitulosCobranca();

  const universo = titulos;
  const enviarBoleto = useEnviarEmailBoleto();
  const enviarCobranca = useEnviarEmailCobranca();
  const [confirmarEnvioBoleto, setConfirmarEnvioBoleto] = useState<TituloCobranca | null>(null);
  const [confirmarEnvioPix, setConfirmarEnvioPix] = useState<TituloCobranca | null>(null);

  const [cardsAtivos, setCardsAtivos] = useState<Set<string>>(
    new Set(["a_vencer", "vence_hoje", "atrasado"]),
  );


  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [busca, setBusca] = useState("");
  const [vencDe, setVencDe] = useState("");
  const [vencAte, setVencAte] = useState("");
  const [detalhe, setDetalhe] = useState<TituloCobranca | null>(null);
  const [params, setParams] = useSearchParams();
  const tituloDaUrl = params.get("titulo");
  const [baixando, setBaixando] = useState<TituloCobranca | null>(null);
  const [convertendo, setConvertendo] = useState<TituloCobranca | null>(null);
  const [reemitindo, setReemitindo] = useState<TituloCobranca | null>(null);
  const [cancelandoReemissao, setCancelandoReemissao] = useState<TituloCobranca | null>(null);
  const [prorrogando, setProrrogando] = useState<TituloCobranca | null>(null);
  const [cancelandoPedido, setCancelandoPedido] = useState<TituloCobranca | null>(null);
  const [devolvendo, setDevolvendo] = useState<TituloCobranca | null>(null);
  const [devolvendoParcial, setDevolvendoParcial] = useState<TituloCobranca | null>(null);
  const [baixandoPerda, setBaixandoPerda] = useState<TituloCobranca | null>(null);
  const [renegociando, setRenegociando] = useState<TituloCobranca | null>(null);

  const [agrupado, setAgrupado] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  function toggleGrupo(chave: string) {
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  /* Link vindo de uma tarefa (`?titulo={id}`): abre o drawer do título. */
  useEffect(() => {
    if (!tituloDaUrl || detalhe?.id === tituloDaUrl) return;
    const achado = titulos.find((t) => t.id === tituloDaUrl);
    if (achado) setDetalhe(achado);
  }, [tituloDaUrl, titulos, detalhe?.id]);

  const mesAtual = new Date().toISOString().slice(0, 7);
  const q = busca.trim().toLowerCase();

  function toggleCard(key: string) {
    setCardsAtivos((prev) => {
      // "Todos" é modo exclusivo: liga sozinho e apaga o anel dos outros.
      if (key === "todos") {
        return prev.has("todos") ? new Set<string>() : new Set<string>(["todos"]);
      }
      if (prev.has("todos")) return new Set<string>([key]);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }


  /* Estágio 1: tipo + busca + data. Base dos KPIs — cards refletem o chip. */
  const baseSemCards = useMemo(
    () =>
      universo.filter(
        (t) =>
          matchTipo(tipoFiltro, t.tipo_pagamento) &&
          matchBusca(t, q) &&
          matchData(t, vencDe, vencAte),
      ),
    [universo, tipoFiltro, q, vencDe, vencAte],
  );

  const kpis = useMemo(() => calcularKpis(baseSemCards), [baseSemCards]);

  /* Estágio 2: recorte dos cards sobre a base. */
  const filtrados = useMemo(
    () => baseSemCards.filter((t) => matchCards(t, cardsAtivos, mesAtual)),
    [baseSemCards, cardsAtivos, mesAtual],
  );

  /* Contagem dos chips: busca + data + cards, MAS NÃO tipo (anti-circular). */
  const contagemTipos = useMemo(() => {
    const base = universo.filter(
      (t) =>
        matchBusca(t, q) &&
        matchData(t, vencDe, vencAte) &&
        tituloEntraNoKpi(t) &&
        matchCards(t, cardsAtivos, mesAtual),
    );
    const c: Record<string, number> = {};
    for (const f of TIPOS_FILTRO) {
      c[f] = base.filter((t) => matchTipo(f, t.tipo_pagamento)).length;
    }
    return c;
  }, [universo, q, vencDe, vencAte, cardsAtivos, mesAtual]);



  const totalFiltrado = filtrados.reduce((acc, t) => acc + (t.valor_efetivo ?? 0), 0);

  /* Terminais neutros: contados à parte, nunca somados em atraso/inadimplência. */
  const kpisTerminais = useMemo(() => {
    const acc = {
      devolvido: { qtd: 0, valor: 0 },
      baixado_por_perda: { qtd: 0, valor: 0 },
    };
    for (const t of baseSemCards) {
      const alvo = acc[t.status_gestao as keyof typeof acc];
      if (!alvo) continue;
      alvo.qtd++;
      alvo.valor += t.valor_efetivo ?? 0;
    }
    return acc;
  }, [baseSemCards]);


  /* Estágio 3: agrupamento por pedido. `universo` entra de novo só para contar os ocultos — os títulos do mesmo pedido que os filtros escondem. */
  const grupos = useMemo(() => agruparPorPedido(filtrados, universo), [filtrados, universo]);

  async function copiar(txt: string) {
    try {
      await navigator.clipboard.writeText(txt);
      toast({ title: "Copiado!" });
    } catch {
      toast({ title: "Falha ao copiar", variant: "destructive" });
    }
  }

  // FONTE-UNICA-DO-BOLETO (02/09/2026): reenviar depende do boleto VIGENTE, nao do
  // `boleto_status` do titulo — que fica em `baixa_remessa_gerada` durante a
  // reemissao mesmo havendo boleto novo registrado e pagavel.
  const podeReenviarBoleto = (t: TituloCobranca) =>
    t.tipo_pagamento === "boleto" && t.boleto_vigente?.enviavel === true;

  return (
    <div className="space-y-4">
      {/* KPIs — clicar aplica o recorte */}
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
          labelTooltip="Mede pagamento, não liquidez. Cartão pago e ainda não creditado pela adquirente conta aqui."
          sublinha={kpis.pagoNoMesAguardando.qtd > 0
            ? `dos quais ${formatBRL(kpis.pagoNoMesAguardando.valor)} aguardando crédito`
            : undefined}
        />
        <KpiCard
          label="Todos"
          qtd={kpis.total.qtd}
          valor={kpis.total.valor}
          ativo={cardsAtivos.has("todos")}
          onClick={() => toggleCard("todos")}
        />
      </div>

      {/* Terminais que NÃO são inadimplência — fora dos números de atraso. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="Devolvido"
          labelTooltip="Mercadoria devolvida pelo cliente. Não é inadimplência."
          qtd={kpisTerminais.devolvido.qtd}
          valor={kpisTerminais.devolvido.valor}
          ativo={cardsAtivos.has("devolvido")}
          onClick={() => toggleCard("devolvido")}
        />
        <KpiCard
          label="Baixado por perda"
          labelTooltip="Título baixado por perda. Não é inadimplência."
          qtd={kpisTerminais.baixado_por_perda.qtd}
          valor={kpisTerminais.baixado_por_perda.valor}
          ativo={cardsAtivos.has("baixado_por_perda")}
          onClick={() => toggleCard("baixado_por_perda")}
        />
      </div>



      {/* Filtro por tipo de pagamento */}
      <div className="flex flex-wrap items-center gap-3">
        {TIPOS_FILTRO.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setTipoFiltro(f)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors tabular-nums",
              tipoFiltro === f
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:border-foreground/40",
            )}
          >
            {f === "todos" ? "Todos" : tipoLabel(f)} · {contagemTipos[f] ?? 0}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {([true, false] as const).map((modo) => (
            <button
              key={String(modo)}
              type="button"
              onClick={() => setAgrupado(modo)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                agrupado === modo
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40",
              )}
            >
              {modo ? "Agrupado por pedido" : "Lista plana"}
            </button>
          ))}
        </div>
      </div>


      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, nome fantasia, CNPJ, pedido ou título..."
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
              <TableHead>Instrumento</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={10} className="py-6">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  {cardsAtivos.size === 0
                    ? "Nenhum recorte selecionado — clique num card acima."
                    : "Nenhum título encontrado."}

                </TableCell>
              </TableRow>
            )}
            {!isLoading && agrupado && grupos.map((g) => {
              if (grupoEhUnitario(g)) {
                return (
                  <LinhaTitulo
                    key={g.chave}
                    t={g.titulos[0]}
                    onAbrir={setDetalhe}
                    onPedido={(id) => navigate(`/pedidos/${id}`)}
                  />
                );
              }
              const aberto = abertos.has(g.chave);
              return (
                <Fragment key={g.chave}>
                  <LinhaGrupo
                    g={g}
                    aberto={aberto}
                    onToggle={() => toggleGrupo(g.chave)}
                    onPedido={(id) => navigate(`/pedidos/${id}`)}
                  />
                  {aberto && g.titulos.map((t) => (
                    <LinhaTitulo
                      key={t.id}
                      t={t}
                      aninhada
                      onAbrir={setDetalhe}
                      onPedido={(id) => navigate(`/pedidos/${id}`)}
                    />
                  ))}
                </Fragment>
              );
            })}
            {!isLoading && !agrupado && filtrados.map((t) => (
              <LinhaTitulo
                key={t.id}
                t={t}
                onAbrir={setDetalhe}
                onPedido={(id) => navigate(`/pedidos/${id}`)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtrados.length} título{filtrados.length !== 1 ? "s" : ""}
        {agrupado ? ` em ${grupos.length} pedido${grupos.length !== 1 ? "s" : ""}` : ""} · {formatBRL(totalFiltrado)}
        {cardsAtivos.has("todos") && (
          <span className="ml-2">
            inclui encerrados (devolvido/cancelado), que não entram nos cards
          </span>
        )}
      </p>

      {/* Drawer detalhe */}
      <Sheet
        open={!!detalhe}
        onOpenChange={(o) => {
          if (o) return;
          setDetalhe(null);
          if (params.get("titulo")) {
            const next = new URLSearchParams(params);
            next.delete("titulo");
            setParams(next, { replace: true });
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detalhe && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between gap-3">
                  <SheetTitle className="font-mono text-base">{detalhe.numero_titulo}</SheetTitle>
                  <div className="flex items-center gap-2">
                    <BadgeInstrumento eixo={detalhe.eixo_instrumento} />
                    <BadgeRecebimento
                      eixo={detalhe.eixo_recebimento}
                      compensadoPor={detalhe.compensado_por}
                    />
                    {detalhe.eh_inadimplente === true && <SeloInadimplente />}


                  </div>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  <BadgeStatusGestao status={detalhe.status_gestao} />
                  <BadgeSubestado sub={detalhe.subestado_atraso} />
                  <SeloPontualidade
                    relogio={detalhe.relogio_pontualidade}
                    dias={detalhe.dias_pontualidade}
                    aguardandoCredito={detalhe.aguardando_credito}
                    statusGestao={detalhe.status_gestao}
                  />
                  {detalhe.titulo_renegociado_origem_id && (
                    <Badge variant="outline" className="text-[10px]">
                      Título renegociado
                    </Badge>
                  )}
                </div>
                <SheetDescription className="text-2xl font-medium text-foreground pt-2">
                  {formatBRL(detalhe.valor_efetivo)}
                </SheetDescription>
              </SheetHeader>

              {detalhe.inconsistencia_pagamento && (
                <Alert className="mt-4 border-destructive/40 bg-destructive/10">
                  <AlertTriangle className="h-4 w-4 !text-destructive" />
                  <AlertDescription className="text-xs text-destructive">
                    ⚠ Inconsistência: este título tem data de pagamento registrada mas não está marcado como pago.
                    Verifique com o financeiro antes de qualquer ação.
                  </AlertDescription>
                </Alert>
              )}

              {detalhe.pausa_regua_automatica && (
                <Alert className="mt-4 border-warning/40 bg-warning/10">
                  <AlertTriangle className="h-4 w-4 !text-warning" />
                  <AlertDescription className="text-xs text-warning flex items-center justify-between gap-2">
                    <span>Régua pausada — título fora da fila automática.</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={async () => {
                        const { data, error } = await (supabase as any).rpc(
                          "despausar_regua_titulo",
                          { p_titulo_id: detalhe.id },
                        );
                        if (error || (data && data.ok === false)) {
                          sonnerToast.error(error?.message ?? data?.erro ?? "Erro ao despausar.");
                          return;
                        }
                        sonnerToast.success("Régua despausada.");
                      }}
                    >
                      Despausar
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4 mt-6 text-sm">

                <section>
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Cliente
                  </h4>
                  <p className="font-medium">{detalhe.parceiro_razao_social ?? "—"}</p>
                  {apelidoParceiro(detalhe.parceiro_razao_social, detalhe.parceiro_nome_fantasia) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {apelidoParceiro(detalhe.parceiro_razao_social, detalhe.parceiro_nome_fantasia)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {detalhe.parceiro_cnpj ? formatCNPJ(detalhe.parceiro_cnpj) : ""}
                  </p>
                  {(() => {
                    const emailCob = detalhe.parceiro_email_cobranca ?? detalhe.parceiro_email;
                    if (!emailCob) return null;
                    return (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="text-xs">
                          <span className="text-muted-foreground">E-mail de cobrança: </span>
                          <span>{emailCob}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copiar(emailCob)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })()}
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
                    {detalhe.data_pago_efetiva && (
                      <>
                        <dt className="text-muted-foreground">Pago pelo cliente</dt>
                        <dd>{formatDateBR(detalhe.data_pago_efetiva)}</dd>
                      </>
                    )}
                    {(detalhe.data_liquidacao_prevista !== null || detalhe.tipo_pagamento?.startsWith("cartao")) && (
                      <>
                        <dt className="text-muted-foreground">Liquidação prevista</dt>
                        <dd>{formatDateBR(detalhe.data_liquidacao_prevista)}</dd>
                      </>
                    )}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <BadgeBoletoStatus
                          status={detalhe.boleto_status}
                          codigoRejeicao={detalhe.boleto_codigo_rejeicao}
                        />
                        <BadgeConciliacaoExtrato tituloId={detalhe.id} statusReal={detalhe.status_real} />
                        <ReincidenteBadge tituloId={detalhe.id} />
                      </div>
                      {detalhe.boleto_status === "rejeitado" && detalhe.boleto_codigo_rejeicao && (
                        <MotivoRejeicaoSafra codigo={detalhe.boleto_codigo_rejeicao} />
                      )}
                      <EsperaRetornoSafra tituloId={detalhe.id} />
                      <AvisoBoletosVivos tituloId={detalhe.id} />
                      <BoletoVigenteLinhas
                        tituloId={detalhe.id}
                        fallbackNossoNumero={detalhe.nosso_numero_seq}
                        onCopiar={copiar}
                      />
                      <EnviosBoletoSection
                        pedidoId={detalhe.pedido_id}
                        tituloId={detalhe.id}
                        fallback={detalhe.boleto_enviado_em}
                      />
                      {detalhe.boleto_status === "baixa_solicitada" && detalhe.reemissao_nova_data && (
                        <Alert className="border-warning/40 bg-warning/10 text-warning">
                          <AlertTriangle className="h-4 w-4 !text-warning" />
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
                      {detalhe.prorrogacao_nova_data && (
                        <Alert className="border-warning/40 bg-warning/10">
                          <AlertDescription className="text-warning text-xs">
                            Prorrogação para {formatDateBR(detalhe.prorrogacao_nova_data)} pendente
                            {detalhe.prorrogacao_solicitada_em
                              ? " — remessa já enviada ao banco."
                              : " — aguardando geração de remessa."}
                            {!detalhe.prorrogacao_solicitada_em && (
                              <button
                                className="ml-2 underline text-warning text-xs"
                                onClick={async () => {
                                  const { data, error } = await (supabase as any).rpc(
                                    "cancelar_prorrogacao_boleto",
                                    { p_titulo_id: detalhe.id },
                                  );
                                  if (error || (data && data.ok === false)) {
                                    sonnerToast.error(
                                      error?.message ?? data?.erro ?? "Erro ao cancelar prorrogação.",
                                    );
                                    return;
                                  }
                                  sonnerToast.success("Prorrogação cancelada.");
                                }}
                              >
                                Cancelar
                              </button>
                            )}
                          </AlertDescription>
                        </Alert>
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

                {detalhe.tipo_pagamento === "pix" && (
                  <section>
                    <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      PIX
                    </h4>
                    {detalhe.link_pagamento ? (
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] break-all bg-muted px-2 py-1 rounded flex-1 truncate">
                          {detalhe.link_pagamento}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copiar(detalhe.link_pagamento!)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Alert className="border-warning/40 bg-warning/10">
                        <AlertTriangle className="h-4 w-4 !text-warning" />
                        <AlertDescription className="text-xs text-warning">
                          Sem link de pagamento — informe o link no detalhe da cobrança para habilitar o envio ao cliente.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="mt-2">
                      <EnviosBoletoSection
                        pedidoId={detalhe.pedido_id}
                        tituloId={detalhe.id}
                        fallback={detalhe.email_cobranca_enviado_em}
                      />
                    </div>
                  </section>
                )}

                <HistoricoInstrumentoSection tituloId={detalhe.id} />
                <HistoricoReguaSection tituloId={detalhe.id} />

                <TituloTarefasBloco tituloId={detalhe.id} />
              </div>


              <SheetFooter className="mt-6 flex-col gap-2 sm:flex-col">
                {(() => {
                  const estagio = detalhe.pedido_estagio ?? "";
                  const posNF = estagio === "faturado" || estagio === "em_transporte" || estagio === "entregue";
                  const preNF = !!estagio && !posNF;
                  const isTerminal = detalhe.eixo_status === "pago"
                    || detalhe.eixo_status === "compensado"
                    || detalhe.eixo_status === "devolvido"
                    || detalhe.eixo_status === "cancelado";

                  const podeRenegociar = !isTerminal;
                  const podePerda = !isTerminal;

                  return (
                    <>
                      {/* Encerramento por PEDIDO — Pré-NF: Cancelar (afeta pedido inteiro) */}
                      {preNF && !isTerminal && (
                        <Button
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setCancelandoPedido(detalhe)}
                        >
                          Cancelar pedido (afeta pedido inteiro)
                        </Button>
                      )}

                      {/* Encerramento por PEDIDO — Pós-NF: Registrar devolução TOTAL */}
                      {posNF && (
                        <Button
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDevolvendo(detalhe)}
                        >
                          Registrar devolução total (pedido inteiro)
                        </Button>
                      )}

                      {/* Devolução PARCIAL — Pós-NF: gera haver, não encerra */}
                      {posNF && (
                        <Button
                          variant="outline"
                          className="border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
                          onClick={() => setDevolvendoParcial(detalhe)}
                        >
                          Devolução parcial (parte do valor)
                        </Button>
                      )}

                      {/* Encerramento por TÍTULO — Pós-NF: Baixar por perda */}
                      {posNF && (() => {
                        const btn = (
                          <Button
                            variant="outline"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={!podePerda}
                            onClick={() => podePerda && setBaixandoPerda(detalhe)}
                          >
                            Baixar por perda (só este título)
                          </Button>
                        );
                        if (podePerda) return btn;
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
                              <TooltipContent>Só títulos em aberto.</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}

                      {/* Renegociar — Pós-NF */}
                      {posNF && podeRenegociar && (
                        <Button variant="outline" onClick={() => setRenegociando(detalhe)}>
                          Renegociar
                        </Button>
                      )}

                      {/* Baixa manual — em qualquer estágio (registro de pagamento por fora) */}
                      {detalhe.eixo_status === "a_vencer" && (
                        <div className="flex flex-col gap-1">
                          <Button variant="outline" onClick={() => setBaixando(detalhe)}>
                            Baixa manual — cliente pagou por fora
                          </Button>
                          <p className="text-[10px] text-muted-foreground px-1">
                            Registra pagamento real recebido fora do fluxo bancário. Não é encerramento.
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
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
                      onClick={() => !bloqueado && setConfirmarEnvioBoleto(detalhe)}
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
                {detalhe.tipo_pagamento === "pix" && (
                  <Button
                    variant="outline"
                    disabled={!detalhe.link_pagamento || enviarCobranca.isPending}
                    onClick={() => setConfirmarEnvioPix(detalhe)}
                  >
                    {enviarCobranca.isPending ? "Enviando..." : "Enviar cobrança por e-mail"}
                  </Button>
                )}
                {detalhe.tipo_pagamento === "boleto" &&
                  (detalhe.boleto_status === "vencido" || detalhe.boleto_status === "rejeitado") &&
                  detalhe.eixo_status === "a_vencer" && (
                    <Button variant="outline" onClick={() => setReemitindo(detalhe)}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reemitir boleto
                    </Button>
                  )}
                {detalhe.tipo_pagamento === "boleto" &&
                  detalhe.boleto_status === "registrado" &&
                  detalhe.eixo_status === "a_vencer" &&
                  detalhe.prorrogacao_nova_data === null && (
                    <Button variant="outline" onClick={() => setProrrogando(detalhe)}>
                      Prorrogar vencimento
                    </Button>
                  )}
                {(detalhe.eixo_status === "pago" || detalhe.eixo_status === "compensado") && (

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
          tipoPagamento={baixando.tipo_pagamento}
          onClose={() => {
            setBaixando(null);
          }}
        />
      )}

      {convertendo && (
        <ConverterTituloHaverDialog
          open={!!convertendo}
          onOpenChange={(v) => {
            if (!v) setConvertendo(null);
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

      {prorrogando && (
        <ProrrogarVencimentoDialog
          titulo={prorrogando}
          open={!!prorrogando}
          onClose={() => setProrrogando(null)}
        />
      )}

      {cancelandoPedido && (
        <CancelarPedidoDialog
          pedidoId={cancelandoPedido.pedido_id}
          pedidoIdExterno={cancelandoPedido.pedido_id_externo}
          open={!!cancelandoPedido}
          onClose={() => {
            setCancelandoPedido(null);
            setDetalhe(null);
          }}
        />
      )}

      {devolvendo && (
        <RegistrarDevolucaoDialog
          pedidoId={devolvendo.pedido_id}
          pedidoIdExterno={devolvendo.pedido_id_externo}
          open={!!devolvendo}
          onClose={() => {
            setDevolvendo(null);
            setDetalhe(null);
          }}
        />
      )}

      {devolvendoParcial && (
        <DevolucaoParcialDialog
          pedidoId={devolvendoParcial.pedido_id}
          pedidoIdExterno={devolvendoParcial.pedido_id_externo}
          parceiroId={devolvendoParcial.parceiro_id}
          open={!!devolvendoParcial}
          onClose={() => {
            setDevolvendoParcial(null);
            setDetalhe(null);
          }}
        />
      )}


      {baixandoPerda && (
        <BaixarPorPerdaDialog
          tituloId={baixandoPerda.id}
          numeroTitulo={baixandoPerda.numero_titulo}
          valor={baixandoPerda.valor_efetivo}
          open={!!baixandoPerda}
          onClose={() => {
            setBaixandoPerda(null);
            setDetalhe(null);
          }}
        />
      )}

      {renegociando && (
        <RenegociarTituloDialog
          titulo={renegociando}
          etapa={null}
          open={!!renegociando}
          onClose={() => {
            setRenegociando(null);
          }}
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
                setDetalhe(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {confirmarEnvioBoleto && (
        <ConfirmarEnvioEmailDialog
          open={!!confirmarEnvioBoleto}
          onOpenChange={(v) => !v && setConfirmarEnvioBoleto(null)}
          titulo={confirmarEnvioBoleto}
          emailPadrao={confirmarEnvioBoleto.parceiro_email_cobranca ?? confirmarEnvioBoleto.parceiro_email ?? null}
          loading={enviarBoleto.isPending}
          titleLabel="Reenviar boleto por e-mail"
          onConfirm={(destinatarios) => {
            enviarBoleto.mutate(
              { titulo_id: confirmarEnvioBoleto.id, destinatarios },
              { onSuccess: () => setConfirmarEnvioBoleto(null) },
            );
          }}
        />
      )}

      {confirmarEnvioPix && (
        <ConfirmarEnvioEmailDialog
          open={!!confirmarEnvioPix}
          onOpenChange={(v) => !v && setConfirmarEnvioPix(null)}
          titulo={confirmarEnvioPix}
          emailPadrao={confirmarEnvioPix.parceiro_email_cobranca ?? confirmarEnvioPix.parceiro_email ?? null}
          loading={enviarCobranca.isPending}
          titleLabel="Enviar cobrança por e-mail"
          onConfirm={(destinatarios) => {
            enviarCobranca.mutate(
              { titulo_id: confirmarEnvioPix.id, destinatarios },
              { onSuccess: () => setConfirmarEnvioPix(null) },
            );
          }}
        />
      )}
    </div>
  );
}

function BadgeConciliacaoExtrato({ tituloId, statusReal }: { tituloId: string; statusReal: string }) {
  const isPagoBanco = statusReal === "pago_banco" || statusReal === "pago_banco_com_atraso";
  const { data } = useQuery({
    queryKey: ["conciliacao-extrato-titulo", tituloId],
    enabled: isPagoBanco,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tit, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select("movimentacao_baixa_id")
        .eq("id", tituloId)
        .maybeSingle();
      if (error) throw error;
      const movId = (tit as { movimentacao_baixa_id: string | null } | null)?.movimentacao_baixa_id;
      if (!movId) return { conciliado: false };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mov, error: e2 } = await (supabase as any)
        .from("movimentacoes_bancarias")
        .select("casada_com_id")
        .eq("id", movId)
        .maybeSingle();
      if (e2) throw e2;
      const casada = !!(mov as { casada_com_id: string | null } | null)?.casada_com_id;
      return { conciliado: casada };
    },
  });

  if (!isPagoBanco) return null;
  const conciliado = data?.conciliado;

  if (conciliado) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-success text-white hover:bg-success">Conciliado</Badge>
          </TooltipTrigger>
          <TooltipContent>Liquidação batida com o extrato bancário</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <Badge variant="secondary" className="bg-muted text-muted-foreground">
      Aguardando extrato
    </Badge>
  );
}
