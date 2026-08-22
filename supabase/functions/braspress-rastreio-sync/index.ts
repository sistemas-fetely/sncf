import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function fail(msg: string, status: number) {
  console.error("[braspress-rastreio-sync] FAIL:", msg);
  return new Response(JSON.stringify({ erro: msg }), { status, headers: jsonHeaders });
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

const FASES = ["nunca_sincronizada", "em_curso", "divergente", "entregue_recente"];

/** Converte 'dd/MM/yyyy', 'dd/MM/yyyy HH:mm' e 'dd/MM/yyyy HH:mm:ss' em ISO -03:00. */
function parseDataBr(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const txt = String(valor).trim();
  if (!txt) return null;
  const m = txt.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!m) {
    console.error("[braspress-rastreio-sync] data em formato inesperado:", txt);
    return null;
  }
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  return `${yyyy}-${mm}-${dd}T${hh ?? "00"}:${mi ?? "00"}:${ss ?? "00"}-03:00`;
}


function semZerosEsquerda(valor: unknown): string | null {
  const txt = String(valor ?? "").trim();
  if (!txt) return null;
  const limpo = txt.replace(/^0+/, "");
  return limpo || txt;
}

const contem = (v: unknown, alvo: string) =>
  String(v ?? "").toLowerCase().includes(alvo);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Resultado = {
  nf: string;
  cte: string | null;
  status: string | null;
  ultimo_evento: string | null;
  divergencia: boolean;
  erro: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const inicio = Date.now();
  let logId: string | number | null = null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Config e credencial
    const { data: linha, error: errCfg } = await supabase
      .from("integracoes_config")
      .select("config")
      .eq("sistema", "braspress")
      .maybeSingle();

    if (errCfg) return fail(`erro ao ler integracoes_config: ${errCfg.message}`, 500);
    if (!linha?.config) return fail("integracoes_config sem linha para sistema='braspress'", 500);

    const cfg = linha.config as Record<string, unknown>;
    for (const k of ["base_url", "vault_key", "cnpj_tomador"]) {
      if (!cfg[k]) return fail(`config braspress sem a chave obrigatoria '${k}'`, 500);
    }
    const baseUrl = String(cfg.base_url).replace(/\/+$/, "");
    const vaultKey = String(cfg.vault_key);
    const cnpjTomador = digits(cfg.cnpj_tomador);
    if (!cnpjTomador) return fail("cnpj_tomador vazio apos normalizacao", 500);

    const { data: segredo, error: errVault } = await supabase.rpc("get_vault_secret", {
      p_name: vaultKey,
    });
    if (errVault) return fail(`erro ao ler credencial do vault: ${errVault.message}`, 500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credencial = typeof segredo === "string" ? segredo : (segredo as any)?.secret ?? "";
    if (!credencial || !String(credencial).trim()) {
      return fail(`credencial do vault '${vaultKey}' vazia ou inexistente`, 500);
    }
    const basic = btoa(String(credencial).trim());

    // Corpo
    let body: Record<string, unknown> = {};
    try {
      const texto = await req.text();
      body = texto ? JSON.parse(texto) : {};
    } catch (e) {
      console.error("[braspress-rastreio-sync] body invalido:", e);
      return fail("corpo da requisicao nao e JSON valido", 400);
    }

    const limiteBruto = body.limite === undefined || body.limite === null ? 50 : Number(body.limite);
    if (!Number.isInteger(limiteBruto) || limiteBruto <= 0) {
      return fail("limite invalido (inteiro > 0)", 400);
    }
    const nfFiltro = body.nf !== undefined && body.nf !== null ? String(body.nf).trim() : "";

    // 2. Fila
    let query = supabase
      .from("vw_braspress_rastreio_fila")
      .select("*")
      .in("fase", FASES)
      .order("dias_desde_nf", { ascending: true })
      .limit(nfFiltro ? 1000 : limiteBruto);
    if (nfFiltro) query = query.eq("nf_numero", nfFiltro);

    const { data: fila, error: errFila } = await query;
    if (errFila) return fail(`erro ao ler vw_braspress_rastreio_fila: ${errFila.message}`, 500);

    const itens = (fila ?? []) as Record<string, unknown>[];

    // 6. Log inicial
    const { data: logRow, error: errLog } = await supabase
      .from("integracoes_sync_log")
      .insert({ sistema: "braspress", tipo: "rastreio", status: "executando" })
      .select("id")
      .maybeSingle();
    if (errLog) {
      console.error("[braspress-rastreio-sync] falha ao abrir log:", errLog.message);
    } else {
      logId = (logRow as { id: string | number } | null)?.id ?? null;
    }

    let criados = 0;
    let atualizados = 0;
    let erros = 0;
    let divergencias = 0;
    const resultados: Resultado[] = [];

    // Mapa descricao -> codigo de ocorrencia (transportadora especifica + generica)
    const { data: ocorrenciaRows, error: errOcorrencias } = await supabase
      .from("transp_ocorrencia_tipo")
      .select("codigo, descricao, transportadora_id");
    if (errOcorrencias) {
      console.error("[braspress-rastreio-sync] falha ao ler transp_ocorrencia_tipo:", errOcorrencias.message);
    }
    const mapaOcorrencia = new Map<string, string>();
    for (const row of (ocorrenciaRows ?? []) as Record<string, unknown>[]) {
      const chave = `${row.transportadora_id ?? "null"}|${String(row.descricao ?? "").toLowerCase().trim()}`;
      if (!mapaOcorrencia.has(chave)) {
        mapaOcorrencia.set(chave, String(row.codigo ?? ""));
      }
    }
    function resolverOcorrenciaCodigo(transportadoraId: unknown, descricao: string | null): string | null {
      if (!descricao) return null;
      const normalizado = descricao.toLowerCase().trim();
      const especifica = mapaOcorrencia.get(`${transportadoraId ?? "null"}|${normalizado}`);
      if (especifica) return especifica;
      return mapaOcorrencia.get(`null|${normalizado}`) ?? null;
    }

    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const nfNumero = String(item.nf_numero ?? "").trim();
      const nfSerie = item.nf_serie ?? null;
      const transportadoraId = item.transportadora_id ?? null;

      if (i > 0) await dormir(250);

      const resultado: Resultado = {
        nf: nfNumero,
        cte: null,
        status: null,
        ultimo_evento: null,
        divergencia: false,
        erro: null,
      };

      try {
        if (!nfNumero) throw new Error("nf_numero vazio na fila");
        if (!transportadoraId) throw new Error("transportadora_id nulo na fila");

        const url = `${baseUrl}/v3/tracking/byNf/${cnpjTomador}/${encodeURIComponent(nfNumero)}/json`;
        const resp = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: `Basic ${basic}` },
        });
        const texto = await resp.text();
        let resposta: unknown;
        try {
          resposta = texto ? JSON.parse(texto) : null;
        } catch {
          resposta = texto;
        }

        if (!resp.ok) {
          throw new Error(
            `Braspress HTTP ${resp.status}: ${String(texto).slice(0, 300)}`,
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conhecimentos: any[] = Array.isArray((resposta as any)?.conhecimentos)
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (resposta as any).conhecimentos
          : [];

        let syncErro: string | null = null;
        const registro: Record<string, unknown> = {
          transportadora_id: transportadoraId,
          nf_numero: nfNumero,
          nf_serie: nfSerie,
          origem_dado: "api",
          sincronizado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        };
        if (item.pedido_id !== null && item.pedido_id !== undefined) {
          registro.pedido_id = item.pedido_id;
        }

        if (conhecimentos.length === 0) {
          syncErro = "sem conhecimento na Braspress";
          registro.sync_erro = syncErro;
        } else {
          if (conhecimentos.length > 1) {
            syncErro = `${conhecimentos.length} conhecimentos retornados — usado o de maior emissao`;
          }
          const escolhido = [...conhecimentos].sort((a, b) => {
            const ea = parseDataBr(a?.emissao) ?? "";
            const eb = parseDataBr(b?.emissao) ?? "";
            return ea < eb ? 1 : ea > eb ? -1 : 0;
          })[0];

          // TIMELINE-É-O-FATO
          const timeLine = Array.isArray(escolhido?.timeLine) ? escolhido.timeLine : [];
          const validos = timeLine
            .map((ev: Record<string, unknown>) => ({ ev, iso: parseDataBr(ev?.data) }))
            .filter((x: { iso: string | null }) => x.iso !== null) as {
              ev: Record<string, unknown>;
              iso: string;
            }[];
          validos.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
          const ultimo = validos.length > 0 ? validos[validos.length - 1] : null;
          const ultimoDesc = ultimo
            ? String(
                (ultimo.ev as Record<string, unknown>).descricao ??
                  (ultimo.ev as Record<string, unknown>).status ??
                  "",
              ).trim() || null
            : null;
          const ultimoEm = ultimo ? ultimo.iso : null;

          const cabecalhoEntregue =
            !!escolhido?.dataEntrega ||
            String(escolhido?.status ?? "").toUpperCase() === "FINALIZADO" ||
            contem(escolhido?.ultimaOcorrencia, "entrega realizada");
          const divergente =
            validos.length > 0 &&
            cabecalhoEntregue &&
            !contem(ultimoDesc, "entrega realizada");

          if (divergente) divergencias++;

          registro.cte_numero = semZerosEsquerda(escolhido?.numero);
          registro.destinatario = escolhido?.destinatario ?? null;
          registro.cidade_destino = escolhido?.cidade ?? null;
          registro.uf_destino = escolhido?.uf ?? null;
          registro.status = escolhido?.status ?? null;
          registro.data_entrega = parseDataBr(escolhido?.dataEntrega);
          registro.previsao_entrega = parseDataBr(escolhido?.previsaoEntrega);
          registro.valor_nf = escolhido?.valorMercantil ?? null;
          registro.valor_cte = escolhido?.totalFrete ?? null;
          registro.tipo_frete = escolhido?.tipoFrete ?? null;
          registro.ocorrencia_ativa = escolhido?.ultimaOcorrencia ?? null;
          registro.ocorrencia_data = parseDataBr(escolhido?.dataOcorrencia);
          registro.timeline_json = escolhido?.timeLine ?? null;
          registro.ultimo_evento_descricao = ultimoDesc;
          registro.ultimo_evento_em = ultimoEm;
          registro.divergencia_cabecalho_timeline = divergente;
          registro.sync_erro = syncErro;

          resultado.cte = (registro.cte_numero as string | null) ?? null;
          resultado.status = (registro.status as string | null) ?? null;
          resultado.ultimo_evento = ultimoDesc;
          resultado.divergencia = divergente;
        }

        const { data: existente, error: errSel } = await supabase
          .from("transp_rastreio_nf")
          .select("id")
          .eq("transportadora_id", transportadoraId)
          .eq("nf_numero", nfNumero)
          .eq("nf_serie", nfSerie)
          .maybeSingle();
        if (errSel) throw new Error(`erro ao consultar transp_rastreio_nf: ${errSel.message}`);

        const { error: errUp } = await supabase
          .from("transp_rastreio_nf")
          .upsert(registro, { onConflict: "transportadora_id,nf_numero,nf_serie" });
        if (errUp) throw new Error(`erro ao gravar transp_rastreio_nf: ${errUp.message}`);

        if (existente) atualizados++;
        else criados++;

        if (syncErro) resultado.erro = syncErro;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[braspress-rastreio-sync] NF ${nfNumero} falhou:`, msg);
        erros++;
        resultado.erro = msg;
        try {
          await supabase.from("transp_rastreio_nf").upsert(
            {
              transportadora_id: transportadoraId,
              nf_numero: nfNumero,
              nf_serie: nfSerie,
              origem_dado: "api",
              sincronizado_em: new Date().toISOString(),
              atualizado_em: new Date().toISOString(),
              sync_erro: msg.slice(0, 500),
            },
            { onConflict: "transportadora_id,nf_numero,nf_serie" },
          );
        } catch (e2) {
          console.error(
            `[braspress-rastreio-sync] falha ao gravar sync_erro da NF ${nfNumero}:`,
            e2 instanceof Error ? e2.message : String(e2),
          );
        }
      }

      resultados.push(resultado);
    }

    const duracao_ms = Date.now() - inicio;
    const statusLote = erros > 0 ? "erro" : "sucesso";
    const detalhes =
      `fila=${itens.length}; criados=${criados}; atualizados=${atualizados}; ` +
      `erros=${erros}; divergencias=${divergencias}`;

    if (logId !== null) {
      const { error: errUpdLog } = await supabase
        .from("integracoes_sync_log")
        .update({
          status: statusLote,
          registros_criados: criados,
          registros_atualizados: atualizados,
          registros_erro: erros,
          duracao_ms,
          detalhes,
        })
        .eq("id", logId);
      if (errUpdLog) {
        console.error("[braspress-rastreio-sync] falha ao fechar log:", errUpdLog.message);
      }
    }

    return new Response(
      JSON.stringify({
        ok: erros === 0,
        total_fila: itens.length,
        criados,
        atualizados,
        erros,
        divergencias,
        duracao_ms,
        resultados,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[braspress-rastreio-sync] erro nao tratado:", msg);
    if (logId !== null) {
      try {
        await supabase
          .from("integracoes_sync_log")
          .update({
            status: "erro",
            duracao_ms: Date.now() - inicio,
            detalhes: `erro nao tratado: ${msg}`,
          })
          .eq("id", logId);
      } catch (e2) {
        console.error(
          "[braspress-rastreio-sync] falha ao registrar erro no log:",
          e2 instanceof Error ? e2.message : String(e2),
        );
      }
    }
    return fail(`erro nao tratado: ${msg}`, 500);
  }
});
