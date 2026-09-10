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
              <span className="text-2xl font-medium">{fmtBRL(resultado.comissao_estimada)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Mercadoria a tabela {fmtBRL(resultado.mercadoria_tabela)} · base{" "}
              {fmtBRL(resultado.base_estimada)} com {fmtPct(resultado.desconto_pct)} de desconto
            </p>

            {resultado.faixa?.ajuste_pp > 0 && (
              <p className="text-xs text-warning">
                Seu desconto caiu na faixa de {fmtPct(resultado.faixa.de)} a{" "}
                {fmtPct(resultado.faixa.ate)}, que reduz {resultado.faixa.ajuste_pp} ponto(s) da
                comissão.
              </p>
            )}
            {resultado.faixa?.exige_diretoria && (
              <p className="text-xs text-destructive">
                Esse desconto depende de aprovação da diretoria.
              </p>
            )}

            {(resultado.linhas ?? []).length > 0 && (
              <div className="space-y-1 border-t border-border/60 pt-2">
                {(resultado.linhas as any[]).map((l: any, i: number) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
                  >
                    <span className="font-medium">{l.linha}</span>
                    <span className="text-muted-foreground">
                      base {fmtBRL(l.base)} · {fmtPct(l.pct_efetivo)} efetivo
                    </span>
                    <span className="font-medium">{fmtBRL(l.comissao)}</span>
                  </div>
                ))}
              </div>
            )}

            {resultado.se_desconto_fosse && (
              <div className="rounded-md border border-success/60 bg-success/10 p-3">
                <p className="text-sm">
                  Com {fmtPct(resultado.desconto_pct)} de desconto:{" "}
                  {fmtBRL(resultado.comissao_estimada)}. Com{" "}
                  {fmtPct(resultado.se_desconto_fosse.desconto_pct)}:{" "}
                  {fmtBRL(resultado.se_desconto_fosse.comissao)}.
                </p>
                <p className="mt-1 text-base font-semibold text-success">
                  Diferença: {fmtBRL(resultado.se_desconto_fosse.diferenca)} a mais para você.
                </p>
              </div>
            )}

            {(resultado.avisos ?? []).length > 0 && (
              <div className="space-y-1 rounded-md bg-warning/10 p-3">
                {(resultado.avisos as string[]).map((a: string, i: number) => (
                  <p key={i} className="text-xs text-warning">
                    {a}
                  </p>
                ))}
              </div>
            )}

            {resultado.nota && (
              <p className="text-xs text-muted-foreground">{resultado.nota}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
