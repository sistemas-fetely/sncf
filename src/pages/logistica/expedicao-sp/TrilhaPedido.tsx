import { Card, CardContent } from "@/components/ui/card";
import { fmtDataHora } from "@/lib/data";
import type { EventoMesa } from "./tipos";

/**
 * Trilha lateral — a biografia do pedido na mesa, lida de `pedido_eventos`.
 * Só mostra o que foi gravado: nenhuma etapa é desenhada "por dedução".
 */
export function TrilhaPedido({ eventos }: { eventos: EventoMesa[] }) {
  const ordenados = [...eventos].sort((a, b) => b.criado_em.localeCompare(a.criado_em));

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-medium">Trilha do pedido</p>
        {ordenados.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada registrado ainda — o primeiro gesto na bancada abre a trilha.
          </p>
        ) : (
          <ol className="space-y-3">
            {ordenados.map((e) => (
              <li key={e.id} className="border-l-2 border-border pl-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {e.tipo_evento}
                </p>
                <p className="text-sm">{e.descricao ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{fmtDataHora(e.criado_em)}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
