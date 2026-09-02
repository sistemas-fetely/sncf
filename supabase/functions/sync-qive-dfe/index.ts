/**
 * sync-qive-dfe — captura documentos fiscais de ENTRADA na API da Qive (ex-Arquivei)
 * e grava em `nfs_stage`.
 *
 * SEM CRON: invocação manual apenas. A primeira execução real precisa ser observada.
 *
 * Credenciais NUNCA no código: lidas do vault via RPC `get_vault_secret`.
 *
 * NOTA DE ESQUEMA: `integracoes_sync_cursor.ultima_pagina` é `integer` e o cursor da
 * Qive é uma string opaca — por isso o cursor textual vive em `ultimo_bling_id`
 * (única coluna text livre da tabela) e `ultima_pagina` guarda a contagem de páginas
 * lidas na última execução.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Entidade = "nfe" | "cte" | "nfse";
const ENTIDADES: Entidade[] = ["nfe", "cte", "nfse"];

const MAX_PAGINAS = 20;
const LIMIT_POR_PAGINA = 50; // máximo aceito pela API v1
const RATE_LIMIT_PISO = 5;
const ORCAMENTO_MS = 110_000; // folga antes do limite da edge function
const TRAVA_MINUTOS = 15;
const CNPJ_FETELY_PREFIXO = "63591078";

interface ResumoEntidade {
  encontrados: number;
  gravados: number;
  ja_existiam: number;
  com_referencia: number;
  erros: number;
  paginas: number;
  cursor_final: string | null;
  interrompido_por?: string;
  erro?: string;
}

interface DocQive {
  chave: string | null;
  xmlBase64: string | null;
}

const novoResumo = (): ResumoEntidade => ({
  encontrados: 0,
  gravados: 0,
  ja_existiam: 0,
  com_referencia: 0,
  erros: 0,
  paginas: 0,
  cursor_final: null,
});

/* ---------------------------------------------------------------- adaptadores */

function extrairCursor(nextUrl: string | null): string | null {
  if (!nextUrl) return null;
  try {
    return new URL(nextUrl).searchParams.get("cursor");
  } catch {
    return null;
  }
}

/** Envelope v1 (sandbox + produção): { data: [{access_key, xml}], page: {next} } */
function adaptarV1(json: any): { docs: DocQive[]; nextUrl: string | null; cursor: string | null; total: number | null } {
  const docs: DocQive[] = (Array.isArray(json?.data) ? json.data : []).map((d: any) => ({
    chave: typeof d?.access_key === "string" ? d.access_key : null,
    xmlBase64: typeof d?.xml === "string" ? d.xml : null,
  }));
  const nextUrl = typeof json?.page?.next === "string" && json.page.next ? json.page.next : null;
  const cursor = extrairCursor(nextUrl);
  return { docs, nextUrl, cursor, total: typeof json?.count === "number" ? json.count : null };
}

/**
 * Envelope v2 (só existe em produção — NÃO usado hoje):
 * { Nfes: [...], Paginator: "[...]" (string com array JSON), Total: n }
 * Mantido isolado para trocar de transporte sem mexer no resto.
 */
function adaptarV2(json: any): { docs: DocQive[]; next: string | null; total: number | null } {
  const lista = Array.isArray(json?.Nfes) ? json.Nfes : [];
  const docs: DocQive[] = lista.map((d: any) => ({
    chave: typeof d?.access_key === "string" ? d.access_key : (d?.AccessKey ?? null),
    xmlBase64: typeof d?.xml === "string" ? d.xml : (d?.Xml ?? null),
  }));
  let next: string | null = null;
  if (typeof json?.Paginator === "string") {
    try {
      const p = JSON.parse(json.Paginator);
      if (Array.isArray(p) && p.length > 0) next = String(p[p.length - 1]);
    } catch {
      next = null;
    }
  }
  return { docs, next, total: typeof json?.Total === "number" ? json.Total : null };
}

/* ------------------------------------------------------------------ parse XML */

function decodificarBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

const m1 = (xml: string, re: RegExp): string | null => {
  const r = xml.match(re);
  return r ? r[1].trim() : null;
};

