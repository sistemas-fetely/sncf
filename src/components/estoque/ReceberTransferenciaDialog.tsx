import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { formatError } from "@/lib/format-error";
import { hojeISO } from "@/lib/data";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CENTRO_XPM = "XPM-SC";

interface ItemEnviado {
  sku: string;
  enviado: number;
  cod: string | null;
  nome: string | null;
}
interface Divergencia { sku: string; enviado: number; recebido: number; avariado: number; diferenca: number }
interface Resultado {
  ok?: boolean;
  itens?: number;
  divergencias?: Divergencia[];
  contagens_iniciais?: number;
  erro?: string;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  pedidoId: string;
  titulo: string;
  destinoCodigo: string | null;
  onRecebido: () => void;
}

export function ReceberTransferenciaDialog({ aberto, onFechar, pedidoId, titulo, destinoCodigo, onRecebido }: Props) {
  const [data, setData] = useState(hojeISO());
  const [centro, setCentro] = useState("SITE-SP");
  const [recebido, setRecebido] = useState<Record<string, string>>({});
  const [avariado, setAvariado] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const itensQ = useQuery({
    queryKey: ["receber-trs-itens", pedidoId],
    enabled: aberto && !!pedidoId,
    queryFn: async (): Promise<ItemEnviado[]> => {
      const { data: it, error } = await (supabase as any)
        .from("pedido_itens").select("sku, quantidade").eq("pedido_id", pedidoId);
      if (error) throw error;
      const soma = new Map<string, number>();
      ((it ?? []) as { sku: string; quantidade: number }[]).forEach((i) =>
        soma.set(i.sku, (soma.get(i.sku) ?? 0) + Number(i.quantidade ?? 0)));
      const skus = [...soma.keys()];
      let prods: { sku: string; cod_cadastro: string | null; nome_comercial: string | null }[] = [];
      if (skus.length) {
        const { data: p, error: e2 } = await (supabase as any)
          .from("sncf_produtos").select("sku, cod_cadastro, nome_comercial").in("sku", skus);
        if (e2) throw e2;
        prods = p ?? [];
      }
      const mapa = new Map(prods.map((p) => [p.sku, p]));
      return skus.map((sku) => ({
        sku,
        enviado: soma.get(sku) ?? 0,
        cod: mapa.get(sku)?.cod_cadastro ?? null,
        nome: mapa.get(sku)?.nome_comercial ?? null,
      }));
    },
  });

  const centrosQ = useQuery({
    queryKey: ["receber-trs-centros"],
    enabled: aberto && !destinoCodigo,
    queryFn: async () => {
      const { data: c, error } = await (supabase as any)
        .from("centro_distribuicao").select("codigo,nome,rotulo_curto")
        .eq("ativo", true).neq("codigo", CENTRO_XPM).order("codigo");
      if (error) throw error;
      return (c ?? []) as { codigo: string; nome: string | null; rotulo_curto: string | null }[];
    },
  });

  useEffect(() => {
    if (itensQ.isError) toast.error(formatError(itensQ.error));
  }, [itensQ.isError, itensQ.error]);
  useEffect(() => {
    if (centrosQ.isError) toast.error(formatError(centrosQ.error));
  }, [centrosQ.isError, centrosQ.error]);

  const itens = itensQ.data ?? [];

  // Reinicia ao abrir / ao chegar os itens.
  useEffect(() => {
    if (!aberto) return;
    setResultado(null);
    setData(hojeISO());
  }, [aberto, pedidoId]);
  useEffect(() => {
    if (!aberto) return;
    tudoConforme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, itensQ.data]);

  function tudoConforme() {
    const r: Record<string, string> = {};
    const a: Record<string, string> = {};
    (itensQ.data ?? []).forEach((i) => { r[i.sku] = String(i.enviado); a[i.sku] = "0"; });
    setRecebido(r);
    setAvariado(a);
  }

  const num = (v: string | undefined) => (v === undefined || v === "" || isNaN(Number(v)) ? 0 : Number(v));

  const alterados = useMemo(
    () => itens.filter((i) => num(recebido[i.sku]) !== i.enviado || num(avariado[i.sku]) > 0),
    [itens, recebido, avariado],
  );

  const receber = useMutation({
    mutationFn: async () => {
      const { data: r, error } = await (supabase as any).rpc("fn_trs_receber_destino", {
        p_pedido_id: pedidoId,
        p_data: data,
        p_itens: alterados.map((i) => ({ sku: i.sku, recebido: num(recebido[i.sku]), avariado: num(avariado[i.sku]) })),
        p_centro_destino: destinoCodigo ? null : centro,
      });
      if (error) throw error;
      const res = (r ?? {}) as Resultado;
      if (res.ok === false) throw new Error(res.erro ?? "O recebimento não foi registrado.");
      return res;
    },
    onSuccess: (res) => {
      setResultado(res);
      toast.success("Recebimento registrado.");
      onRecebido();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const invalido = itens.some((i) => num(recebido[i.sku]) < 0 || num(avariado[i.sku]) < 0);
  const futuro = data > hojeISO() || !data;
  const semDestino = !destinoCodigo && !centro;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Receber no destino — {titulo}</DialogTitle>
          <DialogDescription>
            Confirme o que chegou na loja. O saldo contábil já foi movido pela nota de transferência — aqui fica a conferência física e a diferença.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {resultado.itens ?? 0} itens conferidos · {(resultado.divergencias ?? []).length} com diferença · {resultado.contagens_iniciais ?? 0} contagens iniciais
            </p>
            {(resultado.divergencias ?? []).length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cód.</TableHead>
                      <TableHead className="text-right">Enviado</TableHead>
                      <TableHead className="text-right">Recebido</TableHead>
                      <TableHead className="text-right">Avariado</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(resultado.divergencias ?? []).map((d) => (
                      <TableRow key={d.sku}>
                        <TableCell className="font-mono text-xs">{d.sku}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.enviado}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.recebido}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.avariado}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">{d.diferenca}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <DialogFooter>
              <Button onClick={onFechar}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {!destinoCodigo && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Centro de destino</label>
                  <Select value={centro} onValueChange={setCentro}>
                    <SelectTrigger><SelectValue placeholder="Selecione o centro" /></SelectTrigger>
                    <SelectContent>
                      {(centrosQ.data ?? []).map((c) => (
                        <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo_curto ?? c.nome ?? c.codigo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium">Data de recebimento</label>
                <Input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>

            {itensQ.isLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : itensQ.isError ? (
              <p className="text-sm text-destructive">Falha ao carregar itens: {formatError(itensQ.error)}</p>
            ) : (
              <div className="max-h-[360px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Cód.</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Enviado</TableHead>
                      <TableHead className="w-28 text-right">Recebido</TableHead>
                      <TableHead className="w-28 text-right">Avariado</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((i) => {
                      const dif = num(recebido[i.sku]) + num(avariado[i.sku]) - i.enviado;
                      return (
                        <TableRow key={i.sku}>
                          <TableCell className="font-mono text-xs">{i.cod ?? i.sku}</TableCell>
                          <TableCell className="text-sm">{i.nome ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{i.enviado}</TableCell>
                          <TableCell className="text-right">
                            <Input type="number" min={0} className="h-8 w-24 text-right tabular-nums"
                              aria-label={`Recebido de ${i.sku}`}
                              value={recebido[i.sku] ?? ""}
                              onChange={(e) => setRecebido((s) => ({ ...s, [i.sku]: e.target.value }))} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input type="number" min={0} className="h-8 w-24 text-right tabular-nums"
                              aria-label={`Avariado de ${i.sku}`}
                              value={avariado[i.sku] ?? ""}
                              onChange={(e) => setAvariado((s) => ({ ...s, [i.sku]: e.target.value }))} />
                          </TableCell>
                          <TableCell className={cn("text-right tabular-nums font-medium", dif === 0 ? "text-success" : "text-destructive")}>
                            {dif}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={tudoConforme}>Tudo conforme</Button>
              <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
              <BotaoGuardado
                slug="acao.estoque_contagem_registrar"
                rotuloAcao="Confirmar recebimento"
                contexto={{ pedido_id: pedidoId }}
                disabled={receber.isPending || itens.length === 0 || invalido || futuro || semDestino}
                onClick={() => receber.mutate()}
              >
                {receber.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar recebimento
              </BotaoGuardado>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ReceberTransferenciaDialog;
