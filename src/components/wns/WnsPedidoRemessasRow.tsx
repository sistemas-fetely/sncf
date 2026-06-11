import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useWnsLinhasDoPedido, useWnsFases, type WnsLinha } from "@/hooks/wns/useWnsPedidos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function corDaFase(seq: number | undefined) {
  if (!seq) return "secondary";
  if (seq <= 3) return "default";
  if (seq <= 5) return "outline";
  return "default";
}

export function WnsPedidoRemessasRow({ pedidowns, colSpan }: { pedidowns: number; colSpan: number }) {
  const { data: linhas, isLoading } = useWnsLinhasDoPedido(pedidowns);
  const { data: fases } = useWnsFases();

  const remessas = (() => {
    const map = new Map<number, WnsLinha[]>();
    (linhas ?? []).forEach((l) => {
      const k = l.prefaturamento_xpm;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(l);
    });
    return Array.from(map.entries())
      .map(([prefatXpm, items]) => {
        const evento = items[0]?.evento_wns_id ?? null;
        const fase = fases?.find((f) => f.wns_id === evento);
        return {
          prefaturamento_xpm: prefatXpm,
          fase,
          nota_numero: items.find((i) => i.nota_numero)?.nota_numero ?? null,
          linhas: items.length,
          quantidade: items.reduce((s, i) => s + (i.quantidade ?? 0), 0),
          total: items.reduce((s, i) => s + (i.total ?? 0), 0),
        };
      })
      .sort((a, b) => a.prefaturamento_xpm - b.prefaturamento_xpm);
  })();

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/40">
      <TableCell colSpan={colSpan} className="p-0">
        <div className="px-6 py-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando remessas…
            </div>
          ) : remessas.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem remessas.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-1.5 font-medium">Remessa</th>
                  <th className="py-1.5 font-medium">Fase</th>
                  <th className="py-1.5 font-medium">NF</th>
                  <th className="py-1.5 font-medium text-right">Linhas</th>
                  <th className="py-1.5 font-medium text-right">Qtd</th>
                  <th className="py-1.5 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {remessas.map((r) => (
                  <tr key={r.prefaturamento_xpm} className="border-b last:border-0">
                    <td className="py-1.5 font-mono text-xs">{r.prefaturamento_xpm}</td>
                    <td className="py-1.5">
                      {r.fase ? (
                        <Badge variant={corDaFase(r.fase.sequencia) as "default" | "outline" | "secondary"}>
                          {r.fase.descricao}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">—</Badge>
                      )}
                    </td>
                    <td className="py-1.5 font-mono text-xs">{r.nota_numero ?? "—"}</td>
                    <td className="py-1.5 text-right">{r.linhas}</td>
                    <td className="py-1.5 text-right">{r.quantidade}</td>
                    <td className="py-1.5 text-right font-mono">{BRL.format(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
