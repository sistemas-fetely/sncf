import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Grupo {
  id: string;
  nome: string;
}

const SEM_GRUPO = "__sem_grupo__";

export function GrupoCell({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

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
      if (vinculo?.id) {
        const { error } = await supabase
          .from("grupo_acesso_usuarios")
          .update({ inativado_em: new Date().toISOString() })
          .eq("id", vinculo.id);
        if (error) throw error;
      }
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
      setIsEditing(false);
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao atualizar grupo"),
  });

  const valorAtual = vinculo?.grupo_acesso_id ?? SEM_GRUPO;
  const grupoAtual = grupos.find((g) => g.id === vinculo?.grupo_acesso_id);

  if (isEditing) {
    return (
      <Select
        value={valorAtual}
        onValueChange={(v) => updateGrupo.mutate(v === SEM_GRUPO ? null : v)}
        onOpenChange={(open) => { if (!open) setIsEditing(false); }}
        disabled={updateGrupo.isPending}
        defaultOpen
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue>
            {valorAtual === SEM_GRUPO ? (
              <span className="text-muted-foreground italic">Sem grupo</span>
            ) : (
              grupoAtual?.nome ?? "—"
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

  if (grupoAtual) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="group inline-flex items-center gap-1"
      >
        <Badge variant="outline" className="text-xs gap-1 font-normal">
          <ShieldCheck className="h-3 w-3" />
          {grupoAtual.nome}
          <Pencil className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
        </Badge>
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs text-muted-foreground italic">Sem grupo</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs gap-1"
        onClick={() => setIsEditing(true)}
      >
        <Plus className="h-3 w-3" />
        Atribuir
      </Button>
    </div>
  );
}
