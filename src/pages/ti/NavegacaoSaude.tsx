import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNivel } from "@/hooks/useNivel";
import { HeartPulse, Route, AlertTriangle, Info, CheckCircle2, Loader2 } from "lucide-react";
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
  herdou_permissao_do_dominio: "Telas que dividem a mesma permissão",
  permissao_sem_grupo: "Permissões que ninguém recebeu",
  em_construcao: "Telas marcadas como em construção",
  deveria_estar_no_menu: "Telas fora do menu lateral",
  menu_mas_4o_nivel: "Telas que nunca vão renderizar",
  grupo_vazio: "Submenus vazios",
  coluna_sem_grant: "Colunas que ninguém lê",
};

const EXPLICACAO_ACHADO: Record<string, string> = {
  herdou_permissao_do_dominio:
    "**O que é:** duas ou mais telas usam a mesma permissão, então quem recebe uma recebe todas. **Por que importa:** você não consegue liberar uma sem liberar as outras. **O que fazer:** se as telas são da mesma função (ex.: Banco Safra + Conciliação Bancária), isso está certo — marque como intencional. Se são coisas diferentes, peça uma permissão própria para a que precisa ser separada.",
  permissao_sem_grupo:
    "**O que é:** a permissão existe no catálogo e nenhum grupo a concede. **Por que importa:** a tela está pronta e invisível — só super_admin alcança, por bypass, e por isso ninguém percebe que está faltando. **O que fazer:** conceder em Grupos de Acesso a quem deve ver, ou desativar a permissão se a tela foi abandonada.",
  em_construcao:
    "**O que é:** telas com status em_construcao, que só super_admin alcança. **Por que importa:** se a tela já funciona, o status está escondendo dela a casa inteira. **O que fazer:** se ainda não está pronta, deixe assim — é o comportamento correto. Se já funciona, trocar o status para pronta.",
  deveria_estar_no_menu:
    "**O que é:** a tela pede para aparecer no menu, mas não tem a superfície sidebar. **Por que importa:** ninguém acha por navegação — só quem souber a URL. **O que fazer:** se ela deve estar no menu, adicionar a superfície. Se é alcançada por dentro de outra tela ou por busca, marque como intencional.",
  menu_mas_4o_nivel:
    "**O que é:** a tela pede menu, mas está pendurada em outra tela em vez de um submenu. **Por que importa:** o menu só monta três níveis — ela nunca aparece, mesmo pedindo. **O que fazer:** repensar onde ela mora na árvore, ou declarar que é aba.",
  grupo_vazio:
    "**O que é:** submenu sem nenhuma tela ativa embaixo. **Por que importa:** não renderiza; apenas polui a árvore e confunde quem configura. **O que fazer:** desativar o submenu, ou mover telas para dentro dele.",
  coluna_sem_grant:
    "**O que é:** coluna do banco sem permissão de leitura, nem para quem tem a tela. **Por que importa:** a tela abre e o campo vem vazio, sem erro — parece dado faltando. **O que fazer:** se o sigilo é intencional, marque como intencional. Senão, conceder a leitura.",
};

const EXPLICACAO_NAO_DECLARADA =
  "**O que é:** alguém acessou uma URL que não está declarada no menu. **Por que importa:** tela existe no código e o sistema não sabe dela — não tem permissão, não tem portão. **O que fazer:** declarar na navegação, ou remover a rota se foi abandonada.";

