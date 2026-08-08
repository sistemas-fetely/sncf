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

  let processadas = 0;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dias = Number(body?.dias ?? 45);

    const { data: cfgRow, error: eCfg } = await sb
      .from("integracoes_config").select("config").eq("sistema", "zenlog_prd").single();
    if (eCfg) throw new Error(`config zenlog_prd: ${eCfg.message}`);
    const cfg = cfgRow!.config as Record<string, string>;

    const { data: pat, error: ePat } = await sb.rpc("get_vault_secret", { p_name: cfg.pat_vault_key });
    if (ePat) throw new Error(`vault: ${ePat.message}`);
    if (!pat) throw new Error("PAT ausente no vault");

    const base = cfg.base_url;

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
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

    let skip = 0;
    const take = 50;
    let total = Infinity;

    while (skip < total) {
      const qs = new URLSearchParams({
        DataInicial: desde,
        MaxResultCount: String(take),
        SkipCount: String(skip),
        Sorting: "id desc",
      });
      const r = await fetch(`${base}/api/services/app/Expedicao/GetAll?${qs}`, { headers });
      const j = await r.json();
      if (!r.ok || j?.success === false) {
        throw new Error(`GetAll falhou: ${j?.error?.message ?? r.status}`);
      }
      total = j?.result?.totalCount ?? 0;
      const items = j?.result?.items ?? [];
      if (items.length === 0) break;

      for (const it of items) {
        const doc = it.documentos?.[0] ?? {};
        const codigo = String(it.codigo);

        const cab = {
          codigo,
          expedicao_id_zenlog: it.id ?? null,
          data_expedicao: it.data ?? null,
          data_emissao: it.dataEmissao ?? null,
          situacao: it.situacao ?? null,
          situacao_integracao: it.situacaoIntegracao ?? null,
          origem_dado: it.origemDeDado ?? null,
          obs_expedicao: it.obsExpedicao ?? null,
          obs_nf: it.obsNfExpedicao ?? null,
          depositante_cnpj: it.depositante?.cpfCnpj ?? null,
          destinatario_nome: doc.destinatario?.nome ?? null,
          destinatario_cnpj: doc.destinatario?.cpfCnpj ?? null,
          transportador_cnpj: typeof doc.transportador === "string" && doc.transportador ? doc.transportador : null,
          nf_numero: doc.numero || null,
          nf_serie: doc.serie || null,
          nf_chave: doc.chave || null,
          cfop: doc.cfop || null,
          quantidade_volumes: doc.quantidadeVolumes ?? null,
          peso_bruto: doc.pesoBruto ?? null,
          sincronizado_em: new Date().toISOString(),
        };

        const { error: eUp } = await sb.from("xpm_expedicao").upsert(cab, { onConflict: "codigo" });
        if (eUp) throw new Error(`upsert expedicao ${codigo}: ${eUp.message}`);

        const atendidos = new Map<string, number>();
        for (const a of doc.produtosAtendidos ?? []) {
          const chave = `${a.numeroItem ?? ""}|${a.produto?.codigo ?? ""}`;
          atendidos.set(chave, Number(a.quantidadeAtendida ?? 0));
        }

        const itens = (doc.produtos ?? [])
          .map((p: Record<string, any>) => {
            const cod = p.produto?.codigo ?? null;
            return {
              expedicao_codigo: codigo,
              sequencia: p.sequencia ?? null,
              numero_item: p.numeroItem ?? null,
              codigo_produto: cod,
              quantidade_solicitada: p.quantidadeSolicitada ?? null,
              quantidade_atendida: atendidos.get(`${p.numeroItem ?? ""}|${cod ?? ""}`) ?? null,
              valor_unitario: p.valorUnitario ?? null,
            };
          })
          .filter((x: Record<string, any>) => x.codigo_produto);

        const { error: eDelI } = await sb.from("xpm_expedicao_item").delete().eq("expedicao_codigo", codigo);
        if (eDelI) throw new Error(`limpar itens ${codigo}: ${eDelI.message}`);
        if (itens.length > 0) {
          const { error: eI } = await sb.from("xpm_expedicao_item").insert(itens);
          if (eI) throw new Error(`inserir itens ${codigo}: ${eI.message}`);
        }

        const vazia = (v: unknown) => !v || String(v).startsWith("0001");
        const eventos = (it.eventos ?? [])
          .filter((e: Record<string, any>) => e.eventoId != null)
          .map((e: Record<string, any>) => ({
            expedicao_codigo: codigo,
            evento_id: e.eventoId,
            status: e.status ?? null,
            inicio: vazia(e.inicio) ? null : e.inicio,
            fim: vazia(e.fim) ? null : e.fim,
            quantidade: e.quantidade ?? null,
          }));

        const { error: eDelE } = await sb.from("xpm_expedicao_evento").delete().eq("expedicao_codigo", codigo);
        if (eDelE) throw new Error(`limpar eventos ${codigo}: ${eDelE.message}`);
        if (eventos.length > 0) {
          const { error: eE } = await sb.from("xpm_expedicao_evento").insert(eventos);
          if (eE) throw new Error(`inserir eventos ${codigo}: ${eE.message}`);
        }

        processadas++;
      }

      skip += items.length;
    }

    await sb.from("integracoes_sync_log").insert({
      sistema: "zenlog_prd",
      tipo: "expedicoes",
      status: "sucesso",
      registros_atualizados: processadas,
      duracao_ms: Date.now() - t0,
      detalhes: { dias, total_api: total },
    });

    return new Response(JSON.stringify({ ok: true, expedicoes: processadas, total }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("integracoes_sync_log").insert({
      sistema: "zenlog_prd",
      tipo: "expedicoes",
      status: "erro",
      registros_erro: 1,
      duracao_ms: Date.now() - t0,
      detalhes: { erro: msg, processadas_antes_do_erro: processadas },
    });
    return new Response(JSON.stringify({ ok: false, erro: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
