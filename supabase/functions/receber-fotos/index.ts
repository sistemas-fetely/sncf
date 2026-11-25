// receber-fotos — recebe do FOP o espelho da tabela `photos`.
// Escrita SOMENTE em fop_foto e fop_foto_vinculo — nunca em sncf_produtos, nunca no FOP.
// Padrão: receber-precos (CORS, FOP_INBOUND_TOKEN no vault, service role,
// resposta com contagem). Foto órfã (colecao/cor/categoria nulas) grava igual.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TAMANHO_BLOCO = 500;
const TETO_ERROS = 50;

interface ErroBloco {
  tabela: string;
  ids: string[];
  erro: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Método não permitido. Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Corpo JSON malformado" });
    }

    // ── Autenticação: mesmo token de entrada do receber-precos (vault) ──
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Authorization Bearer ausente ou malformado" });
    }
    const senhaRecebida = authHeader.substring(7).trim();

    const { data: senhaEsperada, error: vaultError } = await supabase
      .rpc("get_vault_secret", { p_name: "FOP_INBOUND_TOKEN" });

    if (vaultError || !senhaEsperada) {
      console.error("[receber-fotos] Falha ao ler senha do cofre", vaultError);
      return jsonResponse(500, { error: "Erro de configuração interna" });
    }

    if (senhaRecebida !== senhaEsperada) {
      console.warn("[receber-fotos] Senha inválida");
      return jsonResponse(401, { error: "Senha inválida" });
    }

    const fotos = Array.isArray(body?.fotos) ? body.fotos : [];

    if (fotos.length === 0) {
      return jsonResponse(400, {
        error: "Payload vazio",
        detalhe: "envie o array: fotos",
      });
    }

    const erros: ErroBloco[] = [];
    let errosOmitidos = 0;
    let gravadasFotos = 0;
    let gravadosVinculos = 0;

    const registrarErro = (tabela: string, ids: string[], erro: unknown) => {
      console.error(`[receber-fotos] falha no upsert de ${tabela}`, { ids, erro });
      if (erros.length < TETO_ERROS) {
        erros.push({
          tabela,
          ids,
          erro: typeof erro === "object" && erro !== null && "message" in erro
            ? String((erro as { message: unknown }).message)
            : JSON.stringify(erro),
        });
      } else {
        errosOmitidos++;
      }
    };

    // espelhado_em é preenchido pelo banco (default/trigger) — não enviar.
    // colecao / cor / categoria vão como vieram, nulos inclusive: foto órfã
    // tem que aparecer no espelho, não ser descartada.

    // ── Fotos: upsert por id (uuid do FOP), blocos de 500 ──
    for (let i = 0; i < fotos.length; i += TAMANHO_BLOCO) {
      const fotosBloco = fotos.slice(i, i + TAMANHO_BLOCO);
      const bloco = fotosBloco.map((f: any) => ({
        id: f.id,
        kind: f.kind,
        colecao: f.colecao ?? null,
        cor: f.cor ?? null,
        categoria: f.categoria ?? null,
        url: f.url,
        path: f.path ?? null,
        created_at: f.created_at ?? null,
        updated_at: f.updated_at ?? null,
      }));

      const { error } = await supabase
        .from("fop_foto")
        .upsert(bloco, { onConflict: "id" });

      if (error) {
        registrarErro("fop_foto", bloco.map((f: any) => String(f.id)), error);
      } else {
        gravadasFotos += bloco.length;
        const ids = bloco.map((f: any) => String(f.id));
        try {
          const { error: erroApagar } = await supabase
            .from("fop_foto_vinculo")
            .delete()
            .in("foto_id", ids);
          if (erroApagar) {
            registrarErro("fop_foto_vinculo", ids, erroApagar);
            continue;
          }

          const vinculos = fotosBloco.flatMap((f: any) => {
            const codigos = Array.isArray(f.cod_cadastros)
              ? [...new Set<string>(f.cod_cadastros
                .filter((codigo: unknown): codigo is string => typeof codigo === "string")
                .map((codigo: string) => codigo.trim())
                .filter((codigo: string) => codigo.length > 0))]
              : [];
            return codigos.map((codigo) => ({
              foto_id: f.id,
              cod_cadastro: codigo,
              qtd_cods: codigos.length,
              foto_updated_at: f.updated_at ?? null,
            }));
          });

          for (let j = 0; j < vinculos.length; j += 1000) {
            const lote = vinculos.slice(j, j + 1000);
            const { error: erroInserir } = await supabase
              .from("fop_foto_vinculo")
              .insert(lote);
            if (erroInserir) {
              registrarErro("fop_foto_vinculo", [...new Set<string>(lote.map((v: any) => String(v.foto_id)))], erroInserir);
            } else {
              gravadosVinculos += lote.length;
            }
          }
        } catch (erroVinculo) {
          registrarErro("fop_foto_vinculo", ids, erroVinculo);
        }
      }
    }

    console.log(
      `[receber-fotos] fotos=${gravadasFotos}/${fotos.length} vinculos=${gravadosVinculos} erros=${erros.length + errosOmitidos}`
    );

    if (gravadasFotos === 0) {
      return jsonResponse(500, {
        ok: false,
        error: "Nada foi gravado",
        fotos: 0,
        vinculos: gravadosVinculos,
        erros,
        erros_omitidos: errosOmitidos,
      });
    }

    if (erros.length > 0 || errosOmitidos > 0) {
      return jsonResponse(200, {
        ok: false,
        fotos: gravadasFotos,
        vinculos: gravadosVinculos,
        erros,
        erros_omitidos: errosOmitidos,
      });
    }

    return jsonResponse(200, {
      ok: true,
      fotos: gravadasFotos,
      vinculos: gravadosVinculos,
    });
  } catch (err) {
    console.error("[receber-fotos] Erro inesperado", err);
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : "Erro interno",
    });
  }
});
