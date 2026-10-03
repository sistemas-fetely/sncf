import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calculator, Loader2 } from "lucide-react";
import { useFreteEstimado } from "@/hooks/transportadoras/useFreteEstimado";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  transportadoraId: string;
}

export function TabelaPreco({ transportadoraId }: Props) {
  const [cep, setCep] = useState("");
  const [peso, setPeso] = useState("");
  const [valorNf, setValorNf] = useState("");
  const [trigger, setTrigger] = useState<{ cep: string; peso: number; valor: number | null } | null>(null);

  const { data: estimado, isFetching } = useFreteEstimado(
    transportadoraId,
    trigger?.cep ?? null,
    trigger?.peso ?? null,
    trigger?.valor ?? null
  );

  function calcular() {
    const p = parseFloat(peso.replace(",", "."));
    if (!cep || !p || isNaN(p)) return;
    const v = parseFloat(valorNf.replace(",", "."));
    setTrigger({ cep: cep.replace(/\D/g, ""), peso: p, valor: v > 0 ? v : null });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Calculadora de frete</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground">CEP destino</label>
            <Input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Peso (kg)</label>
            <Input value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Valor da NF (R$)</label>
            <Input value={valorNf} onChange={(e) => setValorNf(e.target.value)} placeholder="opcional" />
          </div>
          <Button onClick={calcular} disabled={!cep || !peso}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Calcular"}
          </Button>
        </div>

        {estimado && (
          <div className="mt-4 border-t pt-3 text-sm space-y-1">
            {estimado.erro ? (
              <div className="text-destructive">{estimado.erro}</div>
            ) : (
              <>
                <div className="text-2xl font-medium tabular-nums">
                  {BRL.format(estimado.valor_estimado)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Tarifa {estimado.tarifa_code} · prazo ~{estimado.prazo_dias} dia(s) · peso cobrado {estimado.peso_cobrado} kg
                </div>
                <div className="text-xs text-muted-foreground">
                  Base {BRL.format(estimado.breakdown.base)} · GRIS {BRL.format(estimado.breakdown.gris)} · Pedágio {BRL.format(estimado.breakdown.pedagio)} · TAS {BRL.format(estimado.breakdown.tas)}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Esta tela é somente leitura. A tabela de preço é gerenciada na configuração da transportadora.
      </p>
    </div>
  );
}
