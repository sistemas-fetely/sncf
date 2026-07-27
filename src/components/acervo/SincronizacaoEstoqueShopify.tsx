import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, ShoppingBag, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Exemplo = {
  sku: string;
  shopify_atual: number;
  sncf_virtual: number;
  diff: number;
};

type DryRunResult = {
  dry_run: true;
  total_mudariam: number;
  reduzir: number;
  aumentar: number;
  exemplos: Exemplo[];
};

type PushResult = {
  dry_run: false;
  empurrados: number;
  erros: unknown[];
  batches: number;
};

export function SincronizacaoEstoqueShopify() {
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [empurrando, setEmpurrando] = useState(false);
  const [pushResumo, setPushResumo] = useState<PushResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function chamar(dry_run: boolean) {
    const { data, error } = await supabase.functions.invoke("sincronizar-estoque-shopify", {
      body: { dry_run },
    });
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    if (d?.error) throw new Error(d.error);
    return d;
  }

  async function handleVerificar() {
    setVerificando(true);
    try {
      const res = (await chamar(true)) as DryRunResult;
      setDryRun(res);
      setPushResumo(null);
      toast.success(`${res.total_mudariam} SKUs mudariam`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Falha ao verificar diferenças: ${msg}`);
    } finally {
      setVerificando(false);
    }
  }

  async function handleConfirmar() {
    setConfirmOpen(false);
    setEmpurrando(true);
    try {
      const res = (await chamar(false)) as PushResult;
      setPushResumo(res);
      const nErros = Array.isArray(res.erros) ? res.erros.length : 0;
      if (nErros > 0) {
        toast.warning(`${res.empurrados} SKUs empurrados · ${nErros} erros`);
      } else {
        toast.success(`${res.empurrados} SKUs empurrados`);
      }
      // Rerun dry-run pra confirmar que zerou
      try {
        const check = (await chamar(true)) as DryRunResult;
        setDryRun(check);
      } catch {
        /* ignore rerun errors */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Falha ao sincronizar: ${msg}`);
    } finally {
      setEmpurrando(false);
    }
  }

  const podeConfirmar = !!dryRun && dryRun.total_mudariam > 0 && !empurrando;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4" />
          Sincronização de Estoque · Shopify
        </CardTitle>
        <CardDescription>
          Compara o estoque virtual do SNCF com o da loja Shopify e empurra os ajustes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleVerificar}
            disabled={verificando || empurrando}
            variant="outline"
            className="gap-2"
          >
            {verificando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Verificar diferenças
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!podeConfirmar}
            className="gap-2"
          >
            {empurrando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingBag className="h-4 w-4" />
            )}
            Confirmar sincronização
          </Button>
        </div>

        {dryRun && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-3">
            <div className="text-sm">
              <span className="font-medium">{dryRun.total_mudariam}</span> SKUs mudariam ·{" "}
              <span className="text-red-700 dark:text-red-300 font-medium">{dryRun.reduzir}</span>{" "}
              reduzem (Shopify vendia a mais) ·{" "}
              <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                {dryRun.aumentar}
              </span>{" "}
              aumentam
            </div>

            {dryRun.exemplos.length > 0 && (
              <div className="rounded-md border bg-background overflow-x-auto">
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 font-medium text-right">Shopify atual</th>
                      <th className="px-3 py-2 font-medium text-right">SNCF virtual</th>
                      <th className="px-3 py-2 font-medium text-right">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRun.exemplos.map((e) => (
                      <tr key={e.sku} className="border-t">
                        <td className="px-3 py-1.5 font-mono">{e.sku}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{e.shopify_atual}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{e.sncf_virtual}</td>
                        <td
                          className={cn(
                            "px-3 py-1.5 text-right tabular-nums font-medium",
                            e.diff < 0 && "text-red-700 dark:text-red-300",
                            e.diff > 0 && "text-emerald-700 dark:text-emerald-300",
                          )}
                        >
                          {e.diff > 0 ? `+${e.diff}` : e.diff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {dryRun.total_mudariam === 0 && (
              <div className="text-xs text-muted-foreground italic">
                Nada a sincronizar — Shopify já está em dia.
              </div>
            )}
          </div>
        )}

        {pushResumo && (
          <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 p-4 space-y-2">
            <div className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              {pushResumo.empurrados} SKUs empurrados em {pushResumo.batches} lote(s)
            </div>
            {Array.isArray(pushResumo.erros) && pushResumo.erros.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 p-2 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {pushResumo.erros.length} erro(s) durante a sincronização
                </div>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-amber-900 dark:text-amber-100">
                  {JSON.stringify(pushResumo.erros, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar sincronização</AlertDialogTitle>
            <AlertDialogDescription>
              Isto altera o estoque da loja Shopify <strong>ao vivo</strong>.{" "}
              {dryRun && (
                <>
                  {dryRun.total_mudariam} SKUs serão ajustados ({dryRun.reduzir} reduzem ·{" "}
                  {dryRun.aumentar} aumentam).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmar}>
              Confirmar e empurrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
