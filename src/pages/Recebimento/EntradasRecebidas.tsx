import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { Search } from "lucide-react";

interface EntradaRow {
  id: string;
  pedido_id: string | null;
  origem: string | null;
  forma_pagamento: string | null;
  valor: number | null;
  saldo: number | null;
  status: string | null;
  recebido_em: string | null;
  cliente: string;
  pedido_externo: string;
  estagio: string | null;
  pct_pago: number | null;
  cobre_pedido_inteiro: boolean;
}

const ORIGEM_META: Record<string, { label: string; classe: string }> = {
  portao: { label: "Portão", classe: "border-info/40 text-info" },
  split: { label: "Herdado de split", classe: "border-warning/40 text-warning" },
  migracao: { label: "Migração", classe: "border-border text-muted-foreground" },
};

function useEntradasRecebidas() {
  return useQuery({
    queryKey: ["entradas-recebidas"],
    queryFn: async (): Promise<EntradaRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb
        .from("adiantamento_cliente")
        .select(
          "id, pedido_id, parceiro_id, origem, forma_pagamento, valor, saldo, status, recebido_em, " +
            "parceiro:parceiros_comerciais!adiantamento_cliente_parceiro_id_fkey(razao_social), " +
            "pedido:pedidos!adiantamento_cliente_pedido_id_fkey(id_externo, estagio)",
        )
        .in("status", ["disponivel", "parcial"])
        .order("recebido_em", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Record<string, any>>;
      const pedidoIds = [...new Set(rows.map((r) => r.pedido_id).filter(Boolean))];
      const pctMap = new Map<string, { pct: number | null; cobre: boolean }>();
      if (pedidoIds.length > 0) {
        const { data: adv, error: advErr } = await sb
          .from("vw_pedido_adiantamento")
          .select("pedido_id, pct_pago, cobre_pedido_inteiro")
          .in("pedido_id", pedidoIds);
        if (advErr) throw advErr;
        (adv ?? []).forEach((a: Record<string, any>) => {
          pctMap.set(a.pedido_id, {
            pct: a.pct_pago === null ? null : Number(a.pct_pago),
            cobre: !!a.cobre_pedido_inteiro,
          });
        });
      }

      return rows.map((r) => {
        const p = r.pedido_id ? pctMap.get(r.pedido_id) : undefined;
        return {
          id: r.id,
          pedido_id: r.pedido_id ?? null,
          origem: r.origem ?? null,
          forma_pagamento: r.forma_pagamento ?? null,
          valor: r.valor === null ? null : Number(r.valor),
          saldo: r.saldo === null ? null : Number(r.saldo),
          status: r.status ?? null,
          recebido_em: r.recebido_em ?? null,
          cliente: r.parceiro?.razao_social ?? "—",
          pedido_externo: r.pedido?.id_externo ?? "—",
          estagio: r.pedido?.estagio ?? null,
          pct_pago: p?.pct ?? null,
          cobre_pedido_inteiro: p?.cobre ?? false,
        };
      });
    },
  });
}

export default function EntradasRecebidas() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useEntradasRecebidas();
  const [busca, setBusca] = useState("");
  const [forma, setForma] = useState("todas");

  const formas = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r) => r.forma_pagamento && s.add(r.forma_pagamento));
    return [...s].sort();
  }, [data]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (forma !== "todas" && r.forma_pagamento !== forma) return false;
      if (!q) return true;
      return (
        r.cliente.toLowerCase().includes(q) ||
        r.pedido_externo.toLowerCase().includes(q)
      );
    });
  }, [data, busca, forma]);

  const totalAberto = linhas.reduce((s, r) => s + Number(r.saldo ?? 0), 0);
  const qtdPedidos = new Set(linhas.map((r) => r.pedido_id).filter(Boolean)).size;
  const qtdCobrindoTudo = new Set(
    linhas.filter((r) => r.cobre_pedido_inteiro).map((r) => r.pedido_id).filter(Boolean),
  ).size;

  return (
    <div className="space-y-4">
      <CasaPageHeader
        breadcrumb={[{ label: "Casa", to: "/" }, { label: "Recebimento" }, { label: "Entradas Recebidas" }]}
        title="Entradas Recebidas"
        subtitle="Dinheiro que o cliente já pagou e que ainda não virou título — passivo da empresa até o faturamento."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total em aberto</p>
            <p className="text-2xl font-medium">{formatBRL(totalAberto)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pedidos com entrada</p>
            <p className="text-2xl font-medium">{qtdPedidos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Já cobrem o pedido inteiro</p>
            <p className="text-2xl font-medium">{qtdCobrindoTudo}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente ou pedido"
            className="pl-8"
          />
        </div>
        <Select value={forma} onValueChange={setForma}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Forma de pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as formas</SelectItem>
            {formas.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar entradas recebidas: {(error as any)?.message ?? "falha desconhecida"}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Estágio</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Recebido em</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">% do pedido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-sm text-muted-foreground text-center py-8">
                    Nenhuma entrada recebida em aberto.
                  </TableCell>
                </TableRow>
              ) : (
                linhas.map((r) => {
                  const origem = ORIGEM_META[r.origem ?? ""] ?? null;
                  return (
                    <TableRow
                      key={r.id}
                      className={r.pedido_id ? "cursor-pointer" : undefined}
                      onClick={() => r.pedido_id && navigate(`/pedidos/${r.pedido_id}`)}
                    >
                      <TableCell className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{r.cliente}</span>
                          {origem && (
                            <Badge variant="outline" className={`text-[9px] h-4 px-1 ${origem.classe}`}>
                              {origem.label}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.pedido_externo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.estagio ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.forma_pagamento ?? "—"}</TableCell>
                      <TableCell className="text-sm">{formatDateBR(r.recebido_em)}</TableCell>
                      <TableCell className="text-right text-sm">{formatBRL(r.valor)}</TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(r.saldo)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {r.pct_pago === null ? "—" : `${Math.round(r.pct_pago)}%`}
                        {r.cobre_pedido_inteiro && (
                          <Badge variant="outline" className="ml-2 text-[9px] h-4 px-1 border-success/40 text-success">
                            integral
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
