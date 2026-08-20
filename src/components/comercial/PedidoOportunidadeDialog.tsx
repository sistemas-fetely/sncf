import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { apelidoParceiro } from "@/lib/parceiros/nome";
import {
  useAdicionarObsComercial,
  useItensPedidoOportunidade,
  useObsComerciaisPedido,
} from "@/hooks/comercial/usePedidoOportunidadeDetalhe";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { ComprovantePagamentoBloco } from "@/components/comercial/ComprovantePagamentoBloco";
import { useComprovantesPedido } from "@/hooks/comercial/useComprovantePagamento";


/** Texto curto do chip de situação — map, nunca concatenação. */
export const SITUACAO_CHIP: Record<string, string> = {
  sem_recebivel: "Sem recebível",
  previsto: "Previsto",
  coberto_haver: "Coberto por crédito",
  sem_cobranca: "Sem cobrança",
  parcial_pago: "Parcial pago",
  vencido: "Vencido",
  quitado: "Quitado",
  anulado: "Anulado",
  recebivel_familia: "Recebível na família",
};

export function chipSituacao(situacao: string | null | undefined): string {
  return SITUACAO_CHIP[situacao ?? ""] ?? "Em aberto";
}

function formatDataHora(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  idExterno: string | null;
  cliente: string | null;
  apelido?: string | null;
  valorEmJogo: number | null;
  situacaoFinanceira: string | null;
  alertaOperacional?: string | null;
  tipoPortao?: string | null;
  valorPortao?: number | null;
  vencimentoPortao?: string | null;
  portaoLinhas?: number | null;
  linkPagamento?: string | null;
}

/** CARTAO-NAO-FECHA-NA-MAO: a prova do cartão é o NSU da captura, não confirmação manual. */
const PORTAO_SEM_CONFIRMACAO_MANUAL = new Set(["cartao", "composicao"]);

