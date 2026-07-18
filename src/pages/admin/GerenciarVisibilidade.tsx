import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RotaConfig } from "@/hooks/useRotasConfig";

// Agrupamento visual por área (só rótulo; não afeta a lógica)
function grupoDoPrefixo(prefixo: string): string {
  if (["/", "/meus-dados", "/meus-acessos", "/minhas-notas"].includes(prefixo)) return "Base / Self-service";
  if (prefixo.startsWith("/credito")) return "Crédito";
  if (["/pedidos", "/parceiros", "/vendas", "/comercial"].some((p) => prefixo.startsWith(p))) return "Comercial / Pedidos";
  if (["/sncf", "/tarefas", "/processos", "/templates", "/fala-fetely", "/documentacao", "/compras"].some((p) => prefixo.startsWith(p))) return "SNCF / Transversais";
  if (prefixo.startsWith("/ti")) return "TI";
  if (prefixo.startsWith("/administrativo")) return "Financeiro / Administrativo";
  if (prefixo.startsWith("/admin")) return "Administração do Sistema";
  if (["/dashboard", "/gestao-a-vista", "/relatorios"].some((p) => prefixo.startsWith(p))) return "Gestão à Vista";
  return "People / RH";
}

export default function GerenciarVisibilidade() {
  const queryClient = useQueryClient();

  const { data: rotas, isLoading } = useQuery({
    queryKey: ["rotas-config"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RotaConfig[]> => {
      const { data, error } = await (supabase as any).rpc("listar_rotas_config");
      if (error) throw error;
      return (data ?? []) as RotaConfig[];
    },
  });

  const flip = useMutation({
    mutationFn: async ({ prefixo, novoStatus }: { prefixo: string; novoStatus: string }) => {
      const { data, error } = await (supabase as any).rpc("set_rota_status", {
        p_prefixo: prefixo,
        p_status: novoStatus,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["rotas-config"] });
      toast.success(
        vars.novoStatus === "pronta"
          ? `${vars.prefixo} agora está visível`
          : `${vars.prefixo} escondido (em construção)`
      );
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Falha ao alterar visibilidade");
    },
  });

  const grupos = useMemo(() => {
    if (!rotas) return [] as Array<[string, RotaConfig[]]>;
    const map = new Map<string, RotaConfig[]>();
    for (const r of [...rotas].sort((a, b) => a.ordem - b.ordem)) {
      const g = grupoDoPrefixo(r.prefixo);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
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
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Visibilidade de Telas</h1>
        <p className="text-sm text-muted-foreground">
          Ligue ou desligue telas para os usuários. Telas em construção ficam ocultas
          para todos exceto super_admin. Você (super_admin) sempre vê tudo.
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
              return (
                <div
                  key={r.prefixo}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {visivel ? (
                      <Eye className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.prefixo}</p>
                      {r.tela_slug && (
                        <p className="text-xs text-muted-foreground truncate">{r.tela_slug}</p>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={visivel}
                    disabled={flip.isPending}
                    onCheckedChange={(checked) =>
                      flip.mutate({
                        prefixo: r.prefixo,
                        novoStatus: checked ? "pronta" : "em_construcao",
                      })
                    }
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
