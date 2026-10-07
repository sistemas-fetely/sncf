import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { invalidarCompras } from "@/lib/compras/invalidar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const fmt = (v: unknown) => (v == null ? "—" : NUM.format(Number(v)));

export default function DeclararForaControleDialog({
  pedidoId,
  aberto,
  onFechar,
}: {
  pedidoId: number;
  aberto: boolean;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [local, setLocal] = useState("");
  const [obs, setObs] = useState("");
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [previa, setPrevia] = useState<Obj | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) {
      setLocal(""); setObs(""); setQtds({}); setPrevia(null); setErro(null);
    }
  }, [aberto]);

  const skusQ = useQuery({
    queryKey: ["compra-tres-camadas-fora-controle", pedidoId],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_compra_tres_camadas")
        .select("sku, a_confirmar")
        .eq("pedido_id", pedidoId)
        .gt("a_confirmar", 0)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as { sku: string; a_confirmar: number }[];
    },
  });

  const itens = Object.entries(qtds)
    .filter(([, v]) => v.trim() !== "" && Number(v.replace(",", ".")) > 0)
    .map(([sku, v]) => ({ sku, qtd: Number(v.replace(",", ".")) }));

  const mudou = (fn: () => void) => { fn(); setPrevia(null); setErro(null); };

  const chamar = async (dry: boolean) => {
    const { data, error } = await (supabase as any).rpc("fn_declarar_recebimento_fora_controle", {
      p_pedido_id: pedidoId,
      p_itens: itens,
      p_local: local.trim(),
      p_observacao: obs.trim() || null,
      p_dry_run: dry,
    });
    if (error) throw error;
    return data as Obj;
  };

  const preVisualizar = async () => {
    setCarregando(true); setErro(null);
    try {
      setPrevia(await chamar(true));
    } catch (e) {
      const m = rawMessage(e); setErro(m); toast.error(m);
    } finally { setCarregando(false); }
  };

  const confirmar = async () => {
    setEnviando(true); setErro(null);
    try {
      const r = await chamar(false);
      toast.success(`Declaração registrada — ${fmt(r?.itens_declarados)} item(ns) fora de controle`);
      invalidarCompras(qc);
      for (const k of [
        "compra-tres-camadas-pedido", "compra-tres-camadas-sku",
        "compra-tres-camadas-pedido-cabecalho", "compra-tres-camadas-fora-controle",
      ]) void qc.invalidateQueries({ queryKey: [k, pedidoId] });
      onFechar();
    } catch (e) {
      const m = rawMessage(e); setErro(m); toast.error(m);
    } finally { setEnviando(false); }
  };

  const linhas = skusQ.data ?? [];
  const excede = linhas.some((l) => Number((qtds[l.sku] ?? "").replace(",", ".")) > Number(l.a_confirmar));
  const podePrevia = local.trim().length > 0 && itens.length > 0 && !excede && !carregando;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !enviando && onFechar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Declarar recebimento fora de controle</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fc-local">Local *</Label>
            <Input id="fc-local" value={local} placeholder="ex.: SP — depósito terceiro"
              onChange={(e) => mudou(() => setLocal(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fc-obs">Observação</Label>
            <Textarea id="fc-obs" rows={2} value={obs} onChange={(e) => mudou(() => setObs(e.target.value))} />
          </div>

          {skusQ.isError ? (
            <p className="text-sm text-destructive">{rawMessage(skusQ.error)}</p>
          ) : skusQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum SKU com saldo a confirmar.</p>
          ) : (
            <div className="max-h-64 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">A confirmar</TableHead>
                    <TableHead className="w-32 text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.sku}>
                      <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                      <TableCell className="text-right">{fmt(l.a_confirmar)}</TableCell>
                      <TableCell>
                        <Input type="number" min={0} max={Number(l.a_confirmar)} step="any"
                          className="h-8 text-right" value={qtds[l.sku] ?? ""}
                          aria-label={`Quantidade ${l.sku}`}
                          onChange={(e) => mudou(() => setQtds((p) => ({ ...p, [l.sku]: e.target.value })))} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {previa && (
            <div className="space-y-3">
              {previa.aviso && (
                <Alert className="border-warning/50 bg-warning/10">
                  <AlertDescription className="font-medium text-warning">{String(previa.aviso)}</AlertDescription>
                </Alert>
              )}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">A confirmar antes</TableHead>
                      <TableHead className="text-right">A confirmar depois</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((previa.itens ?? []) as Obj[]).map((i) => (
                      <TableRow key={i.sku}>
                        <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                        <TableCell className="text-right">{fmt(i.qtd)}</TableCell>
                        <TableCell className="text-right">{fmt(i.a_confirmar_antes)}</TableCell>
                        <TableCell className="text-right">{fmt(i.a_confirmar_depois)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {erro && (
            <Alert variant="destructive">
              <AlertDescription className="whitespace-pre-wrap">{erro}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>Cancelar</Button>
          {!previa ? (
            <Button onClick={() => void preVisualizar()} disabled={!podePrevia}>
              {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Pré-visualizar
            </Button>
          ) : (
            <Button onClick={() => void confirmar()} disabled={enviando}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar declaração
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
