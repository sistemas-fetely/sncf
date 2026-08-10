/**
 * Drawer de detalhe do achado: evidência, contexto, histórico e tratamento.
 * Tratamento SEMPRE via RPC fn_auditoria_tratar_achado.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpRight, Loader2, UserX } from "lucide-react";
import {
  useDimsAuditoria,
  useDonosAuditoria,
  useEventosAchado,
  useTratarAchado,
} from "@/hooks/auditoria/useAuditoria";
import {
  formatDataHora,
  SEVERIDADE_CLS,
  SITUACAO_CLS,
  type Achado,
} from "@/lib/auditoria/meta";

const SEM_DONO = "__sem_dono__";

function Contexto({ contexto }: { contexto: unknown }) {
  if (!contexto || typeof contexto !== "object") {
    return <p className="text-sm text-muted-foreground">Sem contexto.</p>;
  }
  const entradas = Object.entries(contexto as Record<string, unknown>);
  if (entradas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem contexto.</p>;
  }
  return (
    <dl className="grid grid-cols-[minmax(0,140px)_1fr] gap-x-3 gap-y-1 text-sm">
      {entradas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground truncate" title={k}>
            {k}
          </dt>
          <dd className="font-mono text-xs break-words">
            {v === null || v === undefined
              ? "—"
              : typeof v === "object"
                ? JSON.stringify(v)
                : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function AchadoDrawer({
  achado,
  onClose,
}: {
  achado: Achado | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dims = useDimsAuditoria();
  const donos = useDonosAuditoria();
  const eventos = useEventosAchado(achado?.id ?? null);
  const tratar = useTratarAchado();

  const [situacao, setSituacao] = useState<string>("");
  const [nota, setNota] = useState("");
  const [dono, setDono] = useState<string>(SEM_DONO);

  useEffect(() => {
    setSituacao(achado?.situacao ?? "");
    setNota(achado?.nota ?? "");
    setDono(achado?.dono_user_id ?? SEM_DONO);
  }, [achado?.id, achado?.situacao, achado?.nota, achado?.dono_user_id]);

  const situacoes = (dims.data?.situacoes ?? []).filter(
    (s) => s.atribuivel_por_humano && s.codigo !== "reaparecido",
  );
  const exigeNota = situacao === "explicado";
  const notaVazia = nota.trim().length === 0;
  const bloqueado = !achado || !user?.id || tratar.isPending || (exigeNota && notaVazia);

  async function confirmar() {
    if (!achado?.id || !user?.id) return;
    try {
      await tratar.mutateAsync({
        achadoId: achado.id,
        situacao: situacao || null,
        nota: nota.trim() ? nota.trim() : null,
        donoUserId: dono === SEM_DONO ? null : dono,
        limparDono: dono === SEM_DONO && !!achado.dono_user_id,
        userId: user.id,
      });
      toast.success("Achado tratado.");
      onClose();
    } catch (e) {
      toast.error(formatError(e));
    }
  }

  return (
    <Sheet open={!!achado} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {achado && (
          <>
            <SheetHeader className="space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={SEVERIDADE_CLS[achado.severidade ?? ""] ?? ""}
                >
                  {achado.severidade_rotulo ?? achado.severidade ?? "—"}
                </Badge>
                <Badge variant="outline" className={SITUACAO_CLS[achado.situacao ?? ""] ?? ""}>
                  {achado.situacao_rotulo ?? achado.situacao ?? "—"}
                </Badge>
                {achado.reincidente && (
                  <Badge variant="outline" className="border-warning/40 text-warning-foreground">
                    Reincidente ×{achado.vezes_visto ?? 1}
                  </Badge>
                )}
                {achado.sumiu_em && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Sumiu — não é o mesmo que resolvido
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-base">{achado.regra_titulo ?? achado.regra_slug}</SheetTitle>
              <SheetDescription>
                {achado.modulo_nome ?? "—"} · {achado.entidade_rotulo ?? "—"} ·{" "}
                {achado.id_externo ?? "sem id externo"}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5">
              <section className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Evidência</h4>
                <p className="text-sm">{achado.detalhe ?? "—"}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Parceiro: {achado.parceiro ?? "—"}</span>
                  <span>Valor: {achado.valor == null ? "—" : formatBRL(Number(achado.valor))}</span>
                  <span>Idade: {achado.idade_dias ?? 0} dia(s)</span>
                  <span>Visto {achado.vezes_visto ?? 1}×</span>
                  <span>1ª vez: {formatDataHora(achado.primeira_vez_em)}</span>
                  <span>Última: {formatDataHora(achado.ultima_vez_em)}</span>
                </div>
                {achado.o_que_significa && (
                  <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                    {achado.o_que_significa}
                  </p>
                )}
                {achado.rota_acao && (
                  <Button
                    size="sm"
                    className="mt-2 gap-1.5"
                    onClick={() => navigate(achado.rota_acao!)}
                  >
                    {achado.rotulo_acao ?? "Abrir tela que resolve"}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Contexto</h4>
                <Contexto contexto={achado.contexto} />
              </section>

              <section className="space-y-2 rounded-md border p-3">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                  Tratamento
                </h4>
                <div className="space-y-1.5">
                  <Label className="text-xs">Situação</Label>
                  <Select value={situacao} onValueChange={setSituacao}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Escolher situação" />
                    </SelectTrigger>
                    <SelectContent>
                      {situacoes.map((s) => (
                        <SelectItem key={s.codigo} value={s.codigo}>
                          {s.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dono</Label>
                  <Select value={dono} onValueChange={setDono}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sem dono" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_DONO}>
                        <span className="inline-flex items-center gap-1.5">
                          <UserX className="h-3.5 w-3.5" /> Sem dono
                        </span>
                      </SelectItem>
                      {(donos.data ?? []).map((d) => (
                        <SelectItem key={d.user_id} value={d.user_id}>
                          {d.full_name ?? d.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nota</Label>
                  <Textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    rows={3}
                    placeholder="O que foi apurado?"
                  />
                  {exigeNota && (
                    <p className="text-xs text-muted-foreground">
                      Marcar como <strong>explicado</strong> exige nota: a explicação sobrevive às
                      próximas execuções e é o que evita o retrabalho.
                    </p>
                  )}
                </div>
                <Button onClick={confirmar} disabled={bloqueado} className="w-full gap-2">
                  {tratar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar tratamento
                </Button>
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Histórico</h4>
                {eventos.isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : eventos.isError ? (
                  <p className="text-sm text-destructive">
                    Erro ao carregar histórico: {formatError(eventos.error)}
                  </p>
                ) : (eventos.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
                ) : (
                  <ul className="space-y-2">
                    {eventos.data!.map((ev) => (
                      <li key={ev.id} className="border-l-2 border-border pl-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{ev.tipo}</span>
                          {(ev.de || ev.para) && (
                            <span className="text-xs text-muted-foreground">
                              {ev.de ?? "—"} → {ev.para ?? "—"}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDataHora(ev.created_at)}
                          </span>
                        </div>
                        {ev.nota && <p className="text-xs text-muted-foreground">{ev.nota}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
