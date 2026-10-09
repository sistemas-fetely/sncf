import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FreteComparativoOpcao } from "@/hooks/pedidos/useFreteComparativo";

export interface TranspCotacaoApi {
  codigo: string;
  nome: string;
  transportadora_id: string | null;
}

export function useTranspCotacaoApi() {
  return useQuery<TranspCotacaoApi[]>({
    queryKey: ["transp-cotacao-api"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("transp_cotacao_api")
        .select("codigo, nome, transportadora_id")
        .eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as TranspCotacaoApi[];
    },
    staleTime: 30 * 60_000,
  });
}

interface PlanoVolumes {
  ok: boolean;
  motivo?: string | null;
  transportadora_id: string | null;
  transportadora_nome?: string | null;
  cep_origem: string;
  cep_destino: string;
  origem_assumida?: boolean;
  destino_fallback?: boolean;
  n_volumes: number;
  volume: {
    peso_g: number;
    comprimento_cm: number;
    largura_cm: number;
    altura_cm: number;
    caixa: string | null;
    litros_por_caixa?: number | null;
    caixa_no_limite?: boolean;
  };
  peso_total_kg: number;
  situacao: "elegivel" | "improvavel" | "inelegivel";
  avisos?: string[] | null;
}

export interface PorVolumeCorreios {
  grupo: number;
  quantidade: number;
  peso_g: number;
  preco_unit: number | null;
  subtotal: number | null;
}

export interface OpcaoCorreios extends FreteComparativoOpcao {
  fonte: "correios";
  servico_codigo: string | null;
  situacao: PlanoVolumes["situacao"] | null;
  motivo: string | null;
  avisos: string[];
  n_volumes: number;
  por_volume: PorVolumeCorreios[];
  estimativa_json: Record<string, unknown> | null;
}

function opcaoErro(plano: Partial<PlanoVolumes> | null, erro: string): OpcaoCorreios {
  return {
    transportadora_id: plano?.transportadora_id ?? null,
    transportadora_nome: "Correios",
    cnpj: null,
    erro,
    valor_estimado: null,
    prazo_dias: null,
    zona: null,
    uf_destino: null,
    pct_sobre_pedido: null,
    breakdown: null,
    fonte: "correios",
    servico_codigo: null,
    situacao: plano?.situacao ?? null,
    motivo: erro,
    avisos: plano?.avisos ?? [],
    n_volumes: plano?.n_volumes ?? 0,
    por_volume: [],
    estimativa_json: null,
  };
}

export interface CotacaoCorreiosBruta {
  cep_origem: string;
  cep_destino: string;
  cotacoes: { servico: string; codigo: string | null; preco: number; prazo_dias: number | null; erro: null }[];
}

/**
 * Persiste a cotação viva dos Correios do pedido B2B em frete_cotacao
 * (uma por pedido; recotar substitui). A sugestão automática do banco lê daqui.
 * Só serviços sem erro e com preço. Validade vem de frete_roteirizacao_parametro.
 */
export async function persistirCotacaoCorreiosB2B(pedidoId: string, bruta: CotacaoCorreiosBruta, pesoKg: number) {
  if (!bruta.cotacoes.length) return;
  const sb = supabase as any;
  const { data: par, error: parErr } = await sb
    .from("frete_roteirizacao_parametro").select("valor").eq("chave", "cache_validade_min").eq("ativo", true).maybeSingle();
  if (parErr) throw parErr;
  const minutos = Number(par?.valor);
  if (!Number.isFinite(minutos) || minutos <= 0) throw new Error("Parâmetro cache_validade_min ausente em frete_roteirizacao_parametro.");
  const campos = {
    cotacoes: bruta.cotacoes,
    valida_ate: new Date(Date.now() + minutos * 60_000).toISOString(),
    peso_g: Math.round(pesoKg * 1000),
    cep_destino: bruta.cep_destino,
    criado_em: new Date().toISOString(),
  };
  // Upsert manual: o índice único é parcial (contexto='b2b'), que o PostgREST não consegue inferir.
  const atualizar = async () => {
    const { data, error } = await sb.from("frete_cotacao").update(campos)
      .eq("contexto", "b2b").eq("pedido_id", pedidoId).select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  };
  if (await atualizar()) return;
  const { error } = await sb.from("frete_cotacao").insert({
    ...campos, contexto: "b2b", pedido_id: pedidoId, fonte: "correios", cep_origem: bruta.cep_origem,
  });
  if (error) {
    if (error.code === "23505" && (await atualizar())) return;
    throw error;
  }
}

