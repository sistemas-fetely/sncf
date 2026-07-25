import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFretesB2C } from "@/hooks/logistica/useFretesB2C";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Filtro = "todos" | "enviado" | "sem_pedido";

interface Props {
  carrier: "Correios" | "Frenet";
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function destino(f: { municipio_destino: string | null; uf_destino: string | null; cep_destino: string | null }) {
  if (f.municipio_destino || f.uf_destino) {
    return `${f.municipio_destino ?? "—"}${f.uf_destino ? "/" + f.uf_destino : ""}`;
  }
  return f.cep_destino ?? "—";
}

export function FretesEntregasB2C({ carrier }: Props) {
  const { data: fretes = [], isLoading } = useFretesB2C(carrier);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const kpis = useMemo(() => {
    let enviados = 0, semPedido = 0, total = 0;
    for (const f of fretes) {
      if (f.situacao_frete === "enviado") enviados++;
      if (f.situacao_frete === "sem_pedido") semPedido++;
      total += Number(f.custo_frete ?? 0);
    }
    return { enviados, semPedido, total };
  }, [fretes]);

  const filtrados = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return fretes.filter((f) => {
      if (filtro === "enviado" && f.situacao_frete !== "enviado") return false;
      if (filtro === "sem_pedido" && f.situacao_frete !== "sem_pedido") return false;
      if (buscaLower) {
        const alvo = `${f.order_name ?? ""} ${f.shipping_city ?? ""} ${f.municipio_destino ?? ""} ${f.etiqueta ?? ""}`.toLowerCase();
        if (!alvo.includes(buscaLower)) return false;
      }
      return true;
    });
  }, [fretes, filtro, busca]);

  function toggleFiltro(novo: Filtro) {
    setFiltro((atual) => (atual === novo ? "todos" : novo));
  }

  const kpiData: Array<{ key: Filtro; label: string; value: string; cls: string }> = [
    { key: "enviado", label: "Enviados", value: String(kpis.enviados), cls: "border-success/40 hover:bg-success/5" },
    { key: "sem_pedido", label: "Sem pedido", value: String(kpis.semPedido), cls: "border-destructive/40 hover:bg-destructive/5" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {kpiData.map((k) => (
          <button
            key={k.key}
            onClick={() => toggleFiltro(k.key)}
            className={cn(
              "rounded-lg border bg-card p-3 text-left transition",
              k.cls,
              filtro === k.key && "ring-2 ring-primary"
            )}
          >
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
          </button>
        ))}
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Frete total</div>
          <div className="text-2xl font-semibold tabular-nums">{BRL.format(kpis.total)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por pedido, destinatário ou etiqueta…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando fretes…
        </div>
      ) : fretes.length === 0 ? (
        <div className="border rounded-lg p-10 text-center space-y-3">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhuma postagem {carrier} encontrada.
          </p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
          Nenhum frete corresponde ao filtro.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Etiqueta</th>
                  <th className="px-3 py-2 font-medium">Pedido</th>
                  <th className="px-3 py-2 font-medium">Destino</th>
                  <th className="px-3 py-2 font-medium">Serviço</th>
                  <th className="px-3 py-2 font-medium text-right">Custo</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((f) => {
                  const semPedido = f.situacao_frete === "sem_pedido";
                  return (
                    <tr
                      key={f.lancamento_id}
                      className={cn("border-t", semPedido && "bg-destructive/5")}
                    >
                      <td className="px-3 py-2 tabular-nums">{fmtData(f.data_postagem)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{f.etiqueta ?? "—"}</td>
                      <td className="px-3 py-2">{f.order_name ?? "—"}</td>
                      <td className="px-3 py-2">{destino(f)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.descricao_servico ?? f.codigo_servico ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {f.custo_frete != null ? BRL.format(Number(f.custo_frete)) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {semPedido ? (
                          <Badge variant="destructive">sem pedido</Badge>
                        ) : f.situacao_frete === "enviado" ? (
                          <Badge variant="secondary">enviado</Badge>
                        ) : (
                          <Badge variant="outline">{f.situacao_frete ?? "—"}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
