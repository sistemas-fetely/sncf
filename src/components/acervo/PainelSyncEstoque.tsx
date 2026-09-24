import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { fmtDataHora } from "@/lib/data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface SyncStatus {
  sistema: string;
  tipo: string;
  status: string | null;
  registros_atualizados: number | null;
  ultima_execucao: string | null;
  detalhes: unknown;
}

/** Rótulos humanos por sistema/tipo. Ordem = ordem dos cards. */
const ROTULOS: { sistema: string; tipo: string; rotulo: string }[] = [
  { sistema: "shopify", tipo: "estoque_carga_completa", rotulo: "Shopify · releitura completa" },
  { sistema: "shopify", tipo: "estoque_push", rotulo: "Shopify · envio de estoque" },
  { sistema: "shopify", tipo: "catalogo_espelhar", rotulo: "Shopify · catálogo" },
  { sistema: "shopify", tipo: "catalogo_reconciliar_excluidos", rotulo: "Shopify · excluídos" },
  { sistema: "bling", tipo: "estoque_carga_saldos", rotulo: "Bling · leitura de saldos" },
  { sistema: "bling", tipo: "estoque_push", rotulo: "Bling · envio de estoque" },
];

export function PainelSyncEstoque() {
  const q = useQuery({
    queryKey: ["vw_estoque_sync_status"],
    queryFn: async (): Promise<SyncStatus[]> => {
      const { data, error } = await (supabase as any).from("vw_estoque_sync_status")
        .select("sistema,tipo,status,registros_atualizados,ultima_execucao,detalhes");
      if (error) throw error;
      return (data ?? []) as SyncStatus[];
    },
  });

  if (q.isError) return (
    <Alert variant="destructive"><AlertTriangle className="h-4 w-4" />
      <AlertDescription>Falha ao carregar sincronização: {formatError(q.error)}</AlertDescription></Alert>
  );
  if (q.isLoading) return <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const linhas = q.data ?? [];
  const conhecidos = new Set(ROTULOS.map((r) => `${r.sistema}/${r.tipo}`));
  const extras = linhas.filter((l) => !conhecidos.has(`${l.sistema}/${l.tipo}`))
    .map((l) => ({ sistema: l.sistema, tipo: l.tipo, rotulo: `${l.sistema} · ${l.tipo}` }));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...ROTULOS, ...extras].map((r) => {
        const l = linhas.find((x) => x.sistema === r.sistema && x.tipo === r.tipo);
        if (!l) return (
          <div key={`${r.sistema}/${r.tipo}`} className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium text-muted-foreground">{r.rotulo}</p>
            <p className="text-xs text-muted-foreground">sem execução ainda</p>
          </div>
        );
        const ok = l.status === "sucesso";
        return (
          <div key={`${r.sistema}/${r.tipo}`} className={cn("rounded-md border p-3",
            ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10")}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{r.rotulo}</p>
              <span className={cn("text-xs font-medium", ok ? "text-success" : "text-destructive")}>{l.status ?? "—"}</span>
            </div>
            <p className="text-xs text-muted-foreground" title={fmtDataHora(l.ultima_execucao)}>
              {l.ultima_execucao ? formatDistanceToNow(new Date(l.ultima_execucao), { addSuffix: true, locale: ptBR }) : "—"}
              {" · "}{new Intl.NumberFormat("pt-BR").format(Number(l.registros_atualizados ?? 0))} registro(s)
            </p>
          </div>
        );
      })}
    </div>
  );
}
