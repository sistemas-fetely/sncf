import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CardIndicador } from "@/components/ui/card-indicador";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import CadastroPedidoCompra from "@/pages/acervo/CadastroPedidoCompra";
import EmbarquesTab from "@/components/compras/EmbarquesTab";

export interface EmbarquePainelRow {
  embarque_id: number;
  ref_rocabella: string;
  status_id: number | null;
  status_codigo: string | null;
  status_ordem: number | null;
  eta: string | null;
  data_chegada: string | null;
  dias_para_eta: number | null;
  alerta_data: "entregue_sem_data" | "eta_vencida" | null;
  no_mar: boolean | null;
  valor_fob_usd: number | null;
  conteineres: number | null;
}

export function useEmbarquePainel() {
  return useQuery({
    queryKey: ["vw_importacao_embarque_painel"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_embarque_painel")
        .select(
          "embarque_id,ref_rocabella,status_id,status_codigo,status_ordem,eta,data_chegada,dias_para_eta,alerta_data,no_mar,valor_fob_usd,conteineres",
        );
      if (error) throw error;
      return (data ?? []) as EmbarquePainelRow[];
    },
  });
}

const FMT_USD = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

function ddMM(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

export default function PainelTab() {
  const [params, setParams] = useSearchParams();
  const visao = params.get("visao") === "embarque" ? "embarque" : "pedido";
  const q = useEmbarquePainel();

  const kpi = useMemo(() => {
    const rows = q.data ?? [];
    const noMar = rows.filter((r) => r.no_mar);
    const proxima = rows
      .filter((r) => !r.data_chegada && r.eta && (r.dias_para_eta ?? -1) >= 0)
      .sort((a, b) => (a.eta ?? "").localeCompare(b.eta ?? ""))[0];
    return {
      noMar: noMar.length,
      cont: noMar.reduce((a, r) => a + (r.conteineres ?? 0), 0),
      valor: noMar.reduce((a, r) => a + (r.valor_fob_usd ?? 0), 0),
      proxima,
      furada: rows.filter((r) => r.alerta_data).length,
    };
  }, [q.data]);

  const setVisao = (v: string, extra?: Record<string, string>) => {
    if (!v) return;
    const next = new URLSearchParams(params);
    next.set("visao", v);
    if (v !== "embarque") next.delete("furada");
    Object.entries(extra ?? {}).forEach(([k, val]) => next.set(k, val));
    setParams(next, { replace: true });
  };

  const carregando = q.isLoading ? "…" : undefined;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        O que está vindo, quando e em que pé. Clique numa linha para ver o detalhe.
      </p>

      {q.isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar os indicadores: {(q.error as Error)?.message}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardIndicador
          rotulo="No mar"
          valor={carregando ?? kpi.noMar}
          nota={`${kpi.cont} contêiner(es)`}
          compacto
        />
        <CardIndicador
          rotulo="Valor embarcado"
          valor={carregando ?? FMT_USD.format(kpi.valor)}
          nota="FOB dos embarques no mar"
          compacto
        />
        <CardIndicador
          rotulo="Próxima chegada"
          valor={
            carregando ?? (kpi.proxima ? `${kpi.proxima.ref_rocabella} · ${ddMM(kpi.proxima.eta)}` : "—")
          }
          nota={kpi.proxima ? `em ${kpi.proxima.dias_para_eta} dias` : "nenhuma ETA futura em aberto"}
          compacto
        />
        <button
          type="button"
          className="rounded-lg text-left transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setVisao("embarque", { furada: "1" })}
        >
          <CardIndicador
            rotulo="Data furada"
            valor={carregando ?? kpi.furada}
            nota="ETA vencida ou entregue sem data"
            tom={kpi.furada > 0 ? "atencao" : "neutro"}
            ativo={params.get("furada") === "1"}
            compacto
            className="h-full"
          />
        </button>
      </div>

      <ToggleGroup
        type="single"
        value={visao}
        onValueChange={(v) => setVisao(v)}
        className="justify-start"
      >
        <ToggleGroupItem value="pedido" size="sm">
          Por pedido
        </ToggleGroupItem>
        <ToggleGroupItem value="embarque" size="sm">
          Por embarque
        </ToggleGroupItem>
      </ToggleGroup>

      {visao === "pedido" ? <CadastroPedidoCompra vista="acompanhamento" /> : <EmbarquesTab />}
    </div>
  );
}
