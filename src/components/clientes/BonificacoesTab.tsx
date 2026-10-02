/**
 * BONIFICAÇÕES — o que o cliente já recebeu sem pagar.
 *
 * Aba da ficha do cliente. Fonte: concessao_ocorrencia (registro por concessão).
 * Concessão nova pela RPC conceder_bonificacao (ConcederBonificacaoDialog).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Gift, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Selo } from "@/components/ui/selo";
import { InfoMetrica } from "@/components/metricas/InfoMetrica";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { ConcederBonificacaoDialog, QK_BONIFICACOES_CLIENTE } from "./ConcederBonificacaoDialog";

interface Concessao {
  id: string;
  criado_em: string;
  instrumento: string | null;
  sku: string | null;
  quantidade: number | null;
  custo_total: number | null;
  valor_bonificado: number | null;
  autorizado_por_nome: string | null;
  motivo: { nome: string } | null;
  instr: { rotulo: string } | null;
  pedido: { id_externo: string | null; estagio: string | null } | null;
  haver: { saldo: number | null; status: string | null } | null;
}

const ESTADO_INSTR: Record<string, "info" | "success" | "warning" | "muted"> = {
  pedido_bonificado: "info",
  produto_bonificado: "warning",
  credito_conta: "success",
};

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function BonificacoesTab({ parceiroId }: { parceiroId: string }) {
  const [aberto, setAberto] = useState(false);
  const q = useQuery({
    queryKey: [QK_BONIFICACOES_CLIENTE, parceiroId],
    queryFn: async (): Promise<Concessao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("concessao_ocorrencia")
        .select(
          "id, criado_em, instrumento, sku, quantidade, custo_total, valor_bonificado, autorizado_por_nome, motivo:motivos_concessao(nome), instr:bonificacao_instrumento_dim(rotulo), pedido:pedidos!concessao_ocorrencia_pedido_id_fkey(id_externo, estagio), haver:haver_cliente(saldo, status)",
        )
        .eq("parceiro_id", parceiroId)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const lista = q.data ?? [];
  const corte = new Date();
  corte.setFullYear(corte.getFullYear() - 1);
  const ultimos12 = lista.filter((l) => new Date(l.criado_em) >= corte);
  const totalBonif = ultimos12.reduce((s, l) => s + Number(l.valor_bonificado ?? 0), 0);
  const totalCusto = ultimos12.reduce((s, l) => s + Number(l.custo_total ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-xl">
          Tudo que saiu para este cliente sem cobrança. Serve para saber quanto já foi dado antes de dar mais.
        </p>
        <Button size="sm" onClick={() => setAberto(true)}>
          <Plus className="h-4 w-4" /> Conceder bonificação
        </Button>
      </div>

      {q.isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar as bonificações</AlertTitle>
          <AlertDescription>{formatError(q.error)}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Total bonificado · 12 meses</p>
          <p className="text-sm font-medium">{q.isError || q.isLoading ? "—" : formatBRL(totalBonif)}</p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Custo real · 12 meses <InfoMetrica rotulo="Custo real">Custo de aterrissagem — a perda de verdade.</InfoMetrica>
          </p>
          <p className="text-sm font-medium">{q.isError || q.isLoading ? "—" : formatBRL(totalCusto)}</p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Concessões · 12 meses</p>
          <p className="text-sm font-medium">{q.isError || q.isLoading ? "—" : ultimos12.length}</p>
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : q.isError ? null : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border/60 py-10 text-sm text-muted-foreground">
          <Gift className="h-5 w-5" />
          Nenhuma bonificação concedida a este cliente.
        </div>
      ) : (
        <div className="rounded-md border border-border/60 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Data</TableHead>
                <TableHead>Instrumento</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>SKU · qtd</TableHead>
                <TableHead className="text-right">Valor bonificado</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    Custo real <InfoMetrica rotulo="Custo real">Custo de aterrissagem — a perda de verdade.</InfoMetrica>
                  </span>
                </TableHead>
                <TableHead>Autorizado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm">{dataBR(l.criado_em)}</TableCell>
                  <TableCell>
                    <Selo estado={ESTADO_INSTR[l.instrumento ?? ""] ?? "muted"}>
                      {l.instr?.rotulo ?? l.instrumento ?? "—"}
                    </Selo>
                  </TableCell>
                  <TableCell className="text-sm">{l.motivo?.nome ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {l.pedido
                      ? `${l.pedido.id_externo ?? "pedido"}${l.pedido.estagio ? ` · ${l.pedido.estagio}` : ""}`
                      : l.haver
                        ? `haver: saldo ${formatBRL(Number(l.haver.saldo ?? 0))} · ${l.haver.status ?? "—"}`
                        : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {l.sku ? <><span className="font-mono">{l.sku}</span>{l.quantidade != null ? ` · ${Number(l.quantidade)}` : ""}</> : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">
                    {l.valor_bonificado != null ? formatBRL(Number(l.valor_bonificado)) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {l.custo_total != null ? formatBRL(Number(l.custo_total)) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{l.autorizado_por_nome ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConcederBonificacaoDialog parceiroId={parceiroId} open={aberto} onOpenChange={setAberto} />
    </div>
  );
}
