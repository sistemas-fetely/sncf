/**
 * Venda fora: importa o relatório da plataforma (Sublimity) lido no navegador e
 * chama fn_venda_fora_importar (prévia dry_run → gravação). Regras no banco.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatError } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { hojeISO } from "@/lib/data";
import {
  caminhoXmlSaida, lerEstoque, lerLiquidacoes, lerResumoSeller, lerXmlZip, periodoDoNome, type NfLida,
} from "@/lib/consignado/vendaForaImport";

type Res = Record<string, any>;

export function TabelaGenerica({ linhas }: { linhas: Record<string, unknown>[] }) {
  const cols = Object.keys(linhas[0] ?? {});
  return (
    <div className="max-h-72 overflow-auto rounded border">
      <Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c} className="sticky top-0 bg-background">{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{linhas.map((l, i) => (
          <TableRow key={i}>{cols.map((c) => <TableCell key={c} className={typeof l[c] === "number" ? "text-right tabular-nums" : ""}>{l[c] == null ? "—" : String(l[c])}</TableCell>)}</TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}

export function ImportarVendaForaPainel({ parceiroId }: { parceiroId: string }) {
  const sb = supabase as any;
  const qc = useQueryClient();
  const [resumo, setResumo] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [estoque, setEstoque] = useState<File | null>(null);
  const [liq, setLiq] = useState<File | null>(null);
  const [ini, setIni] = useState(""); const [fim, setFim] = useState("");
  const [dataRef, setDataRef] = useState(hojeISO());
  const [loja, setLoja] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [rodando, setRodando] = useState<"previa" | "gravar" | null>(null);

  const limpa = () => setRes(null);

  async function montar() {
    if (!resumo || !zip) throw new Error("Selecione o resumo_seller (.xlsx) e o xml_notas (.zip).");
    if (!ini || !fim) throw new Error("Informe o período.");
    const r = await lerResumoSeller(resumo);
    const lojaFinal = loja.trim() || r.loja || "";
    if (!loja.trim() && r.loja) setLoja(r.loja);
    const { nfs, xmls } = await lerXmlZip(zip);
    if (estoque && !lojaFinal) throw new Error("Informe o código da loja para ler o estoque.");
    const payload = {
      periodo_inicio: ini, periodo_fim: fim, data_ref_estoque: dataRef, loja: lojaFinal || null,
      arquivos: [resumo, zip, estoque, liq].filter(Boolean).map((f) => f!.name),
      unidades: r.unidades, devolucoes: r.devolucoes, nfs,
      estoque: estoque ? await lerEstoque(estoque, lojaFinal) : [],
      liquidacoes: liq ? await lerLiquidacoes(liq) : [],
    };
    return { payload, xmls };
  }

  async function subirXmls(nfs: NfLida[], xmls: Map<string, string>) {
    for (const nf of nfs) {
      const path = caminhoXmlSaida(nf.data_emissao, nf.numero, nf.serie);
      const { error } = await supabase.storage.from("contabil")
        .upload(path, new Blob([xmls.get(nf.chave) ?? ""], { type: "application/xml" }), { upsert: true, contentType: "application/xml" });
      if (error) throw new Error(`Falha ao guardar o XML da NF ${nf.numero}-${nf.serie} (${path}): ${error.message}`);
      nf.xml_storage_path = path;
    }
  }

  async function rodar(dry: boolean) {
    setRodando(dry ? "previa" : "gravar");
    try {
      const { payload, xmls } = await montar();
      if (!dry) await subirXmls(payload.nfs, xmls);
      const { data, error } = await sb.rpc("fn_venda_fora_importar", { p_parceiro_id: parceiroId, p_payload: payload, p_dry_run: dry });
      if (error) throw error;
      const r = (data ?? {}) as Res;
      setRes(r);
      if (dry) return;
      if (!r.gravado) throw new Error((r.faltas ?? []).join(" · ") || r.erro || "A importação não foi gravada.");
      toast.success(`Importado: ${r.unidades_novas ?? 0} unidades novas, ${r.unidades_atualizadas ?? 0} atualizadas, ${r.nfs_novas ?? 0} NFs novas.`);
      await qc.invalidateQueries();
      setRes(null);
    } catch (e) {
      toast.error(formatError(e));
    } finally { setRodando(null); }
  }

  const faltas: string[] = res?.faltas ?? [];
  const div: Record<string, unknown>[] = res?.estoque_divergencias ?? [];
  const arq = (rot: string, f: File | null, set: (f: File | null) => void, accept: string, onPick?: (f: File) => void) => (
    <div className="space-y-1">
      <Label>{rot}</Label>
      <Input type="file" accept={accept} onChange={(e) => { const x = e.target.files?.[0] ?? null; set(x); limpa(); if (x) onPick?.(x); }} />
      {f && <p className="truncate text-xs text-muted-foreground">{f.name}</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Importar relatório da plataforma (Sublimity)</CardTitle>
        <p className="text-xs text-muted-foreground">Os arquivos são lidos no seu navegador. Reimportar o mesmo arquivo é seguro: unidades já gravadas são só atualizadas (pelo lacre) e NFs já existentes não se repetem.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {arq("resumo_seller (.xlsx) *", resumo, setResumo, ".xlsx", (f) => { const p = periodoDoNome(f.name); if (p) { setIni(p.inicio); setFim(p.fim); } })}
          {arq("xml_notas (.zip) *", zip, setZip, ".zip")}
          {arq("Resumo_estoque_filial (.xlsx)", estoque, setEstoque, ".xlsx")}
          {arq("Relatorio_Liquidacoes_Parceiro (.xlsx)", liq, setLiq, ".xlsx")}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1"><Label>Período início</Label><Input type="date" value={ini} onChange={(e) => { setIni(e.target.value); limpa(); }} /></div>
          <div className="space-y-1"><Label>Período fim</Label><Input type="date" value={fim} onChange={(e) => { setFim(e.target.value); limpa(); }} /></div>
          <div className="space-y-1"><Label>Data do estoque</Label><Input type="date" value={dataRef} onChange={(e) => { setDataRef(e.target.value); limpa(); }} /></div>
          <div className="space-y-1"><Label>Código da loja</Label><Input value={loja} placeholder="7054" onChange={(e) => { setLoja(e.target.value); limpa(); }} /></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => rodar(true)} disabled={!!rodando}>
            {rodando === "previa" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ver prévia
          </Button>
          <Button onClick={() => rodar(false)} disabled={!!rodando || !res || faltas.length > 0}>
            {rodando === "gravar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Importar
          </Button>
        </div>

        {res && (
          <div className="space-y-3">
            {faltas.length > 0 && (
              <Alert variant="destructive"><AlertDescription><ul className="list-disc pl-4">{faltas.map((f, i) => <li key={i}>{f}</li>)}</ul></AlertDescription></Alert>
            )}
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">Unidades</div>{res.unidades ?? 0} ({res.unidades_novas ?? 0} novas · {res.unidades_atualizadas ?? 0} atualizadas)</div>
              <div><div className="text-xs text-muted-foreground">NFs</div>{res.nfs ?? 0} ({res.nfs_novas ?? 0} novas)</div>
              <div><div className="text-xs text-muted-foreground">Valor de venda</div>{formatBRL(res.valor_venda)}</div>
              <div><div className="text-xs text-muted-foreground">Comissão da plataforma</div>{formatBRL(res.comissao_plataforma)}</div>
              <div><div className="text-xs text-muted-foreground">MDR</div>{formatBRL(res.mdr)}</div>
              <div><div className="text-xs text-muted-foreground">Líquido a receber</div>{formatBRL(res.a_receber_liquido)}</div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Baixa de estoque por SKU</p>
              {(res.baixa_estoque ?? []).length ? <TabelaGenerica linhas={res.baixa_estoque} /> : <p className="text-sm text-muted-foreground">Nenhuma baixa.</p>}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Divergências de estoque SNCF × plataforma</p>
              {div.length ? <TabelaGenerica linhas={div} /> : (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success"><CheckCircle2 className="h-3 w-3" />Estoque bate com a plataforma</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
