import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import {
  Truck,
  ArrowLeft,
  PackageCheck,
  Search,
  MoreHorizontal,
  Clock,
  ShoppingBag,
  CheckCircle2,
  FileEdit,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PedidoStatusBadge } from "@/components/compras/PedidoStatusBadge";
import { PedidoDetalheComprador } from "@/components/compras/PedidoDetalheComprador";
import { RegistrarCompraDialog } from "@/components/compras/RegistrarCompraDialog";
import { usePedidosAComprar, type ComprarTab } from "@/hooks/compras/usePedidosAComprar";
import { useIniciarCompraPedido } from "@/hooks/compras/useIniciarCompraPedido";
import type { PedidoCompraFull } from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (d?: string | null) =>
  d ? format(parseISO(d), "dd MMM yyyy", { locale: ptBR }) : "—";

const ROLES_COMPRADOR = ["super_admin"];
const ROLES_LEITURA = ["super_admin", "admin_rh", "financeiro"];

export default function ComprasAComprar() {
  const { user, roles } = useAuth();
  const podeAgir = roles.some((r) => ROLES_COMPRADOR.includes(r));
  const podeVer = roles.some((r) => ROLES_LEITURA.includes(r));

  const [tab, setTab] = useState<ComprarTab>("aguardando");
  const [busca, setBusca] = useState("");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<PedidoCompraFull | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [pedidoParaRegistrar, setPedidoParaRegistrar] = useState<PedidoCompraFull | null>(null);

  const { data: pedidos = [], isLoading } = usePedidosAComprar(tab);

  // Sincroniza estados locais com a lista refetchada (resolve bug do item cancelado
  // continuar aparecendo no modal após cancelamento)
  useEffect(() => {
    if (!pedidos.length) return;
    if (pedidoSelecionado) {
      const atualizado = pedidos.find((p) => p.id === pedidoSelecionado.id);
      if (atualizado && atualizado !== pedidoSelecionado) {
        setPedidoSelecionado(atualizado);
      }
    }
    if (pedidoParaRegistrar) {
      const atualizado = pedidos.find((p) => p.id === pedidoParaRegistrar.id);
      if (atualizado && atualizado !== pedidoParaRegistrar) {
        setPedidoParaRegistrar(atualizado);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos]);
  const iniciar = useIniciarCompraPedido();

  // Stats independentes do tab
  const { data: stats } = useQuery({
    queryKey: ["compras", "a-comprar", "stats", user?.id],
    enabled: !!user && podeVer,
    queryFn: async () => {
      const inicioMes = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const [aguardandoRes, emCompraRes, mesRes] = await Promise.all([
        supabase
          .from("pedidos_compra")
          .select("id", { count: "exact", head: true })
          .eq("status", "aberto"),
        supabase
          .from("pedidos_compra")
          .select("id", { count: "exact", head: true })
          .eq("status", "em_compra")
          .eq("comprador_id", user!.id),
        supabase
          .from("compras_registradas")
          .select("id", { count: "exact", head: true })
          .eq("comprador_id", user!.id)
          .eq("status", "finalizada")
          .gte("data_compra", inicioMes),
      ]);
      return {
        aguardando: aguardandoRes.count || 0,
        em_compra: emCompraRes.count || 0,
        mes: mesRes.count || 0,
      };
    },
  });

  const filtrados = useMemo(() => {
    if (!busca.trim()) return pedidos;
    const q = busca.toLowerCase();
    return pedidos.filter((p) => (p.descricao_geral || "").toLowerCase().includes(q));
  }, [pedidos, busca]);

  // Rascunhos ativos do comprador
  const { data: rascunhosAtivos = [] } = useQuery({
    queryKey: ["compras", "rascunhos-meus", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("compras_registradas")
        .select("id, pedido_id, valor_total, updated_at")
        .eq("comprador_id", user!.id)
        .eq("status", "rascunho");
      return data || [];
    },
  });

  const rascunhoPorPedido = useMemo(() => {
    const map = new Map<string, { id: string; valor_total: number; updated_at: string }>();
    for (const r of rascunhosAtivos as any[]) {
      if (r.pedido_id) {
        map.set(r.pedido_id, {
          id: r.id,
          valor_total: Number(r.valor_total),
          updated_at: r.updated_at,
        });
      }
    }
    return map;
  }, [rascunhosAtivos]);

  const handleFinalizadoENova = async (pedidoAtualId: string) => {
    if (!user) return;
    const { data: proximos } = await supabase
      .from("pedidos_compra")
      .select(
        "*, centros_custo(id, codigo, nome), linhas_investimento(id, descricao), parceiros_comerciais:parceiro_preferencial_id(id, nome_fantasia, razao_social), pedidos_compra_itens(*), pedidos_compra_anexos(*)",
      )
      .eq("status", "em_compra")
      .eq("comprador_id", user.id)
      .neq("id", pedidoAtualId)
      .order("enviado_em", { ascending: true })
      .limit(1);

    if (proximos && proximos.length > 0) {
      setPedidoParaRegistrar(proximos[0] as unknown as PedidoCompraFull);
    } else {
      setRegistrarOpen(false);
      toast.success("Todos os pedidos finalizados. Mesa limpa.");
    }
  };


  if (!podeVer) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">Acesso restrito</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Apenas Compradores podem acessar esta fila.
            </p>
            <Button asChild>
              <Link to="/compras">Voltar para Meus Pedidos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const abrirDetalhe = (p: PedidoCompraFull) => {
    setPedidoSelecionado(p);
    setDrawerOpen(true);
  };

  const abrirRegistrar = (p: PedidoCompraFull) => {
    setPedidoParaRegistrar(p);
    setRegistrarOpen(true);
    setDrawerOpen(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/compras">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Meus Pedidos
            </Link>
          </Button>
          <div className="h-6 w-px bg-border" />
          <div
            className="p-2 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#1A4A3A" }}
          >
            <Truck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Pedidos a Comprar</h1>
            <p className="text-sm text-muted-foreground">Fila do Comprador</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={Clock} label="Aguardando compra" value={stats?.aguardando ?? 0} />
        <StatCard icon={ShoppingBag} label="Em compra (suas)" value={stats?.em_compra ?? 0} />
        <StatCard icon={CheckCircle2} label="Compras este mês" value={stats?.mes ?? 0} />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as ComprarTab)}>
          <TabsList>
            <TabsTrigger value="aguardando">Aguardando</TabsTrigger>
            <TabsTrigger value="em_compra">Em compra (suas)</TabsTrigger>
            <TabsTrigger value="tudo">Tudo</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-72">
          <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição..."
            className="pl-8"
          />
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center">
              <PackageCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-1">Sem pedidos aguardando compra agora</h3>
              <p className="text-sm text-muted-foreground">
                {tab === "aguardando" && "Quando solicitantes enviarem pedidos, eles aparecem aqui."}
                {tab === "em_compra" && "Você não está com nenhum pedido em compra."}
                {tab === "tudo" && "Nada pendente na fila."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Centro de custo</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-center">Anexos</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((p) => {
                  const itensAtivos = (p.pedidos_compra_itens || []).filter(
                    (i) => i.status !== "cancelado",
                  );
                  const total = itensAtivos.reduce(
                    (s, i) => s + Number(i.quantidade) * Number(i.valor_estimado_unitario),
                    0,
                  );
                  const desc = p.descricao_geral || "(sem descrição)";
                  const ehAberto = p.status === "aberto";
                  const ehMeu = p.status === "em_compra" && p.comprador_id === user?.id;
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => abrirDetalhe(p)}
                    >
                      <TableCell className="text-sm">{p.solicitante_nome || "—"}</TableCell>
                      <TableCell className="max-w-[280px]" title={desc}>
                        <div className="truncate">
                          {desc.length > 50 ? desc.slice(0, 50) + "…" : desc}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.centros_custo?.nome || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {itensAtivos.length}{" "}
                        <span className="text-muted-foreground">({fmtBRL(total)})</span>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {p.pedidos_compra_anexos?.length || 0}
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(p.enviado_em)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <PedidoStatusBadge status={p.status} />
                          {p.status === "comprado" &&
                            (p.pedidos_compra_itens || []).some((i) => i.status === "cancelado") && (
                              <Badge variant="secondary" className="text-xs">Parcial</Badge>
                            )}
                          {rascunhoPorPedido.has(p.id) && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300"
                            >
                              <FileEdit className="h-3 w-3 mr-1" />
                              Rascunho • {fmtBRL(rascunhoPorPedido.get(p.id)!.valor_total)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => abrirDetalhe(p)}>
                              Ver detalhes
                            </DropdownMenuItem>
                            {podeAgir && ehAberto && (
                              <DropdownMenuItem
                                onClick={() => iniciar.mutate(p.id)}
                                disabled={iniciar.isPending}
                              >
                                Iniciar compra
                              </DropdownMenuItem>
                            )}
                            {podeAgir && ehMeu && (
                              <>
                                <DropdownMenuItem onClick={() => abrirRegistrar(p)}>
                                  {rascunhoPorPedido.has(p.id) ? "Continuar compra" : "Registrar compra"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => abrirDetalhe(p)}>
                                  Cancelar item...
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PedidoDetalheComprador
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        pedido={pedidoSelecionado}
        podeAgir={podeAgir}
        onRegistrarCompra={abrirRegistrar}
      />

      <RegistrarCompraDialog
        open={registrarOpen}
        onOpenChange={setRegistrarOpen}
        pedido={pedidoParaRegistrar}
        onFinalizadoENova={handleFinalizadoENova}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-md bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
