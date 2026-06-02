import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  LayoutGrid, Inbox, Shield, CheckCircle2, Receipt,
  Clock, FileClock, Factory, Undo2, PackageCheck, XCircle,
} from "lucide-react";
import { PedidosStatsCards } from "@/components/pedidos/PedidosStatsCards";
import { PipelineHorizontal } from "@/components/pedidos/PipelineHorizontal";
import { FilaPedidosPorArea } from "@/components/pedidos/FilaPedidosPorArea";
import type { EstagioPedido } from "@/types/pedido";

const TABS_VALIDAS = [
  "todas", "recebido", "analise", "aprovado", "cobranca",
  "aguardando", "pre_faturado", "bling", "recuperacao", "entregues", "cancelados",
];

export default function PedidosIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tabAtiva = tabParam && TABS_VALIDAS.includes(tabParam) ? tabParam : "todas";
  const estagioParam = searchParams.get("estagio") as EstagioPedido | null;

  const handleTabChange = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    next.delete("estagio");
    setSearchParams(next);
  };

  const handlePipelineClick = (estagio: EstagioPedido) => {
    const next = new URLSearchParams(searchParams);
    next.set("estagio", estagio);
    next.set("tab", "todas");
    setSearchParams(next);
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Casa dos Pedidos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Portal único de pedidos B2B — recebimento, triagem, crédito, cobrança, faturamento.
        </p>
      </div>

      <PedidosStatsCards />

      <PipelineHorizontal
        onClickEstagio={handlePipelineClick}
        estagioAtivo={estagioParam}
      />

      <Tabs value={tabAtiva} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="todas" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" />
            Todos
          </TabsTrigger>
          <TabsTrigger value="recebido" className="gap-1.5">
            <Inbox className="h-4 w-4" />
            Recebidos
          </TabsTrigger>
          <TabsTrigger value="analise" className="gap-1.5">
            <Shield className="h-4 w-4" />
            Em Análise
          </TabsTrigger>
          <TabsTrigger value="aprovado" className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Aprovado
          </TabsTrigger>
          <TabsTrigger value="cobranca" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            Cobrança
          </TabsTrigger>
          <TabsTrigger value="aguardando" className="gap-1.5">
            <Clock className="h-4 w-4" />
            Aguardando pgto
          </TabsTrigger>
          <TabsTrigger value="pre_faturado" className="gap-1.5">
            <FileClock className="h-4 w-4" />
            Pré-faturamento
          </TabsTrigger>
          <TabsTrigger value="bling" className="gap-1.5">
            <Factory className="h-4 w-4" />
            No Bling
          </TabsTrigger>
          <TabsTrigger value="recuperacao" className="gap-1.5">
            <Undo2 className="h-4 w-4" />
            Recuperação
          </TabsTrigger>
          <TabsTrigger value="entregues" className="gap-1.5">
            <PackageCheck className="h-4 w-4" />
            Entregues
          </TabsTrigger>
          <TabsTrigger value="cancelados" className="gap-1.5">
            <XCircle className="h-4 w-4" />
            Cancelados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="todas">
          <FilaPedidosPorArea
            area="todas"
            estagioInicial={estagioParam ?? "todos"}
            apenasAtivos={false}
          />
        </TabsContent>
        <TabsContent value="recebido">
          <FilaPedidosPorArea area="todas" estagios={["recebido"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="analise">
          <FilaPedidosPorArea area="todas" estagios={["em_analise_credito"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="aprovado">
          <FilaPedidosPorArea area="todas" estagios={["credito_aprovado"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="cobranca">
          <FilaPedidosPorArea area="todas" estagios={["cobranca"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="aguardando">
          <FilaPedidosPorArea area="todas" estagios={["aguardando_pagamento"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="pre_faturado">
          <FilaPedidosPorArea area="todas" estagios={["pre_faturado"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="bling">
          <FilaPedidosPorArea
            area="todas"
            estagios={["em_separacao", "faturado", "em_transporte"]}
            apenasAtivos
          />
        </TabsContent>
        <TabsContent value="recuperacao">
          <FilaPedidosPorArea area="todas" estagios={["recuperacao_venda"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="entregues">
          <FilaPedidosPorArea area="todas" estagios={["entregue"]} apenasAtivos={false} />
        </TabsContent>
        <TabsContent value="cancelados">
          <FilaPedidosPorArea area="todas" estagios={["cancelado"]} apenasAtivos={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
