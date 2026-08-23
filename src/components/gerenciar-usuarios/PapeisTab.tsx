import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface AlcanceLinha {
  papel: string;
  tabela: string;
  pode_ler: boolean;
  pode_escrever: boolean;
  sensivel: boolean;
}

interface PapelResumo {
  papel: string;
  usuarios: number;
  tabelas: number;
  escreve: number;
  sensiveis: number;
  linhas: AlcanceLinha[];
}

export default function PapeisTab() {
  const { data: alcance = [], isLoading: loadingAlcance, error: erroAlcance } = useQuery({
    queryKey: ["papel-alcance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_papel_alcance")
        .select("papel, tabela, pode_ler, pode_escrever, sensivel");
      if (error) throw error;
      return (data || []) as AlcanceLinha[];
    },
  });

  const { data: usuariosPapel = [], isLoading: loadingUsuarios, error: erroUsuarios } = useQuery({
    queryKey: ["papel-usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, user_id")
        .is("revogado_em", null);
      if (error) throw error;
      return (data || []) as { role: string; user_id: string }[];
    },
  });

  const papeis = useMemo<PapelResumo[]>(() => {
    const usuariosPorPapel = usuariosPapel.reduce<Record<string, Set<string>>>((acc, u) => {
      acc[u.role] = acc[u.role] || new Set();
      acc[u.role].add(u.user_id);
      return acc;
    }, {});

    const porPapel = alcance.reduce<Record<string, AlcanceLinha[]>>((acc, linha) => {
      acc[linha.papel] = acc[linha.papel] || [];
      acc[linha.papel].push(linha);
      return acc;
    }, {});

    const todosOsPapeis = new Set([
      ...Object.keys(porPapel),
      ...Object.keys(usuariosPorPapel),
    ]);

    const lista = Array.from(todosOsPapeis).map((papel) => {
      const linhas = (porPapel[papel] || []).slice().sort((a, b) => {
        if (a.sensivel !== b.sensivel) return a.sensivel ? -1 : 1;
        if (a.pode_escrever !== b.pode_escrever) return a.pode_escrever ? -1 : 1;
        return a.tabela.localeCompare(b.tabela);
      });

      return {
        papel,
        usuarios: usuariosPorPapel[papel]?.size || 0,
        tabelas: linhas.length,
        escreve: linhas.filter((l) => l.pode_escrever).length,
        sensiveis: linhas.filter((l) => l.sensivel).length,
        linhas,
      };
    });

    return lista.sort((a, b) => b.tabelas - a.tabelas);
  }, [alcance, usuariosPapel]);

  if (loadingAlcance || loadingUsuarios) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" /> O que cada papel alcança
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (erroAlcance || erroUsuarios) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" /> O que cada papel alcança
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Falha ao carregar alcance dos papéis. Tente recarregar a página.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5" /> O que cada papel alcança
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Papel controla DADO, não tela. Ele decide o que as consultas da pessoa podem tocar no banco — é invisível na interface. Esta lista é derivada automaticamente das políticas do banco; não é editável por aqui: mudar o alcance de um papel exige alterar as políticas.
        </p>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {papeis.map((p) => (
            <AccordionItem key={p.papel} value={p.papel}>
              <AccordionTrigger>
                <div className="flex items-center gap-2 flex-wrap mr-2">
                  <span className="font-mono text-sm">{p.papel}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {p.usuarios} usuário(s)
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {p.tabelas} tabelas
                  </Badge>
                  {p.escreve > 0 && (
                    <Badge className="text-[10px]">{p.escreve} com escrita</Badge>
                  )}
                  {p.sensiveis > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      {p.sensiveis} sensível(is)
                    </Badge>
                  )}
                  {p.tabelas === 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      não faz nada
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {p.linhas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma política do banco cita este papel — conceder não destrava nada.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {p.linhas.map((l) => (
                      <div
                        key={`${p.papel}-${l.tabela}`}
                        className="flex items-center gap-1.5 rounded border px-2 py-1"
                      >
                        <span
                          className={`font-mono text-xs ${l.sensivel ? "text-destructive" : ""}`}
                          title={
                            l.sensivel
                              ? "Tabela com remuneração, dado pessoal ou bancário"
                              : undefined
                          }
                        >
                          {l.tabela}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase">
                          {l.pode_escrever ? "escrita" : "leitura"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
