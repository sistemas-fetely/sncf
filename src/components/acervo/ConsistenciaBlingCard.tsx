import { useState } from "react";
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

const SLUG = "acao.varrer_bling";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Lote = {
  lote_id: string; modo: string; iniciado_em: string; concluido_em: string | null;
  produtos_lidos: number | null; produtos_com_divergencia: number | null; divergencias: number | null; erros: number | null;
};

/** Card "Consistência Bling": última varredura, divergências por campo e disparo detectar/corrigir. */
export function ConsistenciaBlingCard() {
  const { permitido } = usePermissaoAcaoOuSuperAdmin(SLUG);
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);
  const [disparando, setDisparando] = useState(false);

  const lote = useQuery({
    queryKey: ["consistencia-bling", "ultimo-lote"],
    enabled: permitido,
    queryFn: async (): Promise<Lote | null> => {
      const { data, error } = await sb.from("produto_destino_varredura")
        .select("lote_id, modo, iniciado_em, concluido_em, produtos_lidos, produtos_com_divergencia, divergencias, erros")
        .eq("sistema", "Bling").order("iniciado_em", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data && !q.state.data.concluido_em ? 3000 : false),
  });
  const rodando = !!lote.data && !lote.data.concluido_em;

  const porCampo = useQuery({
    queryKey: ["consistencia-bling", "por-campo", lote.data?.lote_id, lote.data?.concluido_em],
    enabled: permitido && !!lote.data?.lote_id && !rodando,
    queryFn: async (): Promise<[string, number][]> => {
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
    enabled: confirmar,
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
      const { data, error } = await supabase.functions.invoke("varrer-divergencia-bling", { body: { modo } });
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const corpo = await (error as any).context?.text?.().catch(() => null);
        throw new Error(corpo || error.message);
      }
      if (!data?.ok) throw new Error(data?.error ?? JSON.stringify(data));
      toast.success(`Varredura (${modo}) iniciada — lote ${String(data.lote_id).slice(0, 8)}`);
      setConfirmar(false);
      await qc.invalidateQueries({ queryKey: ["consistencia-bling"] });
    } catch (e) {
      toast.error(`Falha ao disparar a varredura: ${formatError(e)}`);
    } finally {
      setDisparando(false);
    }
  }

  if (!permitido) return null;
  const l = lote.data;
  const ocupado = disparando || rodando;

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3" aria-label="Consistência Bling">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Consistência Bling</h2>
          {rodando && <Badge variant="secondary" className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Em andamento</Badge>}
        </div>
        <div className="flex gap-2">
          <BotaoGuardado slug={SLUG} rotuloAcao="Detectar divergências no Bling" variant="outline" size="sm" disabled={ocupado} onClick={() => disparar("detectar")}>
            <ScanSearch className="mr-2 h-4 w-4" />Detectar
          </BotaoGuardado>
          <BotaoGuardado slug={SLUG} rotuloAcao="Corrigir divergências no Bling" variant="outline" size="sm" disabled={ocupado} onClick={() => setConfirmar(true)}>
            <Wrench className="mr-2 h-4 w-4" />Corrigir
          </BotaoGuardado>
        </div>
      </div>

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
      {porCampo.error && <p className="text-sm text-destructive">{formatError(porCampo.error)}</p>}
      {porCampo.data && porCampo.data.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Divergências por campo">
          {porCampo.data.map(([campo, n]) => <Badge key={campo} variant="outline" className="tabular-nums">{campo}: {n}</Badge>)}
        </div>
      )}

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
    </section>
  );
}

export default ConsistenciaBlingCard;
