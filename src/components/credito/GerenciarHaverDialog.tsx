import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parceiroId: string | null;
}

const MOTIVOS_CREDITO = [
  "Ajuste de pedido",
  "Frete não utilizado",
  "Cancelamento parcial",
  "Cortesia",
  "Outro",
];

const MOTIVOS_DEBITO = [
  "Correção de crédito indevido",
  "Estorno de cortesia",
  "Ajuste operacional",
  "Outro",
];

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function plusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysFromToday(dateStr: string) {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(diff, 1);
}

export function GerenciarHaverDialog({ open, onOpenChange, parceiroId }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"credito" | "debito">("credito");

  // ===== shared parceiro state =====
  const [parceiroSel, setParceiroSel] = useState<string | null>(parceiroId);
  const [busca, setBusca] = useState("");

  // ===== crédito state =====
  const [valorC, setValorC] = useState<number>(0);
  const [motivoC, setMotivoC] = useState<string>(MOTIVOS_CREDITO[0]);
  const [obsC, setObsC] = useState("");
  const [pedidoBusca, setPedidoBusca] = useState("");
  const [origemPedidoId, setOrigemPedidoId] = useState<string | null>(null);
  const [validade, setValidade] = useState<string>(plusDays(180));

  // ===== débito state =====
  const [modoDebito, setModoDebito] = useState<"livre" | "vinculado">("livre");
  const [valorD, setValorD] = useState<number>(0);
  const [motivoD, setMotivoD] = useState<string>(MOTIVOS_DEBITO[0]);
  const [obsD, setObsD] = useState("");
  const [haverIdAlvo, setHaverIdAlvo] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab("credito");
      setParceiroSel(parceiroId);
      setBusca("");
      setValorC(0);
      setMotivoC(MOTIVOS_CREDITO[0]);
      setObsC("");
      setPedidoBusca("");
      setOrigemPedidoId(null);
      setValidade(plusDays(180));
      setModoDebito("livre");
      setValorD(0);
      setMotivoD(MOTIVOS_DEBITO[0]);
      setObsD("");
      setHaverIdAlvo(null);
    }
  }, [open, parceiroId]);

  // ===== Parceiros =====
  const parceirosQ = useQuery({
    queryKey: ["gerenciar-haver-parceiros", busca],
    enabled: open && !parceiroId && busca.length >= 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, cnpj")
        .ilike("razao_social", `%${busca}%`)
        .limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const parceiroFixoQ = useQuery({
    queryKey: ["gerenciar-haver-parceiro-fixo", parceiroId],
    enabled: open && !!parceiroId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, cnpj")
        .eq("id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // ===== Haveres do parceiro =====
  const haveresQ = useQuery({
    queryKey: ["haveres-parceiro", parceiroSel],
    enabled: open && !!parceiroSel,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("haver_cliente")
        .select(
          "id, valor, saldo, motivo, origem_descricao, data_expiracao, created_at"
        )
        .eq("parceiro_id", parceiroSel)
        .eq("status", "disponivel")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const saldoTotal = useMemo(
    () => (haveresQ.data ?? []).reduce((s, h: any) => s + Number(h.saldo ?? 0), 0),
    [haveresQ.data]
  );

  const haverSelecionado = useMemo(
    () => (haveresQ.data ?? []).find((h: any) => h.id === haverIdAlvo),
    [haveresQ.data, haverIdAlvo]
  );

  useEffect(() => {
    if (modoDebito === "vinculado" && haverSelecionado) {
      setValorD(Number(haverSelecionado.saldo ?? 0));
    }
  }, [haverIdAlvo, modoDebito]); // eslint-disable-line react-hooks/exhaustive-deps

  const buscarPedido = async () => {
    if (!pedidoBusca.trim()) {
      setOrigemPedidoId(null);
      return;
    }
    const { data, error } = await (supabase as any)
      .from("pedidos")
      .select("id, id_externo")
      .eq("id_externo", pedidoBusca.trim())
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.error("Pedido não encontrado");
      setOrigemPedidoId(null);
      return;
    }
    setOrigemPedidoId(data.id);
    toast.success(`Pedido ${data.id_externo} vinculado`);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["credito-clientes-haveres"] });
    qc.invalidateQueries({ queryKey: ["haver-disponivel"] });
    qc.invalidateQueries({ queryKey: ["cliente-detalhe"] });
    qc.invalidateQueries({ queryKey: ["haveres-parceiro", parceiroSel] });
  };

  // ===== Mutations =====
  const credMut = useMutation({
    mutationFn: async () => {
      const motivoFinal = motivoC + (obsC ? `: ${obsC}` : "");
      const validadeDias = daysFromToday(validade);
      const { error } = await (supabase as any).rpc("ajustar_haver_cliente", {
        p_parceiro_id: parceiroSel,
        p_tipo: "credito",
        p_valor: valorC,
        p_motivo: motivoFinal,
        p_haver_id_alvo: null,
        p_validade_dias: validadeDias,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Crédito adicionado com sucesso");
      invalidate();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const debMut = useMutation({
    mutationFn: async () => {
      const motivoFinal = motivoD + (obsD ? `: ${obsD}` : "");
      const { error } = await (supabase as any).rpc("ajustar_haver_cliente", {
        p_parceiro_id: parceiroSel,
        p_tipo: "debito",
        p_valor: valorD,
        p_motivo: motivoFinal,
        p_haver_id_alvo: modoDebito === "vinculado" ? haverIdAlvo : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Débito registrado com sucesso");
      invalidate();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ===== Validações =====
  const excedeSaldoLivre =
    modoDebito === "livre" && valorD > 0 && valorD > saldoTotal;
  const excedeSaldoVinculado =
    modoDebito === "vinculado" &&
    haverSelecionado &&
    valorD > Number(haverSelecionado.saldo ?? 0);

  const podeCredito = !!parceiroSel && valorC > 0 && !credMut.isPending;
  const podeDebito =
    !!parceiroSel &&
    valorD > 0 &&
    !debMut.isPending &&
    (modoDebito === "livre"
      ? !excedeSaldoLivre
      : !!haverIdAlvo && !excedeSaldoVinculado);

  // ===== Render parceiro picker (compartilhado) =====
  const parceiroPicker = (
    <div className="space-y-2">
      <Label>Parceiro</Label>
      {parceiroId ? (
        <Input
          value={
            parceiroFixoQ.data
              ? `${parceiroFixoQ.data.razao_social}${
                  parceiroFixoQ.data.cnpj ? ` · ${parceiroFixoQ.data.cnpj}` : ""
                }`
              : "Carregando…"
          }
          readOnly
          disabled
        />
      ) : (
        <>
          <Input
            placeholder="Buscar por razão social…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {parceirosQ.data && parceirosQ.data.length > 0 && (
            <div className="border rounded-md max-h-40 overflow-auto">
              {parceirosQ.data.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setParceiroSel(p.id);
                    setBusca(p.razao_social);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                    parceiroSel === p.id ? "bg-accent" : ""
                  }`}
                >
                  <div className="font-medium">{p.razao_social}</div>
                  {p.cnpj && (
                    <div className="text-xs text-muted-foreground">{p.cnpj}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar crédito do cliente</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="credito">Crédito</TabsTrigger>
            <TabsTrigger value="debito">Débito</TabsTrigger>
          </TabsList>

          {/* ===================== CRÉDITO ===================== */}
          <TabsContent value="credito" className="space-y-4 pt-4">
            {parceiroPicker}

            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={valorC || ""}
                onChange={(e) => setValorC(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={motivoC} onValueChange={setMotivoC}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS_CREDITO.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea
                value={obsC}
                onChange={(e) => setObsC(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Pedido de origem (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="ID externo do pedido"
                  value={pedidoBusca}
                  onChange={(e) => setPedidoBusca(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={buscarPedido}>
                  Buscar
                </Button>
              </div>
              {origemPedidoId && (
                <p className="text-xs text-muted-foreground">
                  Vinculado: {origemPedidoId}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Validade</Label>
              <Input
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => credMut.mutate()}
                disabled={!podeCredito}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {credMut.isPending ? "Adicionando…" : "Adicionar crédito"}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ===================== DÉBITO ===================== */}
          <TabsContent value="debito" className="space-y-4 pt-4">
            {parceiroPicker}

            {/* Segmented control */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-md">
              <button
                type="button"
                onClick={() => {
                  setModoDebito("livre");
                  setHaverIdAlvo(null);
                  setValorD(0);
                }}
                className={cn(
                  "px-3 py-2 text-sm rounded-sm transition-colors",
                  modoDebito === "livre"
                    ? "bg-background shadow font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Débito livre
              </button>
              <button
                type="button"
                onClick={() => {
                  setModoDebito("vinculado");
                  setValorD(0);
                }}
                className={cn(
                  "px-3 py-2 text-sm rounded-sm transition-colors",
                  modoDebito === "vinculado"
                    ? "bg-background shadow font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Débito vinculado
              </button>
            </div>

            {modoDebito === "livre" ? (
              <>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={valorD || ""}
                    onChange={(e) => setValorD(Number(e.target.value))}
                  />
                  <p className="text-sm text-muted-foreground">
                    Saldo disponível:{" "}
                    <span className="font-semibold text-foreground">
                      {fmtBRL.format(saldoTotal)}
                    </span>
                  </p>
                  {excedeSaldoLivre && (
                    <p className="text-sm text-destructive">
                      Valor excede o saldo disponível ({fmtBRL.format(saldoTotal)})
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Haveres disponíveis</Label>
                  {haveresQ.isLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando…</p>
                  ) : (haveresQ.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum haver disponível para este parceiro.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-auto">
                      {(haveresQ.data ?? []).map((h: any) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setHaverIdAlvo(h.id)}
                          className={cn(
                            "w-full text-left p-3 border rounded-md transition-colors hover:bg-accent",
                            haverIdAlvo === h.id
                              ? "border-primary border-2 bg-accent"
                              : "border-border"
                          )}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {h.motivo || h.origem_descricao || "Haver"}
                              </div>
                              {h.data_expiracao && (
                                <div className="text-xs text-muted-foreground">
                                  Expira em{" "}
                                  {new Date(
                                    h.data_expiracao + "T00:00:00"
                                  ).toLocaleDateString("pt-BR")}
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold">
                                {fmtBRL.format(Number(h.saldo ?? 0))}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                de {fmtBRL.format(Number(h.valor ?? 0))}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {haverSelecionado && (
                  <div className="space-y-2">
                    <Label>Valor a debitar (R$)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      max={Number(haverSelecionado.saldo ?? 0)}
                      value={valorD || ""}
                      onChange={(e) => setValorD(Number(e.target.value))}
                    />
                    {excedeSaldoVinculado && (
                      <p className="text-sm text-destructive">
                        Valor excede o saldo do haver selecionado (
                        {fmtBRL.format(Number(haverSelecionado.saldo ?? 0))})
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={motivoD} onValueChange={setMotivoD}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS_DEBITO.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea
                value={obsD}
                onChange={(e) => setObsD(e.target.value)}
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => debMut.mutate()}
                disabled={!podeDebito}
              >
                {debMut.isPending ? "Confirmando…" : "Confirmar débito"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
