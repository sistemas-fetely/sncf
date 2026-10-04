import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Cd = "XPM-SC" | "SITE-SP";

interface Sugestao {
  sugerido: Cd;
  site_sp_cobre_tudo: boolean;
  site_sp_habilitado: boolean;
  itens: number;
  itens_cobertos: number;
  faltas: Array<{ sku: string; pedido: number; disponivel_sp: number }> | null;
}

/** CD de expedição atual do pedido (origem_centro_id nulo = XPM-SC). */
export function useCdExpedicaoB2B(pedido_id: string) {
  return useQuery({
    queryKey: ["pedido-cd-expedicao", pedido_id],
    enabled: !!pedido_id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: p, error } = await sb
        .from("pedidos")
        .select("canal, origem_centro_id")
        .eq("id", pedido_id)
        .maybeSingle();
      if (error) throw error;
      let codigo: Cd = "XPM-SC";
      if (p?.origem_centro_id) {
        const { data: c, error: e2 } = await sb
          .from("centro_distribuicao")
          .select("codigo")
          .eq("id", p.origem_centro_id)
          .maybeSingle();
        if (e2) throw e2;
        if (c?.codigo) codigo = c.codigo as Cd;
      }
      const canal = String(p?.canal ?? "").toLowerCase();
      return { ehB2B: canal === "b2b", codigo };
    },
  });
}

const ROTULO: Record<Cd, string> = { "XPM-SC": "XPM-SC", "SITE-SP": "Site SP" };

export function ExpedirPorB2B({ pedido_id }: { pedido_id: string }) {
  const qc = useQueryClient();
  const cdQ = useCdExpedicaoB2B(pedido_id);
  const atual = cdQ.data?.codigo ?? "XPM-SC";
  const [alvo, setAlvo] = useState<Cd | null>(null);
  const [motivo, setMotivo] = useState("");
  const [faltasAbertas, setFaltasAbertas] = useState(false);

  const sugQ = useQuery({
    queryKey: ["b2b-sugestao-cd", pedido_id],
    enabled: !!cdQ.data?.ehB2B,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_b2b_sugestao_cd", {
        p_pedido_id: pedido_id,
      });
      if (error) throw error;
      return data as Sugestao;
    },
  });

  const trocar = useMutation({
    mutationFn: async (cd: Cd) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("b2b_escolher_cd_expedicao", {
        p_pedido_id: pedido_id,
        p_centro_codigo: cd,
        p_motivo: motivo.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async (_d, cd) => {
      toast.success(`Expedição definida: ${ROTULO[cd]}`);
      setAlvo(null);
      setMotivo("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pedido-cd-expedicao", pedido_id] }),
        qc.invalidateQueries({ queryKey: ["b2b-sugestao-cd", pedido_id] }),
        qc.invalidateQueries({ queryKey: ["pedido-xpm", pedido_id] }),
        qc.invalidateQueries({ queryKey: ["pedido", pedido_id] }),
        qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedido_id] }),
      ]);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e)),
  });

  if (cdQ.isError) {
    return <p className="text-xs text-destructive">Falha ao ler CD de expedição: {(cdQ.error as Error).message}</p>;
  }
  if (!cdQ.data?.ehB2B) return null;

  const s = sugQ.data;
  const spDesabilitado = s ? !s.site_sp_habilitado : true;
  const faltas = s?.faltas ?? [];

  const opcao = (cd: Cd) => {
    const ativo = atual === cd;
    const desab = cd === "SITE-SP" && spDesabilitado && !ativo;
    const btn = (
      <button
        type="button"
        disabled={desab || trocar.isPending}
        onClick={() => !ativo && setAlvo(cd)}
        className={cn(
          "flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors",
          ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          desab && "opacity-50 cursor-not-allowed hover:bg-transparent",
        )}
      >
        {ROTULO[cd]}
        {s?.sugerido === cd && <span className="ml-1 text-[10px] opacity-75">(sugerido)</span>}
      </button>
    );
    if (!desab) return btn;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex-1 flex">{btn}</span>
        </TooltipTrigger>
        <TooltipContent>Aguardando validação fiscal (venda B2B saindo da matriz SP)</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <p className="text-xs font-medium">Expedir por</p>
      <div className="flex gap-1 rounded-md bg-muted/50 p-0.5">
        {opcao("XPM-SC")}
        {opcao("SITE-SP")}
      </div>
      {sugQ.isError ? (
        <p className="text-xs text-destructive">Falha na sugestão: {(sugQ.error as Error).message}</p>
      ) : s ? (
        <div className="text-xs text-muted-foreground">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => setFaltasAbertas((v) => !v)}
            disabled={faltas.length === 0}
          >
            Site SP cobre {s.itens_cobertos} de {s.itens} itens
            {faltas.length > 0 && (
              <ChevronDown className={cn("h-3 w-3 transition-transform", faltasAbertas && "rotate-180")} />
            )}
          </button>
          {faltasAbertas && faltas.length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-2">
              {faltas.map((f) => (
                <li key={f.sku} className="tabular-nums">
                  <span className="font-mono">{f.sku}</span>: pedido {f.pedido} · SP {f.disponivel_sp}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {atual === "SITE-SP" && (
        <p className="text-xs">
          Este pedido será separado na <b>Expedição SP</b>.{" "}
          <Link to="/logistica/expedicao-sp" className="underline">
            Abrir Expedição SP
          </Link>
        </p>
      )}

      <Dialog open={alvo !== null} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Expedir por {alvo ? ROTULO[alvo] : ""}?</DialogTitle>
            <DialogDescription>
              Troca o CD de expedição do pedido de {ROTULO[atual]} para {alvo ? ROTULO[alvo] : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>
              Cancelar
            </Button>
            <Button disabled={trocar.isPending} onClick={() => alvo && trocar.mutate(alvo)}>
              {trocar.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
