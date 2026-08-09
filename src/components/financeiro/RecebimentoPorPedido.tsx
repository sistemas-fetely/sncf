import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { useNavigate } from "react-router-dom";

export type RecebimentoNivel = {
  titulo_id: string;
  pedido_id: string | null;
  pedido_ref: string | null;
  cliente: string | null;
  data_pedido: string | null;
  estagio: string | null;
  numero_titulo: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  tipo_pagamento: string | null;
  valor: number | null;
  status: string | null;
  boleto_status: string | null;
  pago_banco: string | null;
  mov_origem: string | null;
  mov_conciliado: boolean | null;
  mov_casada_ofx: boolean | null;
  eh_haver: boolean | null;
  nivel_rank: number | null;
  nivel_titulo: string | null;
  pedido_rank: number | null;
  pedido_selo: string | null;
};

/**
 * Níveis canônicos keyados por chave estável.
 * ATENÇÃO: `nivel_rank` da view NÃO é 1/2/3/4 (emite 0/1/3, com 3 valendo para
 * conciliado E haver). Por isso o bucket/rótulo vem SEMPRE do emoji contido nos
 * textos canônicos `nivel_titulo` / `pedido_selo`. O rank só serve para ordenar.
 */
type NivelKey = "recebivel" | "compensado" | "conciliado" | "haver";

const NIVEIS = [
  { key: "recebivel", emoji: "🔴", label: "Recebível", classe: "bg-red-100 text-red-800", texto: "text-red-800" },
  { key: "compensado", emoji: "🟡", label: "Compensado", classe: "bg-amber-100 text-amber-800", texto: "text-amber-800" },
  { key: "conciliado", emoji: "🟢", label: "Conciliado", classe: "bg-green-100 text-green-800", texto: "text-green-800" },
  { key: "haver", emoji: "🔵", label: "Quitado s/ caixa", classe: "bg-blue-100 text-blue-800", texto: "text-blue-800" },
] as const satisfies readonly { key: NivelKey; emoji: string; label: string; classe: string; texto: string }[];

/** Chave do nível a partir do emoji contido no texto canônico. */
function nivelPorTexto(texto: string | null | undefined): NivelKey | null {
  const s = texto || "";
  return NIVEIS.find((n) => s.includes(n.emoji))?.key ?? null;
}

function classePorTexto(selo: string | null | undefined): string {
  const s = selo || "";
  const found = NIVEIS.find((n) => s.includes(n.emoji));
  return found?.classe ?? "bg-muted text-muted-foreground";
}


function SeloBadge({ selo }: { selo: string | null }) {
  if (!selo) return <span className="text-muted-foreground">—</span>;
  return <Badge className={`${classePorTexto(selo)} hover:${classePorTexto(selo)}`}>{selo}</Badge>;
}

type Grupo = {
  key: string;
  pedido_id: string | null;
  pedido_ref: string | null;
  cliente: string | null;
  data_pedido: string | null;
  estagio: string | null;
  pedido_selo: string | null;
  pedido_rank: number;
  total: number;
  titulos: RecebimentoNivel[];
  porNivel: Record<number, { qtd: number; soma: number }>;
};

function useRecebimentoPedidoNivel() {
  return useQuery({
    queryKey: ["recebimento-pedido-nivel"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_recebimento_pedido_nivel")
        .select("*")
        .order("pedido_rank", { ascending: true })
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return (data || []) as RecebimentoNivel[];
    },
  });
}

