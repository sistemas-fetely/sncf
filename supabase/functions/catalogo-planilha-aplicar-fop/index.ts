// Applies catalog cells of both owners (produto and operacoes/fiscal) in the FOP (Mapa v2); the SNCF
// only marks them via fn_catalogo_resolver (p_dono per owner) after the FOP confirms, because the
// FOP mirror (fn_upsert_catalogo) overwrote fiscal fields written directly in sncf_produtos.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { type CelulaFop, type ItemFop } from "../_shared/catalogo-planilha/aplicar-fop.ts";
import { pegarTrava } from "../_shared/catalogo-planilha/trava.ts";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";
import { agruparMensagens, ErroCatalogo } from "../_shared/catalogo-planilha/mensagens.ts";
import { criarAplicadorAutomatico, chaveDimensao } from '../_shared/catalogo-dimensao/automaticas.ts';
import { cadastrarDimensao } from '../_shared/catalogo-dimensao/cadastrar.ts';
import { aplicarComDimensoes, type ResultadoAjuste, type ResultadoSncf } from '../_shared/catalogo-dimensao/renomear.ts';
import { ROTINA_CATALOGO, usuarioAuditoria } from '../_shared/catalogo-dimensao/auditoria.ts';
import { normalizarCodigo } from '../_shared/catalogo-planilha/comparacao.ts';
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const Body = z.object({ leitura_id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(5000) }).strict();
// Daily cron (after the reading): applies on its own only clean changes (tipo mudanca, no error).
// Conflicts and errors stay on the screen for a human.
const BodyAutomatico = z.object({ automatico: z.literal(true) }).strict();
const ROTINA = ROTINA_CATALOGO;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const kindOriginal = (campo: string) => campo === 'colecao' ? 'colecao' : campo === 'grupo' ? 'grupo' : 'cor';
const normNome = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const msg = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, erro: "Sessão obrigatória." }, 401);
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const cron = !!req.headers.get("x-cron-secret");
  let trava: Awaited<ReturnType<typeof pegarTrava>> | null = null;
  try {
    let leitura_id: string;
    let ids: string[];
    let quem: { id: string; nome: string };
    const ref = async () => {
      const r = await sb.from("catalogo_planilha_leitura").select("id,storage_path,origem_chave").eq("ambiente", "oficial").in("status", ["comparada", "aplicada_parcial", "aplicada"]).order("lida_em", { ascending: false }).limit(1).maybeSingle();
      if (r.error) throw r.error;
      return r;
    };
    let leitura: Awaited<ReturnType<typeof ref>>;
    if (cron) {
      const negado = await gateCronOuSessao(req, sb, corsHeaders);
      if (negado) return negado;
      if (!BodyAutomatico.safeParse(await req.json().catch(() => null)).success) return json({ ok: false, erro: "Pedido inválido." }, 400);
      quem = ROTINA;
      trava = await pegarTrava((nome, args) => sb.rpc(nome, args), "aplicacao", null, true);
      leitura = await ref();
      if (!leitura.data) return json({ ok: true, automatico: true, aplicadas: 0, conflitos: 0, erros: 0, lotes: 0 });
      leitura_id = leitura.data.id;
      ids = [];
      for (let de = 0; ; de += 1000) {
        const r = await sb.from("catalogo_planilha_mudanca").select("id").eq("leitura_id", leitura_id).eq("status", "pendente").eq("tipo", "mudanca").is("erro", null).order("id").range(de, de + 999);
        if (r.error) throw r.error;
        ids.push(...(r.data ?? []).map(x => x.id as string));
        if ((r.data?.length ?? 0) < 1000) break;
      }
      ids = ids.slice(0, 5000);
      if (!ids.length) return json({ ok: true, automatico: true, aplicadas: 0, conflitos: 0, erros: 0, lotes: 0 });
    } else {
      const { data: u, error: eU } = await usuario.auth.getUser(authHeader.slice(7));
      if (eU || !u.user) return json({ ok: false, erro: "Sessão inválida." }, 401);
      const perm = await usuario.rpc("usuario_tem_acao", { p_slug: "acao.produto_importar_planilha_cadastro" });
      if (perm.error) throw perm.error;
      if (perm.data !== true) return json({ ok: false, erro: "Sem permissão para aplicar catálogo." }, 403);
      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return json({ ok: false, erro: "Pedido inválido.", detalhes: parsed.error.flatten().fieldErrors }, 400);
      ({ leitura_id, ids } = parsed.data);
      trava = await pegarTrava((nome, args) => sb.rpc(nome, args), "aplicacao", u.user.id);
      leitura = await ref();
      if (leitura.data?.id !== leitura_id) return json({ ok: false, erro: "Há uma leitura mais nova. Recarregue a tela.", codigo: "leitura_mais_nova" }, 409);
      const perfil = await sb.from("profiles").select("full_name").eq("user_id", u.user.id).maybeSingle();
      if (perfil.error) throw perfil.error;
      quem = { id: u.user.id, nome: perfil.data?.full_name || u.user.email || u.user.id };
    }

    const celulas: CelulaFop[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const r = await sb.from("catalogo_planilha_mudanca").select("id,cod_cadastro,campo,dono,tipo,status,leitura_id,valor_planilha,valor_sistema").in("id", ids.slice(i, i + 200));
      if (r.error) throw r.error;
      celulas.push(...(r.data ?? []) as CelulaFop[]);
    }

    // Lojas do produto (produto_loja) não vão ao FOP: gravadas no SNCF por fn_catalogo_aplicar_lojas.
    const lojasQ = await sb.from("loja_dim").select("slug_planilha");
    if (lojasQ.error) throw lojasQ.error;
    const colunasLoja = new Set((lojasQ.data ?? []).map(l => l.slug_planilha as string));
    const idsLoja = celulas.filter(c => colunasLoja.has(c.campo)).map(c => c.id);
    const resumoLoja = { aplicadas: 0, conflitos: 0, erros: 0, lotes: 0, motivos: [] as string[] };
    if (idsLoja.length) {
      await trava?.verificar();
      const r = await sb.rpc("fn_catalogo_aplicar_lojas", { p_ids: idsLoja, p_ator: quem.id });
      if (r.error) throw new Error(`Lojas do produto: ${r.error.message}`);
      const d = r.data as { feitas: number; resultados: { ok: boolean; erro?: string }[] };
      resumoLoja.aplicadas = d.feitas; resumoLoja.lotes = 1;
      const falhas = d.resultados.filter(x => !x.ok);
      resumoLoja.erros = falhas.length;
      if (falhas.length) resumoLoja.motivos.push(`Lojas do produto: ${agruparMensagens(falhas.map(x => x.erro))}`);
      const fora = new Set(idsLoja);
      ids = ids.filter(id => !fora.has(id));
      celulas.splice(0, celulas.length, ...celulas.filter(c => !fora.has(c.id)));
      if (!ids.length) return json({ ok: true, ...(cron ? { automatico: true } : {}), ...resumoLoja });
    }

    const cfg = await sb.from("integracoes_config").select("config").eq("sistema", "fop").maybeSingle();
    if (cfg.error) throw cfg.error;
    const base = String((cfg.data?.config as Record<string, unknown> | null)?.fop_base_url ?? "").replace(/\/+$/, "");
    if (!/^https:\/\//.test(base)) return json({ ok: false, erro: "Endereço do FOP não configurado em TI › Integrações." }, 500);
    const tk = await sb.rpc("get_vault_secret", { p_name: "FOP_INBOUND_TOKEN" });
    if (tk.error || !tk.data) return json({ ok: false, erro: "FOP_INBOUND_TOKEN indisponível no Vault." }, 500);

    const originais = new Map<string, string>();
    let categoriasFop: Map<string, string> | undefined;
    const primeiros = new Map<string, string>();
    const chamar = async (rota: string, corpo: unknown) => {
        await trava?.verificar();
        const r = await fetch(`${base}/api/public/${rota}`, { method: "POST", headers: { Authorization: `Bearer ${tk.data}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(120_000) });
        const texto = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}${texto ? ` — ${texto.slice(0, 300)}` : ""}`);
        try { return JSON.parse(texto); } catch { throw new Error("FOP devolveu resposta que não é JSON"); }
    };
    // Same category precedence for provisioning, rename subdivisions and post-application cleanup.
    const categoria = async (item: ItemFop) => {
      if (!categoriasFop) {
        categoriasFop = new Map();
        const r = await sb.from('fop_categorias').select('id,nome');
        if (r.error) throw r.error;
        for (const c of r.data ?? []) categoriasFop.set(normNome(c.nome), c.id);
      }
      const celula = celulas.find(c => c.cod_cadastro === item.cod_cadastro && c.campo === 'categoria');
      let nome = typeof celula?.valor_planilha === 'string' && celula.valor_planilha.trim() ? celula.valor_planilha : undefined;
      if (!nome) {
        const p = await sb.from('sncf_produtos').select('categoria').eq('cod_cadastro', item.cod_cadastro).maybeSingle();
        if (p.error) throw p.error;
        nome = p.data?.categoria ?? undefined;
      }
      return nome ? categoriasFop.get(normNome(nome)) : undefined;
    };
    const automatico = criarAplicadorAutomatico({
      enviar: itens => chamar('catalogo-planilha-aplicar', { quem, leitura_id, celulas: itens }),
      listar: async () => {
        // Read the archived source, not SharePoint; preserve first spelling in spreadsheet order.
        if (!leitura.data?.storage_path) throw new Error('Cópia original da leitura indisponível.');
        const arquivo = await sb.storage.from('catalogo-planilha').download(leitura.data.storage_path);
        if (arquivo.error || !arquivo.data) throw new Error(arquivo.error?.message ?? 'Cópia da leitura indisponível.');
        const aba = leitura.data.origem_chave?.split('|').at(-1);
        if (!aba) throw new Error('Aba original da leitura indisponível.');
        const wb = XLSX.read(await arquivo.data.arrayBuffer(), { type: 'array', sheets: aba, cellStyles: false, cellHTML: false, cellFormula: false });
        const ws = wb.Sheets[aba];
        if (!ws) throw new Error('Aba da cópia original indisponível.');
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
        const slugs = (rows[2] ?? []).map(v => String(v ?? '').trim());
        for (const row of rows.slice(4)) {
          const cod = normalizarCodigo(row[slugs.indexOf('cod_cadastro')]);
          for (const campo of ['cor', 'cor_nome', 'colecao', 'grupo']) {
            const valor = row[slugs.indexOf(campo)];
            if (typeof valor !== 'string' || !valor.trim()) continue;
            originais.set(`${cod}:${campo}`, valor);
            const key = `${kindOriginal(campo)}:${chaveDimensao(valor)}`;
            if (!primeiros.has(key)) primeiros.set(key, valor);
          }
        }
        const out: { kind: string; nome: string }[] = [];
        // Audit is the durable per-reading map, including values not mirrored yet.
        for (let de = 0; ; de += 1000) {
          const r = await sb.from('audit_log').select('dados_depois').eq('acao', 'catalogo_dimensao_automatica').eq('justificativa', `Leitura ${leitura_id}`).order('created_at').range(de, de + 999);
          if (r.error) throw r.error;
          for (const a of r.data ?? []) { const d = a.dados_depois as { kind: string; nome: string }; out.push(d); }
          if ((r.data?.length ?? 0) < 1000) break;
        }
        for (const [tabela, kind] of [['fop_cores', 'cor'], ['fop_colecoes', 'colecao']] as const) {
          for (let de = 0; ; de += 1000) {
            const r = await sb.from(tabela).select('nome').order('nome').range(de, de + 999);
            if (r.error) throw r.error;
            out.push(...(r.data ?? []).map(d => ({ kind, nome: d.nome })));
            if ((r.data?.length ?? 0) < 1000) break;
          }
        }
        return out;
      },
      original: item => {
        const kind = kindOriginal(item.campo);
        const valor = primeiros.get(`${kind}:${chaveDimensao(String(item.valor_novo))}`) ?? originais.get(`${item.cod_cadastro}:${item.campo}`);
        if (!valor) throw new Error('Valor original da planilha não encontrado.');
        return valor;
      },
      categoria,
      cadastrar: (campo, nome, categoriaId) => cadastrarDimensao(campo, nome, quem, {
        chamarFop: corpo => chamar('catalogo-dimensao-cadastrar', corpo),
        auditar: async d => {
          if (!d.criado) return;
          const tabela = d.kind === 'cor' ? 'fop_cores' : d.kind === 'grupo' ? 'fop_grupos' : 'fop_colecoes';
          const r = await sb.from('dimensao_auto_provisionada').insert({ tabela, codigo: d.kind === 'grupo' ? d.id : d.nome, rotulo: d.nome, origem: 'planilha-catalogo', conferido: false }).select('id').single();
          if (r.error) throw new Error(`Dimensão cadastrada, mas registro automático falhou: ${r.error.message}`);
          const a = await sb.from('audit_log').insert({ user_id: usuarioAuditoria(quem, !cron), user_nome: quem.nome, acao: 'catalogo_dimensao_automatica', tabela: 'dimensao_auto_provisionada', registro_id: String(r.data.id), dados_depois: { ...d, leitura_id }, justificativa: `Leitura ${leitura_id}` });
          if (a.error) throw new Error(`Dimensão cadastrada, mas auditoria da leitura falhou: ${a.error.message}`);
        },
      }, categoriaId),
    });
    const tabelaDimensao = (campo: 'grupo' | 'colecao') => campo === 'grupo' ? 'produto_grupo_dim' : 'produto_colecao_cad_dim';
    const resumo = await aplicarComDimensoes(celulas, ids, leitura_id, quem, {
      categoria,
      ajustarFop: async corpo => await chamar('catalogo-dimensao-ajustar', corpo) as ResultadoAjuste,
      renomearSncf: async (campo, de, para, cods, desfazer) => {
        await trava?.verificar();
        const r = await sb.rpc('fn_catalogo_dim_renomear_sncf', { p_tabela: tabelaDimensao(campo), p_de: de, p_para: para, p_cods: cods, p_quem: quem, p_desfazer: desfazer });
        if (r.error) throw new Error(`Renomeação SNCF: ${r.error.message}`);
        return r.data as ResultadoSncf;
      },
      inativarSncf: async (campo, nome) => {
        await trava?.verificar();
        const r = await sb.rpc('fn_catalogo_dim_inativar_se_vazio_sncf', { p_tabela: tabelaDimensao(campo), p_rotulo: nome, p_quem: quem });
        if (r.error) throw new Error(`Inativação SNCF: ${r.error.message}`);
        return r.data as ResultadoSncf;
      },
      espelhar: async (campo, id, nome) => {
        await trava?.verificar();
        const r = await sb.from(campo === 'grupo' ? 'fop_grupos' : 'fop_colecoes').update({ nome }).eq('id', id).select('id');
        if (r.error) throw new Error(`FOP renomeou, mas o espelho não atualizou: ${r.error.message}`);
        if (r.data?.length !== 1) throw new Error(`FOP renomeou, mas a dimensão ${id} não existe no espelho.`);
      },
      chamarFop: corpo => automatico(corpo.celulas),
      concluir: async (lista, acao, dono) => {
        await trava?.verificar();
        const r = await sb.rpc("fn_catalogo_resolver", { p_ids: lista, p_acao: acao, p_escolha: "planilha", p_dono: dono, p_ator: quem.id });
        if (r.error) throw new Error(`FOP aplicou, mas o SNCF não registrou: ${r.error.message}`);
        const d = r.data as { ok: boolean; resultados: { ok: boolean; erro?: string }[] };
        if (!d.ok) throw new Error(`FOP aplicou, mas o SNCF não registrou: ${agruparMensagens(d.resultados.filter(x => !x.ok).map(x => x.erro))}`);
      },
      registrar: async pendentes => {
        await trava?.verificar();
        const r = await sb.rpc("fn_catalogo_fop_registrar", { p_resultados: pendentes });
        if (r.error) throw new Error(`Não foi possível registrar a resposta do FOP: ${r.error.message}`);
        if (r.data?.registradas !== pendentes.length) throw new Error(`FOP respondeu, mas o SNCF registrou só ${r.data?.registradas ?? 0} de ${pendentes.length} células.`);
      },
    });
    const juntos = { ...resumo, aplicadas: resumo.aplicadas + resumoLoja.aplicadas, erros: resumo.erros + resumoLoja.erros, lotes: resumo.lotes + resumoLoja.lotes, motivos: [...(resumo.motivos ?? []), ...resumoLoja.motivos] };
    return json({ ok: true, ...(cron ? { automatico: true } : {}), ...juntos });
  } catch (e) {
    console.error("[catalogo-planilha-aplicar-fop]", msg(e));
    return json({ ok: false, erro: msg(e), codigo: e instanceof ErroCatalogo ? e.codigo : undefined }, e instanceof ErroCatalogo ? e.status : 502);
  } finally {
    await trava?.soltar().catch(e => console.error("[catalogo-trava-soltar]", msg(e)));
  }
});
