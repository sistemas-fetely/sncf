/**
 * Integridade Financeira — auditoria consolidada de achados na malha
 * financeira dos pedidos. Fonte: `vw_auditoria_integridade_financeira`.
 *
 * Uma linha por achado; um mesmo pedido pode aparecer em mais de uma
 * classe. A tela agrupa por classe e destaca a `acao` — que é a
 * instrução operacional a executar.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import type { EstagioPedido } from "@/types/pedido";
import { cn } from "@/lib/utils";
import { CheckCircle2, ShieldAlert, AlertTriangle, Info } from "lucide-react";

type Achado = {
  severidade: number | null;
  classe: string | null;
  pedido_id: string | null;
  id_externo: string | null;
  cliente: string | null;
  estagio: string | null;
  valor: number | null;
  detalhe: string | null;
  acao: string | null;
};

const CLASSE_LABEL: Record<string, string> = {
  REALOCAR_DO_PAI: "Realocar do pedido pai",
  REALOCAR_PARCIAL: "Realocar parcial + faturar diferença",
  BOLETO_PAGO_SEM_EVIDENCIA: "Boleto pago sem evidência bancária",
  FATURAR_REMESSA: "Remessa a faturar",
  PEDIDO_SEM_RECEBIVEL: "Pedido sem recebível",
  SUBFATURADO: "Subfaturado",
  SOBREFATURADO: "Sobrefaturado",
  BOLETO_SEM_MOVIMENTACAO: "Boleto sem movimentação vinculada",
  PAGO_SEM_VINCULO_ORIGEM: "Pago sem vínculo de origem",
  CANCELADO_ESTACIONADO: "Cancelado estacionado",
};

const labelClasse = (c: string | null) => (c && CLASSE_LABEL[c]) || c || "—";

const SEV_META = {
  1: {
    label: "Risco de dinheiro",
    icon: ShieldAlert,
    card: "border-destructive/40 bg-destructive/5",
    active: "ring-2 ring-destructive",
    icone: "text-destructive",
  },
  2: {
    label: "Furo de faturamento",
    icon: AlertTriangle,
    card: "border-warning/40 bg-warning/5",
    active: "ring-2 ring-warning",
    icone: "text-warning",
  },
  3: {
    label: "Rastreabilidade",
    icon: Info,
    card: "border-border bg-muted/30",
    active: "ring-2 ring-muted-foreground",
    icone: "text-muted-foreground",
  },
} as const;

export default function IntegridadeFinanceira() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [sevFiltro, setSevFiltro] = useState<number | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["integridade-financeira"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_auditoria_integridade_financeira" as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as Achado[];
    },
  });

  const totaisPorSev = useMemo(() => {
    const acc: Record<number, { count: number; total: number }> = {
      1: { count: 0, total: 0 },
      2: { count: 0, total: 0 },
      3: { count: 0, total: 0 },
    };
    for (const a of data) {
      const s = a.severidade ?? 0;
      if (!acc[s]) continue;
      acc[s].count += 1;
      acc[s].total += Number(a.valor || 0);
    }
    return acc;
  }, [data]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return data.filter((a) => {
      if (sevFiltro && a.severidade !== sevFiltro) return false;
      if (!q) return true;
      return (
        (a.id_externo || "").toLowerCase().includes(q) ||
        (a.cliente || "").toLowerCase().includes(q)
      );
    });
  }, [data, busca, sevFiltro]);

  const grupos = useMemo(() => {
    const map = new Map<string, { classe: string; severidade: number; itens: Achado[]; total: number }>();
    for (const a of filtrados) {
      const key = a.classe || "—";
      const g = map.get(key) ?? {
        classe: key,
        severidade: a.severidade ?? 99,
        itens: [] as Achado[],
        total: 0,
      };
      g.itens.push(a);
      g.total += Number(a.valor || 0);
      g.severidade = Math.min(g.severidade, a.severidade ?? 99);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.severidade !== b.severidade) return a.severidade - b.severidade;
      return b.total - a.total;
    });
  }, [filtrados]);

  const toggleSev = (s: number) => setSevFiltro((cur) => (cur === s ? null : s));

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integridade Financeira</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Achados de auditoria na malha financeira dos pedidos. A coluna <span className="font-medium">Ação</span> é a
          instrução operacional a executar.
        </p>
      </div>

      {/* Cards de severidade */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {([1, 2, 3] as const).map((s) => {
          const meta = SEV_META[s];
          const Icon = meta.icon;
          const ativo = sevFiltro === s;
          const t = totaisPorSev[s];
          return (
            <Card
              key={s}
              onClick={() => toggleSev(s)}
              className={cn(
                "cursor-pointer transition-all border",
                meta.card,
                ativo && meta.active
              )}
            >
              <CardContent className="p-5 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Severidade {s}
                  </div>
                  <div className="text-base font-medium">{meta.label}</div>
                  <div className="text-2xl font-bold tabular-nums">{t.count}</div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {formatBRL(t.total)}
                  </div>
                </div>
                <Icon className={cn("h-6 w-6 flex-shrink-0", meta.icone)} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Input
          placeholder="Buscar por pedido ou cliente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-md"
        />
        {sevFiltro !== null && (
          <Badge
            variant="secondary"
            className="cursor-pointer"
            onClick={() => setSevFiltro(null)}
          >
            Severidade {sevFiltro} · limpar ✕
          </Badge>
        )}
        <div className="text-sm text-muted-foreground ml-auto">
          {filtrados.length} de {data.length} achados
        </div>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-8 text-center">Carregando…</div>
      ) : filtrados.length === 0 ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-10 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <div className="text-lg font-medium">Tudo limpo por aqui.</div>
            <div className="text-sm text-muted-foreground max-w-md">
              Nenhuma inconsistência financeira foi encontrada com os filtros atuais.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <Card key={g.classe} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b bg-muted/40">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "flex-shrink-0",
                      g.severidade === 1 && "border-destructive text-destructive",
                      g.severidade === 2 && "border-warning text-warning",
                      g.severidade === 3 && "text-muted-foreground"
                    )}
                  >
                    Sev {g.severidade}
                  </Badge>
                  <div className="font-semibold truncate">{labelClasse(g.classe)}</div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {g.itens.length} {g.itens.length === 1 ? "achado" : "achados"}
                  </span>
                </div>
                <div className="text-sm font-semibold tabular-nums flex-shrink-0">
                  {formatBRL(g.total)}
                </div>
              </div>
              <div className="divide-y">
                {g.itens.map((a, idx) => (
                  <button
                    key={`${a.pedido_id}-${idx}`}
                    onClick={() => a.pedido_id && navigate(`/pedidos/${a.pedido_id}`)}
                    disabled={!a.pedido_id}
                    className={cn(
                      "w-full text-left px-5 py-3 grid grid-cols-12 gap-3 items-start",
                      "hover:bg-muted/40 transition-colors",
                      !a.pedido_id && "cursor-default hover:bg-transparent"
                    )}
                  >
                    <div className="col-span-12 md:col-span-2 flex flex-col gap-1">
                      <span className="text-sm font-medium tabular-nums">
                        {a.id_externo || "—"}
                      </span>
                      {a.estagio && (
                        <EstagioBadge estagio={a.estagio as EstagioPedido} />
                      )}
                    </div>
                    <div className="col-span-12 md:col-span-3 text-sm">
                      <div className="truncate" title={a.cliente ?? ""}>
                        {a.cliente || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums mt-1">
                        {formatBRL(Number(a.valor || 0))}
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-3 text-xs text-muted-foreground">
                      {a.detalhe || "—"}
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      {a.acao ? (
                        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
                          <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-0.5">
                            Ação
                          </div>
                          <div className="leading-snug">{a.acao}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">sem ação sugerida</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
