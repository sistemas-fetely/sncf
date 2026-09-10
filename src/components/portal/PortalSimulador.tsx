import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { chamarPortal, fmtBRL, fmtPct } from "@/lib/portal/api";

interface Props {
  sessao: string;
}

interface ItemForm {
  sku: string;
  valor_total: string;
}

/** Simulador de comissão: mostra em reais quanto o desconto extra custa. */
export function PortalSimulador({ sessao }: Props) {
  const [itens, setItens] = useState<ItemForm[]>([{ sku: "", valor_total: "" }]);
  const [desconto, setDesconto] = useState("0");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<any | null>(null);

  function atualizar(i: number, campo: keyof ItemForm, valor: string) {
    setItens((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  }

  async function simular() {
    setErro(null);
    const preparados = itens
      .map((it) => ({
        sku: it.sku.trim(),
        valor_total: Number(it.valor_total.replace(",", ".")),
      }))
      .filter((it) => it.sku && Number.isFinite(it.valor_total) && it.valor_total > 0);

    if (preparados.length === 0) {
      setErro("Informe pelo menos um produto com SKU e valor.");
      return;
    }
    const pct = Number(desconto.replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0) {
      setErro("Informe um desconto válido.");
      return;
    }

    setCarregando(true);
    setResultado(null);
    try {
      const data = await chamarPortal("estimar", {
        sessao,
        itens: preparados,
        desconto_pct: pct,
      });
      setResultado(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(msg);
      toast.error(msg);
    } finally {
      setCarregando(false);
    }
  }

  const cenarios: any[] = Array.isArray(resultado?.se_desconto_fosse)
    ? resultado.se_desconto_fosse
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Simulador de comissão</CardTitle>
        <CardDescription>
          Veja, em reais, quanto o desconto extra custa da sua comissão — antes de fechar o pedido.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {itens.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">SKU</Label>
                <Input
                  value={it.sku}
                  onChange={(e) => atualizar(i, "sku", e.target.value)}
                  placeholder="SKU do produto"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={it.valor_total}
                  onChange={(e) => atualizar(i, "valor_total", e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => setItens((p) => p.filter((_, idx) => idx !== i))}
                disabled={itens.length === 1}
                aria-label="Remover produto"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setItens((p) => [...p, { sku: "", valor_total: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar produto
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-[160px_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Desconto (%)</Label>
            <Input
              inputMode="decimal"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
            />
          </div>
          <Button onClick={simular} disabled={carregando}>
            {carregando ? "Calculando…" : "Simular"}
          </Button>
        </div>

        {erro && <p className="text-xs text-destructive">{erro}</p>}

        {resultado && (
          <div className="space-y-3 rounded-md border border-border/60 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-muted-foreground">Comissão estimada</span>
              <span className="text-2xl font-medium">{fmtBRL(resultado.valor_comissao)}</span>
            </div>
            {resultado.pct_efetivo !== undefined && (
              <p className="text-xs text-muted-foreground">
                % efetivo: {fmtPct(resultado.pct_efetivo)}
                {resultado.base !== undefined ? ` · base ${fmtBRL(resultado.base)}` : ""}
              </p>
            )}

            {cenarios.length > 0 && (
              <div className="space-y-2 rounded-md bg-warning/10 p-3">
                <p className="text-sm font-medium">Se o desconto fosse…</p>
                <div className="space-y-1">
                  {cenarios.map((c: any, i: number) => (
                    <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span>Com {fmtPct(c.desconto_pct)} de desconto</span>
                      <span className="font-medium">{fmtBRL(c.valor_comissao)}</span>
                      {c.diferenca !== undefined && c.diferenca !== null && (
                        <span
                          className={
                            Number(c.diferenca) < 0
                              ? "text-xs text-destructive"
                              : "text-xs text-success"
                          }
                        >
                          diferença {fmtBRL(c.diferenca)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
