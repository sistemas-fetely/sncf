import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTogglePermissao } from "@/hooks/useGruposAcessoV2";
import {
  CHAVE_MATRIZ_GRUPO_PERMISSOES,
  useAcoesSuperficie,
  useGruposConsole,
  useMarcarConferido,
  useMatrizGrupoPermissoes,
  type AcaoSuperficie,
} from "@/hooks/useAcaoSuperficie";

/**
 * CONSOLE DE AÇÕES — árvore Módulo → Tela na esquerda, grade ações × grupos
 * na direita. Fonte única: `vw_acao_por_modulo` (DIMENSÃO-VIA-TABELA — nenhum
 * rótulo, ordem ou nome de tela é hardcoded no front).
 *
 * Mudança de apresentação apenas: nenhuma permissão muda de estado aqui além
 * dos checkboxes que já existiam (matriz de grupos + conferido).
 *
 * Distinção obrigatória:
 * - semSlug(a): ação sem slug `acao.*` no catálogo (view `declarada = false`).
 *   Pode estar protegida por `nivel` ou `super_admin`. Desabilita os
 *   checkboxes de grupo e exibe o badge "ação não declarada".
 * - semGuarda(a): view `sem_guarda = true` → nenhuma checagem no código.
 *   Usado nos contadores e no destaque de alerta.
 */

function badgeRisco(risco: string | null) {
  const r = (risco ?? "").toUpperCase();
  if (r === "ALTO") return <Badge variant="destructive">ALTO</Badge>;
  if (r === "MEDIO" || r === "MÉDIO")
    return <Badge className="bg-warning/10 text-warning hover:bg-warning/10">MÉDIO</Badge>;
  return <Badge variant="outline">{r || "—"}</Badge>;
}

const semSlug = (a: AcaoSuperficie) => !a.permissao_id;
const semGuarda = (a: AcaoSuperficie) => a.sem_guarda === true;

function renderGuarda(guarda: string | null) {
  const g = (guarda ?? "").trim();
  const gUpper = g.toUpperCase();
  if (!g) return "—";
  if (gUpper.startsWith("NENHUMA")) {
    return <span className="font-medium text-destructive">{g}</span>;
  }
  if (gUpper.startsWith("NIVEL") || gUpper.startsWith("SUPER_ADMIN")) {
    return <Badge variant="outline" className="font-normal">{g}</Badge>;
  }
  return <span className="text-muted-foreground">{g}</span>;
}

/** Badge de alerta: ações de risco ALTO sem guarda. */
function BadgeAltoSemGuarda({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
      {n} ALTO sem guarda
    </Badge>
  );
}

interface TelaNodo {
  /** chave de seleção: app_chave|tela_label */
  chave: string;
  telaLabel: string;
  acoes: AcaoSuperficie[];
  total: number;
  altoSemGuarda: number;
  temNaoDeclarada: boolean;
}

interface ModuloNodo {
  appChave: string;
  appLabel: string;
  appOrdem: number;
  telas: TelaNodo[];
  totalTelas: number;
  totalAcoes: number;
  altoSemGuarda: number;
  /** módulo "Sem módulo" — rotas fora da navegação (app_ordem 9999) */
  semModulo: boolean;
}

