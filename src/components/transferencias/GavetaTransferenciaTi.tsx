import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodProduto } from "@/components/produto/CodProduto";
import { MiniaturaProduto } from "@/components/estoque/MiniaturaProduto";
import { useFotosPrincipais } from "@/hooks/useFotosProduto";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { Loader2 } from "lucide-react";
import { saldosNegativosTi } from "./saldoOrigemTi";

export interface LinhaTi {
  id: string;
  id_externo: string | null;
  estagio: string | null;
  observacao_pedido: string | null;
  origem_codigo: string | null;
  destino_codigo: string | null;
}

interface ItemTi {
  cod_cadastro: string | null;
  sku: string | null;
  nome_comercial: string | null;
  quantidade: number;
  custo_unitario: number | null;
  origem_rotulo: string | null;
  destino_rotulo: string | null;
  data: string | null;
  criado_por: string | null;
  obs: string | null;
}

const dataHora = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function Par({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

/** Gaveta lateral da transferência interna sem NF (TI-*): dados, totais e itens.
 *  Substitui a expansão inline na lista do Painel de Transferências. */
export function GavetaTransferenciaTi({ linha, onClose }: { linha: LinhaTi | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["ti-itens", linha?.id_externo],
    enabled: !!linha?.id_externo,
    queryFn: async () => {
      if (!linha?.id_externo) throw new Error("Transferência não informada.");
      const { data, error } = await (supabase as any)
        .from("vw_transferencia_interna")
        .select("cod_cadastro, sku, nome_comercial, quantidade, custo_unitario, origem_rotulo, destino_rotulo, data, criado_por, obs")
        .eq("numero", linha.id_externo);
      if (error) throw error;
      const itens = (data ?? []) as ItemTi[];
      // Ordena por cod_cadastro; itens sem código ficam no fim.
      return itens.sort((a, b) => {
        if (!a.cod_cadastro) return 1;
        if (!b.cod_cadastro) return -1;
        return a.cod_cadastro.localeCompare(b.cod_cadastro);
      });
    },
  });
  const itens = q.data ?? [];
  const cabecalho = itens[0];
  const fotosQ = useFotosPrincipais(itens.map((i) => i.cod_cadastro));
  const skus = [...new Set(itens.flatMap((item) => item.sku ? [item.sku] : []))].sort();
  const saldoOrigemQ = useQuery({
    queryKey: ["ti-estoque-origem-atual", linha?.origem_codigo, skus],
    enabled: !!linha?.origem_codigo && skus.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!linha?.origem_codigo || skus.length === 0) throw new Error("Origem ou itens não informados.");
      const { data, error } = await supabase
        .from("vw_estoque_centro")
        .select("sku, fiscal_sadio")
        .eq("centro", linha.origem_codigo)
        .in("sku", skus);
      if (error) throw error;
      return saldosNegativosTi(data ?? []);
    },
  });
  const negativos = saldoOrigemQ.data ?? [];

  const criadoPorQ = useQuery({
    queryKey: ["ti-criado-por", cabecalho?.criado_por],
    enabled: !!cabecalho?.criado_por,
    queryFn: async () => {
      if (!cabecalho?.criado_por) return null;
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_id", cabecalho.criado_por)
        .maybeSingle();
      if (error) throw error;
      return ((data ?? null) as { user_id: string; full_name: string | null } | null)?.full_name ?? null;
    },
  });

  const qtdItens = itens.length;
  const qtdPecas = itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
  const valorCusto = itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.custo_unitario) || 0), 0);

  const observacao = linha?.observacao_pedido?.trim() || null;

  const estagio = linha?.estagio ?? null;

  return (
    <Sheet open={!!linha} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-[640px] sm:w-[640px]">
        <SheetHeader className="pr-8">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="font-mono tabular-nums">{linha?.id_externo ?? "—"}</span>
            <Badge variant="outline" title="Transferência interna entre CDs de SP, sem NF">Sem NF</Badge>
            {estagio && (estagio in ESTAGIO_LABELS
              ? <EstagioBadge estagio={estagio as EstagioPedido} />
              : <Badge variant="outline">{estagio}</Badge>)}
          </SheetTitle>
          <SheetDescription className="sr-only">Detalhe da transferência interna sem NF</SheetDescription>
        </SheetHeader>

        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : q.isError ? (
          <p className="py-6 text-sm text-destructive">Falha ao carregar itens: {formatError(q.error)}</p>
        ) : itens.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Nenhum item encontrado.</p>
        ) : (
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Dados</h3>
              <div className="space-y-1.5 rounded-md border bg-card p-3">
                <Par
                  k="Rota"
                  v={
                    <span className="font-medium">
                      {cabecalho.origem_rotulo ?? linha?.origem_codigo ?? "—"} → {cabecalho.destino_rotulo ?? linha?.destino_codigo ?? "—"}
                    </span>
                  }
                />
                <Par k="Data/hora" v={<span className="tabular-nums">{dataHora(cabecalho.data)}</span>} />
                <Par k="Registrado por" v={criadoPorQ.data ?? "—"} />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Totais</h3>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Itens</p>
                  <p className="text-lg font-medium tabular-nums">{qtdItens}</p>
                </div>
                <div className="rounded-md border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Peças</p>
                  <p className="text-lg font-medium tabular-nums">{qtdPecas}</p>
                </div>
                <div className="rounded-md border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Valor a custo</p>
                  <p className="text-lg font-medium tabular-nums">{formatBRL(valorCusto)}</p>
                </div>
              </div>
            </section>

            {saldoOrigemQ.isLoading && <p className="text-sm text-muted-foreground">Consultando saldo atual da origem…</p>}
            {saldoOrigemQ.isError ? (
              <p className="text-sm text-destructive">Falha ao consultar saldo atual da origem: {formatError(saldoOrigemQ.error)}</p>
            ) : negativos.length > 0 && (
              <Alert className="border-warning/40 bg-warning/10">
                <AlertTitle>Saldo negativo na origem — entrada pendente</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 space-y-1">
                    {itens.filter((item) => negativos.some((saldo) => saldo.sku === item.sku)).map((item) => (
                      <li key={item.sku} className="flex items-center justify-between gap-3">
                        <CodProduto chave={item.sku} variant="compacto" />
                        <span className="font-mono tabular-nums">{negativos.find((saldo) => saldo.sku === item.sku)?.saldo.toLocaleString("pt-BR")}</span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {observacao && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Observação</h3>
                <p className="whitespace-pre-wrap break-words text-sm">{observacao}</p>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Itens</h3>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Custo unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((i, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <CodProduto chave={i.sku} variant="compacto" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MiniaturaProduto url={i.cod_cadastro ? fotosQ.data?.get(i.cod_cadastro) : null} nome={i.nome_comercial} />
                            <span className="text-sm">{i.nome_comercial ?? "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{i.quantidade}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {i.custo_unitario != null ? formatBRL(Number(i.custo_unitario)) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {i.custo_unitario != null ? formatBRL((Number(i.quantidade) || 0) * Number(i.custo_unitario)) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2}>{qtdItens} {qtdItens === 1 ? "item" : "itens"}</TableCell>
                      <TableCell className="text-right tabular-nums">{qtdPecas}</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums font-medium">{formatBRL(valorCusto)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
