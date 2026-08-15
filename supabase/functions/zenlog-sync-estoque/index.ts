import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const t0 = Date.now();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let linhas = 0;
  let posicoes = 0;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const historico = body?.historico === true;
    // TETO-POR-EXECUCAO: sem isto, `historico` tenta as 100+ fotos de uma vez,
    // estoura o tempo e MORRE ANTES DE LOGAR — o job trabalhava em silencio ha
    // 5 dias. Com teto, cada execucao termina, loga, e o atraso drena em noites.
    const maxFotos: number = Number(body?.max_fotos ?? 8);


    const { data: cfgRow, error: eCfg } = await sb
      .from("integracoes_config").select("config").eq("sistema", "zenlog_prd").single();
    if (eCfg) throw new Error(`config zenlog_prd: ${eCfg.message}`);
    const cfg = cfgRow!.config as Record<string, string>;

    const { data: pat, error: ePat } = await sb.rpc("get_vault_secret", { p_name: cfg.pat_vault_key });
    if (ePat) throw new Error(`vault: ${ePat.message}`);
    if (!pat) throw new Error("PAT ausente no vault");

    const base = cfg.base_url;
    const depositante = "63.591.078/0002-29";
    const operador = "08.898.687/0001-36";

    const authRes = await fetch(`${base}/api/TokenAuth/AuthenticatePAT`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ personalAccessToken: pat, tenantName: cfg.tenant_name }),
    });
    const authJson = await authRes.json();
    const token = authJson?.result?.accessToken;
    if (!authRes.ok || !token) {
      throw new Error(`auth falhou: ${authJson?.error?.message ?? authRes.status}`);
    }
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    const rh = await fetch(
      `${base}/api/services/app/PosicaoEstoque/GetAllHorarioPosicaoDistinctPorDia`,
      { headers },
    );
    const jh = await rh.json();
    if (!rh.ok || jh?.success === false) {
      throw new Error(`horarios falhou: ${jh?.error?.message ?? rh.status}`);
    }
    const todos: string[] = (jh?.result?.items ?? [])
      .map((h: Record<string, any>) => h.horario)
      .filter(Boolean)
      .sort()
      .reverse();
    if (todos.length === 0) throw new Error("nenhum horario de posicao retornado");

    // Le a lista de FOTOS (1 linha por foto), nao as 41k+ linhas de posicao:
    // o cliente trunca em 1000 e o sync reimportava foto que ja tinha.
    const { data: jaTem, error: eJa } = await sb
      .from("vw_xpm_estoque_fotos")
      .select("data_hora_posicao, parcial")
      .order("data_hora_posicao", { ascending: false });
    if (eJa) throw new Error(`ler posicoes existentes: ${eJa.message}`);

    const chave = (v: string) => new Date(v).toISOString().slice(0, 19);
    const existentes = new Set(
      (jaTem ?? []).map((r: Record<string, any>) => chave(r.data_hora_posicao)),
    );
    // Foto parcial e reimportada: a XPM as vezes devolve o retrato incompleto
    // (12/08 veio com 37 de 633 SKUs) e o saldo fica furado ate ela ser refeita.
    const parciais = new Set(
      (jaTem ?? []).filter((r: Record<string, any>) => r.parcial === true)
        .map((r: Record<string, any>) => chave(r.data_hora_posicao)),
    );

    // PRESENTE ANTES DO PASSADO: a foto mais recente entra sempre em primeiro
    // lugar. Antes, presente e historico dividiam a mesma fila e o backfill de
    // junho atrasava o saldo de ontem — que e o que trava pedido na tela.
    const pendentes = todos.filter(
      (h) => !existentes.has(chave(h)) || parciais.has(chave(h)),
    );
    const alvo = historico
      ? [todos[0], ...pendentes.filter((h) => h !== todos[0])].slice(0, maxFotos)
      : [todos[0]];


    for (const horario of alvo) {
      let skip = 0;
      const take = 500;
      let total = Infinity;
      const acumulado: Record<string, any>[] = [];

      while (skip < total) {
        const qs = new URLSearchParams({
          CpfCnpjDepositante: depositante,
          CpfCnpjOperadorLogistico: operador,
          DataHoraPosicao: horario,
          MaxResultCount: String(take),
          SkipCount: String(skip),
        });
        const r = await fetch(`${base}/api/services/app/PosicaoEstoque/GetAll?${qs}`, { headers });
        const j = await r.json();
        if (!r.ok || j?.success === false) {
          throw new Error(`PosicaoEstoque ${horario}: ${j?.error?.message ?? r.status}`);
        }
        total = j?.result?.totalCount ?? 0;
        const items = j?.result?.items ?? [];
        if (items.length === 0) break;

        for (const it of items) {
          const sku = it.produto?.codigo;
          if (!sku) continue;
          acumulado.push({
            posicao_id_zenlog: it.id ?? null,
            data_hora_posicao: horario,
            sku,
            descricao: it.produto?.descricao ?? null,
            situacao_estoque: it.situacaoEstoque ?? null,
            lote: it.lote ?? "",
            endereco: it.endereco ?? "",
            quantidade: it.quantidade ?? 0,
            quantidade_reservada: it.quantidadeReservada ?? null,
            depositante_cnpj: it.depositante?.cpfCnpj ?? null,
            operador_cnpj: it.operadorLogistico?.cpfCnpj ?? null,
            sincronizado_em: new Date().toISOString(),
          });
        }
        skip += items.length;
      }

      if (acumulado.length > 0) {
        for (let i = 0; i < acumulado.length; i += 500) {
          const fatia = acumulado.slice(i, i + 500);
          const { error: eUp } = await sb
            .from("xpm_estoque_posicao")
            .upsert(fatia, { onConflict: "posicao_id_zenlog", ignoreDuplicates: false });
          if (eUp) throw new Error(`upsert posicao ${horario}: ${eUp.message}`);
        }
        linhas += acumulado.length;
      }
      posicoes++;
    }

    await sb.from("integracoes_sync_log").insert({
      sistema: "zenlog_prd",
      tipo: "estoque",
      status: "sucesso",
      registros_atualizados: linhas,
      duracao_ms: Date.now() - t0,
      detalhes: {
        historico,
        posicoes_processadas: posicoes,
        posicoes_disponiveis: todos.length,
        foto_mais_recente: todos[0] ?? null,
        pendentes_restantes: Math.max(pendentes.length - posicoes, 0),
        teto_por_execucao: maxFotos,
      },

    });

    return new Response(JSON.stringify({ ok: true, posicoes, linhas }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("integracoes_sync_log").insert({
      sistema: "zenlog_prd",
      tipo: "estoque",
      status: "erro",
      registros_erro: 1,
      duracao_ms: Date.now() - t0,
      detalhes: { erro: msg, linhas_antes_do_erro: linhas },
    });
    return new Response(JSON.stringify({ ok: false, erro: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
