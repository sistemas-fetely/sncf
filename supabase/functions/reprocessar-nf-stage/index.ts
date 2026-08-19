/**
 * Edge Function: reprocessar-nf-stage
 *
 * Reprocessa o XML já guardado das NFs em `nfs_stage` com o parser enriquecido
 * (ICMS, PIS, COFINS, base de cálculo, finNFe, refNFe, natureza da operação e,
 * por linha, CFOP e ICMS). O parse não era retroativo — sem ICMS o custo de
 * aterrissagem sai errado.
 *
 * REGRAS DURAS
 *  - Nunca sobrescreve nf_numero, nf_serie, nf_chave_acesso, fornecedor_cnpj,
 *    valor ou status. Divergência é REGISTRADA (retorno + reprocesso_erro).
 *  - qCom zero é dado legítimo (NF-e complementar). Nunca inferir quantidade.
 *  - Erro numa nota nunca aborta o lote (FAIL-LOUD por linha).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { parseXmlNfe, soDigitos } from "../_shared/parse-nfe-xml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ORCAMENTO_MS = 90_000;
const LIMITE_DEFAULT = 50;
const LIMITE_TETO = 200;

interface Divergencia {
  nfs_stage_id: string;
  nf_numero: string | null;
  campo: string;
  no_banco: unknown;
  no_xml: unknown;
}

type StageRow = {
  id: string;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave_acesso: string | null;
  fornecedor_cnpj: string | null;
  valor: number | null;
  status: string | null;
};

const CAMPOS_STAGE =
  "id, nf_numero, nf_serie, nf_chave_acesso, fornecedor_cnpj, valor, status";

const mesmoTexto = (a: unknown, b: unknown) => {
  const na = a === null || a === undefined ? "" : String(a).trim();
  const nb = b === null || b === undefined ? "" : String(b).trim();
  return na === nb;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido. Use POST." }, 405);

  const iniciou = Date.now();

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Autenticação: cron secret OU usuário super_admin -------------------
    const cronSecret = req.headers.get("x-cron-secret");
    let autorizado = false;

    if (cronSecret) {
      const { data: esperado } = await admin.rpc("get_vault_secret", {
        p_name: "SYNC_CRON_SECRET",
      });
      if (esperado && cronSecret === esperado) autorizado = true;
      if (!autorizado) return json({ error: "x-cron-secret inválido." }, 401);
    } else {
      const auth = req.headers.get("Authorization");
      if (!auth) return json({ error: "Não autorizado: token ausente." }, 401);
      const { data: userData, error: userErr } = await admin.auth.getUser(
        auth.replace("Bearer ", ""),
      );
      if (userErr || !userData?.user) {
        return json({ error: "Não autorizado: sessão inválida." }, 401);
      }
      const { data: ehSuper, error: roleErr } = await admin.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "super_admin",
      });
      if (roleErr) return json({ error: `Falha ao checar permissão: ${roleErr.message}` }, 500);
      if (!ehSuper) return json({ error: "Apenas super_admin pode reprocessar NFs." }, 403);
      autorizado = true;
    }
    if (!autorizado) return json({ error: "Não autorizado." }, 401);

    // ---- Contrato ----------------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.nfs_stage_ids)
      ? body.nfs_stage_ids.filter((v: unknown) => typeof v === "string" && v.trim())
      : [];
    const apenasSemIcms = body?.apenas_sem_icms === undefined ? true : !!body.apenas_sem_icms;
    const dryRun = !!body?.dry_run;
    const limiteBruto = Number(body?.limite ?? LIMITE_DEFAULT);
    const limite = Math.max(
      1,
      Math.min(LIMITE_TETO, Number.isFinite(limiteBruto) ? Math.floor(limiteBruto) : LIMITE_DEFAULT),
    );

    // ---- Seleção da fila ---------------------------------------------------
    let alvos: StageRow[] = [];
    let restantes = 0;

    if (ids.length) {
      const { data, error } = await admin
        .from("nfs_stage")
        .select(CAMPOS_STAGE)
        .in("id", ids.slice(0, limite));
      if (error) return json({ error: `Falha ao carregar NFs: ${error.message}` }, 500);
      alvos = (data ?? []) as StageRow[];
      restantes = Math.max(0, ids.length - alvos.length);
    } else {
      // Só notas com documento XML guardado.
      const { data: docs, error: docsErr } = await admin
        .from("nfs_stage_documentos")
        .select("nfs_stage_id")
        .eq("tipo", "xml");
      if (docsErr) return json({ error: `Falha ao listar XMLs: ${docsErr.message}` }, 500);
      const comXml = Array.from(new Set((docs ?? []).map((d: any) => d.nfs_stage_id))).filter(
        Boolean,
      ) as string[];
      if (!comXml.length) {
        return json({
          ok: true,
          processadas: 0,
          atualizadas: 0,
          com_erro: 0,
          divergencias: [],
          restantes: 0,
          dry_run: dryRun,
        });
      }

      let q = admin.from("nfs_stage").select(CAMPOS_STAGE, { count: "exact" }).in("id", comXml);
      if (apenasSemIcms) q = q.is("valor_icms", null);
      const { data, error, count } = await q.order("created_at", { ascending: true }).limit(limite);
      if (error) return json({ error: `Falha ao carregar NFs: ${error.message}` }, 500);
      alvos = (data ?? []) as StageRow[];
      restantes = Math.max(0, (count ?? alvos.length) - alvos.length);
    }

    const divergencias: Divergencia[] = [];
    let processadas = 0;
    let atualizadas = 0;
    let comErro = 0;
    let interrompidoPorTempo = 0;

    for (let i = 0; i < alvos.length; i++) {
      if (Date.now() - iniciou > ORCAMENTO_MS) {
        interrompidoPorTempo = alvos.length - i;
        break;
      }
      const nota = alvos[i];
      processadas++;

      try {
        // 1. XML mais recente desta nota
        const { data: docs, error: dErr } = await admin
          .from("nfs_stage_documentos")
          .select("storage_path, criado_em")
          .eq("nfs_stage_id", nota.id)
          .eq("tipo", "xml")
          .order("criado_em", { ascending: false })
          .limit(1);
        if (dErr) throw new Error(`consulta de documentos: ${dErr.message}`);
        const path = docs?.[0]?.storage_path;
        if (!path) throw new Error("nenhum documento tipo 'xml' com storage_path para esta NF.");

        // 2. Download
        const { data: blob, error: dlErr } = await admin.storage.from("nfs-stage").download(path);
        if (dlErr || !blob) throw new Error(`download do XML (${path}): ${dlErr?.message ?? "vazio"}`);
        const texto = await blob.text();
        if (!texto.trim()) throw new Error(`XML vazio em ${path}.`);

        // 3. Parse (fonte única compartilhada)
        const parsed = parseXmlNfe(texto);

        // Divergências em campos INTOCÁVEIS — registra, não sobrescreve.
        const divsNota: Divergencia[] = [];
        const conferir = (campo: string, noBanco: unknown, noXml: unknown, digitos = false) => {
          if (noXml === null || noXml === undefined || noXml === "") return;
          if (noBanco === null || noBanco === undefined || noBanco === "") return;
          const a = digitos ? soDigitos(noBanco) : noBanco;
          const b = digitos ? soDigitos(noXml) : noXml;
          if (!mesmoTexto(a, b)) {
            divsNota.push({ nfs_stage_id: nota.id, nf_numero: nota.nf_numero, campo, no_banco: noBanco, no_xml: noXml });
          }
        };
        conferir("nf_numero", nota.nf_numero, parsed.nf.numero);
        conferir("nf_serie", nota.nf_serie, parsed.nf.serie);
        conferir("nf_chave_acesso", nota.nf_chave_acesso, parsed.nf.chave_acesso, true);
        conferir("fornecedor_cnpj", nota.fornecedor_cnpj, parsed.cnpj_emitente, true);
        if (
          nota.valor !== null && nota.valor !== undefined &&
          parsed.nf.valor_total !== null &&
          Math.abs(Number(nota.valor) - parsed.nf.valor_total) > 0.02
        ) {
          divsNota.push({
            nfs_stage_id: nota.id,
            nf_numero: nota.nf_numero,
            campo: "valor",
            no_banco: Number(nota.valor),
            no_xml: parsed.nf.valor_total,
          });
        }
        divergencias.push(...divsNota);

        // 4. Itens: preserva as chaves já consumidas por
        // vw_nfs_stage_mercadoria_pendente (ncm, codigo_produto, ...) e soma as novas.
        const itens = parsed.linhas.map((l) => ({
          item_seq: l.item_seq,
          codigo_produto: l.codigo_nf,
          descricao: l.descricao,
          ncm: l.ncm,
          cfop: l.cfop,
          unidade: l.unidade,
          quantidade: l.quantidade,
          valor_unitario: l.valor_unit,
          valor_total: l.valor_total,
          ipi_aliq: l.ipi_aliq,
          ipi_valor: l.ipi_valor,
          icms_valor: l.icms_valor,
          icms_aliq: l.icms_aliq,
          icms_cst: l.icms_cst,
          origem_mercadoria: l.origem_mercadoria,
        }));

        const erroDivergencia = divsNota.length
          ? `Divergência com o XML (campos protegidos não sobrescritos): ${
            divsNota.map((d) => `${d.campo}: banco="${d.no_banco}" xml="${d.no_xml}"`).join("; ")
          }`
          : null;

        if (dryRun) {
          atualizadas++;
          continue;
        }

        const { error: upErr } = await admin
          .from("nfs_stage")
          .update({
            valor_icms: parsed.nf.valor_icms,
            valor_pis: parsed.nf.valor_pis,
            valor_cofins: parsed.nf.valor_cofins,
            base_icms: parsed.nf.base_icms,
            fin_nfe: parsed.nf.fin_nfe,
            nf_referenciada_chave: parsed.nf.nf_referenciada_chave,
            natureza_operacao: parsed.nf.natureza_operacao,
            itens,
            reprocessado_em: new Date().toISOString(),
            reprocesso_erro: erroDivergencia,
          })
          .eq("id", nota.id);
        if (upErr) throw new Error(`update: ${upErr.message}`);

        atualizadas++;
      } catch (e) {
        comErro++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[reprocessar-nf-stage] nfs_stage_id=${nota.id}:`, msg);
        if (!dryRun) {
          await admin
            .from("nfs_stage")
            .update({ reprocesso_erro: msg.slice(0, 2000), reprocessado_em: new Date().toISOString() })
            .eq("id", nota.id);
        }
      }
    }

    return json({
      ok: true,
      processadas,
      atualizadas,
      com_erro: comErro,
      divergencias,
      restantes: restantes + interrompidoPorTempo,
      dry_run: dryRun,
    });
  } catch (e) {
    console.error("[reprocessar-nf-stage] falha geral:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
