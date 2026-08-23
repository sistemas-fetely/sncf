import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export default function PapeisTab() {
  const [mostrarLegados, setMostrarLegados] = useState(false);

  const { data: niveis = [], isLoading: loadingNiveis, error: erroNiveis } = useQuery({
    queryKey: ["nivel-resumo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_nivel_resumo")
        .select("nivel, rotulo, papel, descricao, legado, usuarios, tabelas, escreve, sensiveis");
      if (error) throw error;
      return (data || []) as NivelResumo[];
    },
  });

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

  const { principais, legados, totalLegados } = useMemo(() => {
    const principais = niveis
      .filter((n) => !n.legado)
      .sort((a, b) => a.nivel - b.nivel);
    const legados = niveis
      .filter((n) => n.legado)
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
    return { principais, legados, totalLegados: legados.length };
  }, [niveis]);

  const porPapel = useMemo(() => {
    return alcance.reduce<Record<string, AlcanceLinha[]>>((acc, linha) => {
      acc[linha.papel] = acc[linha.papel] || [];
      acc[linha.papel].push(linha);
      return acc;
    }, {});
  }, [alcance]);

  const loading = loadingNiveis || loadingAlcance;
  const erro = erroNiveis || erroAlcance;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" /> Níveis de acesso
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

  if (erro) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" /> Níveis de acesso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Falha ao carregar níveis de acesso. Tente recarregar a página.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5" /> Níveis de acesso
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Grupo diz ONDE a pessoa atua — telas e ações. Nível diz QUÃO FUNDO ela vai no dado. São 5 níveis cumulativos; atos sensíveis não entram nesta escala, são concedidos um a um em Grupos de Acesso.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Os 5 níveis</h3>
          <div className="space-y-2">
            {principais.map((n) => (
              <div
                key={n.nivel}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted">
                  <span className="font-mono text-lg">{n.nivel}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.rotulo}</p>
                  <p className="text-xs text-muted-foreground">{n.descricao}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {n.usuarios} usuário(s)
                  </Badge>
                  {n.sensiveis > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      {n.sensiveis} tabela(s) sensível(is)
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Cumulativo — nível 3 já inclui tudo do 2 e do 1.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMostrarLegados((v) => !v)}
          >
            {mostrarLegados ? "Ocultar papéis antigos" : `Mostrar papéis antigos (${totalLegados})`}
          </Button>

          {mostrarLegados && (
            <>
              <p className="text-xs text-muted-foreground">
                Papéis do modelo antigo. Continuam existindo porque políticas do banco ainda os citam — vão sendo desativados conforme cada domínio migra. Não conceda estes.
              </p>
              <Accordion type="multiple" className="w-full">
                {legados.map((p) => {
                  const linhas = (porPapel[p.papel] || []).slice().sort((a, b) => {
                    if (a.sensivel !== b.sensivel) return a.sensivel ? -1 : 1;
                    if (a.pode_escrever !== b.pode_escrever) return a.pode_escrever ? -1 : 1;
                    return a.tabela.localeCompare(b.tabela);
                  });

                  return (
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
                        {linhas.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Nenhuma política do banco cita este papel — conceder não destrava nada.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                            {linhas.map((l) => (
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
                  );
                })}
              </Accordion>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
