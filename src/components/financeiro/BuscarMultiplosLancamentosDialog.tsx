import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Landmark, Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { getFaturaInfoMap, type FaturaInfo } from "@/lib/financeiro/get-fatura-info";

type ContaPagar = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  fornecedor_cliente: string | null;
  status: string;
  formas_pagamento: { nome: string } | null;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ofxId: string | null;
  ofxDescricao: string;
  ofxValorAbs: number;
  ofxData: string;
  onSuccess: () => void;
}

export function BuscarMultiplosLancamentosDialog({
  open,
  onOpenChange,
  ofxId,
  ofxDescricao,
  ofxValorAbs,
  ofxData,
  onSuccess,
}: Props) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setBusca("");
      setSelecionadas(new Set());
    }
  }, [open]);

  // Lista contas a pagar pendentes
  const { data: contas = [], isLoading } = useQuery({
    queryKey: ["contas-pagar-multiplas", open],
    enabled: open,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("contas_pagar_receber")
        .select(
          "id, descricao, valor, data_vencimento, fornecedor_cliente, status, formas_pagamento:forma_pagamento_id(nome)",
        )
        .in("status", ["aprovado", "enviado_para_pagamento"])
        .is("movimentacao_bancaria_id", null)
        .order("data_vencimento", { ascending: true });
      return (data || []) as ContaPagar[];
    },
  });

  // Map: conta_pagar_id -> { banco_nome, fatura_vencimento }
  const { data: faturaInfoMap = new Map<string, FaturaInfo>() } = useQuery({
    queryKey: ["fatura-info-map-multiplas", contas.map((c) => c.id).join(",")],
    enabled: open && contas.length > 0,
    queryFn: () => getFaturaInfoMap(contas.map((c) => c.id)),
  });

  // Filtra por busca (descrição, fornecedor, valor)
  const contasFiltradas = useMemo(() => {
    if (!busca.trim()) return contas;
    const t = busca.toLowerCase();
    const buscaNumerica = parseFloat(busca.replace(",", "."));
    return contas.filter(
      (c) =>
        c.descricao.toLowerCase().includes(t) ||
        (c.fornecedor_cliente || "").toLowerCase().includes(t) ||
        (!isNaN(buscaNumerica) && Math.abs(c.valor - buscaNumerica) < 0.01),
    );
  }, [contas, busca]);

  // Soma das contas selecionadas
  const somaSelecionadas = useMemo(() => {
    return contas
      .filter((c) => selecionadas.has(c.id))
      .reduce((sum, c) => sum + c.valor, 0);
  }, [contas, selecionadas]);

  // Diferença pra OFX
  const diferenca = ofxValorAbs - somaSelecionadas;
  const podeAdicionar = selecionadas.size > 0 && Math.abs(diferenca) < 0.01;

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdicionar() {
    if (!ofxId || !podeAdicionar) return;
    setEnviando(true);
    try {
      const ids = Array.from(selecionadas);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("conciliar_multiplas_contas_a_ofx", {
        p_ofx_id: ofxId,
        p_contas_pagar_ids: ids,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Erro ao conciliar");
        return;
      }
      toast.success(
        `Conciliado: ${data.qtd_contas_conciliadas} contas (R$ ${data.valor_total})`,
      );
      qc.invalidateQueries({ queryKey: ["ofx-transacoes-pendentes"] });
      qc.invalidateQueries({ queryKey: ["contas-pagar-pendentes-ofx"] });
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Busca de múltiplos lançamentos</DialogTitle>
          <DialogDescription>
            Selecione N contas a pagar que somem o valor do extrato. Soma deve bater 100% pra liberar.
          </DialogDescription>
        </DialogHeader>

        {/* Header de valores */}
        <div className="flex items-center gap-6 p-3 bg-zinc-50 border rounded-lg flex-wrap">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-zinc-500" />
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor no extrato</div>
              <div className="text-sm font-mono font-semibold text-red-700">
                -{formatBRL(ofxValorAbs)}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Para conciliar</div>
            <div className={`text-sm font-mono font-semibold ${
              Math.abs(diferenca) < 0.01
                ? "text-emerald-700"
                : diferenca > 0
                  ? "text-amber-700"
                  : "text-red-700"
            }`}>
              {formatBRL(Math.abs(diferenca))}
              {Math.abs(diferenca) < 0.01 && " ✓"}
              {diferenca > 0 && " (faltam)"}
              {diferenca < -0.005 && " (excesso)"}
            </div>
          </div>

          <Badge variant="outline" className="ml-auto">
            Selecionadas: {selecionadas.size}
          </Badge>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Busque por fornecedor, descrição ou valor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-y-auto border rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 sticky top-0 border-b">
              <tr>
                <th className="p-2 text-left w-8"></th>
                <th className="p-2 text-left">Descrição</th>
                <th className="p-2 text-left">Fornecedor</th>
                <th className="p-2 text-left">Vencimento</th>
                <th className="p-2 text-left">Meio de pagamento</th>
                <th className="p-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : contasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {contas.length === 0
                      ? "Nenhuma conta a pagar pendente."
                      : "Nenhuma conta corresponde ao filtro."}
                  </td>
                </tr>
              ) : (
                contasFiltradas.map((c) => {
                  const sel = selecionadas.has(c.id);
                  const meioPagamento = c.formas_pagamento?.nome ?? null;
                  const faturaInfo = faturaInfoMap.get(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b cursor-pointer transition ${
                        sel ? "bg-emerald-50" : "hover:bg-zinc-50"
                      }`}
                      onClick={() => toggle(c.id)}
                    >
                      <td className="p-2">
                        <Checkbox checked={sel} onCheckedChange={() => toggle(c.id)} />
                      </td>
                      <td className="p-2 font-medium">{c.descricao}</td>
                      <td className="p-2 text-muted-foreground">
                        {c.fornecedor_cliente || "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {formatDateBR(c.data_vencimento)}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {meioPagamento ? (
                          <div className="flex items-center gap-1">
                            <CreditCard className="h-3 w-3 text-zinc-500" />
                            <span>{meioPagamento}</span>
                            {faturaInfo?.banco_nome && (
                              <span className="text-[10px] text-zinc-400 ml-1">
                                · {faturaInfo.banco_nome}
                                {faturaInfo.fatura_vencimento &&
                                  ` · fat ${formatDateBR(faturaInfo.fatura_vencimento)}`}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] italic">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right font-mono font-semibold">
                        {formatBRL(c.valor)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            onClick={handleAdicionar}
            disabled={!podeAdicionar || enviando}
            className="gap-2"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            Adicionar Lançamentos {selecionadas.size > 0 && `(${selecionadas.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
