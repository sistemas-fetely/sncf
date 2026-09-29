import { usePedidoFreteReal } from "@/hooks/pedidos/usePedidoFreteReal";

function fonteLegivel(fonte: string | null): string {
  const partes = (fonte ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const map: Record<string, string> = { postagem: "Correios", transp: "CT-e" };
  const legivel = partes.map((p) => map[p] ?? p);
  if (legivel.length === 0) return "—";
  return legivel.join(" + ");
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CustoRealFreteBloco({ pedidoId }: { pedidoId: string | undefined }) {
  const { data, isLoading, error } = usePedidoFreteReal(pedidoId);

  if (isLoading) {
    return (
      <div className="border-t pt-3 space-y-1.5">
        <div className="h-3 w-40 rounded bg-muted animate-pulse" />
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t pt-3">
        <p className="text-xs text-destructive">
          Erro ao carregar custo real: {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  const temCusto = data?.custo_real != null;
  const margem = data?.margem_frete;
  const desvio = data?.desvio_estimativa;
  const custo = temCusto ? Number(data!.custo_real) : null;
  const mostrarDesvio =
    data?.estimativa_comparavel === true && data.frete_estimado != null && custo != null && custo > 0;
  const pctDesvio = mostrarDesvio ? (desvio! / custo!) * 100 : null;

  return (
    <div className="border-t border-border/40 pt-3 space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Custo real do frete</p>

      {!temCusto ? (
        <p className="text-xs text-muted-foreground">
          Sem custo real ainda — aparece quando o CT-e ou a postagem dos Correios entra no sistema.
        </p>
      ) : (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">Custo real</span>
            <span className="text-sm font-medium tabular-nums">
              {brl(custo!)}{" "}
              <span className="text-[10px] font-normal text-muted-foreground">
                · {fonteLegivel(data!.custo_fonte)} · {data!.custo_docs ?? 0} doc(s)
              </span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">Cobrado do cliente</span>
            <span className="text-sm tabular-nums">
              {data!.frete_cobrado != null ? brl(Number(data!.frete_cobrado)) : "—"}
            </span>
          </div>
          {margem != null && (
            <div className="flex flex-col items-end">
              <div className="flex items-baseline justify-between gap-2 w-full">
                <span className="text-xs text-muted-foreground">Margem do frete</span>
                <span className={`text-sm font-medium tabular-nums ${margem >= 0 ? "text-success" : "text-destructive"}`}>
                  {brl(Number(margem))}
                </span>
              </div>
              {margem < 0 && (
                <p className="text-[10px] text-muted-foreground">Frete subsidiado pela Fetely</p>
              )}
            </div>
          )}
          {mostrarDesvio && pctDesvio != null && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Estimativa × real</span>
              <span className={`text-sm tabular-nums ${Math.abs(pctDesvio) > 20 ? "text-warning" : ""}`}>
                {desvio! < 0 ? "−" : "+"}
                {brl(Math.abs(Number(desvio!)))}
                <span className="text-[10px] text-muted-foreground ml-1">
                  ({pctDesvio < 0 ? "−" : "+"}
                  {Math.abs(pctDesvio).toFixed(1)}%)
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
