import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Truck, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useTransportadorasLogistica, type TransportadoraLogistica } from "@/hooks/logistica/useTransportadorasLogistica";
import { AbaTransportadora, ABAS_LOGISTICA } from "@/components/logistica/AbaTransportadora";
import { PainelRemessas } from "@/components/logistica/PainelRemessas";
import { EntregasRemessas } from "@/components/logistica/EntregasRemessas";
import { FilaAtencaoLogistica } from "@/components/logistica/FilaAtencaoLogistica";
import {
  CustosFaturasTransportadora, SeletorTransportadora, TabelasCotacaoTransportadora,
} from "@/components/logistica/ConteudoPorPerfil";
import { useLogisticaPainel, type CanalPainel } from "@/hooks/logistica/useLogisticaPainel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EscopoLogistica } from "@/components/logistica/EscopoLogistica";
import { parametrosEscopo } from "@/lib/logistica/escopo";
import { nomeExibicao } from "@/lib/parceiros/nome";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";

const CANAIS: CanalPainel[] = ["total", "b2b", "b2c"];
const LEGADO_XPM: Record<string, string> = { "importar-fases": "importar-fases", "comparativo-fontes": "funil" };

export default function Logistica() {
  const { data: transportadoras = [], isLoading } = useTransportadorasLogistica();
  const [params, setParams] = useSearchParams();
  const abaUrl = params.get("aba") ?? "painel";
  const transportadoraId = params.get("transportadora");
  const canalUrl = params.get("canal");
  const canal: CanalPainel = CANAIS.some((c) => c === canalUrl) ? (canalUrl as CanalPainel) : "total";
  const aba = ABAS_LOGISTICA.some((a) => a.value === abaUrl) ? abaUrl : "painel";
  const { data: resumo } = useLogisticaPainel({ canal: "total" });
  const exigeAcao = resumo?.fila_atencao.exige_acao_nossa ?? 0;

  const setParam = (mut: (p: URLSearchParams) => void) =>
    setParams((p) => { const n = new URLSearchParams(p); mut(n); return n; }, { replace: true });

  if (LEGADO_XPM[abaUrl]) return <Navigate to={`/vendas/xpm?aba=${LEGADO_XPM[abaUrl]}`} replace />;

  const ativa = transportadoraId ? transportadoras.find((t) => t.id === transportadoraId) ?? null : null;

  return (
    <PageShell>
      <PageTitle
        titulo="Logística"
        icone={Truck}
        estado={
          isLoading
            ? "carregando transportadoras…"
            : `${transportadoras.length} ${transportadoras.length === 1 ? "transportadora" : "transportadoras"}`
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando transportadoras…
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-2 border-b pb-2 md:flex-row md:items-center md:justify-between">
            <Tabs value={aba} onValueChange={(nova) => setParam((n) => { nova === "painel" ? n.delete("aba") : n.set("aba", nova); })} className="min-w-0 overflow-x-auto">
              <TabsList className="w-max">
                {ABAS_LOGISTICA.map((a) => (
                  <TabsTrigger key={a.value} value={a.value} className="gap-1.5 whitespace-nowrap">
                    {a.label}
                    {a.value === "entregas" && exigeAcao > 0 && (
                      <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{exigeAcao}</Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <EscopoLogistica transportadoras={transportadoras}
              escopo={transportadoraId ? { tipo: "transportadora", valor: transportadoraId } : { tipo: "canal", valor: canal === "b2b" || canal === "b2c" ? canal : "total" }}
              onChange={(novo) => setParams((p) => parametrosEscopo(p, novo), { replace: true })} />
          </div>

          {transportadoraId ? (
            ativa ? (
              <AbaTransportadora key={ativa.id} transportadora={ativa} aba={aba} />
            ) : (
              <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
                Transportadora não encontrada.
              </div>
            )
          ) : (
            <EscopoGeral
              aba={aba}
              canal={canal}
              transportadoras={transportadoras}
              filaTotal={resumo?.fila_atencao.total ?? null}
            />
          )}
        </>
      )}
    </PageShell>
  );
}

function EscopoGeral({
  aba, canal, transportadoras, filaTotal,
}: {
  aba: string;
  canal: CanalPainel;
  transportadoras: TransportadoraLogistica[];
  filaTotal: number | null;
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [filaAberta, setFilaAberta] = useState(false);
  useEffect(() => setEscolhida(null), [aba]);
  const atual = transportadoras.find((t) => t.id === escolhida) ?? null;

  if (aba === "painel") {
    return (
      <div className="space-y-4">
        <PainelRemessas escopo={{ canal, transportadoraId: null }} />
      </div>
    );
  }

  if (aba === "entregas") {
    return (
      <div className="space-y-4">
        <EntregasRemessas transportadoraId={null} canal={canal === "interno" ? "total" : canal} />
        <section className="rounded-lg border bg-card">
          <Button variant="ghost" onClick={() => setFilaAberta((v) => !v)} className="h-auto w-full justify-start gap-2 p-3 text-sm font-medium">
            {filaAberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Fila de atenção{filaTotal != null ? ` (${filaTotal})` : ""}
          </Button>
          {filaAberta && <div className="p-3 pt-0"><FilaAtencaoLogistica /></div>}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Faturas e tabelas são por transportadora — escolha uma</p>
      <SeletorTransportadora
        transportadoras={transportadoras}
        valor={escolhida}
        onChange={setEscolhida}
        preferir={aba === "custos" ? "importa_fatura" : undefined}
      />
      {atual && (aba === "custos" ? (
        <CustosFaturasTransportadora key={atual.id} id={atual.id} nome={nomeExibicao(atual.razao_social, atual.nome_fantasia)} />
      ) : (
        <TabelasCotacaoTransportadora key={atual.id} id={atual.id} />
      ))}
    </div>
  );
}
