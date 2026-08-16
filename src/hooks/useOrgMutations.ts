import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PosicaoInsert {
  titulo_cargo: string;
  nivel_hierarquico: number;
  departamento: string;
  area?: string | null;
  filial?: string | null;
  status: string;
  id_pai?: string | null;
  vinculo_id?: string | null;
  salario_previsto?: number | null;
  centro_custo?: string | null;
}

interface PosicaoUpdate extends Partial<PosicaoInsert> {
  id: string;
}

export function useCreatePosicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: PosicaoInsert) => {
      const { error } = await supabase.from("posicoes").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organograma"] });
      toast.success("Posição criada com sucesso");
    },
    onError: (e: Error) => toast.error(`Erro ao criar posição: ${e.message}`),
  });
}

export function useUpdatePosicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PosicaoUpdate) => {
      // If it's a virtual node, create a real position instead
      if (id.startsWith("virtual-")) {
        const { error } = await supabase.from("posicoes").insert({
          ...data,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("posicoes").update(data).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organograma"] });
      toast.success("Posição atualizada com sucesso");
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar: ${e.message}`),
  });
}

export function useDeletePosicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (id.startsWith("virtual-")) return; // Can't delete virtual nodes
      const { error } = await supabase.from("posicoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organograma"] });
      toast.success("Posição removida com sucesso");
    },
    onError: (e: Error) => toast.error(`Erro ao remover: ${e.message}`),
  });
}

export function useMovePosicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, newParentId, node, parentNode }: { id: string; newParentId: string | null; node?: any; parentNode?: any }) => {
      // Resolve parent: if virtual, create a real position first
      let resolvedParentId = newParentId;
      if (newParentId && newParentId.startsWith("virtual-")) {
        const parentRealId = newParentId.replace("virtual-", "");

        // Check if a position already exists for this person
        const { data: existing } = await supabase
          .from("posicoes")
          .select("id")
          .eq("vinculo_id", parentRealId)
          .limit(1);

        if (existing && existing.length > 0) {
          resolvedParentId = existing[0].id;
        } else {
          const parentInsert: PosicaoInsert = {
            titulo_cargo: parentNode?.titulo_cargo || "Sem cargo",
            departamento: parentNode?.departamento || "Geral",
            nivel_hierarquico: parentNode?.nivel_hierarquico || 1,
            status: "ocupado",
            id_pai: null,
            vinculo_id: parentRealId,
          };
          const { data: newParent, error: parentErr } = await supabase
            .from("posicoes")
            .insert(parentInsert)
            .select("id")
            .single();
          if (parentErr) throw parentErr;
          resolvedParentId = newParent.id;
        }
      }

      if (id.startsWith("virtual-")) {
        const realId = id.replace("virtual-", "");

        // Check if a position already exists for this person
        const { data: existing } = await supabase
          .from("posicoes")
          .select("id")
          .eq("vinculo_id", realId)
          .limit(1);

        if (existing && existing.length > 0) {
          // Update existing position's parent
          const { error } = await supabase
            .from("posicoes")
            .update({ id_pai: resolvedParentId })
            .eq("id", existing[0].id);
          if (error) throw error;
        } else {
          const insert: PosicaoInsert = {
            titulo_cargo: node?.titulo_cargo || "Sem cargo",
            departamento: node?.departamento || "Geral",
            nivel_hierarquico: node?.nivel_hierarquico || 1,
            status: "ocupado",
            id_pai: resolvedParentId,
            vinculo_id: realId,
          };
          const { error } = await supabase.from("posicoes").insert(insert);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("posicoes")
          .update({ id_pai: resolvedParentId })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organograma"] });
      toast.success("Posição movida com sucesso");
    },
    onError: (e: Error) => toast.error(`Erro ao mover: ${e.message}`),
  });
}