export default function ConsoleAcoesTab() {
  const qc = useQueryClient();
  const { data: acoes = [], isLoading, isError, error } = useAcoesSuperficie();
  const { data: grupos = [] } = useGruposConsole();
  const { data: matriz = [] } = useMatrizGrupoPermissoes();
  const togglePermissao = useTogglePermissao();
  const marcarConferido = useMarcarConferido();
  const [telaSel, setTelaSel] = useState<string | null>(null);
  const [modulosFechados, setModulosFechados] = useState<Set<string>>(new Set());

  // FAIL-LOUD: erro da consulta sobe como toast visível — nunca estado vazio
  // disfarçado de "sem ações".
  if (isError) {
    toast.error("Não consegui carregar o censo de ações.", {
      description: error instanceof Error ? error.message : String(error),
    });
  }

  const modulos = useMemo<ModuloNodo[]>(() => {
    const porModulo = new Map<string, ModuloNodo>();
    for (const a of acoes) {
      const appChave = a.app_chave ?? "__sem_modulo__";
      let mod = porModulo.get(appChave);
      if (!mod) {
        mod = {
          appChave,
          appLabel: a.app_label ?? "Sem módulo",
          appOrdem: a.app_ordem ?? 9999,
          telas: [],
          totalTelas: 0,
          totalAcoes: 0,
          altoSemGuarda: 0,
          semModulo: (a.app_ordem ?? 9999) === 9999,
        };
        porModulo.set(appChave, mod);
      }
      const telaLabel = a.tela_label ?? a.rota;
      let tela = mod.telas.find((t) => t.telaLabel === telaLabel);
      if (!tela) {
        tela = {
          chave: `${appChave}|${telaLabel}`,
          telaLabel,
          acoes: [],
          total: 0,
          altoSemGuarda: 0,
          temNaoDeclarada: false,
        };
        mod.telas.push(tela);
      }
      tela.acoes.push(a);
      tela.total += 1;
      if (semGuarda(a) && (a.risco ?? "").toUpperCase() === "ALTO") {
        tela.altoSemGuarda += 1;
        mod.altoSemGuarda += 1;
      }
      if (a.rota_nao_declarada) tela.temNaoDeclarada = true;
      mod.totalAcoes += 1;
    }
    const lista = [...porModulo.values()];
    lista.forEach((m) => {
      m.totalTelas = m.telas.length;
      m.telas.sort((a, b) => a.telaLabel.localeCompare(b.telaLabel, "pt-BR"));
    });
    return lista.sort((a, b) => a.appOrdem - b.appOrdem);
  }, [acoes]);

  const telaAtiva = useMemo<TelaNodo | null>(() => {
    for (const m of modulos) {
      const t = m.telas.find((x) => x.chave === telaSel);
      if (t) return t;
    }
    return modulos[0]?.telas[0] ?? null;
  }, [modulos, telaSel]);

  /** Linhas da tela selecionada, agrupadas por rota (sub-cabeçalho quando > 1). */
  const rotasDaTela = useMemo(() => {
    if (!telaAtiva) return [];
    const porRota = new Map<string, AcaoSuperficie[]>();
    telaAtiva.acoes.forEach((a) => {
      const arr = porRota.get(a.rota) ?? [];
      arr.push(a);
      porRota.set(a.rota, arr);
    });
    return [...porRota.entries()]
      .map(([rota, linhas]) => ({ rota, linhas, eDetalhe: linhas.some((l) => l.rota_e_detalhe) }))
      .sort((a, b) => a.rota.localeCompare(b.rota, "pt-BR"));
  }, [telaAtiva]);

  const totais = useMemo(() => {
    const semGuardaList = acoes.filter(semGuarda);
    const semSlugList = acoes.filter(semSlug);
    return {
      total: acoes.length,
      semGuarda: semGuardaList.length,
      altoSemGuarda: semGuardaList.filter((a) => (a.risco ?? "").toUpperCase() === "ALTO").length,
      semSlug: semSlugList.length,
    };
  }, [acoes]);

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
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando censo de ações...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 p-6 text-destructive">
        <ShieldAlert className="h-4 w-4" /> Falha ao carregar o censo de ações. Tente recarregar a
        página.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Ações no censo</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">{totais.total}</CardContent>
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
            <CardTitle className="text-xs text-muted-foreground">Não declaradas no catálogo</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl text-muted-foreground">{totais.semSlug}</CardContent>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            Sem slug <code>acao.*</code>; podem estar protegidas por <code>nivel</code> ou{" "}
            <code>super_admin</code>.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ── Árvore Módulo → Tela ── */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Telas ({modulos.reduce((s, m) => s + m.totalTelas, 0)})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-1 overflow-auto p-2">
            {modulos.map((m) => {
              const fechado = modulosFechados.has(m.appChave);
              return (
                <div key={m.appChave} className={cn(m.semModulo && "opacity-70")}>
                  {/* Nível 1 — Módulo */}
                  <button
                    type="button"
                    onClick={() => alternarModulo(m.appChave)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-accent"
                  >
                    {fechado ? (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{m.appLabel}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                      <span>
                        {m.totalTelas} {m.totalTelas === 1 ? "tela" : "telas"} · {m.totalAcoes}{" "}
                        {m.totalAcoes === 1 ? "ação" : "ações"}
                      </span>
                      <BadgeAltoSemGuarda n={m.altoSemGuarda} />
                    </span>
                  </button>
                  {m.semModulo && !fechado && (
                    <p className="px-2 pb-1 pt-0.5 text-[10px] leading-snug text-muted-foreground">
                      Rotas não declaradas na navegação — não aparecem em nenhum menu e ficam
                      invisíveis para quem não é super_admin.
                    </p>
                  )}
                  {/* Nível 2 — Tela */}
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
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{t.telaLabel}</span>
                          {t.temNaoDeclarada && (
                            <span
                              className="shrink-0 text-[10px] text-muted-foreground"
                              title="Contém rota não declarada na navegação"
                            >
                              ⚠
                            </span>
                          )}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                          <span>
                            {t.total} {t.total === 1 ? "ação" : "ações"}
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

        {/* ── Grade ações × grupos ── */}
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
                  <TableHead className="min-w-[180px]">Ação</TableHead>
                  <TableHead className="min-w-[180px]">Dispara</TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead className="min-w-[140px]">Guarda atual</TableHead>
                  {grupos.map((g) => (
                    <TableHead key={g.id} className="text-center">
                      <span className="block text-xs">{g.nome}</span>
                      {g.role_automatico && (
                        <span className="block text-[10px] text-muted-foreground">
                          {g.role_automatico}
                        </span>
                      )}
                    </TableHead>
                  ))}
                  <TableHead className="text-center">Conferido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rotasDaTela.map(({ rota, linhas, eDetalhe }) => (
                  <>
                    {rotasDaTela.length > 1 && (
                      <TableRow key={`rota-${rota}`} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={5 + grupos.length} className="py-1.5">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {rota}
                          </span>
                          {eDetalhe && (
                            <Badge variant="outline" className="ml-2 px-1.5 py-0 text-[10px]">
                              detalhe
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                    {linhas.map((a) => {
                      const naoDeclarada = semSlug(a);
                      const semProtecao = semGuarda(a);
                      return (
                        <TableRow
                          key={a.id}
                          className={cn(
                            semProtecao && "bg-warning/5",
                            a.conferido && "bg-success/5",
                          )}
                        >
                          <TableCell className="align-top">
                            <span className="flex items-center gap-1.5">
                              {a.conferido && <ShieldCheck className="h-3.5 w-3.5 text-success" />}
                              {a.rotulo}
                            </span>
                            {a.permissao_slug && (
                              <span className="block text-[11px] text-muted-foreground">
                                {a.permissao_slug}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="align-top text-xs text-muted-foreground">
                            {a.dispara ?? "—"}
                          </TableCell>
                          <TableCell className="align-top">{badgeRisco(a.risco)}</TableCell>
                          <TableCell className="align-top text-xs">
                            {renderGuarda(a.guarda_atual)}
                          </TableCell>
                          {naoDeclarada ? (
                            <TableCell colSpan={grupos.length} className="align-top text-center">
                              <Badge className="bg-warning/10 text-warning hover:bg-warning/10">
                                ação não declarada
                              </Badge>
                              <span className="ml-2 inline-flex opacity-40">
                                <Checkbox disabled />
                              </span>
                            </TableCell>
                          ) : (
                            grupos.map((g) => (
                              <TableCell key={g.id} className="text-center align-top">
                                <Checkbox
                                  checked={concedido.has(`${g.id}|${a.permissao_id}`)}
                                  disabled={togglePermissao.isPending}
                                  onCheckedChange={(v) =>
                                    alternar(g.id, a.permissao_id as string, v === true)
                                  }
                                  aria-label={`${g.nome} pode executar ${a.rotulo}`}
                                />
                              </TableCell>
                            ))
                          )}
                          <TableCell className="text-center align-top">
                            <Checkbox
                              checked={a.conferido === true}
                              disabled={marcarConferido.isPending}
                              onCheckedChange={(v) =>
                                marcarConferido.mutate({ acaoId: a.id, valor: v === true })
                              }
                              aria-label={`Marcar ${a.rotulo} como conferido`}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
