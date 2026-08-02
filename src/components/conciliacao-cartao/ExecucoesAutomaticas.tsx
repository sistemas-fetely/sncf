import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, ChevronRight, AlertTriangle, History, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import type { ExecucaoAuto } from "@/hooks/useConciliacaoAutomatica";

const num = (v: unknown) => Number(v ?? 0);

const dataHora = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function LinhaExecucao({ e }: { e: ExecucaoAuto }) {
  const [aberto, setAberto] = useState(false);
  const detalhe = Array.isArray(e.detalhe) ? e.detalhe : [];
  const recusados = num(e.recusados);

  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <CollapsibleTrigger className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 text-left border-b">
        {aberto ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium w-40 shrink-0">{dataHora(e.executado_em)}</span>
        <Badge variant="outline" className="shrink-0">{e.origem || "—"}</Badge>
        <span className="text-xs text-muted-foreground">
          {num(e.candidatos)} candidatos
        </span>
        <span className="text-xs text-emerald-700 font-medium">
          {num(e.conciliados)} conciliados
        </span>
        {recusados > 0 && (
          <Badge variant="destructive" className="shrink-0 gap-1">
            <AlertTriangle className="h-3 w-3" />
            {recusados} recusa{recusados > 1 ? "s" : ""}
          </Badge>
        )}
        <span className="ml-auto text-sm font-medium">{formatBRL(num(e.valor_conciliado))}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="overflow-x-auto border-b bg-muted/20">
          {detalhe.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-2">Sem detalhe registrado nesta execução.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left px-3 py-1.5">NSU</th>
                  <th className="text-left px-3 py-1.5">Parcela</th>
                  <th className="text-left px-3 py-1.5">Título</th>
                  <th className="text-left px-3 py-1.5">Pedido</th>
                  <th className="text-right px-3 py-1.5">Crédito</th>
                  <th className="text-right px-3 py-1.5">Taxa obs.</th>
                  <th className="text-right px-3 py-1.5">Δ vs prevista</th>
                  <th className="text-left px-3 py-1.5">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.map((d, i) => (
                  <tr key={i} className={`border-b last:border-0 ${d.ok === false ? "bg-destructive/5" : ""}`}>
                    <td className="px-3 py-1.5 font-mono">{d.nsu || "—"}</td>
                    <td className="px-3 py-1.5">{d.parcela ?? "—"}</td>
                    <td className="px-3 py-1.5">{d.titulo || "—"}</td>
                    <td className="px-3 py-1.5">{d.pedido || "—"}</td>
                    <td className="px-3 py-1.5 text-right">{formatBRL(num(d.credito))}</td>
                    <td className="px-3 py-1.5 text-right">{formatBRL(num(d.taxa_observada))}</td>
                    <td className="px-3 py-1.5 text-right">{formatBRL(num(d.delta_vs_previsto))}</td>
                    <td className="px-3 py-1.5">
                      {d.ok === false ? (
                        <span className="text-destructive font-medium">
                          Recusado{d.erro ? `: ${d.erro}` : ""}
                        </span>
                      ) : (
                        <span className="text-emerald-700">Conciliado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ExecucoesAutomaticas({
  execucoes,
  carregando,
  erro,
}: {
  execucoes: ExecucaoAuto[];
  carregando: boolean;
  erro: string | null;
}) {
  const totalRecusas = execucoes.reduce((s, e) => s + num(e.recusados), 0);
  const execucoesComRecusa = execucoes.filter((e) => num(e.recusados) > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Execuções do robô
          <span className="text-xs font-normal text-muted-foreground">
            (últimas {execucoes.length})
          </span>
          {totalRecusas > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {totalRecusas} recusa{totalRecusas > 1 ? "s" : ""}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {erro && (
          <Alert variant="destructive" className="m-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Erro ao carregar o histórico: {erro}</AlertDescription>
          </Alert>
        )}
        {totalRecusas > 0 && (
          <Alert variant="destructive" className="m-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {totalRecusas} par{totalRecusas > 1 ? "es" : ""} recusado
              {totalRecusas > 1 ? "s" : ""} em{" "}
              {execucoesComRecusa.map((e) => dataHora(e.executado_em)).join(", ")}. Expanda a
              execução para ler o motivo de cada recusa.
            </AlertDescription>
          </Alert>
        )}
        {carregando ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando execuções...
          </div>
        ) : execucoes.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Nenhuma execução registrada ainda.</p>
        ) : (
          <div>
            {execucoes.map((e) => (
              <LinhaExecucao key={e.id} e={e} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
