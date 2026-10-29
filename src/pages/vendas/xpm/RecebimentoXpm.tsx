import { useEffect, useRef, useState } from "react";
import { CodProduto } from "@/components/produto/CodProduto";
import { Link, useSearchParams } from "react-router-dom";
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
import { EntradaXpm } from "./components/EntradaXpm";
import { PainelSyncEstoque } from "@/components/acervo/PainelSyncEstoque";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

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
  const qc = useQueryClient();
  const [pesosFile, setPesosFile] = useState<File | null>(null);
  const [baixandoModelo, setBaixandoModelo] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [gravandoPesos, setGravandoPesos] = useState(false);
  const [previa, setPrevia] = useState<PesosResult | null>(null);
  const [permitirSobrescrita, setPermitirSobrescrita] = useState(false);
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
    <PageShell className="md:px-8">
      <PageHeader
        titulo="Recebimento XPM"
        estado="Envie a planilha de cadastro pra XPM e ingira o Termo de Conferência de volta pra dar entrada no estoque."
      />

      <EntradaXpm pedidoRef={pedidoRef} onPedidoRefChange={setPedidoRef} />

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
                    <span>Código</span>
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
                        <span><CodProduto chave={a.sku} variant="compacto" /></span>
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
                <div className="flex items-center gap-2 text-sm text-success pt-2 border-t">
                  <CheckCircle2 className="h-4 w-4" />
                  Gravação concluída.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <PainelSyncEstoque />

    </PageShell>
  );
}
