import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertTriangle, ShieldCheck, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { useNomesUsuarios } from "@/hooks/useReportes";

/** Retorno de fn_avaliar_envelope_plano (fonte única do disponível). */
export interface EnvelopePlano {
  exposicao?: number | null;
  cabe_no_prazo?: boolean | null;
  limite_disponivel?: number | null;
  cabe_no_limite_disponivel?: boolean | null;
  excesso_limite?: number | null;
  limite_vigente?: number | null;
  em_aberto?: number | null;
  reservado_outros?: number | null;
  classe?: string | null;
  alcada_valor_autorizado?: number | null;
  alcada_cobre?: boolean | null;
  limite_disponivel_erro?: string | null;
}

const n = (v: unknown) => Number(v ?? 0);

export function EnvelopeCreditoBanner({
  pedidoId, env, className,
}: { pedidoId: string; env: EnvelopePlano; className?: string }) {
  const qc = useQueryClient();
  const exposicao = n(env.exposicao);
  const disponivel = env.limite_disponivel;
  const { permitido: podeAlcada } = usePermissaoAcaoOuSuperAdmin("acao.credito_liberar_alcada");
  const [abrirDevolver, setAbrirDevolver] = useState(false);
  const [abrirAlcada, setAbrirAlcada] = useState(false);

  const estado: "erro" | "verde" | "azul" | "ambar" | null =
    env.limite_disponivel_erro ? "erro"
    : env.cabe_no_limite_disponivel === true && env.cabe_no_prazo === true ? "verde"
    : env.cabe_no_limite_disponivel === false && env.alcada_cobre === true ? "azul"
    : env.cabe_no_limite_disponivel === false ? "ambar"
    : null;

  const detalhe = disponivel != null ? (
    <div className="mt-1 text-xs text-muted-foreground">
      Exposição do plano {formatBRL(exposicao)} · Limite {formatBRL(n(env.limite_vigente))} · Em aberto{" "}
      {formatBRL(n(env.em_aberto))} · Reservado em outros pedidos {formatBRL(n(env.reservado_outros))} · Disponível{" "}
      {formatBRL(n(disponivel))}
      {estado === "ambar" && (
        <span className="ml-1 font-semibold text-warning-strong">· Excede em {formatBRL(n(env.excesso_limite))}</span>
      )}
    </div>
  ) : null;

  if (estado === "erro") {
    return (
      <Alert className={`border-border bg-muted/40 ${className ?? ""}`}>
        <Info className="h-4 w-4" />
        <AlertTitle>Não foi possível medir o limite disponível</AlertTitle>
        <AlertDescription>{env.limite_disponivel_erro}{detalhe}</AlertDescription>
      </Alert>
    );
  }
  if (estado === "verde") {
    return (
      <Alert className={`border-success/40 bg-success/5 text-success ${className ?? ""}`}>
        <CheckCircle2 className="h-4 w-4 !text-success" />
        <AlertTitle>Dentro do crédito disponível</AlertTitle>
        <AlertDescription>Pode materializar direto.{detalhe}</AlertDescription>
      </Alert>
    );
  }
  if (estado === "azul") {
    return (
      <Alert className={`border-info/40 bg-info/5 text-info ${className ?? ""}`}>
        <ShieldCheck className="h-4 w-4 !text-info" />
        <AlertTitle>Liberado por alçada até {formatBRL(n(env.alcada_valor_autorizado))}</AlertTitle>
        <AlertDescription>
          Pode materializar.
          <AutoriaAlcada pedidoId={pedidoId} />
          {detalhe}
        </AlertDescription>
      </Alert>
    );
  }
  if (estado !== "ambar") return null;

  return (
    <Alert className={`border-warning/50 bg-warning/10 text-warning-strong ${className ?? ""}`}>
      <AlertTriangle className="h-4 w-4 !text-warning-strong" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <AlertTitle>Acima do limite disponível — precisa de decisão</AlertTitle>
          <AlertDescription>{detalhe}</AlertDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAbrirDevolver(true)}>
            Devolver para análise de crédito
          </Button>
          {podeAlcada && (
            <Button size="sm" onClick={() => setAbrirAlcada(true)}>Liberar por alçada</Button>
          )}
        </div>
      </div>
      <DevolverDialog
        open={abrirDevolver} onOpenChange={setAbrirDevolver} pedidoId={pedidoId}
        motivoInicial={`Plano de ${formatBRL(exposicao)} excede o limite disponível de ${formatBRL(n(disponivel))}.`}
      />
      <AlcadaDialog
        open={abrirAlcada} onOpenChange={setAbrirAlcada} pedidoId={pedidoId}
        disponivel={n(disponivel)} exposicao={exposicao} excesso={n(env.excesso_limite)}
        onOk={() => {
          qc.invalidateQueries({ queryKey: ["avaliar-impacto-plano", pedidoId] });
          qc.invalidateQueries({ queryKey: ["alcada-viva", pedidoId] });
        }}
      />
    </Alert>
  );
}