const num = (v: string | null): number | null => {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * dhEmi vem em UTC (`2025-10-25T14:30:00Z`) ou com offset (`-03:00`).
 * A coluna é `date` e o banco roda em America/Sao_Paulo: converter sem cuidado
 * erra um dia em toda nota emitida entre 21h e meia-noite.
 * Sem offset (dados fictícios do Sandbox) → é horário local, não converter.
 */
function dataEmissaoLocal(bruto: string | null): string | null {
  if (!bruto) return null;
  const s = bruto.trim();
  const temOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (!temOffset) return s.slice(0, 10) || null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10) || null;
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

interface XmlParsed {
  chave: string | null;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  natureza_operacao: string | null;
  fin_nfe: number | null;
  tp_nf: string | null;
  referenciada: string | null;
  cnpj: string | null;
  razao_social: string | null;
  valor: number | null;
  itens: Record<string, unknown>[];
}

function parseXml(xml: string): XmlParsed {
  // NÃO usar <chNFe>: essa tag só aparece em protNFe e dentro de refNFe.
  const chave = m1(xml, /Id\s*=\s*"NFe(\d{44})"/);

  const emitBloco = xml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? "";
  const totalBloco = xml.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/)?.[1] ?? xml;

  const itens: Record<string, unknown>[] = [];
  for (const det of xml.matchAll(/<det\b[^>]*>([\s\S]*?)<\/det>/g)) {
    const b = det[1];
    itens.push({
      codigo: m1(b, /<cProd>([^<]*)<\/cProd>/),
      descricao: m1(b, /<xProd>([^<]*)<\/xProd>/),
      ncm: m1(b, /<NCM>([^<]*)<\/NCM>/),
      cfop: m1(b, /<CFOP>([^<]*)<\/CFOP>/),
      unidade: m1(b, /<uCom>([^<]*)<\/uCom>/),
      quantidade: num(m1(b, /<qCom>([^<]*)<\/qCom>/)),
      valor_unitario: num(m1(b, /<vUnCom>([^<]*)<\/vUnCom>/)),
      valor_total: num(m1(b, /<vProd>([^<]*)<\/vProd>/)),
    });
  }

  return {
    chave,
    numero: m1(xml, /<nNF>([^<]*)<\/nNF>/),
    serie: m1(xml, /<serie>([^<]*)<\/serie>/),
    data_emissao: dataEmissaoLocal(
      m1(xml, /<dhEmi>([^<]*)<\/dhEmi>/) ?? m1(xml, /<dEmi>([^<]*)<\/dEmi>/),
    ),
    natureza_operacao: m1(xml, /<natOp>([^<]*)<\/natOp>/),
    fin_nfe: num(m1(xml, /<finNFe>(\d)<\/finNFe>/)),
    tp_nf: m1(xml, /<tpNF>(\d)<\/tpNF>/),
    referenciada: m1(xml, /<refNFe>(\d{44})<\/refNFe>/),
    cnpj: m1(emitBloco, /<CNPJ>(\d{14})<\/CNPJ>/),
    razao_social: m1(emitBloco, /<xNome>([^<]*)<\/xNome>/),
    valor: num(m1(totalBloco, /<vNF>([\d.]+)<\/vNF>/)),
    itens,
  };
}

