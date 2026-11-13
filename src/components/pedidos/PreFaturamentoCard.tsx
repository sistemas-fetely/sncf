import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Send, MinusCircle } from "lucide-react";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";
import { useRemessas } from "@/hooks/pedidos/useRemessas";
import { pedidoDividido as ehPedidoDividido, remessasAtivas } from "@/lib/pedidos/remessasDivididas";
import { useNivel } from "@/hooks/useNivel";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { useToast } from "@/hooks/use-toast";
import { chamarEdge } from "@/lib/pedidos/edgePagamento";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

/**
 * Estação de PRÉ-FATURAMENTO.
 *
 * A tela NÃO valida nada: ela desenha o que a RPC
 * `fn_pedido_pre_faturamento_checklist` devolve, na ordem em que vem.
 * Regra nova vai pra RPC, nunca pro .tsx — foi uma regra morando em .tsx
 * (piso de 7 dias no antigo helper de vencimento, já removido) que produziu o PED-2164.
 *
 * Semáforo com override declarado, exceto portão:
 *  - bloqueia && !ok  → bloqueio duro (botão desabilitado, sem override)
 *  - !bloqueia && !ok → aviso; a RPC devolve exige_motivo e o envio pede motivo
 * `pode_enviar` e `exige_motivo` vêm prontos — não recalcular no cliente.
 * CONFERÊNCIA-É-A-PORTA (14/09/2026): `pode_enviar`/`exige_motivo` deixaram de ser
 * só regra de tela — a edge `enviar-pedido-bling` roda a MESMA conferência no envio
 * inicial e recusa (409) sem `motivo` de 15+ caracteres quando há avisos.
 */

export const PRE_FATURAMENTO_CHECKLIST_KEY = (pedidoId: string) =>
  ["pre-faturamento-checklist", pedidoId] as const;

const MIN_MOTIVO = 15; // mesmo padrão do `forcar` em empurrar-pedido-xpm

interface ItemChecklist {
  codigo: string;
  rotulo: string;
  ok: boolean;
  bloqueia: boolean;
  detalhe: string | null;
}

interface Checklist {
  pedido_id: string;
  id_externo: string;
  estagio: string;
  pode_enviar: boolean;
  exige_motivo: boolean;
  bloqueios: number;
  avisos: number;
  itens: ItemChecklist[];
}

/** Itens físicos que não se aplicam quando a natureza não exige expedição. */
const ITENS_FISICOS = new Set(["frete", "transportadora", "volumes", "peso"]);

function IconeEstado({ item }: { item: ItemChecklist & { naoSeAplica?: boolean } }) {
  if (item.naoSeAplica) return <MinusCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />;
  if (item.ok) return <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-success" />;
  if (item.bloqueia) return <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />;
  return <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />;
}

