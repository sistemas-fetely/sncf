import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PixQrCodePortao } from "@/components/pedidos/PixQrCodePortao";
import { ConfirmarPortaoPagoDialog } from "@/components/pedidos/dialogs/ConfirmarPortaoPagoDialog";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "—";

interface Provisao {
  id: string;
  pedido_id: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  valor: number | string | null;
  data_prevista: string | null;
  tipo_pagamento: string | null;
  eh_entrada: boolean | null;
  eh_portao: boolean | null;
  condicao_pagamento: string | null;
  status: string | null;
  pago_em: string | null;
}

interface PortaoRow {
  id: string;
  provisao_id: string | null;
  tipo_pagamento: string | null;
  link_pagamento: string | null;
  pix_txid: string | null;
  valor: number | string | null;
  status: string | null;
}

function EstadoLinha({ p }: { p: Provisao }) {
  const pago = p.status === "pago" || !!p.pago_em;
  if (pago) {
    return (
      <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
        Pago {p.pago_em ? `em ${fmtDate(p.pago_em)}` : ""}
      </Badge>
    );
  }
  return <Badge variant="secondary" className="text-[10px]">Pendente</Badge>;
}

export function PortaoLinksPanel({ pedidoId }: { pedidoId: string }) {
  const provisoesQ = useQuery({
    queryKey: ["provisoes-pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("provisao_recebimento")
        .select(
          "id, pedido_id, numero_parcela, total_parcelas, valor, data_prevista, tipo_pagamento, eh_entrada, eh_portao, condicao_pagamento, status, pago_em",
        )
        .eq("pedido_id", pedidoId)
        .order("numero_parcela", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Provisao[];
    },
  });

  const provisoes = provisoesQ.data ?? [];
  const idsPortao = provisoes.filter((p) => p.eh_portao).map((p) => p.id);

  const portoesQ = useQuery({
    queryKey: ["portoes-por-provisao", pedidoId, idsPortao.join(",")],
    enabled: idsPortao.length > 0,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_portao")
        .select("id, provisao_id, tipo_pagamento, link_pagamento, pix_txid, valor, status")
        .in("provisao_id", idsPortao);
      if (error) throw error;
      const map = new Map<string, PortaoRow>();
      ((data ?? []) as PortaoRow[]).forEach((r) => {
        if (r.provisao_id) map.set(r.provisao_id, r);
      });
      return map;
    },
  });

  if (provisoesQ.isLoading) return <Skeleton className="h-32 w-full" />;

  if (provisoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum plano de pagamento montado para este pedido.</p>;
  }

  const linhasPortao = provisoes.filter((p) => p.eh_portao);
  const pendentesPortao = linhasPortao.filter((p) => p.status !== "pago" && !p.pago_em);
  const totalPortao = linhasPortao.reduce((a, p) => a + Number(p.valor ?? 0), 0);
  const faltandoPortao = pendentesPortao.reduce((a, p) => a + Number(p.valor ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-foreground">Composição de pagamento</h4>
        <p className="text-xs text-muted-foreground mt-1">
          {linhasPortao.length === 0 ? (
            "Nenhuma linha de portão — o pedido não depende de pagamento à vista para ser liberado."
          ) : pendentesPortao.length === 0 ? (
            <>Todas as {linhasPortao.length} linha(s) de portão estão pagas ({fmtBRL.format(totalPortao)}).</>
          ) : (
            <>
              {linhasPortao.length} linha(s) de portão somando {fmtBRL.format(totalPortao)} —
              faltam {pendentesPortao.length} ({fmtBRL.format(faltandoPortao)}) para liberar o pedido.
            </>
          )}
        </p>
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Parcela</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {provisoes.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.numero_parcela ?? "—"}
                  {p.eh_portao && <Badge variant="secondary" className="ml-2 text-[10px]">Portão</Badge>}
                </TableCell>
                <TableCell className="capitalize">{p.tipo_pagamento ?? "—"}</TableCell>
                <TableCell>{fmtBRL.format(Number(p.valor ?? 0))}</TableCell>
                <TableCell>{fmtDate(p.data_prevista)}</TableCell>
                <TableCell><EstadoLinha p={p} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {linhasPortao.map((p) => {
        const portao = portoesQ.data?.get(p.id);
        const pago = p.status === "pago" || !!p.pago_em;
        return (
          <div key={p.id} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-medium">
                  Portão · parcela {p.numero_parcela ?? "—"} · {fmtBRL.format(Number(p.valor ?? 0))}
                </span>
                <span className="text-xs text-muted-foreground ml-2 capitalize">
                  {p.tipo_pagamento ?? "—"} · vence {fmtDate(p.data_prevista)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <EstadoLinha p={p} />
                {!pago && (
                  <ConfirmarPortaoPagoDialog
                    pedido_id={p.pedido_id}
                    provisao_id={p.id}
                    valor={Number(p.valor ?? 0)}
                    forma={p.tipo_pagamento}
                    numero_parcela={p.numero_parcela}
                    variante="discreta"
                  />
                )}
              </div>
            </div>

            {p.tipo_pagamento === "pix" && portao?.id && (
              <PixQrCodePortao
                portaoId={portao.id}
                pedidoId={p.pedido_id}
                tipoPagamento={p.tipo_pagamento}
                linkPagamento={portao.link_pagamento}
                pixTxid={portao.pix_txid}
                valor={Number(p.valor ?? 0)}
              />
            )}

            {p.tipo_pagamento === "pix" && !portao?.id && (
              <p className="text-xs text-muted-foreground">
                Cobrança PIX ainda não gerada para esta linha.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