export function RecebimentoPorPedido() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useRecebimentoPedidoNivel();
  const [selo, setSelo] = useState<string>("todos");
  const [forma, setForma] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const linhas = data || [];

  const formas = useMemo(() => {
    const set = new Set<string>();
    linhas.forEach((l) => l.tipo_pagamento && set.add(l.tipo_pagamento));
    return Array.from(set).sort();
  }, [linhas]);

  const totaisNivel = useMemo(() => {
    const acc: Record<number, { qtd: number; soma: number }> = {};
    NIVEIS.forEach((n) => (acc[n.rank] = { qtd: 0, soma: 0 }));
    linhas.forEach((l) => {
      const r = Number(l.nivel_rank || 0);
      if (!acc[r]) acc[r] = { qtd: 0, soma: 0 };
      acc[r].qtd += 1;
      acc[r].soma += Number(l.valor || 0);
    });
    return acc;
  }, [linhas]);

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const map = new Map<string, Grupo>();
    linhas.forEach((l) => {
      if (forma !== "todas" && l.tipo_pagamento !== forma) return;
      const key = l.pedido_id || l.pedido_ref || l.titulo_id;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          pedido_id: l.pedido_id,
          pedido_ref: l.pedido_ref,
          cliente: l.cliente,
          data_pedido: l.data_pedido,
          estagio: l.estagio,
          pedido_selo: l.pedido_selo,
          pedido_rank: Number(l.pedido_rank || 99),
          total: 0,
          titulos: [],
          porNivel: {},
        };
        map.set(key, g);
      }
      g.total += Number(l.valor || 0);
      g.titulos.push(l);
      const r = Number(l.nivel_rank || 0);
      if (!g.porNivel[r]) g.porNivel[r] = { qtd: 0, soma: 0 };
      g.porNivel[r].qtd += 1;
      g.porNivel[r].soma += Number(l.valor || 0);
    });

    let arr = Array.from(map.values());
    if (selo !== "todos") {
      const emoji = NIVEIS.find((n) => String(n.rank) === selo)?.emoji;
      arr = arr.filter((g) => (g.pedido_selo || "").includes(emoji || "\u0000"));
    }
    if (termo) {
      arr = arr.filter(
        (g) =>
          (g.pedido_ref || "").toLowerCase().includes(termo) ||
          (g.cliente || "").toLowerCase().includes(termo)
      );
    }
    arr.sort((a, b) => {
      if (a.pedido_rank !== b.pedido_rank) return a.pedido_rank - b.pedido_rank;
      return String(b.data_pedido || "").localeCompare(String(a.data_pedido || ""));
    });
    arr.forEach((g) =>
      g.titulos.sort((x, y) => Number(x.numero_parcela || 0) - Number(y.numero_parcela || 0))
    );
    return arr;
  }, [linhas, selo, forma, busca]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6 text-sm text-destructive">
          Não foi possível carregar os recebimentos por pedido.
          <div className="mt-2 font-mono text-xs opacity-80">{(error as Error)?.message}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {NIVEIS.map((n) => {
          const t = totaisNivel[n.rank] || { qtd: 0, soma: 0 };
          return (
            <Card key={n.rank}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  {n.emoji} {n.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${n.texto}`}>{formatBRL(t.soma)}</div>
                <p className="text-xs text-muted-foreground mt-1">{t.qtd} título(s)</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Selo do pedido</span>
          <Select value={selo} onValueChange={setSelo}>
            <SelectTrigger className="w-[210px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os selos</SelectItem>
              {NIVEIS.map((n) => (
                <SelectItem key={n.rank} value={String(n.rank)}>
                  {n.emoji} {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Forma</span>
          <Select value={forma} onValueChange={setForma}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as formas</SelectItem>
              {formas.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 min-w-[220px]">
          <span className="text-xs text-muted-foreground">Busca</span>
          <Input
            placeholder="Pedido ou cliente"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {grupos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Inbox className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nenhum pedido neste recorte.
              </p>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Selo</TableHead>
                    <TableHead>Resumo por nível</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grupos.map((g) => {
                    const open = !!abertos[g.key];
                    return (
                      <Fragment key={g.key}>
                        <TableRow>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setAbertos((p) => ({ ...p, [g.key]: !open }))}
                            >
                              {open ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {g.pedido_id ? (
                              <Button
                                variant="link"
                                className="h-auto p-0 font-mono text-xs"
                                onClick={() => navigate(`/pedidos/${g.pedido_id}`)}
                              >
                                {g.pedido_ref || "ver pedido"}
                              </Button>
                            ) : (
                              g.pedido_ref || "—"
                            )}
                          </TableCell>
                          <TableCell className="max-w-[240px] truncate">{g.cliente || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateBR(g.data_pedido)}</TableCell>
                          <TableCell>
                            <SeloBadge selo={g.pedido_selo} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {NIVEIS.filter((n) => g.porNivel[n.rank]?.qtd).map((n) => (
                                <span
                                  key={n.rank}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${n.classe}`}
                                  title={n.label}
                                >
                                  {n.emoji} {g.porNivel[n.rank].qtd}× {formatBRL(g.porNivel[n.rank].soma)}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono whitespace-nowrap">
                            {formatBRL(g.total)}
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30 p-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Título</TableHead>
                                    <TableHead>Parcela</TableHead>
                                    <TableHead>Forma</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead>Nível</TableHead>
                                    <TableHead>Pago no banco</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {g.titulos.map((t) => (
                                    <TableRow key={t.titulo_id}>
                                      <TableCell className="font-mono text-xs">
                                        {t.numero_titulo || "—"}
                                      </TableCell>
                                      <TableCell className="whitespace-nowrap text-xs">
                                        {t.numero_parcela ?? "—"}/{t.total_parcelas ?? "—"}
                                      </TableCell>
                                      <TableCell className="text-xs">{t.tipo_pagamento || "—"}</TableCell>
                                      <TableCell className="text-right font-mono whitespace-nowrap">
                                        {formatBRL(Number(t.valor || 0))}
                                      </TableCell>
                                      <TableCell>
                                        <SeloBadge selo={t.nivel_titulo} />
                                      </TableCell>
                                      <TableCell className="whitespace-nowrap text-xs">
                                        {t.pago_banco ? formatDateBR(t.pago_banco) : "—"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default RecebimentoPorPedido;
