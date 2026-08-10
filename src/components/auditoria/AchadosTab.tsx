/**
 * Aba ACHADOS: lista de vw_auditoria_achado agrupada por regra.
 * Vivo por padrão; ordenação dinheiro-grande-primeiro (severidade, valor).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpRight, CheckCircle2, ChevronDown, Search, User } from "lucide-react";
import AchadoDrawer from "@/components/auditoria/AchadoDrawer";
import CardSaudeAuditoria from "@/components/auditoria/CardSaudeAuditoria";
import {
  useAchadosAuditoria,
  useDimsAuditoria,
  useDonosAuditoria,
  type FiltrosAchados,
} from "@/hooks/auditoria/useAuditoria";
import {
  formatDataHora,
  SEVERIDADE_CLS,
  SITUACAO_CLS,
  type Achado,
} from "@/lib/auditoria/meta";

const TODOS = "__todos__";

export default function AchadosTab({
  regraFiltro,
  onLimparRegra,
  ultimaExecucaoEm,
}: {
  regraFiltro: string | null;
  onLimparRegra: () => void;
  ultimaExecucaoEm: string | null;
}) {
  const navigate = useNavigate();
  const dims = useDimsAuditoria();
  const donos = useDonosAuditoria();

  const [modulo, setModulo] = useState(TODOS);
  const [severidade, setSeveridade] = useState(TODOS);
  const [situacao, setSituacao] = useState(TODOS);
  const [dono, setDono] = useState(TODOS);
  const [incluir, setIncluir] = useState(false);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [selecionado, setSelecionado] = useState<Achado | null>(null);

  const filtros: FiltrosAchados = {
    modulo: modulo === TODOS ? null : modulo,
    severidade: severidade === TODOS ? null : severidade,
    situacao: situacao === TODOS ? null : situacao,
    dono: dono === TODOS ? null : dono,
    regra: regraFiltro,
    incluirTratadosESumidos: incluir,
    busca,
  };
  const { data, isLoading, isError, error } = useAchadosAuditoria(filtros);
  const achados = data ?? [];

  const kpis = useMemo(() => {
    const vivos = achados.filter((a) => a.esta_vivo);
    return {
      vivos: vivos.length,
      bloqueantes: vivos.filter((a) => a.severidade === "bloqueante").length,
      valor: vivos.reduce((s, a) => s + Number(a.valor || 0), 0),
    };
  }, [achados]);

  const grupos = useMemo(() => {
    const map = new Map<string, Achado[]>();
    for (const a of achados) {
      const k = a.regra_slug ?? "—";
      const arr = map.get(k);
      if (arr) arr.push(a);
      else map.set(k, [a]);
    }
    return Array.from(map.entries()).map(([slug, lista]) => ({
      slug,
      lista,
      titulo: lista[0].regra_titulo ?? slug,
      severidade: lista[0].severidade,
      severidadeRotulo: lista[0].severidade_rotulo,
      oQueSignifica: lista[0].o_que_significa,
      modulo: lista[0].modulo_nome,
      total: lista.reduce((s, a) => s + Number(a.valor || 0), 0),
    }));
  }, [achados]);

  return (
    <div className="space-y-4">
      <CardSaudeAuditoria />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Achados vivos</p>
            <p className="text-2xl font-semibold tabular-nums">{kpis.vivos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Bloqueantes</p>
            <p className="text-2xl font-semibold tabular-nums text-destructive">
              {kpis.bloqueantes}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Valor dos vivos</p>
            <p className="text-2xl font-semibold tabular-nums">{formatBRL(kpis.valor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Última execução</p>
            <p className="text-sm font-medium">{formatDataHora(ultimaExecucaoEm)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="ID, parceiro, evidência..."
              className="h-9 w-[240px] pl-8"
            />
          </div>
          <Select value={modulo} onValueChange={setModulo}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os módulos</SelectItem>
              {(dims.data?.modulos ?? []).map((m) => (
                <SelectItem key={m.slug} value={m.slug}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severidade} onValueChange={setSeveridade}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Severidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Toda severidade</SelectItem>
              {(dims.data?.severidades ?? []).map((s) => (
                <SelectItem key={s.codigo} value={s.codigo}>
                  {s.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={situacao} onValueChange={setSituacao}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Toda situação</SelectItem>
              {(dims.data?.situacoes ?? []).map((s) => (
                <SelectItem key={s.codigo} value={s.codigo}>
                  {s.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dono} onValueChange={setDono}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Dono" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Qualquer dono</SelectItem>
              {(donos.data ?? []).map((d) => (
                <SelectItem key={d.user_id} value={d.user_id}>
                  {d.full_name ?? d.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="incluir-tratados" checked={incluir} onCheckedChange={setIncluir} />
            <Label htmlFor="incluir-tratados" className="text-xs">
              Mostrar tratados e sumidos
            </Label>
          </div>
          {regraFiltro && (
            <Button variant="outline" size="sm" className="h-9" onClick={onLimparRegra}>
              Regra: {regraFiltro} ✕
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Erro ao carregar achados: {formatError(error)}
          </CardContent>
        </Card>
      ) : grupos.length === 0 ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <p className="text-lg font-semibold text-success">Nenhum achado vivo</p>
            <p className="text-sm text-muted-foreground">
              Com os filtros atuais, não há nada pendente de tratamento. Boa notícia.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => {
            const open = aberto[g.slug] ?? g.severidade === "bloqueante";
            return (
              <Collapsible
                key={g.slug}
                open={open}
                onOpenChange={(o) => setAberto((p) => ({ ...p, [g.slug]: o }))}
                className="rounded-md border bg-card"
              >
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center gap-3 px-3 py-2 text-left">
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
                    />
                    <span className="truncate text-sm font-medium" title={g.titulo}>
                      {g.titulo}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {g.lista.length}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] ${SEVERIDADE_CLS[g.severidade ?? ""] ?? ""}`}
                    >
                      {g.severidadeRotulo ?? g.severidade ?? "—"}
                    </Badge>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {formatBRL(g.total)}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground lg:inline">
                      {g.oQueSignifica ?? g.modulo}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t px-2 pb-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">ID</TableHead>
                          <TableHead>Parceiro</TableHead>
                          <TableHead className="text-right w-[120px]">Valor</TableHead>
                          <TableHead>Evidência</TableHead>
                          <TableHead className="w-[130px]">Situação</TableHead>
                          <TableHead className="w-[150px]">Dono</TableHead>
                          <TableHead className="w-[180px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.lista.map((a) => {
                          const sumiu = !!a.sumiu_em;
                          return (
                            <TableRow
                              key={a.id}
                              className={`cursor-pointer ${sumiu ? "opacity-60" : ""}`}
                              onClick={() => setSelecionado(a)}
                            >
                              <TableCell className="font-mono text-xs">
                                {a.id_externo ?? "—"}
                              </TableCell>
                              <TableCell className="max-w-[180px] truncate" title={a.parceiro ?? ""}>
                                {a.parceiro ?? "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {a.valor == null ? "—" : formatBRL(Number(a.valor))}
                              </TableCell>
                              <TableCell className="max-w-[320px] text-xs">
                                <span className="line-clamp-2">{a.detalhe ?? "—"}</span>
                                {sumiu && (
                                  <span className="mt-1 block text-[11px] font-medium text-muted-foreground">
                                    Sumiu — não é o mesmo que resolvido
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col items-start gap-1">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${SITUACAO_CLS[a.situacao ?? ""] ?? ""}`}
                                  >
                                    {a.situacao_rotulo ?? a.situacao ?? "—"}
                                  </Badge>
                                  {a.reincidente && (
                                    <Badge
                                      variant="outline"
                                      className="border-warning/40 text-[10px] text-warning-foreground"
                                    >
                                      Reincidente ×{a.vezes_visto ?? 1}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">
                                {a.dono_nome ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                                      {a.dono_nome.slice(0, 2).toUpperCase()}
                                    </span>
                                    <span className="truncate">{a.dono_nome}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                                    <User className="h-3.5 w-3.5" /> sem dono
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {a.rota_acao && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(a.rota_acao!);
                                    }}
                                  >
                                    {a.rotulo_acao ?? "Resolver"}
                                    <ArrowUpRight className="h-3 w-3" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      <AchadoDrawer achado={selecionado} onClose={() => setSelecionado(null)} />
    </div>
  );
}
