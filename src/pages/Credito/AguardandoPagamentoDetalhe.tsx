import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTitulosEntradaPedido } from "@/hooks/credito/useTitulosEntradaPedido";
import { useMarcarTituloPago } from "@/hooks/credito/useMarcarTituloPago";
import { useToast } from "@/hooks/use-toast";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import type { TituloEntradaPedido } from "@/types/credito";

function usePedidoAguardando(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["aguardando-pagamento-pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select(`
          id, id_externo, estagio, estagio_atualizado_em, valor_liquido,
          parceiro:parceiros_comerciais(razao_social, cnpj)
        `)
        .eq("id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

const tipoLabel = (t: string) => (t === "pix" ? "PIX" : t === "cartao" ? "Cartão" : "Boleto");

export default function AguardandoPagamentoDetalhe() {
  const { pedidoId } = useParams<{ pedidoId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const pedidoQ = usePedidoAguardando(pedidoId);
  const titulosQ = useTitulosEntradaPedido(pedidoId);
  const marcarPago = useMarcarTituloPago();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [tituloSelecionado, setTituloSelecionado] = useState<TituloEntradaPedido | null>(null);
  const [dataPagamento, setDataPagamento] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [observacao, setObservacao] = useState("");

  const titulos = titulosQ.data ?? [];
  const pendentes = useMemo(
    () => titulos.filter((t) => t.status === "pendente"),
    [titulos],
  );

  // Detecta avanço automático: pedido saiu de aguardando_pagamento após marcar último
  const [avisouAvanco, setAvisouAvanco] = useState(false);
  useEffect(() => {
    if (
      !avisouAvanco &&
      pedidoQ.data &&
      pedidoQ.data.estagio !== "aguardando_pagamento" &&
      titulos.length > 0
    ) {
      setAvisouAvanco(true);
      toast({
        title: "Pedido avançado",
        description: "Todas as entradas foram pagas — pedido avançou para pré-faturamento.",
      });
    }
  }, [pedidoQ.data, titulos.length, avisouAvanco, toast]);

  if (pedidoQ.isLoading || titulosQ.isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!pedidoQ.data) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        <Alert variant="destructive">
          <AlertDescription>Pedido não encontrado.</AlertDescription>
        </Alert>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/credito/aguardando-pagamento")}
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  const pedido = pedidoQ.data;
  const jaSaiu = pedido.estagio !== "aguardando_pagamento";
  const semEntradas = titulos.length === 0;

  const estagioMs = pedido.estagio_atualizado_em
    ? new Date(pedido.estagio_atualizado_em).getTime()
    : Date.now();
  const dias = Math.max(0, Math.floor((Date.now() - estagioMs) / 86_400_000));

  const abrirDialog = (t: TituloEntradaPedido) => {
    setTituloSelecionado(t);
    setDataPagamento(new Date().toISOString().slice(0, 10));
    setObservacao("");
    setDialogOpen(true);
  };

  const handleConfirmar = () => {
    if (!tituloSelecionado) return;
    const ehUltimo = pendentes.length === 1;
    marcarPago.mutate(
      {
        tituloId: tituloSelecionado.titulo_id,
        dataPagamento,
        observacao: observacao.trim() || undefined,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          if (ehUltimo) {
            toast({
              title: "Última entrada paga",
              description:
                "Pedido será avançado automaticamente para pré-faturamento.",
            });
          }
        },
      },
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Crédito", to: "/credito" },
          { label: "Aguardando pagamento", to: "/credito/aguardando-pagamento" },
          { label: pedido.id_externo ?? "—" },
        ]}
        title={`Aguardando pagamento — ${pedido.id_externo ?? ""}`}
      />

      {jaSaiu && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Este pedido já não está mais aguardando pagamento (estágio atual:{" "}
            <strong>{pedido.estagio}</strong>).
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo do pedido</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Cliente</p>
            <p className="font-medium">{pedido.parceiro?.razao_social ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              {pedido.parceiro?.cnpj ? formatCNPJ(pedido.parceiro.cnpj) : ""}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Valor total</p>
            <p className="font-medium">{formatBRL(Number(pedido.valor_liquido ?? 0))}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Dias aguardando</p>
            <p className="font-medium">
              {dias} dia{dias !== 1 ? "s" : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Títulos de entrada ({titulos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {semEntradas ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Pedido sem títulos de entrada.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {titulos.map((t) => {
                const pago = t.status === "pago";
                return (
                  <Card key={t.titulo_id} className="border">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {t.numero_titulo}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            parcela {t.numero_parcela}/{t.total_parcelas}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {tipoLabel(t.tipo_pagamento)}
                        </Badge>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <p className="text-xl font-semibold">
                          {formatBRL(t.valor_bruto)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Venc: {formatDateBR(t.data_vencimento_atual)}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        {pago ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600/90 text-white gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Pago em{" "}
                            {t.data_pagamento
                              ? formatDateBR(t.data_pagamento.slice(0, 10))
                              : "—"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                        {!pago && !jaSaiu && (
                          <Button
                            size="sm"
                            onClick={() => abrirDialog(t)}
                            disabled={marcarPago.isPending}
                          >
                            Marcar como pago
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="flex justify-start mt-6">
            <Button
              variant="outline"
              onClick={() => navigate("/credito/aguardando-pagamento")}
            >
              <ArrowLeft className="h-4 w-4" /> Voltar à fila
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar título como pago</DialogTitle>
            <DialogDescription>
              {tituloSelecionado && (
                <>
                  Título <strong>{tituloSelecionado.numero_titulo}</strong> —{" "}
                  {formatBRL(tituloSelecionado.valor_bruto)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="data-pagamento">Data do pagamento</Label>
              <Input
                id="data-pagamento"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacao">Observação (opcional)</Label>
              <Textarea
                id="observacao"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: PIX confirmado no extrato"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={marcarPago.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmar}
              disabled={marcarPago.isPending || !dataPagamento}
            >
              {marcarPago.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
