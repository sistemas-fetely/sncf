import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useListaPaginada, gruposAgregado } from "@/lib/lista/useListaPaginada";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2 } from "lucide-react";

/** Planilha de cadastro XPM; o termo físico fica na Chegada de Mercadoria. */
export function EntradaXpm({ pedidoRef: refControlado, onPedidoRefChange }: { pedidoRef?: string; onPedidoRefChange?: (v: string) => void } = {}) {
  const [refLocal, setRefLocal] = useState<string>("");
  const pedidoRef = refControlado ?? refLocal;
  const setPedidoRef = onPedidoRefChange ?? setRefLocal;
  const [gerando, setGerando] = useState(false);
  // Pré-seleção vinda de ?pedido_ref=… (uma única vez; não sobrescreve escolha manual).
  const [searchParams] = useSearchParams();
  const pedidoRefUrl = searchParams.get("pedido_ref");
  const preSelecionou = useRef(false);


  type PedidoOpt = {
    numero_pedido: string;
    pedido_ref: string;
    fase: 1 | 2 | "mista";
    linhas: number;
    label: string;
  };

  const pedidosQ = useListaPaginada({ relacao: "vw_xpm_cad_item", tamanho: 1,
    agregados: [{ id: "pedidos", fn: "count", por: ["numero_pedido", "pedido_ref", "fase"] }] });
  const agg = new Map<string, { numero_pedido: string; pedido_ref: string; fases: Set<number>; linhas: number }>();
  for (const r of gruposAgregado(pedidosQ.data?.agregados, "pedidos")) {
    const ref = String(r.pedido_ref);
    const cur = agg.get(ref) ?? { numero_pedido: String(r.numero_pedido), pedido_ref: ref, fases: new Set<number>(), linhas: 0 };
    cur.fases.add(Number(r.fase));
    cur.linhas += Number(r.valor ?? 0);
    agg.set(ref, cur);
  }
  const pedidos: PedidoOpt[] = [...agg.values()].map(v => {
    const fase = v.fases.size > 1 ? "mista" as const : v.fases.has(1) ? 1 as const : 2 as const;
    const faseTxt = fase === "mista" ? "fase mista" : fase === 1 ? "fase 1 — sem NF" : "fase 2 — com NF";
    return { numero_pedido: v.numero_pedido, pedido_ref: v.pedido_ref, fase, linhas: v.linhas,
      label: `${v.numero_pedido} · ${v.pedido_ref} · ${faseTxt} · ${v.linhas} linhas` };
  }).sort((a,b) => b.numero_pedido.localeCompare(a.numero_pedido));

  useEffect(() => {
    if (preSelecionou.current || !pedidoRefUrl || !pedidosQ.data) return;
    preSelecionou.current = true;
    if (pedidos.some((p) => p.pedido_ref === pedidoRefUrl)) setPedidoRef(pedidoRefUrl);
  }, [pedidosQ.data, pedidoRefUrl]);

  async function handleGerar() {
    if (!pedidoRef) {
      toast.error("Selecione um pedido");
      return;
    }
    setGerando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gerar-planilha-xpm`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pedido_ref: pedidoRef }),
        }
      );

      const ct = resp.headers.get("Content-Type") ?? "";
      if (!resp.ok || ct.includes("application/json")) {
        const j = await resp.json().catch(() => ({ error: "Erro ao gerar planilha" }));
        throw new Error(j.error ?? "Erro ao gerar planilha");
      }

      const blob = await resp.blob();
      const cd = resp.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? `XPM_Cad_item_${pedidoRef}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Planilha gerada com sucesso");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar planilha");
    } finally {
      setGerando(false);
    }
  }

  return (
      <div className="space-y-4">
        {/* AÇÃO 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4" />
              Gerar planilha de recebimento XPM (SKU × NF)
            </CardTitle>
            <CardDescription>Escolha o pedido e baixe a planilha que traduz a NF para os nossos SKUs (Código Material × NF × Cod. NF). Serve para cadastro e para o recebimento na XPM. Pedido em fase 1 (sem NF) sai com NF e Cod. NF vazios.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pedidosQ.error && <p className="text-sm text-destructive">{pedidosQ.error.message}</p>}
            <div className="space-y-2">
              <Label>Pedido de importação</Label>
              <Select value={pedidoRef} onValueChange={setPedidoRef} disabled={pedidosQ.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={pedidosQ.isLoading ? "Carregando…" : "Selecione um pedido"} />
                </SelectTrigger>
                <SelectContent>
                  {pedidos.map((p) => (
                    <SelectItem key={p.pedido_ref} value={p.pedido_ref}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGerar} disabled={!pedidoRef || gerando} className="gap-2">
              {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Gerar planilha
            </Button>
          </CardContent>
        </Card>

      </div>
  );
}
