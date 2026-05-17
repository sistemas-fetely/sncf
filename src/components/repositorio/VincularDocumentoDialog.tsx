import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

type EntidadeTipo = "cpr" | "movimentacao_bancaria" | "pasta_contrato" | "parceiro";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gedDocumentoId: string | null;
  defaultTipo?: EntidadeTipo;
}

interface OpcaoBusca {
  id: string;
  rotulo: string;
  detalhe?: string;
}

export function VincularDocumentoDialog({
  open,
  onOpenChange,
  gedDocumentoId,
  defaultTipo = "cpr",
}: Props) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<EntidadeTipo>(defaultTipo);
  const [busca, setBusca] = useState("");
  const [escolhidaId, setEscolhidaId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo(defaultTipo);
      setBusca("");
      setEscolhidaId(null);
      setObservacao("");
    }
  }, [open, defaultTipo]);

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ["vincular-busca", tipo, busca],
    enabled: open && busca.trim().length >= 2,
    queryFn: async (): Promise<OpcaoBusca[]> => {
      const termo = `%${busca.trim()}%`;
      if (tipo === "cpr") {
        const { data, error } = await supabase
          .from("contas_pagar_receber_ativas")
          .select("id, descricao, valor, data_vencimento, status")
          .ilike("descricao", termo)
          .limit(20);
        if (error) throw error;
        return (data ?? []).map((r) => ({
          id: r.id as string,
          rotulo: r.descricao as string,
          detalhe: `${formatBRL((r.valor as number) ?? 0)} · venc. ${formatDateBR(r.data_vencimento as string)} · ${r.status}`,
        }));
      }
      if (tipo === "movimentacao_bancaria") {
        const { data, error } = await supabase
          .from("movimentacoes_bancarias")
          .select("id, descricao, valor, data")
          .ilike("descricao", termo)
          .order("data", { ascending: false })
          .limit(20);
        if (error) throw error;
        return (data ?? []).map((r) => ({
          id: r.id as string,
          rotulo: (r.descricao as string) ?? "(sem descrição)",
          detalhe: `${formatBRL((r.valor as number) ?? 0)} · ${formatDateBR(r.data as string)}`,
        }));
      }
      if (tipo === "pasta_contrato") {
        const { data, error } = await (supabase as any)
          .from("pasta_contratos")
          .select("id, numero, valor_total, vigencia_inicio")
          .ilike("numero", termo)
          .limit(20);
        if (error) throw error;
        return ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          rotulo: r.numero,
          detalhe: `${formatBRL(r.valor_total ?? 0)} · início ${formatDateBR(r.vigencia_inicio)}`,
        }));
      }
      // parceiro
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social, cnpj")
        .ilike("razao_social", termo)
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        rotulo: r.razao_social as string,
        detalhe: r.cnpj as string | undefined,
      }));
    },
  });

  async function vincular(fechar: boolean) {
    if (!gedDocumentoId || !escolhidaId) {
      toast.error("Selecione uma entidade pra vincular");
      return;
    }
    setSalvando(true);
    try {
      const entidadeReal: Record<EntidadeTipo, string> = {
        cpr: "contas_pagar_receber",
        movimentacao_bancaria: "movimentacoes_bancarias",
        pasta_contrato: "pasta_contratos",
        parceiro: "parceiros_comerciais",
      };
      const { error } = await supabase.rpc("vincular_documento_polimorfico", {
        p_ged_documento_id: gedDocumentoId,
        p_entidade_tipo: entidadeReal[tipo],
        p_entidade_id: escolhidaId,
        p_observacao: observacao || undefined,
      });
      if (error) throw error;
      toast.success("Documento vinculado");
      qc.invalidateQueries({ queryKey: ["repositorio-documentos"] });
      qc.invalidateQueries({ queryKey: ["repositorio-kpis"] });
      qc.invalidateQueries({ queryKey: ["ged-vinculos", gedDocumentoId] });
      if (fechar) onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao vincular: " + (e instanceof Error ? e.message : String(e)), {
        duration: 15000,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular documento</DialogTitle>
          <DialogDescription>Escolha o tipo de entidade e busque pra vincular.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Tipo de entidade</Label>
            <RadioGroup
              value={tipo}
              onValueChange={(v) => {
                setTipo(v as EntidadeTipo);
                setBusca("");
                setEscolhidaId(null);
              }}
              className="grid grid-cols-2 gap-2"
            >
              {(
                [
                  ["cpr", "CPR (Conta a Pagar/Receber)"],
                  ["movimentacao_bancaria", "Movimentação bancária"],
                  ["pasta_contrato", "Contrato"],
                  ["parceiro", "Parceiro"],
                ] as [EntidadeTipo, string][]
              ).map(([k, label]) => (
                <label
                  key={k}
                  className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-accent text-sm"
                >
                  <RadioGroupItem value={k} />
                  {label}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label>Buscar</Label>
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setEscolhidaId(null);
              }}
              placeholder="Mínimo 2 caracteres"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded border">
            {isFetching && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 inline animate-spin mr-2" /> Buscando...
              </div>
            )}
            {!isFetching && resultados.length === 0 && busca.trim().length >= 2 && (
              <p className="p-4 text-center text-sm text-muted-foreground">Nada encontrado</p>
            )}
            {!isFetching && busca.trim().length < 2 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Digite ao menos 2 caracteres
              </p>
            )}
            {resultados.map((r) => (
              <label
                key={r.id}
                className={`flex items-start gap-2 p-3 cursor-pointer hover:bg-accent border-b last:border-b-0 ${
                  escolhidaId === r.id ? "bg-[#1A4A3A]/5" : ""
                }`}
              >
                <input
                  type="radio"
                  className="mt-1"
                  checked={escolhidaId === r.id}
                  onChange={() => setEscolhidaId(r.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.rotulo}</p>
                  {r.detalhe && <p className="text-xs text-muted-foreground">{r.detalhe}</p>}
                </div>
              </label>
            ))}
          </div>

          <div>
            <Label>Observação (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            onClick={() => vincular(false)}
            disabled={salvando || !escolhidaId}
          >
            Vincular
          </Button>
          <Button
            onClick={() => vincular(true)}
            disabled={salvando || !escolhidaId}
            className="bg-[#1A4A3A] hover:bg-[#1A4A3A]/90"
          >
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Vincular e fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
