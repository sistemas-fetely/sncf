import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PixQrCode } from "@/components/pedidos/PixQrCode";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import { DividirCartoesDialog } from "@/components/pedidos/dialogs/DividirCartoesDialog";
import { useCapturasPedido, rotuloCaptura } from "@/hooks/pedidos/useCapturasPedido";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

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
  link_pagamento: string | null;
  pix_txid: string | null;
  pix_token: string | null;
  pix_qr_url: string | null;
  /** CAPTURA-DE-CARTAO: a qual cartão (captura) a parcela pertence. Nulo = legado. */
  captura_id: string | null;
}


const estaPago = (p: Provisao) => p.status === "pago" || !!p.pago_em;

/**
 * CARTAO-E-CAPTURA-UNICA: parcela de cartão NÃO se confirma sozinha.
 * As parcelas 2..N são datas de repasse da adquirente, não pagamentos do cliente —
 * uma autorização fecha a família inteira, e a prova é o NSU.
 * Só linha não-cartão ganha o botão individual.
 */
const podeConfirmarSozinha = (p: Provisao) => !estaPago(p) && p.tipo_pagamento !== "cartao";

function EstadoLinha({ p }: { p: Provisao }) {
  const pago = estaPago(p);
  if (pago) {
    return (
      <Badge className="text-[10px] bg-success hover:bg-success">
        Pago {p.pago_em ? `em ${fmtDate(p.pago_em)}` : ""}
      </Badge>
    );
  }
  return <Badge variant="secondary" className="text-[10px]">Pendente</Badge>;
}

