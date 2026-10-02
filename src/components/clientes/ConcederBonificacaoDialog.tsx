/**
 * CONCEDER BONIFICAÇÃO — dialog da aba Bonificações.
 * Toda validação de negócio vive na RPC conceder_bonificacao; o front só coleta.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProdutoVarejoCombobox } from "@/components/venda-direta/ProdutoVarejoCombobox";
import { InputMoedaBR } from "@/components/compras/InputMoedaBR";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { QK_CONTA_CLIENTE_COBERTURA } from "@/hooks/financeiro/useContaCliente";

export const QK_BONIFICACOES_CLIENTE = "bonificacoes-cliente";
const ESTAGIOS_VIVOS = ["recebido", "em_analise", "cobranca", "aguardando_pagamento"];
const OUTRA_PESSOA = "__outra__";
const QK_BONIFICACOES_SEM_REGISTRO = "bonificacoes-sem-registro";

interface BonificacaoSemRegistro {
  pedido_id: string;
  id_externo: string | null;
  parceiro_id: string;
  cliente: string | null;
  data_pedido: string | null;
  estagio: string | null;
  estagio_rotulo: string | null;
  valor_bruto: number | null;
  itens: number | null;
  quantidade: number | null;
}

interface ItemBonif {
  chave: number;
  sku: string;
  nome: string | null;
  preco: number;
  quantidade: number;
  valor: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function ConcederBonificacaoDialog({
  parceiroId,
  open,
  onOpenChange,
  instrumentoInicial,
  pedidoInicial,
}: {
  parceiroId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instrumentoInicial?: string;
  pedidoInicial?: string;
}) {
  const qc = useQueryClient();
  const [instrumento, setInstrumento] = useState(instrumentoInicial ?? "");
  const [motivo, setMotivo] = useState("");
  const [pessoaSel, setPessoaSel] = useState("");
  const [nomeLivre, setNomeLivre] = useState("");
  const [pedidoId, setPedidoId] = useState(pedidoInicial ?? "");
  const [itens, setItens] = useState<ItemBonif[]>([]);
  const [valorCredito, setValorCredito] = useState(0);
  const [validade, setValidade] = useState(180);
  const [observacao, setObservacao] = useState("");

  const dimQ = useQuery({
    queryKey: ["bonificacao-dims"],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [i, m, p, e] = await Promise.all([
        sb.from("bonificacao_instrumento_dim").select("codigo, rotulo, descricao").eq("ativo", true).order("rotulo"),
        sb.from("motivos_concessao").select("codigo, nome").eq("ativo", true).order("nome"),
        sb.from("pessoas").select("id, nome_completo").order("nome_completo"),
        sb.from("pedido_estagio").select("codigo, rotulo"),
      ]);
      for (const r of [i, m, p, e]) if (r.error) throw r.error;
      return {
        instrumentos: i.data as { codigo: string; rotulo: string; descricao: string | null }[],
        motivos: m.data as { codigo: string; nome: string }[],
        pessoas: (p.data as { id: string; nome_completo: string | null }[]).filter((x) => x.nome_completo),
        estagios: new Map((e.data as { codigo: string; rotulo: string }[]).map((x) => [x.codigo, x.rotulo])),
      };
    },
  });

  const pedidosQ = useQuery({
    queryKey: ["bonificacao-pedidos", parceiroId, instrumento],
    enabled: open && (instrumento === "produto_bonificado" || instrumento === "pedido_bonificado"),
    queryFn: async () => {
      if (instrumento === "pedido_bonificado") {
        const { data, error } = await sb
          .from("vw_bonificacao_sem_registro")
          .select("pedido_id, id_externo, parceiro_id, cliente, data_pedido, estagio, estagio_rotulo, valor_bruto, itens, quantidade")
          .eq("parceiro_id", parceiroId)
          .order("data_pedido", { ascending: false });
        if (error) throw error;
        return (data ?? []) as BonificacaoSemRegistro[];
      }
      let q = sb
        .from("pedidos")
        .select("id, id_externo, estagio, valor_liquido, data_pedido, natureza:naturezas_operacao!inner(codigo)")
        .eq("parceiro_id", parceiroId)
        .is("cancelado_em", null)
        .order("data_pedido", { ascending: false })
        .limit(100);
      q = q.in("estagio", ESTAGIOS_VIVOS);
      const { data, error } = await q;
      if (error) throw error;
      return data as { id: string; id_externo: string | null; estagio: string; valor_liquido: number | null; data_pedido: string | null }[];
    },
  });

  useEffect(() => {
    if (!open) return;
    setInstrumento(instrumentoInicial ?? "");
    setPedidoId(pedidoInicial ?? "");
  }, [open, instrumentoInicial, pedidoInicial]);

  const totalItens = useMemo(() => itens.reduce((s, i) => s + (Number(i.valor) || 0), 0), [itens]);
  const pessoa = dimQ.data?.pessoas.find((p) => p.id === pessoaSel);
  const nomeAutorizador = pessoaSel === OUTRA_PESSOA ? nomeLivre.trim() : pessoa?.nome_completo ?? "";
  const valor = instrumento === "produto_bonificado" ? totalItens : instrumento === "credito_conta" ? valorCredito : 0;
  const pedidoSelecionado = pedidosQ.data?.find((p) => ("pedido_id" in p ? p.pedido_id : p.id) === pedidoId);
  const valorPedidoBonificado = instrumento === "pedido_bonificado" && pedidoSelecionado && "valor_bruto" in pedidoSelecionado
    ? Number(pedidoSelecionado.valor_bruto ?? 0)
    : 0;
  const rotuloInstr = dimQ.data?.instrumentos.find((i) => i.codigo === instrumento)?.rotulo ?? instrumento;

  function reset() {
    setInstrumento(instrumentoInicial ?? ""); setMotivo(""); setPessoaSel(""); setNomeLivre(""); setPedidoId(pedidoInicial ?? "");
    setItens([]); setValorCredito(0); setValidade(180); setObservacao("");
  }

  const conceder = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("conceder_bonificacao", {
        p_parceiro_id: parceiroId,
        p_instrumento: instrumento,
        p_motivo_codigo: motivo || null,
        p_autorizado_por_nome: nomeAutorizador || null,
        p_valor: valor,
        p_pedido_id: instrumento === "credito_conta" ? null : pedidoId || null,
        p_itens:
          instrumento === "produto_bonificado"
            ? itens.map((i) => ({ sku: i.sku, quantidade: i.quantidade, valor: i.valor }))
            : null,
        p_observacao: observacao.trim() || null,
        p_autorizado_por: pessoa ? pessoa.id : null,
        p_validade_dias: instrumento === "credito_conta" ? validade : null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Bonificação concedida: ${formatBRL(valor)} · ${rotuloInstr}`);
      qc.invalidateQueries({ queryKey: [QK_BONIFICACOES_CLIENTE, parceiroId] });
      qc.invalidateQueries({ queryKey: [QK_BONIFICACOES_SEM_REGISTRO] });
      qc.invalidateQueries({ queryKey: ["haver-disponivel", parceiroId] });
      qc.invalidateQueries({ queryKey: ["creditos-cliente-livres", parceiroId] });
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_COBERTURA] });
      qc.invalidateQueries({ queryKey: ["cliente-detalhe", parceiroId] });
      if (pedidoId) invalidarPedido(qc, pedidoId);
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conceder bonificação</DialogTitle>
        </DialogHeader>

        {dimQ.isError ? (
          <Alert variant="destructive"><AlertDescription>{formatError(dimQ.error)}</AlertDescription></Alert>
        ) : !dimQ.data ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Instrumento</Label>
                <RadioGroup value={instrumento} onValueChange={(v) => { setInstrumento(v); setPedidoId(""); }}>
                {dimQ.data!.instrumentos.map((i) => (
                  <label key={i.codigo} className="flex items-start gap-2 rounded-md border border-border/60 p-2.5 cursor-pointer has-[:checked]:border-primary">
                    <RadioGroupItem value={i.codigo} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">{i.rotulo}</span>
                      {i.descricao && <span className="block text-xs text-muted-foreground">{i.descricao}</span>}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                  <SelectContent>
                    {dimQ.data!.motivos.map((m) => <SelectItem key={m.codigo} value={m.codigo}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Autorizado por *</Label>
                <Select value={pessoaSel} onValueChange={setPessoaSel}>
                  <SelectTrigger><SelectValue placeholder="Quem autorizou" /></SelectTrigger>
                  <SelectContent>
                    {dimQ.data!.pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_completo}</SelectItem>)}
                    <SelectItem value={OUTRA_PESSOA}>Outra pessoa (digitar nome)</SelectItem>
                  </SelectContent>
                </Select>
                {pessoaSel === OUTRA_PESSOA && (
                  <Input value={nomeLivre} onChange={(e) => setNomeLivre(e.target.value)} placeholder="Nome de quem autorizou" />
                )}
              </div>
            </div>

            {(instrumento === "produto_bonificado" || instrumento === "pedido_bonificado") && (
              <div className="space-y-1.5">
                <Label>{instrumento === "produto_bonificado" ? "Pedido vivo do cliente" : "Pedido bonificado"}</Label>
                {pedidosQ.isError ? (
                  <p className="text-sm text-destructive">{formatError(pedidosQ.error)}</p>
                ) : (
                  <Select value={pedidoId} onValueChange={setPedidoId}>
                    <SelectTrigger>
                      <SelectValue placeholder={pedidosQ.isLoading ? "Carregando…" : (pedidosQ.data?.length ?? 0) === 0 ? "Nenhum pedido elegível" : "Selecione o pedido"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(pedidosQ.data ?? []).map((p) => (
                        <SelectItem key={"pedido_id" in p ? p.pedido_id : p.id} value={"pedido_id" in p ? p.pedido_id : p.id}>
                          {p.id_externo ?? ("pedido_id" in p ? p.pedido_id : p.id).slice(0, 8)} · {"estagio_rotulo" in p ? p.estagio_rotulo : dimQ.data?.estagios.get(p.estagio)} · {formatBRL(Number("valor_bruto" in p ? p.valor_bruto : p.valor_liquido ?? 0))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {instrumento === "pedido_bonificado" && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {pedidoSelecionado && <p>Valor registrado: <span className="tabular-nums">{formatBRL(valorPedidoBonificado)}</span> — vem dos itens do pedido.</p>}
                    <p>Só registra o analítico; não altera valores do pedido.</p>
                  </div>
                )}
              </div>
            )}

            {instrumento === "produto_bonificado" && (
              <div className="space-y-2">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    O valor vira desconto no pedido — o líquido e a NF saem menores. Se já houver plano de cobrança montado, remonte em Cobrança.
                  </AlertDescription>
                </Alert>
                <ProdutoVarejoCombobox
                  value=""
                  ariaLabel="Adicionar produto bonificado"
                  onSelect={(p) =>
                    setItens((xs) => [...xs, { chave: Date.now(), sku: p.sku, nome: p.nome_completo, preco: p.preco_varejo, quantidade: 1, valor: p.preco_varejo }])
                  }
                />
                {itens.map((it) => (
                  <div key={it.chave} className="grid grid-cols-[1fr_5rem_8rem_auto] items-center gap-2 rounded-md border border-border/60 p-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{it.nome ?? it.sku}</p>
                      <p className="text-xs font-mono text-muted-foreground">{it.sku} · tabela {formatBRL(it.preco)}</p>
                    </div>
                    <Input
                      type="number" min={1} className="h-8" aria-label="Quantidade" value={it.quantidade}
                      onChange={(e) => {
                        const q = Math.max(0, Number(e.target.value) || 0);
                        setItens((xs) => xs.map((x) => (x.chave === it.chave ? { ...x, quantidade: q, valor: +(q * x.preco).toFixed(2) } : x)));
                      }}
                    />
                    <InputMoedaBR value={it.valor} onChange={(v) => setItens((xs) => xs.map((x) => (x.chave === it.chave ? { ...x, valor: v } : x)))} />
                    <Button variant="ghost" size="icon" aria-label="Remover item" onClick={() => setItens((xs) => xs.filter((x) => x.chave !== it.chave))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-right text-sm">Total bonificado: <span className="font-medium tabular-nums">{formatBRL(totalItens)}</span></p>
              </div>
            )}

            {instrumento === "credito_conta" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Valor do crédito</Label>
                  <InputMoedaBR value={valorCredito} onChange={setValorCredito} />
                </div>
                <div className="space-y-1.5">
                  <Label>Validade (dias)</Label>
                  <Input type="number" min={1} className="h-8" value={validade} onChange={(e) => setValidade(Number(e.target.value) || 0)} />
                  <p className="text-xs text-muted-foreground">Crédito expira pela régua.</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => conceder.mutate()} disabled={conceder.isPending || !instrumento || !nomeAutorizador}>
            {conceder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Conceder {(instrumento === "pedido_bonificado" ? valorPedidoBonificado : valor) > 0 ? formatBRL(instrumento === "pedido_bonificado" ? valorPedidoBonificado : valor) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