export function PreFaturamentoCard({
  pedidoId, exigeExpedicao = true, blingIdDestino = null,
}: { pedidoId: string; exigeExpedicao?: boolean; blingIdDestino?: string | number | null }) {
  const { temNivel } = useNivel();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const enviar = useEnviarBling();
  const { data: remessas } = useRemessas(pedidoId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { permitido: podeGerar } = usePermissaoAcaoOuSuperAdmin("acao.enviar_bling");
  const fiscal = useQuery({
    queryKey: ["trs-nf-direta", pedidoId],
    enabled: !exigeExpedicao,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data: p, error: pe } = await supabase.from("pedidos").select("natureza_operacao_id").eq("id", pedidoId).single();
      if (pe) throw pe;
      if (!p.natureza_operacao_id) return { direta: false, registro: null };
      // Objetos já existentes no banco, ainda ausentes dos tipos gerados.
      const db = supabase as unknown as import("@supabase/supabase-js").SupabaseClient;
      const { data: dim, error: de } = await db.from("natureza_nf_direta").select("gera_nf_direta").eq("natureza_operacao_id", p.natureza_operacao_id).maybeSingle();
      if (de) throw de;
      if (dim?.gera_nf_direta !== true) return { direta: false, registro: null };
      const { data: reg, error: re } = await db.from("trs_nf_direta").select("status,bling_nfe_id,numero,natureza_conferida,erro").eq("pedido_id", pedidoId).maybeSingle();
      if (re) throw re;
      return { direta: true, registro: reg as { status: string; bling_nfe_id: number | null; numero: string | null; natureza_conferida: boolean; erro: string | null } | null };
    },
  });
  const gerar = useMutation({
    mutationFn: () => chamarEdge<{ ok: boolean; numero: string | null; alertas?: string[] }>("trs-fiscal-gerar-nf", { pedido_id: pedidoId }),
    onSuccess: async resultado => {
      toast({ title: "NF de transferência em rascunho", description: `Rascunho nº ${resultado.numero ?? "não informado"} — transmitir no Bling${resultado.alertas?.length ? ` · ${resultado.alertas.join(" · ")}` : ""}` });
      await qc.invalidateQueries({ queryKey: ["trs-nf-direta", pedidoId] });
      await invalidarPedido(qc, pedidoId);
    },
    onError: async (e: Error) => {
      toast({ title: "Erro ao gerar NF de transferência", description: e.message, variant: "destructive" });
      await qc.invalidateQueries({ queryKey: ["trs-nf-direta", pedidoId] });
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: PRE_FATURAMENTO_CHECKLIST_KEY(pedidoId),
    queryFn: async (): Promise<Checklist> => {
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "fn_pedido_pre_faturamento_checklist" as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { p_pedido_id: pedidoId } as any,
      );
      if (error) throw error;
      return data as unknown as Checklist;
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Conferindo o pedido...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-destructive/10 border border-destructive/40 p-3 text-sm text-destructive flex gap-2">
        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Não foi possível carregar a conferência de pré-faturamento.</span>
      </div>
    );
  }

  if (!exigeExpedicao && fiscal.isLoading) return <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Conferindo a NF de transferência...</div>;
  if (!exigeExpedicao && fiscal.error) return <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{fiscal.error.message}</div>;
  if (fiscal.data?.direta) {
    const registro = fiscal.data.registro;
    const rascunho = registro?.status === "rascunho";
    const ocupado = registro?.status === "gerando" || gerar.isPending;
    return <div className="w-full rounded-md border p-3 space-y-3">
      <div className="text-sm font-medium">NF de transferência</div>
      {blingIdDestino != null ? <p className="text-sm text-warning">Já enviada por pedido de venda ao Bling (id {blingIdDestino}) — emitir a NF lá.</p>
        : rascunho ? <p className="text-sm text-success">Rascunho nº {registro.numero ?? "não informado"} — transmitir no Bling</p>
        : ocupado ? <p className="text-sm text-muted-foreground">Gerando rascunho da NF...</p>
        : registro?.status === "erro" ? <p className="text-sm text-destructive break-words">{registro.erro ?? "Falha ao gerar NF de transferência"}</p> : null}
      {registro?.bling_nfe_id && !registro.natureza_conferida && <p className="text-sm text-warning">Natureza não conferida — confira no Bling antes de transmitir.</p>}
      {podeGerar && <Button size="sm" className="w-full gap-1.5" disabled={ocupado || blingIdDestino != null || !!registro?.bling_nfe_id} onClick={() => void gerar.mutateAsync().catch(() => undefined)}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Gerar NF de transferência
      </Button>}
    </div>;
  }

  // O checklist do banco marca "bling" como não-ok quando já desceu; aqui já enviado é ✓.
  const itemBling = (data.itens ?? []).find((i) => i.codigo === "bling");
  const idDoDetalhe = itemBling?.detalhe?.match(/id\s+(\d+)/i)?.[1] ?? null;
  const idEnviado = blingIdDestino != null && String(blingIdDestino) !== "" ? String(blingIdDestino) : idDoDetalhe;
  const jaEnviado = idEnviado != null;
  const itens = (data.itens ?? []).map((i) =>
    jaEnviado && i.codigo === "bling"
      ? { ...i, ok: true, bloqueia: false, naoSeAplica: false, detalhe: `Enviado ao Bling (id ${idEnviado}) — emitir a NF lá` }
      : !exigeExpedicao && ITENS_FISICOS.has(i.codigo)
      ? { ...i, ok: true, naoSeAplica: true, detalhe: "Não se aplica — natureza sem movimento físico" }
      : { ...i, naoSeAplica: false },
  );
  const bloqueadores = itens.filter((i) => i.bloqueia && !i.ok);
  // Itens físicos "não se aplica" não contam como aviso.
  const exigeMotivo = exigeExpedicao
    ? data.exige_motivo
    : data.exige_motivo && itens.some((i) => !i.ok && !i.bloqueia);
  // 2+ remessas ativas: a edge recusa o envio inicial genérico (409 "remessa(s)
  // ativa(s)") — desabilitar ANTES do clique e apontar os botões por remessa.
  const pedidoDividido = ehPedidoDividido(remessas);
  const qtdRemessas = remessasAtivas(remessas).length;
  const podeEnviar = data.pode_enviar && !jaEnviado && !pedidoDividido;
  const podeEscrever = temNivel(2);
  const motivoValido = motivo.trim().length >= MIN_MOTIVO;

  const disparar = async (comMotivo?: string) => {
    if (jaEnviado) return;
    try {
      await enviar.mutateAsync({ pedido_id: pedidoId, motivo: comMotivo });
      setDialogOpen(false);
      setMotivo("");
    } catch {
      // erro tratado no hook
    }
  };

  const onClickEnviar = () => {
    if (jaEnviado) return;
    if (exigeMotivo) {
      setDialogOpen(true);
      return;
    }
    void disparar();
  };

  const botao = (
    <Button
      size="sm"
      className="w-full gap-1.5"
      disabled={!podeEnviar || enviar.isPending}
      onClick={onClickEnviar}
    >
      {enviar.isPending
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <Send className="h-4 w-4" />}
      {jaEnviado ? "Já enviado ao Bling" : "Enviar ao Bling"}
    </Button>
  );

  return (
    <div className="w-full rounded-md border p-3 space-y-3">
      <div className="text-sm font-medium">Conferência de pré-faturamento</div>

      <ul className="space-y-2">
        {itens.map((item) => (
          <li key={item.codigo} className="flex gap-2 text-sm">
            <IconeEstado item={item} />
            <div className="min-w-0">
              <div className={item.naoSeAplica ? "text-muted-foreground" : item.ok ? "" : item.bloqueia ? "text-destructive" : "text-warning"}>
                {item.rotulo}
              </div>
              {item.detalhe && (
                <div className="text-xs text-muted-foreground break-words">{item.detalhe}</div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {podeEscrever && (
        !podeEnviar ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block w-full">{botao}</span>
              </TooltipTrigger>
              <TooltipContent>
                {jaEnviado
                  ? `Já enviado ao Bling (id ${blingIdDestino}) — emitir a NF lá`
                  : pedidoDividido
                  ? `Pedido dividido em ${qtdRemessas} remessas — envie cada uma pelos botões abaixo.`
                  : bloqueadores.length > 0
                  ? `Bloqueado por: ${bloqueadores.map((b) => b.rotulo).join(", ")}`
                  : "Envio bloqueado pela conferência."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : botao
      )}

      {podeEscrever && pedidoDividido && (
        <p className="text-xs text-muted-foreground leading-snug">
          Este pedido foi dividido em {qtdRemessas} remessas — envie cada uma nos botões
          “Enviar pro Bling (tentativa X)” abaixo.
        </p>
      )}

      {podeEscrever && (
        <p className="text-xs text-muted-foreground leading-snug">
          {exigeExpedicao
            ? "A NF é emitida no Bling. O pedido vira Faturado sozinho quando ela for ingerida."
            : "A NF é emitida no Bling (modalidade de frete: sem frete). O pedido vira Entregue sozinho quando ela for ingerida."}
        </p>
      )}

      <Dialog
        open={dialogOpen && !jaEnviado}
        onOpenChange={(v) => {
          if (enviar.isPending) return;
          setDialogOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar com pendências</DialogTitle>
            <DialogDescription>
              Pedido <strong>#{data.id_externo}</strong> tem {data.avisos} aviso(s) na conferência.
              Descreva o motivo do envio mesmo assim (mínimo {MIN_MOTIVO} caracteres).
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: peso e volume confirmados por telefone com a expedição"
            rows={3}
          />
          <div className="text-xs text-muted-foreground">
            {motivo.trim().length}/{MIN_MOTIVO} caracteres
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={enviar.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={!motivoValido || enviar.isPending || jaEnviado}
              onClick={() => void disparar(motivo.trim())}
              className="gap-1.5"
            >
              {enviar.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
              Enviar ao Bling
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