/** Renderiza **negrito** sem depender de biblioteca de markdown. */
function TextoRico({ texto, className }: { texto: string; className?: string }): ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <p className={className}>
      {partes.map((parte, i) =>
        parte.startsWith("**") && parte.endsWith("**") ? (
          <strong key={i} className="font-medium text-foreground">
            {parte.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{parte}</span>
        ),
      )}
    </p>
  );
}

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
  const queryClient = useQueryClient();
  const { temNivel } = useNivel();
  const podeAceitar = temNivel(4);
  const [alvo, setAlvo] = useState<NavegacaoSaudeRow | null>(null);
  const [motivo, setMotivo] = useState("");

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

  const aceitar = useMutation({
    mutationFn: async ({ row, motivo }: { row: NavegacaoSaudeRow; motivo: string }) => {
      const { error } = await supabase.from("navegacao_saude_aceite").upsert(
        {
          achado: row.achado ?? "",
          chave: row.chave ?? "",
          motivo,
        },
        { onConflict: "achado,chave" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Achado marcado como intencional — saiu da lista.");
      setAlvo(null);
      setMotivo("");
      void queryClient.invalidateQueries({ queryKey: ["navegacao-saude"] });
      void queryClient.invalidateQueries({ queryKey: ["navegacao-nao-declarada"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar o aceite.");
    },
  });

  const linhas = saudeQuery.data ?? [];
  const total = linhas.length;

  const agrupado = linhas.reduce<Record<string, NavegacaoSaudeRow[]>>((acc, row) => {
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

      <div className="space-y-1 text-sm text-muted-foreground">
        <TextoRico texto="Esta tela **acusa, nunca bloqueia**. Nenhum achado aqui é porta aberta — são inconsistências entre o menu, as permissões e as telas." />
        <TextoRico texto="O objetivo é a lista ficar **vazia**. Achado que você já analisou e considera correto, marque como intencional: ele sai da lista e para de te distrair." />
        <TextoRico texto="Se aparecer algo novo aqui depois de a lista estar limpa, é porque uma tela nasceu torta — e vale olhar no mesmo dia." />
      </div>

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

        {!saudeQuery.isLoading && !saudeQuery.isError && total === 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" />
            <p className="text-sm text-foreground">
              Navegação sem achados. Se algo aparecer aqui, é porque nasceu torto — vale olhar no
              mesmo dia.
            </p>
          </div>
        )}

        {!saudeQuery.isLoading && !saudeQuery.isError && total > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{total}</span>{" "}
              {total === 1 ? "achado em aberto" : "achados em aberto"} — nenhum deles bloqueia
              acesso.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(agrupado).map(([achado, grupo]) => (
                <Card key={achado} className="card-shadow border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <CardTitle className="text-base font-normal">
                          {TITULO_ACHADO[achado] ?? achado}
                        </CardTitle>
                        {EXPLICACAO_ACHADO[achado] && (
                          <TextoRico
                            texto={EXPLICACAO_ACHADO[achado]}
                            className="text-xs leading-relaxed text-muted-foreground"
                          />
                        )}
                      </div>
                      <Selo estado={seloParaSeveridade(grupo[0]?.severidade)}>{grupo.length}</Selo>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Tela</TableHead>
                          <TableHead className="text-xs">Rota</TableHead>
                          <TableHead className="text-xs">Observação</TableHead>
                          {podeAceitar && <TableHead className="text-xs" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grupo.map((linha, idx) => (
                          <TableRow key={`${achado}-${linha.chave ?? idx}`}>
                            <TableCell className="text-sm">
                              {linha.label ?? "—"}
                              {linha.chave && (
                                <p className="text-[11px] text-muted-foreground">{linha.chave}</p>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {linha.rota ?? "—"}
                            </TableCell>
                            <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                              {linha.explicacao ?? linha.detalhe ?? "—"}
                            </TableCell>
                            {podeAceitar && (
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-muted-foreground"
                                  onClick={() => {
                                    setAlvo(linha);
                                    setMotivo("");
                                  }}
                                >
                                  Marcar como intencional
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-lg tracking-tight text-foreground">
            Telas que a operação usa e não estão declaradas
          </h2>
        </div>

        <TextoRico
          texto={EXPLICACAO_NAO_DECLARADA}
          className="text-sm leading-relaxed text-muted-foreground"
        />

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

        {!naoDeclaradaQuery.isLoading &&
          !naoDeclaradaQuery.isError &&
          (naoDeclaradaQuery.data?.length ?? 0) === 0 && (
            <EstadoVazio
              icone={Info}
              titulo="Nada fora do mapa"
              mensagem="Toda rota acessada até agora está declarada na navegação."
            />
          )}
      </section>

      <Dialog
        open={!!alvo}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setAlvo(null);
            setMotivo("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como intencional</DialogTitle>
            <DialogDescription>
              {alvo?.label ?? alvo?.chave ?? "Achado"} — sai da lista e para de aparecer no
              diagnóstico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-aceite">Motivo</Label>
            <Textarea
              id="motivo-aceite"
              rows={4}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por que este achado está correto? Ex.: as duas telas são da mesma função e sempre andam juntas."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAlvo(null);
                setMotivo("");
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={!motivo.trim() || aceitar.isPending}
              onClick={() => {
                if (!alvo || !motivo.trim()) return;
                aceitar.mutate({ row: alvo, motivo: motivo.trim() });
              }}
              className="gap-2"
            >
              {aceitar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