/* --------------------------------------------------------------------- main */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let ambiente: "sandbox" | "producao" = "sandbox";
    try {
      const body = await req.json();
      if (body?.ambiente === "producao") ambiente = "producao";
    } catch {
      // sem body → sandbox
    }

    const base =
      ambiente === "producao"
        ? "https://api.arquivei.com.br"
        : "https://sandbox-api.arquivei.com.br";
    const nomeId = ambiente === "producao" ? "qive_api_id_prod" : "qive_api_id_sandbox";
    const nomeKey = ambiente === "producao" ? "qive_api_key_prod" : "qive_api_key_sandbox";

    const lerSecret = async (nome: string): Promise<string | null> => {
      const { data, error } = await supabase.rpc("get_vault_secret", { p_name: nome });
      if (error) throw new Error(`Falha ao ler secret ${nome}: ${error.message}`);
      const v = typeof data === "string" ? data.trim() : "";
      return v === "" ? null : v;
    };

    const apiId = await lerSecret(nomeId);
    const apiKey = await lerSecret(nomeKey);
    if (!apiId || !apiKey) {
      return json(
        {
          ok: false,
          ambiente,
          error:
            ambiente === "producao"
              ? "Credenciais de produção da Qive não foram cadastradas no vault (qive_api_id_prod / qive_api_key_prod). Cadastre antes de rodar em produção."
              : `Credenciais da Qive ausentes no vault (${nomeId} / ${nomeKey}).`,
        },
        400,
      );
    }

    const headers = {
      "X-API-ID": apiId,
      "X-API-KEY": apiKey,
      "X-Use-ApiGateway": "always",
      "Content-Type": "application/json",
    };

    const por_entidade: Record<Entidade, ResumoEntidade> = {
      nfe: novoResumo(),
      cte: novoResumo(),
      nfse: novoResumo(),
    };

    for (const entidade of ENTIDADES) {
      const resumo = por_entidade[entidade];
      try {
        // ---- cursor + trava
        const { data: cur, error: curErr } = await supabase
          .from("integracoes_sync_cursor")
          .select("id, ultima_pagina, ultimo_bling_id, ultima_data_corte, em_execucao, iniciado_em, total_processado")
          .eq("sistema", "qive")
          .eq("entidade", entidade)
          .maybeSingle();
        if (curErr) throw new Error(`cursor: ${curErr.message}`);
        if (!cur) throw new Error(`cursor inexistente para qive/${entidade}`);

        if (cur.em_execucao && cur.iniciado_em) {
          const idadeMin = (Date.now() - new Date(cur.iniciado_em).getTime()) / 60000;
          if (idadeMin < TRAVA_MINUTOS) {
            resumo.erro = `Já existe execução em andamento para ${entidade} (iniciada há ${idadeMin.toFixed(1)} min). Abortado para evitar concorrência.`;
            continue;
          }
        }

        await supabase
          .from("integracoes_sync_cursor")
          .update({ em_execucao: true, iniciado_em: new Date().toISOString() })
          .eq("id", cur.id);

        let cursor: string | null = cur.ultimo_bling_id ?? null;
        const de = cur.ultima_data_corte
          ? new Date(cur.ultima_data_corte)
          : new Date(Date.now() - 30 * 24 * 3600 * 1000);
        const ate = new Date();

        try {
          for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
            if (Date.now() - t0 > ORCAMENTO_MS) {
              resumo.interrompido_por = "orcamento_de_tempo";
              break;
            }

            let resp: Response;
            if (entidade === "nfe") {
              const qs = new URLSearchParams({
                limit: String(LIMIT_POR_PAGINA),
                "created_at[from]": de.toISOString(),
                "created_at[to]": ate.toISOString(),
              });
              if (cursor) qs.set("cursor", cursor);
              resp = await fetch(`${base}/v1/nfe/received?${qs.toString()}`, {
                method: "GET",
                headers,
              });
            } else {
              // cte/nfse: rotas POST /v1/dfe/{entidade} — NÃO validadas (404 no sandbox)
              resp = await fetch(`${base}/v1/dfe/${entidade}`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  limit: LIMIT_POR_PAGINA,
                  cursor: cursor ?? undefined,
                  created_at: { from: de.toISOString(), to: ate.toISOString() },
                }),
              });
            }

            if (!resp.ok) {
              const corpo = await resp.text();
              throw new Error(`HTTP ${resp.status} em ${entidade}: ${corpo.slice(0, 400)}`);
            }

            const payload = await resp.json();
            const { docs, cursor: proximoCursor } = adaptarV1(payload);
            resumo.paginas++;
            resumo.encontrados += docs.length;

            for (const doc of docs) {
              try {
                let p: XmlParsed | null = null;
                if (doc.xmlBase64) {
                  try {
                    p = parseXml(decodificarBase64(doc.xmlBase64));
                  } catch (e) {
                    console.error(`[${entidade}] XML ilegível (${doc.chave}):`, e);
                    resumo.erros++;
                  }
                }

                const chave = doc.chave ?? p?.chave ?? null;
                if (!chave) {
                  resumo.erros++;
                  console.error(`[${entidade}] documento sem chave de acesso, ignorado`);
                  continue;
                }

                const numero = p?.numero ?? null;

                // ÍNDICE-PARCIAL-VAI-POR-RPC: `uniq_nfs_stage_chave_ativa` é
                // parcial (WHERE status <> descartada/duplicata) e o PostgREST
                // não infere índice parcial em ON CONFLICT — o upsert falhava
                // com 42P10 e nada era gravado. A RPC testa a existência antes.
                const { data: r, error: rpcErr } = await supabase.rpc(
                  "fn_nfs_stage_inserir_qive",
                  {
                    p_fonte: "qive",
                    p_tipo_documento: entidade,
                    p_nf_chave_acesso: chave,
                    p_nf_numero: numero,
                    p_nf_serie: p?.serie ?? null,
                    p_nf_data_emissao: p?.data_emissao ?? null,
                    p_fornecedor_cnpj: p?.cnpj ? p.cnpj.replace(/\D/g, "") : null,
                    p_fornecedor_razao_social: p?.razao_social ?? null,
                    p_valor: p?.valor ?? null,
                    p_natureza_operacao: p?.natureza_operacao ?? null,
                    p_fin_nfe: p?.fin_nfe ?? null,
                    p_nf_referenciada_chave: p?.referenciada ?? null,
                    p_itens: p?.itens ?? null,
                    p_descricao: `${entidade.toUpperCase()} ${numero ?? chave.slice(-9)} · Qive`,
                  },
                );

                if (rpcErr) {
                  anotarErro(resumo, `RPC falhou (${chave}): ${rpcErr.message}`);
                  console.error(`[${entidade}] RPC falhou (${chave}):`, rpcErr.message);
                  continue;
                }

                const ret = r as
                  | { ok: boolean; ja_existia?: boolean; id?: string; erro?: string; sqlstate?: string }
                  | null;

                if (!ret || ret.ok === false) {
                  const msg = ret?.erro ?? "retorno vazio da RPC";
                  anotarErro(resumo, `${chave}: ${msg}`);
                  console.error(`[${entidade}] insercao recusada (${chave}):`, msg);
                  continue;
                }

                if (ret.ja_existia === true) {
                  resumo.ja_existiam++;
                } else {
                  resumo.gravados++;
                  if (p?.referenciada) resumo.com_referencia++;
                  // QIVE-MANDA-EM-NOTA-DE-FORNECEDOR: emitente externo é fonte
                  // autoritativa; quem chegou primeiro fica.
                  if (p?.cnpj && !p.cnpj.startsWith(CNPJ_FETELY_PREFIXO)) {
                    console.log(`[${entidade}] nota de fornecedor externo: ${chave}`);
                  }
                }
              } catch (e) {
                anotarErro(resumo, e instanceof Error ? e.message : String(e));
                console.error(`[${entidade}] erro no documento:`, e);
              }

            }

            if (docs.length === 0) {
              resumo.interrompido_por = "pagina_vazia";
              break;
            }
            if (proximoCursor && proximoCursor === cursor) {
              resumo.interrompido_por = "cursor_repetido";
              break;
            }

            cursor = proximoCursor;
            resumo.cursor_final = cursor;

            const restante = Number(resp.headers.get("X-RateLimit-Remaining") ?? "999");
            if (Number.isFinite(restante) && restante < RATE_LIMIT_PISO) {
              resumo.interrompido_por = "rate_limit";
              break;
            }
            if (!proximoCursor) break;
          }
        } finally {
          await supabase
            .from("integracoes_sync_cursor")
            .update({
              em_execucao: false,
              ultimo_bling_id: cursor,
              ultima_pagina: resumo.paginas,
              ultima_data_corte: ate.toISOString(),
              total_processado: (cur.total_processado ?? 0) + resumo.gravados,
            })
            .eq("id", cur.id);
        }
      } catch (e) {
        resumo.erro = e instanceof Error ? e.message : String(e);
        console.error(`[sync-qive-dfe] entidade ${entidade} falhou:`, e);
      }
    }

    return json({ ok: true, ambiente, por_entidade, duracao_ms: Date.now() - t0 });
  } catch (e) {
    console.error("[sync-qive-dfe] erro geral:", e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e), duracao_ms: Date.now() - t0 },
      500,
    );
  }
});
