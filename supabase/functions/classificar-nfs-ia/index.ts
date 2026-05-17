// Edge function: classifica NFs do Stage usando Gemini.
// Agrupa por CNPJ para eficiência — 1 chamada por fornecedor único.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NFParaClassificar {
  id: string;
  fornecedor_cnpj: string | null;
  fornecedor_razao_social: string | null;
  descricao: string | null;
  itens: { descricao: string; ncm?: string }[] | null;
  valor: number | null;
}

interface CategoriaPlano {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
}

interface SugestaoIA {
  cnpj: string;
  categoria_id: string;
  motivo: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const body = await req.json();
    const { ids } = body as { ids?: string[] };

    let query = (supabase as any)
      .from("nfs_stage")
      .select("id, fornecedor_cnpj, fornecedor_razao_social, descricao, itens, valor")
      .not("status", "in", '("descartada","duplicata")');

    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    } else {
      query = query.is("categoria_id", null);
    }

    const { data: nfs, error: nfsErr } = await query;
    if (nfsErr) throw new Error("Erro ao buscar NFs: " + nfsErr.message);
    if (!nfs || nfs.length === 0) {
      return new Response(JSON.stringify({ classificadas: 0, mensagem: "Nenhuma NF sem categoria" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: categorias, error: catErr } = await (supabase as any)
      .from("plano_contas")
      .select("id, codigo, nome, tipo")
      .eq("ativo", true)
      .order("codigo");

    if (catErr) throw new Error("Erro ao buscar categorias: " + catErr.message);

    const porCnpj = new Map<string, NFParaClassificar[]>();
    for (const nf of nfs as NFParaClassificar[]) {
      const chave = nf.fornecedor_cnpj || `sem_cnpj_${nf.id}`;
      if (!porCnpj.has(chave)) porCnpj.set(chave, []);
      porCnpj.get(chave)!.push(nf);
    }

    const resultados: { id: string; categoria_id: string; motivo: string }[] = [];
    const erros: string[] = [];

    for (const [cnpj, grupo] of porCnpj) {
      try {
        // Se já existe regra manual para este CNPJ, aplica direto sem chamar IA
        const { data: regraExistente } = await (supabase as any)
          .from("regras_categorizacao")
          .select("categoria_id")
          .eq("cnpj_emitente", cnpj)
          .order("vezes_aplicada", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (regraExistente?.categoria_id) {
          for (const nf of grupo) {
            resultados.push({
              id: nf.id,
              categoria_id: regraExistente.categoria_id,
              motivo: "Regra manual existente para este CNPJ",
            });
          }
          continue;
        }

        const nfRef = grupo[0];
        const nomeFornecedor = nfRef.fornecedor_razao_social || cnpj;

        const itensTexto = nfRef.itens && nfRef.itens.length > 0
          ? nfRef.itens.slice(0, 5).map((i: { descricao: string; ncm?: string }) =>
              `  - ${i.descricao}${i.ncm ? ` (NCM: ${i.ncm})` : ""}`).join("\n")
          : nfRef.descricao
            ? `  - ${nfRef.descricao}`
            : "  - (sem descrição de itens)";

        const prompt = `Você é um contador especializado em classificação de despesas empresariais brasileiras.

EMPRESA: FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA
Segmento: artigos de celebração, velas, pratos e copos descartáveis, decoração de festas.

CATEGORIAS DISPONÍVEIS NO PLANO DE CONTAS (use APENAS os IDs desta lista):
${(categorias as CategoriaPlano[]).map(c => `ID: ${c.id} | ${c.codigo} — ${c.nome} (${c.tipo})`).join("\n")}

FORNECEDOR PARA CLASSIFICAR:
CNPJ: ${cnpj}
Razão Social: ${nomeFornecedor}
Itens/Serviços da NF:
${itensTexto}
Valor médio: R$ ${nfRef.valor?.toFixed(2) || "?"}

Com base no fornecedor e nos itens, qual categoria do plano de contas acima melhor representa esta despesa?

Responda APENAS com JSON válido, sem markdown, sem texto antes ou depois:
{"categoria_id": "UUID_DA_CATEGORIA", "motivo": "Explicação em 1 frase"}`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "Você é um contador especializado. Responda APENAS com JSON válido, sem markdown, sem texto adicional.",
              },
              { role: "user", content: prompt },
            ],
          }),
        });

        if (!aiResp.ok) {
          erros.push(`${nomeFornecedor}: erro ${aiResp.status}`);
          continue;
        }

        const aiData = await aiResp.json();
        let raw = aiData?.choices?.[0]?.message?.content ?? "";
        let jsonStr = String(raw).trim();
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (fenceMatch) jsonStr = fenceMatch[1].trim();
        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

        let sugestao: SugestaoIA;
        try {
          sugestao = JSON.parse(jsonStr);
        } catch {
          erros.push(`${nomeFornecedor}: resposta inválida da IA`);
          continue;
        }

        const categoriaValida = (categorias as CategoriaPlano[]).find(c => c.id === sugestao.categoria_id);
        if (!categoriaValida) {
          erros.push(`${nomeFornecedor}: categoria_id inválido retornado pela IA`);
          continue;
        }

        for (const nf of grupo) {
          resultados.push({ id: nf.id, categoria_id: sugestao.categoria_id, motivo: sugestao.motivo });
        }
      } catch (e) {
        erros.push(`${cnpj}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    let classificadas = 0;
    for (const r of resultados) {
      const { error } = await (supabase as any)
        .from("nfs_stage")
        .update({ categoria_id: r.categoria_id, categoria_sugerida_ia: true })
        .eq("id", r.id);
      if (!error) classificadas++;
    }

    return new Response(
      JSON.stringify({ classificadas, erros, total_nfs: nfs.length, cnpjs_processados: porCnpj.size }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("classificar-nfs-ia erro:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