export function PortaoLinksPanel({ pedidoId }: { pedidoId: string }) {
  // REFERENCIA-SEMPRE: uma só tela de confirmação para todas as linhas do portão.
  const [confirmarLinha, setConfirmarLinha] = useState<{ id: string | null } | null>(null);
  // CAPTURA-DE-CARTAO (22/09/2026): um pedido pode ter N capturas (N cartões).
  const [dividirAberto, setDividirAberto] = useState(false);
  const capturasQ = useCapturasPedido(pedidoId);
  const dinheiroQ = usePermissaoAcaoOuSuperAdmin("acao.pedido_dinheiro");
  const cobrancaQ = usePermissaoAcaoOuSuperAdmin("acao.cobranca_receber");
  const podeDinheiro = dinheiroQ.permitido || cobrancaQ.permitido;
  const provisoesQ = useQuery({
    queryKey: ["provisoes-pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("provisao_recebimento")
        .select(
          "id, pedido_id, numero_parcela, total_parcelas, valor, data_prevista, tipo_pagamento, eh_entrada, eh_portao, condicao_pagamento, status, pago_em, link_pagamento, pix_txid, pix_token, pix_qr_url, captura_id",
        )
        .eq("pedido_id", pedidoId)
        .order("numero_parcela", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Provisao[];
    },
  });

  const provisoes = provisoesQ.data ?? [];
  if (provisoesQ.isLoading) return <Skeleton className="h-32 w-full" />;

  if (provisoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum plano de pagamento montado para este pedido.</p>;
  }

  const linhasPortao = provisoes.filter((p) => p.eh_portao);
  const pendentesPortao = linhasPortao.filter((p) => p.status !== "pago" && !p.pago_em);
  const totalPortao = linhasPortao.reduce((a, p) => a + Number(p.valor ?? 0), 0);
  const faltandoPortao = pendentesPortao.reduce((a, p) => a + Number(p.valor ?? 0), 0);

  // Cartão em 3x é UMA autorização: as parcelas seguintes são repasses da operadora.
  const cartaoAbertas = provisoes.filter(
    (p) => p.tipo_pagamento === "cartao" && p.status !== "pago" && !p.pago_em,
  );
  const cartaoAbertoValor = cartaoAbertas.reduce((a, p) => a + Number(p.valor ?? 0), 0);

  // CAPTURA-DE-CARTAO: o plano de cartão só pode ser redividido enquanto NENHUMA
  // linha de cartão estiver paga — a RPC recusa o resto, aqui é só conveniência.
  const linhasCartao = provisoes.filter((p) => p.tipo_pagamento === "cartao");
  const totalCartao = linhasCartao.reduce((a, p) => a + Number(p.valor ?? 0), 0);
  const podeDividir =
    linhasCartao.length > 0 && !linhasCartao.some((p) => estaPago(p)) && podeDinheiro;

  const capturas = capturasQ.data ?? [];
  const capturaPorId = new Map(capturas.map((c) => [c.id, c]));
  /** Primeira parcela em aberto de cada captura — é por ela que a captura se confirma. */
  const primeiraAbertaDaCaptura = (capturaId: string) =>
    provisoes.find((p) => p.captura_id === capturaId && !estaPago(p)) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-foreground">Composição de pagamento</h4>
        <p className="text-xs text-muted-foreground mt-1">
          {linhasPortao.length === 0 ? (
            provisoes.some((p) => p.tipo_pagamento === "pix")
              ? "Sem portão — o pedido é liberado sem pagamento à vista, mas as linhas PIX abaixo têm cobrança própria."
              : "Nenhuma linha de portão — o pedido não depende de pagamento à vista para ser liberado."
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

      {cartaoAbertas.length > 0 && capturas.length === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            {cartaoAbertas.length} parcela(s) de cartão em aberto · {fmtBRL.format(cartaoAbertoValor)} —
            uma captura fecha todas de uma vez.
          </p>
          <Button size="sm" onClick={() => setConfirmarLinha({ id: null })}>
            Confirmar captura
          </Button>
        </div>
      )}

      {/* CAPTURA-DE-CARTAO: cada cartão se confirma sozinho, com o NSU dele. */}
      {capturas.map((c) => {
        const abertas = provisoes.filter((p) => p.captura_id === c.id && !estaPago(p));
        const alvo = abertas[0] ?? null;
        return (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="text-sm">
              <span className="font-medium">{rotuloCaptura(c)}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {c.nsu ? `NSU ${c.nsu}` : "sem NSU ainda"}
                {abertas.length > 0
                  ? ` · ${abertas.length} parcela(s) em aberto`
                  : " · todas as parcelas confirmadas"}
              </span>
            </div>
            {alvo && podeDinheiro && (
              <Button size="sm" onClick={() => setConfirmarLinha({ id: alvo.id })}>
                Confirmar Cartão {c.ordem ?? "—"}
              </Button>
            )}
          </div>
        );
      })}

      {podeDividir && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            Cliente pagou com mais de um cartão? Cada cartão é uma captura, com NSU próprio.
          </p>
          <Button size="sm" variant="outline" onClick={() => setDividirAberto(true)}>
            Dividir entre cartões
          </Button>
        </div>
      )}



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
            {provisoes.map((p, i) => {
              // CAPTURA-DE-CARTAO: cabeçalho de grupo quando a parcela muda de cartão.
              const captura = p.captura_id ? capturaPorId.get(p.captura_id) : undefined;
              const anterior = i > 0 ? provisoes[i - 1] : null;
              const abreGrupo = !!captura && anterior?.captura_id !== p.captura_id;
              return (
                <Fragment key={p.id}>
                  {abreGrupo && captura && (
                    <TableRow key={`grupo-${captura.id}`} className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={5} className="py-1.5 text-xs font-medium">
                        {rotuloCaptura(captura)}
                        {captura.nsu && (
                          <span className="ml-2 font-normal text-muted-foreground">
                            NSU {captura.nsu}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell className="font-medium">
                      {p.numero_parcela ?? "—"}
                      {p.eh_portao && <Badge variant="secondary" className="ml-2 text-[10px]">Portão</Badge>}
                      {captura && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          Cartão {captura.ordem ?? "—"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{p.tipo_pagamento ?? "—"}</TableCell>
                    <TableCell>{fmtBRL.format(Number(p.valor ?? 0))}</TableCell>
                    <TableCell>{fmtDate(p.data_prevista)}</TableCell>
                    <TableCell><EstadoLinha p={p} /></TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {provisoes
        .filter((p) => p.eh_portao || p.tipo_pagamento === "pix" || podeConfirmarSozinha(p))
        .map((p) => {
          const pago = estaPago(p);
          const ehCartao = p.tipo_pagamento === "cartao";
          return (
            <div key={p.id} className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-medium">
                    {p.eh_portao ? "Portão · " : ""}parcela {p.numero_parcela ?? "—"} ·{" "}
                    {fmtBRL.format(Number(p.valor ?? 0))}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2 capitalize">
                    {p.tipo_pagamento ?? "—"} · vence {fmtDate(p.data_prevista)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <EstadoLinha p={p} />
                  {!pago &&
                    (ehCartao ? (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Fecha pela captura (NSU)
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmarLinha({ id: p.id })}
                      >
                        Confirmar pagamento
                      </Button>
                    ))}
                </div>
              </div>

              {p.tipo_pagamento === "pix" && !pago && (
                <PixQrCode
                  provisaoId={p.id}
                  pedidoId={p.pedido_id}
                  tipoPagamento={p.tipo_pagamento}
                  linkPagamento={p.link_pagamento}
                  pixTxid={p.pix_txid}
                  valor={Number(p.valor ?? 0)}
                />
              )}
            </div>
          );
        })}
      {dividirAberto && (
        <DividirCartoesDialog
          pedidoId={pedidoId}
          totalCartao={totalCartao}
          aberto
          aoFechar={() => setDividirAberto(false)}
        />
      )}
      {confirmarLinha && (
        <ConfirmarPagamentoDialog
          pedidoId={pedidoId}
          provisaoId={confirmarLinha.id ?? undefined}
          aberto
          aoFechar={() => setConfirmarLinha(null)}
          modo="sops"
        />
      )}
    </div>
  );
}
