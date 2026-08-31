import { Suspense, lazy, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PipelineHorizontal } from "@/components/pedidos/PipelineHorizontal";
import { FilaPedidosPorArea } from "@/components/pedidos/FilaPedidosPorArea";
import { PainelDashPedidos } from "@/components/pedidos/PainelDashPedidos";
import { ExportarPedidosButton } from "@/components/pedidos/ExportarPedidosButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { type EstagioPedido } from "@/types/pedido";
import { SolicitacoesSopsAba } from "@/components/pedidos/SolicitacoesSopsAba";
import { useContagemSolicitacoes } from "@/hooks/pedidos/useSolicitacoesComercial";
import { PageHeader } from "@/components/layout/PageHeader";
import { AbaPermitida, ConteudoAba } from "@/components/AbaGate";

import { PageShell } from "@/components/layout/PageShell";

// Telas pesadas: só entram no bundle quando a aba é aberta.
const Oportunidades = lazy(() => import("@/pages/Comercial/Oportunidades"));
const Consignados = lazy(() => import("@/pages/Comercial/Consignados"));

const ABAS = ["fila", "dash", "recuperacao", "consignados", "solicitacoes"] as const;
type Aba = (typeof ABAS)[number];

export default function PedidosIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const estagioParam = searchParams.get("estagio") as EstagioPedido | null;
  const abaParam = searchParams.get("aba");
  const aba: Aba = ABAS.includes(abaParam as Aba) ? (abaParam as Aba) : "fila";
  const [incluirCancelados, setIncluirCancelados] = useState(false);
  const [riscoAltoAtivo, setRiscoAltoAtivo] = useState(false);


  // FONTE-UNICA: o contador da aba le a MESMA view/fase default da Mesa Comercial.
  const { data: qtdMesaComercial = 0 } = useQuery({
    queryKey: ["mesa-comercial-contagem"],
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from("vw_mesa_comercial")
        .select("pedido_id", { count: "exact", head: true })
        .eq("fase_mesa", "oportunidade");
      if (error) throw error;
      return count ?? 0;
    },
  });


  const { data: qtdSolicitacoes = 0 } = useContagemSolicitacoes();

  const setAba = (valor: string) => {
    // Trocar de aba preserva os outros params (ex.: ?estagio= aplicado na Fila).
    const next = new URLSearchParams(searchParams);
    if (valor === "fila") next.delete("aba");
    else next.set("aba", valor);
    setSearchParams(next);
  };

  const handlePipelineClick = (estagio: EstagioPedido) => {
    const next = new URLSearchParams(searchParams);
    next.set("estagio", estagio);
    setSearchParams(next);
  };

  const handleLimparFiltro = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("estagio");
    setSearchParams(next);
  };

  return (
    <PageShell>
      {/* Exportação leva a base para fora: nível 3 (Coordenador) para cima — o componente se autoprotege. */}
      <PageHeader titulo="Casa dos Pedidos" acoes={<ExportarPedidosButton />} />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <AbaPermitida slug="tela.dash_pedidos">
            <TabsTrigger value="dash">Dash</TabsTrigger>
          </AbaPermitida>
          {/* Separador: à esquerda, duas leituras da carteira ativa;
              à direita, salas separadas. */}
          <div className="w-px bg-border mx-1.5 self-stretch" aria-hidden />
          <AbaPermitida slug="tela.comercial">
            <TabsTrigger value="recuperacao">
              Mesa Comercial{qtdMesaComercial > 0 ? ` (${qtdMesaComercial})` : ""}
            </TabsTrigger>
          </AbaPermitida>
          <AbaPermitida slug="tela.consignado">
            <TabsTrigger value="consignados">Consignados</TabsTrigger>
          </AbaPermitida>
          <AbaPermitida slug="tela.solicitacoes">
            <TabsTrigger value="solicitacoes">Solicitações ({qtdSolicitacoes})</TabsTrigger>
          </AbaPermitida>
        </TabsList>

        <TabsContent value="fila" className="space-y-4">
          {/* Pipeline sticky */}
          <div className="sticky top-16 z-20 bg-background border-b border-border px-4 md:px-6 py-2">
            <PipelineHorizontal
              onClickEstagio={handlePipelineClick}
              onLimparFiltro={handleLimparFiltro}
              estagioAtivo={estagioParam}
              incluirCancelados={incluirCancelados}
              onToggleCancelados={setIncluirCancelados}
              riscoAltoAtivo={riscoAltoAtivo}
              onToggleRiscoAlto={() => setRiscoAltoAtivo((v) => !v)}
              onAbrirRecuperacao={() => setAba("recuperacao")}
            />
          </div>

          {/* Tabela */}
          <div>
            <FilaPedidosPorArea
              area="todas"
              estagios={estagioParam ? [estagioParam] : undefined}
              apenasAtivos={!estagioParam}
              incluirCancelados={incluirCancelados}
              somenteRiscoAlto={riscoAltoAtivo}
            />
          </div>
        </TabsContent>

        <TabsContent value="dash">
          <ConteudoAba slug="tela.dash_pedidos">
            <PainelDashPedidos />
          </ConteudoAba>
        </TabsContent>

        <TabsContent value="recuperacao">
          <ConteudoAba slug="tela.comercial">
            <Suspense fallback={<CarregandoAba />}>
              <Oportunidades embutido />
            </Suspense>
          </ConteudoAba>
        </TabsContent>

        <TabsContent value="consignados">
          <ConteudoAba slug="tela.consignado">
            <Suspense fallback={<CarregandoAba />}>
              <Consignados embutido />
            </Suspense>
          </ConteudoAba>
        </TabsContent>
        <TabsContent value="solicitacoes">
          <ConteudoAba slug="tela.solicitacoes">
            <SolicitacoesSopsAba />
          </ConteudoAba>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function CarregandoAba() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
