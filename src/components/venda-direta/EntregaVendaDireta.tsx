import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Store, Truck, Zap, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { cn } from "@/lib/utils";

export type ModalVd = "retirada" | "sedex" | "pac" | "frete_fetely";

export interface OpcaoFreteVd {
  modal: ModalVd;
  rotulo: string;
  disponivel: boolean;
  /** Preço cotado/tabela antes da regra de grátis (para o riscado). */
  preco_base: number | null;
  /** Valor que o cliente paga (0 quando grátis). */
  cobrado: number | null;
  gratis: boolean;
  prazo_dias: number | null;
  faixa: string | null;
  motivo: string | null;
}

interface ItemCot { sku: string; quantidade: number }

interface CotacaoCorreios {
  cotacao_id: string;
  valida_ate: string;
  peso_incompleto?: boolean;
  cotacoes: { codigo: string; servico: string; preco: number | null; prazo_dias: number | null; erro: string | null }[];
}
interface CotacaoTabela {
  ok: boolean;
  erro?: string;
  peso_incompleto?: boolean;
  opcoes: { modalidade: "correios_sedex" | "frete_fetely"; rotulo: string; disponivel: boolean; preco: number | null; faixa: string | null; motivo: string | null }[];
}

const COD_SEDEX = "03220";
const COD_PAC = "03298";
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cotação de frete da Venda Direta: Correios ao vivo (edge correios-cotar, modo registrar)
 * + tabela SNCF (vd_cotar_frete: Frete Fetely e plano B do SEDEX), em paralelo.
 * O servidor recalcula o frete no criar_pedido_venda_direta — aqui é só a leitura para a tela.
 */
