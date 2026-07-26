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
import { toast } from "sonner";
import {
  Copy, ExternalLink, Mail, Phone, Search, Sparkles, Loader2,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

interface OportunidadeRow {
  pedido_id: string;
  id_externo: string | null;
  data_pedido: string | null;
  dias_desde_pedido: number | null;
  valor_liquido: number | null;
  vendedor: string | null;
  condicao_solicitada: string | null;
  forma_solicitada: string | null;
  observacao_cliente: string | null;
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
  parcelas_restantes: number | null;
}

function corDiasVencido(dias: number | null | undefined) {
  const d = Number(dias ?? 0);
  if (d <= 15) return "bg-muted text-muted-foreground";
  if (d <= 45) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-destructive/15 text-destructive font-semibold";
}

async function copiar(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Link de pagamento copiado");
  } catch {
    toast.error("Não foi possível copiar o link");
  }
}

export default function Oportunidades() {
  const [busca, setBusca] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["oportunidades-comercial"],
    queryFn: async (): Promise<OportunidadeRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_oportunidades_comercial")
        .select("*")
        .order("dias_portao_vencido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OportunidadeRow[];
    },
  });

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return data;
    return data.filter((r) =>
      [r.id_externo, r.cliente, r.cnpj, r.vendedor]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, busca]);

  const kpis = useMemo(() => {
    const qtd = filtradas.length;
    const valor = filtradas.reduce((s, r) => s + Number(r.valor_liquido || 0), 0);
    const media =
      qtd > 0
        ? filtradas.reduce((s, r) => s + Number(r.dias_portao_vencido || 0), 0) / qtd
        : 0;
    return { qtd, valor, media };
  }, [filtradas]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <CasaPageHeader
        breadcrumb={[
          { label: "Comercial" },
          { label: "Oportunidades" },
        ]}
        title="Oportunidades"
        subtitle="Pedidos cujo portão de pagamento venceu sem pagamento e foram devolvidos ao Comercial. O link segue ativo — retome o contato com o cliente para converter."
      />


      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="Oportunidades" value={String(kpis.qtd)} />
        <KpiCard label="Valor total" value={formatBRL(kpis.valor)} />
        <KpiCard
          label="Média de dias vencido"
          value={kpis.qtd > 0 ? `${kpis.media.toFixed(0)} dias` : "—"}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-full md:w-96">
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
                Nenhuma oportunidade devolvida ao Comercial no momento.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Pedidos aparecem aqui quando o portão de pagamento passa da tolerância
                sem pagamento.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Valor portão</TableHead>
                    <TableHead>Vencimento portão</TableHead>
                    <TableHead className="text-right">Dias vencido</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((r) => (
                    <TableRow key={r.pedido_id}>
                      <TableCell className="font-mono text-xs">
                        {r.id_externo || "—"}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate font-medium">{r.cliente || "—"}</div>
                        {r.cnpj && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {r.cnpj}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatBRL(r.valor_liquido ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatBRL(r.valor_portao ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateBR(r.vencimento_portao)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={cn(
                            "border-0 rounded px-2 py-0.5",
                            corDiasVencido(r.dias_portao_vencido),
                          )}
                        >
                          {r.dias_portao_vencido ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.vendedor || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
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
    </div>
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
