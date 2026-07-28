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

  const qc = useQueryClient();
  const [pesosFile, setPesosFile] = useState<File | null>(null);
  const [baixandoModelo, setBaixandoModelo] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [gravandoPesos, setGravandoPesos] = useState(false);
  const [previa, setPrevia] = useState<PesosResult | null>(null);
  const [permitirSobrescrita, setPermitirSobrescrita] = useState(false);

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

  async function callPesos(init: RequestInit) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sessão expirada. Faça login novamente.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pesos-produto`, {
      ...init,
      headers,
    });
  }

  async function handleBaixarModeloPesos() {
    setBaixandoModelo(true);
    try {
      const body: Record<string, unknown> = { acao: "modelo" };
      if (pedidoRef) body.pedido_ref = pedidoRef;
      const resp = await callPesos({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const ct = resp.headers.get("Content-Type") ?? "";
      if (!resp.ok || ct.includes("application/json")) {
        const j = await resp.json().catch(() => ({ error: "Erro ao baixar modelo" }));
        throw new Error(j.error ?? "Erro ao baixar modelo");
      }
      const blob = await resp.blob();
      const cd = resp.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? `Pesos_${pedidoRef || "catalogo"}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Modelo baixado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao baixar modelo");
    } finally {
      setBaixandoModelo(false);
    }
  }

  async function handleImportarPesos(confirmar: boolean) {
    if (!pesosFile) {
      toast.error("Selecione o arquivo .xlsx com os pesos");
      return;
    }
    if (confirmar) setGravandoPesos(true);
    else setConferindo(true);
    try {
      const fd = new FormData();
      fd.append("acao", "importar");
      fd.append("file", pesosFile);
      fd.append("confirmar", String(confirmar));
      fd.append("permitir_sobrescrita", String(permitirSobrescrita));
      const resp = await callPesos({ method: "POST", body: fd });
      const json = await resp.json();
      if (!resp.ok || json?.error) throw new Error(json?.error ?? "Erro ao processar pesos");
      const r = json as PesosResult;
      setPrevia(r);
      if (confirmar) {
        toast.success(`${r.gravados} peso(s) gravado(s)`);
        setPesosFile(null);
        setPermitirSobrescrita(false);
        qc.invalidateQueries({ queryKey: ["xpm-cad-item-pedidos"] });
      } else {
        toast.success("Conferência concluída — revise a prévia antes de gravar");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao processar pesos");
    } finally {
      setConferindo(false);
      setGravandoPesos(false);
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

      {/* PESOS DE PRODUTO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4" />
            Pesos de produto
          </CardTitle>
          <CardDescription>
            A planilha da XPM exige peso por SKU. Baixe o modelo com os SKUs que faltam, preencha e suba.
            <span className="block text-xs text-muted-foreground mt-1">Grava no cadastro de produto.</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Button
              onClick={handleBaixarModeloPesos}
              disabled={baixandoModelo}
              variant="outline"
              className="gap-2"
            >
              {baixandoModelo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar modelo de pesos
            </Button>
            <p className="text-xs text-muted-foreground">
              {pedidoRef
                ? `SKUs sem peso do pedido ${pedidoRef}.`
                : "Sem pedido selecionado acima — baixa todos os SKUs do catálogo sem peso."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:items-end">
            <div className="space-y-2">
              <Label htmlFor="pesos-file">Arquivo preenchido (.xlsx)</Label>
              <Input
                id="pesos-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  setPesosFile(e.target.files?.[0] ?? null);
                  setPrevia(null);
                  setPermitirSobrescrita(false);
                }}
              />
            </div>
            <Button
              onClick={() => handleImportarPesos(false)}
              disabled={!pesosFile || conferindo || gravandoPesos}
              variant="outline"
              className="gap-2"
            >
              {conferindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Conferir
            </Button>
          </div>

          {previa && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span><b>{previa.gravados}</b> gravados</span>
                <span><b>{previa.preenche}</b> a preencher</span>
                <span><b>{previa.sobrescreve}</b> sobrescreve</span>
                <span><b>{previa.igual}</b> igual</span>
                <span className={previa.peso_invalido > 0 ? "text-destructive" : ""}>
                  <b>{previa.peso_invalido}</b> peso inválido
                </span>
                <span className={previa.sku_desconhecido > 0 ? "text-destructive" : ""}>
                  <b>{previa.sku_desconhecido}</b> SKU desconhecido
                </span>
              </div>

              {previa.amostra?.length > 0 && (
                <div className="rounded border bg-background">
                  <div className="grid grid-cols-[1fr_100px_100px_140px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                    <span>SKU</span>
                    <span className="text-right">De</span>
                    <span className="text-right">Para</span>
                    <span>Classe</span>
                  </div>
                  {previa.amostra.map((a, i) => {
                    const err = a.classe === "sku_desconhecido" || a.classe === "peso_invalido";
                    return (
                      <div
                        key={`${a.sku}-${i}`}
                        className={`grid grid-cols-[1fr_100px_100px_140px] gap-2 px-3 py-1.5 text-sm border-b last:border-b-0 ${err ? "text-destructive" : ""}`}
                      >
                        <span className="font-mono">{a.sku}</span>
                        <span className="text-right tabular-nums">{a.de ?? "—"}</span>
                        <span className="text-right tabular-nums">{a.para ?? "—"}</span>
                        <span className="text-xs">{a.classe}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {!previa.confirmado && (
                <div className="space-y-3 pt-2 border-t">
                  {previa.sobrescreve > 0 && (
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={permitirSobrescrita}
                        onCheckedChange={(v) => setPermitirSobrescrita(v === true)}
                      />
                      <span>
                        Permitir sobrescrever pesos já preenchidos ({previa.sobrescreve}).
                        <span className="block text-xs text-muted-foreground">
                          Sem esta opção, apenas os {previa.preenche} SKU(s) ainda sem peso serão gravados.
                        </span>
                      </span>
                    </label>
                  )}
                  <Button
                    onClick={() => handleImportarPesos(true)}
                    disabled={gravandoPesos || conferindo}
                    className="gap-2"
                  >
                    {gravandoPesos ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Confirmar gravação
                  </Button>
                </div>
              )}

              {previa.confirmado && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 pt-2 border-t">
                  <CheckCircle2 className="h-4 w-4" />
                  Gravação concluída.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <SincronizacaoEstoqueShopify />

    </div>
  );
}
