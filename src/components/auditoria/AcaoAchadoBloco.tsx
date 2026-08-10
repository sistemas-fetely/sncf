/**
 * Bloco de ação do dossiê do achado.
 * A ação vem da regra (rpc_acao, rpc_acao_rotulo, rpc_acao_param, rpc_acao_valor).
 * A tela não conhece nome de regra nem elegibilidade — quem recusa é o banco.
 * SISTEMA SUGERE / HUMANO DECIDE: simular primeiro, confirmar depois.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import {
  useExecutarAcaoAchado,
  useRodarRegraDoAchado,
  type RetornoAcao,
} from "@/hooks/auditoria/useAcaoAchado";
import type { Achado } from "@/lib/auditoria/meta";

function ehDinheiro(chave: string) {
  return /valor|bruto|liquido|soma|total|diferenca|saldo|sobra|remessa_sem_titulo/i.test(chave);
}

function mostrar(chave: string, v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && ehDinheiro(chave)) return formatBRL(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Linhas({ pares }: { pares: [string, unknown][] }) {
  if (pares.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem dados.</p>;
  }
  return (
    <dl className="grid grid-cols-[minmax(0,150px)_1fr] gap-x-3 gap-y-1 text-xs">
      {pares.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate text-muted-foreground" title={k}>
            {k}
          </dt>
          <dd className="break-words font-medium">{mostrar(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}

const CHAVES_CONTEXTO = [
  "nsu",
  "data_venda",
  "venda_bruto",
  "soma_titulos",
  "qtd_titulos",
  "pedido_ancora",
  "remessa_sem_titulo",
  "classificacao",
] as const;

export default function AcaoAchadoBloco({
  achado,
  userId,
}: {
  achado: Achado;
  userId: string | undefined;
}) {
  const rpc = achado.rpc_acao;
  const param = achado.rpc_acao_param;
  const valor = achado.rpc_acao_valor;
  const rotulo = achado.rpc_acao_rotulo;

  const executar = useExecutarAcaoAchado();
  const confirmar = useExecutarAcaoAchado();
  const rodarRegra = useRodarRegraDoAchado();

  const [simulacao, setSimulacao] = useState<RetornoAcao | null>(null);
  const [gravado, setGravado] = useState<RetornoAcao | null>(null);

  useEffect(() => {
    setSimulacao(null);
    setGravado(null);
  }, [achado.id]);

  // rpc_acao NULL = essa regra não tem ação.
  if (!rpc) return null;

  const semDado = valor === null || valor === undefined || valor === "";
  const semParam = !param;
  const bloqueado = !userId || semDado || semParam;

  async function simular() {
    if (bloqueado) return;
    setGravado(null);
    try {
      const r = await executar.mutateAsync({
        rpc: rpc!,
        param: param!,
        valor: valor!,
        userId: userId!,
        simular: true,
      });
      setSimulacao(r);
    } catch (e) {
      setSimulacao(null);
      toast.error(formatError(e));
    }
  }

  async function aplicar() {
    if (bloqueado) return;
    try {
      const r = await confirmar.mutateAsync({
        rpc: rpc!,
        param: param!,
        valor: valor!,
        userId: userId!,
        simular: false,
      });
      if (r.ok === false) {
        setSimulacao(r);
        return;
      }
      setGravado(r);
      setSimulacao(null);
      toast.success(
        `Gravado${r.valor != null ? `: ${formatBRL(Number(r.valor))}` : ""}.`,
      );
      const slug = achado.regra_slug;
      if (slug && userId) {
        await rodarRegra.mutateAsync({ userId, regraSlug: slug });
      }
    } catch (e) {
      toast.error(formatError(e));
    }
  }

  const recusado = simulacao?.ok === false;
  const aprovado = simulacao?.ok === true;
  const contexto = aprovado
    ? CHAVES_CONTEXTO.filter((k) => simulacao![k] !== undefined).map(
        (k) => [k, simulacao![k]] as [string, unknown],
      )
    : [];
  const gravaria =
    aprovado && simulacao!.gravaria && typeof simulacao!.gravaria === "object"
      ? Object.entries(simulacao!.gravaria as Record<string, unknown>)
      : [];
  const diferenca =
    aprovado &&
    typeof simulacao!.venda_bruto === "number" &&
    typeof simulacao!.soma_titulos === "number"
      ? simulacao!.venda_bruto - simulacao!.soma_titulos
      : null;

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Ação</h4>
          <p className="text-xs text-muted-foreground">
            O sistema simula; você decide. Nada é gravado antes da confirmação.
          </p>
        </div>
      </div>

      {semDado ? (
        <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
          Este achado não tem o dado necessário
          {param ? ` (${param})` : ""} para executar a ação.
        </p>
      ) : null}

      <Button
        size="sm"
        variant="outline"
        className="gap-2"
        onClick={simular}
        disabled={bloqueado || executar.isPending || confirmar.isPending}
      >
        {executar.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {rotulo ?? "Executar ação"}
      </Button>

      {recusado && (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-warning-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            O banco recusou a ação
          </div>
          <p className="whitespace-pre-wrap text-xs text-warning-foreground">
            {simulacao?.erro ?? "Sem mensagem devolvida pelo banco."}
          </p>
        </div>
      )}

      {aprovado && (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            Simulação — confira o de-para antes de confirmar.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <h5 className="text-xs font-semibold uppercase text-muted-foreground">
                Lido hoje
              </h5>
              <Linhas pares={contexto} />
              {diferenca !== null && (
                <p className="text-xs">
                  <span className="text-muted-foreground">diferença</span>{" "}
                  <span className="font-medium">{formatBRL(diferenca)}</span>
                </p>
              )}
            </div>
            <div className="space-y-1">
              <h5 className="text-xs font-semibold uppercase text-muted-foreground">
                Seria gravado
              </h5>
              <Linhas pares={gravaria} />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={aplicar}
            disabled={bloqueado || confirmar.isPending || rodarRegra.isPending}
          >
            {(confirmar.isPending || rodarRegra.isPending) && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Confirmar e gravar
          </Button>
        </div>
      )}

      {gravado && (
        <div className="space-y-1 rounded-md border border-success/30 bg-success/10 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Gravado
          </div>
          <Linhas
            pares={(
              ["adiantamento_id", "valor", "pedido_ancora", "status"] as const
            )
              .filter((k) => gravado[k] !== undefined)
              .map((k) => [k, gravado[k]] as [string, unknown])}
          />
          <p className="text-xs text-muted-foreground">
            O achado desaparece porque o problema deixou de existir, não porque alguém o marcou
            como resolvido.
          </p>
        </div>
      )}
    </section>
  );
}
