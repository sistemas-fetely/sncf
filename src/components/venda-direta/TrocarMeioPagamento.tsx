import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, QrCode, Smartphone } from "lucide-react";
import { meioVD, type MeioVD } from "@/lib/pedidos/meioVD";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LinhaVD } from "@/components/venda-direta/AcoesVendaDireta";
import { invalidarVendaDireta } from "@/components/venda-direta/queryKeys";
import { LinkCartaoPainel, SelectParcelas, parcelasPadrao, textoPadraoParcelas, useCfgParcelas, type MeioLink } from "@/components/venda-direta/LinkCartao";
import { PixPagamento } from "@/components/venda-direta/PixPagamento";

interface TrocaResultado {
  ok?: boolean; erro?: string;
  meio: MeioVD; meio_anterior?: string | null;
  forma?: string; provisao_id?: string | null; valor?: number | null;
  link_pagamento: string | null; pix_copia_cola: string | null; precisa_novo_link_cartao?: boolean | null;
}

const ROTULO: Record<MeioVD, string> = { pix: "PIX", cartao: "Cartão (link)", cartao_maquininha: "Cartão maquininha" };
const MEIOS: MeioVD[] = ["pix", "cartao", "cartao_maquininha"];
const ICONE: Record<MeioVD, typeof QrCode> = { pix: QrCode, cartao: CreditCard, cartao_maquininha: Smartphone };

/** Troca o meio do pedido (PIX ↔ cartão) via vd_trocar_meio_pagamento e mostra o pagamento novo. */
export function TrocarMeioPagamentoDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient();
  const cfgQ = useCfgParcelas();
  const atual: MeioVD = meioVD(linha?.pagamento);
  const opcoes = MEIOS.filter((m) => m !== atual);
  const [meio, setMeio] = useState<MeioVD>(opcoes[0]);
  const [parcelas, setParcelas] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [res, setRes] = useState<TrocaResultado | null>(null);

  useEffect(() => {
    if (!linha) return;
    setMeio(meioVD(linha.pagamento) === "pix" ? "cartao" : "pix");
    setMotivo(""); setRes(null); setOcupado(false);
  }, [linha?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cfgQ.data && linha) setParcelas(parcelasPadrao(cfgQ.data, Number(linha.valor_liquido ?? 0)));
  }, [cfgQ.data, linha?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function trocar() {
    if (!linha) return;
    setOcupado(true);
    try {
      const { data, error } = await (supabase as any).rpc("vd_trocar_meio_pagamento", {
        p_pedido_id: linha.id, p_meio: meio, p_motivo: motivo.trim(),
      });
      if (error) throw error;
      const r = data as TrocaResultado;
      if (r?.ok === false) throw new Error(r.erro ?? "Falha ao trocar o meio de pagamento.");
      toast.success(`${linha.id_externo ?? "Pedido"}: pagamento trocado para ${ROTULO[meio]}`);
      await invalidarVendaDireta(qc);
      setRes({ ...r, meio });
    } catch (e) {
      toast.error(rawMessage(e));
    } finally {
      setOcupado(false);
    }
  }

  const pixNoLink = cfgQ.data?.pix_no_link === true;
  const valor = res?.valor ?? linha?.valor_liquido ?? null;
  const podeTrocar = motivo.trim().length >= 3 && !ocupado;

  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !ocupado && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trocar meio de pagamento · {linha?.id_externo}</DialogTitle>
          <DialogDescription>
            Meio atual: {ROTULO[atual]} · {formatBRL(linha?.valor_liquido ?? null)}. O pagamento anterior deixa de valer.
          </DialogDescription>
        </DialogHeader>

        {!res && linha && (
          <div className="space-y-4">
            <RadioGroup value={meio} onValueChange={(v) => setMeio(v as MeioVD)}>
              {opcoes.map((m) => {
                const Icone = ICONE[m];
                return (
                  <label key={m} className="flex cursor-pointer items-center gap-3 rounded-md border bg-card p-3">
                    <RadioGroupItem value={m} />
                    <Icone className="h-4 w-4" />
                    <span className="text-sm font-medium">{ROTULO[m]}</span>
                  </label>
                );
              })}
            </RadioGroup>
            {meio === "cartao" && (
              <div className="space-y-1">
                <Label>Parcelas no link</Label>
                <SelectParcelas value={parcelas} onChange={setParcelas} disabled={ocupado} />
                <p className="text-xs text-muted-foreground">{textoPadraoParcelas(cfgQ.data)}</p>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="motivo-troca">Motivo</Label>
              <Textarea id="motivo-troca" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} disabled={ocupado}
                placeholder="Ex.: cliente preferiu pagar no cartão" />
            </div>
          </div>
        )}

        {res && linha && (
          res.meio === "cartao_maquininha" ? (
            <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm font-medium">
              Aguardando comprovante da maquininha — passe o cartão e use "Anexar comprovante" para liberar o pedido.
            </p>
          ) : res.meio === "cartao" ? (
            <LinkCartaoPainel meio="cartao" pedidoId={linha.id} idExterno={linha.id_externo} total={valor}
              clienteNome={linha.cliente_nome} telefone={linha.cliente_telefone ?? null} maxParcelas={parcelas} />
          ) : pixNoLink ? (
            <LinkCartaoPainel meio="pix" pedidoId={linha.id} idExterno={linha.id_externo} total={valor}
              clienteNome={linha.cliente_nome} telefone={linha.cliente_telefone ?? null}
              pixLocal={{ payload: res.pix_copia_cola, link: res.link_pagamento }} />
          ) : (
            <PixPagamento payload={res.pix_copia_cola} link={res.link_pagamento} />
          )
        )}

        <DialogFooter>
          {res ? (
            <Button onClick={onClose}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" disabled={ocupado} onClick={onClose}>Cancelar</Button>
              <Button disabled={!podeTrocar} onClick={() => void trocar()}>
                {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Trocar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
