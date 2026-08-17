import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Link2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { fmtMoeda } from "@/lib/compras/lancamento-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { CardIndicador } from "@/components/ui/card-indicador";

import {
import { invalidarCompras } from "@/lib/compras/invalidar";
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: number;
  fornecedorId: string | null;
}

interface NfCandidata {
  id: number;
  numero: string | null;
  data_emissao: string | null;
  container: string | null;
  valor_total: number | null;
  vinculos: Array<{ pedido_id: number; numero_pedido: string | null }>;
}

interface Previa {
  nf_id: number;
  nf_numero: string | null;
  nf_valor: number | null;
  pedido_destino: number | null;
  ja_vinculado: boolean | null;
  skus_na_nf: number | null;
  skus_que_existem_no_pedido: number | null;
  skus_fora_do_pedido: number | null;
  vinculos_atuais: Array<{ pedido_id: number; numero_pedido: string | null }> | null;
  desvincular_de: number | null;
  alocacoes_a_reapontar: number | null;
  linhas_alocaveis?: number | null;
  alocacoes?: number | null;
  valor_produto?: number | null;
  valor_servico?: number | null;
  valor_total_alocado?: number | null;
  valor_total_nf?: number | null;
  sem_depara?: number | null;
  servico_sem_destino?: number | null;
}

