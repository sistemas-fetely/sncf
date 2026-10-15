import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Truck, Loader2, Plus, LayoutGrid, Package, Receipt, Table2, ChevronDown, ChevronRight } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { nomeExibicao } from "@/lib/parceiros/nome";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";

const ICONES: Record<string, typeof LayoutGrid> = { painel: LayoutGrid, entregas: Package, custos: Receipt, tabelas: Table2 };
const CANAIS: { v: CanalPainel; l: string }[] = [{ v: "total", l: "Total" }, { v: "b2b", l: "B2B" }, { v: "b2c", l: "B2C" }];
const LEGADO_XPM: Record<string, string> = { "importar-fases": "importar-fases", "comparativo-fontes": "funil" };

const chip = (ativo: boolean) =>
  cn(
    "rounded-full px-3 py-1 text-sm border transition inline-flex items-center gap-1.5",
    ativo ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground hover:bg-muted border-border",
  );

export default function Logistica() {
  const { data: transportadoras = [], isLoading } = useTransportadorasLogistica();
  const [params, setParams] = useSearchParams();
  const abaUrl = params.get("aba") ?? "painel";
  const transportadoraId = params.get("transportadora");
  const canalUrl = params.get("canal");
  const canal: CanalPainel = CANAIS.some((c) => c.v === canalUrl) ? (canalUrl as CanalPainel) : "total";
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
          <div className="flex flex-wrap items-center gap-2 border-b pb-2">
            {ABAS_LOGISTICA.map((a) => {
              const Icone = ICONES[a.value];
              return (
                <button
                  key={a.value}
                  className={chip(!transportadoraId && aba === a.value)}
                  onClick={() => setParam((n) => { n.delete("transportadora"); a.value === "painel" ? n.delete("aba") : n.set("aba", a.value); })}
                >
                  <Icone className="h-3.5 w-3.5" /> {a.label}
                  {a.value === "entregas" && exigeAcao > 0 && (
                    <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{exigeAcao}</Badge>
                  )}
                </button>
              );
            })}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {transportadoras.map((t) => (
              <button
                key={t.id}
                className={chip(t.id === transportadoraId)}
                onClick={() => setParam((n) => { n.set("transportadora", t.id); n.delete("aba"); })}
              >
                {nomeExibicao(t.razao_social, t.nome_fantasia)}
              </button>
            ))}
            <span className="rounded-full px-3 py-1 text-xs border border-dashed text-muted-foreground inline-flex items-center gap-1 cursor-not-allowed">
              <Plus className="h-3 w-3" /> transportadora
            </span>
          </div>

          {transportadoraId ? (
            ativa ? (
              <AbaTransportadora key={ativa.id} transportadora={ativa} />
            ) : (
              <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
                Transportadora não encontrada.
              </div>
            )
          ) : (
            <EscopoGeral
              aba={aba}
              canal={canal}
              setCanal={(c) => setParam((n) => (c === "total" ? n.delete("canal") : n.set("canal", c)))}
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
  aba, canal, setCanal, transportadoras, filaTotal,
}: {
  aba: string;
  canal: CanalPainel;
  setCanal: (c: CanalPainel) => void;
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
        <div className="flex gap-1.5">
          {CANAIS.map((c) => (
            <button key={c.v} onClick={() => setCanal(c.v)} className={chip(canal === c.v)}>{c.l}</button>
          ))}
        </div>
        <PainelRemessas escopo={{ canal, transportadoraId: null }} />
      </div>
    );
  }

  if (aba === "entregas") {
    return (
      <div className="space-y-4">
        <div className="flex gap-1.5">
          {CANAIS.map((c) => (
            <button key={c.v} onClick={() => setCanal(c.v)} className={chip(canal === c.v)}>{c.l}</button>
          ))}
        </div>
        <EntregasRemessas transportadoraId={null} canal={canal === "total" ? "total" : canal} />
        <section className="rounded-lg border bg-card">
          <button onClick={() => setFilaAberta((v) => !v)} className="w-full flex items-center gap-2 p-3 text-sm font-medium">
            {filaAberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Fila de atenção{filaTotal != null ? ` (${filaTotal})` : ""}
          </button>
          {filaAberta && <div className="p-3 pt-0"><FilaAtencaoLogistica /></div>}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
