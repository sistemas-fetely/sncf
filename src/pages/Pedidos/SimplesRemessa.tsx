import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download, Loader2, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { NovaTransferenciaForm } from "@/components/transferencias/NovaTransferenciaForm";

interface RemessaRow {
  id: string;
  id_externo: string | null;
  estagio: string | null;
  data_pedido: string | null;
  recebido_em: string | null;
  valor_bruto: number | null;
  cancelado_em: string | null;
  natureza_nome: string | null;
  destino_rotulo: string | null;
  qtd_pecas: number | null;
  nf_numero: string | null;
  nf_situacao: string | null;
}

interface ConsumoRow {
  sku: string;
  descricao: string | null;
  mes: string;
  pecas_consumidas: number | null;
  valor_custo: number | null;
}

const REMESSA_MOSTRUARIO = {
  naturezaCodigo: "remessa_mostruario",
  resumo: "Tipo: Mostruário (Show Room) · Destino: Show Room · Origem: XPM-SC · consumo imediato na emissão da NF",
};

function SeloEstagio({ estagio }: { estagio: string | null }) {
  if (!estagio) return <span className="text-sm text-muted-foreground">—</span>;
  if (estagio in ESTAGIO_LABELS) return <EstagioBadge estagio={estagio as EstagioPedido} />;
  return <Badge variant="outline">{estagio}</Badge>;
}

