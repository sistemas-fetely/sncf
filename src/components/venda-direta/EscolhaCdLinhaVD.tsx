import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmaCdDivergente } from "@/components/vendas/EscolhaCdB2c";
import { rawMessage } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { CartoesTransportadora, useCotacaoTransportadora } from "./CotacaoTransportadoraVD";
import { argsEscolhaCdVD, podeConfirmarCdVD } from "./escolherCdVD";
import { chaveOpcaoVD } from "./correiosScVD";
import { invalidarVendaDireta, QK_VD_GAVETA } from "./queryKeys";
import type { LinhaGaveta } from "./GavetaPedidoVD";

interface SaldoCD { itens: number; sem_saldo: number; skus: string[] }
interface Sugestao { cd_sugerido_efetivo: string | null; motivo_troca: string | null; saldo_por_cd: Record<string, SaldoCD> }
interface Item { id: string; sku: string; descricao: string | null; quantidade: number; valor_unitario: number | null; subtotal: number | null }
interface Resultado { ok: boolean; erro?: string; id_externo?: string; vai_para_xpm?: boolean }
const nomeCd = (codigo: string | null) => codigo === "SITE-SP" ? "SP" : codigo === "XPM-SC" ? "SC" : codigo ?? "—";

export function EscolhaCdLinhaVD({ pedido, podeEditar }: { pedido: LinhaGaveta; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [scAberto, setScAberto] = useState(false);
  const [spDivergente, setSpDivergente] = useState(false);
  const [transportadora, setTransportadora] = useState<string | null>(null);
  const sugestao = useQuery({
    queryKey: [...QK_VD_GAVETA, "sugestao-cd", pedido.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_vd_sugestao_cd" as never)
        .select("cd_sugerido_efetivo,motivo_troca,saldo_por_cd").eq("pedido_id", pedido.id).maybeSingle();
      if (error) throw error;
      return data as unknown as Sugestao | null;
    },
  });
  const itensQ = useQuery({
    queryKey: [...QK_VD_GAVETA, "itens", pedido.id], enabled: scAberto,
    queryFn: async () => {
      const { data, error } = await supabase.from("pedido_itens" as never)
        .select("id, sku, descricao, quantidade, valor_unitario, subtotal").eq("pedido_id", pedido.id).order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
  });
  const cep = String(pedido.endereco_entrega?.cep ?? "").replace(/\D/g, "");
  const cot = useCotacaoTransportadora(cep, itensQ.data ?? [], Number(pedido.valor_liquido ?? 0), scAberto, pedido.id);
  const selecionada = cot.cotacao?.opcoes.find((o) => chaveOpcaoVD(o) === transportadora);
  useEffect(() => {
    if (scAberto) setTransportadora((atual) => cot.cotacao?.opcoes.some((o) => chaveOpcaoVD(o) === atual)
      ? atual : cot.cotacao?.recomendada?.transportadora_id ?? null);
  }, [cot.cotacao, scAberto]);
  const confirmar = useMutation({
    mutationFn: async (cd: "SITE-SP" | "XPM-SC") => {
      const { data, error } = await supabase.rpc("fn_vd_escolher_cd" as never,
        argsEscolhaCdVD(pedido.id, cd, "", cd === "XPM-SC" ? selecionada?.transportadora_id ?? null : null, selecionada) as never);
      if (error) throw error;
      const r = data as unknown as Resultado | null;
      if (!r?.ok) throw new Error(r?.erro ?? "Não foi possível confirmar o CD.");
      return r;
    },
    onSuccess: async (r) => {
      toast.success(`${r.id_externo ?? pedido.id_externo} sai ${r.vai_para_xpm ? "da XPM SC — na fila da XPM" : "do Site SP — descendo ao Bling"}`);
      setScAberto(false);
      setSpDivergente(false);
      await Promise.all([invalidarVendaDireta(qc), invalidarPedido(qc, pedido.id)]);
    },
    onError: (error) => toast.error(rawMessage(error)),
  });
  const sugerido = sugestao.data?.cd_sugerido_efetivo ?? null;
  const avisoSaldo = (codigo: string) => {
    const faltam = sugestao.data?.saldo_por_cd?.[codigo]?.sem_saldo;
    return faltam != null && faltam > 0 ? `Falta ${faltam} item(ns) em ${nomeCd(codigo)}.` : null;
  };
  const cotacaoOk = itensQ.isSuccess && !itensQ.isFetching && !cot.cotando && !!cot.cotacao?.ok && !!selecionada
    && !(selecionada.servico && cot.correiosCotando);
  const habilitadoSC = !!sugestao.data && podeConfirmarCdVD("XPM-SC", transportadora, podeEditar, cotacaoOk) && !confirmar.isPending;

  return <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
    {sugestao.isLoading ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Carregando CDs…</p>
      : sugestao.isError ? <p className="text-xs text-destructive">{rawMessage(sugestao.error)}</p>
      : !sugestao.data ? <p className="text-xs text-muted-foreground">Sugestão de CD indisponível para este pedido.</p>
      : <>
        <p className="text-xs text-muted-foreground">Sugerido: {nomeCd(sugerido)}</p>
        {sugestao.data.motivo_troca && <p className="text-[11px] text-warning">{sugestao.data.motivo_troca}</p>}
        <div className="flex gap-2">
          {(["SITE-SP", "XPM-SC"] as const).map((codigo) => {
            const saldo = sugestao.data.saldo_por_cd?.[codigo];
            return <div key={codigo} className="space-y-1">
              <Button size="sm" variant={sugerido === codigo ? "default" : "outline"} className="h-7 min-w-14 px-3 text-xs"
                aria-label={`Escolher ${nomeCd(codigo)}`} disabled={!podeEditar || confirmar.isPending}
                onClick={() => {
                  if (codigo === "XPM-SC") setScAberto(true);
                  else if (sugerido === codigo) confirmar.mutate(codigo);
                  else setSpDivergente(true);
                }}>
                {confirmar.isPending && confirmar.variables === codigo && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{nomeCd(codigo)}
              </Button>
              <p className={`text-[11px] ${saldo ? saldo.sem_saldo > 0 ? "text-warning-strong" : "text-success-strong" : "text-muted-foreground"}`}>
                {saldo ? saldo.sem_saldo > 0 ? `falta ${saldo.sem_saldo} item(ns)` : "cobre tudo" : "Saldo indisponível"}
              </p>
            </div>;
          })}
        </div>
      </>}
    <ConfirmaCdDivergente open={spDivergente} onOpenChange={setSpDivergente} sugeridoNome={nomeCd(sugerido)} escolhidoNome="SP"
      avisoSemSaldo={avisoSaldo("SITE-SP")} onConfirmar={() => { if (!confirmar.isPending && podeEditar) confirmar.mutate("SITE-SP"); }} />
    <Dialog open={scAberto} onOpenChange={(open) => { if (!confirmar.isPending) setScAberto(open); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sair da XPM SC — {pedido.id_externo}</DialogTitle>
          <DialogDescription>Transportadora de saída do pedido</DialogDescription>
        </DialogHeader>
        {sugerido !== "XPM-SC" && <div className="space-y-1 text-xs">
          <p className="text-muted-foreground">Sugerido: {nomeCd(sugerido)}</p>
          {avisoSaldo("XPM-SC") && <p className="text-warning-strong">{avisoSaldo("XPM-SC")}</p>}
        </div>}
        {itensQ.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando itens…</p>
          : itensQ.isError ? <p className="text-sm text-destructive">{rawMessage(itensQ.error)}</p>
          : <fieldset disabled={confirmar.isPending}>
            <CartoesTransportadora {...cot} valor={transportadora} onChange={setTransportadora} cepOk={cep.length === 8}
              aviso="Frete já cobrado do cliente como Site SP; a diferença fica com a Fetely (CD pela operação)" />
          </fieldset>}
        <DialogFooter>
          <Button variant="outline" disabled={confirmar.isPending} onClick={() => setScAberto(false)}>Voltar</Button>
          <Button disabled={!habilitadoSC} onClick={() => confirmar.mutate("XPM-SC")}>
            {confirmar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar SC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}