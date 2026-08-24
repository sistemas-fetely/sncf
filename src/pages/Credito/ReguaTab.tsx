import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Star, AlertTriangle, Users, Play, Send, ChevronRight, CheckCircle2, Minus } from "lucide-react";
import {
  useReguaEtapas,
  useReguaFilaHoje,
  useReguaPausados,
  useReguaVencidoForaDaFila,
  resolverEtapaParaTitulo,
  etapaUltimaDoTitulo,
  type ReguaEtapa,
} from "@/hooks/credito/useReguaFila";

import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { apelidoParceiro, nomeCanonico } from "@/lib/parceiros/nome";
import { AcaoReguaDialog } from "@/components/credito/AcaoReguaDialog";
import { PausarReguaDialog } from "@/components/credito/PausarReguaDialog";
import { RenegociarTituloDialog } from "@/components/credito/RenegociarTituloDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LinhaMesa } from "@/lib/financeiro/adaptar-titulo-mesa";
import { seloEntrega, seloEnvio, EntregaResumoInline, Selo, fmtDataMesa } from "@/lib/financeiro/mesa-lastros";
import {
  useBoletoVencimentoConferencia,
  type BoletoVencimentoConferencia,
} from "@/hooks/credito/useBoletoVencimentoConferencia";
import { EnviarPacoteDialog } from "@/components/credito/EnviarPacoteDialog";

type Vista = "fila" | "pausados";

const CANAL_LABEL: Record<string, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  carta: "Carta",
  cartorio: "Cartório",
  advogado: "Advogado",
};

function KpiCard({
  label, valor, total, ativo, onClick, tone,
}: {
  label: string;
  valor: number;
  total: number;
  ativo: boolean;
  onClick: () => void;
  tone?: "default" | "danger" | "warn";
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
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-medium mt-1">{valor}</div>
      <div className="text-xs text-muted-foreground tabular-nums">{formatBRL(total)}</div>
    </button>
  );
}

const FONTE_LABEL: Record<string, string> = {
  retorno_cnab: "retorno CNAB do banco",
  instrucoes_2via: "relatório Instruções 2ª via do Safra",
  francesinha: "francesinha do Safra",
  carteira_safra: "carteira do Safra (import sem origem registrada)",
  remessa_enviada: "remessa que ENVIAMOS ao banco — não é confirmação do banco",
  sem_prova: "sem prova",
};

function SeloConferencia({ c }: { c: BoletoVencimentoConferencia | undefined }) {
  if (!c) return null;
  if (c.situacao === "CONFERE") {
    return (
      <Selo
        texto="vencimento conferido"
        tom="verde"
        tooltip={`Data confirmada pela fonte: ${FONTE_LABEL[c.fonte_prova ?? ""] ?? c.fonte_prova ?? "não informada"}`}
      />
    );
  }
  if (c.situacao === "DIVERGENTE") {
    return (
      <Selo
        texto="vencimento diverge do banco"
        tom="vermelho"
        tooltip={`sistema ${fmtDataMesa(c.venc_sistema)} · banco ${fmtDataMesa(c.venc_banco)}`}
      />
    );
  }
  return (
    <Selo
      texto="vencimento não conferido"
      tom="ambar"
      tooltip="nenhuma prova do banco para este boleto — importe um retorno CNAB ou a francesinha"
    />
  );
}

/**
 * Título sem ação pendente: uma linha, não um card. Continua 100% visível e
 * clicável — expande no card completo. Verde aqui é SELO, nunca fundo: verde
 * de fundo colide com os selos de lastro (que já são verdes) e, em tela
 * financeira, é lido como "pago" — e estes são recebíveis em aberto.
 */
