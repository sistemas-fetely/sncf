import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, FileText, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { chamarEdge } from "@/lib/pedidos/edgePagamento";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatError } from "@/lib/format-error";
import { podeGerarRemessaTi } from "./nfRemessaTi";

export function NfRemessaTi({ pedidoId, volumes, pesoKg, bloqueado }: {
  pedidoId: string; volumes: number | null; pesoKg: number | null; bloqueado: boolean;
}) {
  const qc = useQueryClient();
  const { permitido } = usePermissaoAcaoOuSuperAdmin("acao.enviar_bling");
  const fiscal = useQuery({
    queryKey: ["mesa-sp", "nf-remessa-ti", pedidoId],
    refetchInterval: 15000,
    queryFn: async () => {
      const [registro, autorizada] = await Promise.all([
        supabase.from("trs_nf_direta").select("status,numero,erro").eq("pedido_id", pedidoId).maybeSingle(),
        supabase.from("nfs_emitidas").select("numero").eq("pedido_venda_id", pedidoId).eq("tipo", "saida").eq("situacao", "autorizada").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (registro.error || autorizada.error) throw registro.error ?? autorizada.error;
      return { registro: registro.data, autorizada: autorizada.data };
    },
  });
  const gerar = useMutation({
    mutationFn: () => chamarEdge<{ ok: boolean; numero?: string | null; alertas?: string[] }>("trs-fiscal-gerar-nf", { pedido_id: pedidoId }),
    onSettled: async () => {
      await invalidarPedido(qc, pedidoId);
      await qc.invalidateQueries({ queryKey: ["mesa-sp"] });
    },
  });
  const registro = fiscal.data?.registro;
  const autorizada = fiscal.data?.autorizada;
  const erro = gerar.error ?? fiscal.error ?? registro?.erro;
  return <Card><CardContent className="space-y-3 p-4">
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-medium"><FileText className="size-4" />NF de remessa</p>
      <Button variant="ghost" size="icon" aria-label="Atualizar NF de remessa" title="Atualizar NF de remessa" disabled={fiscal.isFetching || gerar.isPending} onClick={async () => { await fiscal.refetch(); await qc.invalidateQueries({ queryKey: ["mesa-sp", "pedidos"] }); }}><RefreshCw className={fiscal.isFetching ? "size-4 animate-spin" : "size-4"} /></Button>
    </div>
    <p className="text-sm text-muted-foreground">Embalado {volumes ?? "?"} vol · {pesoKg ?? "?"} kg</p>
    {fiscal.isLoading ? <Skeleton className="h-12 w-full" /> : <>
      {autorizada ? <p className="text-sm text-success">NF nº {autorizada.numero ?? registro?.numero ?? "—"} autorizada — aguardando Entrega.</p>
        : registro?.status === "rascunho" ? <p className="text-sm">Rascunho nº {registro.numero ?? "—"} criado no Bling — a Eva transmite. Quando a NF for autorizada, a TI vai para Entrega.</p>
        : registro?.status === "transmitida" ? <p className="text-sm">NF nº {registro.numero ?? "—"} transmitida — aguardando Entrega.</p>
        : registro?.status === "gerando" ? <p className="text-sm text-muted-foreground">Geração em andamento…</p> : null}
      <Button disabled={!permitido || bloqueado || fiscal.isError || gerar.isPending || !podeGerarRemessaTi(registro?.status, Boolean(autorizada))} onClick={async () => { try { await gerar.mutateAsync(); } catch { /* Mensagem original exibida abaixo. */ } }}>
        {gerar.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}Gerar NF de remessa
      </Button>
    </>}
    {erro && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{formatError(erro)}</p>}
    {gerar.data?.alertas?.map(alerta => <p key={alerta} className="text-sm text-warning">{alerta}</p>)}
  </CardContent></Card>;
}