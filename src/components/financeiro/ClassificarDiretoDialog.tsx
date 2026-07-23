import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { CategoriaCombobox } from "@/components/financeiro/CategoriaCombobox";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";
import { useCentrosCusto } from "@/hooks/financeiro/useCentrosCusto";

type Furo = {
  id: string;
  valor: number;
  data_transacao: string;
  descricao: string | null;
  contraparte_nome: string | null;
};

type Classe = "tarifa_bancaria" | "imposto" | "outro_classificado";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  furo: Furo | null;
  onDone: () => void;
}

export function ClassificarDiretoDialog({ open, onOpenChange, furo, onDone }: Props) {
  const { data: categorias = [] } = useCategoriasPlano();
  const { data: centrosCusto = [] } = useCentrosCusto(true);

  const [classe, setClasse] = useState<Classe | "">("");
  const [planoContasId, setPlanoContasId] = useState<string | null>(null);
  const [centroCustoId, setCentroCustoId] = useState<string>("__none__");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setClasse("");
      setPlanoContasId(null);
      setCentroCustoId("__none__");
      setSalvando(false);
    }
  }, [open, furo?.id]);

  const podeSalvar = !!classe && !!planoContasId && !salvando;

  async function classificar() {
    if (!furo || !classe || !planoContasId) return;
    setSalvando(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("classificar_debito_direto", {
        p_mov_id: furo.id,
        p_classe: classe,
        p_plano_contas_id: planoContasId,
        p_centro_custo_id: centroCustoId === "__none__" ? null : centroCustoId,
        p_user_id: userId,
      });

      if (error) {
        toast.error(error.message || "Erro ao classificar débito");
        return;
      }
      if (data && data.ok === false) {
        toast.error(data.erro || "Não foi possível classificar");
        return;
      }
      toast.success("Débito classificado");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao classificar débito");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Classificar débito direto</DialogTitle>
        </DialogHeader>

        {furo && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-0.5">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{formatDateBR(furo.data_transacao)}</span>
              <span className="font-mono font-semibold">{formatBRL(Number(furo.valor))}</span>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {furo.descricao || furo.contraparte_nome || "—"}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Classe <span className="text-destructive">*</span></Label>
            <Select value={classe} onValueChange={(v) => setClasse(v as Classe)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar classe..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tarifa_bancaria">Tarifa bancária</SelectItem>
                <SelectItem value="imposto">Imposto</SelectItem>
                <SelectItem value="outro_classificado">Outro (folha, ajustes etc.)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Plano de contas <span className="text-destructive">*</span></Label>
            <CategoriaCombobox
              options={categorias}
              value={planoContasId}
              onChange={(id) => setPlanoContasId(id)}
              placeholder="Selecionar categoria..."
              disabled={salvando}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Centro de custo</Label>
            <Select
              value={centroCustoId}
              onValueChange={setCentroCustoId}
              disabled={salvando}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Sem centro —</SelectItem>
                {centrosCusto.map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>{cc.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={classificar} disabled={!podeSalvar}>
            {salvando ? "Classificando..." : "Classificar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
