import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { HeartPulse, Route, AlertTriangle, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NavegacaoSaudeRow {
  achado: string | null;
  chave: string | null;
  label: string | null;
  rota: string | null;
  detalhe: string | null;
  explicacao: string | null;
  severidade: string | null;
}

interface NavegacaoNaoDeclaradaRow {
  rota: string | null;
  herdou_de: string | null;
  situacao: string | null;
  slug_herdado: string | null;
  hits: number | null;
  pessoas: number | null;
  primeira_vez: string | null;
  ultima_vez: string | null;
}

const TITULO_ACHADO: Record<string, string> = {
  herdou_permissao_do_dominio: "Permissão herdada, não decidida",
  sem_superficie: "Declarada mas invisível",
  em_construcao: "Marcada em construção",
  grupo_vazio: "Grupo vazio",
};

const EXPLICACAO_ACHADO: Record<string, string> = {
  herdou_permissao_do_dominio:
    "A tela usa o slug padrão do domínio; ninguém escolheu permissão própria.",
  sem_superficie:
    "Não aparece em menu, ⌘K nem breadcrumb — só quem conhece a URL acessa.",
  em_construcao:
    "Status 'em construção' esconde a tela de quem não é super_admin. Se já funciona, o status está mentindo.",
  grupo_vazio:
    "Grupo de navegação declarado sem nenhuma tela filha.",
};

function seloParaSeveridade(severidade: string | null): EstadoSelo {
  switch (severidade) {
    case "media":
      return "warning";
    case "baixa":
      return "info";
    default:
      return "muted";
  }
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

export default function NavegacaoSaude() {
  const saudeQuery = useQuery<NavegacaoSaudeRow[]>({
    queryKey: ["navegacao-saude"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_navegacao_saude")
        .select("*")
        .order("achado", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as NavegacaoSaudeRow[];
    },
  });

  const naoDeclaradaQuery = useQuery<NavegacaoNaoDeclaradaRow[]>({
    queryKey: ["navegacao-nao-declarada"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_navegacao_nao_declarada")
        .select("*")
        .order("pessoas", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NavegacaoNaoDeclaradaRow[];
    },
  });

  const agrupado = (saudeQuery.data ?? []).reduce<Record<string, NavegacaoSaudeRow[]>>((acc, row) => {
    const chave = row.achado ?? "outro";
    acc[chave] = acc[chave] ?? [];
    acc[chave].push(row);
    return acc;
  }, {});

  return (
    <PageShell variant="dados">
      <PageHeader
        titulo="Saúde da Navegação"
        icone={HeartPulse}
        estado="Diagnóstico de navegação: acusa, nunca bloqueia."
      />

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-lg tracking-tight text-foreground">
            A tabela está dizendo a verdade?
          </h2>
        </div>

        {saudeQuery.isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        )}

        {saudeQuery.isError && (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              Erro ao carregar diagnóstico: {(saudeQuery.error as Error)?.message}
            </CardContent>
          </Card>
        )}

        {!saudeQuery.isLoading && !saudeQuery.isError && saudeQuery.data?.length === 0 && (
          <EstadoVazio
            icone={Info}
            titulo="Nenhum achado"
            mensagem="A tabela de navegação parece consistente: nenhum problema de saúde foi detectado."
          />
        )}

        {!saudeQuery.isLoading && !saudeQuery.isError && saudeQuery.data && saudeQuery.data.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(agrupado).map(([achado, linhas]) => (
              <Card key={achado} className="card-shadow border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base font-normal">
                        {TITULO_ACHADO[achado] ?? achado}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {EXPLICACAO_ACHADO[achado] ?? ""}
                      </p>
                    </div>
                    <Selo estado={seloParaSeveridade(linhas[0]?.severidade)}>
                      {linhas.length}
                    </Selo>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Tela</TableHead>
                        <TableHead className="text-xs">Rota</TableHead>
                        <TableHead className="text-xs">Observação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhas.map((linha, idx) => (
                        <TableRow key={`${achado}-${idx}`}>
                          <TableCell className="text-sm">
                            {linha.label ?? "—"}
                            {linha.chave && (
                              <p className="text-[11px] text-muted-foreground">{linha.chave}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-mono text-muted-foreground">
                            {linha.rota ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                            {linha.explicacao ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-lg tracking-tight text-foreground">
            Telas que a operação usa e não estão declaradas
          </h2>
        </div>

        <TabelaFetely
          carregando={naoDeclaradaQuery.isLoading}
          erro={naoDeclaradaQuery.isError ? (naoDeclaradaQuery.error as Error)?.message : null}
          total={naoDeclaradaQuery.data?.length ?? 0}
          exibidos={naoDeclaradaQuery.data?.length ?? 0}
          rotulo="rotas"
          vazio={{
            mensagem:
              "Nenhuma tela não declarada foi visitada ainda. Esta lista se enche sozinha conforme as pessoas navegam.",
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Rota</TableHead>
                <TableHead className="text-xs">Situação</TableHead>
                <TableHead className="text-xs">Herdou de</TableHead>
                <TableHead className="text-xs text-right">Hits</TableHead>
                <TableHead className="text-xs text-right">Pessoas</TableHead>
                <TableHead className="text-xs">Primeira vez</TableHead>
                <TableHead className="text-xs">Última vez</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(naoDeclaradaQuery.data ?? []).map((linha, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {linha.rota ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {linha.situacao === "nao resolve em lugar nenhum" ? (
                      <Selo estado="destructive">Não resolve em lugar nenhum</Selo>
                    ) : (
                      <span className="text-muted-foreground">{linha.situacao ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {linha.herdou_de ?? "—"}
                    {linha.slug_herdado && (
                      <p className="text-[11px] text-muted-foreground">{linha.slug_herdado}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">{linha.hits ?? 0}</TableCell>
                  <TableCell className="text-right text-sm">{linha.pessoas ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatarData(linha.primeira_vez)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatarData(linha.ultima_vez)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabelaFetely>
      </section>
    </PageShell>
  );
}
