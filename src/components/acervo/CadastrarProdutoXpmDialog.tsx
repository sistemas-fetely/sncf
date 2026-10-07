import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Payload = {
  pode_enviar?: boolean; bloqueios?: string[]; provisorio?: string[]; aviso_corte?: string | null;
  passo_1_produto?: Record<string, any>; passo_2_produto_sku?: Record<string, any>; referencia_dun?: string | null;
};

// Corpo de erro da edge vem na íntegra.
async function erroDaEdge(error: any, data: any): Promise<string> {
  let corpo: any = data;
  const ctx = error?.context;
  if (ctx && typeof ctx.text === "function") {
    const t = await ctx.text().catch(() => "");
    try { corpo = JSON.parse(t); } catch { corpo = t || null; }
  }
  if (corpo && typeof corpo === "object") return JSON.stringify(corpo);
  return corpo ? String(corpo) : rawMessage(error);
}

export function CadastrarProdutoXpmDialog({ sku, open, onOpenChange, onCadastrado }: { sku: string; open: boolean; onOpenChange: (v: boolean) => void; onCadastrado?: () => void }) {
  const [p, setP] = useState<Payload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) { setP(null); setErro(null); return; }
    let vivo = true;
    (async () => {
      setCarregando(true); setErro(null);
      const { data, error } = await (supabase.rpc as any)("fn_xpm_payload_cadastro", { p_sku: sku });
      if (!vivo) return;
      if (error) { const m = rawMessage(error); setErro(m); toast.error(m); } else setP(data as Payload);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [open, sku]);

  async function confirmar() {
    setEnviando(true); setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("cadastrar-produto-xpm", { body: { sku } });
      if (error || (data as any)?.ok !== true) throw new Error(await erroDaEdge(error, data));
      const r = data as Record<string, any>;
      toast.success(`${sku} cadastrado no XPM — produto ${r.xpm_produto_id} · SKU ${r.xpm_sku_id}`);
      onCadastrado?.();
      onOpenChange(false);
    } catch (e) {
      const m = (e as Error).message;
      setErro(m); toast.error(m);
    } finally { setEnviando(false); }
  }

  const p1 = p?.passo_1_produto ?? {};
  const prov = new Set(p?.provisorio ?? []);
  const bloqueios = p?.bloqueios ?? [];
  const num = (v: unknown) => (v == null ? "—" : String(v));
  const linha = (rot: string, v: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 border-b py-1.5 text-sm last:border-0"><span className="text-muted-foreground">{rot}</span><span className="text-right font-medium">{v}</span></div>
  );
  const provBadge = (k: string) => prov.has(k) ? <Badge variant="outline" className="ml-2 border-warning text-warning-strong">PROVISÓRIO</Badge> : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Cadastrar no XPM — {sku}</DialogTitle></DialogHeader>
        {carregando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Montando prévia…</div>}
        {p && (
          <div className="space-y-3">
            {bloqueios.length > 0 && (
              <Alert variant="destructive"><AlertDescription><ul className="list-disc pl-4">{bloqueios.map((b) => <li key={b}>{b}</li>)}</ul></AlertDescription></Alert>
            )}
            <div className="rounded-md border px-3">
              {linha("Código", p1.codigo ?? "—")}
              {linha("Descrição", p1.descricao ?? "—")}
              {linha("Descrição reduzida", p1.descricaoReduzida ?? "—")}
              {linha("Categoria (id)", num(p1.categoriaId))}
              {linha("Peso (kg)", <>{num(p1.pesoUnitario)}{provBadge("peso")}</>)}
              {linha("Medidas A × L × C (m)", <>{`${num(p1.altura)} × ${num(p1.largura)} × ${num(p1.comprimento)}`}{provBadge("medidas")}</>)}
              {linha("EAN (SKU)", p?.passo_2_produto_sku?.codigo ?? "—")}
              {linha("DUN de referência", p.referencia_dun ?? "—")}
            </div>
            {p.aviso_corte && <Alert className="border-warning bg-warning/10"><AlertDescription>{p.aviso_corte}</AlertDescription></Alert>}
          </div>
        )}
        {erro && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap break-all">{erro}</AlertDescription></Alert>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!p || p.pode_enviar !== true || enviando || carregando}>
            {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar cadastro no XPM
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
