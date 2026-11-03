/**
 * Fila "Recebível Mercado Pago sem pedido" (MP Fase 2, 03/11/2026).
 * Gaveta aberta por ?fila=sem_pedido (card do Dash). Decisão manual pelas RPCs
 * fn_recebivel_b2c_vincular / fn_recebivel_b2c_classificar; pedidos aparecem só
 * como CONSULTA digitada — nunca sugestão por valor+data.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

const sb = supabase as any;

type Item = { movimentacao_id: string; data_transacao: string; valor_liquido_mp: number; tipo_meio: string | null; mp_payment_id: string | null; mp_token: string | null };

export function useFilaSemPedido() {
  return useQuery({
    queryKey: ["vw_recebivel_b2c_sem_pedido"],
    queryFn: async () => {
      const { data, error } = await sb.from("vw_recebivel_b2c_sem_pedido").select("*").order("data_transacao");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
}

export function BotaoFilaSemPedido() {
  const [sp, setSp] = useSearchParams();
  const q = useFilaSemPedido();
  const n = q.data?.length ?? 0;
  return (
    <Button variant={n ? "default" : "outline"} size="sm" onClick={() => { const p = new URLSearchParams(sp); p.set("fila", "sem_pedido"); setSp(p); }}>
      Recebível sem pedido {q.isLoading ? "…" : `(${n})`}
    </Button>
  );
}

export function GavetaFilaSemPedido() {
  const [sp, setSp] = useSearchParams();
  const aberto = sp.get("fila") === "sem_pedido";
  const fechar = () => { const p = new URLSearchParams(sp); p.delete("fila"); setSp(p); };
  const q = useFilaSemPedido();
  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && fechar()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Recebível Mercado Pago sem pedido</SheetTitle>
          <SheetDescription>Nenhuma regra automática ligou estas liberações a um pedido. Vincule a um pedido do site ou classifique como não-site.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {q.isError && <Alert variant="destructive"><AlertDescription>{formatError(q.error)}</AlertDescription></Alert>}
          {q.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
          {!q.isLoading && !q.isError && !(q.data ?? []).length && <p className="text-sm text-muted-foreground">Fila vazia.</p>}
          {(q.data ?? []).map((it) => <ItemFila key={it.movimentacao_id} it={it} />)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ItemFila({ it }: { it: Item }) {
  const qc = useQueryClient();
  const podeVincular = usePermissaoAcaoOuSuperAdmin("acao.recebivel_b2c.vincular").permitido;
  const podeClassificar = usePermissaoAcaoOuSuperAdmin("acao.recebivel_b2c.classificar").permitido;
  const [modo, setModo] = useState<"vincular" | "classificar" | null>(null);
  const [pedido, setPedido] = useState("");
  const [consulta, setConsulta] = useState("");
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");

  const destinos = useQuery({
    queryKey: ["recebivel_b2c_destino_dim"],
    queryFn: async () => {
      const { data, error } = await sb.from("recebivel_b2c_destino_dim").select("codigo, rotulo").order("ordem");
      if (error) throw error;
      return (data ?? []) as { codigo: string; rotulo: string }[];
    },
  });
  const candidatos = useQuery({
    queryKey: ["shopify_pedidos_consulta", consulta],
    enabled: consulta.trim().length >= 2,
    queryFn: async () => {
      const t = consulta.trim().replace(/^#/, "");
      const { data, error } = await sb.from("shopify_pedidos").select("order_name, total, created_at_shopify, financial_status")
        .ilike("order_name", `%${t}%`).order("created_at_shopify", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const decidir = useMutation({
    mutationFn: async () => {
      const { error } = modo === "vincular"
        ? await sb.rpc("fn_recebivel_b2c_vincular", { p_movimentacao_id: it.movimentacao_id, p_order_name: pedido, p_motivo: motivo })
        : await sb.rpc("fn_recebivel_b2c_classificar", { p_movimentacao_id: it.movimentacao_id, p_destino: destino, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(modo === "vincular" ? `Vinculado ao pedido ${pedido}.` : "Classificado como não-site.");
      await qc.invalidateQueries();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const motivoOk = motivo.trim().length >= 3;
  const pronto = modo === "vincular" ? pedido.trim().length > 0 && motivoOk : !!destino && motivoOk;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{fmtData(it.data_transacao)} · {formatBRL(it.valor_liquido_mp)}</div>
        <Badge variant="secondary">{it.tipo_meio ?? "—"}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <span>Operação MP: <span className="font-mono text-foreground">{it.mp_payment_id ?? "—"}</span></span>
        <span>Token: <span className="font-mono text-foreground">{it.mp_token ?? "sem token no relatório"}</span></span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={modo === "vincular" ? "default" : "outline"} disabled={!podeVincular} onClick={() => setModo("vincular")}>Vincular a pedido</Button>
        <Button size="sm" variant={modo === "classificar" ? "default" : "outline"} disabled={!podeClassificar} onClick={() => setModo("classificar")}>Classificar como não-site</Button>
      </div>
      {modo === "vincular" && (
        <div className="space-y-2">
          <Label className="text-xs">Consultar pedidos (pelo número)</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="ex.: 1292" value={consulta} onChange={(e) => setConsulta(e.target.value)} />
          </div>
          {(candidatos.data ?? []).length > 0 && (
            <div className="max-h-40 overflow-auto rounded border text-xs">
              {(candidatos.data ?? []).map((c) => (
                <button key={c.order_name} type="button" className="flex w-full justify-between px-2 py-1 text-left hover:bg-muted" onClick={() => setPedido(c.order_name)}>
                  <span className="font-medium">{c.order_name}</span>
                  <span>{formatBRL(c.total)} · {fmtData(c.created_at_shopify)} · {c.financial_status ?? "—"}</span>
                </button>
              ))}
            </div>
          )}
          <Label className="text-xs">Pedido escolhido</Label>
          <Input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="#1234" />
        </div>
      )}
      {modo === "classificar" && (
        <div className="space-y-2">
          <Label className="text-xs">Destino</Label>
          <Select value={destino} onValueChange={setDestino}>
            <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
            <SelectContent>{(destinos.data ?? []).map((d) => <SelectItem key={d.codigo} value={d.codigo}>{d.rotulo}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {modo && (
        <div className="space-y-2">
          <Label className="text-xs">Motivo (mínimo 3 caracteres)</Label>
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" disabled={!pronto || decidir.isPending} onClick={() => decidir.mutate()}>
              {decidir.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Confirmar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
