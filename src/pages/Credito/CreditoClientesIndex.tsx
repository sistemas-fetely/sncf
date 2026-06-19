import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { CriarHaverDialog } from "@/components/credito/CriarHaverDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function CreditoClientesIndex() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const [criarHaverOpen, setCriarHaverOpen] = useState(false);
  const [tab, setTab] = useState<"todos" | "com_haver" | "com_vencidos">("todos");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const resumosQ = useQuery({
    queryKey: ["credito-clientes-resumos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_recebivel_b2b_por_conta")
        .select("parceiro_id, cliente, total_a_receber, total_vencido, faixa_a_vencer, qtd_titulos, dias_atraso_max")
        .gt("total_a_receber", 0)
        .order("total_vencido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const haveresQ = useQuery({
    queryKey: ["credito-clientes-haveres"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("haver_cliente")
        .select("parceiro_id, saldo, status")
        .eq("status", "disponivel");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const clientes = useMemo(() => {
    const resumos = resumosQ.data ?? [];
    const haveres = haveresQ.data ?? [];
    return resumos.map((r: any) => ({
      ...r,
      razao_social: r.cliente,
      em_aberto: r.total_a_receber,
      vencidos: r.total_vencido,
      a_vencer: r.faixa_a_vencer,
      haver_disponivel: haveres
        .filter((h: any) => h.parceiro_id === r.parceiro_id)
        .reduce((acc: number, h: any) => acc + (Number(h.saldo) || 0), 0),
    }));
  }, [resumosQ.data, haveresQ.data]);

  const totalHaveres = clientes.reduce((s: number, c: any) => s + (c.haver_disponivel ?? 0), 0);
  const totalAVencer = clientes.reduce((s: number, c: any) => s + (c.a_vencer ?? 0), 0);
  const totalVencidos = clientes.reduce((s: number, c: any) => s + (c.vencidos ?? 0), 0);
  const posicaoLiquida = clientes.reduce((s: number, c: any) => s + (c.em_aberto ?? 0), 0) - totalHaveres;

  const filtrados = useMemo(() => {
    let arr = [...clientes];
    if (tab === "com_haver") arr = arr.filter((c: any) => c.haver_disponivel > 0);
    if (tab === "com_vencidos") arr = arr.filter((c: any) => c.vencidos > 0);
    if (sort) {
      arr.sort((a: any, b: any) => {
        const va = a[sort.key] ?? 0;
        const vb = b[sort.key] ?? 0;
        if (typeof va === "string" && typeof vb === "string") {
          return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sort.dir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
      });
    }
    return arr;
  }, [clientes, tab, sort]);

  const loading = resumosQ.isLoading || haveresQ.isLoading;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs", to: "/pedidos" },
          { label: "Crédito do cliente" },
        ]}
        title="Posição de crédito por cliente"
        subtitle="Haveres, em aberto, vencidos e posição líquida"
        actions={
          isSuperAdmin ? (
            <Button size="sm" onClick={() => setCriarHaverOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar haver manual
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total de haveres" value={fmtBRL.format(totalHaveres)} tone="success" />
        <KpiCard label="Total a vencer" value={fmtBRL.format(totalAVencer)} />
        <KpiCard
          label="Total vencidos"
          value={fmtBRL.format(totalVencidos)}
          tone={totalVencidos > 0 ? "danger" : undefined}
        />
        <KpiCard
          label="Posição líquida"
          value={fmtBRL.format(posicaoLiquida)}
          tone={posicaoLiquida < 0 ? "success" : undefined}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="todos">Todos ({clientes.length})</TabsTrigger>
          <TabsTrigger value="com_haver">
            Com haver ({clientes.filter((c: any) => c.haver_disponivel > 0).length})
          </TabsTrigger>
          <TabsTrigger value="com_vencidos">
            Com vencidos ({clientes.filter((c: any) => c.vencidos > 0).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <SortTh label="Cliente" sortKey="razao_social" sort={sort} setSort={setSort} />
                      <SortTh label="Haver disponível" sortKey="haver_disponivel" sort={sort} setSort={setSort} align="right" />
                      <SortTh label="Em aberto" sortKey="em_aberto" sort={sort} setSort={setSort} align="right" />
                      <SortTh label="Vencido" sortKey="vencidos" sort={sort} setSort={setSort} align="right" />
                      <th className="text-right px-4 py-2">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          Carregando…
                        </td>
                      </tr>
                    )}
                    {!loading && filtrados.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhum cliente encontrado.
                        </td>
                      </tr>
                    )}
                    {filtrados.map((c: any) => (
                      <tr key={c.parceiro_id} className="border-t hover:bg-accent/40">
                        <td className="px-4 py-2">
                          <div className="font-medium">{c.razao_social}</div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {c.haver_disponivel > 0 ? (
                            <span className="font-medium text-emerald-600">
                              {fmtBRL.format(c.haver_disponivel)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {(c.em_aberto ?? 0) > 0
                            ? fmtBRL.format(c.em_aberto)
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {(c.vencidos ?? 0) > 0 ? (
                            <span className="font-medium text-destructive">
                              {fmtBRL.format(c.vencidos)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/credito/clientes/${c.parceiro_id}`)}
                          >
                            Ver →
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CriarHaverDialog
        open={criarHaverOpen}
        onOpenChange={setCriarHaverOpen}
        parceiroId={null}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
      ? "text-destructive"
      : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6 space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-semibold ${toneCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
