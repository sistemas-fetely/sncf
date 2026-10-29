/**
 * Editar a declaração de uma devolução no meio do processo.
 * Regra mora no banco (devolucao_editar_declaracao); a tela só monta a lista e chama.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { CodProduto } from "@/components/produto/CodProduto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type ItemDeclaracao = { sku: string; descricao: string | null; quantidade: number };
export type ItemOrigem = { sku: string; descricao: string | null; quantidade: number; valor_unitario: number | null };
export type DivergenciaLoja = {
  aplica: boolean;
  diverge?: boolean;
  reembolsado_itens?: number;
  declarado_valor?: number;
  itens_divergentes?: { sku: string; reembolsado: number; declarado: number }[];
};

export const QK_DECLARACAO = "devolucao-declaracao";
export const QK_DIVERGENCIA = "devolucao-divergencia-loja";

/** Pode editar: aberta, sem NF de devolução e fora do B2B (a RPC confere de novo). */
export function podeEditarDeclaracao(d: { status?: string | null; status_efetivo?: string | null; canal?: string | null; nf_dev_status?: string | null }) {
  const st = String(d.status_efetivo ?? d.status ?? "");
  return !["cancelada", "encerrada"].includes(st) && d.nf_dev_status == null && d.canal !== "b2b";
}

export async function buscarDeclaracaoAtual(devolucaoId: string): Promise<ItemDeclaracao[]> {
  const { data, error } = await sb.from("devolucao_item").select("sku,descricao,qtd_declarada").eq("devolucao_id", devolucaoId);
  if (error) throw error;
  return ((data ?? []) as { sku: string; descricao: string | null; qtd_declarada: number }[])
    .map((r) => ({ sku: r.sku, descricao: r.descricao, quantidade: Number(r.qtd_declarada) }));
}

export function useDeclaracaoAtual(devolucaoId: string | null, enabled = true) {
  return useQuery({
    queryKey: [QK_DECLARACAO, devolucaoId],
    enabled: enabled && !!devolucaoId,
    queryFn: () => buscarDeclaracaoAtual(devolucaoId!),
  });
}

export function useItensOrigem(devolucaoId: string | null, enabled = true) {
  return useQuery({
    queryKey: [QK_DECLARACAO, "origem", devolucaoId],
    enabled: enabled && !!devolucaoId,
    queryFn: async (): Promise<ItemOrigem[]> => {
      const { data, error } = await sb.rpc("fn_devolucao_itens_origem", { p_devolucao_id: devolucaoId });
      if (error) throw error;
      return ((data ?? []) as ItemOrigem[]).map((r) => ({ ...r, quantidade: Number(r.quantidade) }));
    },
  });
}

export function useDivergenciaLoja(devolucaoId: string | null, enabled = true) {
  return useQuery({
    queryKey: [QK_DIVERGENCIA, devolucaoId],
    enabled: enabled && !!devolucaoId,
    queryFn: async (): Promise<DivergenciaLoja> => {
      const { data, error } = await sb.rpc("fn_devolucao_divergencia_loja", { p_devolucao_id: devolucaoId });
      if (error) throw error;
      return (data ?? { aplica: false }) as DivergenciaLoja;
    },
  });
}

/** Chama a RPC; lança o erro literal do banco. */
export async function salvarDeclaracao(args: { devolucaoId: string; motivo: string; itens?: ItemDeclaracao[]; pedidoInteiro?: boolean }) {
  const { data, error } = await sb.rpc("devolucao_editar_declaracao", {
    p_devolucao_id: args.devolucaoId,
    p_motivo: args.motivo,
    p_itens: args.pedidoInteiro ? null : (args.itens ?? []).map((i) => ({ sku: i.sku, descricao: i.descricao, quantidade: i.quantidade })),
    p_pedido_inteiro: !!args.pedidoInteiro,
  });
  if (error) throw error;
  if (data && data.ok === false) throw new Error(String(data.erro ?? "O banco recusou a alteração."));
  return data as { devolucao: string; tipo: string; valor_credito: number; itens: number };
}

