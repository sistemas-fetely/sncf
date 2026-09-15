import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ticket } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import {
  AbrirChamadoPedidoDialog,
  CHAVE_CHAMADOS_PEDIDO,
} from "@/components/pedidos/AbrirChamadoPedidoDialog";

/**
 * FASE 2 — chamados abertos a partir deste pedido. RLS decide o que cada um vê;
 * erro (inclusive de permissão) aparece em Alert, nunca em silêncio.
 */

export interface ChamadoDoPedido {
  id: string;
  numero: string | null;
  tipo: string | null;
  status: string | null;
  criado_em: string | null;
  resolvido_em: string | null;
  assunto: { nome: string | null } | null;
  cadeira: { nome: string | null } | null;
}

const FINALIZADOS = ["resolvido", "fechado", "cancelado"];

export function useChamadosDoPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: [CHAVE_CHAMADOS_PEDIDO, pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<ChamadoDoPedido[]> => {
      const { data, error } = await supabase
        .from("chamado")
        .select(
          "id, numero, tipo, status, criado_em, resolvido_em, assunto:demanda_assunto(nome), cadeira:departamentos!chamado_cadeira_atual_id_fkey(nome)",
        )
        .eq("pedido_id", pedidoId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ChamadoDoPedido[];
    },
  });
}

export function chamadosNaoFinalizados(lista: ChamadoDoPedido[] | undefined): number {
  return (lista ?? []).filter((c) => !FINALIZADOS.includes(c.status ?? "")).length;
}

const FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function fmt(d: string | null): string {
  if (!d) return "—";
  try {
    return FMT.format(new Date(d));
  } catch {
    return d;
  }
}

export function ChamadosPedidoTab({
  pedidoId,
  pedidoIdExterno,
}: {
  pedidoId: string;
  pedidoIdExterno: string | null;
}) {
  const [open, setOpen] = useState(false);
  const chamados = useChamadosDoPedido(pedidoId);
  const lista = chamados.data ?? [];

  const botao = (
    <Button size="sm" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
      <Ticket className="h-4 w-4" />
      Abrir chamado
    </Button>
  );

  return (
    <div className="space-y-3">
      {chamados.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar os chamados deste pedido: {formatError(chamados.error)}
          </AlertDescription>
        </Alert>
      ) : chamados.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone={Ticket}
          titulo="Nenhum chamado neste pedido"
          mensagem="Abra um chamado quando precisar da ajuda de outra área para este pedido."
          acao={botao}
        />
      ) : (
        <>
          <div className="flex justify-end">{botao}</div>
          <div className="space-y-2">
            {lista.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/chamados/${c.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {c.numero ?? "chamado"}
                    </Link>
                    <span className="text-sm text-foreground">{c.assunto?.nome ?? "—"}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {[
                      c.cadeira?.nome ?? "sem área",
                      `aberto em ${fmt(c.criado_em)}`,
                      c.resolvido_em ? `resolvido em ${fmt(c.resolvido_em)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Badge variant={FINALIZADOS.includes(c.status ?? "") ? "secondary" : "outline"}>
                  {c.status ?? "—"}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}

      {pedidoIdExterno && (
        <AbrirChamadoPedidoDialog
          pedidoId={pedidoId}
          pedidoIdExterno={pedidoIdExterno}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </div>
  );
}
