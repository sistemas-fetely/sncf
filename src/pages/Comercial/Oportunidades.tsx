import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Copy, ExternalLink, Mail, Phone, Search, Sparkles, Loader2, Undo2,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { RetomarOportunidadeDialog } from "@/components/comercial/RetomarOportunidadeDialog";

type OrigemOportunidade = "portao_vencido" | "estoque_inadimplente" | "manual";

interface OportunidadeRow {
  pedido_id: string;
  id_externo: string | null;
  origem: OrigemOportunidade;
  motivo: string | null;
  justificativa: string | null;
  retomavel_para: string | null;
  migrado_em: string | null;
  dias_na_fila: number | null;
  data_pedido: string | null;
  dias_desde_pedido: number | null;
  valor_em_jogo: number | null;
  vendedor: string | null;
  condicao_solicitada: string | null;
  forma_solicitada: string | null;
  observacao_cliente: string | null;
  pai_id: string | null;
  pai_id_externo: string | null;
  parceiro_id: string | null;
  cliente: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  portao_id: string | null;
  valor_portao: number | null;
  tipo_portao: string | null;
  vencimento_portao: string | null;
  dias_portao_vencido: number | null;
  link_pagamento: string | null;
  status_portao: string | null;
  valor_pago: number | null;
  valor_vencido: number | null;
  dias_atraso_max: number | null;
  dias_referencia: number | null;
}

function corDiasVencido(dias: number | null | undefined) {
  const d = Number(dias ?? 0);
  if (d <= 15) return "bg-muted text-muted-foreground";
  if (d <= 45) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-destructive/15 text-destructive font-semibold";
}

const ORIGEM_LABEL: Record<OrigemOportunidade, string> = {
  portao_vencido: "Portão vencido",
  estoque_inadimplente: "Aguardando estoque",
  manual: "Manual",
};

const ORIGEM_CLASSES: Record<OrigemOportunidade, string> = {
  portao_vencido: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  estoque_inadimplente: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  manual: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

async function copiar(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Link de pagamento copiado");
  } catch {
    toast.error("Não foi possível copiar o link");
  }
}

type FiltroOrigem = "todas" | OrigemOportunidade;

