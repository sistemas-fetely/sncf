import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FreteReposicao, ItemReposicao } from "@/lib/estoque/reposicaoSp";
import { formatError } from "@/lib/format-error";

export function useFretesReposicaoSp(itens: ItemReposicao[], destino: string, volume: { comprimento: number; largura: number; altura: number }, enabled: boolean) {
  return useQuery({ queryKey: ["reposicao-sp-fretes", itens.map(i => [i.sku, i.quantidade]), destino, volume], enabled: enabled && itens.length > 0 && !!destino, queryFn: async () => {
    const [centros, tabelas, api, peso, produtos] = await Promise.all([
      supabase.from("centro_distribuicao").select("codigo,cep").in("codigo", ["XPM-SC", destino]),
      supabase.from("transp_tabelas").select("transportadora_id,nome").eq("ativo", true),
      supabase.from("transp_cotacao_api").select("codigo,transportadora_id").eq("ativo", true).eq("codigo", "correios").maybeSingle(),
      supabase.rpc("fn_frete_preparar_cotacao", { p_itens: itens.map(i => ({ sku: i.sku, quantidade: i.quantidade })) }),
      supabase.from("sncf_produtos").select("sku,preco_custo").in("sku", itens.map(i => i.sku)),
    ]);
    for (const r of [centros, tabelas, api, peso, produtos]) if (r.error) throw r.error;
    const origemCep = centros.data?.find(c => c.codigo === "XPM-SC")?.cep?.replace(/\D/g, "");
    const destinoCep = centros.data?.find(c => c.codigo === destino)?.cep?.replace(/\D/g, "");
    if (!origemCep || !destinoCep) throw new Error("CEP da origem ou do destino não cadastrado.");
    const p = peso.data as { peso_g: number; peso_incompleto: boolean };
    const opcoes: FreteReposicao[] = [];
    const avisos: string[] = [];
    const custos = new Map((produtos.data ?? []).map(p => [p.sku, p.preco_custo ?? 0]));
    const valor = itens.reduce((s, i) => s + i.quantidade * (custos.get(i.sku) ?? 0), 0);
    if (!p.peso_g || p.peso_incompleto) return { opcoes, avisos: ["Peso ausente no cadastro de um ou mais produtos. Cotações indisponíveis."], pesoKg: p.peso_g / 1000 };
    const unicas = new Map((tabelas.data ?? []).map(t => [t.transportadora_id, t]));
    await Promise.all([...unicas.values()].map(async t => {
      try {
        const { data, error } = await supabase.rpc("fn_frete_estimado", { p_transportadora_id: t.transportadora_id, p_cep_destino: destinoCep, p_peso_cobrado: p.peso_g / 1000, p_valor_mercantil: valor });
        if (error) throw error;
        const c = data as { erro?: string; valor_estimado?: number; prazo_dias?: number };
        if (c.erro || c.valor_estimado == null) { avisos.push(`${t.nome}: ${c.erro ?? "sem valor"}`); return; }
        opcoes.push({ chave: t.transportadora_id, nome: t.nome, transportadoraId: t.transportadora_id, valor: c.valor_estimado, prazo: c.prazo_dias ?? null });
      } catch (e) { avisos.push(`${t.nome}: ${formatError(e)}`); }
    }));
    if (!(volume.comprimento > 0 && volume.largura > 0 && volume.altura > 0)) avisos.push("Correios: informe as dimensões reais do volume.");
    else if (!api.data?.transportadora_id) avisos.push("Correios: transportadora não vinculada ao serviço de cotação.");
    else {
      try {
        const { data, error } = await supabase.functions.invoke("correios-cotar", { body: { cep_origem: origemCep, cep_destino: destinoCep, peso_g: p.peso_g, comprimento_cm: volume.comprimento, largura_cm: volume.largura, altura_cm: volume.altura } });
        if (error) {
          let msg = error.message;
          try { const ctx = (error as { context?: Response }).context; if (ctx) msg = (await ctx.json()).erro ?? msg; } catch { /* preserves original error */ }
          throw new Error(msg);
        }
        if (data?.ok !== true) throw new Error(data?.erro ?? "Falha na cotação.");
        for (const c of (data.cotacoes ?? []) as { servico: string; codigo: string | null; preco: number | null; prazo_dias: number | null; erro: string | null }[]) {
          if (!["SEDEX", "PAC"].includes(c.servico.toUpperCase())) continue;
          if (c.erro || c.preco == null) { avisos.push(`Correios ${c.servico}: ${c.erro ?? "sem valor"}`); continue; }
          opcoes.push({ chave: `correios-${c.servico}`, nome: `Correios · ${c.servico}`, transportadoraId: api.data.transportadora_id, valor: c.preco, prazo: c.prazo_dias, servico: c.servico, codigo: c.codigo });
        }
      } catch (e) { avisos.push(`Correios: ${formatError(e)}`); }
    }
    return { opcoes: opcoes.sort((a,b) => a.nome.localeCompare(b.nome)), avisos, pesoKg: p.peso_g / 1000 };
  } });
}