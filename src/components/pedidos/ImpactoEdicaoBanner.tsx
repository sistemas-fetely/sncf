import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { useAvaliarImpactoEdicao } from "@/hooks/credito/useAvaliarImpactoEdicao";

interface Props {
  pedidoId: string | null | undefined;
  novaCondicao: string | null | undefined;
  novoValorLiquido?: number | null;
  enabled?: boolean;
  className?: string;
}

/**
 * Banner CONSULTIVO — não bloqueia ações.
 * Chama fn_avaliar_impacto_edicao_pedido e sugere o caminho.
 * Fail-loud suave: em erro/rpc off, não renderiza.
 */
export function ImpactoEdicaoBanner({
  pedidoId,
  novaCondicao,
  novoValorLiquido,
  enabled = true,
  className,
}: Props) {
  const q = useAvaliarImpactoEdicao({
    pedidoId,
    novaCondicao,
    novoValorLiquido,
    enabled,
  });

  if (!enabled) return null;
  if (q.isLoading || q.isFetching && !q.data) {
    // opcional: renderizar um placeholder discreto
  }
  if (q.error || !q.data) return null;

  const d = q.data;
  const caminho = d.caminho;

  const expo = Number(d.exposicao_nova ?? 0);
  const limite = Number(d.limite_concedido ?? 0);
  const prazoNovo = d.prazo_novo_dias ?? null;
  const prazoMax = d.prazo_max_dias ?? null;

  const numeros =
    limite > 0 || expo > 0 ? (
      <div className="mt-1 text-xs text-muted-foreground">
        Exposição nova: <span className="font-medium">{formatBRL(expo)}</span>
        {limite > 0 && <> · Limite concedido: <span className="font-medium">{formatBRL(limite)}</span></>}
        {prazoNovo != null && (
          <> · Prazo: <span className="font-medium">{prazoNovo}d</span>
            {prazoMax != null && <> / {prazoMax}d</>}
          </>
        )}
      </div>
    ) : null;

  if (caminho === "reconcilia_no_lugar") {
    return (
      <Alert className={`border-green-600/40 bg-green-500/5 text-green-900 dark:text-green-200 ${className ?? ""}`}>
        <CheckCircle2 className="h-4 w-4 !text-green-600" />
        <AlertTitle>Dentro do crédito aprovado</AlertTitle>
        <AlertDescription>
          Pode materializar direto.
          {numeros}
        </AlertDescription>
      </Alert>
    );
  }

  if (caminho === "re_analise") {
    return (
      <Alert className={`border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 ${className ?? ""}`}>
        <AlertTriangle className="h-4 w-4 !text-amber-600" />
        <AlertTitle>Vai precisar de re-análise</AlertTitle>
        <AlertDescription>
          {d.motivo || "Condições fora do crédito aprovado."}
          {numeros}
        </AlertDescription>
      </Alert>
    );
  }

  if (caminho === "financeiro") {
    return (
      <Alert variant="destructive" className={className}>
        <XCircle className="h-4 w-4" />
        <AlertTitle>Acione o financeiro</AlertTitle>
        <AlertDescription>
          {d.motivo || "Edição requer intervenção do financeiro."}
          {numeros}
        </AlertDescription>
      </Alert>
    );
  }

  if (caminho === "bloqueado") {
    return (
      <Alert variant="destructive" className={className}>
        <XCircle className="h-4 w-4" />
        <AlertTitle>Bloqueado</AlertTitle>
        <AlertDescription>
          {d.motivo || "Edição bloqueada pelas regras atuais do pedido."}
          {numeros}
        </AlertDescription>
      </Alert>
    );
  }

  if (caminho === "condicao_invalida") {
    return (
      <Alert variant="destructive" className={className}>
        <XCircle className="h-4 w-4" />
        <AlertTitle>Condição não reconhecida</AlertTitle>
        <AlertDescription>
          {d.motivo || "Ajuste ou escolha um modelo existente."}
        </AlertDescription>
      </Alert>
    );
  }

  // caminho === "erro" ou desconhecido → não renderiza
  if (caminho === "erro") return null;

  // Fallback informativo
  return (
    <Alert className={className}>
      <Info className="h-4 w-4" />
      <AlertDescription>
        {d.motivo || "Impacto avaliado."}
        {numeros}
      </AlertDescription>
    </Alert>
  );
}
