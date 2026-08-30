import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import { useAuth } from "@/contexts/AuthContext";
import { useTogglePermissao } from "@/hooks/useGruposAcessoV2";
import GruposAcessoTabV2 from "@/components/grupos-acesso/GruposAcessoTabV2";
import DeclararAcaoDialog from "./DeclararAcaoDialog";
import {
  CHAVE_MATRIZ_GRUPO_PERMISSOES,
  useConsoleAcesso,
  useGruposConsole,
  useLiberarParaGrupo,
  useMarcarConferido,
  useMatrizGrupoPermissoes,
  type ConsoleAcessoRow,
} from "@/hooks/useConsoleAcesso";
import { useQueryClient } from "@tanstack/react-query";

/**
 * CONSOLE DE ACESSO ÚNICO — fusão das antigas abas "Grupos de Acesso" e
 * "Ações". Fonte única: `vw_console_acesso` (DIMENSÃO-VIA-TABELA: nenhum
 * rótulo, ordem de módulo ou nome de tela é hardcoded no front).
 *
 * Esquerda: árvore Módulo → Tela. Direita: grade linhas × grupos de acesso.
 * A linha `tipo = 'tela'` é o acesso de entrar na tela; as linhas
 * `tipo = 'acao'` são os botões daquela tela.
 */

function badgeRisco(risco: string | null) {
  const r = (risco ?? "").toUpperCase();
  if (!r) return null;
  if (r === "ALTO") return <Badge variant="destructive">ALTO</Badge>;
  if (r === "MEDIO" || r === "MÉDIO")
    return <Badge className="bg-warning/10 text-warning hover:bg-warning/10">MÉDIO</Badge>;
  return <Badge variant="outline">{r}</Badge>;
}

const semGuarda = (l: ConsoleAcessoRow) => l.sem_guarda === true;
const naoDeclarada = (l: ConsoleAcessoRow) => l.declarada !== true;
const portaoPorFlag = (l: ConsoleAcessoRow) => l.apenas_super_admin === true;
const ehAltoSemGuarda = (l: ConsoleAcessoRow) =>
  semGuarda(l) && (l.risco ?? "").toUpperCase() === "ALTO";

function renderGuarda(guarda: string | null) {
  const g = (guarda ?? "").trim();
  const gUpper = g.toUpperCase();
  if (!g) return "—";
  if (gUpper.startsWith("NENHUMA")) {
    return <span className="font-medium text-destructive">{g}</span>;
  }
  if (gUpper.startsWith("NIVEL") || gUpper.startsWith("SUPER_ADMIN")) {
    return (
      <Badge variant="outline" className="font-normal">
        {g}
      </Badge>
    );
  }
  return <span className="text-muted-foreground">{g}</span>;
}

function BadgeAltoSemGuarda({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
      {n} ALTO sem guarda
    </Badge>
  );
}

interface TelaNodo {
  chave: string;
  telaLabel: string;
  linhas: ConsoleAcessoRow[];
  total: number;
  altoSemGuarda: number;
}

interface ModuloNodo {
  appChave: string;
  appLabel: string;
  appOrdem: number;
  telas: TelaNodo[];
  totalLinhas: number;
  altoSemGuarda: number;
  /** app_ordem 9999 — rotas fora da navegação. */
  semModulo: boolean;
}

