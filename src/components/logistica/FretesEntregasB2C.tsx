import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Filtro = "todos" | "entregue" | "pendente";

interface Props {
  transportadoraId: string;
  transportadoraNome?: string;
}

interface EnvioB2C {
  fonte_id: string;
  data_evento: string | null;
  custo_frete: number | null;
  uf_destino: string | null;
  municipio_destino: string | null;
  rastreio: string | null;
  documento_ref: string | null;
  entregue: boolean | null;
  devolucao: boolean | null;
  status_texto: string | null;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function destino(f: { municipio_destino: string | null; uf_destino: string | null }) {
  if (f.municipio_destino || f.uf_destino) {
    return `${f.municipio_destino ?? "—"}${f.uf_destino ? "/" + f.uf_destino : ""}`;
  }
  return "—";
}

function useEnviosB2C(transportadoraId: string) {
  return useQuery({
    queryKey: ["logistica", "envios-b2c-canonico", transportadoraId],
    queryFn: async (): Promise<EnvioB2C[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [fatoRes, rastreioRes] = await Promise.all([
        sb.from("vw_fato_frete")
          .select("fonte_id, data_evento, custo_frete, uf_destino, municipio_destino, rastreio, documento_ref, canal, fonte")
          .eq("transportadora_id", transportadoraId)
          .eq("canal", "b2c")
          .eq("fonte", "postagem")
          .order("data_evento", { ascending: false, nullsFirst: false }),
        sb.from("vw_logistica_rastreio")
          .select("fonte_id, entregue, devolucao, status_texto, canal")
          .eq("transportadora_id", transportadoraId)
          .eq("canal", "b2c"),
      ]);
      if (fatoRes.error) throw fatoRes.error;
      if (rastreioRes.error) throw rastreioRes.error;
      const statusPorId = new Map<string, { entregue: boolean | null; devolucao: boolean | null; status_texto: string | null }>();
      for (const r of rastreioRes.data ?? []) {
        if (r.fonte_id) statusPorId.set(r.fonte_id, { entregue: r.entregue, devolucao: r.devolucao, status_texto: r.status_texto });
      }
      return (fatoRes.data ?? []).map((r: {
        fonte_id: string;
        data_evento: string | null;
        custo_frete: number | null;
        uf_destino: string | null;
        municipio_destino: string | null;
        rastreio: string | null;
        documento_ref: string | null;
      }) => {
        const s = statusPorId.get(r.fonte_id);
        return {
          fonte_id: r.fonte_id,
          data_evento: r.data_evento,
          custo_frete: r.custo_frete,
          uf_destino: r.uf_destino,
          municipio_destino: r.municipio_destino,
          rastreio: r.rastreio,
          documento_ref: r.documento_ref,
          entregue: s?.entregue ?? null,
          devolucao: s?.devolucao ?? null,
          status_texto: s?.status_texto ?? null,
        };
      });
    },
    staleTime: 60 * 1000,
  });
}

export function FretesEntregasB2C({ transportadoraId }: Props) {
  const { data: envios = [], isLoading } = useEnviosB2C(transportadoraId);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const kpis = useMemo(() => {
    let entregues = 0, devolucoes = 0, total = 0;
    for (const f of envios) {
      if (f.entregue === true) entregues++;
      if (f.devolucao === true) devolucoes++;
      total += Number(f.custo_frete ?? 0);
    }
    return { entregues, devolucoes, total, count: envios.length };
  }, [envios]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return envios.filter((f) => {
      if (filtro === "entregue" && f.entregue !== true) return false;
      if (filtro === "pendente" && f.entregue === true) return false;
      if (q) {
        const alvo = `${f.documento_ref ?? ""} ${f.municipio_destino ?? ""} ${f.rastreio ?? ""}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [envios, filtro, busca]);

  function toggle(k: Filtro) { setFiltro((a) => (a === k ? "todos" : k)); }

  const kpiData: Array<{ key: Filtro; label: string; value: string; cls: string }> = [
    { key: "entregue", label: "Entregues", value: String(kpis.entregues), cls: "border-success/40 hover:bg-success/5" },
    { key: "pendente", label: "Pendentes", value: String(Math.max(kpis.count - kpis.entregues, 0)), cls: "border-warning/40 hover:bg-warning/5" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {kpiData.map((k) => (
          <button
            key={k.key}
            onClick={() => toggle(k.key)}
            className={cn("rounded-lg border bg-card p-3 text-left transition", k.cls, filtro === k.key && "ring-2 ring-primary")}
          >
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
          </button>
        ))}
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Total envios</div>
          <div className="text-2xl font-semibold tabular-nums">{kpis.count}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Frete total</div>
          <div className="text-2xl font-semibold tabular-nums">{BRL.format(kpis.total)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por pedido, destino ou rastreio…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Sem envios para os filtros atuais.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Data</th>
                  <th className="text-left p-2">Pedido</th>
                  <th className="text-left p-2">Destino</th>
                  <th className="text-left p-2">Rastreio</th>
                  <th className="text-right p-2">Frete</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((f) => (
                  <tr key={f.fonte_id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{fmtData(f.data_evento)}</td>
                    <td className="p-2 font-medium">{f.documento_ref ?? "—"}</td>
                    <td className="p-2">{destino(f)}</td>
                    <td className="p-2 font-mono text-xs">{f.rastreio ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">{BRL.format(Number(f.custo_frete ?? 0))}</td>
                    <td className="p-2">
                      {f.entregue ? (
                        <Badge variant="outline" className="text-success border-success/40">Entregue</Badge>
                      ) : f.devolucao ? (
                        <Badge variant="outline" className="text-destructive border-destructive/40">Devolução</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">{f.status_texto ?? "Pendente"}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
