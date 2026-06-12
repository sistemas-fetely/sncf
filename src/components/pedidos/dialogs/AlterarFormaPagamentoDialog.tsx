import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDuplicarPedidoAlterarPagamento } from "@/hooks/pedidos/useDuplicarPedidoAlterarPagamento";

interface Props {
  open: boolean;
  onClose: () => void;
  pedidoId: string;
  idExterno: string;
  temTitulosComEmailEnviado?: boolean;
}

interface Regra {
  id: string;
  nome: string;
  codigo: string;
  forma: string;
  passa_por_analise: boolean;
  espera_pagamento: boolean;
}

function condicaoDefault(forma: string): string {
  switch (forma) {
    case "pix":
      return "PIX";
    case "cartao":
      return "Cartão à vista";
    case "boleto_avista":
      return "Boleto à vista";
    case "boleto_com_entrada":
    case "boleto_sem_entrada":
    default:
      return "";
  }
}

function buildCondicao(codigo: string, parc: number, interv: number): string {
  if (codigo === "boleto_com_entrada") {
    return Array.from({ length: parc + 1 }, (_, i) => i * interv).join("/");
  }
  if (codigo === "boleto_sem_entrada") {
    return Array.from({ length: parc }, (_, i) => (i + 1) * interv).join("/");
  }
  return "";
}


export function AlterarFormaPagamentoDialog({
  open,
  onClose,
  pedidoId,
  idExterno,
  temTitulosComEmailEnviado,
}: Props) {
  const [regraId, setRegraId] = useState("");
  const [condicao, setCondicao] = useState("");
  const [parcelas, setParcelas] = useState(3);
  const [intervalo, setIntervalo] = useState(30);

  const [erroRpc, setErroRpc] = useState<string | null>(null);

  const { data: regras } = useQuery({
    queryKey: ["regras-pagamento-pedido-ativas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("regras_pagamento_pedido")
        .select("id, nome, codigo, forma, passa_por_analise, espera_pagamento")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Regra[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setRegraId("");
      setCondicao("");
      setErroRpc(null);
    }
  }, [open]);

  const regraSelecionada = regras?.find((r) => r.id === regraId);

  function handleChangeRegra(novoId: string) {
    setRegraId(novoId);
    const r = regras?.find((x) => x.id === novoId);
    setCondicao(r ? condicaoDefault(r.codigo) : "");
    setParcelas(3);
    setIntervalo(30);
    setErroRpc(null);
  }

  useEffect(() => {
    if (!regraSelecionada) return;
    if (
      regraSelecionada.codigo === "boleto_com_entrada" ||
      regraSelecionada.codigo === "boleto_sem_entrada"
    ) {
      setCondicao(buildCondicao(regraSelecionada.codigo, parcelas, intervalo));
    }
  }, [parcelas, intervalo, regraSelecionada]);

  const duplicar = useDuplicarPedidoAlterarPagamento();

  const formaEntradaLivre =
    regraSelecionada?.codigo === "boleto_com_entrada" ||
    regraSelecionada?.codigo === "boleto_sem_entrada";

  async function handleConfirmar() {
    setErroRpc(null);
    try {
      await duplicar.mutateAsync({
        pedidoId,
        novaRegraId: regraId,
        novaCondicao: condicao,
      });
    } catch (e: any) {
      setErroRpc(e?.message ?? "Erro ao alterar forma de pagamento");
    }
  }

  const disabled =
    !regraId || !condicao.trim() || duplicar.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar forma de pagamento</DialogTitle>
          <DialogDescription>
            Um novo pedido será criado com a forma selecionada. O pedido atual
            será cancelado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Regra de pagamento</label>
            <Select value={regraId} onValueChange={handleChangeRegra}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma regra" />
              </SelectTrigger>
              <SelectContent>
                {regras?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Builder de parcelas para boleto a prazo */}
          {formaEntradaLivre && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/40">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {regraSelecionada?.codigo === "boleto_com_entrada"
                      ? "Parcelas adicionais"
                      : "Número de parcelas"}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={parcelas}
                    onChange={(e) =>
                      setParcelas(Math.max(1, Math.min(12, Number(e.target.value))))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Intervalo (dias)</label>
                  <Input
                    type="number"
                    min={1}
                    max={360}
                    value={intervalo}
                    onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value)))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Condição gerada:{" "}
                <span className="font-mono font-medium text-foreground">{condicao}</span>
                {regraSelecionada?.codigo === "boleto_com_entrada" && (
                  <span className="ml-1">
                    ({parcelas + 1} títulos: entrada + {parcelas} parcelas)
                  </span>
                )}
                {regraSelecionada?.codigo === "boleto_sem_entrada" && (
                  <span className="ml-1">
                    ({parcelas} título{parcelas > 1 ? "s" : ""})
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Condição livre para tipos simples */}
          {!formaEntradaLivre && regraId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Condição de pagamento</label>
              <Input
                value={condicao}
                onChange={(e) => setCondicao(e.target.value)}
                placeholder="Ex: PIX, Cartão à vista..."
              />
            </div>
          )}

          {regraSelecionada?.passa_por_analise && (
            <div className="flex items-start gap-2">
              <Badge variant="secondary" className="gap-1">
                <Info className="h-3 w-3" />
                Análise de crédito
              </Badge>
              <span className="text-xs text-muted-foreground">
                Este pagamento passará por análise de crédito antes de ir para
                cobrança.
              </span>
            </div>
          )}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>
                O pedido <strong>{idExterno}</strong> será cancelado e um novo
                pedido <strong>{idExterno}/pgXX</strong> será criado com a nova
                forma de pagamento. O pedido original não poderá ser reaberto.
              </p>
              {temTitulosComEmailEnviado && (
                <p>
                  ⚠️ Um e-mail de cobrança já foi enviado ao cliente. O novo
                  pedido gerará uma nova cobrança.
                </p>
              )}
            </AlertDescription>
          </Alert>

          {erroRpc && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{erroRpc}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={duplicar.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={disabled}>
            {duplicar.isPending ? "Processando…" : "Confirmar alteração"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
