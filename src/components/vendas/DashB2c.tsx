import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Selo } from "@/components/ui/selo";
import { formatBRL } from "@/lib/format-currency";
import type { PedidoB2cRow } from "@/hooks/vendas/useB2c";
import { parseDataPura } from "@/lib/data";

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

function useTopSkusB2c() {
  return useQuery({
    queryKey: ["b2c-top-skus"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("shopify_itens").select("sku, product_name, quantity");
      if (error) throw error;
      const agg = new Map<string, { sku: string; nome: string | null; qtd: number }>();
      (data ?? []).forEach((it) => {
        const key = it.sku ?? it.product_name ?? "—";
        const atual = agg.get(key);
        if (atual) atual.qtd += Number(it.quantity ?? 0);
        else agg.set(key, { sku: key, nome: it.product_name, qtd: Number(it.quantity ?? 0) });
      });
      return Array.from(agg.values())
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 10);
    },
  });
}

export function DashB2c({ pedidos, isLoading }: { pedidos: PedidoB2cRow[]; isLoading: boolean }) {
  const { data: topSkus } = useTopSkusB2c();

  const kpis = useMemo(() => {
    const agora = new Date();
    const doMes = pedidos.filter((p) => {
      if (!p.data_pedido || p.estagio === "cancelado") return false;
      const d = parseDataPura(p.data_pedido);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    const receitaMes = doMes.reduce((s, p) => s + Number(p.total ?? 0), 0);
    const validos = pedidos.filter((p) => p.estagio !== "cancelado");
    const ticket = validos.length > 0 ? validos.reduce((s, p) => s + Number(p.total ?? 0), 0) / validos.length : 0;
    const taxaMp = pedidos.reduce((s, p) => s + Number(p.taxa_mp ?? 0), 0);
    const liquidoMp = pedidos.reduce((s, p) => s + Number(p.liquido_mp ?? 0), 0);

    const porUf = new Map<string, { qtd: number; valor: number }>();
    validos.forEach((p) => {
      const uf = p.shipping_province ?? "—";
      const atual = porUf.get(uf) ?? { qtd: 0, valor: 0 };
      atual.qtd += 1;
      atual.valor += Number(p.total ?? 0);
      porUf.set(uf, atual);
    });

    const farol = { no_prazo: 0, atencao: 0, estourado: 0 };
    pedidos.forEach((p) => {
      if (p.xpm_farol_sla === "no_prazo") farol.no_prazo += 1;
      else if (p.xpm_farol_sla === "atencao") farol.atencao += 1;
      else if (p.xpm_farol_sla === "estourado") farol.estourado += 1;
    });

    return {
      receitaMes,
      pedidosMes: doMes.length,
      ticket,
      taxaMp,
      liquidoMp,
      ufs: Array.from(porUf.entries())
        .map(([uf, v]) => ({ uf, ...v }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10),
      farol,
    };
  }, [pedidos]);

  if (isLoading) {
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
                    <span className="font-mono">{s.sku}</span>{" "}
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