function AutoriaAlcada({ pedidoId }: { pedidoId: string }) {
  const nomes = useNomesUsuarios();
  const q = useQuery({
    queryKey: ["alcada-viva", pedidoId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("credito_alcada_liberacao")
        .select("autorizado_por, autorizado_em, motivo")
        .eq("pedido_id", pedidoId).eq("status", "vivo")
        .order("autorizado_em", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as { autorizado_por: string | null; autorizado_em: string | null; motivo: string | null } | null;
    },
  });
  if (q.error) return <div className="mt-1 text-xs text-destructive">Erro ao ler a liberação: {rawMessage(q.error)}</div>;
  const a = q.data;
  if (!a) return null;
  const nome = a.autorizado_por ? nomes.data?.[a.autorizado_por] ?? "usuário" : "sistema";
  const data = a.autorizado_em ? new Date(a.autorizado_em).toLocaleString("pt-BR") : "—";
  return <div className="mt-1 text-xs text-muted-foreground">por {nome} em {data} · {a.motivo}</div>;
}

function DevolverDialog({ open, onOpenChange, pedidoId, motivoInicial }: {
  open: boolean; onOpenChange: (v: boolean) => void; pedidoId: string; motivoInicial: string;
}) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState(motivoInicial);
  const m = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("reabrir_analise_pedido", {
        p_pedido_id: pedidoId, p_motivo: motivo.trim(), p_condicao_slug: null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro ?? "Erro ao devolver ao crédito");
      return data;
    },
    onSuccess: async () => {
      toast.success("Pedido devolvido ao crédito");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["cobranca-fila"] });
      qc.invalidateQueries({ queryKey: ["cobranca-proposta", pedidoId] });
      qc.invalidateQueries({ queryKey: ["cobranca-pedido-minimo", pedidoId] });
      await invalidarPedido(qc, pedidoId);
    },
    onError: (e) => toast.error(rawMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) setMotivo(motivoInicial); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver para análise de crédito?</DialogTitle>
          <DialogDescription>
            O plano em montagem será descartado e o pedido volta para a fila de crédito com o motivo abaixo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Motivo</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!motivo.trim() || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Devolver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlcadaDialog({ open, onOpenChange, pedidoId, disponivel, exposicao, excesso, onOk }: {
  open: boolean; onOpenChange: (v: boolean) => void; pedidoId: string;
  disponivel: number; exposicao: number; excesso: number; onOk: () => void;
}) {
  const [valor, setValor] = useState(String(exposicao.toFixed(2)));
  const [motivo, setMotivo] = useState("");
  const valorNum = Number(valor.replace(",", "."));
  const valido = Number.isFinite(valorNum) && valorNum > 0 && motivo.trim().length > 0;
  const m = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("liberar_limite_por_alcada", {
        p_pedido_id: pedidoId, p_valor: valorNum, p_motivo: motivo.trim(),
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao liberar por alçada");
      return data as { ok: boolean; valor_autorizado: number };
    },
    onSuccess: (d) => {
      toast.success(`Liberado por alçada até ${formatBRL(n(d?.valor_autorizado ?? valorNum))}`);
      onOpenChange(false);
      onOk();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) { setValor(exposicao.toFixed(2)); setMotivo(""); } onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liberar acima do limite por alçada</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Disponível</div>{formatBRL(disponivel)}</div>
          <div><div className="text-xs text-muted-foreground">Exposição do plano</div>{formatBRL(exposicao)}</div>
          <div><div className="text-xs text-muted-foreground">Excesso</div>{formatBRL(excesso)}</div>
        </div>
        <div className="space-y-1">
          <Label>Teto de exposição autorizado (R$)</Label>
          <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            O plano poderá ser salvo se a parte a prazo for até este valor. Se aumentar, trava de novo.
          </p>
        </div>
        <div className="space-y-1">
          <Label>Motivo</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!valido || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Liberar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