export function useCotacaoCorreios(pedidoId: string | undefined, valorReferencia: number) {
  return useQuery<{ plano: PlanoVolumes; opcoes: OpcaoCorreios[]; bruta?: CotacaoCorreiosBruta }>({
    queryKey: ["cotacao-correios", pedidoId],
    enabled: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: planoRaw, error: rpcErr } = await (supabase as any).rpc("fn_correios_plano_volumes", {
        p_pedido_id: pedidoId,
      });
      if (rpcErr) throw rpcErr;
      const plano = (planoRaw ?? {}) as PlanoVolumes;

      if (plano.ok === false) {
        return { plano, opcoes: [opcaoErro(plano, plano.motivo ?? "Plano de volumes indisponível.")] };
      }
      if (plano.situacao === "inelegivel") {
        return { plano, opcoes: [opcaoErro(plano, plano.motivo ?? "Pedido inelegível para Correios.")] };
      }

      const v = plano.volume;
      const { data, error } = await supabase.functions.invoke("correios-cotar", {
        body: {
          cep_origem: plano.cep_origem,
          cep_destino: plano.cep_destino,
          volumes: [{
            peso_g: v.peso_g,
            comprimento_cm: v.comprimento_cm,
            largura_cm: v.largura_cm,
            altura_cm: v.altura_cm,
            quantidade: plano.n_volumes,
          }],
        },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const corpo = await ctx.json();
            if (corpo?.erro) msg = corpo.erro;
          }
        } catch { /* mantém a mensagem original */ }
        throw new Error(`Correios: ${msg}`);
      }
      if (data?.ok !== true) throw new Error(`Correios: ${data?.erro ?? "falha na cotação"}`);

      const avisos = [...(plano.avisos ?? [])];
      const hoje = new Date();
      const dataRef = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

      const opcoes: OpcaoCorreios[] = (data.cotacoes ?? []).map((c: any) => {
        const preco = c.preco == null ? null : Number(c.preco);
        const pct = preco != null && valorReferencia > 0 ? Math.round((preco / valorReferencia) * 10000) / 100 : null;
        return {
          transportadora_id: plano.transportadora_id,
          transportadora_nome: `Correios · ${c.servico}`,
          cnpj: null,
          erro: c.erro ?? null,
          valor_estimado: preco,
          prazo_dias: c.prazo_dias ?? null,
          zona: `${plano.n_volumes} vol · ${v.caixa ?? "—"}`,
          uf_destino: null,
          pct_sobre_pedido: pct,
          breakdown: null,
          fonte: "correios",
          servico_codigo: c.codigo ?? null,
          situacao: plano.situacao,
          motivo: plano.motivo ?? null,
          avisos,
          n_volumes: plano.n_volumes,
          por_volume: c.por_volume ?? [],
          estimativa_json: {
            origem_cotacao: "correios_cotar",
            transportadora_id: plano.transportadora_id,
            transportadora_nome: "Correios",
            servico: c.servico,
            servico_codigo: c.codigo,
            valor_estimado: preco,
            prazo_dias: c.prazo_dias ?? null,
            n_volumes: plano.n_volumes,
            volume: v,
            peso_total_kg: plano.peso_total_kg,
            cep_origem: plano.cep_origem,
            cep_destino: plano.cep_destino,
            contrato: data.contrato,
            dr: data.dr,
            situacao: plano.situacao,
            avisos,
            por_volume: c.por_volume ?? [],
            data_referencia: dataRef,
          },
        };
      });
      const bruta: CotacaoCorreiosBruta = {
        cep_origem: plano.cep_origem,
        cep_destino: plano.cep_destino,
        cotacoes: (data.cotacoes ?? [])
          .filter((c: any) => !c.erro && c.preco != null)
          .map((c: any) => ({ servico: c.servico, codigo: c.codigo ?? null, preco: Number(c.preco), prazo_dias: c.prazo_dias ?? null, erro: null })),
      };
      return { plano, opcoes, bruta };
    },
  });
}
