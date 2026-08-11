/**
 * Resumo da carteira Safra (conferência) — somente leitura.
 * Lê `safra_carteira_conferencia` e `vw_safra_carteira_divergencia`.
 * Não corrige nada: divergência é decisão humana, tratada na Auditoria.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const DIAGNOSTICO_ROTULO: Record<string, string> = {
  ok: "Conferido",
  pago_no_banco_aberto_no_sncf: "Pago no banco, aberto no SNCF",
  liquidado_sem_titulo: "Liquidado sem título",
  boleto_sem_titulo: "Boleto sem título",
  pago_no_sncf_aberto_no_banco: "Pago no SNCF, aberto no banco",
  valor_divergente: "Valor divergente",
};

type Props = { contaId: string; dataReferencia: string };

export function ResumoSafraCarteira({ contaId, dataReferencia }: Props) {
  const carteira = useQuery({
    queryKey: ["safra-carteira-conf", contaId, dataReferencia],
    enabled: !!contaId && !!dataReferencia,
    queryFn: async () => {
      const { data, error } = await sb
        .from("safra_carteira_conferencia")
        .select("situacao, valor_boleto, valor_recebido")
        .eq("conta_bancaria_id", contaId)
        .eq("data_referencia", dataReferencia);
      if (error) throw error;
      return (data || []) as {
        situacao: string | null;
        valor_boleto: number | null;
        valor_recebido: number | null;
      }[];
    },
  });

  const divergencia = useQuery({
    queryKey: ["safra-carteira-divergencia", dataReferencia],
    enabled: !!dataReferencia,
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_safra_carteira_divergencia")
        .select("diagnostico, valor_boleto, valor_recebido, delta_valor")
        .eq("data_referencia", dataReferencia);
      if (error) throw error;
      return (data || []) as {
        diagnostico: string | null;
        valor_boleto: number | null;
        valor_recebido: number | null;
        delta_valor: number | null;
      }[];
    },
  });

  if (carteira.isError || divergencia.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Falha ao ler a conferência da carteira</AlertTitle>
        <AlertDescription className="text-xs">
          {(carteira.error as Error)?.message || (divergencia.error as Error)?.message}
        </AlertDescription>
      </Alert>
    );
  }

  const linhas = carteira.data || [];
  if (linhas.length === 0) return null;

  const grupo = (chave: string) =>
    linhas.filter((l) => (l.situacao || "").toUpperCase().startsWith(chave));
  const abertos = grupo("ABERTO");
  const liquidados = grupo("LIQUID");

  const somaBoleto = (arr: typeof linhas) =>
    arr.reduce((s, l) => s + Number(l.valor_boleto || 0), 0);
  const somaRecebido = (arr: typeof linhas) =>
    arr.reduce((s, l) => s + Number(l.valor_recebido || 0), 0);

  const porDiagnostico = new Map<string, { qtde: number; valor: number }>();
  for (const d of divergencia.data || []) {
    const k = d.diagnostico || "sem_diagnostico";
    const atual = porDiagnostico.get(k) || { qtde: 0, valor: 0 };
    const valor = Number(
      d.valor_recebido || d.valor_boleto || Math.abs(Number(d.delta_valor || 0))
    );
    porDiagnostico.set(k, { qtde: atual.qtde + 1, valor: atual.valor + valor });
  }
  const problemas = Array.from(porDiagnostico.entries()).filter(([k]) => k !== "ok");
  const totalProblema = problemas.reduce((s, [, v]) => s + v.valor, 0);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-xs text-muted-foreground">
            Conferência da carteira Safra em{" "}
            <span className="font-medium text-foreground">{formatDateBR(dataReferencia)}</span> —
            este relatório não escreve no extrato e não dá baixa em título.
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">ABERTO</div>
              <div className="text-lg font-semibold">{abertos.length}</div>
              <div className="text-xs text-muted-foreground">
                {formatBRL(somaBoleto(abertos))} em boletos
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">LIQUIDAÇÃO</div>
              <div className="text-lg font-semibold">{liquidados.length}</div>
              <div className="text-xs text-muted-foreground">
                {formatBRL(somaRecebido(liquidados))} recebidos
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total na carteira</div>
              <div className="text-lg font-semibold">{linhas.length}</div>
              <div className="text-xs text-muted-foreground">
                {formatBRL(somaBoleto(linhas))} em boletos
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {Array.from(porDiagnostico.entries()).map(([k, v]) => (
              <Badge
                key={k}
                variant={k === "ok" ? "outline" : "destructive"}
                className={k === "ok" ? "bg-success/10 text-success border-success/30" : ""}
              >
                {DIAGNOSTICO_ROTULO[k] || k}: {v.qtde}
              </Badge>
            ))}
            {porDiagnostico.size === 0 && (
              <span className="text-xs text-muted-foreground">
                Sem comparação disponível para esta data de referência.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {problemas.length > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>
            {problemas.reduce((s, [, v]) => s + v.qtde, 0)} divergência(s) entre banco e SNCF —{" "}
            {formatBRL(totalProblema)} envolvidos
          </AlertTitle>
          <AlertDescription className="space-y-2 text-xs">
            <ul className="space-y-1">
              {problemas.map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium">{DIAGNOSTICO_ROTULO[k] || k}</span>: {v.qtde} caso(s)
                  · {formatBRL(v.valor)}
                </li>
              ))}
            </ul>
            <div>
              Correção é decisão humana — trate cada caso na{" "}
              <Link to="/administrativo/auditoria" className="underline font-medium">
                Auditoria
              </Link>
              .
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