function LinhaCompacta({
  titulo, contatadoEm, aberto, onToggle,
}: {
  titulo: TituloCobranca;
  contatadoEm: string | null;
  aberto: boolean;
  onToggle: () => void;
}) {
  const razao = nomeCanonico(titulo.parceiro_razao_social, "—");
  const mesa = (titulo as any)._mesa as LinhaMesa | undefined;
  const vencimento = mesa?.vencimento ?? titulo.data_vencimento_atual ?? null;
  const atraso = titulo.dias_atraso ?? 0;
  const vencido = atraso > 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={aberto}
      className={cn(
        "w-full flex items-center gap-2 rounded-md border bg-card/60 px-2.5 py-1.5 text-left hover:bg-accent/50 transition-colors",
        vencido && "border-l-4 border-l-destructive",
      )}
    >
      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
      <span className="text-xs font-medium truncate min-w-0 flex-1">{razao}</span>
      <span className="hidden md:inline text-[10px] font-mono text-muted-foreground shrink-0">
        {[titulo.pedido_id_externo || null, titulo.numero_titulo, titulo.total_parcelas > 1 ? `parcela ${titulo.numero_parcela}/${titulo.total_parcelas}` : null].filter(Boolean).join(" · ")}
      </span>
      <TooltipProvider>
        {vencido ? (
          <Selo
            texto={`vencido há ${atraso}d${contatadoEm ? ` · contatado ${fmtDataMesa(contatadoEm)}` : ""}`}
            tom="vermelho"
            tooltip={
              contatadoEm
                ? "Título vencido. A etapa da régua já foi cumprida — o que está em dia é a régua, não o título."
                : "Título vencido."
            }
          />
        ) : contatadoEm ? (
          <Selo
            texto={`régua em dia · contato ${fmtDataMesa(contatadoEm)}`}
            tom="verde"
            tooltip="Etapa da régua já cumprida — nada a fazer neste título hoje."
          />
        ) : (
          <Selo
            texto={atraso === 0 ? "vence hoje" : `vence ${fmtDataMesa(vencimento)}`}
            tom="neutro"
            tooltip="Ainda não chegou a data de nenhuma etapa da régua."
          />
        )}
      </TooltipProvider>
      <Badge variant={vencido ? "destructive" : "outline"} className="text-[10px] shrink-0">
        {atraso === 0 ? "hoje" : vencido ? `há ${atraso}d` : `D${atraso}`}
      </Badge>
      <span className="text-xs font-medium tabular-nums shrink-0 w-24 text-right">
        {formatBRL(titulo.valor_efetivo)}
      </span>
    </button>
  );
}
function CardTitulo({
  titulo, etapa, acaoAtrasada, conferencia, zonaAtraso, onAcao, onPular, onPausar, onRenegociar, onEnviarPacote, onReenviar,
}: {
  titulo: TituloCobranca;
  etapa: ReguaEtapa | null;
  acaoAtrasada?: boolean;
  /** Card da zona EM ATRASO: borda vermelha e valor com degrau tipográfico. */
  zonaAtraso?: boolean;
  conferencia?: BoletoVencimentoConferencia;
  onAcao: () => void;
  onPular: () => void;
  onPausar: () => void;
  onRenegociar: () => void;
  onEnviarPacote: (l: LinhaMesa) => void;
  onReenviar: () => void;
}) {
  const razao = nomeCanonico(titulo.parceiro_razao_social, "—");
  const apelido = apelidoParceiro(titulo.parceiro_razao_social, titulo.parceiro_nome_fantasia);
  const proxima = (titulo as any).data_proxima_acao_regua as string | null | undefined;
  const mesa = (titulo as any)._mesa as LinhaMesa | undefined;
  const ultima = (titulo as any)._mesa?.etapa_ultima_em as string | null | undefined;
  const vencimento = mesa?.vencimento ?? titulo.data_vencimento_atual ?? null;
  const atraso = titulo.dias_atraso ?? 0;
  const vencido = atraso > 0;
  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3 space-y-2",
        zonaAtraso && "border-l-4 border-l-destructive",
        acaoAtrasada && vencido && "border-destructive/60 ring-1 ring-destructive/30 bg-destructive/5",
      )}
    >
      {acaoAtrasada && (
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-medium",
          vencido ? "text-destructive" : "text-muted-foreground"
        )}>
          <AlertTriangle className="h-3 w-3" />
          Ação da régua atrasada
          {proxima && <span className="font-normal">· prevista para {String(proxima).slice(0, 10).split("-").reverse().join("/")}</span>}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{razao}</p>
          {apelido && <p className="text-xs text-muted-foreground truncate">{apelido}</p>}
          <p className="text-xs text-muted-foreground">
            {titulo.parceiro_cnpj ? formatCNPJ(titulo.parceiro_cnpj) : ""}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {[titulo.pedido_id_externo || null, titulo.numero_titulo, titulo.total_parcelas > 1 ? `parcela ${titulo.numero_parcela}/${titulo.total_parcelas}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={cn("font-medium", zonaAtraso ? "text-base text-destructive" : "text-sm")}>
            {formatBRL(titulo.valor_efetivo)}
          </div>
          {atraso > 0 ? (
            <Badge variant="destructive" className="text-[10px]">
              {zonaAtraso ? `há ${atraso} ${atraso === 1 ? "dia" : "dias"}` : `há ${atraso}d`}
            </Badge>
          ) : atraso < 0 ? (
            <Badge variant="outline" className="text-[10px]">
              D{titulo.dias_atraso}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">hoje</Badge>
          )}
        </div>
      </div>

      <TooltipProvider>
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1.5">
          <span className="text-sm font-medium tabular-nums">
            {atraso === 0 ? "vence hoje" : `vence ${fmtDataMesa(vencimento)}`}
          </span>
          {atraso > 0 ? (
            <Badge variant="destructive" className="text-[10px]">há {titulo.dias_atraso}d</Badge>
          ) : atraso < 0 ? (
            <Badge variant="outline" className="text-[10px]">D{titulo.dias_atraso}</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">hoje</Badge>
          )}
          <SeloConferencia c={conferencia} />
        </div>
      </TooltipProvider>


      <div className="flex flex-wrap gap-1">
        {/* ETAPA-E-BADGE-NAO-EIXO: cadência é rótulo do card, não agrupamento. */}
        {etapa && (
          <Badge variant="outline" className="text-[10px]">
            {etapa.descricao_acao} · D{etapa.dias_offset >= 0 ? `+${etapa.dias_offset}` : etapa.dias_offset}
          </Badge>
        )}
        {etapa && (
          <Badge variant="secondary" className="text-[10px]">
            {CANAL_LABEL[etapa.canal_sugerido] ?? etapa.canal_sugerido}
          </Badge>
        )}
        {titulo.vip_relacionamento && (
          <Badge className="text-[10px] bg-warning/10 text-warning border border-warning/40">
            <Star className="h-3 w-3 mr-0.5" /> VIP
          </Badge>
        )}
        {titulo.flag_bandeira_amarela && (
          <Badge className="text-[10px] bg-warning/10 text-warning border border-warning/40">
            <AlertTriangle className="h-3 w-3 mr-0.5" /> Bandeira amarela
          </Badge>
        )}
        {titulo.flag_grupo_economico_inadimplente && (
          <Badge className="text-[10px] bg-destructive/10 text-destructive border border-destructive/40">
            <Users className="h-3 w-3 mr-0.5" /> Grupo inadimplente
          </Badge>
        )}
      </div>
      {(() => {
        const l = (titulo as any)._mesa as LinhaMesa | undefined;
        if (!l) return null;
        return (
          <TooltipProvider>
            <div className="flex flex-wrap items-center gap-1">
              {seloEntrega(l)}
              {seloEnvio(l)}
            </div>
            <EntregaResumoInline l={l} />
          </TooltipProvider>
        );
      })()}

      {(titulo as any).regua_cobrar_sem_boleto && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] font-medium text-warning">
          <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5" />
          Cobrar a dívida, mas NÃO reenviar este boleto — vencido, precisa reemissão
        </div>
      )}

      {!etapa && ultima && (
        <div className="text-[11px] text-muted-foreground">
          Régua em dia — último contato em {fmtDataMesa(ultima)}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button size="sm" className="h-7 text-xs" onClick={onAcao} disabled={!etapa}>
          Registrar ação
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPular} disabled={!etapa}>
          Pular
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPausar}>
          Pausar
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRenegociar}>
          Renegociar
        </Button>
        {!etapa && ultima && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onReenviar}>
            Reenviar lembrete
          </Button>
        )}
        {(() => {
          const l = (titulo as any)._mesa as LinhaMesa | undefined;
          if (!l?.pedido_id || l.fila !== "A_ENVIAR") return null;
          return (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onEnviarPacote(l)}
            >
              <Send className="h-3 w-3 mr-1" /> Enviar pacote
            </Button>
          );
        })()}
      </div>
    </div>
  );
}

/**
 * Zona 2 — VENCIDO FORA DA RÉGUA. Bloqueio operacional, não inadimplência
 * confirmada: tom âmbar e SEM ação de cobrança. Motivo e ação vêm do banco
 * já em português — a tela não traduz nem recalcula.
 */
function CardForaDaRegua({
  titulo, onRenegociar, onVerTitulo,
}: {
  titulo: TituloCobranca;
  onRenegociar: () => void;
  onVerTitulo: () => void;
}) {
  const razao = nomeCanonico(titulo.parceiro_razao_social, "—");
  const apelido = apelidoParceiro(titulo.parceiro_razao_social, titulo.parceiro_nome_fantasia);
  const mesa = (titulo as any)._mesa as LinhaMesa | undefined;
  const atraso = titulo.dias_atraso ?? 0;
  return (
    <div className="rounded-md border border-l-4 border-l-warning bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{razao}</p>
          {apelido && <p className="text-xs text-muted-foreground truncate">{apelido}</p>}
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {[titulo.pedido_id_externo || null, titulo.numero_titulo,
              titulo.total_parcelas > 1 ? `parcela ${titulo.numero_parcela}/${titulo.total_parcelas}` : null]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-medium text-base text-warning">{formatBRL(titulo.valor_efetivo)}</div>
          <Badge className="text-[10px] bg-warning/10 text-warning border border-warning/40">
            há {atraso} {atraso === 1 ? "dia" : "dias"}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        vence {fmtDataMesa(mesa?.vencimento ?? titulo.data_vencimento_atual)}
      </p>

      {mesa?.acao_sugerida && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] font-medium text-warning">
          <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5" />
          {mesa.acao_sugerida}
        </div>
      )}
      {mesa?.regua_motivo_inelegivel && (
        <p className="text-[11px] text-muted-foreground">{mesa.regua_motivo_inelegivel}</p>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRenegociar}>
          Renegociar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onVerTitulo}>
          Ver título
        </Button>
      </div>
    </div>
  );
}

/** Cabeçalho de zona — o eixo da tela é atraso, nunca etapa. */
function ZonaHeader({
  titulo, qtd, total, tom, id,
}: {
  titulo: string;
  qtd: number;
  total: number;
  tom: "destructive" | "warning" | "muted";
  id: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border px-3 py-2 scroll-mt-4",
        tom === "destructive" && "border-destructive/40 bg-destructive/5 text-destructive",
        tom === "warning" && "border-warning/40 bg-warning/10 text-warning",
        tom === "muted" && "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <h3 className="text-sm font-medium uppercase tracking-wide">{titulo}</h3>
      <span className="text-xs tabular-nums">
        {qtd} {qtd === 1 ? "título" : "títulos"} · {formatBRL(total)}
      </span>
    </div>
  );
}

function ZonaVazia({ texto, tom }: { texto: string; tom: "success" | "muted" }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs">
      {tom === "success" ? (
        <CheckCircle2 className="h-4 w-4 text-success" />
      ) : (
        <Minus className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={tom === "success" ? "text-success" : "text-muted-foreground"}>{texto}</span>
    </div>
  );
}

async function despausarTitulo(tituloId: string, qc: ReturnType<typeof useQueryClient>) {
  const { data, error } = await (supabase as any).rpc("despausar_regua_titulo", {
    p_titulo_id: tituloId,
  });
  if (error) {
    toast.error(error.message ?? "Erro ao despausar régua.");
    return;
  }
  if (data && data.ok === false) {
    toast.error(data.erro ?? "Erro ao despausar régua.");
    return;
  }
  toast.success("Régua despausada.");
  qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
}

async function rodarReguaAgora(qc: ReturnType<typeof useQueryClient>) {
  const { data, error } = await (supabase as any).rpc("fn_regua_materializar");
  if (error) {
    toast.error(error.message ?? "Erro ao rodar régua.");
    return;
  }
  if (data && data.ok === false) {
    toast.error(data.erro ?? "Erro ao rodar régua.");
    return;
  }
  const qtd = data?.titulos_atualizados ?? 0;
  toast.success(`Régua rodada — ${qtd} título(s) atualizado(s).`);
  qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
}

export default function ReguaTab() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: etapas = [] } = useReguaEtapas();
  const { data: fila = [], isLoading: loadingFila } = useReguaFilaHoje();
  const { data: foraDaRegua = [], isLoading: loadingFora } = useReguaVencidoForaDaFila();
  const { data: pausados = [], isLoading: loadingPausados } = useReguaPausados();
  const { data: conferencias } = useBoletoVencimentoConferencia();

  const [vista, setVista] = useState<Vista>("fila");
  const [acaoDialog, setAcaoDialog] = useState<{ titulo: TituloCobranca; etapa: ReguaEtapa | null; modo: "enviada" | "pulada"; reenvio?: boolean; ultimaEm?: string | null } | null>(null);
  const [pausarDialog, setPausarDialog] = useState<{ titulo: TituloCobranca; etapa: ReguaEtapa | null } | null>(null);
  const [renegociarDialog, setRenegociarDialog] = useState<{ titulo: TituloCobranca; etapa: ReguaEtapa | null } | null>(null);
  const [pacote, setPacote] = useState<LinhaMesa | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setExpandidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });

  const somaValor = (lista: TituloCobranca[]) =>
    lista.reduce((acc, t) => acc + Number(t.valor_efetivo ?? 0), 0);

  /**
   * ATRASO-E-O-EIXO: a régua ordena por atraso, não por etapa da cadência.
   * Etapa é cronologia do roteiro; urgência é o atraso. Desempate por valor.
   */
  const zonaAtraso = useMemo(
    () =>
      fila
        .filter((t) => (t.dias_atraso ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.dias_atraso ?? 0) - (a.dias_atraso ?? 0) ||
            Number(b.valor_efetivo ?? 0) - Number(a.valor_efetivo ?? 0),
        ),
    [fila],
  );

  const zonaAVencer = useMemo(
    () =>
      fila
        .filter((t) => (t.dias_atraso ?? 0) <= 0)
        .sort((a, b) => (b.dias_atraso ?? 0) - (a.dias_atraso ?? 0)),
    [fila],
  );

  const somaZona1 = useMemo(() => somaValor(zonaAtraso), [zonaAtraso]);
  const somaZona2 = useMemo(() => somaValor(foraDaRegua), [foraDaRegua]);
  const somaZona3 = useMemo(() => somaValor(zonaAVencer), [zonaAVencer]);
  const somaFila = useMemo(() => somaValor(fila), [fila]);
  const somaPausados = useMemo(() => somaValor(pausados), [pausados]);

  /** Próxima ação já vencida = trabalho atrasado da régua. */
  const acaoAtrasada = (t: TituloCobranca) => {
    const d = (t as any).data_proxima_acao_regua as string | null | undefined;
    if (!d) return false;
    return String(d).slice(0, 10) < new Date().toISOString().slice(0, 10);
  };

  const irParaZona = (id: string) => {
    setVista("fila");
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const abrirTitulo = (t: TituloCobranca) => {
    const pedidoId = (t as any)._mesa?.pedido_id ?? t.pedido_id;
    if (pedidoId) navigate(`/pedidos/${pedidoId}`);
    else toast.info("Este título não tem pedido vinculado para abrir.");
  };

  const cardCompleto = (t: TituloCobranca, opts?: { zonaAtraso?: boolean }) => {
    const etapa = resolverEtapaParaTitulo(t, etapas);
    return (
      <CardTitulo
        titulo={t}
        etapa={etapa}
        zonaAtraso={opts?.zonaAtraso}
        acaoAtrasada={vista === "fila" && acaoAtrasada(t)}
        conferencia={conferencias?.get(t.id)}
        onAcao={() => setAcaoDialog({ titulo: t, etapa, modo: "enviada" })}
        onPular={() => setAcaoDialog({ titulo: t, etapa, modo: "pulada" })}
        onPausar={() => setPausarDialog({ titulo: t, etapa })}
        onRenegociar={() => setRenegociarDialog({ titulo: t, etapa })}
        onEnviarPacote={(l) => setPacote(l)}
        onReenviar={() => {
          const u = etapaUltimaDoTitulo(t, etapas);
          if (!u) return;
          setAcaoDialog({ titulo: t, etapa: u.etapa, modo: "enviada", reenvio: true, ultimaEm: u.em });
        }}
      />
    );
  };

  const totalEmAtraso = zonaAtraso.length + foraDaRegua.length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 max-w-3xl">
          <KpiCard
            label="Fila de hoje"
            valor={fila.length}
            total={somaFila}
            ativo={vista === "fila"}
            onClick={() => setVista("fila")}
          />
          <KpiCard
            label="Em atraso total"
            valor={totalEmAtraso}
            total={somaZona1 + somaZona2}
            ativo={false}
            onClick={() => irParaZona("zona-em-atraso")}
            tone="danger"
          />
          <KpiCard
            label="Fora da régua"
            valor={foraDaRegua.length}
            total={somaZona2}
            ativo={false}
            onClick={() => irParaZona("zona-fora-da-regua")}
            tone="warn"
          />
          <KpiCard
            label="Pausados"
            valor={pausados.length}
            total={somaPausados}
            ativo={vista === "pausados"}
            onClick={() => setVista("pausados")}
            tone="warn"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => rodarReguaAgora(qc)}
          title="Rodar régua agora"
          className="text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Rodar régua agora
        </Button>
      </div>

      {etapas.length === 0 && (
        <Alert>
          <AlertDescription className="text-xs">
            Nenhuma etapa de régua cadastrada. Configure em Parâmetros → Régua de Cobrança.
          </AlertDescription>
        </Alert>
      )}

      {vista === "fila" && (loadingFila || loadingFora) && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {vista === "fila" && !loadingFila && !loadingFora && (
        <>
          {/* ── Zona 1 — EM ATRASO ── */}
          <section className="space-y-2">
            <ZonaHeader
              id="zona-em-atraso"
              titulo="Em atraso"
              qtd={zonaAtraso.length}
              total={somaZona1}
              tom="destructive"
            />
            {zonaAtraso.length === 0 ? (
              <ZonaVazia texto="Nenhum título vencido na régua." tom="success" />
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {zonaAtraso.map((t) => (
                  <div key={t.id}>{cardCompleto(t, { zonaAtraso: true })}</div>
                ))}
              </div>
            )}
          </section>

          {/* ── Zona 2 — VENCIDO FORA DA RÉGUA ── */}
          <section className="space-y-2">
            <ZonaHeader
              id="zona-fora-da-regua"
              titulo="Vencido fora da régua"
              qtd={foraDaRegua.length}
              total={somaZona2}
              tom="warning"
            />
            {foraDaRegua.length === 0 ? (
              <ZonaVazia texto="Nenhum título vencido bloqueado por falta de lastro." tom="muted" />
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {foraDaRegua.map((t) => (
                  <CardForaDaRegua
                    key={t.id}
                    titulo={t}
                    onRenegociar={() => setRenegociarDialog({ titulo: t, etapa: null })}
                    onVerTitulo={() => abrirTitulo(t)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Zona 3 — A VENCER ── */}
          <section className="space-y-2">
            <ZonaHeader
              id="zona-a-vencer"
              titulo="A vencer"
              qtd={zonaAVencer.length}
              total={somaZona3}
              tom="muted"
            />
            {zonaAVencer.length === 0 ? (
              <ZonaVazia texto="Nenhum título a vencer na fila de hoje." tom="muted" />
            ) : (
              <div className="space-y-1">
                {zonaAVencer.map((t) => {
                  const u = etapaUltimaDoTitulo(t, etapas);
                  return (
                    <div key={t.id} className="space-y-1">
                      <LinhaCompacta
                        titulo={t}
                        contatadoEm={u?.em ?? null}
                        aberto={expandidos.has(t.id)}
                        onToggle={() => alternar(t.id)}
                      />
                      {expandidos.has(t.id) && cardCompleto(t)}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {vista === "pausados" && (
        <section className="space-y-2">
          {loadingPausados ? (
            <Skeleton className="h-16 w-full" />
          ) : pausados.length === 0 ? (
            <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
              Nenhum título com régua pausada.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {pausados.map((t) => (
                <div key={t.id} className="space-y-2">
                  {cardCompleto(t, { zonaAtraso: (t.dias_atraso ?? 0) > 0 })}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs"
                    onClick={() => despausarTitulo(t.id, qc)}
                  >
                    <Play className="h-3 w-3 mr-1" /> Despausar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <EnviarPacoteDialog
        linha={pacote}
        open={!!pacote}
        onOpenChange={(v) => { if (!v) setPacote(null); }}
      />

      {acaoDialog && (
        <AcaoReguaDialog
          titulo={acaoDialog.titulo}
          etapa={acaoDialog.etapa}
          modo={acaoDialog.modo}
          reenvio={acaoDialog.reenvio}
          ultimaEm={acaoDialog.ultimaEm}
          open={!!acaoDialog}
          onClose={() => setAcaoDialog(null)}
        />
      )}
      {pausarDialog && (
        <PausarReguaDialog
          titulo={pausarDialog.titulo}
          etapa={pausarDialog.etapa}
          open={!!pausarDialog}
          onClose={() => setPausarDialog(null)}
        />
      )}
      {renegociarDialog && (
        <RenegociarTituloDialog
          titulo={renegociarDialog.titulo}
          etapa={renegociarDialog.etapa}
          open={!!renegociarDialog}
          onClose={() => setRenegociarDialog(null)}
        />
      )}
    </div>
  );
}
