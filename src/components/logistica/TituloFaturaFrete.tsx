import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { formatBRL } from "@/lib/format-currency";

type Props = {
  faturaFreteId: string | null;
  contaPagarId: string | null;
  tituloStatus: string | null;
  declarado: number | null;
  calculado: number | null;
  rotulo: string;
};

type Resp = { ok?: boolean; cpr_id?: string; valor?: number; aviso?: string; ja_gerado?: boolean; vinculado_existente?: boolean };

export function TituloFaturaFrete({ faturaFreteId, contaPagarId, tituloStatus, declarado, calculado, rotulo }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { permitido } = usePermissaoAcaoOuSuperAdmin("acao.pagar_criar");
  const [gerando, setGerando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  if (!faturaFreteId) return <span className="text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>—</span>;

  if (contaPagarId) {
    return (
      <Badge
        variant="outline"
        className="cursor-pointer font-normal hover:bg-muted"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/administrativo/contas-pagar?busca=${encodeURIComponent(rotulo)}`);
        }}
      >
        Título · {tituloStatus ?? "—"}
      </Badge>
    );
  }

  if (!permitido) return <span className="text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>sem título</span>;

  const gerar = async () => {
    setGerando(true);
    try {
      const { data, error } = await (supabase as any).rpc("fn_fatura_frete_gerar_titulo", { p_fatura_frete_id: faturaFreteId });
      if (error) throw error;
      const r = (data ?? {}) as Resp;
      if (r.ok === false) throw new Error((r as any).erro ?? "Falha ao gerar título");
      const titulo = r.vinculado_existente ? "Ligado a título já existente" : r.ja_gerado ? "Título já existia" : "Título gerado";
      toast.success(titulo, r.aviso ? { description: r.aviso } : undefined);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["faturas-frete"] }),
        qc.invalidateQueries({ queryKey: ["correios-fatura-ciclos"] }),
        qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes("contas") }),
      ]);
    } catch (e: any) {
      toast.error("Erro ao gerar título", { description: e?.message ?? String(e) });
    } finally {
      setGerando(false);
      setConfirmar(false);
    }
  };

  const divergente = declarado != null && calculado != null && Math.abs(declarado - calculado) > 5;

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Button
        size="sm"
        variant="outline"
        disabled={gerando}
        onClick={(e) => {
          e.stopPropagation();
          if (divergente) setConfirmar(true);
          else void gerar();
        }}
      >
        {gerando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        Gerar título
      </Button>
      <AlertDialog open={confirmar} onOpenChange={(o) => !gerando && setConfirmar(o)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Fatura divergente</AlertDialogTitle>
            <AlertDialogDescription>
              A fatura declara {formatBRL(declarado ?? 0)}, os lançamentos/postagens somam {formatBRL(calculado ?? 0)}. O título nasce com o valor DECLARADO e um aviso para conferir antes de pagar. Gerar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gerando} onClick={(e) => e.stopPropagation()}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={gerando}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void gerar();
              }}
            >
              {gerando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Gerar título
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
