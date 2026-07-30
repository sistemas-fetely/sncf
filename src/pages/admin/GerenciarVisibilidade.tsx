import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, ShieldAlert, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RotaNavAdmin {
  rota: string;
  chave: string;
  label: string;
  nivel: string;
  tela_slug: string | null;
  status: string;
  apenas_super_admin: boolean;
  superficies: string[];
  grupo_label: string;
  ordem: number;
}

export default function GerenciarVisibilidade() {
  const queryClient = useQueryClient();

  const { data: rotas, isLoading } = useQuery({
    queryKey: ["navegacao-admin"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RotaNavAdmin[]> => {
      const { data, error } = await (supabase as any).rpc("listar_navegacao_admin");
      if (error) throw error;
      return (data ?? []) as RotaNavAdmin[];
    },
  });

  const flip = useMutation({
    mutationFn: async ({ rota, novoStatus }: { rota: string; novoStatus: string }) => {
      const { data, error } = await (supabase as any).rpc("set_navegacao_status", {
        p_rota: rota,
        p_status: novoStatus,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      // Invalida também o cache do portão e do menu: mesma fonte, mesma linha.
      queryClient.invalidateQueries({ queryKey: ["navegacao-admin"] });
      queryClient.invalidateQueries({ queryKey: ["navegacao-portao"] });
      toast.success(
        vars.novoStatus === "pronta"
          ? `${vars.rota} agora está visível`
          : `${vars.rota} escondido (em construção)`
      );
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Falha ao alterar visibilidade");
    },
  });

  const grupos = useMemo(() => {
    if (!rotas) return [] as Array<[string, RotaNavAdmin[]]>;
    const map = new Map<string, RotaNavAdmin[]>();
    for (const r of rotas) {
      if (!map.has(r.grupo_label)) map.set(r.grupo_label, []);
      map.get(r.grupo_label)!.push(r);
    }
    return Array.from(map.entries());
  }, [rotas]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalPronta = rotas?.filter((r) => r.status === "pronta").length ?? 0;
  const total = rotas?.length ?? 0;

  return (
    <TooltipProvider>
      <div className="container max-w-4xl py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Visibilidade de Telas</h1>
          <p className="text-sm text-muted-foreground">
            Ligue ou desligue telas para os usuários. Telas em construção ficam ocultas
            para todos exceto super_admin. Você (super_admin) sempre vê tudo.
          </p>
          <p className="text-xs text-muted-foreground">
            Fonte: <code className="text-[11px]">sncf_navegacao</code> — a mesma linha que o portão
            e o menu leem. O que você desliga aqui desaparece dos dois.
          </p>
          <Badge variant="outline" className="text-xs">
            {totalPronta} de {total} telas visíveis
          </Badge>
        </div>

        {grupos.map(([grupo, itens]) => (
          <Card key={grupo}>
            <CardHeader>
              <CardTitle className="text-base">{grupo}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {itens.map((r) => {
                const visivel = r.status === "pronta";
                // Sem dono e sem trava de super_admin: publicar violaria
                // nav_rota_pronta_tem_dono. Bloqueia antes do clique.
                const semDono = !r.tela_slug && !r.apenas_super_admin;
                const travado = !visivel && semDono;
                return (
                  <div
                    key={r.rota}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {visivel ? (
                        <Eye className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{r.label}</p>
                          {r.apenas_super_admin && (
                            <Tooltip>
                              <TooltipTrigger>
                                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                              </TooltipTrigger>
                              <TooltipContent>Restrita a super_admin</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.rota}
                          {r.tela_slug ? ` · ${r.tela_slug}` : ""}
                        </p>
                      </div>
                    </div>
                    {travado ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Sem dono: defina a permissão da tela antes de publicar
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Switch
                        checked={visivel}
                        disabled={flip.isPending}
                        onCheckedChange={(checked) =>
                          flip.mutate({
                            rota: r.rota,
                            novoStatus: checked ? "pronta" : "em_construcao",
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}
