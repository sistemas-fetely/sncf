import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { resolverIcone } from "@/config/iconesNavegacao";

interface ItemAtalhoConfig {
  chave: string;
  label: string;
  rota: string;
  icone: string | null;
  dominio: string;
  ordem: number;
}

// Silent dimension: a tela não conhece a tabela de domínios, só precisa
// de rótulos legíveis pros poucos domínios que recebem atalho_config.
const DOMINIO_LABEL: Record<string, string> = {
  pessoa: "Pessoas",
  tesouraria: "Financeiro",
  sistema: "TI",
};

function labelDominio(dominio: string): string {
  return DOMINIO_LABEL[dominio] ?? dominio.charAt(0).toUpperCase() + dominio.slice(1);
}

export default function Configuracoes() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: itens, isLoading } = useQuery({
    queryKey: ["navegacao-atalhos-config"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sncf_navegacao")
        .select("chave, label, rota, icone, dominio, ordem")
        .contains("tags", ["atalho_config"])
        .eq("status", "pronta")
        .order("dominio", { ascending: true })
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemAtalhoConfig[];
    },
  });

  const filtered = useMemo(() => {
    const lower = searchTerm.toLowerCase().trim();
    if (!lower) return itens ?? [];
    return (itens ?? []).filter((i) => i.label.toLowerCase().includes(lower));
  }, [searchTerm, itens]);

  const secoes = useMemo(() => {
    const map = new Map<string, ItemAtalhoConfig[]>();
    for (const item of filtered) {
      const secao = labelDominio(item.dominio);
      const list = map.get(secao) ?? [];
      list.push(item);
      map.set(secao, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <PageShell>
      <PageHeader titulo="Configurações" estado="Ajustes e parâmetros gerais do sistema" />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar configuração..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma configuração com esse termo. Tente o nome do módulo.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {secoes.map(([secao, secaoItens]) => (
            <div key={secao} className="space-y-3">
              <h2 className="text-[15px] font-medium">{secao}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {secaoItens.map((item) => {
                  const Icon = resolverIcone(item.icone);
                  return (
                    <button
                      key={item.chave}
                      onClick={() => navigate(item.rota)}
                      className="group text-left"
                    >
                      <Card className="h-full transition-colors hover:bg-muted/50 hover:border-primary/40">
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                            <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm">{item.label}</p>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
