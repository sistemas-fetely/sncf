import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, RefreshCw, Link2, Undo2, X } from "lucide-react";
import { useRotearPedido } from "@/hooks/pedidos/useRotearPedido";
import { useTransicionarPedido } from "@/hooks/pedidos/useTransicionarPedido";
import { useRegistrarOperacaoPedido } from "@/hooks/pedidos/useRegistrarOperacaoPedido";
import { ForcarSemLastroDialog } from "@/components/pedidos/dialogs/ForcarSemLastroDialog";
import { EVENTO_DESTACAR_CONDICAO, ehMotivoCondicaoPendente } from "@/lib/pedidos/condicaoPendente";
import { useToast } from "@/hooks/use-toast";

/**
 * Recebido = FILA DE EXCEÇÃO (17/10/2026). O pedido nasce e já roteia em
 * receber_pedido_externo; só fica aqui quando o roteamento automático falhou.
 * O motivo vem do último evento roteamento_pendente / erro_automacao.
 */

const ROTULO_MOTIVO: Record<string, string> = {
  condicao_nao_mapeada: "Condição de pagamento não mapeada",
  condicao_nao_reconhecida: "Condição de pagamento não reconhecida",
  forma_nao_reconhecida: "Forma de pagamento não reconhecida",
};

export interface PendenciaRoteamento {
  motivo: string | null;
  mensagem: string | null;
  erro: boolean;
}

export function rotuloPendencia(p: PendenciaRoteamento | null | undefined): string {
  if (!p) return "Aguardando roteamento";
  if (p.erro) return "Falha no roteamento automático";
  return (p.motivo && ROTULO_MOTIVO[p.motivo]) || p.motivo || "Roteamento pendente";
}

const chave = (id: string) => ["pendencia-roteamento", id];

export function usePendenciaRoteamento(pedidoId: string) {
  return useQuery({
    queryKey: chave(pedidoId),
    queryFn: async (): Promise<PendenciaRoteamento | null> => {
      const { data, error } = await supabase
        .from("pedido_eventos")
        .select("tipo_evento, descricao, metadata, created_at")
        .eq("pedido_id", pedidoId)
        .or("tipo_evento.eq.erro_automacao,metadata->>acao.eq.roteamento_pendente")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const ev = data?.[0] as any;
      if (!ev) return null;
      if (ev.tipo_evento === "erro_automacao") {
        return { motivo: null, mensagem: ev.metadata?.sqlerrm ?? ev.descricao ?? null, erro: true };
      }
      return { motivo: ev.metadata?.motivo ?? null, mensagem: ev.metadata?.mensagem ?? null, erro: false };
    },
  });
}

function SeloPendencia({ p }: { p: PendenciaRoteamento | null | undefined }) {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-warning/50 bg-warning/10 text-warning-foreground dark:text-warning"
      title={p?.mensagem ?? undefined}
    >
      <AlertTriangle className="h-3 w-3" />
      {rotuloPendencia(p)}
    </Badge>
  );
}

/** Selo do motivo para a coluna Estágio da fila. */
export function ExcecaoRecebidoSelo({ pedidoId }: { pedidoId: string }) {
  const { data } = usePendenciaRoteamento(pedidoId);
  return (
    <span title={data?.mensagem ?? undefined} className="inline-flex max-w-full">
      <Selo estado={data?.erro ? "destructive" : "warning"} className="whitespace-normal text-left gap-1">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {rotuloPendencia(data)}
      </Selo>
    </span>
  );
}

/** Botão "Tentar rotear de novo" (só ícone) para a coluna Ações da fila. */
export function ExcecaoRecebidoBotao({ pedidoId }: { pedidoId: string }) {
  const tentar = useTentarRotear(pedidoId);
  return (
    <Button
      variant="ghost" size="icon" className="h-8 w-8"
      title="Tentar rotear de novo" aria-label="Tentar rotear de novo"
      disabled={tentar.pending}
      onClick={tentar.run}
    >
      <RefreshCw className={`h-4 w-4 ${tentar.pending ? "animate-spin" : ""}`} />
    </Button>
  );
}

