import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatError } from "@/lib/format-error";

/**
 * PAINEL DE NÍVEIS — o que era a aba "Papéis" virou painel contextual do
 * Console de Acesso (fusão do MÓDULO DE ACESSO, 12/09/2026).
 *
 * DIMENSÃO-VIA-TABELA: a escada e seus rótulos vêm de `vw_nivel_resumo`
 * (legado = false), com a mesma contagem de usuários por nível que a aba
 * Papéis calculava. Nada de rótulo de nível hardcoded aqui.
 */
interface NivelResumo {
  nivel: number;
  rotulo: string;
  papel: string;
  descricao: string;
  legado: boolean;
  usuarios: number;
  tabelas: number;
  escreve: number;
  sensiveis: number;
}

export function useNiveisResumo() {
  return useQuery({
    queryKey: ["nivel-resumo"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<NivelResumo[]> => {
      const { data, error } = await supabase
        .from("vw_nivel_resumo")
        .select(
          "nivel, rotulo, papel, descricao, legado, usuarios, tabelas, escreve, sensiveis",
        );
      if (error) throw error;
      return (data ?? []) as NivelResumo[];
    },
  });
}

export default function PainelNiveis({
  aberto,
  onOpenChange,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const { data: niveis = [], isLoading, isError, error } = useNiveisResumo();

  const principais = useMemo(
    () => niveis.filter((n) => !n.legado).sort((a, b) => a.nivel - b.nivel),
    [niveis],
  );

  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-base">Níveis de acesso</SheetTitle>
          <SheetDescription className="text-xs leading-snug">
            Grupo diz ONDE a pessoa atua — telas e ações. Nível diz QUÃO FUNDO ela vai no
            dado, e a alçada da célula é o piso de nível dentro da concessão do grupo.
            Cumulativo: cada nível já inclui os anteriores.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {isLoading && (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          )}

          {isError && (
            <p className="text-xs text-destructive">
              Falha ao carregar os níveis: {formatError(error)}
            </p>
          )}

          {!isLoading &&
            !isError &&
            principais.map((n) => (
              <div key={n.nivel} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted">
                  <span className="font-mono text-sm">{n.nivel}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{n.rotulo}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {n.descricao}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {n.usuarios} usuário(s)
                  </Badge>
                  {n.sensiveis > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      {n.sensiveis} sensível(is)
                    </Badge>
                  )}
                </div>
              </div>
            ))}

          {!isLoading && !isError && principais.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum nível ativo cadastrado.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
