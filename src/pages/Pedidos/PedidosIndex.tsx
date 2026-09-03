import { Suspense, lazy, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PipelineHorizontal } from "@/components/pedidos/PipelineHorizontal";
import { FilaPedidosPorArea } from "@/components/pedidos/FilaPedidosPorArea";
import { PainelDashPedidos } from "@/components/pedidos/PainelDashPedidos";
import { ExportarPedidosButton } from "@/components/pedidos/ExportarPedidosButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { type EstagioPedido } from "@/types/pedido";
import { SolicitacoesSopsAba } from "@/components/pedidos/SolicitacoesSopsAba";
import { useContagemSolicitacoes } from "@/hooks/pedidos/useSolicitacoesComercial";
import { useMesaComercialContagem } from "@/hooks/pedidos/useMesaComercialContagem";
import { PageHeader } from "@/components/layout/PageHeader";
import { AbaPermitida, ConteudoAba, usePodeVerAba } from "@/components/AbaGate";

import { PageShell } from "@/components/layout/PageShell";

// Telas pesadas: só entram no bundle quando a aba é aberta.
const Oportunidades = lazy(() => import("@/pages/Comercial/Oportunidades"));
const Consignados = lazy(() => import("@/pages/Comercial/Consignados"));

const ABAS = ["fila", "dash", "recuperacao", "consignados", "solicitacoes"] as const;
type Aba = (typeof ABAS)[number];

export default function PedidosIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const estagioParam = searchParams.get("estagio") as EstagioPedido | null;
  const abaParam = searchParams.get("aba");
  const [incluirCancelados, setIncluirCancelados] = useState(false);
  const [riscoAltoAtivo, setRiscoAltoAtivo] = useState(false);

  // SLUG-DE-ABA-NAO-E-PORTA-DE-LEITURA (03/09/2026): a aba Fila tem slug proprio.
  // `tela.pedidos` segue sendo a porta de leitura de 15 tabelas do dominio e o gate
  // da rota /pedidos — nao serve para esconder aba, porque revogar apagaria a Mesa.
  const permFila = usePodeVerAba("tela.pedidos_fila");
  const permDash = usePodeVerAba("tela.dash_pedidos");
  const permMesa = usePodeVerAba("tela.comercial");
  const permConsignados = usePodeVerAba("tela.consignado");
  const permSolicitacoes = usePodeVerAba("tela.solicitacoes");

  const permissoes: Record<Aba, { podeVer: boolean; carregando: boolean }> = {
    fila: permFila,
    dash: permDash,
    recuperacao: permMesa,
    consignados: permConsignados,
    solicitacoes: permSolicitacoes,
  };

  const carregandoPermissoes = ABAS.some((a) => permissoes[a].carregando);
  const primeiraPermitida = ABAS.find((a) => permissoes[a].podeVer);
  const abaSolicitada: Aba = ABAS.includes(abaParam as Aba)
    ? (abaParam as Aba)
    : "fila";
  const abaEfetiva: Aba | undefined = carregandoPermissoes
    ? abaSolicitada
    : permissoes[abaSolicitada].podeVer
      ? abaSolicitada
      : primeiraPermitida;

  // Redireciona para a primeira aba permitida quando a URL aponta para uma proibida.
  useEffect(() => {
    if (carregandoPermissoes) return;
    if (abaEfetiva && abaEfetiva !== abaSolicitada) {
      const next = new URLSearchParams(searchParams);
      if (abaEfetiva === "fila") next.delete("aba");
      else next.set("aba", abaEfetiva);
      setSearchParams(next);
    }
  }, [carregandoPermissoes, abaEfetiva, abaSolicitada, searchParams, setSearchParams]);




  // FONTE-UNICA-DA-MESA-COMERCIAL: mesmo hook do card do funil.
  const {
    data: mesaComercial,
    isError: mesaErro,
    error: mesaErroObj,
  } = useMesaComercialContagem();
  const qtdMesaComercial = mesaComercial?.total ?? 0;
  const mesaErroMsg = (mesaErroObj as Error)?.message ?? "erro desconhecido";

  const { data: qtdSolicitacoes = 0 } = useContagemSolicitacoes();

  const setAba = (valor: string) => {
    // Trocar de aba preserva os outros params (ex.: ?estagio= aplicado na Fila).
    const next = new URLSearchParams(searchParams);
    if (valor === "fila") next.delete("aba");
    else next.set("aba", valor);
    setSearchParams(next);
  };

  // O funil precisa se atualizar junto com a lista no MESMO clique.
  const revalidarFunil = () => {
    qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
    qc.invalidateQueries({ queryKey: ["mesa-comercial-contagem"] });
  };

  const handlePipelineClick = (estagio: EstagioPedido) => {
    const next = new URLSearchParams(searchParams);
    next.set("estagio", estagio);
    setSearchParams(next);
    revalidarFunil();
  };

  const handleLimparFiltro = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("estagio");
    setSearchParams(next);
    revalidarFunil();
  };

  return (
    <PageShell>
      {/* Exportação leva a base para fora: nível 3 (Coordenador) para cima — o componente se autoprotege. */}
      <PageHeader titulo="Casa dos Pedidos" acoes={<ExportarPedidosButton />} />

      {carregandoPermissoes ? (
        <CarregandoAba />
      ) : !primeiraPermitida ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-6 text-sm text-muted-foreground text-center">
          Você não tem acesso a nenhuma aba desta tela.
        </div>
      ) : (
        <Tabs value={abaEfetiva ?? abaSolicitada} onValueChange={setAba} className="space-y-4">
          <TabsList>
            <AbaPermitida slug="tela.pedidos_fila">
              <TabsTrigger value="fila">Fila</TabsTrigger>
            </AbaPermitida>
            <AbaPermitida slug="tela.dash_pedidos">
              <TabsTrigger value="dash">Dash</TabsTrigger>
            </AbaPermitida>
            {/* Separador: à esquerda, duas leituras da carteira ativa;
                à direita, salas separadas. */}
            <div className="w-px bg-border mx-1.5 self-stretch" aria-hidden />
            <AbaPermitida slug="tela.comercial">
              <TabsTrigger
                value="recuperacao"
                title={
                  mesaErro
                    ? `Não foi possível ler a contagem: ${mesaErroMsg}`
                    : "Pedidos que o Comercial trabalha: aguardando pagamento + recuperação de venda."
                }
              >
                {mesaErro
                  ? "Mesa Comercial (—)"
                  : `Mesa Comercial${qtdMesaComercial > 0 ? ` (${qtdMesaComercial})` : ""}`}
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
            <ConteudoAba slug="tela.pedidos_fila">
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
            </ConteudoAba>
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
      )}
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