export default function ConsoleAcessoTab() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: linhas = [], isLoading, isError, error } = useConsoleAcesso();
  const { data: grupos = [] } = useGruposConsole();
  const { data: matriz = [] } = useMatrizGrupoPermissoes();
  const togglePermissao = useTogglePermissao();
  const marcarConferido = useMarcarConferido();
  const liberarParaGrupo = useLiberarParaGrupo();
  const [telaSel, setTelaSel] = useState<string | null>(null);
  const [modulosFechados, setModulosFechados] = useState<Set<string>>(new Set());
  const [declarando, setDeclarando] = useState<ConsoleAcessoRow | null>(null);
  const [gerenciarGrupos, setGerenciarGrupos] = useState(false);

  // FAIL-LOUD: erro de query sobe como toast com a mensagem real.
  useEffect(() => {
    if (isError) {
      toast.error("Não consegui carregar o console de acesso.", {
        description: formatError(error),
      });
    }
  }, [isError, error]);

  const modulos = useMemo<ModuloNodo[]>(() => {
    const porModulo = new Map<string, ModuloNodo>();
    for (const l of linhas) {
      const appChave = l.app_chave ?? "__sem_modulo__";
      let mod = porModulo.get(appChave);
      if (!mod) {
        mod = {
          appChave,
          appLabel: l.app_label ?? "Sem módulo",
          appOrdem: l.app_ordem ?? 9999,
          telas: [],
          totalLinhas: 0,
          altoSemGuarda: 0,
          semModulo: (l.app_ordem ?? 9999) === 9999,
        };
        porModulo.set(appChave, mod);
      }
      const telaLabel = l.tela_label ?? l.rota;
      let tela = mod.telas.find((t) => t.telaLabel === telaLabel);
      if (!tela) {
        tela = {
          chave: `${appChave}|${telaLabel}`,
          telaLabel,
          linhas: [],
          total: 0,
          altoSemGuarda: 0,
        };
        mod.telas.push(tela);
      }
      tela.linhas.push(l);
      tela.total += 1;
      mod.totalLinhas += 1;
      if (ehAltoSemGuarda(l)) {
        tela.altoSemGuarda += 1;
        mod.altoSemGuarda += 1;
      }
    }
    const lista = [...porModulo.values()];
    lista.forEach((m) => {
      m.telas.sort((a, b) => a.telaLabel.localeCompare(b.telaLabel, "pt-BR"));
      m.telas.forEach((t) =>
        t.linhas.sort((a, b) => (a.ordem_linha ?? 0) - (b.ordem_linha ?? 0)),
      );
    });
    return lista.sort((a, b) => a.appOrdem - b.appOrdem);
  }, [linhas]);

  const telaAtiva = useMemo<TelaNodo | null>(() => {
    for (const m of modulos) {
      const t = m.telas.find((x) => x.chave === telaSel);
      if (t) return t;
    }
    return modulos[0]?.telas[0] ?? null;
  }, [modulos, telaSel]);

  /** Linhas da tela ativa agrupadas por rota (sub-cabeçalho quando > 1 rota). */
  const rotasDaTela = useMemo(() => {
    if (!telaAtiva) return [];
    const porRota = new Map<string, ConsoleAcessoRow[]>();
    telaAtiva.linhas.forEach((l) => {
      const arr = porRota.get(l.rota) ?? [];
      arr.push(l);
      porRota.set(l.rota, arr);
    });
    return [...porRota.entries()]
      .map(([rota, itens]) => ({ rota, itens }))
      .sort((a, b) => a.rota.localeCompare(b.rota, "pt-BR"));
  }, [telaAtiva]);

  const totais = useMemo(() => {
    const semGuardaList = linhas.filter(semGuarda);
    return {
      total: linhas.length,
      telas: linhas.filter((l) => l.tipo === "tela").length,
      semGuarda: semGuardaList.length,
      altoSemGuarda: semGuardaList.filter((l) => (l.risco ?? "").toUpperCase() === "ALTO")
        .length,
      naoDeclaradas: linhas.filter((l) => l.tipo === "acao" && naoDeclarada(l)).length,
    };
  }, [linhas]);

  const concedido = useMemo(() => {
    const set = new Set<string>();
    matriz.forEach((c) => {
      if (c.pode_ver) set.add(`${c.grupo_acesso_id}|${c.permissao_id}`);
    });
    return set;
  }, [matriz]);

  function alternar(grupoId: string, permissaoId: string, valor: boolean) {
    togglePermissao.mutate(
      { grupoId, permissaoId, campo: "pode_ver", valor },
      { onSettled: () => qc.invalidateQueries({ queryKey: CHAVE_MATRIZ_GRUPO_PERMISSOES }) },
    );
  }

  function liberarTelaInteira(grupoId: string) {
    if (!telaAtiva) return;
    const ids = telaAtiva.linhas
      .filter((l) => l.permissao_id && !portaoPorFlag(l) && l.declarada === true)
      .map((l) => l.permissao_id as string)
      .filter((id) => !concedido.has(`${grupoId}|${id}`));
    if (!ids.length) {
      toast.info("Este grupo já tem tudo desta tela.");
      return;
    }
    liberarParaGrupo.mutate({ grupoId, permissaoIds: [...new Set(ids)] });
  }

  function alternarModulo(appChave: string) {
    setModulosFechados((prev) => {
      const prox = new Set(prev);
      if (prox.has(appChave)) prox.delete(appChave);
      else prox.add(appChave);
      return prox;
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando console de acesso...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 p-6 text-destructive">
        <ShieldAlert className="h-4 w-4" /> Falha ao carregar o console de acesso: {formatError(error)}
      </div>
    );
  }

  if (gerenciarGrupos) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Gestão de grupos de acesso</h3>
            <p className="text-xs text-muted-foreground">
              Criar grupos, editar, adicionar e remover usuários.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setGerenciarGrupos(false)}>
            Voltar ao console
          </Button>
        </div>
        <GruposAcessoTabV2 />
      </div>
    );
  }

  const colunasFixas = 5;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Uma decisão só: quem entra na tela e quem executa cada ação dela.
        </p>
        <Button variant="outline" size="sm" onClick={() => setGerenciarGrupos(true)}>
          <Users className="mr-2 h-3.5 w-3.5" /> Gerenciar grupos e usuários
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Linhas no console</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">{totais.total}</CardContent>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            {totais.telas} de tela · {totais.total - totais.telas} de ação
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-warning">Sem guarda alguma</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl text-warning">
            <ShieldAlert className="h-5 w-5" /> {totais.semGuarda}
          </CardContent>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            Nenhuma checagem no código.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-destructive">Risco ALTO sem guarda</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl text-destructive">
            <ShieldAlert className="h-5 w-5" /> {totais.altoSemGuarda}
          </CardContent>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            Ações críticas desprotegidas.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Não declaradas no catálogo
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl text-muted-foreground">
            {totais.naoDeclaradas}
          </CardContent>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            Sem slug <code>acao.*</code> — não há onde gravar a concessão.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ── Árvore Módulo → Tela ── */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Telas ({modulos.reduce((s, m) => s + m.telas.length, 0)})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-1 overflow-auto p-2">
            {modulos.map((m) => {
              const fechado = modulosFechados.has(m.appChave);
              return (
                <div key={m.appChave} className={cn(m.semModulo && "opacity-70")}>
                  <button
                    type="button"
                    onClick={() => alternarModulo(m.appChave)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide transition-colors hover:bg-accent"
                  >
                    {fechado ? (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{m.appLabel}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                      <span>
                        {m.telas.length} {m.telas.length === 1 ? "tela" : "telas"} ·{" "}
                        {m.totalLinhas} {m.totalLinhas === 1 ? "linha" : "linhas"}
                      </span>
                      <BadgeAltoSemGuarda n={m.altoSemGuarda} />
                    </span>
                  </button>
                  {m.semModulo && !fechado && (
                    <p className="px-2 pb-1 pt-0.5 text-[10px] leading-snug text-muted-foreground">
                      Rotas fora da navegação — não aparecem em nenhum menu e ficam
                      invisíveis para quem não é super_admin.
                    </p>
                  )}
                  {!fechado &&
                    m.telas.map((t) => (
                      <button
                        key={t.chave}
                        type="button"
                        onClick={() => setTelaSel(t.chave)}
                        className={cn(
                          "ml-4 w-[calc(100%-1rem)] rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                          t.chave === telaAtiva?.chave && "bg-accent",
                        )}
                      >
                        <span className="block truncate">{t.telaLabel}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                          <span>
                            {t.total} {t.total === 1 ? "linha" : "linhas"}
                          </span>
                          <BadgeAltoSemGuarda n={t.altoSemGuarda} />
                        </span>
                      </button>
                    ))}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ── Grade linhas × grupos ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {telaAtiva ? telaAtiva.telaLabel : "Nenhuma tela"}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Linha</TableHead>
                  <TableHead className="min-w-[160px]">Dispara</TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead className="min-w-[130px]">Guarda atual</TableHead>
                  {grupos.map((g) => (
                    <TableHead key={g.id} className="text-center">
                      <span className="block text-xs">{g.nome}</span>
                      {g.role_automatico && (
                        <span className="block text-[10px] text-muted-foreground">
                          {g.role_automatico}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={liberarParaGrupo.isPending}
                        onClick={() => liberarTelaInteira(g.id)}
                        title="Liberar todas as linhas declaradas desta tela para este grupo"
                      >
                        <Sparkles className="mr-1 h-3 w-3" /> Liberar tela
                      </Button>
                    </TableHead>
                  ))}
                  <TableHead className="text-center">Conferido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rotasDaTela.map(({ rota, itens }) => (
                  <Fragment key={rota}>
                    {rotasDaTela.length > 1 && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell
                          colSpan={colunasFixas + grupos.length}
                          className="py-1.5"
                        >
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {rota}
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                    {itens.map((l) => {
                      const ehTela = l.tipo === "tela";
                      const pacote = (l.telas_cobertas ?? 0) > 1;
                      const semDeclaracao = naoDeclarada(l);
                      const porFlag = portaoPorFlag(l);
                      const bloqueado = semDeclaracao || porFlag || !l.permissao_id;
                      return (
                        <TableRow
                          key={l.linha_id}
                          className={cn(
                            ehTela && "bg-muted/60 hover:bg-muted/60",
                            !ehTela && semGuarda(l) && "bg-warning/5",
                            !ehTela && l.conferido && "bg-success/5",
                          )}
                        >
                          <TableCell className="align-top">
                            {ehTela && (
                              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Acesso à tela
                              </span>
                            )}
                            <span className="flex flex-wrap items-center gap-1.5">
                              {!ehTela && l.conferido && (
                                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                              )}
                              <span className={cn(ehTela && "font-medium")}>{l.rotulo}</span>
                              {l.contem_dado_sensivel && (
                                <Badge variant="outline" className="px-1 py-0 text-[9px]">
                                  LGPD
                                </Badge>
                              )}
                              {l.feature_em_teste && (
                                <Badge
                                  variant="outline"
                                  className="bg-warning/10 px-1 py-0 text-[9px]"
                                >
                                  BETA
                                </Badge>
                              )}
                              {pacote && (
                                <Badge
                                  variant="outline"
                                  className="px-1 py-0 text-[9px]"
                                  title={l.telas_lista ?? undefined}
                                >
                                  vale para {l.telas_cobertas} telas
                                </Badge>
                              )}
                              {porFlag && (
                                <Badge variant="outline" className="px-1 py-0 text-[9px]">
                                  portão por flag
                                </Badge>
                              )}
                            </span>
                            {l.permissao_slug && (
                              <span className="block font-mono text-[11px] text-muted-foreground">
                                {l.permissao_slug}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="align-top text-xs text-muted-foreground">
                            {l.dispara ?? "—"}
                          </TableCell>
                          <TableCell className="align-top">{badgeRisco(l.risco)}</TableCell>
                          <TableCell className="align-top text-xs">
                            {renderGuarda(l.guarda_atual)}
                          </TableCell>

                          {bloqueado ? (
                            <TableCell
                              colSpan={grupos.length}
                              className="align-top text-center"
                            >
                              {porFlag ? (
                                <span className="text-[11px] text-muted-foreground">
                                  Governada por papel (super_admin), não por grupo.
                                </span>
                              ) : (
                                <span className="inline-flex flex-wrap items-center justify-center gap-2">
                                  <Badge className="bg-warning/10 text-warning hover:bg-warning/10">
                                    ação não declarada
                                  </Badge>
                                  <span className="inline-flex opacity-40">
                                    <Checkbox disabled />
                                  </span>
                                  {isSuperAdmin && l.acao_superficie_id && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => setDeclarando(l)}
                                    >
                                      Declarar
                                    </Button>
                                  )}
                                </span>
                              )}
                            </TableCell>
                          ) : (
                            grupos.map((g) => (
                              <TableCell key={g.id} className="text-center align-top">
                                <Checkbox
                                  checked={concedido.has(`${g.id}|${l.permissao_id}`)}
                                  disabled={togglePermissao.isPending}
                                  onCheckedChange={(v) =>
                                    alternar(g.id, l.permissao_id as string, v === true)
                                  }
                                  aria-label={`${g.nome} — ${l.rotulo}`}
                                />
                              </TableCell>
                            ))
                          )}

                          <TableCell className="text-center align-top">
                            {!ehTela && l.acao_superficie_id ? (
                              <Checkbox
                                checked={l.conferido === true}
                                disabled={marcarConferido.isPending}
                                onCheckedChange={(v) =>
                                  marcarConferido.mutate({
                                    acaoId: l.acao_superficie_id as string,
                                    valor: v === true,
                                  })
                                }
                                aria-label={`Marcar ${l.rotulo} como conferido`}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* AVISO DE PACOTE: a permissão é mais larga do que a tela olhada. */}
                    {itens
                      .filter((l) => l.tipo === "tela" && (l.telas_cobertas ?? 0) > 1)
                      .map((l) => (
                        <TableRow
                          key={`${l.linha_id}-pacote`}
                          className="bg-muted/30 hover:bg-muted/30"
                        >
                          <TableCell
                            colSpan={colunasFixas + grupos.length}
                            className="py-1.5 text-[11px] text-muted-foreground"
                          >
                            Marcar o acesso desta tela muda as {l.telas_cobertas} telas do
                            pacote: {l.telas_lista ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                ))}
                {rotasDaTela.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={colunasFixas + grupos.length}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      Selecione uma tela na árvore.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <DeclararAcaoDialog
        linha={declarando}
        onOpenChange={(aberto) => {
          if (!aberto) setDeclarando(null);
        }}
      />
    </div>
  );
}
