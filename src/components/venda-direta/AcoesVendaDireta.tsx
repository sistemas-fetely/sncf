import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { useAdquirentes } from "@/hooks/financeiro/useAdquirentes";
import { useConfirmarPagamentoLinha } from "@/hooks/pedidos/useConfirmarPagamentoLinha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PixPagamento } from "@/components/venda-direta/PixPagamento";
import { PixSafrapayPainel } from "@/components/venda-direta/PixSafrapay";

export const QK_VD_GESTAO = ["venda-direta-gestao"] as const;

export interface LinhaVD {
  id: string;
  id_externo: string | null;
  valor_liquido: number | null;
  cliente_nome: string | null;
  cliente_telefone?: string | null;
  provisao_id?: string | null;
  link_pagamento?: string | null;
}

const PROVAS_PIX = [
  { value: "pix_txid", label: "PIX (E2E/txid)", referencia: "E2E / txid do PIX" },
  { value: "cartao_nsu", label: "Cartão (NSU)", referencia: "NSU da captura" },
  { value: "boleto_cnab", label: "Boleto (CNAB)", referencia: "Nosso número" },
  { value: "ofx", label: "Extrato (OFX)", referencia: "Identificador do extrato" },
] as const;

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export function VerPixDialog({ linha, onClose, payloadNovo }: { linha: LinhaVD | null; onClose: () => void; payloadNovo?: string | null }) {
  const pixQ = useQuery({
    queryKey: ["venda-direta-pix", linha?.provisao_id],
    enabled: !!linha?.provisao_id && !payloadNovo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provisao_recebimento" as never)
        .select("link_pagamento")
        .eq("id", linha?.provisao_id as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as { link_pagamento: string | null } | null;
    },
  });
  const telefone = (linha?.cliente_telefone ?? "").replace(/\D/g, "");
  const tel = telefone.length <= 11 ? `55${telefone}` : telefone;
  const nome = (linha?.cliente_nome ?? "").trim().split(/\s+/)[0] ?? "";
  const mensagem = linha ? `Olá ${nome}! Seu pedido ${linha.id_externo} na Fetely ficou em ${formatBRL(linha.valor_liquido)}. Pague pelo PIX neste link: ${linha.link_pagamento ?? ""}` : "";
  const whatsappUrl = linha?.link_pagamento && telefone.length >= 10 ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}` : null;

  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>PIX · {linha?.id_externo}</DialogTitle>
          <DialogDescription>{linha?.cliente_nome}</DialogDescription>
        </DialogHeader>
        {payloadNovo ? (
          <PixPagamento payload={payloadNovo} link={linha?.link_pagamento ?? null} whatsappUrl={whatsappUrl} />
        ) : pixQ.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : pixQ.isError ? (
          <p className="text-sm text-destructive">{rawMessage(pixQ.error)}</p>
        ) : linha ? (
          <PixSafrapayPainel
            pedidoId={linha.id}
            idExterno={linha.id_externo}
            total={linha.valor_liquido}
            clienteNome={linha.cliente_nome}
            telefone={linha.cliente_telefone ?? null}
            fallbackPayload={pixQ.data?.link_pagamento ?? null}
            fallbackLink={linha.link_pagamento ?? null}
          />
        ) : null}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmarPixManualDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [prova, setProva] = useState<(typeof PROVAS_PIX)[number]["value"]>("pix_txid");
  const [referencia, setReferencia] = useState("");
  const [data, setData] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const confirmarLinha = useConfirmarPagamentoLinha();

  useEffect(() => {
    if (linha) { setProva("pix_txid"); setReferencia(""); setData(hojeISO()); setObservacao(""); }
  }, [linha]);

  async function confirmar() {
    if (!linha?.provisao_id) {
      toast.error("Provisão de recebimento não encontrada.");
      return;
    }
    try {
      await confirmarLinha.mutateAsync({
        provisao_id: linha.provisao_id,
        prova_tipo: prova,
        prova_ref: referencia.trim(),
        data_pagamento: data,
        observacao,
      });
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
      onClose();
    } catch {
      // FAIL-LOUD: o hook já exibiu a mensagem real e mantém o diálogo aberto.
    }
  }
  const provaAtual = PROVAS_PIX.find((p) => p.value === prova) ?? PROVAS_PIX[0];

  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !confirmarLinha.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar PIX manualmente · {linha?.id_externo}</DialogTitle>
          <DialogDescription>{linha?.cliente_nome} · total {formatBRL(linha?.valor_liquido)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">A baixa automática roda de hora em hora e só reconhece pagamento com valor exato e pagador identificado.</p>
          <div className="space-y-1">
            <Label>Tipo de prova</Label>
            <Select value={prova} onValueChange={(v) => setProva(v as typeof prova)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROVAS_PIX.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>{provaAtual.referencia} *</Label><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} autoFocus /></div>
          <div className="space-y-1"><Label>Data do pagamento *</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="space-y-1"><Label>Observação</Label><Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={confirmarLinha.isPending}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!referencia.trim() || !data || confirmarLinha.isPending}>
            {confirmarLinha.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ConfirmarCartaoDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: adquirentes = [] } = useAdquirentes(!!linha);
  const [nsu, setNsu] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(agoraLocal());
  const [adq, setAdq] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (linha) {
      setNsu(""); setValor(String(linha.valor_liquido ?? "")); setData(agoraLocal()); setAdq(""); setObs("");
    }
  }, [linha]);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("confirmar_cartao_capturado" as never, {
        p_pedido_id: linha!.id,
        p_nsu: nsu.trim(),
        p_data_captura: new Date(data).toISOString(),
        p_valor_capturado: Number(valor.replace(",", ".")),
        p_observacao: obs.trim() || null,
        p_adquirente_id: adq || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Cartão confirmado em ${linha?.id_externo ?? ""}`);
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
      onClose();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  const valorNum = Number(valor.replace(",", "."));
  const pode = nsu.trim() !== "" && valorNum > 0 && !!data;

  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar cartão · {linha?.id_externo}</DialogTitle>
          <DialogDescription>
            {linha?.cliente_nome} · total {formatBRL(linha?.valor_liquido)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>NSU *</Label><Input value={nsu} onChange={(e) => setNsu(e.target.value)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Valor capturado</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
            <div className="space-y-1"><Label>Data da captura</Label><Input type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} /></div>
          </div>
          <div className="space-y-1">
            <Label>Adquirente</Label>
            <Select value={adq} onValueChange={setAdq}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {adquirentes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Observação</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!pode || m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RegistrarRetiradaDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [quem, setQuem] = useState("");
  const [doc, setDoc] = useState("");
  useEffect(() => { if (linha) { setQuem(""); setDoc(""); } }, [linha]);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("vd_registrar_retirada" as never, {
        p_pedido_id: linha!.id,
        p_retirado_por: quem.trim(),
        p_documento: doc.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Retirada registrada em ${linha?.id_externo ?? ""}`);
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
      onClose();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar retirada · {linha?.id_externo}</DialogTitle>
          <DialogDescription>{linha?.cliente_nome}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Quem retirou *</Label><Input value={quem} onChange={(e) => setQuem(e.target.value)} autoFocus /></div>
          <div className="space-y-1"><Label>Documento</Label><Input value={doc} onChange={(e) => setDoc(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!quem.trim() || m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RegistrarEntregaDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [quem, setQuem] = useState("");
  const [obs, setObs] = useState("");
  useEffect(() => { if (linha) { setQuem(""); setObs(""); } }, [linha]);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("vd_registrar_entrega" as never, {
        p_pedido_id: linha!.id,
        p_recebido_por: quem.trim(),
        p_observacao: obs.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Entrega registrada em ${linha?.id_externo ?? ""}`);
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
      onClose();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar entrega · {linha?.id_externo}</DialogTitle>
          <DialogDescription>{linha?.cliente_nome} · Frete Fetely</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Recebido por *</Label><Input value={quem} onChange={(e) => setQuem(e.target.value)} autoFocus /></div>
          <div className="space-y-1"><Label>Observação</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!quem.trim() || m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
