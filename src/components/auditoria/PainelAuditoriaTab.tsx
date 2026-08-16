/**
 * Aba PAINEL: saúde das regras (vw_auditoria_painel), agrupada por módulo.
 * `parada` grita: regra que não roda há mais de 3 dias é painel morto.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatError } from "@/lib/format-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, ListFilter, Pencil, Play, Plus, RefreshCw } from "lucide-react";
import RegraEditorDialog from "@/components/auditoria/RegraEditorDialog";
import {
  useExecucoesAuditoria,
  usePainelAuditoria,
  useRegrasAuditoria,
  useRodarAuditoria,
  type ResumoRodada,
} from "@/hooks/auditoria/useAuditoria";
import {
  formatDataHora,
  SEVERIDADE_CLS,
  saudeMeta,
  type Regra,
  type RegraPainel,
} from "@/lib/auditoria/meta";

export default function PainelAuditoriaTab({
  onVerAchadosDaRegra,
}: {
  onVerAchadosDaRegra: (slug: string) => void;
}) {
  const { user, roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const painel = usePainelAuditoria();
  const execucoes = useExecucoesAuditoria();
  const regras = useRegrasAuditoria();
  const rodar = useRodarAuditoria();

  const [resumo, setResumo] = useState<ResumoRodada | null>(null);
  const [editorAberto, setEditorAberto] = useState(false);
  const [regraEditando, setRegraEditando] = useState<Regra | null>(null);
  const [rodandoSlug, setRodandoSlug] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const map = new Map<string, RegraPainel[]>();
    for (const r of painel.data ?? []) {
      const k = r.modulo_nome ?? r.modulo_slug ?? "—";
      const arr = map.get(k);
      if (arr) arr.push(r);
      else map.set(k, [r]);
    }
    return Array.from(map.entries());
  }, [painel.data]);

  const paradas = (painel.data ?? []).filter(
    (r) => r.saude === "parada" || r.saude === "com_erro",
  );

  async function executar(slug?: string) {
    if (!user?.id) return;
    setRodandoSlug(slug ?? "__todas__");
    try {
      const r = await rodar.mutateAsync({ userId: user.id, regraSlug: slug ?? null });
      setResumo(r);
      toast.success(
        `Rodada concluída: ${r.regras_rodadas ?? 0} regra(s), ${r.achados_novos ?? 0} novo(s).`,
      );
      if (r.interrompida) {
        toast.warning("A rodada foi cortada por tempo — parte das regras não rodou.");
      }
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setRodandoSlug(null);
    }
  }

  const regraPorSlug = new Map((regras.data ?? []).map((r) => [r.slug, r]));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Motor de auditoria</p>
            <p className="text-xs text-muted-foreground">
              {(painel.data ?? []).filter((r) => r.ativo).length} regra(s) ativa(s) ·{" "}
              {(painel.data ?? []).reduce((s, r) => s + (r.achados_vivos ?? 0), 0)} achado(s) vivo(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setRegraEditando(null);
                  setEditorAberto(true);
                }}
              >
                <Plus className="h-4 w-4" /> Nova regra
              </Button>
            )}
            <Button
              className="gap-2"
              onClick={() => executar()}
              disabled={rodar.isPending || !user?.id}
            >
              <RefreshCw
                className={`h-4 w-4 ${rodandoSlug === "__todas__" ? "animate-spin" : ""}`}
              />
              Rodar auditoria agora
            </Button>
          </div>
        </CardContent>
      </Card>

      {resumo && (
        <Card className={resumo.interrompida ? "border-warning/40 bg-warning/5" : ""}>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-1 p-4 text-sm">
            <span>Regras rodadas: <strong>{resumo.regras_rodadas ?? 0}</strong></span>
            <span>Com erro: <strong>{resumo.regras_com_erro ?? 0}</strong></span>
            <span>Novos: <strong>{resumo.achados_novos ?? 0}</strong></span>
            <span>Reapareceram: <strong>{resumo.achados_reaparecidos ?? 0}</strong></span>
            <span>Sumiram: <strong>{resumo.achados_sumiram ?? 0}</strong></span>
            <span>Vivos: <strong>{resumo.achados_vivos ?? 0}</strong></span>
            <span>Duração: <strong>{resumo.duracao_ms ?? 0} ms</strong></span>
            {resumo.interrompida && (
              <span className="font-medium text-warning-foreground">
                Rodada interrompida por tempo.
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {paradas.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                {paradas.length} regra(s) parada(s) ou com erro
              </p>
              <p className="text-xs text-muted-foreground">
                Regra que não roda há mais de 3 dias não vigia nada. Este bloco existe porque um
                painel morreu em silêncio por 9 dias.
              </p>
              <ul className="text-xs">
                {paradas.map((r) => (
                  <li key={r.regra_slug} className="font-mono">
                    {r.regra_slug} · {saudeMeta(r.saude).label} · última rodada{" "}
                    {formatDataHora(r.ultima_rodada_em)}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {painel.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : painel.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Erro ao carregar painel: {formatError(painel.error)}
          </CardContent>
        </Card>
      ) : (
        grupos.map(([modulo, lista]) => (
          <Card key={modulo}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">
                {modulo}{" "}
                <span className="font-normal text-muted-foreground">({lista.length} regra(s))</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Regra</TableHead>
                    <TableHead className="w-[110px]">Severidade</TableHead>
                    <TableHead className="w-[100px]">Modo</TableHead>
                    <TableHead className="w-[110px] text-right">Resultado</TableHead>
                    <TableHead className="w-[120px]">Saúde</TableHead>
                    <TableHead className="w-[160px]">Última rodada</TableHead>
                    <TableHead className="w-[170px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((r) => {
                    const meta = saudeMeta(r.saude);
                    return (
                      <TableRow key={r.regra_slug} className={meta.grita ? "bg-destructive/5" : ""}>
                        <TableCell className="max-w-[320px]">
                          <p className="truncate text-sm font-medium" title={r.titulo ?? ""}>
                            {r.titulo}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {r.regra_slug}
                          </p>
                          {r.ultimo_erro && (
                            <p className="text-[11px] text-destructive">{r.ultimo_erro}</p>
                          )}
                          {!r.teste_valido && (
                            <p className="text-[11px] text-warning-foreground">
                              Sem teste válido — não pode ser ativada.
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${SEVERIDADE_CLS[r.severidade ?? ""] ?? ""}`}
                          >
                            {r.severidade ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.modo}</TableCell>
                        <TableCell className="text-right">
                          {r.modo === "contagem" ? (
                            <span className="font-mono text-sm tabular-nums">
                              {r.ultima_contagem ?? 0}
                            </span>
                          ) : (r.achados_vivos ?? 0) > 0 ? (
                            <Button
                              variant="link"
                              className="h-auto gap-1 p-0 text-xs"
                              onClick={() => onVerAchadosDaRegra(r.regra_slug!)}
                            >
                              <ListFilter className="h-3 w-3" />
                              {r.achados_vivos} vivo(s)
                              {(r.achados_reincidentes ?? 0) > 0 && ` · ${r.achados_reincidentes} reinc.`}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${meta.cls}`}
                            title={meta.ajuda}
                          >
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDataHora(r.ultima_rodada_em)}
                          {r.ultima_duracao_ms != null && (
                            <span className="block">{r.ultima_duracao_ms} ms</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-xs"
                              disabled={rodar.isPending || !user?.id}
                              onClick={() => executar(r.regra_slug!)}
                            >
                              <Play
                                className={`h-3 w-3 ${rodandoSlug === r.regra_slug ? "animate-pulse" : ""}`}
                              />
                              Rodar
                            </Button>
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1 text-xs"
                                onClick={() => {
                                  setRegraEditando(regraPorSlug.get(r.regra_slug!) ?? null);
                                  setEditorAberto(true);
                                }}
                              >
                                <Pencil className="h-3 w-3" /> Editar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Últimas execuções</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {execucoes.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : execucoes.isError ? (
            <p className="text-sm text-destructive">
              Erro ao carregar histórico: {formatError(execucoes.error)}
            </p>
          ) : (execucoes.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Regras</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead className="text-right">Novos</TableHead>
                  <TableHead className="text-right">Reaparec.</TableHead>
                  <TableHead className="text-right">Sumiram</TableHead>
                  <TableHead className="text-right">Vivos</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {execucoes.data!.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">
                      {formatDataHora(e.iniciado_em)}
                      {e.interrompida && (
                        <Badge
                          variant="outline"
                          className="ml-1 border-warning/40 text-[10px] text-warning-foreground"
                        >
                          interrompida
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.origem}
                      {e.regra_slug && (
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {e.regra_slug}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{e.regras_rodadas}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {e.regras_com_erro}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{e.achados_novos}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {e.achados_reaparecidos}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {e.achados_sumiram}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{e.achados_vivos}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {e.duracao_ms ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RegraEditorDialog
        aberto={editorAberto}
        regra={regraEditando}
        onClose={() => setEditorAberto(false)}
      />
    </div>
  );
}
