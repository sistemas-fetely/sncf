import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAtualizarCondicaoPagamento } from "@/hooks/credito/useAtualizarCondicaoPagamento";

interface Regra {
  id: string;
  nome: string;
  codigo: string;
  forma: string;
  parcela_unica: boolean;
  passa_por_analise: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  pedidoId: string;
  idExterno: string;
}

/** Retorna true quando a regra exige inputs estruturados de parcelas */
function ehParcelado(r: Regra | undefined): boolean {
  if (!r) return false;
  return (
    r.codigo === "boleto_com_entrada" ||
    r.codigo === "boleto_sem_entrada" ||
    (r.forma === "cartao" && !r.parcela_unica)
  );
}

/** Gera a string de condição no formato que fn_parse_condicao entende ("0", "30", "30/60/90") */
function buildCondicao(r: Regra, parcelas: number, intervalo: number): string {
  if (r.codigo === "boleto_com_entrada") {
    return Array.from({ length: parcelas + 1 }, (_, i) => i * intervalo).join("/");
  }
  if (r.codigo === "boleto_sem_entrada") {
    return Array.from({ length: parcelas }, (_, i) => (i + 1) * intervalo).join("/");
  }
  if (r.forma === "cartao" && !r.parcela_unica) {
    // 1x cartão = à vista; Nx = intervalos mensais
    if (parcelas === 1) return "0";
    return Array.from({ length: parcelas }, (_, i) => (i + 1) * intervalo).join("/");
  }
  return "";
}

function condicaoFixa(r: Regra): string {
  if (r.codigo === "pix")            return "PIX";
  if (r.forma === "cartao" && r.parcela_unica) return "Cartão à vista";
  if (r.codigo === "boleto_avista")  return "Boleto à vista";
  return "";
}

export function EditarCondicaoPagamentoDialog({ open, onClose, pedidoId, idExterno }: Props) {
  const [regraId, setRegraId]     = useState("");
  const [condicao, setCondicao]   = useState("");
  const [parcelas, setParcelas]   = useState(3);
  const [intervalo, setIntervalo] = useState(30);
  const [erroRpc, setErroRpc]     = useState<string | null>(null);

  const { data: regras } = useQuery({
    queryKey: ["regras-pagamento"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("regras_pagamento_pedido")
        .select("id, nome, codigo, forma, parcela_unica, passa_por_analise")
        .eq("ativo", true)
        .order("ordem");
      return data as Regra[];
    },
  });

  const atualizar = useAtualizarCondicaoPagamento(pedidoId);
  const regraSelecionada = regras?.find((r) => r.id === regraId);

  useEffect(() => {
    if (!regraSelecionada || !ehParcelado(regraSelecionada)) return;
    setCondicao(buildCondicao(regraSelecionada, parcelas, intervalo));
  }, [parcelas, intervalo, regraSelecionada]);

  function handleChangeRegra(novoId: string) {
    setRegraId(novoId);
    setErroRpc(null);
    const r = regras?.find((x) => x.id === novoId);
    if (!r) return;
    if (ehParcelado(r)) {
      setParcelas(3);
      setIntervalo(30);
      setCondicao(buildCondicao(r, 3, 30));
    } else {
      setCondicao(condicaoFixa(r));
    }
  }

  async function handleConfirmar() {
    setErroRpc(null);
    try {
      await atualizar.mutateAsync({ novaRegraId: regraId, novaCondicao: condicao });
      onClose();
    } catch (e: any) {
      setErroRpc(e?.message ?? "Erro ao atualizar pagamento");
    }
  }

  function handleClose() {
    if (atualizar.isPending) return;
    setRegraId("");
    setCondicao("");
    setErroRpc(null);
    onClose();
  }

  const podeSalvar = !!regraId && !!condicao && !atualizar.isPending;

  const isCartaoParcelado = regraSelecionada?.forma === "cartao" && !regraSelecionada?.parcela_unica;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar condição de pagamento</DialogTitle>
          <DialogDescription>
            Pedido {idExterno} — proposta será recalculada automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nova forma de pagamento</Label>
            <Select value={regraId} onValueChange={handleChangeRegra}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {(regras ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {regraSelecionada && ehParcelado(regraSelecionada) && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>
                    {regraSelecionada.codigo === "boleto_com_entrada"
                      ? "Parcelas adicionais"
                      : "Número de parcelas"}
                  </Label>
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
                {!isCartaoParcelado || parcelas > 1 ? (
                  <div className="space-y-2">
                    <Label>Intervalo (dias)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={intervalo}
                      onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Intervalo</Label>
                    <p className="text-sm text-muted-foreground pt-2">À vista (1 parcela)</p>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Condição gerada: <span className="font-mono">{condicao}</span>{" "}
                {regraSelecionada.codigo === "boleto_com_entrada" && (
                  <span>({parcelas + 1} títulos: entrada + {parcelas} parcelas)</span>
                )}
                {regraSelecionada.codigo === "boleto_sem_entrada" && (
                  <span>({parcelas} título{parcelas > 1 ? "s" : ""})</span>
                )}
                {isCartaoParcelado && parcelas === 1 && (
                  <span>(à vista)</span>
                )}
                {isCartaoParcelado && parcelas > 1 && (
                  <span>({parcelas}x cartão)</span>
                )}
              </div>
            </div>
          )}

          {regraSelecionada && !ehParcelado(regraSelecionada) && (
            <div className="space-y-2">
              <Label>Condição</Label>
              <Input
                value={condicao}
                readOnly
                className="bg-muted/40 text-muted-foreground cursor-default"
              />
            </div>
          )}

          {regraSelecionada?.passa_por_analise && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Este pagamento passará por análise de crédito ao ser materializado.
              </AlertDescription>
            </Alert>
          )}

          {erroRpc && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{erroRpc}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={atualizar.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!podeSalvar}>
            {atualizar.isPending ? "Salvando…" : "Salvar e recalcular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
