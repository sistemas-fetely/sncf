import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { useKpiConsignado } from "./VisaoConsignado";

/** Painel geral do consignado: quatro cartões consolidados de vw_consignado_kpi_parceiro. */

const num = (v: unknown) => Number(v ?? 0);
const pct = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function CartaoMetrica({ titulo, valor, subtitulo }: { titulo: string; valor: string; subtitulo?: string }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-xl font-medium tabular-nums">{valor}</p>
        {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
      </CardContent>
    </Card>
  );
}

export function PainelGeralConsignados() {
  const kpiQ = useKpiConsignado();

  const totais = useMemo(() => {
    const t = { capital: 0, receita: 0, margem: 0, remessa: 0 };
    for (const r of kpiQ.data ?? []) {
      t.capital += num(r.capital_parado);
      t.receita += num(r.receita);
      t.margem += num(r.margem_bruta);
      t.remessa += num(r.valor_remessa);
    }
    return t;
  }, [kpiQ.data]);

  if (kpiQ.isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (kpiQ.isError) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Falha ao carregar o painel: {(kpiQ.error as Error)?.message}
        </AlertDescription>
      </Alert>
    );
  }

  const margemPct = totais.receita > 0 ? (totais.margem / totais.receita) * 100 : 0;
  const giroMedio = totais.remessa > 0 ? (totais.receita / totais.remessa) * 100 : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
      <CartaoMetrica titulo="Capital parado total" valor={formatBRL(totais.capital)} subtitulo="custo em prateleira" />
      <CartaoMetrica titulo="Receita acumulada" valor={formatBRL(totais.receita)} />
      <CartaoMetrica titulo="Margem acumulada" valor={`${formatBRL(totais.margem)} · ${pct(margemPct)}`} />
      <CartaoMetrica titulo="Giro médio ponderado" valor={pct(giroMedio)} subtitulo="receita ÷ valor remetido" />
    </div>
  );
}
