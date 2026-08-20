import { FolderKanban } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePainelProjetos } from "@/hooks/gestao/usePainelProjetos";
import { classesDaFaixa, faixaDe, useFaixasRisco } from "@/hooks/gestao/useFaixasRisco";
import { SAUDE_ROTULO } from "@/hooks/gestao/useReuniao";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

export default function PainelProjetos() {
  const { data: linhas, isLoading, error } = usePainelProjetos();
  const { data: faixas } = useFaixasRisco();

  return (
    <PageShell>
      <PageTitle
        titulo="Painel de projetos"
        icone={FolderKanban}
        estado="Saúde, check-in e carga de cada projeto ou tema. O check-in nasce da reunião — não é digitado aqui."
      />

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar o painel: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando painel…</p>
      ) : (linhas ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <FolderKanban className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum projeto no painel. Crie um projeto em Tarefas → Projetos e coloque-o no escopo
              de uma sala para ele entrar no rito.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(linhas ?? []).map((p) => {
            const faixa = faixaDe(faixas, p.risco_severidade_maxima);
            const alerta = p.checkin_vencido || p.saude === "atrasado" || p.saude === "em_risco";
            return (
              <Card key={p.projeto_id ?? p.nome} className={cn(alerta && "border-warning")}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate font-medium">{p.nome}</p>
                    <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                      {p.tipo === "tema" ? "Tema" : "Projeto"}
                    </Badge>
                    {p.saude && (
                      <Badge
                        variant={p.saude === "atrasado" ? "destructive" : "outline"}
                        className="rounded px-1.5 py-0 text-[10px]"
                      >
                        {SAUDE_ROTULO[p.saude] ?? p.saude}
                      </Badge>
                    )}
                    {p.checkin_vencido && (
                      <Badge variant="outline" className="rounded border-warning px-1.5 py-0 text-[10px] text-warning">
                        Check-in vencido
                      </Badge>
                    )}
                    {faixa && (
                      <Badge variant="outline" className={cn("rounded px-1.5 py-0 text-[10px]", classesDaFaixa(faixa))}>
                        Risco {faixa.rotulo}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Fim previsto: {dataBR(p.data_fim_prevista)}</span>
                    <span>
                      Último check-in: {dataBR(p.ultimo_checkin_em)}
                      {p.dias_sem_checkin != null ? ` (${p.dias_sem_checkin} dia(s))` : ""}
                      {p.cadencia_checkin_dias ? ` · cadência ${p.cadencia_checkin_dias}d` : ""}
                    </span>
                    <span>Tarefas: {p.tarefas_abertas ?? 0} abertas · {p.tarefas_vencidas ?? 0} vencidas · {p.tarefas_concluidas ?? 0} concluídas</span>
                    <span>Riscos abertos: {p.riscos_abertos ?? 0}</span>
                    <span>Decisões vigentes: {p.decisoes_vigentes ?? 0}</span>
                  </div>

                  {p.ultimo_checkin_resumo && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">
                        {p.ultimo_checkin_saude ? `${SAUDE_ROTULO[p.ultimo_checkin_saude] ?? p.ultimo_checkin_saude}: ` : ""}
                      </span>
                      {p.ultimo_checkin_resumo}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
