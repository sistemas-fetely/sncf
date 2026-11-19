import { CodProduto } from "@/components/produto/CodProduto";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Selo } from "@/components/ui/selo";
import { formatBRL } from "@/lib/format-currency";
import type { PedidoB2cRow } from "@/hooks/vendas/useB2c";
import { rawMessage } from "@/lib/format-error";

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">{rotulo}</p>
        <p className="mt-1 font-display text-2xl font-normal tabular-nums">{valor}</p>
        {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}

interface DashB2cDados {
  receita_mes: number;
  pedidos_mes: number;
  ticket: number;
  taxa_mp: number;
  liquido_mp: number;
  ufs: { uf: string; qtd: number; valor: number }[];
  farol: { no_prazo: number; atencao: number; estourado: number };
  top_skus: { sku: string; nome: string | null; qtd: number }[];
}

// KPI-NO-BANCO: soma, contagem e top-N vêm prontos de fn_dash_b2c; a prop `pedidos` não entra no número.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function DashB2c({ pedidos, isLoading }: { pedidos: PedidoB2cRow[]; isLoading: boolean }) {
  const dashQ = useQuery({
    queryKey: ["b2c-dash"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DashB2cDados> => {
      const { data, error } = await supabase.rpc("fn_dash_b2c" as never);
      if (error) throw error;
      if (!data) throw new Error("fn_dash_b2c não devolveu resultado.");
      return data as unknown as DashB2cDados;
    },
  });
  const d = dashQ.data;
  const kpis = {
    receitaMes: Number(d?.receita_mes ?? 0),
    pedidosMes: Number(d?.pedidos_mes ?? 0),
    ticket: Number(d?.ticket ?? 0),
    taxaMp: Number(d?.taxa_mp ?? 0),
    liquidoMp: Number(d?.liquido_mp ?? 0),
    ufs: d?.ufs ?? [],
    farol: d?.farol ?? { no_prazo: 0, atencao: 0, estourado: 0 },
  };
  const topSkus = d?.top_skus;

  if (dashQ.isError) {
    return <p className="text-sm text-destructive">{rawMessage(dashQ.error)}</p>;
  }

  if (isLoading || dashQ.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          rotulo="Receita do mês"
          valor={formatBRL(kpis.receitaMes)}
          nota={`${kpis.pedidosMes} pedido(s) neste mês`}
        />
        <Kpi rotulo="Ticket médio" valor={formatBRL(kpis.ticket)} nota="Todos os pedidos não cancelados" />
        <Kpi
          rotulo="Taxa MP consolidada"
          valor={formatBRL(kpis.taxaMp)}
          nota={`Líquido recebido ${formatBRL(kpis.liquidoMp)}`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Mix por UF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {kpis.ufs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados.</p>
            ) : (
              kpis.ufs.map((u) => (
                <div key={u.uf} className="flex items-center justify-between text-xs">
                  <span>
                    {u.uf} <span className="text-muted-foreground">· {u.qtd}</span>
                  </span>
                  <span className="tabular-nums">{formatBRL(u.valor)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top SKUs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(topSkus ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados.</p>
            ) : (
              (topSkus ?? []).map((s) => (
                <div key={s.sku} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">
                    <CodProduto chave={s.sku} variant="compacto" />{" "}
                    <span className="text-muted-foreground">{s.nome ?? ""}</span>
                  </span>
                  <span className="tabular-nums">{s.qtd}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">SLA da XPM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <Selo estado="success">No prazo</Selo>
              <span className="tabular-nums">{kpis.farol.no_prazo}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Selo estado="warning">Atenção</Selo>
              <span className="tabular-nums">{kpis.farol.atencao}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Selo estado="destructive">Estourado</Selo>
              <span className="tabular-nums">{kpis.farol.estourado}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
