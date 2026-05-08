import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { toast } from "sonner";

type Movimentacao = {
  id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
};

type ContaCandidata = {
  id: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  parceiro_razao_social: string | null;
  parceiro_cnpj: string | null;
  nf_numero: string | null;
  status: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  movimentacao: Movimentacao | null;
  onConciliado: () => void;
}

export function ConciliarLoteDialog({ open, onClose, movimentacao, onConciliado }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  const { data: contas, isLoading } = useQuery({
    queryKey: ["contas-para-match-ofx"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("contas_para_match_ofx");
      if (error) throw error;
      return (data || []) as ContaCandidata[];
    },
    enabled: open,
  });

  const valorMov = useMemo(() => Math.abs(movimentacao?.valor || 0), [movimentacao]);

  const filtradas = useMemo(() => {
    let lista = contas || [];
    if (busca.trim()) {
      const t = busca.toLowerCase();
      lista = lista.filter(
        (c) =>
          c.parceiro_razao_social?.toLowerCase().includes(t) ||
          c.fornecedor_cliente?.toLowerCase().includes(t) ||
          c.nf_numero?.toLowerCase().includes(t),
      );
    }
    return lista;
  }, [contas, busca]);

  const somaSelecionadas = useMemo(() => {
    if (!contas) return 0;
    return contas
      .filter((c) => selecionadas.has(c.id))
      .reduce((s, c) => s + Number(c.valor || 0), 0);
  }, [contas, selecionadas]);

  const diferenca = valorMov - somaSelecionadas;
  const podeConciliar = Math.abs(diferenca) <= 0.01 && selecionadas.size > 0;

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConciliar() {
    if (!movimentacao || !podeConciliar) return;
    setEnviando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("conciliar_em_lote_ofx", {
        p_movimentacao_id: movimentacao.id,
        p_conta_ids: Array.from(selecionadas),
        p_user_id: user?.id || null,
      });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      if (!r?.ok) throw new Error(r?.erro || "Falha desconhecida");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
      toast.success(`${r.contas_conciliadas} contas conciliadas em lote (${formatBRL(r.valor_total)})`);
      onConciliado();
      handleClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setEnviando(false);
    }
  }

  function handleClose() {
    setBusca("");
    setSelecionadas(new Set());
    onClose();
  }

  if (!movimentacao) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Conciliar em Lote (SISPAG / pagamento múltiplo)
          </DialogTitle>
          <DialogDescription>
            Selecione as contas a pagar que foram pagas neste único débito do extrato.
            A soma deve bater com o valor da movimentação.
          </DialogDescription>
        </DialogHeader>

        {/* Resumo movimentação */}
        <div className="rounded-md border p-3 bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">
                {formatDateBR(movimentacao.data_transacao)} • Movimentação OFX
              </div>
              <div className="text-sm font-medium truncate" title={movimentacao.descricao}>
                {movimentacao.descricao}
              </div>
            </div>
            <div className="font-mono text-lg font-bold text-red-700 whitespace-nowrap">
              {formatBRL(movimentacao.valor)}
            </div>
          </div>
        </div>

        {/* Soma em tempo real */}
        <div
          className={`rounded-md border-2 p-3 transition-colors ${
            podeConciliar
              ? "border-emerald-300 bg-emerald-50"
              : selecionadas.size > 0
                ? "border-amber-300 bg-amber-50"
                : "border-muted bg-muted/20"
          }`}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {podeConciliar ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
              <div>
                <div className="text-xs text-muted-foreground">
                  {selecionadas.size} conta(s) selecionada(s)
                </div>
                <div className="font-mono text-sm font-bold">
                  {formatBRL(somaSelecionadas)} de {formatBRL(valorMov)}
                </div>
              </div>
            </div>
            {Math.abs(diferenca) > 0.01 && (
              <Badge variant="outline" className="text-xs">
                {diferenca > 0 ? "Falta" : "Excede"}: {formatBRL(Math.abs(diferenca))}
              </Badge>
            )}
            {podeConciliar && (
              <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700">
                ✓ Soma bate exato
              </Badge>
            )}
          </div>
        </div>

        {/* Busca */}
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fornecedor, NF..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-8 text-sm flex-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filtradas.length} de {contas?.length || 0}
          </span>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-auto border rounded-md divide-y">
          {isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : filtradas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {busca ? "Nada encontrado pra essa busca." : "Nenhuma conta a pagar disponível."}
            </div>
          ) : (
            filtradas.map((c) => {
              const isSel = selecionadas.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 p-2 cursor-pointer hover:bg-muted/30 ${isSel ? "bg-emerald-50/40" : ""}`}
                >
                  <Checkbox checked={isSel} onCheckedChange={() => toggle(c.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {c.parceiro_razao_social || c.fornecedor_cliente || "?"}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex gap-2">
                      {c.data_vencimento && <span>Venc: {formatDateBR(c.data_vencimento)}</span>}
                      {c.nf_numero && <span>NF: {c.nf_numero}</span>}
                      <Badge variant="outline" className="text-[8px] py-0 px-1 h-3">
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="font-mono text-xs whitespace-nowrap">
                    {formatBRL(c.valor)}
                  </div>
                </label>
              );
            })
          )}
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={handleClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            onClick={handleConciliar}
            disabled={!podeConciliar || enviando}
            className="gap-2"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            Conciliar {selecionadas.size} conta(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