function useTentarRotear(pedidoId: string) {
  const rotear = useRotearPedido();
  const qc = useQueryClient();
  const { toast } = useToast();
  const run = async () => {
    const res = await rotear.mutateAsync({ p_pedido_id: pedidoId });
    if (res?.ok) {
      toast({ title: "Pedido roteado", description: res.destino ? `Destino: ${res.destino}` : undefined });
    } else {
      qc.setQueryData(chave(pedidoId), { motivo: res?.motivo ?? null, mensagem: res?.mensagem ?? null, erro: false });
      toast({
        title: "Ainda não foi possível rotear",
        description: res?.mensagem || rotuloPendencia({ motivo: res?.motivo ?? null, mensagem: null, erro: false }),
        variant: "destructive",
      });
    }
    await qc.invalidateQueries({ queryKey: chave(pedidoId) });
  };
  return { run, pending: rotear.isPending };
}

type Acao = "corrigir" | "cancelar";

/** Painel completo no detalhe do pedido. */
export function ExcecaoRecebidoPainel({ pedidoId }: { pedidoId: string }) {
  const { data } = usePendenciaRoteamento(pedidoId);
  const tentar = useTentarRotear(pedidoId);
  const transicionar = useTransicionarPedido();
  const registrar = useRegistrarOperacaoPedido();
  const [acao, setAcao] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState("");

  const podeMapear = ehMotivoCondicaoPendente(data?.motivo);
  const fechar = () => { setAcao(null); setMotivo(""); };

  const confirmar = async () => {
    const m = motivo.trim();
    if (!acao || !m) return;
    if (acao === "corrigir") {
      await registrar.mutateAsync({
        pedido_id: pedidoId,
        tipo_evento: "anotacao",
        descricao: `Correção solicitada ao vendedor: ${m}`,
        metadata: { tipo: "correcao_solicitada", motivo: m },
        proxima_acao: "Aguardando correção do vendedor",
      });
    } else {
      await transicionar.mutateAsync({ pedido_id: pedidoId, para_estagio: "cancelado", motivo: m });
    }
    fechar();
  };

  const aplicando = transicionar.isPending || registrar.isPending;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-col gap-1">
        <SeloPendencia p={data} />
        {data?.mensagem && <p className="text-xs text-muted-foreground">{data.mensagem}</p>}
      </div>
      {podeMapear && (
        <Button
          size="sm" variant="outline" className="gap-2"
          onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_DESTACAR_CONDICAO, { detail: { pedidoId } }))}
        >
          <Link2 className="h-4 w-4" /> Mapear condição
        </Button>
      )}
      <Button size="sm" className="gap-2" disabled={tentar.pending} onClick={tentar.run}>
        <RefreshCw className={`h-4 w-4 ${tentar.pending ? "animate-spin" : ""}`} />
        {tentar.pending ? "Roteando..." : "Tentar rotear de novo"}
      </Button>
      <Button size="sm" variant="outline" className="gap-2" onClick={() => setAcao("corrigir")}>
        <Undo2 className="h-4 w-4" /> Pedir correção (devolver ao vendedor)
      </Button>
      <Button size="sm" variant="outline" className="gap-2 text-destructive" onClick={() => setAcao("cancelar")}>
        <X className="h-4 w-4" /> Cancelar pedido
      </Button>

      <Dialog open={!!acao} onOpenChange={(v) => { if (!v) fechar(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{acao === "cancelar" ? "Cancelar pedido" : "Pedir correção (devolver ao vendedor)"}</DialogTitle>
            <DialogDescription>Motivo obrigatório. Vai para o histórico do pedido.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{acao === "cancelar" ? "Motivo do cancelamento" : "O que o vendedor precisa corrigir?"}</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar}>Fechar</Button>
            <Button
              variant={acao === "cancelar" ? "destructive" : "default"}
              disabled={!motivo.trim() || aplicando}
              onClick={confirmar}
            >
              {aplicando ? "Aplicando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ForcarSemLastroDialog
        open={!!transicionar.faltaLastro}
        onOpenChange={(v) => { if (!v) transicionar.limparFaltaLastro(); }}
        faltantes={transicionar.faltaLastro?.faltantes ?? []}
        isPending={transicionar.isPending}
        onForcar={(motivoForcado) => {
          transicionar.mutate(
            { pedido_id: pedidoId, para_estagio: "cancelado", motivo: motivoForcado },
            { onSuccess: () => { transicionar.limparFaltaLastro(); fechar(); } },
          );
        }}
      />
    </div>
  );
}

