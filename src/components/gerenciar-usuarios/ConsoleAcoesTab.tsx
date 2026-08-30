import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
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
 * CONSOLE DE AÇÕES — lente por tela, autorização por ação.
 *
 * Distinção obrigatória:
 * - semSlug(a) = !a.permissao_id → ação sem slug `acao.*` no catálogo.
 *   Pode estar protegida por `nivel` ou `super_admin`. Desabilita os checkboxes
 *   de grupo e exibe o badge "ação não declarada".
 * - semGuarda(a) = guarda_atual começa com 'NENHUMA' → nenhuma checagem no código.
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
const semGuarda = (a: AcaoSuperficie) =>
  (a.guarda_atual ?? "").toUpperCase().startsWith("NENHUMA");

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

export default function ConsoleAcoesTab() {
  const qc = useQueryClient();
  const { data: acoes = [], isLoading } = useAcoesSuperficie();
  const { data: grupos = [] } = useGruposConsole();
  const { data: matriz = [] } = useMatrizGrupoPermissoes();
  const togglePermissao = useTogglePermissao();
  const marcarConferido = useMarcarConferido();
  const [rotaSel, setRotaSel] = useState<string | null>(null);

  const rotas = useMemo(() => {
    const mapa = new Map<string, { total: number; semGuarda: number; semSlug: number }>();
    acoes.forEach((a) => {
      const atual = mapa.get(a.rota) ?? { total: 0, semGuarda: 0, semSlug: 0 };
      atual.total += 1;
      if (semGuarda(a)) atual.semGuarda += 1;
      if (semSlug(a)) atual.semSlug += 1;
      mapa.set(a.rota, atual);
    });
    return [...mapa.entries()]
      .map(([rota, c]) => ({ rota, ...c }))
      .sort((a, b) => a.rota.localeCompare(b.rota, "pt-BR"));
  }, [acoes]);

  const rotaAtiva = rotaSel ?? rotas[0]?.rota ?? null;
  const linhas = useMemo(
    () => acoes.filter((a) => a.rota === rotaAtiva),
    [acoes, rotaAtiva],
  );

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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando censo de ações...
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

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Telas ({rotas.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-1 overflow-auto p-2">
            {rotas.map((r) => (
              <button
                key={r.rota}
                type="button"
                onClick={() => setRotaSel(r.rota)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                  r.rota === rotaAtiva && "bg-accent",
                )}
              >
                <span className="block truncate">{r.rota}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span>{r.total} {r.total === 1 ? "ação" : "ações"}</span>
                  {r.semGuarda > 0 && <span className="text-warning">{r.semGuarda} sem guarda</span>}
                  {r.semSlug > 0 && <span className="text-muted-foreground">{r.semSlug} sem slug</span>}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{rotaAtiva ?? "Nenhuma rota"}</CardTitle>
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
                        {a.permissoes_catalogo?.slug && (
                          <span className="block text-[11px] text-muted-foreground">
                            {a.permissoes_catalogo.slug}
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
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
