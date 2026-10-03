import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export type TipoBenFrete = "nenhum" | "pct" | "valor" | "gratis";
export type TipoBenPedido = "nenhum" | "pct" | "valor";

export interface BeneficioEstado {
  freteTipo: TipoBenFrete;
  freteValor: string;
  pedidoTipo: TipoBenPedido;
  pedidoValor: string;
  motivo: string;
}

export const BENEFICIO_VAZIO: BeneficioEstado = { freteTipo: "nenhum", freteValor: "", pedidoTipo: "nenhum", pedidoValor: "", motivo: "" };

export function numBR(s: string): number {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Calcula frete cobrado e desconto do pedido (o banco revalida). */
export function calcularBeneficio(b: BeneficioEstado, valorItens: number, freteCotado: number, comEntrega: boolean) {
  const ft = comEntrega ? b.freteTipo : "nenhum";
  const fv = numBR(b.freteValor);
  let freteCobrado = freteCotado;
  if (ft === "gratis") freteCobrado = 0;
  else if (ft === "pct") freteCobrado = r2(freteCotado * (1 - Math.min(Math.max(fv, 0), 100) / 100));
  else if (ft === "valor") freteCobrado = r2(Math.max(freteCotado - fv, 0));
  const pv = numBR(b.pedidoValor);
  let desconto = 0;
  if (b.pedidoTipo === "pct") desconto = r2(valorItens * Math.min(Math.max(pv, 0), 100) / 100);
  else if (b.pedidoTipo === "valor") desconto = r2(Math.max(pv, 0));
  const ativo = ft !== "nenhum" || b.pedidoTipo !== "nenhum";
  return { freteTipo: ft, freteCobrado, desconto, ativo };
}

export function payloadBeneficio(b: BeneficioEstado, comEntrega: boolean) {
  const motivo = b.motivo.trim();
  const frete = comEntrega && b.freteTipo !== "nenhum"
    ? { tipo: b.freteTipo, ...(b.freteTipo === "gratis" ? {} : { valor: numBR(b.freteValor) }), motivo }
    : { tipo: "nenhum" };
  const pedido = b.pedidoTipo !== "nenhum" ? { tipo: b.pedidoTipo, valor: numBR(b.pedidoValor), motivo } : { tipo: "nenhum" };
  return { frete, pedido };
}

function Segmentado<T extends string>({ opcoes, valor, onChange }: { opcoes: { v: T; r: string }[]; valor: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border bg-muted p-1">
      {opcoes.map((o) => (
        <Button key={o.v} type="button" size="sm" variant={valor === o.v ? "secondary" : "ghost"} className={valor === o.v ? "bg-card shadow-sm" : ""} onClick={() => onChange(o.v)}>
          {o.r}
        </Button>
      ))}
    </div>
  );
}

export function BeneficioCard({ v, onChange, comEntrega }: { v: BeneficioEstado; onChange: (b: BeneficioEstado) => void; comEntrega: boolean }) {
  const set = (p: Partial<BeneficioEstado>) => onChange({ ...v, ...p });
  const ativo = (comEntrega && v.freteTipo !== "nenhum") || v.pedidoTipo !== "nenhum";
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Benefício</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {comEntrega && (
          <div className="space-y-2">
            <Label>Frete</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Segmentado<TipoBenFrete>
                valor={v.freteTipo}
                onChange={(t) => set({ freteTipo: t, freteValor: "" })}
                opcoes={[{ v: "nenhum", r: "Cobrar cotação" }, { v: "pct", r: "Desconto %" }, { v: "valor", r: "Desconto R$" }, { v: "gratis", r: "Grátis" }]}
              />
              {(v.freteTipo === "pct" || v.freteTipo === "valor") && (
                <Input className="w-28 tabular-nums" inputMode="decimal" placeholder={v.freteTipo === "pct" ? "%" : "R$"} value={v.freteValor} onChange={(e) => set({ freteValor: e.target.value })} />
              )}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label>Pedido</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Segmentado<TipoBenPedido>
              valor={v.pedidoTipo}
              onChange={(t) => set({ pedidoTipo: t, pedidoValor: "" })}
              opcoes={[{ v: "nenhum", r: "Sem desconto" }, { v: "pct", r: "Desconto %" }, { v: "valor", r: "Desconto R$" }]}
            />
            {v.pedidoTipo !== "nenhum" && (
              <Input className="w-28 tabular-nums" inputMode="decimal" placeholder={v.pedidoTipo === "pct" ? "%" : "R$"} value={v.pedidoValor} onChange={(e) => set({ pedidoValor: e.target.value })} />
            )}
          </div>
        </div>
        {ativo && (
          <div className="space-y-1">
            <Label>Motivo*</Label>
            <Input value={v.motivo} onChange={(e) => set({ motivo: e.target.value })} placeholder="Por que este benefício?" />
            <p className="text-xs text-muted-foreground">O benefício reduz a margem e fica registrado no pedido.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
