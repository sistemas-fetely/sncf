import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, Loader2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { bodyCorreiosSC, chaveOpcaoVD, opcoesCorreiosSC, ordenarOpcoesVD, podeCotarCorreiosSC, type PlanoCorreiosSC, type PrecoCorreiosSC } from "./correiosScVD";

export interface OpcaoTransportadora {
  transportadora_id: string; nome: string; valor: number; prazo_dias: number | null; elegivel_default?: boolean;
  servico?: "SEDEX" | "PAC"; aviso?: string;
}
export interface CotacaoTransportadora {
  ok: boolean; peso_usado?: number | null; peso_fonte?: string | null;
  opcoes: OpcaoTransportadora[]; recomendada?: OpcaoTransportadora | null; erro?: string | null;
}

/** Cotação de transportadora da Venda Direta (fn_vd_cotar_transportadora), com debounce igual ao frete. */
export function useCotacaoTransportadora(cep: string, itens: { sku: string; quantidade: number }[], valor: number, enabled: boolean, pedidoId?: string) {
  const cepOk = cep.length === 8;
  const itensKey = itens.map((i) => `${i.sku}:${i.quantidade}`).sort().join("|");
  const [chave, setChave] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !cepOk || itens.length === 0) { setChave(null); return; }
    const t = setTimeout(() => setChave(`${cep}#${itensKey}#${valor.toFixed(2)}`), 600);
    return () => clearTimeout(t);
  }, [enabled, cep, cepOk, itensKey, itens.length, valor]);
  const q = useQuery({
    queryKey: ["vd-cotar-transportadora", chave],
    enabled: !!chave,
    queryFn: async (): Promise<CotacaoTransportadora> => {
      const { data, error } = await supabase.rpc("fn_vd_cotar_transportadora", {
        p_cep: cep, p_itens: itens.map((i) => ({ sku: i.sku, quantidade: i.quantidade })), p_valor: valor,
      });
      if (error) throw new Error(rawMessage(error));
      const d = (data ?? {}) as unknown as CotacaoTransportadora;
      return { ...d, opcoes: Array.isArray(d.opcoes) ? d.opcoes : [] };
    },
  });
  const correios = useQuery({
    queryKey: ["vd-cotar-correios-sc", pedidoId], enabled: enabled && !!pedidoId, staleTime: 0, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_correios_plano_volumes" as never,
        { p_pedido_id: pedidoId, p_centro_codigo: "XPM-SC" } as never);
      if (error) throw error;
      const plano = data as unknown as PlanoCorreiosSC | null;
      if (!plano) throw new Error("Plano de volumes indisponível.");
      if (!podeCotarCorreiosSC(plano)) return { opcoes: [], erro: plano.motivo ?? plano.erro ?? "Pedido inelegível." };
      const resposta = await supabase.functions.invoke("correios-cotar", { body: bodyCorreiosSC(plano) });
      if (resposta.error) {
        const contexto = resposta.error.context;
        if (contexto instanceof Response) {
          const corpo = await contexto.clone().json().catch(() => null);
          if (corpo?.erro) throw new Error(corpo.erro);
        }
        throw resposta.error;
      }
      const resultado = resposta.data as { ok?: boolean; erro?: string; cotacoes?: PrecoCorreiosSC[] } | null;
      if (!resultado?.ok) throw new Error(resultado?.erro ?? "Cotação Correios indisponível.");
      return opcoesCorreiosSC(plano, resultado.cotacoes ?? []);
    },
  });
  const cotacao = useMemo(() => {
    const atual = chave ? q.data ?? null : null;
    if (!pedidoId) return atual;
    const opcoes = ordenarOpcoesVD([...(atual?.ok ? atual.opcoes : []), ...(!correios.error ? correios.data?.opcoes ?? [] : [])]);
    return { ...atual, ok: opcoes.length > 0, opcoes, recomendada: atual?.recomendada };
  }, [chave, q.data, pedidoId, correios.data, correios.error]);
  const aguardando = enabled && cepOk && itens.length > 0 && (!chave || q.isFetching);
  const erroAtual = q.error ? rawMessage(q.error) : q.data?.ok === false ? q.data.erro ?? "Cotação indisponível." : null;
  return { cotacao, cotando: aguardando, erro: erroAtual,
    correiosCotando: !!pedidoId && enabled && correios.isFetching,
    correiosErro: pedidoId ? correios.error ? rawMessage(correios.error) : correios.data?.erro ?? null : null };
}

export function CartoesTransportadora({ cotacao, cotando, erro, valor, onChange, cepOk, aviso, correiosCotando, correiosErro }: {
  cotacao: CotacaoTransportadora | null; cotando: boolean; erro: string | null; valor: string | null;
  onChange: (id: string) => void; cepOk: boolean;
  aviso?: string;
  correiosCotando?: boolean; correiosErro?: string | null;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {aviso ?? "Sai da XPM SC: a XPM separa, a NF sai depois do Conferido e o prazo da transportadora conta a partir do embarque."}
      </p>
      {!cepOk ? (
        <p className="text-xs text-muted-foreground">Informe o CEP de entrega para cotar a transportadora.</p>
      ) : cotando ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cotando transportadoras…</p>
      ) : (erro || (cotacao && !cotacao.ok)) && !cotacao?.opcoes.length ? (
        <p className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erro ?? cotacao?.erro ?? "Cotação indisponível."}</p>
      ) : cotacao && cotacao.opcoes.length === 0 ? (
        <p className="text-sm text-destructive">Nenhuma transportadora atende este CEP.</p>
      ) : cotacao ? (
        <div role="radiogroup" aria-label="Transportadora" className="grid gap-2">
          {cotacao.opcoes.map((o) => {
            const chave = chaveOpcaoVD(o);
            const sel = valor === chave;
            return (
              <Button key={chave} variant="outline" type="button" role="radio" aria-checked={sel} onClick={() => onChange(chave)}
                className={cn("h-auto whitespace-normal flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border p-3 text-left text-sm transition-colors",
                  sel ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}>
                <span className="flex min-w-0 items-center gap-2 font-medium"><Truck className="h-4 w-4" />{o.nome}
                  {!o.servico && cotacao.recomendada?.transportadora_id === o.transportadora_id && <span className="text-xs font-normal text-muted-foreground">· recomendada</span>}
                </span>
                <span className="tabular-nums">{formatBRL(Number(o.valor ?? 0))}{o.prazo_dias != null && <span className="text-muted-foreground"> · {o.prazo_dias} dias</span>}</span>
                {o.aviso && <span className="w-full text-xs font-normal text-warning-strong">{o.aviso}</span>}
              </Button>
            );
          })}
        </div>
      ) : null}
      {erro && !!cotacao?.opcoes.length && <p className="text-sm text-destructive">{erro}</p>}
      {correiosCotando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cotando Correios…</p>}
      {correiosErro && <div role="radio" aria-checked={false} aria-disabled="true" className="rounded-md border p-3 text-sm text-destructive">Correios — {correiosErro}</div>}
    </div>
  );
}