export function useFreteVendaDireta(cep: string, itens: ItemCot[]) {
  const cepOk = cep.length === 8;
  const itensKey = itens.map((i) => `${i.sku}:${i.quantidade}`).sort().join("|");
  const [chave, setChave] = useState<string | null>(null);

  // Debounce: só cota depois que CEP/itens param de mudar.
  useEffect(() => {
    if (!cepOk || itens.length === 0) { setChave(null); return; }
    const t = setTimeout(() => setChave(`${cep}#${itensKey}`), 600);
    return () => clearTimeout(t);
  }, [cep, cepOk, itensKey, itens.length]);

  const itensAtuais = useMemo(() => itens.map((i) => ({ sku: i.sku, quantidade: i.quantidade })), [itensKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const paramQ = useQuery({
    queryKey: ["frete-vd-parametro"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("frete_vd_parametro").select("acrescimo_pct, acrescimo_rs, gratis_no_mais_barato").eq("id", 1).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("frete_vd_parametro sem linha id=1");
      return data as { acrescimo_pct: number; acrescimo_rs: number; gratis_no_mais_barato: boolean };
    },
  });

  const origemQ = useQuery({
    queryKey: ["centro-cep", "SITE-SP"],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao").select("cep").eq("codigo", "SITE-SP").maybeSingle();
      if (error) throw error;
      const c = String(data?.cep ?? "").replace(/\D/g, "");
      if (c.length !== 8) throw new Error("CEP do Site SP não cadastrado em centro_distribuicao");
      return c;
    },
  });

  const correiosQ = useQuery({
    queryKey: ["vd-cotacao-correios", chave],
    enabled: !!chave && !!origemQ.data,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<CotacaoCorreios> => {
      const { data, error } = await supabase.functions.invoke("correios-cotar", {
        body: { cep_origem: origemQ.data, cep_destino: cep, itens: itensAtuais, registrar: true, contexto: "venda_direta" },
      });
      if (error || data?.ok !== true) {
        let msg = data?.erro as string | undefined;
        if (!msg && error && (error as any).context?.json) {
          try { msg = (await (error as any).context.json())?.erro; } catch { /* corpo não-JSON */ }
        }
        throw new Error(msg ?? error?.message ?? "Falha na cotação dos Correios");
      }
      if (!data.cotacao_id) throw new Error("Cotação dos Correios sem cotacao_id");
      return data as CotacaoCorreios;
    },
  });

  const tabelaQ = useQuery({
    queryKey: ["vd-cotacao-tabela", chave],
    enabled: !!chave,
    staleTime: Infinity,
    queryFn: async (): Promise<CotacaoTabela> => {
      const { data, error } = await (supabase as any).rpc("vd_cotar_frete", { p_cep: cep, p_itens: itensAtuais });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro ?? "vd_cotar_frete não devolveu ok");
      return data as CotacaoTabela;
    },
  });

  // Cotação vencida → recota sozinha.
  const validaAte = correiosQ.data?.valida_ate;
  useEffect(() => {
    if (!validaAte) return;
    const ms = new Date(validaAte).getTime() - Date.now();
    const t = setTimeout(() => { void correiosQ.refetch(); }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [validaAte]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Garante uma cotação dentro da validade antes de criar o pedido. */
  const cotacaoIdValida = useCallback(async (): Promise<string | null> => {
    const d = correiosQ.data;
    if (d && new Date(d.valida_ate).getTime() > Date.now() + 5_000) return d.cotacao_id;
    if (!chave) return null;
    const r = await correiosQ.refetch();
    if (r.error) throw r.error;
    return r.data?.cotacao_id ?? null;
  }, [correiosQ, chave]);

  const opcoes = useMemo((): OpcaoFreteVd[] => {
    const p = paramQ.data;
    const tab = tabelaQ.data?.opcoes ?? [];
    const tSedex = tab.find((o) => o.modalidade === "correios_sedex");
    const tFetely = tab.find((o) => o.modalidade === "frete_fetely");
    const cot = correiosQ.data?.cotacoes ?? [];
    const cS = cot.find((c) => c.codigo === COD_SEDEX);
    const cP = cot.find((c) => c.codigo === COD_PAC);
    const apiOk = !!correiosQ.data;

    const precos = [cS?.preco, cP?.preco].filter((x): x is number => x != null);
    const maisBarato = precos.length ? Math.min(...precos) : null;
    const comAcrescimo = (v: number) => round2(v * (1 + Number(p?.acrescimo_pct ?? 0) / 100) + Number(p?.acrescimo_rs ?? 0));
    const correios = (modal: "sedex" | "pac", c: typeof cS, rotulo: string): OpcaoFreteVd => {
      if (apiOk && c?.preco != null) {
        const gratis = !!p?.gratis_no_mais_barato && c.preco === maisBarato;
        return { modal, rotulo, disponivel: true, preco_base: c.preco, cobrado: gratis ? 0 : comAcrescimo(c.preco), gratis, prazo_dias: c.prazo_dias, faixa: null, motivo: null };
      }
      if (modal === "sedex" && tSedex?.disponivel && tSedex.preco != null) {
        return { modal, rotulo, disponivel: true, preco_base: Number(tSedex.preco), cobrado: Number(tSedex.preco), gratis: false, prazo_dias: null, faixa: tSedex.faixa, motivo: "Preço de tabela (plano B)" };
      }
      const motivo = modal === "pac"
        ? (apiOk ? (c?.erro ?? "PAC sem preço na cotação") : "PAC indisponível sem cotação")
        : (apiOk ? (c?.erro ?? tSedex?.motivo ?? "SEDEX sem preço") : (tSedex?.motivo ?? "SEDEX sem cotação nem tabela"));
      return { modal, rotulo, disponivel: false, preco_base: null, cobrado: null, gratis: false, prazo_dias: null, faixa: null, motivo };
    };

    return [
      { modal: "retirada", rotulo: "Retirada no Site SP", disponivel: true, preco_base: 0, cobrado: 0, gratis: true, prazo_dias: null, faixa: null, motivo: null },
      correios("sedex", cS, "Correios SEDEX"),
      correios("pac", cP, "Correios PAC"),
      tFetely?.disponivel && tFetely.preco != null
        ? { modal: "frete_fetely", rotulo: "Frete Fetely", disponivel: true, preco_base: Number(tFetely.preco), cobrado: Number(tFetely.preco), gratis: false, prazo_dias: null, faixa: tFetely.faixa, motivo: null }
        : { modal: "frete_fetely", rotulo: "Frete Fetely", disponivel: false, preco_base: null, cobrado: null, gratis: false, prazo_dias: null, faixa: null, motivo: tFetely?.motivo ?? (chave ? "Sem tabela para este CEP" : "Informe CEP e itens") },
    ];
  }, [paramQ.data, tabelaQ.data, correiosQ.data, chave]);

  return {
    opcoes,
    cotando: !!chave && (correiosQ.isFetching || tabelaQ.isFetching),
    aguardandoDados: !chave,
    correiosErro: correiosQ.error as Error | null,
    tabelaErro: tabelaQ.error as Error | null,
    paramErro: (paramQ.error ?? origemQ.error) as Error | null,
    pesoIncompleto: !!(correiosQ.data?.peso_incompleto || tabelaQ.data?.peso_incompleto),
    cotacaoIdValida,
  };
}

const ICONE: Record<ModalVd, typeof Truck> = { retirada: Store, sedex: Zap, pac: Package, frete_fetely: Truck };

export function CartoesEntrega({
  opcoes, valor, onChange, cotando,
}: { opcoes: OpcaoFreteVd[]; valor: ModalVd; onChange: (m: ModalVd) => void; cotando: boolean }) {
  // Só UI: entre SEDEX e PAC, esconde a opção dominada (outra é <= em valor e prazo, e melhor em ao menos um).
  const dominada = useMemo((): { oculta: ModalVd; dominante: ModalVd } | null => {
    if (cotando) return null;
    const s = opcoes.find((o) => o.modal === "sedex");
    const p = opcoes.find((o) => o.modal === "pac");
    if (!s || !p || !s.disponivel || !p.disponivel) return null;
    if (s.cobrado == null || p.cobrado == null || s.prazo_dias == null || p.prazo_dias == null) return null;
    const domina = (a: OpcaoFreteVd, b: OpcaoFreteVd) =>
      a.cobrado! <= b.cobrado! && a.prazo_dias! <= b.prazo_dias! &&
      (a.cobrado! < b.cobrado! || a.prazo_dias! < b.prazo_dias!);
    if (domina(s, p)) return { oculta: "pac", dominante: "sedex" };
    if (domina(p, s)) return { oculta: "sedex", dominante: "pac" };
    return null;
  }, [opcoes, cotando]);

  useEffect(() => {
    if (dominada && valor === dominada.oculta) onChange(dominada.dominante);
  }, [dominada, valor, onChange]);

  const visiveis = dominada ? opcoes.filter((o) => o.modal !== dominada.oculta) : opcoes;
  const rot = (m: ModalVd) => (m === "sedex" ? "SEDEX" : "PAC");

  return (
    <>
    <div role="radiogroup" aria-label="Modalidade de entrega" className="grid gap-3 sm:grid-cols-2">
      {visiveis.map((o) => {
        const Icone = ICONE[o.modal];
        const sel = valor === o.modal;
        const carregando = cotando && o.modal !== "retirada";
        return (
          <button
            key={o.modal}
            type="button"
            role="radio"
            aria-checked={sel}
            disabled={!o.disponivel && !carregando}
            onClick={() => o.disponivel && onChange(o.modal)}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors",
              sel ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/50",
              !o.disponivel && "cursor-not-allowed opacity-60 hover:bg-transparent",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icone className="h-4 w-4 text-muted-foreground" /> {o.rotulo}
              {o.gratis && o.disponivel && o.modal !== "retirada" && (
                <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">Grátis</span>
              )}
            </span>
            {carregando ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> cotando…</span>
            ) : o.disponivel ? (
              <span className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{o.cobrado === 0 ? "Grátis" : formatBRL(o.cobrado ?? 0)}</span>
                {o.gratis && o.modal !== "retirada" && o.preco_base != null && (
                  <span className="text-sm tabular-nums text-muted-foreground line-through">{formatBRL(o.preco_base)}</span>
                )}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">{o.motivo ?? "Indisponível"}</span>
            )}
            {!carregando && o.disponivel && (
              <span className="text-xs text-muted-foreground">
                {[o.prazo_dias != null ? `Prazo ${o.prazo_dias} dia${o.prazo_dias === 1 ? "" : "s"} úteis` : null, o.faixa, o.motivo]
                  .filter(Boolean).join(" · ") || (o.modal === "retirada" ? "Sem custo" : "")}
              </span>
            )}
          </button>
        );
      })}
    </div>
    {dominada && (
      <p className="text-xs text-muted-foreground">
        {rot(dominada.oculta)} oculto: o {rot(dominada.dominante)} sai {dominada.dominante === "sedex" ? "mais barato e mais rápido" : "mais barato e mais rápido"} para este CEP.
      </p>
    )}
    </>
  );
}

export function AvisosFrete({ correiosErro, tabelaErro, paramErro, pesoIncompleto }: {
  correiosErro: Error | null; tabelaErro: Error | null; paramErro: Error | null; pesoIncompleto: boolean;
}) {
  return (
    <>
      {correiosErro && (
        <p className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Cotação dos Correios indisponível — SEDEX pelo preço de tabela. <span className="text-xs">({rawMessage(correiosErro)})</span></span>
        </p>
      )}
      {tabelaErro && <p className="text-sm text-destructive">Falha na tabela de frete: {rawMessage(tabelaErro)}</p>}
      {paramErro && <p className="text-sm text-destructive">Falha ao ler parâmetros de frete: {rawMessage(paramErro)}</p>}
      {pesoIncompleto && <p className="text-xs text-muted-foreground">Peso de algum item não cadastrado — cotação pode sair abaixo.</p>}
    </>
  );
}
