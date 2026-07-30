import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ============================================================================
// Campos editáveis — exatamente os que a RPC aceita.
// numero_pedido e fornecedor_id são a identidade do pedido e o banco recusa.
// ============================================================================

const SEM_VALOR = "__nenhum__";

const ETA_PRECISAO_OPCOES = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "trimestre", rotulo: "Trimestre" },
  { valor: "sem_previsao", rotulo: "Sem previsão" },
];

const ROTULO_CAMPO: Record<string, string> = {
  data_pedido: "Data do pedido",
  prazo_entrega_acordado: "Prazo de entrega acordado",
  etd: "ETD",
  eta: "ETA",
  eta_precisao: "Precisão da ETA",
  status_id: "Status",
  condicao_pagamento: "Condição de pagamento",
  referencia_fornecedor: "Referência do fornecedor",
  observacao: "Observação",
  centro_id: "Centro de destino",
  fabrica_id: "Fábrica",
  total_conteineres: "Total de contêineres",
  cbm_total: "CBM total",
  moeda: "Moeda",
  rocabella_ref: "Rocabella ref.",
  modalidade: "Modalidade",
};

interface PedidoEditavel {
  id: number;
  numero_pedido: string;
  data_pedido: string | null;
  prazo_entrega_acordado: string | null;
  etd: string | null;
  eta: string | null;
  eta_precisao: string | null;
  status_id: number | null;
  condicao_pagamento: string | null;
  referencia_fornecedor: string | null;
  observacao: string | null;
  centro_id: string | null;
  fabrica_id: number | null;
  total_conteineres: number | null;
  cbm_total: number | null;
  moeda: string | null;
  rocabella_ref: string | null;
  modalidade: string | null;
}

interface Alteracao {
  campo: string;
  de: unknown;
  para: unknown;
}

interface PreviaResult {
  alteracoes: Alteracao[];
  total_alteracoes: number;
  numero_pedido: string;
}

type Form = Record<string, string>;

function paraForm(p: PedidoEditavel): Form {
  return {
    data_pedido: p.data_pedido ?? "",
    prazo_entrega_acordado: p.prazo_entrega_acordado ?? "",
    etd: p.etd ?? "",
    eta: p.eta ?? "",
    eta_precisao: p.eta_precisao ?? "",
    status_id: p.status_id != null ? String(p.status_id) : "",
    condicao_pagamento: p.condicao_pagamento ?? "",
    referencia_fornecedor: p.referencia_fornecedor ?? "",
    observacao: p.observacao ?? "",
    centro_id: p.centro_id ?? "",
    fabrica_id: p.fabrica_id != null ? String(p.fabrica_id) : "",
    total_conteineres: p.total_conteineres != null ? String(p.total_conteineres) : "",
    cbm_total: p.cbm_total != null ? String(p.cbm_total) : "",
    moeda: p.moeda ?? "",
    rocabella_ref: p.rocabella_ref ?? "",
    modalidade: p.modalidade ?? "",
  };
}

const NUMERICOS = new Set(["status_id", "fabrica_id", "total_conteineres", "cbm_total"]);

function montarCampos(original: Form, atual: Form): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const chave of Object.keys(atual)) {
    if ((original[chave] ?? "") === (atual[chave] ?? "")) continue;
    const valor = atual[chave];
    if (valor === "") {
      out[chave] = null;
    } else if (NUMERICOS.has(chave)) {
      const n = Number(String(valor).replace(",", "."));
      out[chave] = isFinite(n) ? n : null;
    } else {
      out[chave] = valor;
    }
  }
  return out;
}

function fmtValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function ErroBloco({
  titulo,
  erro,
  onRetry,
}: {
  titulo: string;
  erro: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-3">
      <div className="text-sm font-medium text-destructive flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> {titulo}
      </div>
      <div className="text-xs text-destructive/90 break-words">{formatError(erro)}</div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: number | null;
  onSaved?: () => void;
}

export default function EditarPedidoMercadoriaDialog({
  open,
  onOpenChange,
  pedidoId,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [original, setOriginal] = useState<Form | null>(null);
  const [motivo, setMotivo] = useState("");
  const [previa, setPrevia] = useState<PreviaResult | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const pedidoQ = useQuery({
    queryKey: ["importacao-pedido-editar", pedidoId],
    enabled: open && pedidoId != null,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("importacao_pedido")
        .select(
          "id, numero_pedido, data_pedido, prazo_entrega_acordado, etd, eta, eta_precisao, status_id, condicao_pagamento, referencia_fornecedor, observacao, centro_id, fabrica_id, total_conteineres, cbm_total, moeda, rocabella_ref, modalidade",
        )
        .eq("id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Pedido não encontrado.");
      return data as PedidoEditavel;
    },
  });

  const statusQ = useQuery({
    queryKey: ["dim-importacao-status"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("importacao_status")
        .select("id, codigo, descricao, ordem")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as { id: number; codigo: string; descricao: string | null }[];
    },
  });

  const centrosQ = useQuery({
    queryKey: ["dim-centro-distribuicao"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao")
        .select("id, codigo, nome")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string }[];
    },
  });

  const fabricasQ = useQuery({
    queryKey: ["dim-importacao-fabrica"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("importacao_fabrica")
        .select("id, codigo, nome")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as { id: number; codigo: string; nome: string | null }[];
    },
  });

  const modalidadesQ = useQuery({
    queryKey: ["dim-compra-modalidade"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("compra_modalidade")
        .select("codigo, rotulo")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as { codigo: string; rotulo: string }[];
    },
  });

  useEffect(() => {
    if (pedidoQ.data) {
      const f = paraForm(pedidoQ.data);
      setForm(f);
      setOriginal(f);
      setPrevia(null);
      setMotivo("");
    }
  }, [pedidoQ.data]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setOriginal(null);
      setPrevia(null);
      setMotivo("");
    }
  }, [open]);

  const campos = useMemo(
    () => (form && original ? montarCampos(original, form) : {}),
    [form, original],
  );
  const temMudanca = Object.keys(campos).length > 0;

  const set = (chave: string, valor: string) => {
    setForm((f) => (f ? { ...f, [chave]: valor } : f));
    setPrevia(null);
  };

  const conferir = async () => {
    if (!pedidoId || !temMudanca) return;
    setConferindo(true);
    try {
      const { data, error } = await (supabase as any).rpc("atualizar_pedido_mercadoria", {
        p_pedido_id: pedidoId,
        p_campos: campos,
        p_motivo: motivo.trim() || null,
        p_confirmar: false,
      });
      if (error) throw error;
      const res = data as PreviaResult;
      setPrevia(res);
      if (!res || res.total_alteracoes === 0) {
        toast.info("Nada mudou — nenhum campo diferente do valor atual.");
      }
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setConferindo(false);
    }
  };

  const salvar = async () => {
    if (!pedidoId || !previa || previa.total_alteracoes === 0) return;
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc("atualizar_pedido_mercadoria", {
        p_pedido_id: pedidoId,
        p_campos: campos,
        p_motivo: motivo.trim() || null,
        p_confirmar: true,
      });
      if (error) throw error;
      toast.success(
        `Pedido ${previa.numero_pedido} atualizado (${previa.total_alteracoes} alteração(ões)).`,
      );
      qc.invalidateQueries({ queryKey: ["importacao-pedido-lista"] });
      qc.invalidateQueries({ queryKey: ["importacao-pedido-detalhe"] });
      qc.invalidateQueries({ queryKey: ["importacao-pedido-editar", pedidoId] });
      qc.invalidateQueries({ queryKey: ["importacao-pedido-evento", pedidoId] });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setSalvando(false);
    }
  };

  const dimErro = statusQ.isError || centrosQ.isError || fabricasQ.isError || modalidadesQ.isError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Editar pedido{pedidoQ.data ? ` ${pedidoQ.data.numero_pedido}` : ""}
          </DialogTitle>
          <DialogDescription>
            Número do pedido e fornecedor são a identidade do pedido e não podem ser alterados.
            Confira as mudanças antes de salvar.
          </DialogDescription>
        </DialogHeader>

        {pedidoQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedido...
          </div>
        ) : pedidoQ.isError ? (
          <ErroBloco
            titulo="Falha ao carregar o pedido."
            erro={pedidoQ.error}
            onRetry={() => pedidoQ.refetch()}
          />
        ) : !form ? null : (
          <div className="space-y-5">
            {dimErro && (
              <ErroBloco
                titulo="Falha ao carregar as listas de apoio (status, centro, fábrica, modalidade)."
                erro={
                  statusQ.error ?? centrosQ.error ?? fabricasQ.error ?? modalidadesQ.error
                }
                onRetry={() => {
                  statusQ.refetch();
                  centrosQ.refetch();
                  fabricasQ.refetch();
                  modalidadesQ.refetch();
                }}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Data do pedido</Label>
                <Input
                  type="date"
                  value={form.data_pedido}
                  onChange={(e) => set("data_pedido", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo de entrega acordado</Label>
                <Input
                  type="date"
                  value={form.prazo_entrega_acordado}
                  onChange={(e) => set("prazo_entrega_acordado", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status_id || SEM_VALOR}
                  onValueChange={(v) => set("status_id", v === SEM_VALOR ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>— sem status —</SelectItem>
                    {statusQ.data?.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.codigo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>ETD</Label>
                <Input type="date" value={form.etd} onChange={(e) => set("etd", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>ETA</Label>
                <Input type="date" value={form.eta} onChange={(e) => set("eta", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Precisão da ETA</Label>
                <Select
                  value={form.eta_precisao || SEM_VALOR}
                  onValueChange={(v) => set("eta_precisao", v === SEM_VALOR ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>— não informado —</SelectItem>
                    {ETA_PRECISAO_OPCOES.map((o) => (
                      <SelectItem key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Centro de destino</Label>
                <Select
                  value={form.centro_id || SEM_VALOR}
                  onValueChange={(v) => set("centro_id", v === SEM_VALOR ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>— sem centro —</SelectItem>
                    {centrosQ.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.codigo} — {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fábrica</Label>
                <Select
                  value={form.fabrica_id || SEM_VALOR}
                  onValueChange={(v) => set("fabrica_id", v === SEM_VALOR ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>— sem fábrica —</SelectItem>
                    {fabricasQ.data?.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.codigo}
                        {f.nome ? ` — ${f.nome}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Modalidade</Label>
                <Select
                  value={form.modalidade || SEM_VALOR}
                  onValueChange={(v) => set("modalidade", v === SEM_VALOR ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>— sem modalidade —</SelectItem>
                    {modalidadesQ.data?.map((m) => (
                      <SelectItem key={m.codigo} value={m.codigo}>
                        {m.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Moeda</Label>
                <Input
                  value={form.moeda}
                  maxLength={5}
                  onChange={(e) => set("moeda", e.target.value.toUpperCase())}
                  placeholder="BRL / USD"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Referência do fornecedor</Label>
                <Input
                  value={form.referencia_fornecedor}
                  onChange={(e) => set("referencia_fornecedor", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rocabella ref.</Label>
                <Input
                  value={form.rocabella_ref}
                  onChange={(e) => set("rocabella_ref", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Total de contêineres</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.total_conteineres}
                  onChange={(e) => set("total_conteineres", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>CBM total</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.cbm_total}
                  onChange={(e) => set("cbm_total", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Condição de pagamento</Label>
                <Input
                  value={form.condicao_pagamento}
                  onChange={(e) => set("condicao_pagamento", e.target.value)}
                  placeholder="ex: 30/60/90"
                />
              </div>

              <div className="space-y-1.5 md:col-span-3">
                <Label>Observação</Label>
                <Textarea
                  rows={2}
                  value={form.observacao}
                  onChange={(e) => set("observacao", e.target.value)}
                />
              </div>

              <div className="space-y-1.5 md:col-span-3">
                <Label>Motivo da alteração</Label>
                <Textarea
                  rows={2}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Opcional — ex: fornecedor antecipou o embarque"
                />
              </div>
            </div>

            {previa && (
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {previa.total_alteracoes === 0
                    ? "Nada mudou."
                    : `${previa.total_alteracoes} alteração(ões) a aplicar`}
                </div>
                {previa.total_alteracoes > 0 && (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campo</TableHead>
                          <TableHead>De</TableHead>
                          <TableHead>Para</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previa.alteracoes.map((a) => (
                          <TableRow key={a.campo}>
                            <TableCell className="font-medium">
                              {ROTULO_CAMPO[a.campo] ?? a.campo}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {fmtValor(a.de)}
                            </TableCell>
                            <TableCell className="font-medium">{fmtValor(a.para)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            disabled={!temMudanca || conferindo}
            onClick={() => void conferir()}
          >
            {conferindo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Conferir
          </Button>
          <Button
            disabled={!previa || previa.total_alteracoes === 0 || salvando}
            onClick={() => void salvar()}
            style={{ backgroundColor: "#1A4A3A", color: "white" }}
          >
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
