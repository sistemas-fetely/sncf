import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, ChevronRight, AlertTriangle, Bot, Loader2, Play, Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import ExecucoesAutomaticas from "./ExecucoesAutomaticas";
import {
  useConciliacaoAutomatica,
  rodarConciliacaoAgora,
  SITUACAO_META,
  ORDEM_SITUACAO,
  KEY_PARES,
  KEY_EXECUCOES,
  type ParCartao,
} from "@/hooks/useConciliacaoAutomatica";

const num = (v: unknown) => Number(v ?? 0);
const pct = (v: unknown) => (v == null ? "—" : `${num(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

const TOM_CLASSE: Record<string, string> = {
  verde: "border-success/40 bg-success/10",
  ambar: "border-warning/40 bg-warning/10",
  vermelho: "border-destructive/40 bg-destructive/5",
  neutro: "",
};

function GrupoSituacao({
  situacao,
  linhas,
  destaque,
  abertoInicial,
}: {
  situacao: string;
  linhas: ParCartao[];
  destaque: boolean;
  abertoInicial: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const meta = SITUACAO_META[situacao] ?? { rotulo: situacao, tom: "neutro" as const };
  const soma = linhas.reduce((s, l) => s + num(l.credito), 0);
  const mostrarTolerancia = situacao === "taxa_fora_da_tolerancia";

  return (
    <div className={`rounded-md border ${destaque ? TOM_CLASSE.ambar : TOM_CLASSE[meta.tom]}`}>
      <Collapsible open={aberto} onOpenChange={setAberto}>
        <CollapsibleTrigger className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
          {aberto ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{meta.rotulo}</span>
          <Badge variant="outline">{linhas.length}</Badge>
          <span className="ml-auto text-sm font-medium">{formatBRL(soma)}</span>
        </CollapsibleTrigger>

        {meta.explicacao && (
          <p className="px-3 pb-2 text-xs text-muted-foreground -mt-1">
            {destaque && <Link2 className="inline h-3 w-3 mr-1 align-[-2px]" />}
            {meta.explicacao}
          </p>
        )}

        <CollapsibleContent>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground bg-muted/40">
                <tr className="border-b">
                  <th className="text-left px-3 py-1.5">NSU</th>
                  <th className="text-left px-3 py-1.5">Parcela</th>
                  <th className="text-left px-3 py-1.5">Data</th>
                  <th className="text-right px-3 py-1.5">Crédito</th>
                  <th className="text-left px-3 py-1.5">Pedido</th>
                  <th className="text-right px-3 py-1.5">Taxa implícita</th>
                  <th className="text-right px-3 py-1.5">Taxa %</th>
                  {mostrarTolerancia && <th className="text-right px-3 py-1.5">Tolerância</th>}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={`${l.movimentacao_id}-${l.titulo_id ?? "s"}`} className="border-b last:border-0">
                    <td className="px-3 py-1.5 font-mono">{l.nsu || "—"}</td>
                    <td className="px-3 py-1.5">
                      {l.parcela != null ? `${l.parcela}/${l.total_parcelas ?? "?"}` : "—"}
                    </td>
                    <td className="px-3 py-1.5">{l.data_transacao ? formatDateBR(l.data_transacao) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{formatBRL(num(l.credito))}</td>
                    <td className="px-3 py-1.5">{l.pedido_ref || "—"}</td>
                    <td className="px-3 py-1.5 text-right">{formatBRL(num(l.taxa_implicita))}</td>
                    <td className="px-3 py-1.5 text-right">{pct(l.taxa_pct)}</td>
                    {mostrarTolerancia && (
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {pct(l.tolerancia_taxa_pct)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function ConciliacaoAutomatica() {
  const qc = useQueryClient();
  const { pares, execucoes } = useConciliacaoAutomatica();
  const [rodando, setRodando] = useState(false);

  const grupos = useMemo(() => {
    const mapa = new Map<string, ParCartao[]>();
    for (const p of pares.data || []) {
      const k = p.situacao || "desconhecida";
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(p);
    }
    const chaves = Array.from(mapa.keys()).sort((a, b) => {
      const ia = ORDEM_SITUACAO.indexOf(a);
      const ib = ORDEM_SITUACAO.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return chaves.map((k) => ({ situacao: k, linhas: mapa.get(k)! }));
  }, [pares.data]);

  async function rodarAgora() {
    setRodando(true);
    try {
      const r = await rodarConciliacaoAgora();

      if (r.ok === false) {
        toast.error(r.error || "A rodada não pôde ser executada.");
        return;
      }

      const candidatos = num(r.candidatos);
      const conciliados = num(r.conciliados);
      const recusados = num(r.recusados);

      if (candidatos === 0) {
        // Corrida vazia não é erro e não gera linha de log.
        toast.info("Nada a conciliar: nenhum par elegível no momento.");
      } else if (recusados > 0) {
        toast.warning(
          `${conciliados} conciliado(s) · ${formatBRL(num(r.valor_conciliado))} · ${recusados} recusado(s). Abra a execução para ver o motivo de cada recusa.`,
        );
      } else {
        toast.success(
          `${conciliados} par(es) conciliado(s) · ${formatBRL(num(r.valor_conciliado))}.`,
        );
      }

      qc.invalidateQueries({ queryKey: KEY_PARES });
      qc.invalidateQueries({ queryKey: KEY_EXECUCOES });
      qc.invalidateQueries({ queryKey: ["conciliacao-cartao-fila"] });
      qc.invalidateQueries({ queryKey: ["conciliacao-cartao-sugestoes"] });
      qc.invalidateQueries({ queryKey: ["auditoria-cartao-sem-pedido"] });
      qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
    } catch (e) {
      const err = e as { message?: string; details?: string; hint?: string };
      toast.error(err.message || "Falha ao rodar a conciliação", {
        description: [err.details, err.hint].filter(Boolean).join(" · ") || undefined,
      });
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4 text-admin" />
                Conciliação automática
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                O robô amarra o crédito bancário ao título por chave dupla NSU + parcela, de hora em
                hora. Esta seção mostra o que ele fez sozinho e por que o resto ainda espera. Não há
                conciliação manual par a par aqui: quando um par não está elegível, o conserto é a
                montante.
              </p>
            </div>
            <Button onClick={rodarAgora} disabled={rodando} className="shrink-0 gap-2">
              {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Rodar agora
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {pares.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Erro ao carregar a fila: {(pares.error as Error).message}
              </AlertDescription>
            </Alert>
          )}
          {pares.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando fila...
            </div>
          ) : grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum crédito de cartão na fila.</p>
          ) : (
            grupos.map((g) => (
              <GrupoSituacao
                key={g.situacao}
                situacao={g.situacao}
                linhas={g.linhas}
                destaque={g.situacao === "sem_titulo_com_este_nsu_e_parcela"}
                abertoInicial={
                  g.situacao === "sem_titulo_com_este_nsu_e_parcela"
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <ExecucoesAutomaticas
        execucoes={execucoes.data || []}
        carregando={execucoes.isLoading}
        erro={execucoes.error ? (execucoes.error as Error).message : null}
      />
    </div>
  );
}
