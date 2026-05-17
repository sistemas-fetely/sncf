// Edge function: classificar-nfs-ia
// Classifica NFs em stage sem categoria, agrupando por CNPJ do fornecedor.
// 1) Tenta usar histórico (mode da categoria já usada para o mesmo CNPJ).
// 2) Se não houver histórico, chama Lovable AI Gateway com o plano de contas.
// Marca as NFs com categoria_sugerida_ia=true para o operador revisar.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NFStageRow {
  id: string;
  fornecedor_cnpj: string | null;
  fornecedor_razao_social: string | null;
  fornecedor_cliente: string | null;
  descricao: string | null;
}

interface PlanoContaRow {
  id: string;
  codigo: string;
  nome: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Auth: exige usuário logado
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;

    // Carrega NFs sem categoria
    let query = supabase
      .from("nfs_stage")
      .select("id, fornecedor_cnpj, fornecedor_razao_social, fornecedor_cliente, descricao")
      .is("categoria_id", null)
      .eq("status", "nao_vinculada");
    if (ids && ids.length > 0) query = query.in("id", ids);

    const { data: nfs, error: errNfs } = await query;
    if (errNfs) throw errNfs;

    const lista = (nfs ?? []) as NFStageRow[];
    if (lista.length === 0) {
      return new Response(
        JSON.stringify({ classificadas: 0, erros: [], total_nfs: 0, cnpjs_processados: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Agrupa por CNPJ (se sem CNPJ, agrupa por razão social como fallback)
    const grupos = new Map<string, NFStageRow[]>();
    for (const nf of lista) {
      const chave = nf.fornecedor_cnpj
        ?? nf.fornecedor_razao_social
        ?? nf.fornecedor_cliente
        ?? `__sem_id_${nf.id}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(nf);
    }

    // Carrega plano de contas (analítico)
    const { data: planoRaw, error: errPlano } = await supabase
      .from("plano_contas")
      .select("id, codigo, nome, tipo, ativo")
      .eq("ativo", true);
    if (errPlano) throw errPlano;
    const plano = (planoRaw ?? []).filter((c: { tipo?: string }) => c.tipo !== "sintetica") as PlanoContaRow[];

    let classificadas = 0;
    const erros: string[] = [];

    for (const [chaveGrupo, nfsGrupo] of grupos) {
      try {
        const cnpj = nfsGrupo[0].fornecedor_cnpj;
        let categoriaId: string | null = null;

        // 1) Tenta histórico: categoria mais usada para esse CNPJ em nfs_stage já categorizadas
        if (cnpj) {
          const { data: hist } = await supabase
            .from("nfs_stage")
            .select("categoria_id")
            .eq("fornecedor_cnpj", cnpj)
            .not("categoria_id", "is", null)
            .eq("categoria_sugerida_ia", false)
            .limit(50);
          if (hist && hist.length > 0) {
            const contagem = new Map<string, number>();
            for (const h of hist) {
              const k = (h as { categoria_id: string }).categoria_id;
              contagem.set(k, (contagem.get(k) ?? 0) + 1);
            }
            categoriaId = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          }

          // Fallback: contas_pagar_receber
          if (!categoriaId) {
            const { data: histCPR } = await supabase
              .from("contas_pagar_receber")
              .select("conta_id")
              .eq("nf_cnpj_emitente", cnpj)
              .not("conta_id", "is", null)
              .limit(50);
            if (histCPR && histCPR.length > 0) {
              const c = new Map<string, number>();
              for (const h of histCPR) {
                const k = (h as { conta_id: string }).conta_id;
                c.set(k, (c.get(k) ?? 0) + 1);
              }
              categoriaId = [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
            }
          }
        }

        // 2) Sem histórico → Lovable AI
        if (!categoriaId) {
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (!LOVABLE_API_KEY) {
            erros.push(`${chaveGrupo}: sem histórico e LOVABLE_API_KEY ausente`);
            continue;
          }
          const fornecedorTxt = nfsGrupo[0].fornecedor_razao_social
            ?? nfsGrupo[0].fornecedor_cliente
            ?? "Fornecedor desconhecido";
          const descricaoTxt = nfsGrupo
            .map((n) => n.descricao)
            .filter(Boolean)
            .slice(0, 3)
            .join(" | ");

          const planoTxt = plano
            .map((c) => `${c.codigo} - ${c.nome} (id: ${c.id})`)
            .join("\n");

          const prompt = `Você é especialista em contabilidade brasileira. Dado um fornecedor e uma lista de categorias do plano de contas, escolha a categoria mais adequada.

Fornecedor: ${fornecedorTxt}
CNPJ: ${cnpj ?? "não informado"}
Descrição/exemplos: ${descricaoTxt || "(sem descrição)"}

Plano de contas disponível:
${planoTxt}

Retorne APENAS o id (UUID) da categoria escolhida via tool call.`;

          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "Você classifica despesas em categorias contábeis. Sempre responda usando a tool fornecida." },
                { role: "user", content: prompt },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "escolher_categoria",
                  description: "Escolhe a categoria mais adequada para o fornecedor",
                  parameters: {
                    type: "object",
                    properties: {
                      categoria_id: { type: "string", description: "UUID exato da categoria escolhida" },
                      motivo: { type: "string", description: "Curto motivo da escolha" },
                    },
                    required: ["categoria_id"],
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "escolher_categoria" } },
            }),
          });

          if (!aiResp.ok) {
            erros.push(`${chaveGrupo}: AI gateway ${aiResp.status}`);
            continue;
          }
          const aiJson = await aiResp.json();
          const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
          if (!call) {
            erros.push(`${chaveGrupo}: AI não retornou tool_call`);
            continue;
          }
          const args = JSON.parse(call.function?.arguments ?? "{}");
          const candidato = args.categoria_id as string | undefined;
          if (candidato && plano.some((c) => c.id === candidato)) {
            categoriaId = candidato;
          } else {
            erros.push(`${chaveGrupo}: categoria_id inválido retornado pela IA`);
            continue;
          }
        }

        if (!categoriaId) {
          erros.push(`${chaveGrupo}: nenhuma categoria encontrada`);
          continue;
        }

        // Atualiza todas as NFs do grupo
        const grupoIds = nfsGrupo.map((n) => n.id);
        const { error: errUpd } = await supabase
          .from("nfs_stage")
          .update({
            categoria_id: categoriaId,
            categoria_sugerida_ia: true,
          })
          .in("id", grupoIds);
        if (errUpd) {
          erros.push(`${chaveGrupo}: ${errUpd.message}`);
          continue;
        }
        classificadas += grupoIds.length;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        erros.push(`${chaveGrupo}: ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({
        classificadas,
        erros,
        total_nfs: lista.length,
        cnpjs_processados: grupos.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
