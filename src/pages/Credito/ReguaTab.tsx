import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Star, AlertTriangle, Users, Play, Send, ChevronRight } from "lucide-react";
import {
  useReguaEtapas,
  useReguaFilaHoje,
  useReguaPausados,
  resolverEtapaParaTitulo,
  etapaUltimaDoTitulo,
  type ReguaEtapa,
} from "@/hooks/credito/useReguaFila";
import { useTitulosCobranca } from "@/hooks/credito/useTitulosCobranca";
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

type Vista = "fila" | "pausados" | "atraso";

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
        {titulo.pedido_id_externo ? `${titulo.pedido_id_externo} · ${titulo.numero_titulo}` : titulo.numero_titulo}
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
  titulo, etapa, acaoAtrasada, conferencia, onAcao, onPular, onPausar, onRenegociar, onEnviarPacote, onReenviar,
}: {
  titulo: TituloCobranca;
  etapa: ReguaEtapa | null;
  acaoAtrasada?: boolean;
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
            {titulo.pedido_id_externo ? `${titulo.pedido_id_externo} · ${titulo.numero_titulo}` : titulo.numero_titulo}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-medium text-sm">{formatBRL(titulo.valor_efetivo)}</div>
          {atraso > 0 ? (
            <Badge variant="destructive" className="text-[10px]">
              há {titulo.dias_atraso}d
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
  const { data: etapas = [] } = useReguaEtapas();
  const { data: fila = [], isLoading: loadingFila } = useReguaFilaHoje();
  const { data: pausados = [], isLoading: loadingPausados } = useReguaPausados();
  const { data: todosTitulos = [] } = useTitulosCobranca();
  const { data: conferencias } = useBoletoVencimentoConferencia();

  const [vista, setVista] = useState<Vista>("fila");
  const [acaoDialog, setAcaoDialog] = useState<{ titulo: TituloCobranca; etapa: ReguaEtapa | null; modo: "enviada" | "pulada"; reenvio?: boolean; ultimaEm?: string | null } | null>(null);
  const [pausarDialog, setPausarDialog] = useState<{ titulo: TituloCobranca; etapa: ReguaEtapa | null } | null>(null);
  const [renegociarDialog, setRenegociarDialog] = useState<{ titulo: TituloCobranca; etapa: ReguaEtapa | null } | null>(null);
  const [pacote, setPacote] = useState<LinhaMesa | null>(null);

  const somaValor = (lista: TituloCobranca[]) =>
    lista.reduce((acc, t) => acc + Number(t.valor_efetivo ?? 0), 0);

  const emAtraso = useMemo(
    () => todosTitulos.filter((t) => t.status_gestao === "atrasado"),
    [todosTitulos],
  );
  const totalAtraso = emAtraso.length;
  const somaAtraso = useMemo(() => somaValor(emAtraso), [emAtraso]);
  const somaFila = useMemo(() => somaValor(fila), [fila]);
  const somaPausados = useMemo(() => somaValor(pausados), [pausados]);

  const lista =
    vista === "fila" ? fila : vista === "pausados" ? pausados : emAtraso;
  const loading =
    vista === "fila" ? loadingFila : vista === "pausados" ? loadingPausados : false;
  const vencidosNaLista = useMemo(
    () => lista.filter((t) => (t.dias_atraso ?? 0) > 0),
    [lista],
  );

  /** Próxima ação já vencida = trabalho atrasado da régua. */
  const acaoAtrasada = (t: TituloCobranca) => {
    const d = (t as any).data_proxima_acao_regua as string | null | undefined;
    if (!d) return false;
    return String(d).slice(0, 10) < new Date().toISOString().slice(0, 10);
  };

  /** Ordena por data da próxima ação crescente, nulos por último. */
  const porProximaAcao = (a: TituloCobranca, b: TituloCobranca) => {
    const da = ((a as any).data_proxima_acao_regua as string | null) ?? null;
    const db = ((b as any).data_proxima_acao_regua as string | null) ?? null;
    if (da === db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : 1;
  };

  /**
   * RÉGUA-É-FILA-DE-AÇÃO. Três baldes:
   *  - comAcao: tem etapa pendente → card cheio, agrupado por etapa
   *  - jaContatado: etapa cumprida → linha compacta com selo verde
   *  - aguardando: ainda não chegou etapa nenhuma → linha compacta neutra
   */
  const baldes = useMemo(() => {
    if (vista === "atraso") {
      return { comAcao: [], jaContatado: [], aguardando: [] };
    }
    const comAcao: { t: TituloCobranca; etapa: ReguaEtapa }[] = [];
    const jaContatado: { t: TituloCobranca; em: string | null }[] = [];
    const aguardando: TituloCobranca[] = [];
    for (const t of [...lista].sort(porProximaAcao)) {
      const etapa = resolverEtapaParaTitulo(t, etapas);
      if (etapa) { comAcao.push({ t, etapa }); continue; }
      const u = etapaUltimaDoTitulo(t, etapas);
      if (u) jaContatado.push({ t, em: u.em });
      else aguardando.push(t);
    }
    return { comAcao, jaContatado, aguardando };
  }, [lista, etapas, vista]);

  // Agrupa só os com ação, por descrição da etapa aplicável.
  const grupos = useMemo(() => {
    const map = new Map<string, { etapa: ReguaEtapa | null; titulos: TituloCobranca[] }>();
    for (const { t, etapa } of baldes.comAcao) {
      const key = etapa.descricao_acao;
      if (!map.has(key)) map.set(key, { etapa, titulos: [] });
      map.get(key)!.titulos.push(t);
    }
    return Array.from(map.entries()).sort(
      (a, b) => porProximaAcao(a[1].titulos[0], b[1].titulos[0]),
    );
  }, [baldes]);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setExpandidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });

  const somaLista = (ts: TituloCobranca[]) => somaValor(ts);


  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="grid grid-cols-3 gap-3 flex-1 max-w-2xl">
          <KpiCard
            label="Fila de hoje"
            valor={vista === "fila" ? baldes.comAcao.length : fila.length}
            total={vista === "fila" ? somaLista(baldes.comAcao.map((x) => x.t)) : somaFila}
            ativo={vista === "fila"}
            onClick={() => setVista("fila")}
          />
          <KpiCard
            label="Pausados"
            valor={pausados.length}
            total={somaPausados}
            ativo={vista === "pausados"}
            onClick={() => setVista("pausados")}
            tone="warn"
          />
          <KpiCard
            label="Em atraso total"
            valor={totalAtraso}
            total={somaAtraso}
            ativo={vista === "atraso"}
            onClick={() => setVista("atraso")}
            tone="danger"
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

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!loading && lista.length === 0 && (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {vista === "fila"
            ? "Fila do dia vazia — nada para cobrar hoje."
            : vista === "pausados"
              ? "Nenhum título com régua pausada."
              : "Nenhum título em atraso."}
        </div>
      )}

      {!loading && grupos.map(([nomeGrupo, { etapa, titulos }]) => (
        <section key={nomeGrupo} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{nomeGrupo}</h3>
            <span className="text-xs text-muted-foreground">{titulos.length} título(s)</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {titulos.map((t) => (
              <div key={t.id} className="space-y-2">
                <CardTitulo
                  titulo={t}
                  etapa={etapa}
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
                {vista === "pausados" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs"
                    onClick={() => despausarTitulo(t.id, qc)}
                  >
                    <Play className="h-3 w-3 mr-1" /> Despausar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {!loading && vista === "fila" && baldes.comAcao.length === 0 && lista.length > 0 && (
        <div
          className={cn(
            "rounded-md border px-3 py-4 text-center text-sm",
            vencidosNaLista.length > 0
              ? "border-destructive/40 bg-destructive/5"
              : "border-success/30 bg-success/5 text-muted-foreground",
          )}
        >
          <p className="font-medium">Nenhuma ação de régua pendente hoje.</p>
          {vencidosNaLista.length > 0 ? (
            <p className="text-destructive font-medium inline-flex items-center gap-1 mt-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {vencidosNaLista.length} título(s) vencido(s) na lista abaixo · {formatBRL(somaValor(vencidosNaLista))}
              {" — já contatados, aguardando pagamento."}
            </p>
          ) : (
            <p className="mt-1">
              Os {lista.length} títulos abaixo estão dentro do prazo ou ainda não chegaram na data.
            </p>
          )}
        </div>
      )}

      {!loading && vista === "atraso" && lista.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Em atraso — visão informativa</h3>
            <span className="text-xs text-muted-foreground">
              {lista.length} título(s) · {formatBRL(somaLista(lista))}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Lista completa de títulos inadimplentes, independente de elegibilidade de régua. Ações da régua ficam na aba Fila de hoje.
          </p>
          <div className="space-y-1">
            {lista.map((t) => (
              <div key={t.id} className="space-y-1">
                <LinhaCompacta
                  titulo={t}
                  contatadoEm={null}
                  aberto={expandidos.has(t.id)}
                  onToggle={() => alternar(t.id)}
                />
                {expandidos.has(t.id) && (
                  <CardTitulo
                    titulo={t}
                    etapa={null}
                    conferencia={conferencias?.get(t.id)}
                    onAcao={() => setAcaoDialog({ titulo: t, etapa: null, modo: "enviada" })}
                    onPular={() => setAcaoDialog({ titulo: t, etapa: null, modo: "pulada" })}
                    onPausar={() => setPausarDialog({ titulo: t, etapa: null })}
                    onRenegociar={() => setRenegociarDialog({ titulo: t, etapa: null })}
                    onEnviarPacote={(l) => setPacote(l)}
                    onReenviar={() => {}}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && vista === "fila" && baldes.jaContatado.length > 0 && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Já contatado — régua cumprida
            </h3>
            <span className="text-xs text-muted-foreground">
              {baldes.jaContatado.length} título(s) · {formatBRL(somaLista(baldes.jaContatado.map((x) => x.t)))}
            </span>
          </div>
          <div className="space-y-1">
            {baldes.jaContatado.map(({ t, em }) => (
              <div key={t.id} className="space-y-1">
                <LinhaCompacta
                  titulo={t}
                  contatadoEm={em}
                  aberto={expandidos.has(t.id)}
                  onToggle={() => alternar(t.id)}
                />
                {expandidos.has(t.id) && (
                  <CardTitulo
                    titulo={t}
                    etapa={null}
                    conferencia={conferencias?.get(t.id)}
                    onAcao={() => setAcaoDialog({ titulo: t, etapa: null, modo: "enviada" })}
                    onPular={() => setAcaoDialog({ titulo: t, etapa: null, modo: "pulada" })}
                    onPausar={() => setPausarDialog({ titulo: t, etapa: null })}
                    onRenegociar={() => setRenegociarDialog({ titulo: t, etapa: null })}
                    onEnviarPacote={(l) => setPacote(l)}
                    onReenviar={() => {
                      const u = etapaUltimaDoTitulo(t, etapas);
                      if (!u) return;
                      setAcaoDialog({ titulo: t, etapa: u.etapa, modo: "enviada", reenvio: true, ultimaEm: u.em });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && vista === "fila" && baldes.aguardando.length > 0 && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Aguardando data — nenhuma etapa ainda
            </h3>
            <span className="text-xs text-muted-foreground">
              {baldes.aguardando.length} título(s) · {formatBRL(somaLista(baldes.aguardando))}
            </span>
          </div>
          <div className="space-y-1">
            {baldes.aguardando.map((t) => (
              <div key={t.id} className="space-y-1">
                <LinhaCompacta
                  titulo={t}
                  contatadoEm={null}
                  aberto={expandidos.has(t.id)}
                  onToggle={() => alternar(t.id)}
                />
                {expandidos.has(t.id) && (
                  <CardTitulo
                    titulo={t}
                    etapa={null}
                    conferencia={conferencias?.get(t.id)}
                    onAcao={() => setAcaoDialog({ titulo: t, etapa: null, modo: "enviada" })}
                    onPular={() => setAcaoDialog({ titulo: t, etapa: null, modo: "pulada" })}
                    onPausar={() => setPausarDialog({ titulo: t, etapa: null })}
                    onRenegociar={() => setRenegociarDialog({ titulo: t, etapa: null })}
                    onEnviarPacote={(l) => setPacote(l)}
                    onReenviar={() => {
                      const u = etapaUltimaDoTitulo(t, etapas);
                      if (!u) return;
                      setAcaoDialog({ titulo: t, etapa: u.etapa, modo: "enviada", reenvio: true, ultimaEm: u.em });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
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
