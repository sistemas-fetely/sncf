import { useState } from "react";
import { Truck, Loader2, Plus, LayoutGrid, Package } from "lucide-react";
import { useTransportadorasLogistica } from "@/hooks/logistica/useTransportadorasLogistica";
import { AbaTransportadora } from "@/components/logistica/AbaTransportadora";
import { VisaoGeralLogistica } from "@/components/logistica/VisaoGeralLogistica";
import { EntregasControle } from "@/components/logistica/EntregasControle";
import { cn } from "@/lib/utils";
import { nomeExibicao } from "@/lib/parceiros/nome";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";

export default function Logistica() {
  const { data: transportadoras = [], isLoading } = useTransportadorasLogistica();
  const [ativaId, setAtivaId] = useState<string>("geral");

  const ativa = transportadoras.find((t) => t.id === ativaId) ?? null;
  const isGeral = ativaId === "geral";
  const isRastreio = ativaId === "rastreio";

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
            <button
              onClick={() => setAtivaId("geral")}
              className={cn(
                "rounded-full px-3 py-1 text-sm border transition inline-flex items-center gap-1.5",
                isGeral
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground hover:bg-muted border-border"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Visão geral
            </button>
            <button
              onClick={() => setAtivaId("rastreio")}
              className={cn(
                "rounded-full px-3 py-1 text-sm border transition inline-flex items-center gap-1.5",
                isRastreio
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground hover:bg-muted border-border"
              )}
            >
              <Package className="h-3.5 w-3.5" /> Entregas
            </button>
            {transportadoras.map((t) => {
              const nome = nomeExibicao(t.razao_social, t.nome_fantasia);
              const ativo = t.id === ativaId;
              return (
                <button
                  key={t.id}
                  onClick={() => setAtivaId(t.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm border transition",
                    ativo
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground hover:bg-muted border-border"
                  )}
                >
                  {nome}
                </button>
              );
            })}
            <span className="rounded-full px-3 py-1 text-xs border border-dashed text-muted-foreground inline-flex items-center gap-1 cursor-not-allowed">
              <Plus className="h-3 w-3" /> transportadora
            </span>
          </div>

          {isGeral ? (
            <VisaoGeralLogistica />
          ) : isRastreio ? (
            <EntregasControle />
          ) : ativa ? (
            <AbaTransportadora transportadora={ativa} />
          ) : (
            <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
              Nenhuma transportadora cadastrada em parceiros comerciais.
            </div>
          )}
        </>
      )}
    </div>
  );
}
