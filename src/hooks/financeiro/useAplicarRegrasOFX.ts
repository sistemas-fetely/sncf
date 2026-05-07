import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useAplicarRegrasOFX() {
  const qc = useQueryClient();

  async function aplicarRegras(contaBancariaId: string): Promise<{ aplicados: number }> {
    const { data: regras } = await sb
      .from("ofx_regras_automaticas")
      .select("id, pattern, conta_plano_id, centro_custo_id, descricao_override")
      .eq("ativo", true)
      .or(`conta_bancaria_id.eq.${contaBancariaId},conta_bancaria_id.is.null`);

    if (!regras?.length) return { aplicados: 0 };

    const { data: ofxList } = await sb
      .from("ofx_transacoes_stage")
      .select("id, descricao, valor, data_transacao, conta_bancaria_id, id_transacao_banco, hash_unico")
      .eq("conta_bancaria_id", contaBancariaId)
      .eq("status", "pendente");

    if (!ofxList?.length) return { aplicados: 0 };

    let aplicados = 0;

    for (const ofx of ofxList) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const regra = regras.find((r: any) =>
        ofx.descricao?.toLowerCase().includes(r.pattern.toLowerCase())
      );
      if (!regra) continue;

      const { error } = await sb.from("movimentacoes_bancarias").insert({
        conta_bancaria_id: ofx.conta_bancaria_id,
        data_transacao: ofx.data_transacao,
        valor: ofx.valor,
        descricao: regra.descricao_override || ofx.descricao,
        conta_plano_id: regra.conta_plano_id,
        centro_custo_id: regra.centro_custo_id ?? null,
        tipo: ofx.valor >= 0 ? "credito" : "debito",
        origem: "ofx",
        conciliado: true,
        conciliado_em: new Date().toISOString(),
        id_transacao_banco: ofx.id_transacao_banco ?? null,
        hash_unico: ofx.hash_unico ?? null,
      });

      if (!error) {
        await sb.from("ofx_transacoes_stage")
          .update({ status: "persistida" })
          .eq("id", ofx.id);
        aplicados++;
      }
    }

    if (aplicados > 0) {
      qc.invalidateQueries({ queryKey: ["ofx-residual", contaBancariaId] });
    }

    return { aplicados };
  }

  return { aplicarRegras };
}
