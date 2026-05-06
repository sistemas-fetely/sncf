import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoriaCombobox, CategoriaOption } from "./CategoriaCombobox";
import { useCentrosCusto } from "@/hooks/financeiro/useCentrosCusto";
import { toast } from "sonner";

type Conta = {
  id: string;
  codigo: string;
  nome: string;
  parent_id: string | null;
  nivel: number;
  tipo: string;
  natureza: string | null;
  centro_custo_id: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  options: CategoriaOption[];
  defaultParentId?: string | null;
  editing?: Conta | null;
  onSaved?: (id: string) => void;
}

const TIPOS = ["receita", "despesa", "investimento", "imposto"] as const;
const NATUREZAS = ["operacional", "financeira", "nao_operacional", "deducao"] as const;

function suggestNextCode(parent: Conta | undefined, allOptions: CategoriaOption[]): string {
  if (!parent) {
    const tops = allOptions.filter((o) => o.nivel === 1).map((o) => parseInt(o.codigo, 10) || 0);
    const next = (Math.max(0, ...tops) + 1).toString().padStart(2, "0");
    return next;
  }
  const prefix = parent.codigo + ".";
  const siblings = allOptions
    .filter((o) => o.parent_id === parent.id)
    .map((o) => o.codigo.slice(prefix.length).split(".")[0])
    .map((s) => parseInt(s, 10) || 0);
  const next = (Math.max(0, ...siblings) + 1).toString().padStart(2, "0");
  return prefix + next;
}

export function CategoriaFormDialog({
  open,
  onOpenChange,
  options,
  defaultParentId = null,
  editing = null,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!editing;
  const { data: centros = [] } = useCentrosCusto();
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string>("despesa");
  const [natureza, setNatureza] = useState<string>("operacional");
  const [centroCustoId, setCentroCustoId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCodigo(editing.codigo);
      setNome(editing.nome);
      setParentId(editing.parent_id);
      setTipo(editing.tipo);
      setNatureza(editing.natureza ?? "operacional");
      setCentroCustoId(editing.centro_custo_id ?? "");
    } else {
      setParentId(defaultParentId);
      const parentObj = defaultParentId
        ? (options.find((o) => o.id === defaultParentId) as unknown as Conta | undefined)
        : undefined;
      setCodigo(suggestNextCode(parentObj, options));
      setNome("");
      setTipo("despesa");
      setNatureza("operacional");
      setCentroCustoId("");
    }
  }, [open, editing, defaultParentId, options]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!codigo.trim() || !nome.trim()) {
        throw new Error("Código e nome são obrigatórios");
      }
      const parent = parentId ? options.find((o) => o.id === parentId) : null;
      const nivel = parent ? parent.nivel + 1 : 1;
      const payload = {
        codigo: codigo.trim(),
        nome: nome.trim(),
        parent_id: parentId,
        nivel,
        tipo,
        natureza,
        centro_custo_id: centroCustoId || null,
        ativo: true,
      };
      if (isEdit && editing) {
        const { data, error } = await supabase
          .from("plano_contas")
          .update({
            nome: payload.nome,
            tipo: payload.tipo,
            natureza: payload.natureza,
            centro_custo_id: payload.centro_custo_id,
          })
          .eq("id", editing.id)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      } else {
        const { data, error } = await supabase
          .from("plano_contas")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: (id) => {
      toast.success(isEdit ? "Categoria atualizada" : "Categoria criada");
      qc.invalidateQueries({ queryKey: ["plano-contas"] });
      qc.invalidateQueries({ queryKey: ["plano-contas-flat"] });
      onSaved?.(id);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize os dados da categoria. O código não pode ser alterado."
              : "Crie uma nova conta no plano de contas."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código</Label>
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="ex: 05.08"
                disabled={isEdit}
                className="font-mono"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da categoria" />
          </div>

          <div>
            <Label>Categoria pai</Label>
            <CategoriaCombobox
              options={options}
              value={parentId}
              onChange={setParentId}
              allowNull
              disabled={isEdit}
              placeholder="Nenhuma (raiz)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Natureza</Label>
              <Select value={natureza} onValueChange={setNatureza}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NATUREZAS.map((n) => (
                    <SelectItem key={n} value={n} className="capitalize">
                      {n.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Centro de custo</Label>
              <Select
                value={centroCustoId || "_none"}
                onValueChange={(v) => setCentroCustoId(v === "_none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum</SelectItem>
                  {centros.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="capitalize">
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : isEdit ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
