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
        .eq("status", "disponivel")
        .gt("saldo", 0);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const parceirosAllQ = useQuery({
    queryKey: ["credito-parceiros-all", resumosQ.data?.map((r: any) => r.parceiro_id), haveresQ.data?.map((h: any) => h.parceiro_id)],
    enabled: (resumosQ.data?.length ?? 0) > 0 || (haveresQ.data?.length ?? 0) > 0,
    queryFn: async () => {
      const idsResumos = (resumosQ.data ?? []).map((r: any) => r.parceiro_id);
      const idsHaveres = (haveresQ.data ?? []).map((h: any) => h.parceiro_id);
      const ids = [...new Set([...idsResumos, ...idsHaveres])].filter(Boolean);
      if (ids.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, cnpj")
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const clientes = useMemo(() => {
    const resumos = resumosQ.data ?? [];
    const haveres = haveresQ.data ?? [];

    const parceirosMap: Record<string, { razao_social: string; cnpj: string }> = {};
    (parceirosHaverQ.data ?? []).forEach((p: any) => {
      parceirosMap[p.id] = { razao_social: p.razao_social, cnpj: p.cnpj };
    });

    // Agrupar haveres por parceiro com nome
    const haverPorParceiro: Record<string, { total: number; razao_social: string | null; cnpj: string | null }> = {};
    haveres.forEach((h: any) => {
      const pid = h.parceiro_id;
      if (!haverPorParceiro[pid]) {
        haverPorParceiro[pid] = {
          total: 0,
          razao_social: parceirosMap[pid]?.razao_social ?? null,
          cnpj: parceirosMap[pid]?.cnpj ?? null,
        };
      }
      haverPorParceiro[pid].total += Number(h.saldo) || 0;
    });

    // Resumos enriquecidos com haver
    const parceirosNoResumo = new Set(resumos.map((r: any) => r.parceiro_id));
    const resumosComHaver = resumos.map((r: any) => ({
      ...r,
      razao_social: r.cliente ?? r.razao_social,
      em_aberto:    Number(r.total_a_receber ?? 0),
      vencidos:     Number(r.total_vencido   ?? 0),
      a_vencer:     Number(r.faixa_a_vencer  ?? 0),
      haver_disponivel: haverPorParceiro[r.parceiro_id]?.total ?? 0,
    }));

    // Parceiros com haver mas SEM títulos em aberto — não estavam na lista
    const extras = Object.entries(haverPorParceiro)
      .filter(([pid]) => !parceirosNoResumo.has(pid))
      .map(([pid, info]) => ({
        parceiro_id: pid,
        razao_social: info.razao_social,
        cnpj: info.cnpj,
        cliente: info.razao_social,
        total_a_receber: 0,
        total_vencido: 0,
        faixa_a_vencer: 0,
        qtd_titulos: 0,
        dias_atraso_max: 0,
        em_aberto: 0,
        vencidos: 0,
        a_vencer: 0,
        haver_disponivel: info.total,
      }));

    return [...resumosComHaver, ...extras].filter(
      (c) => (c.em_aberto ?? c.total_a_receber ?? 0) > 0 ||
              (c.vencidos ?? c.total_vencido ?? 0) > 0 ||
              (c.haver_disponivel ?? 0) > 0
    );
  }, [resumosQ.data, haveresQ.data, parceirosHaverQ.data]);

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

  const loading = resumosQ.isLoading || haveresQ.isLoading || parceirosHaverQ.isLoading;

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
                        <p className="font-medium truncate text-sm">{c.razao_social ?? c.cliente ?? "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.cnpj ?? ""}</p>
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

function SortTh({
  label,
  sortKey,
  sort,
  setSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: "asc" | "desc" } | null;
  setSort: React.Dispatch<React.SetStateAction<{ key: string; dir: "asc" | "desc" } | null>>;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={`px-4 py-2 cursor-pointer select-none hover:text-foreground transition-colors ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() =>
        setSort((prev) =>
          prev?.key === sortKey
            ? { key: sortKey, dir: prev.dir === "asc" ? "desc" : "asc" }
            : { key: sortKey, dir: "desc" }
        )
      }
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className="h-3 w-3 opacity-60" />
      </span>
    </th>
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
