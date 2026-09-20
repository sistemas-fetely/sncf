// sincronizar-precos — o SNCF PUXA do FOP o espelho da tabela de preço.
// Leitura no FOP (REST, credencial do vault), escrita SOMENTE nas duas tabelas
// espelho locais: fop_preco_vigencia e fop_preco_historico.
// Nunca escreve no FOP, nunca toca em sncf_produtos.
// Entrada: Bearer conferido contra FOP_INBOUND_TOKEN do vault (padrão
// recebe-pedido) — sem sessão, para o cron do banco poder chamar.
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

const FOP_URL = "https://onalegxugtuxpfhonayq.supabase.co";
const PAGINA = 1000;
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── Autenticação de entrada: token do vault, sem sessão ──
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Authorization Bearer ausente ou malformado" });
    }
    const senhaRecebida = authHeader.substring(7).trim();

    const { data: senhaEsperada, error: errInbound } = await supabase
      .rpc("get_vault_secret", { p_name: "FOP_INBOUND_TOKEN" });

    if (errInbound || !senhaEsperada) {
      console.error("[sincronizar-precos] Falha ao ler FOP_INBOUND_TOKEN do cofre", errInbound);
      return jsonResponse(500, { error: "Erro de configuração interna" });
    }

    if (senhaRecebida !== senhaEsperada) {
      console.warn("[sincronizar-precos] Senha inválida");
      return jsonResponse(401, { error: "Senha inválida" });
    }

    // ── Credencial de leitura do FOP: vault, nunca Deno.env ──
    const { data: fopKey, error: errVault } = await supabase
      .rpc("get_vault_secret", { p_name: "FOP_SERVICE_ROLE_KEY" });

    if (errVault || !fopKey) {
      console.error("[sincronizar-precos] FOP_SERVICE_ROLE_KEY indisponível no vault", errVault);
      return jsonResponse(500, {
        error: `FOP_SERVICE_ROLE_KEY indisponível no vault${errVault ? `: ${errVault.message}` : ""}`,
      });
    }

    const fopHeaders = {
      apikey: String(fopKey),
      Authorization: `Bearer ${String(fopKey)}`,
      "Content-Type": "application/json",
    };

    // Lê tudo do FOP paginando até vir página curta. Sem filtro de ativo ou
    // fase — é espelho, traz tudo.
    async function lerTudoFop(tabela: string, colunas: string): Promise<any[]> {
      const todas: any[] = [];
      let offset = 0;
      for (;;) {
        const url =
          `${FOP_URL}/rest/v1/${tabela}?select=${encodeURIComponent(colunas)}` +
          `&order=id.asc&limit=${PAGINA}&offset=${offset}`;
        const resp = await fetch(url, { headers: fopHeaders });
        const texto = await resp.text();
        if (!resp.ok) {
          console.error(`[sincronizar-precos] leitura do FOP falhou em ${tabela}`, {
            status: resp.status,
            corpo: texto,
          });
          throw new Error(`FOP recusou a leitura de ${tabela} (${resp.status}): ${texto}`);
        }
        let pagina: any[];
        try {
          pagina = JSON.parse(texto);
        } catch {
          console.error(`[sincronizar-precos] resposta não-JSON do FOP em ${tabela}`, texto);
          throw new Error(`resposta inválida do FOP em ${tabela}: ${texto}`);
        }
        if (!Array.isArray(pagina)) {
          throw new Error(`resposta inesperada do FOP em ${tabela}: ${texto}`);
        }
        todas.push(...pagina);
        if (pagina.length < PAGINA) break;
        offset += PAGINA;
      }
      return todas;
    }

    const produtos = await lerTudoFop("products", "id,cod_cadastro,sku");
    const vigencias = await lerTudoFop(
      "product_prices",
      "id,product_id,preco_atacado,preco_varejo,vigencia_inicio,vigencia_fim,ativo,observacao,criado_por_nome,created_at,updated_at",
    );
    const historico = await lerTudoFop(
      "product_price_history",
      "id,product_id,sku,nome_comercial,preco_atacado_anterior,preco_varejo_anterior,preco_atacado_novo,preco_varejo_novo,variacao_atacado_percent,variacao_varejo_percent,acao,alterado_por_nome,observacao,criado_em",
    );

    console.log(
      `[sincronizar-precos] lidos do FOP: products=${produtos.length} product_prices=${vigencias.length} product_price_history=${historico.length}`,
    );

    // Mapa product_id → identidade. Vigência órfã entra mesmo assim, com nulos:
    // é lixo conhecido e o espelho precisa mostrar, não esconder.
    const mapaProduto = new Map<string, { cod_cadastro: string | null; sku: string | null }>();
    for (const p of produtos) {
      if (p?.id != null) {
        mapaProduto.set(String(p.id), {
          cod_cadastro: p.cod_cadastro ?? null,
          sku: p.sku ?? null,
        });
      }
    }

    const erros: ErroBloco[] = [];
    let errosOmitidos = 0;
    let gravadosVigencias = 0;
    let gravadosHistorico = 0;

    const registrarErro = (tabela: string, ids: string[], erro: unknown) => {
      console.error(`[sincronizar-precos] falha no upsert de ${tabela}`, { ids, erro });
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

    // espelhado_em é preenchido pelo banco — não enviar.
    // criado_por_nome / alterado_por_nome vão como vieram, nulos inclusive:
    // a trigger local converte para 'indeterminado' visível.
    // Nenhuma correção, arredondamento ou filtro na passagem.

    for (let i = 0; i < vigencias.length; i += TAMANHO_BLOCO) {
      const bloco = vigencias.slice(i, i + TAMANHO_BLOCO).map((v: any) => {
        const ident = v.product_id != null ? mapaProduto.get(String(v.product_id)) : undefined;
        return {
          id: v.id,
          product_id: v.product_id ?? null,
          cod_cadastro: ident?.cod_cadastro ?? null,
          sku: ident?.sku ?? null,
          preco_atacado: v.preco_atacado ?? null,
          preco_varejo: v.preco_varejo ?? null,
          vigencia_inicio: v.vigencia_inicio ?? null,
          vigencia_fim: v.vigencia_fim ?? null,
          ativo: v.ativo ?? null,
          observacao: v.observacao ?? null,
          criado_por_nome: v.criado_por_nome ?? null,
          created_at: v.created_at ?? null,
          updated_at: v.updated_at ?? null,
        };
      });

      const { error } = await supabase
        .from("fop_preco_vigencia")
        .upsert(bloco, { onConflict: "id" });

      if (error) {
        registrarErro("fop_preco_vigencia", bloco.map((v) => String(v.id)), error);
      } else {
        gravadosVigencias += bloco.length;
      }
    }

    for (let i = 0; i < historico.length; i += TAMANHO_BLOCO) {
      const bloco = historico.slice(i, i + TAMANHO_BLOCO).map((h: any) => {
        const ident = h.product_id != null ? mapaProduto.get(String(h.product_id)) : undefined;
        return {
          id: h.id,
          product_id: h.product_id ?? null,
          cod_cadastro: ident?.cod_cadastro ?? null,
          // sku vem do próprio histórico (registro do momento); mapa só completa
          sku: h.sku ?? ident?.sku ?? null,
          nome_comercial: h.nome_comercial ?? null,
          preco_atacado_anterior: h.preco_atacado_anterior ?? null,
          preco_varejo_anterior: h.preco_varejo_anterior ?? null,
          preco_atacado_novo: h.preco_atacado_novo ?? null,
          preco_varejo_novo: h.preco_varejo_novo ?? null,
          variacao_atacado_percent: h.variacao_atacado_percent ?? null,
          variacao_varejo_percent: h.variacao_varejo_percent ?? null,
          acao: h.acao ?? null,
          alterado_por_nome: h.alterado_por_nome ?? null,
          observacao: h.observacao ?? null,
          criado_em: h.criado_em ?? null,
        };
      });

      const { error } = await supabase
        .from("fop_preco_historico")
        .upsert(bloco, { onConflict: "id" });

      if (error) {
        registrarErro("fop_preco_historico", bloco.map((h) => String(h.id)), error);
      } else {
        gravadosHistorico += bloco.length;
      }
    }

    console.log(
      `[sincronizar-precos] vigencias=${gravadosVigencias}/${vigencias.length} historico=${gravadosHistorico}/${historico.length} erros=${erros.length + errosOmitidos}`,
    );

    if (gravadosVigencias + gravadosHistorico === 0) {
      return jsonResponse(500, {
        ok: false,
        error: "Nada foi gravado",
        vigencias: 0,
        historico: 0,
        erros,
        erros_omitidos: errosOmitidos,
      });
    }

    if (erros.length > 0 || errosOmitidos > 0) {
      return jsonResponse(200, {
        ok: false,
        vigencias: gravadosVigencias,
        historico: gravadosHistorico,
        erros,
        erros_omitidos: errosOmitidos,
      });
    }

    return jsonResponse(200, {
      ok: true,
      vigencias: gravadosVigencias,
      historico: gravadosHistorico,
      erros: [],
    });
  } catch (err) {
    console.error("[sincronizar-precos] Erro inesperado", err);
    return jsonResponse(500, {
      ok: false,
      error: err instanceof Error ? err.message : "Erro interno",
    });
  }
});