export function PedidoOportunidadeDialog({
  open,
  onOpenChange,
  pedidoId,
  idExterno,
  cliente,
  apelido,
  valorEmJogo,
  situacaoFinanceira,
  alertaOperacional,
  tipoPortao,
  valorPortao,
  vencimentoPortao,
  portaoLinhas,
  linkPagamento,
}: Props) {
  const [texto, setTexto] = useState("");
  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [obsPagamento, setObsPagamento] = useState("");
  const itens = useItensPedidoOportunidade(pedidoId, open);
  const obs = useObsComerciaisPedido(pedidoId, open);
  const adicionar = useAdicionarObsComercial(pedidoId);
  const qc = useQueryClient();

  const { permitido: podeConfirmarPagamento, carregando: carregandoConfirmarPagamento } =
    usePermissaoAcao("acao.confirmar_pagamento_declarado");
  const { permitido: podeEnviarLink, carregando: carregandoEnviarLink } =
    usePermissaoAcao("acao.enviar_link_pagamento");

  const total = (itens.data ?? []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const podeEnviar = texto.trim().length > 0 && !adicionar.isPending;

  const temPortao = !!vencimentoPortao;
  const cartaoBloqueia = PORTAO_SEM_CONFIRMACAO_MANUAL.has((tipoPortao ?? "").toLowerCase());

  // COMPROVANTE-FECHA-O-PORTAO (20/08/2026): confirmado por comprovante, a
  // confirmação manual não existe mais — o banco recusaria e o erro é feio.
  const comprovantes = useComprovantesPedido(pedidoId, open);
  const temComprovanteConfirmado = (comprovantes.data ?? []).some(
    (c) => c.status === "confirmado",
  );

  const confirmarPagamento = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("confirmar_portao_pago", {
        p_pedido_id: pedidoId,
        p_data_pagamento: dataPagamento,
        p_observacao: obsPagamento.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Pagamento do portão confirmado");
      qc.invalidateQueries({ queryKey: ["oportunidades-comercial"] });
      qc.invalidateQueries({ queryKey: ["oportunidade-obs-comerciais", pedidoId] });
      setConfirmarAberto(false);
      setObsPagamento("");
      onOpenChange(false);
    },
    onError: (e: Error) => {
      // FAIL-LOUD: a mensagem do banco é explicativa — não substituir.
      toast.error(e.message);
    },
  });

  const enviar = async () => {
    if (!podeEnviar) return;
    try {
      await adicionar.mutateAsync(texto);
      setTexto("");
    } catch {
      /* toast já emitido no hook */
    }
  };

  const copiarLink = async () => {
    if (!linkPagamento) return;
    try {
      await navigator.clipboard.writeText(linkPagamento);
      toast.success("Link de pagamento copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{idExterno || "Pedido"}</span>
            <span className="text-sm">{cliente || "—"}</span>
            {apelidoParceiro(cliente, apelido) && (
              <span className="text-sm text-muted-foreground">
                · {apelidoParceiro(cliente, apelido)}
              </span>
            )}
            <span className="text-sm">{formatBRL(valorEmJogo ?? 0)}</span>
            <Badge
              variant="outline"
              className="rounded px-2 py-0.5 text-xs"
              title={alertaOperacional ?? undefined}
            >
              {chipSituacao(situacaoFinanceira)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="itens" className="flex flex-1 flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="itens">Itens</TabsTrigger>
            <TabsTrigger value="obs">Obs. Comerciais</TabsTrigger>
            <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
          </TabsList>

          <TabsContent value="itens" className="mt-4 flex-1 min-h-0 overflow-y-auto">
            {itens.isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (itens.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem itens registrados neste pedido.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 bg-background z-10">
                      <TableHead>SKU</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Valor unitário</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(itens.data ?? []).map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.sku || "—"}</TableCell>
                        <TableCell className="text-sm">{i.descricao || "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {Number(i.quantidade ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatBRL(i.valor_unitario ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatBRL(i.subtotal ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="sticky bottom-0 bg-background">
                      <TableCell colSpan={4} className="text-right text-xs uppercase tracking-wide">
                        Total
                      </TableCell>
                      <TableCell className="text-right">{formatBRL(total)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="obs" className="mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-2">
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Contexto comercial: contato com o cliente, promessa de pagamento, condição pedida…"
              />
              <div className="flex justify-end">
                <Button onClick={enviar} disabled={!podeEnviar}>
                  {adicionar.isPending ? "Salvando…" : "Adicionar observação"}
                </Button>
              </div>
            </div>

            {obs.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (obs.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma observação comercial ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {(obs.data ?? []).map((o) => (
                  <div key={o.id} className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      {formatDataHora(o.criado_em)}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{o.descricao || "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pagamento" className="mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            {!temPortao ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Este pedido não tem portão de pagamento pendente.
              </p>
            ) : (
              <>
                <div className="rounded-md border px-3 py-2 space-y-1">
                  <p className="text-sm">
                    Tipo: <span className="font-medium">{tipoPortao || "—"}</span>
                  </p>
                  <p className="text-sm">
                    Valor: <span className="font-medium">{formatBRL(valorPortao ?? 0)}</span>
                  </p>
                  <p className="text-sm">
                    Vencimento:{" "}
                    <span className="font-medium">{formatDateBR(vencimentoPortao)}</span>
                  </p>
                  {(portaoLinhas ?? 0) > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Pagamento em {portaoLinhas} linhas
                    </p>
                  )}
                </div>

                <ComprovantePagamentoBloco
                  pedidoId={pedidoId}
                  valorPortao={valorPortao}
                  tipoPortao={tipoPortao}
                  podeConfirmar={podeConfirmarPagamento && !carregandoConfirmarPagamento}
                />

                <div className="flex flex-wrap items-center gap-2">

                  <Button
                    variant="outline"
                    className="gap-1.5"
                    disabled={!linkPagamento || carregandoEnviarLink || !podeEnviarLink}
                    title={
                      !linkPagamento
                        ? "Sem link de pagamento"
                        : !carregandoEnviarLink && !podeEnviarLink
                          ? "Você não tem permissão para enviar link de pagamento."
                          : undefined
                    }
                    onClick={copiarLink}
                  >
                    <Copy className="h-4 w-4" />
                    Copiar link de pagamento
                  </Button>
                  {!temComprovanteConfirmado && (
                    <Button
                      disabled={
                        cartaoBloqueia ||
                        confirmarPagamento.isPending ||
                        carregandoConfirmarPagamento ||
                        !podeConfirmarPagamento
                      }
                      title={
                        cartaoBloqueia
                          ? "Cartão não fecha por confirmação manual — a prova é o NSU da captura."
                          : !carregandoConfirmarPagamento && !podeConfirmarPagamento
                            ? "Você não tem permissão para confirmar pagamento declarado."
                            : undefined
                      }
                      onClick={() => setConfirmarAberto(true)}
                    >
                      {confirmarPagamento.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Confirmar pagamento
                    </Button>
                  )}
                  {temComprovanteConfirmado && (
                    <span className="text-xs text-muted-foreground">
                      Pagamento já confirmado por comprovante.
                    </span>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {!temComprovanteConfirmado && (
        <AlertDialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar pagamento do portão</AlertDialogTitle>
              <AlertDialogDescription>
                Registre a data e como o pagamento foi comprovado. Esta observação fica na
                timeline do pedido.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="data-pgto-oportunidade">Data do pagamento</Label>
                <Input
                  id="data-pgto-oportunidade"
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obs-pgto-oportunidade">Como foi comprovado</Label>
                <Textarea
                  id="obs-pgto-oportunidade"
                  value={obsPagamento}
                  onChange={(e) => setObsPagamento(e.target.value)}
                  placeholder="Ex.: comprovante PIX recebido por WhatsApp, conferido no extrato Safra"
                  rows={3}
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={confirmarPagamento.isPending}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={
                  confirmarPagamento.isPending ||
                  !dataPagamento ||
                  obsPagamento.trim().length < 5
                }
                onClick={(e) => {
                  e.preventDefault();
                  confirmarPagamento.mutate();
                }}
              >
                Confirmar pagamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

