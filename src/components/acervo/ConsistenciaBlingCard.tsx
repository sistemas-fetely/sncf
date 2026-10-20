// 20/10/2026 (Flavio): uma Varredura para os três sistemas; XPM/Shopify ainda por espelho — edges próprias no molde do Bling ficam para a fase de validação
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ScanSearch, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { fmtDataHora } from "@/lib/data";
import { formatError } from "@/lib/format-error";

export type SistemaVarredura = "Bling" | "XPM" | "Shopify";

const SLUG = "acao.varrer_bling";
/** Lote sem conclusão há mais que isto = cadeia interrompida; não trava os botões. */
const LIMITE_LOTE_MS = 30 * 60 * 1000;
const emAndamento = (l: { concluido_em: string | null; iniciado_em: string } | null | undefined) =>
  !!l && !l.concluido_em && Date.now() - new Date(l.iniciado_em).getTime() < LIMITE_LOTE_MS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Lote = {
  lote_id: string; modo: string; iniciado_em: string; concluido_em: string | null;
  produtos_lidos: number | null; produtos_com_divergencia: number | null; divergencias: number | null; erros: number | null;
  detalhe_erros: { por_campo?: Record<string, number> } | null;
};

async function invocar(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const corpo = await (error as any).context?.text?.().catch(() => null);
    throw new Error(corpo || error.message);
  }
  if (!data?.ok) throw new Error(data?.error ?? JSON.stringify(data));
  return data;
}

/**
 * Uma linha da Varredura: última leitura, divergências, chips por campo, Detectar e Corrigir.
 * Bling: varrer-divergencia-bling (detectar/corrigir). XPM/Shopify: Detectar = varrer-divergencia-espelho
 * (sync do espelho + contagem da fila); Corrigir = `onCorrigir` (mesmo diálogo da barra).
 */