function mesISO(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function PainelRemessas() {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["simples-remessas"],
    queryFn: async (): Promise<RemessaRow[]> => {
      const { data, error } = await (supabase as any)
        .from("v_simples_remessas")
        .select("id, id_externo, estagio, data_pedido, recebido_em, valor_bruto, cancelado_em, natureza_nome, destino_rotulo, qtd_pecas, nf_numero, nf_situacao")
        .order("recebido_em", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as RemessaRow[]).sort((a, b) => Number(!!a.cancelado_em) - Number(!!b.cancelado_em));
    },
  });
  useEffect(() => { if (q.isError) toast.error(formatError(q.error)); }, [q.isError, q.error]);
  const linhas = q.data ?? [];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Remessas</CardTitle></CardHeader>
      <CardContent>
        {q.isLoading ? <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        : q.isError ? <p className="text-sm text-destructive">Falha ao carregar remessas: {formatError(q.error)}</p>
        : linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma remessa ainda. Crie na aba Nova remessa.</p>
        : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Remessa</TableHead><TableHead>Data</TableHead><TableHead>Natureza</TableHead><TableHead>Destino</TableHead>
              <TableHead className="text-right">Peças</TableHead><TableHead className="text-right">Valor (custo)</TableHead><TableHead>Estágio</TableHead><TableHead>NF</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {linhas.map((r) => (
                <TableRow key={r.id} className={r.cancelado_em ? "opacity-60" : "cursor-pointer"} onClick={() => navigate(`/pedidos/${r.id}`)}>
                  <TableCell className="font-medium text-primary">{r.id_externo ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{r.data_pedido ? formatDateBR(r.data_pedido) : "—"}</TableCell>
                  <TableCell>{r.natureza_nome ?? "—"}</TableCell>
                  <TableCell>{r.destino_rotulo ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.qtd_pecas ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(r.valor_bruto)}</TableCell>
                  <TableCell>{r.cancelado_em ? <Badge variant="outline">Cancelada</Badge> : <SeloEstagio estagio={r.estagio} />}</TableCell>
                  <TableCell className="text-sm">{r.nf_numero ? <>{r.nf_numero}{r.nf_situacao && <span className="text-muted-foreground"> · {r.nf_situacao}</span>}</> : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ConsumoShowroom() {
  const [de, setDe] = useState(mesISO(-5));
  const [ate, setAte] = useState(mesISO(0));
  const [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["consumo-showroom", de, ate],
    enabled: !!de && !!ate,
    queryFn: async (): Promise<ConsumoRow[]> => {
      const out: ConsumoRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabase as any)
          .from("v_consumo_showroom")
          .select("sku, descricao, mes, pecas_consumidas, valor_custo")
          .gte("mes", `${de}-01`).lte("mes", `${ate}-01`)
          .order("sku").range(from, from + 999);
        if (error) throw error;
        out.push(...((data ?? []) as ConsumoRow[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
  useEffect(() => { if (q.isError) toast.error(formatError(q.error)); }, [q.isError, q.error]);

  const agregado = useMemo(() => {
    const m = new Map<string, { sku: string; descricao: string; pecas: number; valor: number }>();
    for (const r of q.data ?? []) {
      const g = m.get(r.sku) ?? { sku: r.sku, descricao: r.descricao ?? "", pecas: 0, valor: 0 };
      g.pecas += Number(r.pecas_consumidas ?? 0);
      g.valor += Number(r.valor_custo ?? 0);
      if (!g.descricao && r.descricao) g.descricao = r.descricao;
      m.set(r.sku, g);
    }
    const t = busca.trim().toLowerCase();
    return [...m.values()]
      .filter((g) => !t || g.sku.toLowerCase().includes(t) || g.descricao.toLowerCase().includes(t))
      .sort((a, b) => b.pecas - a.pecas || a.sku.localeCompare(b.sku));
  }, [q.data, busca]);
  const totalPecas = agregado.reduce((s, g) => s + g.pecas, 0);
  const totalValor = agregado.reduce((s, g) => s + g.valor, 0);

  const exportar = () => {
    try {
      const ws = XLSX.utils.json_to_sheet(agregado.map((g) => ({ SKU: g.sku, "Descrição": g.descricao, "Peças consumidas": g.pecas, "Valor a custo": Math.round(g.valor * 100) / 100 })));
      XLSX.utils.sheet_add_json(ws, [{ SKU: "Total", "Descrição": "", "Peças consumidas": totalPecas, "Valor a custo": Math.round(totalValor * 100) / 100 }], { skipHeader: true, origin: -1 });
      ws["!cols"] = [{ wch: 18 }, { wch: 50 }, { wch: 16 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Consumo Show Room");
      XLSX.writeFile(wb, `consumo-showroom_${de}_a_${ate}.xlsx`);
    } catch (e) {
      toast.error(formatError(e));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Consumo do Show Room</CardTitle>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!agregado.length}><Download className="h-4 w-4" />Exportar Excel</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm"><span className="block text-muted-foreground">Mês inicial</span><Input type="month" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" aria-label="Mês inicial" /></label>
          <label className="space-y-1 text-sm"><span className="block text-muted-foreground">Mês final</span><Input type="month" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" aria-label="Mês final" /></label>
          <Input placeholder="Buscar SKU ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-64" aria-label="Buscar SKU ou descrição" />
        </div>
        {q.isLoading ? <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        : q.isError ? <p className="text-sm text-destructive">Falha ao carregar consumo: {formatError(q.error)}</p>
        : agregado.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum consumo no período.</p>
        : (
          <div className="max-h-[520px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background"><TableRow>
                <TableHead>SKU</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Peças consumidas</TableHead><TableHead className="text-right">Valor a custo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {agregado.map((g) => (
                  <TableRow key={g.sku}>
                    <TableCell className="font-mono text-xs">{g.sku}</TableCell>
                    <TableCell className="text-sm">{g.descricao || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.pecas}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(g.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter><TableRow>
                <TableCell colSpan={2}>Total · {agregado.length} SKUs</TableCell>
                <TableCell className="text-right tabular-nums">{totalPecas}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBRL(totalValor)}</TableCell>
              </TableRow></TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SimplesRemessa() {
  const [abaUrl, setAba] = useAbaUrl("painel");
  const aba = abaUrl === "nova" ? "nova" : "painel";
  return (
    <PageShell>
      <PageHeader
        titulo="Simples Remessa"
        breadcrumb={[{ label: "Operação" }, { label: "Simples Remessa" }]}
        icone={Send}
        estado="Saída para destino sem controle de estoque — mostruário do Show Room é consumido na remessa"
      />
      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="nova">Nova remessa</TabsTrigger>
        </TabsList>
        <TabsContent value="painel" className="space-y-4">
          <PainelRemessas />
          <ConsumoShowroom />
        </TabsContent>
        <TabsContent value="nova">
          <NovaTransferenciaForm remessa={REMESSA_MOSTRUARIO} onCriado={() => setAba("painel")} onCancelar={() => setAba("painel")} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
