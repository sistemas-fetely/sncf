import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Receipt, Loader2 } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { toast } from "sonner";
import { CategoriaCombobox, type CategoriaOption } from "./CategoriaCombobox";
import { LinhaInvestimentoCombobox } from "./LinhaInvestimentoCombobox";
import { useCentrosCusto } from "@/hooks/financeiro/useCentrosCusto";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Movimentacao = {
  id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
  movimentacao: Movimentacao | null;
  onConciliado: () => void;
}

export function DespesaDiretaDialog({ open, onClose, movimentacao, onConciliado }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [centroCustoId, setCentroCustoId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState<string>("");
  const [parceiroId, setParceiroId] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [linhaInvestimentoId, setLinhaInvestimentoId] = useState<string | null>(null);
  const { data: centrosCusto = [] } = useCentrosCusto();

  // Carrega parceiros pra o select opcional
  const { data: parceiros } = useQuery({
    queryKey: ["parceiros-despesa-direta"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social")
        .eq("ativo", true)
        .order("razao_social");
      return (data || []) as { id: string; razao_social: string }[];
    },
    enabled: open,
  });

  // Carrega categorias filtradas pra "pagar" (despesas)
  const { data: categorias } = useQuery({
    queryKey: ["categorias-despesa-direta"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("plano_contas")
        .select("id, codigo, nome, parent_id, nivel, tipo")
        .order("codigo");
      // Filtra só categorias de saída (não começam com '01' que é receita)
      return ((data || []) as CategoriaOption[]).filter(
        (c) => !c.codigo.startsWith("01"),
      );
    },
    enabled: open,
  });

  // Sugere descrição inicial baseado na movimentação
  function abrir() {
    if (movimentacao && !descricao) {
      setDescricao(movimentacao.descricao);
    }
  }

  async function handleSalvar() {
    if (!movimentacao || !categoriaId) {
      toast.error("Selecione a categoria.");
      return;
    }
    setEnviando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("criar_despesa_direta_ofx", {
        p_movimentacao_id: movimentacao.id,
        p_categoria_id: categoriaId,
        p_descricao: descricao || movimentacao.descricao,
        p_parceiro_id: parceiroId || null,
        p_user_id: user?.id || null,
      });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      if (!r?.ok) throw new Error(r?.erro || "Falha desconhecida");

      // Vincular centro de custo + linha de investimento (UPDATE pós-RPC)
      const cprId = r?.conta_pagar_id;
      if (cprId && (linhaInvestimentoId || centroCustoId)) {
        const updatePayload: Record<string, string | null> = {};
        if (linhaInvestimentoId) updatePayload.linha_investimento_id = linhaInvestimentoId;
        if (centroCustoId) updatePayload.centro_custo_id = centroCustoId;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updErr } = await (supabase as any)
          .from("contas_pagar_receber")
          .update(updatePayload)
          .eq("id", cprId);
        if (updErr) {
          toast.warning(
            "Despesa criada, mas vínculo de dimensões falhou: " + updErr.message,
          );
        }
      }

      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
      toast.success("Despesa direta criada e conciliada");
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
    setCategoriaId("");
    setCentroCustoId(null);
    setDescricao("");
    setParceiroId("");
    setLinhaInvestimentoId(null);
    onClose();
  }

  if (!movimentacao) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) abrir();
        else handleClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Despesa Direta
          </DialogTitle>
          <DialogDescription>
            Use pra taxas bancárias, IOF, juros e outras despesas que não tinham conta a pagar prévia.
            Cria registro retroativo já conciliado.
          </DialogDescription>
        </DialogHeader>

        {/* Resumo movimentação */}
        <div className="rounded-md border p-3 bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">
                {formatDateBR(movimentacao.data_transacao)} • OFX
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

        {/* Categoria */}
        <div className="space-y-1">
          <Label className="text-xs">Categoria *</Label>
          <CategoriaCombobox
            options={categorias || []}
            value={categoriaId || null}
            onChange={(id) => setCategoriaId(id || "")}
            placeholder="Selecione (Tarifas Bancárias, IOF, etc.)"
          />
        </div>

        {/* Centro de Custo (opcional) */}
        <div className="space-y-1">
          <Label className="text-xs">Centro de Custo (opcional)</Label>
          <Select
            value={centroCustoId ?? "__none__"}
            onValueChange={(v) => setCentroCustoId(v === "__none__" ? null : v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Sem centro de custo —</SelectItem>
              {centrosCusto.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Linha de Investimento (opcional) */}
        <div className="space-y-1">
          <Label className="text-xs">Linha de Investimento (opcional)</Label>
          <LinhaInvestimentoCombobox
            value={linhaInvestimentoId}
            onChange={setLinhaInvestimentoId}
          />
        </div>


        <div className="space-y-1">
          <Label className="text-xs">Descrição</Label>
          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={movimentacao.descricao}
            className="h-8 text-sm"
          />
        </div>

        {/* Parceiro (opcional) */}
        <div className="space-y-1">
          <Label className="text-xs">Parceiro (opcional)</Label>
          <select
            value={parceiroId}
            onChange={(e) => setParceiroId(e.target.value)}
            className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
          >
            <option value="">— sem parceiro —</option>
            {(parceiros || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.razao_social}
              </option>
            ))}
          </select>
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={handleClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={enviando || !categoriaId} className="gap-2">
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar e Conciliar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