function fmtData(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function VincularNfDialog({ open, onOpenChange, pedidoId, fornecedorId }: Props) {
  const qc = useQueryClient();
  const [nfSelecionada, setNfSelecionada] = useState<number | null>(null);
  const [desvincular, setDesvincular] = useState(true);

  useEffect(() => {
    if (!open) {
      setNfSelecionada(null);
      setDesvincular(true);
    }
  }, [open]);

  const candidatasQ = useQuery({
    queryKey: ["vincular-nf-candidatas", pedidoId, fornecedorId],
    enabled: open && Number.isFinite(pedidoId) && !!fornecedorId,
    queryFn: async () => {
      const { data: nfs, error } = await (supabase as any)
        .from("importacao_nf")
        .select("id, numero, data_emissao, container, valor_total")
        .eq("fornecedor_id", fornecedorId)
        .order("data_emissao", { ascending: false })
        .limit(300);
      if (error) throw error;
      const lista = (nfs ?? []) as Array<Omit<NfCandidata, "vinculos">>;
      if (lista.length === 0) return [] as NfCandidata[];

      const { data: vincs, error: e2 } = await (supabase as any)
        .from("importacao_nf_pedido")
        .select("nf_id, importacao_pedido_id")
        .in(
          "nf_id",
          lista.map((n) => n.id),
        );
      if (e2) throw e2;
      const vlist = (vincs ?? []) as Array<{ nf_id: number; importacao_pedido_id: number }>;

      const pedidoIds = Array.from(new Set(vlist.map((v) => v.importacao_pedido_id)));
      const nomes = new Map<number, string | null>();
      if (pedidoIds.length > 0) {
        const { data: peds, error: e3 } = await (supabase as any)
          .from("importacao_pedido")
          .select("id, numero_pedido")
          .in("id", pedidoIds);
        if (e3) throw e3;
        for (const p of (peds ?? []) as Array<{ id: number; numero_pedido: string | null }>) {
          nomes.set(p.id, p.numero_pedido);
        }
      }

      return lista
        .map((nf) => ({
          ...nf,
          vinculos: vlist
            .filter((v) => v.nf_id === nf.id)
            .map((v) => ({
              pedido_id: v.importacao_pedido_id,
              numero_pedido: nomes.get(v.importacao_pedido_id) ?? null,
            })),
        }))
        .filter((nf) => !nf.vinculos.some((v) => v.pedido_id === pedidoId)) as NfCandidata[];
    },
  });

  const nfAtual = useMemo(
    () => (candidatasQ.data ?? []).find((n) => n.id === nfSelecionada) ?? null,
    [candidatasQ.data, nfSelecionada],
  );

  const origem = nfAtual?.vinculos[0] ?? null;

  const previaQ = useQuery({
    queryKey: ["vincular-nf-previa", pedidoId, nfSelecionada, desvincular && origem?.pedido_id],
    enabled: open && !!nfSelecionada,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("vincular_nf_pedido", {
        p_nf_id: nfSelecionada,
        p_pedido_id: pedidoId,
        p_desvincular_de: desvincular && origem ? origem.pedido_id : null,
        p_confirmar: false,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as Previa;
    },
  });

  const confirmar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("vincular_nf_pedido", {
        p_nf_id: nfSelecionada,
        p_pedido_id: pedidoId,
        p_desvincular_de: desvincular && origem ? origem.pedido_id : null,
        p_confirmar: true,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as Previa;
    },
    onSuccess: (r) => {
      toast.success(
        `NF ${r?.nf_numero ?? ""} vinculada — ${fmtMoeda(r?.valor_total_alocado ?? 0, "BRL")} de ${fmtMoeda(
          r?.valor_total_nf ?? 0,
          "BRL",
        )} alocado.`,
      );
      const fora = (r?.sem_depara ?? 0) + (r?.servico_sem_destino ?? 0);
      if (fora > 0) {
        toast.warning(
          `${fora} linha(s) ficaram fora do rateio. Resolva na aba "Rateio de NF".`,
        );
      }
      invalidarCompras(qc);
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-diag-alocacao"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const previa = previaQ.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Vincular NF existente
          </DialogTitle>
          <DialogDescription>
            NFs deste fornecedor que ainda não estão neste pedido. Entrega parcial: um pedido pode
            receber várias notas.
          </DialogDescription>
        </DialogHeader>

        {!fornecedorId ? (
          <div className="text-sm text-muted-foreground">
            Pedido sem fornecedor definido — não é possível listar NFs.
          </div>
        ) : candidatasQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando NFs...
          </div>
        ) : candidatasQ.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {formatError(candidatasQ.error)}
          </div>
        ) : (candidatasQ.data ?? []).length === 0 ? (
          <EstadoVazio
            mensagem="Nenhuma NF deste fornecedor disponível para vincular. Importe a nota na aba “Rateio de NF” ou confira se ela já está neste pedido."
          />

        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {(candidatasQ.data ?? []).map((nf) => {
              const outro = nf.vinculos[0] ?? null;
              const ativo = nf.id === nfSelecionada;
              return (
                <button
                  key={nf.id}
                  type="button"
                  onClick={() => setNfSelecionada(nf.id)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left transition-colors",
                    ativo ? "border-primary bg-primary/10" : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">NF {nf.numero ?? nf.id}</div>
                    <div className="text-sm tabular-nums">
                      {fmtMoeda(nf.valor_total ?? 0, "BRL")}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Emissão {fmtData(nf.data_emissao)}</span>
                    <span>·</span>
                    <span>Container {nf.container ?? "—"}</span>
                    {outro && (
                      <>
                        <span>·</span>
                        <Selo estado="warning">
                          Já em {outro.numero_pedido ?? outro.pedido_id}
                        </Selo>
                      </>
                    )}
                  </div>
                  {outro && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Vincular aqui vai mover a nota deste pedido de origem.
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {nfSelecionada && (
          <div className="rounded-md border p-3 space-y-3">
            {previaQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculando prévia...
              </div>
            ) : previaQ.isError ? (
              <div className="text-xs text-destructive">{formatError(previaQ.error)}</div>
            ) : previa ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <CardIndicador
                    compacto
                    rotulo="SKUs no pedido"
                    valor={`${previa.skus_que_existem_no_pedido ?? 0} de ${previa.skus_na_nf ?? 0}`}
                  />
                  <CardIndicador
                    compacto
                    rotulo="SKUs fora do pedido"
                    valor={previa.skus_fora_do_pedido ?? 0}
                    tom={(previa.skus_fora_do_pedido ?? 0) > 0 ? "atencao" : "neutro"}
                  />
                  <CardIndicador
                    compacto
                    rotulo="Rateios a reapontar"
                    valor={previa.alocacoes_a_reapontar ?? 0}
                  />
                </div>


                {(previa.skus_fora_do_pedido ?? 0) > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      A nota traz {previa.skus_fora_do_pedido} SKU(s) que este pedido não pediu.
                    </span>
                  </div>
                )}

                {origem && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="desvincular-origem"
                      checked={desvincular}
                      onCheckedChange={(v) => setDesvincular(v === true)}
                    />
                    <Label htmlFor="desvincular-origem" className="text-sm">
                      Desvincular de {origem.numero_pedido ?? origem.pedido_id}
                    </Label>
                  </div>
                )}
                {origem && !desvincular && (
                  <div className="text-xs text-muted-foreground">
                    A NF ficará vinculada aos dois pedidos.
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => confirmar.mutate()}
            disabled={!nfSelecionada || previaQ.isLoading || !previa || confirmar.isPending}
          >
            {confirmar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar vínculo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
