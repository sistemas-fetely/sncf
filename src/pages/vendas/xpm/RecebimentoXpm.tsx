import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, Scale } from "lucide-react";
import { SincronizacaoEstoqueShopify } from "@/components/acervo/SincronizacaoEstoqueShopify";

type IngestResult = {
  termo: string;
  contagens?: number;
  movimentos?: number;
  tarefas?: number;
};

type AmostraLinha = { sku: string; de: number | null; para: number | null; classe: string };
type PesosResult = {
  confirmado: boolean;
  gravados: number;
  preenche: number;
  sobrescreve: number;
  igual: number;
  peso_invalido: number;
  sku_desconhecido: number;
  amostra: AmostraLinha[];
};

export default function RecebimentoXpm() {
  const [pedidoRef, setPedidoRef] = useState<string>("");
  const [gerando, setGerando] = useState(false);
  const [termo, setTermo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ingerindo, setIngerindo] = useState(false);
  const [resultado, setResultado] = useState<IngestResult | null>(null);

  type PedidoOpt = {
    numero_pedido: string;
    pedido_ref: string;
    fase: 1 | 2 | "mista";
    linhas: number;
    label: string;
  };

  const pedidosQ = useQuery({
    queryKey: ["xpm-cad-item-pedidos"],
    queryFn: async (): Promise<PedidoOpt[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_cad_item")
        .select("numero_pedido, pedido_ref, fase");
      if (error) throw error;
      const rows = (data ?? []) as { numero_pedido: string; pedido_ref: string; fase: number }[];
      const agg = new Map<string, { numero_pedido: string; pedido_ref: string; fases: Set<number>; linhas: number }>();
      for (const r of rows) {
        const cur = agg.get(r.pedido_ref) ?? { numero_pedido: r.numero_pedido, pedido_ref: r.pedido_ref, fases: new Set<number>(), linhas: 0 };
        cur.fases.add(r.fase);
        cur.linhas += 1;
        agg.set(r.pedido_ref, cur);
      }
      const opts: PedidoOpt[] = [];
      for (const v of agg.values()) {
        const fase: 1 | 2 | "mista" = v.fases.size > 1 ? "mista" : (v.fases.has(1) ? 1 : 2);
        const faseTxt = fase === "mista" ? "fase mista" : fase === 1 ? "fase 1 — sem NF" : "fase 2 — com NF";
        opts.push({
          numero_pedido: v.numero_pedido,
          pedido_ref: v.pedido_ref,
          fase,
          linhas: v.linhas,
          label: `${v.numero_pedido} · ${v.pedido_ref} · ${faseTxt} · ${v.linhas} linhas`,
        });
      }
      return opts.sort((a, b) => b.numero_pedido.localeCompare(a.numero_pedido));
    },
  });

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

  async function handleIngerir() {
    if (!termo.trim()) {
      toast.error("Informe o nº do Termo");
      return;
    }
    if (!file) {
      toast.error("Selecione o arquivo .xlsx do Termo");
      return;
    }
    setIngerindo(true);
    setResultado(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const fd = new FormData();
      fd.append("file", file);
      fd.append("termo", termo.trim());

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingerir-termo-xpm`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd,
        }
      );
      const json = await resp.json();
      if (!resp.ok || json?.error) throw new Error(json?.error ?? "Erro ao ingerir Termo");
      setResultado(json as IngestResult);
      toast.success("Termo ingerido com sucesso");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao ingerir Termo");
    } finally {
      setIngerindo(false);
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-8 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Recebimento XPM</h1>
        <p className="text-sm text-muted-foreground">
          Envie a planilha de cadastro pra XPM e ingira o Termo de Conferência de volta pra dar entrada no estoque.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AÇÃO 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4" />
              Gerar planilha XPM
            </CardTitle>
            <CardDescription>Escolha o pedido de importação e baixe a planilha de cadastro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Pedido de importação</Label>
              <Select value={pedidoRef} onValueChange={setPedidoRef} disabled={pedidosQ.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={pedidosQ.isLoading ? "Carregando…" : "Selecione um pedido"} />
                </SelectTrigger>
                <SelectContent>
                  {(pedidosQ.data ?? []).map((p) => (
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

        {/* AÇÃO 2 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" />
              Subir Termo de Conferência
            </CardTitle>
            <CardDescription>Ingerir o retorno da XPM — dá entrada no estoque e gera tarefas de divergência.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="termo">Nº do Termo</Label>
              <Input
                id="termo"
                placeholder="Ex.: RE0009-02"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arquivo">Arquivo (.xlsx)</Label>
              <Input
                id="arquivo"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button onClick={handleIngerir} disabled={!termo || !file || ingerindo} className="gap-2">
              {ingerindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Ingerir Termo
            </Button>

            {resultado && (
              <div className="mt-4 rounded-md border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Termo {resultado.termo} ingerido
                </div>
                <p className="text-sm text-muted-foreground">
                  {resultado.contagens ?? 0} SKUs contados, {resultado.movimentos ?? 0} movimentos de entrada,{" "}
                  {resultado.tarefas ?? 0} tarefas de divergência geradas.
                </p>
                {(resultado.tarefas ?? 0) > 0 && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/tarefas?origem=estoque">Ver tarefas</Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <SincronizacaoEstoqueShopify />
    </div>
  );
}
