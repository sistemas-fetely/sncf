import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Campos = Record<string, string>;
const TEXTO = ["origem", "nome_comercial", "nome_completo", "marca", "linha", "motivo", "ncm", "cest", "origem_fisc", "categoria", "departamento", "cor_nome"];
const NUMERO = ["inner_qtd", "preco_atacado", "preco_varejo"];
const MAIS: [string, string][] = [["ncm", "NCM"], ["cest", "CEST"], ["origem_fisc", "Origem fiscal"], ["preco_atacado", "Preço atacado"], ["preco_varejo", "Preço varejo"], ["categoria", "Categoria"], ["departamento", "Departamento"], ["cor_nome", "Cor"]];
const INICIAL: Campos = { origem: "nacional", origem_fisc: "0" };

export function montar(c: Campos) {
  const p: Record<string, unknown> = {};
  for (const k of TEXTO) { const v = (c[k] ?? "").trim(); if (v) p[k] = v; }
  for (const k of NUMERO) { const v = (c[k] ?? "").trim().replace(",", "."); if (v) p[k] = Number(v); }
  return p;
}

type Previa = { nasceria?: Record<string, any>; cartorio?: Record<string, any>; aviso_nome_igual_ja_existe?: number | null };

export function NascerProdutoNacionalDialog({ open, onOpenChange, onNasceu }: { open: boolean; onOpenChange: (v: boolean) => void; onNasceu: () => void }) {
  const [c, setC] = useState<Campos>(INICIAL);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);

  useEffect(() => { if (!open) { setC(INICIAL); setPrevia(null); setErro(null); } }, [open]);

  const set = (k: string, v: string) => { setC((o) => ({ ...o, [k]: v })); setPrevia(null); };

  async function chamar(dry: boolean) {
    setRodando(true); setErro(null);
    try {
      const { data, error } = await (supabase.rpc as any)("fn_nascer_produto", { p_produto: montar(c), p_dry_run: dry });
      if (error) throw error;
      if (dry) setPrevia(data as Previa);
      else {
        const r = data as Record<string, any>;
        toast.success(`Produto ${r?.cod_cadastro} nasceu — fase Registrado`);
        onNasceu();
        onOpenChange(false);
      }
    } catch (e) {
      const m = rawMessage(e);
      setErro(m);
      toast.error(m);
    } finally { setRodando(false); }
  }

  const n = previa?.nasceria;
  const campo = (k: string, rot: string, ph?: string, tipo = "text") => (
    <div className="space-y-1.5"><Label htmlFor={`np-${k}`}>{rot}</Label><Input id={`np-${k}`} type={tipo} value={c[k] ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !rodando && onOpenChange(v)}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nascer produto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Origem</Label>
            <RadioGroup value={c.origem} onValueChange={(v) => set("origem", v)} className="flex gap-6" aria-label="Origem">
              <div className="flex items-center gap-2"><RadioGroupItem id="np-origem-nacional" value="nacional" /><Label htmlFor="np-origem-nacional">Nacional</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem id="np-origem-importado" value="importado" /><Label htmlFor="np-origem-importado">Importado</Label></div>
            </RadioGroup>
          </div>
          {campo("nome_comercial", "Nome comercial *")}
          {campo("nome_completo", "Nome completo")}
          <div className="grid grid-cols-2 gap-3">{campo("marca", "Marca")}{campo("linha", "Linha")}</div>
          <div className="space-y-1.5">
            <Label htmlFor="np-inner_qtd">Inner (qtd. caixa master){c.origem === "importado" ? " *" : ""}</Label>
            <Input id="np-inner_qtd" type="number" min={1} required={c.origem === "importado"} value={c.inner_qtd ?? ""} onChange={(e) => set("inner_qtd", e.target.value)} />
            <p className="text-xs text-muted-foreground">{c.origem === "importado" ? "Obrigatório para importado — vem do packing list" : "Quantidade da caixa master. Sem caixa master? Deixe vazio — o produto nasce sem DUN."}</p>
          </div>
          {campo("motivo", "Motivo", "ex.: NF Mirandinha 56789")}
          <Collapsible>
            <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="px-0"><ChevronDown className="mr-1 h-4 w-4" />Mais campos (opcional)</Button></CollapsibleTrigger>
            <CollapsibleContent className="grid grid-cols-2 gap-3 pt-2">
              {MAIS.map(([k, r]) => <div key={k}>{campo(k, r, undefined, NUMERO.includes(k) ? "number" : "text")}</div>)}
            </CollapsibleContent>
          </Collapsible>

          {erro && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap break-words">{erro}</AlertDescription></Alert>}

          {n && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Origem</span><span>{n.origem === "nacional" ? "Nacional" : n.origem === "importado" ? "Importado" : n.origem ?? "—"}</span>
                <span className="text-muted-foreground">Código</span><span className="font-mono">{n.cod_cadastro}</span>
                <span className="text-muted-foreground">EAN</span><span className="font-mono">{n.ean}</span>
                <span className="text-muted-foreground">DUN</span><span>{n.dun ? <span className="font-mono">{String(n.dun)}</span> : <Badge variant="secondary">sem DUN — sem caixa master</Badge>}</span>
                <span className="text-muted-foreground">SKU</span><span className="font-mono">{n.sku}</span>
                <span className="text-muted-foreground">Fase</span><span>Registrado</span>
                <span className="text-muted-foreground">Códigos GS1 livres depois</span><span>{previa?.cartorio?.livres_depois ?? "—"}</span>
              </div>
              {previa?.aviso_nome_igual_ja_existe != null && (
                <Alert className="border-warning/50 bg-warning/10"><AlertDescription>Já existe(m) {previa.aviso_nome_igual_ja_existe} produto(s) com esse nome</AlertDescription></Alert>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={rodando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          {!previa ? (
            <Button disabled={rodando || !(c.nome_comercial ?? "").trim()} onClick={() => chamar(true)}>{rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Pré-visualizar nascimento</Button>
          ) : (
            <Button disabled={rodando} onClick={() => chamar(false)}>{rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar nascimento</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