export function VarreduraSistemaCard({
  sistema = "Bling", titulo, colapsavel = false, compacto = false, onCorrigir, onRodando,
}: {
  sistema?: SistemaVarredura; titulo?: string; colapsavel?: boolean; compacto?: boolean;
  onCorrigir?: () => void; onRodando?: (rodando: boolean) => void;
} = {}) {
  const { permitido } = usePermissaoAcaoOuSuperAdmin(SLUG);
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const ehBling = sistema === "Bling";
  const rotulo = titulo ?? (ehBling ? "Consistência Bling" : sistema);

  const lote = useQuery({
    queryKey: ["consistencia-bling", "ultimo-lote", sistema],
    enabled: permitido,
    queryFn: async (): Promise<Lote | null> => {
      const { data, error } = await sb.from("produto_destino_varredura")
        .select("lote_id, modo, iniciado_em, concluido_em, produtos_lidos, produtos_com_divergencia, divergencias, erros, detalhe_erros")
        .eq("sistema", sistema).order("iniciado_em", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (emAndamento(q.state.data) ? 3000 : false),
  });
  const rodando = emAndamento(lote.data);
  const interrompido = !!lote.data && !lote.data.concluido_em && !rodando;
  useEffect(() => { onRodando?.(rodando); }, [rodando]); // eslint-disable-line react-hooks/exhaustive-deps
  const [aberto, setAberto] = useState(false);
  useEffect(() => { if (rodando) setAberto(true); }, [rodando]);

  const porCampo = useQuery({
    queryKey: ["consistencia-bling", "por-campo", sistema, lote.data?.lote_id, lote.data?.concluido_em],
    enabled: permitido && !!lote.data?.lote_id && !rodando,
    queryFn: async (): Promise<[string, number][]> => {
      if (!ehBling) {
        const pc = lote.data?.detalhe_erros?.por_campo;
        if (pc && Object.keys(pc).length) return Object.entries(pc).sort((a, b) => b[1] - a[1]);
        const n = lote.data?.produtos_com_divergencia ?? 0;
        return n ? [["cadastro difere", n]] : [];
      }
      const cont = new Map<string, number>();
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from("produto_destino_divergencia").select("campo")
          .eq("lote_id", lote.data!.lote_id).range(de, de + 999);
        if (error) throw error;
        for (const r of data ?? []) cont.set(r.campo, (cont.get(r.campo) ?? 0) + 1);
        if ((data ?? []).length < 1000) break;
      }
      return [...cont.entries()].sort((a, b) => b[1] - a[1]);
    },
  });

  const sobrescreve = useQuery({
    queryKey: ["consistencia-bling", "sobrescreve"],
    enabled: confirmar && ehBling,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb.from("produto_campo_destino").select("campo, campo_destino")
        .eq("sistema", "Bling").eq("sobrescreve", true).order("campo");
      if (error) throw error;
      return (data ?? []).map((d: { campo: string; campo_destino: string }) => `${d.campo} → ${d.campo_destino}`);
    },
  });

  async function disparar(modo: "detectar" | "corrigir") {
    setDisparando(true);
    try {
      const data = ehBling
        ? await invocar("varrer-divergencia-bling", { modo })
        : await invocar("varrer-divergencia-espelho", { sistema });
      toast.success(`Varredura ${sistema} (${modo}) iniciada — lote ${String(data.lote_id).slice(0, 8)}`);
      setConfirmar(false);
      await qc.invalidateQueries({ queryKey: ["consistencia-bling"] });
    } catch (e) {
      toast.error(`Falha ao disparar a varredura ${sistema}: ${formatError(e)}`);
    } finally {
      setDisparando(false);
    }
  }

  if (!permitido) return null;
  const l = lote.data;
  const ocupado = disparando || rodando;

  const selos = <>
    {rodando && <Badge variant="secondary" className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Em andamento</Badge>}
    {interrompido && <Badge variant="destructive">Interrompido</Badge>}
  </>;
  const botoes = <div className="flex gap-2">
    <BotaoGuardado slug={SLUG} rotuloAcao={`Detectar divergências no ${sistema}`} variant="outline" size="sm" disabled={ocupado} onClick={() => disparar("detectar")}>
      <ScanSearch className="mr-2 h-4 w-4" />Detectar
    </BotaoGuardado>
    {ehBling
      ? <BotaoGuardado slug={SLUG} rotuloAcao="Corrigir divergências no Bling" variant="outline" size="sm" disabled={ocupado} onClick={() => setConfirmar(true)}>
          <Wrench className="mr-2 h-4 w-4" />Corrigir
        </BotaoGuardado>
      : <BotaoGuardado slug="acao.produto_corrigir_externo" rotuloAcao={`Corrigir no ${sistema}`} variant="outline" size="sm"
          disabled={ocupado || !onCorrigir} onClick={() => onCorrigir?.()}>
          <Wrench className="mr-2 h-4 w-4" />Corrigir
        </BotaoGuardado>}
  </div>;
  const chips = <>
    {porCampo.error && <p className="text-sm text-destructive">{formatError(porCampo.error)}</p>}
    {porCampo.data && porCampo.data.length > 0 && (
      <div className="flex flex-wrap gap-1.5" aria-label={`Divergências por campo · ${sistema}`}>
        {porCampo.data.map(([campo, n]) => <Badge key={campo} variant="outline" className="tabular-nums font-normal">{campo}: {n}</Badge>)}
      </div>
    )}
  </>;

  const dialogo = ehBling && (
    <AlertDialog open={confirmar} onOpenChange={(o) => !disparando && setConfirmar(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Corrigir no Bling</AlertDialogTitle>
          <AlertDialogDescription>Campos com sobrescrita ligada:</AlertDialogDescription>
        </AlertDialogHeader>
        {sobrescreve.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {sobrescreve.error && <p className="text-sm text-destructive">{formatError(sobrescreve.error)}</p>}
        {sobrescreve.data && (sobrescreve.data.length
          ? <ul className="list-disc pl-5 text-sm">{sobrescreve.data.map((c) => <li key={c}>{c}</li>)}</ul>
          : <p className="text-sm">Nenhum campo com sobrescrita ligada.</p>)}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disparando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={disparando || !sobrescreve.data?.length}
            onClick={(e) => { e.preventDefault(); disparar("corrigir"); }}
          >Corrigir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (compacto) return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0" aria-label={`Varredura ${sistema}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="w-16 font-semibold">{sistema}</span>
        {selos}
        {lote.error ? <span className="text-destructive">{formatError(lote.error)}</span>
          : !lote.isLoading && !l ? <span className="text-muted-foreground">Nenhuma varredura.</span>
          : l && <>
            <span><span className="text-xs text-muted-foreground">Iniciada </span>{fmtDataHora(l.iniciado_em)}</span>
            <span><span className="text-xs text-muted-foreground">Concluída </span>{l.concluido_em ? fmtDataHora(l.concluido_em) : "—"}</span>
            <span className="tabular-nums"><span className="text-xs text-muted-foreground">Lidos </span>{l.produtos_lidos ?? 0}</span>
            <span className="tabular-nums"><span className="text-xs text-muted-foreground">Divergências </span>{l.divergencias ?? 0} <span className="text-muted-foreground">({l.produtos_com_divergencia ?? 0} produtos)</span></span>
            {(l.erros ?? 0) > 0 && <span className="tabular-nums text-destructive">{l.erros} erro(s)</span>}
          </>}
        <div className="ml-auto">{botoes}</div>
      </div>
      {chips}
      {dialogo}
    </div>
  );

  return (
    <Collapsible open={!colapsavel || aberto} onOpenChange={setAberto} asChild>
    <section className="rounded-lg border bg-card p-4 space-y-3" aria-label={rotulo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {colapsavel ? (
            <CollapsibleTrigger className="flex items-center gap-1 text-sm font-semibold">
              <ChevronDown className={cn("h-4 w-4 transition-transform", !aberto && "-rotate-90")} />{rotulo}
            </CollapsibleTrigger>
          ) : <h2 className="text-sm font-semibold">{rotulo}</h2>}
          {selos}
        </div>
        {botoes}
      </div>

      <CollapsibleContent className="space-y-3">
      {lote.error && <p className="text-sm text-destructive">{formatError(lote.error)}</p>}
      {!lote.isLoading && !l && <p className="text-sm text-muted-foreground">Nenhuma varredura.</p>}
      {l && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-6">
          <div><dt className="text-muted-foreground text-xs">Iniciada</dt><dd>{fmtDataHora(l.iniciado_em)}</dd></div>
          <div><dt className="text-muted-foreground text-xs">Concluída</dt><dd>{l.concluido_em ? fmtDataHora(l.concluido_em) : "—"}</dd></div>
          <div><dt className="text-muted-foreground text-xs">Modo</dt><dd>{l.modo}</dd></div>
          <div><dt className="text-muted-foreground text-xs">Produtos lidos</dt><dd className="tabular-nums">{l.produtos_lidos ?? 0}</dd></div>
          <div><dt className="text-muted-foreground text-xs">Divergências</dt><dd className="tabular-nums">{l.divergencias ?? 0} <span className="text-muted-foreground">({l.produtos_com_divergencia ?? 0} produtos)</span></dd></div>
          <div><dt className="text-muted-foreground text-xs">Erros</dt><dd className="tabular-nums">{l.erros ?? 0}</dd></div>
        </dl>
      )}
      {chips}
      </CollapsibleContent>
      {dialogo}
    </section>
    </Collapsible>
  );
}

/** Seção "Varredura": uma linha compacta por sistema; abre sozinha se qualquer um estiver em andamento. */
export function SecaoVarredura({ onCorrigirXpm, onCorrigirShopify }: { onCorrigirXpm: () => void; onCorrigirShopify: () => void }) {
  const { permitido } = usePermissaoAcaoOuSuperAdmin(SLUG);
  const [aberto, setAberto] = useState(false);
  const [rodando, setRodando] = useState<Record<string, boolean>>({});
  const algum = Object.values(rodando).some(Boolean);
  useEffect(() => { if (algum) setAberto(true); }, [algum]);
  const marca = (s: string) => (r: boolean) => setRodando((p) => (p[s] === r ? p : { ...p, [s]: r }));
  if (!permitido) return null;
  return (
    <Collapsible open={aberto} onOpenChange={setAberto} asChild>
      <section className="rounded-lg border bg-card p-4 space-y-3" aria-label="Varredura">
        <div className="flex items-center gap-2">
          <CollapsibleTrigger className="flex items-center gap-1 text-sm font-semibold">
            <ChevronDown className={cn("h-4 w-4 transition-transform", !aberto && "-rotate-90")} />Varredura
          </CollapsibleTrigger>
          {algum && <Badge variant="secondary" className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Em andamento</Badge>}
        </div>
        {/* forceMount: as linhas precisam montar fechadas para o "abre sozinha" enxergar o andamento */}
        <CollapsibleContent forceMount className={cn("divide-y", !aberto && "hidden")}>
          <VarreduraSistemaCard sistema="Bling" compacto onRodando={marca("Bling")} />
          <VarreduraSistemaCard sistema="XPM" compacto onCorrigir={onCorrigirXpm} onRodando={marca("XPM")} />
          <VarreduraSistemaCard sistema="Shopify" compacto onCorrigir={onCorrigirShopify} onRodando={marca("Shopify")} />
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

/** Alias: nome antigo continua válido para os imports existentes. */
export const ConsistenciaBlingCard = VarreduraSistemaCard;
export default VarreduraSistemaCard;
