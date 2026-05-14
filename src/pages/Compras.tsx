import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShoppingCart,
  Plus,
  PackageOpen,
  FileText,
  Clock,
  Truck,
  CheckCircle2,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// Imports de DropdownMenu removidos — agora usamos ícones inline
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMeusPedidosCompra } from "@/hooks/compras/useMeusPedidosCompra";
import { useEnviarPedidoCompra } from "@/hooks/compras/useEnviarPedidoCompra";
import { useExcluirPedidoCompra } from "@/hooks/compras/useExcluirPedidoCompra";
import { PedidoStatusBadge } from "@/components/compras/PedidoStatusBadge";
import { PedidoCompraDialog } from "@/components/compras/PedidoCompraDialog";
import type { PedidoCompraFull, PedidoCompraStatus } from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const fmtDate = (d?: string | null) =>
  d ? format(parseISO(d), "dd MMM yyyy", { locale: ptBR }) : "—";

const sumItens = (p: PedidoCompraFull) =>
  (p.pedidos_compra_itens || [])
    .filter((i) => i.status !== "cancelado")
    .reduce(
      (s, i) => s + Number(i.quantidade || 0) * Number(i.valor_estimado_unitario || 0),
      0,
    );

const countItens = (p: PedidoCompraFull) =>
  (p.pedidos_compra_itens || []).filter((i) => i.status !== "cancelado").length;

type TabValue = "todos" | PedidoCompraStatus;

export default function Compras() {
  const { data: pedidos = [], isLoading } = useMeusPedidosCompra();
  const enviar = useEnviarPedidoCompra();
  const excluir = useExcluirPedidoCompra();
  const { roles } = useAuth();
  const isCompradorV1 = roles.includes("super_admin");

  const [tab, setTab] = useState<TabValue>("todos");
  const [busca, setBusca] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"criar" | "editar" | "ver">("criar");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<PedidoCompraFull | null>(null);

  const [confirmarEnvio, setConfirmarEnvio] = useState<PedidoCompraFull | null>(null);
  const [confirmarDescartar, setConfirmarDescartar] = useState<PedidoCompraFull | null>(null);

  const stats = useMemo(() => {
    const inicioMes = startOfMonth(new Date());
    return {
      rascunho: pedidos.filter((p) => p.status === "rascunho").length,
      aberto: pedidos.filter((p) => p.status === "aberto").length,
      em_compra: pedidos.filter((p) => p.status === "em_compra").length,
      concluidos_mes: pedidos.filter(
        (p) => p.status === "comprado" && p.finalizado_em && parseISO(p.finalizado_em) >= inicioMes,
      ).length,
    };
  }, [pedidos]);

  const filtrados = useMemo(() => {
    let arr = pedidos;
    if (tab !== "todos") arr = arr.filter((p) => p.status === tab);
    if (busca.trim()) {
      const q = busca.toLowerCase();
      arr = arr.filter((p) => (p.descricao_geral || "").toLowerCase().includes(q));
    }
    return arr;
  }, [pedidos, tab, busca]);

  const abrirCriar = () => {
    setDialogMode("criar");
    setPedidoSelecionado(null);
    setDialogOpen(true);
  };

  const abrirVer = (p: PedidoCompraFull) => {
    setDialogMode("ver");
    setPedidoSelecionado(p);
    setDialogOpen(true);
  };

  const abrirEditar = (p: PedidoCompraFull) => {
    setDialogMode("editar");
    setPedidoSelecionado(p);
    setDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#1A4A3A" }}
          >
            <ShoppingCart className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Compras</h1>
            <p className="text-sm text-muted-foreground">Meus Pedidos de Compra</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={abrirCriar} style={{ backgroundColor: "#1A4A3A", color: "white" }}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Pedido
          </Button>
          {isCompradorV1 && (
            <Link
              to="/compras/a-comprar"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Truck className="h-4 w-4" />
              Fila do Comprador
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Rascunhos" value={stats.rascunho} />
        <StatCard icon={Clock} label="Aguardando compra" value={stats.aberto} />
        <StatCard icon={Truck} label="Em compra" value={stats.em_compra} />
        <StatCard icon={CheckCircle2} label="Concluídos no mês" value={stats.concluidos_mes} />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="rascunho">Rascunho</TabsTrigger>
            <TabsTrigger value="aberto">Aberto</TabsTrigger>
            <TabsTrigger value="em_compra">Em compra</TabsTrigger>
            <TabsTrigger value="comprado">Comprado</TabsTrigger>
            <TabsTrigger value="cancelado">Cancelado</TabsTrigger>
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
              <PackageOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-1">
                {pedidos.length === 0
                  ? "Você ainda não tem pedidos de compra"
                  : "Nenhum pedido encontrado"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {pedidos.length === 0
                  ? "Comece criando seu primeiro pedido"
                  : "Tente ajustar os filtros"}
              </p>
              {pedidos.length === 0 && (
                <Button onClick={abrirCriar} style={{ backgroundColor: "#1A4A3A", color: "white" }}>
                  <Plus className="h-4 w-4 mr-1" />
                  Criar Pedido
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Centro de custo</TableHead>
                  <TableHead className="text-right">Valor estimado</TableHead>
                  <TableHead className="text-center">Itens</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((p) => {
                  const podeEditar = p.status === "rascunho";
                  const desc = p.descricao_geral || "(sem descrição)";
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => (podeEditar ? abrirEditar(p) : abrirVer(p))}
                    >
                      <TableCell className="max-w-[280px] truncate" title={desc}>
                        {desc.length > 60 ? desc.slice(0, 60) + "…" : desc}
                      </TableCell>
                      <TableCell>{p.centros_custo?.nome || "—"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtBRL(sumItens(p))}
                      </TableCell>
                      <TableCell className="text-center">{countItens(p)}</TableCell>
                      <TableCell>{fmtDate(p.created_at)}</TableCell>
                      <TableCell>{fmtDate(p.enviado_em)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <PedidoStatusBadge status={p.status} />
                          {p.status === "comprado" &&
                            (p.pedidos_compra_itens || []).some((i) => i.status === "cancelado") && (
                              <Badge variant="secondary" className="text-xs">Parcial</Badge>
                            )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {podeEditar ? (
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-emerald-600"
                              title="Enviar para comprador"
                              onClick={() => setConfirmarEnvio(p)}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              title="Descartar"
                              onClick={() => setConfirmarDescartar(p)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PedidoCompraDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        pedido={pedidoSelecionado}
      />

      <AlertDialog open={!!confirmarEnvio} onOpenChange={(o) => !o && setConfirmarEnvio(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Após enviado, o pedido fica disponível pros Compradores e você não poderá mais editar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmarEnvio) {
                  await enviar.mutateAsync(confirmarEnvio.id);
                  setConfirmarEnvio(null);
                }
              }}
            >
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmarDescartar}
        onOpenChange={(o) => !o && setConfirmarDescartar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar rascunho?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Itens e anexos serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmarDescartar) {
                  await excluir.mutateAsync(confirmarDescartar.id);
                  setConfirmarDescartar(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
