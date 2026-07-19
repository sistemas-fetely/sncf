import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Loader2, Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransportadorasLogistica } from "@/hooks/logistica/useTransportadorasLogistica";
import { AbaTransportadora } from "@/components/logistica/AbaTransportadora";
import { cn } from "@/lib/utils";

export default function Logistica() {
  const navigate = useNavigate();
  const { data: transportadoras = [], isLoading } = useTransportadorasLogistica();
  const [ativaId, setAtivaId] = useState<string | null>(null);

  useEffect(() => {
    if (!ativaId && transportadoras.length > 0) {
      setAtivaId(transportadoras[0].id);
    }
  }, [transportadoras, ativaId]);

  const ativa = transportadoras.find((t) => t.id === ativaId) ?? null;

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-6 w-6 text-gold" />
        <h1 className="font-serif text-2xl">Logística</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando transportadoras…
        </div>
      ) : transportadoras.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
          Nenhuma transportadora cadastrada em parceiros comerciais.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b pb-2">
            {transportadoras.map((t) => {
              const nome = t.nome_fantasia ?? t.razao_social;
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

          {ativa && <AbaTransportadora transportadora={ativa} />}
        </>
      )}
    </div>
  );
}
