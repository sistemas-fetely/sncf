import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ShieldCheck, X } from "lucide-react";
import {
  useAdicionarUsuarioAoGrupo,
  useRemoverUsuarioDoGrupo,
} from "@/hooks/useGruposAcessoV2";

interface Grupo {
  id: string;
  nome: string;
}

interface VinculoGrupo {
  id: string;
  grupo_acesso_id: string;
  grupos_acesso: { nome: string | null; ativo: boolean | null } | null;
}

export function GrupoCell({ userId }: { userId: string }) {
  const [aberto, setAberto] = useState(false);

  const adicionar = useAdicionarUsuarioAoGrupo();
  const remover = useRemoverUsuarioDoGrupo();

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

  // Vínculo é N:N: a célula lista TODOS os grupos da pessoa.
  const { data: vinculos = [] } = useQuery({
    queryKey: ["grupo-acesso-vinculo", userId],
    queryFn: async (): Promise<VinculoGrupo[]> => {
      const { data, error } = await supabase
        .from("grupo_acesso_usuarios")
        .select("id, grupo_acesso_id, grupos_acesso(nome, ativo)")
        .eq("user_id", userId);
      if (error) throw error;
      const rows = (data ?? []) as unknown as VinculoGrupo[];
      return rows.sort((a, b) =>
        (a.grupos_acesso?.nome ?? "").localeCompare(b.grupos_acesso?.nome ?? "", "pt-BR"),
      );
    },
  });

  const disponiveis = useMemo(() => {
    const jaTem = new Set(vinculos.map((v) => v.grupo_acesso_id));
    return grupos.filter((g) => !jaTem.has(g.id));
  }, [grupos, vinculos]);

  const handleRemover = (v: VinculoGrupo) => {
    const nomeGrupo = v.grupos_acesso?.nome ?? "grupo";
    if (!confirm(`Remover esta pessoa do grupo ${nomeGrupo}?`)) return;
    remover.mutate({ grupoId: v.grupo_acesso_id, userId });
  };

  const botaoAdicionar = (rotulo?: string) => (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          disabled={adicionar.isPending || disponiveis.length === 0}
          title={disponiveis.length === 0 ? "Já está em todos os grupos ativos" : "Adicionar a um grupo"}
        >
          <Plus className="h-3 w-3" />
          {rotulo}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {disponiveis.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Nenhum grupo ativo disponível
          </p>
        ) : (
          disponiveis.map((g) => (
            <button
              key={g.id}
              type="button"
              className="w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
              onClick={() => {
                adicionar.mutate({ grupoId: g.id, userId });
                setAberto(false);
              }}
            >
              {g.nome}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );

  if (vinculos.length === 0) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="text-xs text-muted-foreground italic">Sem grupo</span>
        {botaoAdicionar("Atribuir")}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {vinculos.map((v) => {
        const inativo = v.grupos_acesso?.ativo === false;
        return (
          <Badge
            key={v.id}
            variant="outline"
            className={`group text-xs gap-1 font-normal ${inativo ? "opacity-50" : ""}`}
            title={inativo ? "grupo inativo — não concede acesso" : undefined}
          >
            <ShieldCheck className="h-3 w-3" />
            {v.grupos_acesso?.nome ?? "Grupo"}
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              disabled={remover.isPending}
              onClick={() => handleRemover(v)}
              aria-label={`Remover do grupo ${v.grupos_acesso?.nome ?? ""}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
      {botaoAdicionar()}
    </div>
  );
}
