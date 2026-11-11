import { useEffect, useRef, useState } from "react";
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
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2 } from "lucide-react";

type IngestResult = {
  termo: string;
  linhas_termo: number;
  entradas_cobertas: number;
  entradas_excesso: number;
  entradas_avarias: number;
  tarefas: number;
  linhas_sem_nf: number;
  skus_sem_custo: number;
  embarques_carimbados?: number;
  embarques_ambiguos?: number;
};

export function IngestaoManual() {
  const [termo, setTermo] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState("");
  const [centro, setCentro] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ingerindo, setIngerindo] = useState(false);
  const [resultado, setResultado] = useState<IngestResult | null>(null);

  const qc = useQueryClient();

  type CentroOpt = { codigo: string; nome: string };
  const centrosQ = useQuery({
    queryKey: ["centros-distribuicao-ativos"],
    queryFn: async (): Promise<CentroOpt[]> => {
      const { data, error } = await supabase
        .from("centro_distribuicao")
        .select("codigo, nome")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CentroOpt[];
    },
  });

  useEffect(() => {
    if (!centro && centrosQ.data && centrosQ.data.length > 0) {
      const padrao = centrosQ.data.find((c) => c.codigo === "XPM-SC");
      setCentro(padrao ? padrao.codigo : centrosQ.data[0].codigo);
    }
  }, [centrosQ.data, centro]);

  async function handleIngerir() {
    if (!termo.trim()) { toast.error("Informe o nº do Termo"); return; }
    if (!dataRecebimento) { toast.error("Informe a data de recebimento do termo"); return; }
    if (!centro) { toast.error("Selecione o Centro de distribuição"); return; }
    if (!file) { toast.error("Selecione o arquivo .xlsx do Termo"); return; }
    setIngerindo(true); setResultado(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");
      const fd = new FormData(); fd.append("file", file); fd.append("termo", termo.trim());
      fd.append("data_recebimento", dataRecebimento); fd.append("centro", centro);
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingerir-termo-xpm`, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: fd,
      });
      const json = await resp.json();
      if (!resp.ok || json?.error) throw new Error(json?.error ?? "Erro ao ingerir Termo");
      setResultado(json as IngestResult);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["vw_compras_nf_sem_entrada"] }),
        qc.invalidateQueries({ queryKey: ["compras-pendencias"] }),
        qc.invalidateQueries({ queryKey: ["compras-pendencias-xpm"] }),
        qc.invalidateQueries({ queryKey: ["vw_importacao_pedido_regua"] }),
        qc.invalidateQueries({ queryKey: ["recebimento"] }),
      ]);
      toast.success("Termo ingerido com sucesso");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setIngerindo(false); }
  }

  return (
        <div>
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
              <Label htmlFor="data-recebimento">Data de recebimento</Label>
              <p className="text-xs text-muted-foreground">data do termo — não é a data de hoje</p>
              <Input
                id="data-recebimento"
                type="date"
                value={dataRecebimento}
                onChange={(e) => setDataRecebimento(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="centro">Centro</Label>
              <Select
                value={centro}
                onValueChange={setCentro}
                disabled={centrosQ.isLoading}
              >
                <SelectTrigger id="centro">
                  <SelectValue placeholder={centrosQ.isLoading ? "Carregando…" : "Selecione um centro"} />
                </SelectTrigger>
                <SelectContent>
                  {(centrosQ.data ?? []).map((c) => (
                    <SelectItem key={c.codigo} value={c.codigo}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button onClick={handleIngerir} disabled={!termo || !dataRecebimento || !centro || !file || ingerindo} className="gap-2">
              {ingerindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Ingerir Termo
            </Button>

            {resultado && (
              <div className="mt-4 rounded-md border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Termo {resultado.termo} ingerido
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-md bg-muted/50 p-2">
                    <span className="block text-xs text-muted-foreground">Linhas no termo</span>
                    <span className="font-medium">{resultado.linhas_termo ?? 0}</span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <span className="block text-xs text-muted-foreground">Entradas cobertas</span>
                    <span className="font-medium text-success">{resultado.entradas_cobertas ?? 0}</span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <span className="block text-xs text-muted-foreground">Excesso</span>
                    <span className="font-medium text-warning">{resultado.entradas_excesso ?? 0}</span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <span className="block text-xs text-muted-foreground">Avarias</span>
                    <span className="font-medium text-destructive">{resultado.entradas_avarias ?? 0}</span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <span className="block text-xs text-muted-foreground">Tarefas</span>
                    <span className="font-medium">{resultado.tarefas ?? 0}</span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <span className="block text-xs text-muted-foreground">Sem NF</span>
                    <span className={`font-medium ${(resultado.linhas_sem_nf ?? 0) > 0 ? "text-warning" : ""}`}>
                      {resultado.linhas_sem_nf ?? 0}
                    </span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <span className="block text-xs text-muted-foreground">SKUs sem custo</span>
                    <span className={`font-medium ${(resultado.skus_sem_custo ?? 0) > 0 ? "text-warning" : ""}`}>
                      {resultado.skus_sem_custo ?? 0}
                    </span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2" title="Embarques que receberam a data de chegada e o status Entregue a partir deste termo">
                    <span className="block text-xs text-muted-foreground">Chegada registrada</span>
                    <span className={`font-medium ${(resultado.embarques_carimbados ?? 0) > 0 ? "text-success" : ""}`}>
                      {resultado.embarques_carimbados ?? 0}
                    </span>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2" title="Pedido com mais de um embarque em aberto — registre a chegada no Painel da Chegada de Mercadoria">
                    <span className="block text-xs text-muted-foreground">Embarque ambíguo</span>
                    <span className={`font-medium ${(resultado.embarques_ambiguos ?? 0) > 0 ? "text-warning" : ""}`}>
                      {resultado.embarques_ambiguos ?? 0}
                    </span>
                  </div>
                </div>
                {(resultado.embarques_ambiguos ?? 0) > 0 && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/vendas/produto/chegada-mercadoria?aba=painel&visao=embarque&furada=1">Abrir Painel › Data furada</Link>
                  </Button>
                )}
                {(resultado.tarefas ?? 0) > 0 && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/tarefas?origem=estoque">Ver tarefas</Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </div>
  );
}
