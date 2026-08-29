import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { useAvaliarImpactoEdicao } from "@/hooks/credito/useAvaliarImpactoEdicao";
import { useAvaliarImpactoPlano, type LinhaImpacto } from "@/hooks/credito/useAvaliarImpactoPlano";

/** Rótulos curtos das travas duras devolvidas pela RPC (a regra fica no banco). */
export const TRAVA_ROTULO: Record<string, string> = {
  titulo_pago: "Título já pago",
  boleto_banco: "Boleto no banco",
  nf_fiscal: "NF autorizada",
  remessa_bling: "Espelhado no Bling",
};

/** Selo curto que identifica o tipo de bloqueio, ao lado do motivo da RPC. */
export function SeloTrava({ trava }: { trava?: string | null }) {
  if (!trava) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-current/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
      {TRAVA_ROTULO[trava] ?? trava}
    </span>
  );
}

interface Props {
  pedidoId: string | null | undefined;
  /** Plano em tela. Quando informado, a avaliação é feita por linhas. */
  linhas?: LinhaImpacto[];
  /** Legado: avaliação por string de condição (dialogs de edição de condição/desconto). */
  novaCondicao?: string | null;
  novoValorLiquido?: number | null;
  enabled?: boolean;
  className?: string;
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/**
 * Banner CONSULTIVO — não bloqueia ações.
 * Chama fn_avaliar_impacto_plano e avalia o PLANO EM TELA (as linhas montadas
 * pelo operador), não a condição original do pedido, e sugere o caminho.
 * Fail-loud suave: em erro/rpc off, não renderiza.
 */
export function ImpactoEdicaoBanner({
  pedidoId,
  linhas,
  novaCondicao,
  novoValorLiquido,
  enabled = true,
  className,
}: Props) {
  const usarPlano = !!linhas && linhas.length > 0;

  const qPlano = useAvaliarImpactoPlano({
    pedidoId,
    linhas: linhas ?? [],
    enabled: enabled && usarPlano,
  });

  const qCondicao = useAvaliarImpactoEdicao({
    pedidoId,
    novaCondicao,
    novoValorLiquido,
    enabled: enabled && !usarPlano,
  });

  const q = usarPlano ? qPlano : qCondicao;

  if (!enabled) return null;
  if (q.error || !q.data) return null;

  const d = q.data;
  const caminho = d.caminho;
  const trava = d.trava ?? null;


  const expo = Number(d.exposicao_nova ?? 0);
  const limite = Number(d.limite_concedido ?? 0);
  const prazoNovo = d.prazo_novo_dias ?? null;
  const prazoMax = d.prazo_max_dias ?? null;
  const vencMaisLongo = usarPlano ? qPlano.data?.venc_mais_longo ?? null : null;

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
        {vencMaisLongo && <> · última em {fmtData(vencMaisLongo)}</>}
      </div>
    ) : null;

  if (caminho === "reconcilia_no_lugar") {
    return (
      <Alert className={`border-success/40 bg-success/5 text-success ${className ?? ""}`}>
        <CheckCircle2 className="h-4 w-4 !text-success" />
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
      <Alert className={`border-warning/50 bg-warning/10 text-warning ${className ?? ""}`}>
        <AlertTriangle className="h-4 w-4 !text-warning" />
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
