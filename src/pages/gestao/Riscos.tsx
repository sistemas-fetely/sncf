import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import { useNomePessoa } from "@/components/tarefas/detalhe/comuns";
import { STATUS_RISCO_ROTULO, useRiscos } from "@/hooks/gestao/useRiscos";
import { classesDaFaixa, faixaDe, useFaixasRisco } from "@/hooks/gestao/useFaixasRisco";

const TODOS = "__todos__";
const NIVEIS = [1, 2, 3];

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

export default function Riscos() {
  const [status, setStatus] = useState(TODOS);
  const [projeto, setProjeto] = useState(TODOS);
  const { data: riscos, isLoading, error } = useRiscos({
    status: status === TODOS ? null : status,
    projetoId: projeto === TODOS ? null : projeto,
  });
  const { data: faixas } = useFaixasRisco();
  const { data: projetos } = useProjetos();
  const nomePessoa = useNomePessoa();

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    (riscos ?? []).forEach((r) => {
      const k = `${r.probabilidade}-${r.impacto}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return m;
  }, [riscos]);

  const nomeProjeto = (id: string | null) =>
    (id && (projetos ?? []).find((p) => p.id === id)?.nome) || null;

  return (
    <PageShell>
      <PageTitle
        titulo="Riscos"
        icone={ShieldAlert}
        estado="Probabilidade × impacto. A severidade e as faixas de cor vêm do banco — a matriz só mostra."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os status</SelectItem>
            {Object.entries(STATUS_RISCO_ROTULO).map(([v, r]) => (
              <SelectItem key={v} value={v}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projeto} onValueChange={setProjeto}>
          <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os projetos</SelectItem>
            {(projetos ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-medium">Matriz probabilidade × impacto</p>
          <div className="grid grid-cols-[auto_repeat(3,1fr)] gap-1 text-xs">
            <div />
            {NIVEIS.map((i) => (
              <div key={`cab-${i}`} className="pb-1 text-center text-[11px] text-muted-foreground">
                Impacto {i}
              </div>
            ))}
            {[...NIVEIS].reverse().map((prob) => (
              <div key={`linha-${prob}`} className="contents">
                <div className="flex items-center pr-2 text-[11px] text-muted-foreground">
                  Prob. {prob}
                </div>
                {NIVEIS.map((imp) => {
                  const faixa = faixaDe(faixas, prob * imp);
                  const n = contagem.get(`${prob}-${imp}`) ?? 0;
                  return (
                    <div
                      key={`${prob}-${imp}`}
                      className={cn(
                        "flex h-16 flex-col items-center justify-center rounded border",
                        classesDaFaixa(faixa),
                      )}
                      title={faixa ? `${faixa.rotulo} · severidade ${prob * imp}` : undefined}
                    >
                      <span className="font-display text-lg">{n}</span>
                      <span className="text-[10px]">{faixa?.rotulo ?? "—"}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {(faixas ?? []).map((f) => (
              <Badge key={f.id} variant="outline" className={cn("rounded px-1.5 py-0 text-[10px]", classesDaFaixa(f))}>
                {f.rotulo} ({f.minimo}–{f.maximo})
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar os riscos: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando riscos…</p>
      ) : (riscos ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum risco registrado. Riscos nascem na reunião, em "Registrar risco" — a matriz acima
              se preenche sozinha a partir deles.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(riscos ?? []).map((r) => {
            const faixa = faixaDe(faixas, r.severidade);
            return (
              <Card key={r.id}>
                <CardContent className="space-y-1 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate font-medium">{r.titulo}</p>
                    <Badge variant="outline" className={cn("rounded px-1.5 py-0 text-[10px]", classesDaFaixa(faixa))}>
                      {faixa?.rotulo ?? "—"} · sev {r.severidade ?? "—"}
                    </Badge>
                    <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                      {STATUS_RISCO_ROTULO[r.status] ?? r.status}
                    </Badge>
                  </div>
                  {r.descricao && <p className="text-xs text-muted-foreground">{r.descricao}</p>}
                  {r.mitigacao && <p className="text-xs">Mitigação: {r.mitigacao}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    P{r.probabilidade} × I{r.impacto}
                    {nomeProjeto(r.projeto_id) ? ` · ${nomeProjeto(r.projeto_id)}` : ""}
                    {r.dono_pessoa_id ? ` · dono ${nomePessoa(r.dono_pessoa_id)}` : ""}
                    {r.proxima_revisao ? ` · revisão ${dataBR(r.proxima_revisao)}` : ""}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