export default function Oportunidades() {
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState<FiltroOrigem>("todas");
  const [retomando, setRetomando] = useState<OportunidadeRow | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["oportunidades-comercial"],
    queryFn: async (): Promise<OportunidadeRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_oportunidades_comercial")
        .select("*")
        .order("dias_referencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OportunidadeRow[];
    },
  });

  const contagens = useMemo(() => {
    const c = { todas: data.length, portao_vencido: 0, estoque_inadimplente: 0, manual: 0 };
    for (const r of data) {
      if (r.origem === "portao_vencido") c.portao_vencido++;
      else if (r.origem === "estoque_inadimplente") c.estoque_inadimplente++;
      else if (r.origem === "manual") c.manual++;
    }
    return c;
  }, [data]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let base = origem === "todas" ? data : data.filter((r) => r.origem === origem);
    if (q) {
      base = base.filter((r) =>
        [r.id_externo, r.cliente, r.cnpj, r.vendedor]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return base;
  }, [data, busca, origem]);

  const kpis = useMemo(() => {
    const qtd = filtradas.length;
    const valor = filtradas.reduce((s, r) => s + Number(r.valor_em_jogo || 0), 0);
    const vencido = filtradas.reduce((s, r) => s + Number(r.valor_vencido || 0), 0);
    const media =
      qtd > 0
        ? filtradas.reduce((s, r) => s + Number(r.dias_referencia || 0), 0) / qtd
        : 0;
    return { qtd, valor, vencido, media };
  }, [filtradas]);

  return (
    <TooltipProvider>
      <div className="space-y-6 p-4 md:p-6">
        <CasaPageHeader
          breadcrumb={[{ label: "Comercial" }, { label: "Oportunidades" }]}
          title="Oportunidades"
          subtitle="Fila única do Comercial: pedidos migrados manualmente, portão vencido ou remessas cujo pai tem parcela vencida. Retome quando o cliente estiver pronto."
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Oportunidades" value={String(kpis.qtd)} />
          <KpiCard label="Valor em jogo" value={formatBRL(kpis.valor)} />
          <KpiCard label="Valor vencido" value={formatBRL(kpis.vencido)} />
          <KpiCard
            label="Média de dias"
            value={kpis.qtd > 0 ? `${kpis.media.toFixed(0)} dias` : "—"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border overflow-hidden">
            <FiltroBtn ativo={origem === "todas"} onClick={() => setOrigem("todas")}>
              Todas ({contagens.todas})
            </FiltroBtn>
            <FiltroBtn
              ativo={origem === "portao_vencido"}
              onClick={() => setOrigem("portao_vencido")}
            >
              Portão vencido ({contagens.portao_vencido})
            </FiltroBtn>
            <FiltroBtn
              ativo={origem === "estoque_inadimplente"}
              onClick={() => setOrigem("estoque_inadimplente")}
            >
              Aguardando estoque ({contagens.estoque_inadimplente})
            </FiltroBtn>
            <FiltroBtn ativo={origem === "manual"} onClick={() => setOrigem("manual")}>
              Manual ({contagens.manual})
            </FiltroBtn>
          </div>
          <div className="relative w-full md:w-96 md:ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por pedido, cliente, CNPJ, vendedor…"
              className="pl-8 h-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtradas.length === 0 ? (
              <div className="text-center py-16 px-6">
                <Sparkles className="h-8 w-8 text-muted-foreground/60 mx-auto mb-3" />
                <p className="text-sm font-medium">
                  Nenhuma oportunidade encontrada com os filtros atuais.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ajuste a busca ou o filtro de origem para ver a fila completa.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Valor em jogo</TableHead>
                      <TableHead className="text-right">Vencido</TableHead>
                      <TableHead className="text-right">Já pagou</TableHead>
                      <TableHead>Pai</TableHead>
                      <TableHead className="text-right">Na fila</TableHead>
                      <TableHead className="text-right">Dias</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((r) => (
                      <TableRow key={`${r.origem}-${r.pedido_id}`}>
                        <TableCell className="font-mono text-xs">
                          {r.id_externo || "—"}
                          {r.origem === "portao_vencido" && r.vencimento_portao && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              venc. {formatDateBR(r.vencimento_portao)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "border-0 rounded px-2 py-0.5 whitespace-nowrap",
                                  ORIGEM_CLASSES[r.origem],
                                )}
                              >
                                {ORIGEM_LABEL[r.origem]}
                              </Badge>
                            </TooltipTrigger>
                            {r.motivo && (
                              <TooltipContent className="max-w-xs">
                                {r.motivo}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <div className="truncate font-medium">{r.cliente || "—"}</div>
                          {r.cnpj && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {r.cnpj}
                            </div>
                          )}
                          {r.justificativa?.trim() && (
                            <div className="mt-1">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Justificativa do operador
                              </div>
                              <blockquote
                                title={r.justificativa}
                                className="text-[11px] italic text-muted-foreground border-l-2 border-border pl-2 line-clamp-2"
                              >
                                {r.justificativa}
                              </blockquote>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatBRL(r.valor_em_jogo ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(r.valor_vencido || 0) > 0
                            ? formatBRL(r.valor_vencido!)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(r.valor_pago || 0) > 0 ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              {formatBRL(r.valor_pago!)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.pai_id ? (
                            <Link
                              to={`/pedidos/${r.pai_id}`}
                              className="font-mono text-primary hover:underline"
                            >
                              {r.pai_id_externo || "abrir"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="rounded px-2 py-0.5">
                            {r.dias_na_fila ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-0 rounded px-2 py-0.5",
                              corDiasVencido(r.dias_referencia),
                            )}
                          >
                            {r.dias_referencia ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.vendedor || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 gap-1.5"
                              onClick={() => setRetomando(r)}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Retomar
                            </Button>
                            {r.link_pagamento && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Copiar link de pagamento"
                                onClick={() => copiar(r.link_pagamento!)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                            {r.telefone && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title={`Ligar: ${r.telefone}`}
                                asChild
                              >
                                <a href={`tel:${r.telefone}`}>
                                  <Phone className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {r.email && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title={`E-mail: ${r.email}`}
                                asChild
                              >
                                <a href={`mailto:${r.email}`}>
                                  <Mail className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Abrir pedido"
                              asChild
                            >
                              <Link to={`/pedidos/${r.pedido_id}`}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {retomando && (
          <RetomarOportunidadeDialog
            open={!!retomando}
            onOpenChange={(v) => !v && setRetomando(null)}
            pedidoId={retomando.pedido_id}
            idExterno={retomando.id_externo}
            cliente={retomando.cliente}
            retomavelPara={retomando.retomavel_para}
            invalidateKeys={[["oportunidades-comercial"]]}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function FiltroBtn({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-xs font-medium border-r last:border-r-0 transition-colors",
        ativo
          ? "bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
