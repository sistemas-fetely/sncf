import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CodProduto } from "@/components/produto/CodProduto";
import { rawMessage } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { cn } from "@/lib/utils";
import { CartoesTransportadora, useCotacaoTransportadora } from "./CotacaoTransportadoraVD";
import { argsEscolhaCdVD, podeConfirmarCdVD, podeDesfazerCdVD } from "./escolherCdVD";
import { invalidarVendaDireta, QK_VD_GAVETA } from "./queryKeys";
import type { LinhaGaveta } from "./GavetaPedidoVD";

interface SaldoCD { itens: number; sem_saldo: number; skus: string[] }
interface Sugestao { cd_sugerido_efetivo: string | null; motivo_troca: string | null; saldo_por_cd: Record<string, SaldoCD> }
interface Resultado { ok: boolean; erro?: string; id_externo?: string; vai_para_xpm?: boolean }

export function EscolherCdVD({ pedido, etapa, podeEditar, itens, itensProntos }: {
  pedido: LinhaGaveta; etapa: string | null; podeEditar: boolean;
  itens: { sku: string; quantidade: number }[]; itensProntos: boolean;
}) {
  const qc = useQueryClient();
  const [cd, setCd] = useState("");
  const [transportadora, setTransportadora] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const escolher = etapa === "escolher_cd";
  const sugestao = useQuery({
    queryKey: [...QK_VD_GAVETA, "sugestao-cd", pedido.id], enabled: escolher,
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_vd_sugestao_cd" as never).select("cd_sugerido_efetivo,motivo_troca,saldo_por_cd").eq("pedido_id", pedido.id).maybeSingle();
      if (error) throw error;
      return data as unknown as Sugestao | null;
    },
  });
  useEffect(() => { if (sugestao.data) setCd((atual) => atual || sugestao.data?.cd_sugerido_efetivo || ""); }, [sugestao.data]);
  const cep = String(pedido.endereco_entrega?.cep ?? "").replace(/\D/g, "");
  const cot = useCotacaoTransportadora(cep, itens, Number(pedido.valor_liquido ?? 0), escolher && cd === "XPM-SC" && itensProntos);
  useEffect(() => {
    setTransportadora(cot.cotacao?.recomendada?.transportadora_id ?? null);
  }, [cot.cotacao]);
  const confirmar = useMutation({
    mutationFn: async (desfazer: boolean) => {
      const { data, error } = desfazer
        ? await supabase.rpc("fn_vd_desfazer_escolha_cd" as never, { p_pedido_id: pedido.id } as never)
        : await supabase.rpc("fn_vd_escolher_cd" as never, argsEscolhaCdVD(pedido.id, cd, motivo, transportadora) as never);
      if (error) throw error;
      const r = data as unknown as Resultado | null;
      if (r?.ok === false || (!desfazer && !r?.ok)) throw new Error(r?.erro ?? "Não foi possível confirmar o CD.");
      return r;
    },
    onSuccess: async (r, desfazer) => {
      toast.success(desfazer ? "Escolha de CD desfeita" : `${r?.id_externo ?? pedido.id_externo} sai ${r?.vai_para_xpm ? "da XPM SC — na fila da XPM" : "do Site SP — descendo ao Bling"}`);
      await Promise.all([invalidarVendaDireta(qc), invalidarPedido(qc, pedido.id)]);
    },
    onError: (e) => toast.error(rawMessage(e)),
  });
  if (!escolher) return podeEditar && podeDesfazerCdVD(etapa, pedido.fila_status, pedido.bling_pedido_numero)
    ? <Button variant="ghost" size="sm" disabled={confirmar.isPending} onClick={() => confirmar.mutate(true)}><RotateCcw className="mr-2 h-4 w-4" />Desfazer escolha de CD</Button> : null;
  const cotacaoOk = !cot.cotando && !cot.erro && !!cot.cotacao?.ok && !!cot.cotacao.opcoes.some((o) => o.transportadora_id === transportadora);
  const habilitado = !!sugestao.data && itensProntos && podeConfirmarCdVD(cd, transportadora, podeEditar, cotacaoOk) && !confirmar.isPending;
  return <section className="space-y-3" aria-label="De onde sai?">
    <h3 className="text-sm font-medium">De onde sai?</h3>
    {sugestao.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando saldo dos CDs…</p>
      : sugestao.isError ? <div className="space-y-2"><p className="text-sm text-destructive">{rawMessage(sugestao.error)}</p><Button variant="outline" size="sm" onClick={() => void sugestao.refetch()}>Tentar novamente</Button></div>
      : !sugestao.data ? <p className="text-sm text-muted-foreground">Sugestão de CD indisponível para este pedido.</p>
      : <>
        <div role="radiogroup" aria-label="Centro de saída" className="grid gap-2 sm:grid-cols-2">
          {[{ codigo: "SITE-SP", nome: "Site SP" }, { codigo: "XPM-SC", nome: "XPM SC" }].map((opcao) => {
            const saldo = sugestao.data.saldo_por_cd?.[opcao.codigo];
            return <Button key={opcao.codigo} variant="outline" role="radio" aria-checked={cd === opcao.codigo} disabled={!podeEditar || confirmar.isPending}
              onClick={() => { setCd(opcao.codigo); setTransportadora(null); }}
              className={cn("h-auto min-w-0 flex-col items-start gap-2 whitespace-normal p-3 text-left", cd === opcao.codigo && "border-primary bg-primary/5 ring-1 ring-primary")}>
              <span className="flex items-center gap-2"><Truck className="h-4 w-4" />{opcao.nome}</span>
              {saldo ? <span className={cn("text-xs font-normal", saldo.sem_saldo > 0 ? "text-warning-strong" : "text-success-strong")}>
                {saldo.sem_saldo > 0 ? <>sem saldo de {saldo.sem_saldo} item(ns): <span className="break-all">{saldo.skus?.map((sku, i) => <span key={sku}>{i > 0 && ", "}<CodProduto chave={sku} variant="compacto" /></span>)}</span></> : `cobre todos os ${saldo.itens} itens`}
              </span> : <span className="text-xs text-muted-foreground">Saldo indisponível</span>}
            </Button>;
          })}
        </div>
        {sugestao.data.motivo_troca && <p className="text-xs text-muted-foreground">{sugestao.data.motivo_troca}</p>}
        {cd === "XPM-SC" && <fieldset disabled={!podeEditar || confirmar.isPending}><CartoesTransportadora {...cot} valor={transportadora} onChange={setTransportadora} cepOk={cep.length === 8}
          aviso="Frete já cobrado do cliente como Site SP; a diferença fica com a Fetely (CD pela operação)" /></fieldset>}
        <div className="space-y-1"><Label htmlFor="vd-escolha-cd-motivo">Motivo (opcional)</Label><Textarea id="vd-escolha-cd-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={!podeEditar || confirmar.isPending} /></div>
        <Button disabled={!habilitado} onClick={() => confirmar.mutate(false)}>{confirmar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar CD</Button>
      </>}
  </section>;
}