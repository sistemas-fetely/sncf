import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Grupo {
  id: string;
  nome: string;
}

const SEM_GRUPO = "__sem_grupo__";

export function GrupoCell({ userId }: { userId: string }) {
  const qc = useQueryClient();

  const { data: grupos = [] } = useQuery({
    queryKey: ["grupos-acesso-lista"],
    queryFn: async (): Promise<Grupo[]> => {
      const { data, error } = await supabase
        .from("grupos_acesso")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Grupo[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: vinculo } = useQuery({
    queryKey: ["grupo-acesso-vinculo", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grupo_acesso_usuarios")
        .select("id, grupo_acesso_id")
        .eq("user_id", userId)
        .is("inativado_em", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateGrupo = useMutation({
    mutationFn: async (novoGrupoId: string | null) => {
      // Inativa vínculo atual (se houver)
      if (vinculo?.id) {
        const { error } = await supabase
          .from("grupo_acesso_usuarios")
          .update({ inativado_em: new Date().toISOString() })
          .eq("id", vinculo.id);
        if (error) throw error;
      }
      // Insere novo se selecionou um grupo
      if (novoGrupoId) {
        const { error } = await supabase
          .from("grupo_acesso_usuarios")
          .insert({ grupo_acesso_id: novoGrupoId, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grupo-acesso-vinculo", userId] });
      qc.invalidateQueries({ queryKey: ["permissoes-telas"] });
      toast.success("Grupo atualizado");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao atualizar grupo"),
  });

  const valorAtual = vinculo?.grupo_acesso_id ?? SEM_GRUPO;

  return (
    <Select
      value={valorAtual}
      onValueChange={(v) => updateGrupo.mutate(v === SEM_GRUPO ? null : v)}
      disabled={updateGrupo.isPending}
    >
      <SelectTrigger className="h-8 w-[180px] text-xs">
        <SelectValue>
          {valorAtual === SEM_GRUPO ? (
            <span className="text-muted-foreground italic">Sem grupo</span>
          ) : (
            grupos.find((g) => g.id === valorAtual)?.nome ?? "—"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_GRUPO}>
          <span className="text-muted-foreground italic">Sem grupo</span>
        </SelectItem>
        {grupos.map((g) => (
          <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
