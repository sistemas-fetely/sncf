import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Link2, FileText } from "lucide-react";
import { toast } from "sonner";

type CandidatoNF = {
  nf_id: string;
  nf_numero: string;
  nf_chave_acesso: string;
  fornecedor_razao_social: string;
  fornecedor_cliente: string;
  fornecedor_cnpj: string;
  nf_data_emissao: string;
  valor_total: number;
  descricao: string;
  categoria_id: string | null;
  categoria_codigo: string | null;
  categoria_nome: string | null;
  score: number;
  motivos: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaId: string;
  contaDescricao: string;
  contaValor: number;
  onVinculado?: () => void;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v ?? 0);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
}

export default function BuscarNFStageDialog({
  open,
  onOpenChange,
  contaId,
  contaDescricao,
  contaValor,
  onVinculado,
}: Props) {
  const qc = useQueryClient();
  const [vinculando, setVinculando] = useState<string | null>(null);

  // Busca info do compromisso parcelado (se houver) pra mostrar valor agregado.
  // RPC `buscar_nfs_stage_para_conta` já detecta parcelamento via ratio valor_NF/valor_conta,
  // então não precisa ser passado pra ela — é só pra contexto visual do usuário.
  const { data: compromissoInfo } = useQuery({
    queryKey: ["compromisso-info-busca-nf", contaId],
    enabled: open && !!contaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: conta } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("compromisso_parcelado_id")
        .eq("id", contaId)
        .maybeSingle();
      const compId = conta?.compromisso_parcelado_id;
      if (!compId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: comp } = await (supabase as any)
        .from("compromissos_parcelados")
        .select("id, descricao, valor_total, qtd_parcelas")
        .eq("id", compId)
        .maybeSingle();
      return comp || null;
    },
  });

  const valorParaMatch = Number(compromissoInfo?.valor_total ?? contaValor ?? 0);

  const { data: candidatos = [], isLoading } = useQuery({
    queryKey: ["buscar-nfs-stage", contaId],
    enabled: open && !!contaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "buscar_nfs_stage_para_conta",
        { p_conta_id: contaId }
      );
      if (error) throw error;
      return (data || []) as CandidatoNF[];
    },
  });

  async function handleVincular(nfId: string) {
    setVinculando(nfId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("vincular_nf_a_conta", {
        p_nf_id: nfId,
        p_conta_id: contaId,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Erro ao vincular");
        return;
      }
      toast.success("NF vinculada — dados enriquecidos");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", contaId] });
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      if (onVinculado) onVinculado();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setVinculando(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Buscar NF em Stage
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <div>
              Conta: <span className="font-medium">{contaDescricao}</span> —{" "}
              {formatBRL(contaValor)}
            </div>
            {compromissoInfo && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                ✨ Buscando NF do compromisso completo (
                {compromissoInfo.qtd_parcelas} parcelas) —{" "}
                <span className="font-medium">{formatBRL(Number(compromissoInfo.valor_total))}</span>
              </div>
            )}
            <div className="text-xs">
              IA busca match por CNPJ, valor, razão social, nome fantasia e data de emissão.
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : candidatos.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground space-y-2">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>Nenhuma NF compatível encontrada em Stage.</p>
              <p className="text-xs">
                Use o botão "Anexar NF" pra subir um PDF/XML manualmente.
              </p>
            </div>
          ) : (
            candidatos.map((c) => (
              <div
                key={c.nf_id}
                className="border rounded-lg overflow-hidden transition-colors hover:border-emerald-300"
              >
                {/* Cabeçalho do card */}
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">
                      {c.fornecedor_razao_social || c.fornecedor_cliente || "—"}
                    </span>
                    <Badge
                      className={
                        c.score >= 80
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]"
                          : c.score >= 60
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]"
                      }
                    >
                      {c.score}% match
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    NF nº {c.nf_numero || "—"} · {formatDate(c.nf_data_emissao)} ·{" "}
                    {formatBRL(c.valor_total)}
                    {(() => {
                      if (valorParaMatch > 0 && Math.abs(c.valor_total - valorParaMatch) < 0.01) {
                        return (
                          <span className="text-emerald-700 font-medium">
                            {" "}(= {formatBRL(valorParaMatch)})
                          </span>
                        );
                      }
                      if (!contaValor || contaValor <= 0) return null;
                      const ratio = c.valor_total / contaValor;
                      const ratioRounded = Math.round(ratio);
                      if (ratioRounded >= 2 && ratioRounded <= 36 && Math.abs(ratio - ratioRounded) <= 0.02) {
                        return (
                          <span className="text-blue-700 font-medium">
                            {" "}({ratioRounded}x {formatBRL(contaValor)})
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </p>

                  {c.fornecedor_cnpj && (
                    <p className="text-xs text-muted-foreground">CNPJ {c.fornecedor_cnpj}</p>
                  )}
                  {c.categoria_codigo && (
                    <p className="text-xs text-muted-foreground">
                      📁 {c.categoria_codigo} {c.categoria_nome}
                    </p>
                  )}
                  {c.motivos && (
                    <p className="text-[11px] text-blue-600">✨ {c.motivos}</p>
                  )}
                </div>

                {/* Rodapé com botão — sempre visível */}
                <div className="px-3 py-2 bg-muted/30 border-t border-dashed flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Clique para vincular esta NF à conta
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleVincular(c.nf_id)}
                    disabled={!!vinculando}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {vinculando === c.nf_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    Vincular
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
