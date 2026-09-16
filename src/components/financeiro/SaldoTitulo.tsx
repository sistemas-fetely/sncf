import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { useFilhosAbertos, type TituloSaldo } from "@/hooks/financeiro/useTituloSaldo";
import { urlTitulo } from "@/hooks/tarefas/useTitulosParaVinculo";
import { Link } from "react-router-dom";

/**
 * SALDO-MANDA-VERDADE-DE-FACE-CONTINUA-VISIVEL (16/09/2026): o número principal é
 * o saldo a receber vindo de `vw_titulo_saldo`; o valor de face aparece embaixo
 * quando diferente. Nada é recalculado aqui.
 */
export function ValorSaldo({
  saldo,
  valorFace,
}: {
  saldo: TituloSaldo | undefined;
  valorFace: number | null | undefined;
}) {
  const face = Number(valorFace ?? 0);
  const s = saldo?.saldo_a_receber;
  const principal = s != null ? Number(s) : face;
  const mostrarFace = s != null && Number(s) !== face;
  return (
    <>
      <div className="font-medium tabular-nums">{formatBRL(principal)}</div>
      {mostrarFace && (
        <div className="text-[10px] text-muted-foreground tabular-nums">
          de {formatBRL(face)}
        </div>
      )}
    </>
  );
}

/** Badge de pai com parcelas de acerto em aberto. */
export function BadgeParcelasAcerto({ saldo }: { saldo: TituloSaldo | undefined }) {
  const n = Number(saldo?.n_filhos_abertos ?? 0);
  if (!saldo || n <= 0) return null;
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
      {n} parcela{n !== 1 ? "s" : ""} de acerto
    </Badge>
  );
}

/** Badge do próprio filho (título de acerto). */
export function BadgeAcerto({ saldo }: { saldo: TituloSaldo | undefined }) {
  if (!saldo?.titulo_pai_id) return null;
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
      acerto
    </Badge>
  );
}

/** Número do título pai, em muted, sob o número do filho. */
export function LinhaTituloPai({
  saldo,
  numeroPai,
}: {
  saldo: TituloSaldo | undefined;
  numeroPai: string | null | undefined;
}) {
  if (!saldo?.titulo_pai_id) return null;
  return (
    <div className="text-[10px] text-muted-foreground font-mono">
      rotativo {numeroPai ?? "—"}
    </div>
  );
}

/** Soma de saldos — nunca de valores de face (dinheiro contado duas vezes). */
export function somarSaldos(
  linhas: { id: string; valorFace: number | null | undefined }[],
  porTitulo: Map<string, TituloSaldo>,
): number {
  return linhas.reduce((acc, l) => {
    const s = porTitulo.get(l.id)?.saldo_a_receber;
    return acc + (s != null ? Number(s) : Number(l.valorFace ?? 0));
  }, 0);
}

/** Bloco "Composição do saldo" do detalhe do título. */
export function ComposicaoSaldo({
  tituloId,
  saldo,
}: {
  tituloId: string;
  saldo: TituloSaldo | undefined;
}) {
  const n = Number(saldo?.n_filhos_abertos ?? 0);
  const filhosQ = useFilhosAbertos(tituloId, n > 0);
  if (!saldo?.tem_abatimento) return null;
  return (
    <div className="rounded-md border p-3 space-y-2">
      <p className="text-sm font-medium">Composição do saldo</p>
      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Valor do documento</dt>
          <dd className="tabular-nums">{formatBRL(saldo.valor_documento)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">(−) Recebido em conta</dt>
          <dd className="tabular-nums">{formatBRL(saldo.alocado_conta)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">(−) Parcelas de acerto em aberto</dt>
          <dd className="tabular-nums">{formatBRL(saldo.filhos_abertos)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t pt-1 font-medium">
          <dt>(=) Saldo a receber</dt>
          <dd className="tabular-nums">{formatBRL(saldo.saldo_a_receber)}</dd>
        </div>
      </dl>
      {n > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[11px] text-muted-foreground">Parcelas de acerto em aberto</p>
          {filhosQ.isError && (
            <p className="text-[11px] text-destructive">
              {(filhosQ.error as Error).message}
            </p>
          )}
          {(filhosQ.data ?? []).map((f) => (
            <Link
              key={f.id}
              to={urlTitulo(f.id)}
              className="flex items-center justify-between gap-3 rounded border px-2 py-1 text-xs hover:bg-muted/50"
            >
              <span className="font-mono">{f.numero_titulo ?? "—"}</span>
              <span className="text-muted-foreground">
                venc. {formatDateBR(f.data_vencimento_atual)}
              </span>
              <span className="tabular-nums">{formatBRL(f.valor)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