export async function invalidarDeclaracao(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["vw_devolucao_funil"] }),
    qc.invalidateQueries({ queryKey: ["devolucao-retorno-pendente"] }),
    qc.invalidateQueries({ queryKey: [QK_DECLARACAO] }),
    qc.invalidateQueries({ queryKey: [QK_DIVERGENCIA] }),
  ]);
}

export function EditarDeclaracaoDialog({
  devolucao, preenchido, onFechar,
}: {
  devolucao: { id: string; numero: string | null } | null;
  /** Lista inicial (ex.: quantidades reembolsadas). Sem ela, parte da declaração atual. */
  preenchido?: ItemDeclaracao[] | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const id = devolucao?.id ?? null;
  const atualQ = useDeclaracaoAtual(id, !!devolucao);
  const origemQ = useItensOrigem(id, !!devolucao);
  const [linhas, setLinhas] = useState<ItemDeclaracao[]>([]);
  const [motivo, setMotivo] = useState("");
  const [addSku, setAddSku] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [iniciado, setIniciado] = useState<string | null>(null);

  useEffect(() => {
    if (!devolucao) { setIniciado(null); return; }
    if (iniciado === devolucao.id) return;
    if (preenchido) { setLinhas(preenchido); setMotivo(""); setIniciado(devolucao.id); return; }
    if (atualQ.data) { setLinhas(atualQ.data); setMotivo(""); setIniciado(devolucao.id); }
  }, [devolucao, preenchido, atualQ.data, iniciado]);

  const origem = origemQ.data ?? [];
  const descOrigem = useMemo(() => new Map(origem.map((o) => [o.sku, o.descricao])), [origem]);
  const disponiveis = origem.filter((o) => !linhas.some((l) => l.sku === o.sku));
  const motivoOk = motivo.trim().length >= 5;
  const linhasOk = linhas.length > 0 && linhas.every((l) => l.quantidade > 0);

  async function executar(pedidoInteiro: boolean) {
    if (!id) return;
    setSalvando(true);
    try {
      const r = await salvarDeclaracao({ devolucaoId: id, motivo: motivo.trim(), itens: linhas, pedidoInteiro });
      toast.success(`Declaração de ${r?.devolucao ?? devolucao?.numero} atualizada: ${r?.itens} SKU(s), ${r?.tipo}.`);
      await invalidarDeclaracao(qc);
      onFechar();
    } catch (e) {
      toast.error(formatError(e), { duration: 10000 });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={!!devolucao} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar declaração · {devolucao?.numero ?? "—"}</DialogTitle>
          <DialogDescription>Ajuste os itens que o cliente devolveu. O tipo (total/parcial) e o crédito são recalculados pelo banco.</DialogDescription>
        </DialogHeader>

        {(atualQ.error || origemQ.error) && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{formatError(atualQ.error ?? origemQ.error)}</div>
        )}

        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[480px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[90px] text-center">Qtd</TableHead>
                <TableHead className="w-[44px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(atualQ.isLoading && !preenchido) ? (
                <TableRow><TableCell colSpan={4} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
              ) : linhas.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Nenhum item. Adicione abaixo.</TableCell></TableRow>
              ) : linhas.map((l) => (
                <TableRow key={l.sku}>
                  <TableCell className="whitespace-nowrap"><CodProduto chave={l.sku} variant="compacto" /></TableCell>
                  <TableCell className="text-sm min-w-0">
                    <span className="block truncate" title={l.descricao ?? descOrigem.get(l.sku) ?? undefined}>{l.descricao ?? descOrigem.get(l.sku) ?? "—"}</span>
                    <span className="block text-[11px] text-muted-foreground font-mono">{l.sku}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Input inputMode="numeric" className="h-8 w-16 text-center mx-auto" value={String(l.quantidade)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(",", "."));
                        setLinhas((p) => p.map((x) => x.sku === l.sku ? { ...x, quantidade: Number.isFinite(n) && n >= 0 ? n : x.quantidade } : x));
                      }} />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Remover linha" onClick={() => setLinhas((p) => p.filter((x) => x.sku !== l.sku))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label>Adicionar item do pedido de origem</Label>
            <Select value={addSku} onValueChange={setAddSku} disabled={disponiveis.length === 0}>
              <SelectTrigger className="w-full min-w-0 [&>span]:truncate">
                <SelectValue placeholder={origemQ.isLoading ? "Carregando…" : disponiveis.length ? "Escolha um item…" : "Todos os itens já estão na lista"} />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((o) => (
                  <SelectItem key={o.sku} value={o.sku}>{o.sku} · {o.descricao ?? ""} ({o.quantidade} un)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="gap-1.5" disabled={!addSku}
            onClick={() => {
              const o = origem.find((x) => x.sku === addSku);
              if (o) setLinhas((p) => [...p, { sku: o.sku, descricao: o.descricao, quantidade: o.quantidade }]);
              setAddSku("");
            }}>
            <Plus className="h-4 w-4" />Adicionar
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Motivo da alteração *</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ex.: cliente devolveu o pedido inteiro, loja reembolsou 7 SKUs" />
          {!motivoOk && <p className="text-xs text-muted-foreground">Mínimo 5 caracteres.</p>}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" disabled={!motivoOk || salvando || origem.length === 0} onClick={() => void executar(true)}
            title={origem.length === 0 ? "Pedido de origem sem itens no espelho" : undefined}>
            Declarar pedido inteiro
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
            <Button disabled={!motivoOk || !linhasOk || salvando} onClick={() => void executar(false)}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Salvar declaração
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Banner âmbar no bloco Financeiro quando o reembolso da loja não bate com a declaração. */
export function BannerDivergenciaLoja({ devolucaoId, onAjustar, podeAjustar }: { devolucaoId: string; onAjustar: (itens: ItemDeclaracao[]) => void; podeAjustar: boolean }) {
  const q = useDivergenciaLoja(devolucaoId);
  if (q.error) return <div className="text-xs text-destructive">Divergência com a loja: {formatError(q.error)}</div>;
  const d = q.data;
  if (!d?.aplica || !d.diverge) return null;
  const itens = d.itens_divergentes ?? [];
  return (
    <div className="mt-1 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning space-y-1">
      <div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" />Loja reembolsou itens que não batem com a declaração ({itens.length} SKUs)</div>
      <ul className="space-y-0.5">
        {itens.map((i) => <li key={i.sku} className="font-mono">{i.sku} · {i.reembolsado} reembolsado × {i.declarado} declarado</li>)}
      </ul>
      {podeAjustar && (
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={async () => {
          try {
            const atual = await buscarDeclaracaoAtual(devolucaoId);
            const m = new Map(atual.map((a) => [a.sku, a]));
            for (const i of itens) {
              const a = m.get(i.sku);
              if (i.reembolsado > 0) m.set(i.sku, { sku: i.sku, descricao: a?.descricao ?? null, quantidade: Number(i.reembolsado) });
              else m.delete(i.sku);
            }
            onAjustar([...m.values()]);
          } catch (e) { toast.error(formatError(e)); }
        }}>Ajustar declaração ao reembolso</Button>
      )}
    </div>
  );
}

/** Ícone âmbar na linha da tabela. */
export function IconeDivergenciaLoja({ devolucaoId }: { devolucaoId: string }) {
  const q = useDivergenciaLoja(devolucaoId);
  if (!q.data?.diverge) return null;
  const n = q.data.itens_divergentes?.length ?? 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild><AlertTriangle className="h-4 w-4 text-warning" /></TooltipTrigger>
      <TooltipContent>Loja reembolsou itens que não batem com a declaração ({n} SKUs)</TooltipContent>
    </Tooltip>
  );
}
