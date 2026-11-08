import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";
import { exigirAcao } from "../_shared/permissao-acao.ts";
import { obterArquivoMicrosoft } from "../_shared/catalogo-planilha/microsoft.ts";
import { compararCelula, donoCampo, normalizarCodigo, normalizarValor, somenteLeitura, tiposColunasProduto, validarSlugs, vazio, type CampoCatalogo } from "../_shared/catalogo-planilha/comparacao.ts";

const Body = z.object({ acao: z.enum(["ler", "testar"]).default("ler"), arquivo_teste: z.string().regex(/^testes\/[\w./-]+\.xlsx$/).optional(), aba: z.string().min(1).max(100).optional(), cenario_teste: z.record(z.record(z.unknown())).optional() }).strict();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const erroTexto = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  let leitura: string | null = null;
  let testando = false;
  let ator: string | null = null;
  let statusErro = "erro";
  let autorizado = false;
  let testarConexao = false;
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    testarConexao = body.acao === "testar";
    const cron = !!req.headers.get("x-cron-secret");
    const negado = await gateCronOuSessao(req, sb, corsHeaders); if (negado) return negado;
    if (!cron) {
      const a = await exigirAcao(sb, req.headers.get("Authorization"), body.acao === "testar" ? "acao.credenciais_integracao.gravar" : "acao.produto_importar_planilha_cadastro", "ler catálogo");
      if (!a.ok) return json({ ok: false, erro: a.erro }, a.status);
      ator = a.userId;
    }
    autorizado = true;
    if (body.arquivo_teste || body.cenario_teste) {
      if (cron || !ator) throw new Error("Teste requer sessão de super administrador.");
      const r = await sb.rpc("has_role", { _user_id: ator, _role: "super_admin" });
      if (r.error || r.data !== true) return json({ ok: false, erro: "Teste exclusivo de super administrador." }, 403);
      if (!body.arquivo_teste) throw new Error("Cenário fake requer arquivo em testes/.");
      testando = true;
    }
    let arquivo;
    if (body.arquivo_teste) {
      const down = await sb.storage.from("catalogo-planilha").download(body.arquivo_teste);
      if (down.error || !down.data) throw down.error ?? new Error("Arquivo de teste ausente.");
      arquivo = { bytes: new Uint8Array(await down.data.arrayBuffer()), etag: null, aba: body.aba ?? "cadastro", nome: body.arquivo_teste, origemChave: "teste:" + body.arquivo_teste };
    } else arquivo = await obterArquivoMicrosoft(sb);
    if (body.acao === "testar") {
      const log = await sb.from("credenciais_integracao_log").insert({ nome: "m365_conexao", acao: "atualizado", descricao: `Teste de conexão OK — arquivo ${arquivo.nome}`, por: ator });
      if (log.error) throw log.error;
      return json({ ok: true, mensagem: `Conexão OK — ${arquivo.nome}`, bytes: arquivo.bytes.length });
    }
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", arquivo.bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
    const ambiente = testando ? "teste" : "oficial";
    const anterior = await sb.from("catalogo_planilha_leitura").select("id,hash,status").eq("ambiente", ambiente).eq("origem_chave", arquivo.origemChave).in("status", ["comparada", "aplicada_parcial", "aplicada", "sem_mudanca"]).order("lida_em", { ascending: false }).limit(1).maybeSingle();
    if (anterior.error) throw anterior.error;
    const id = crypto.randomUUID();
    const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const path = `${testando ? "testes/leituras" : "historico"}/${dia}/${id}.xlsx`;
    const up = await sb.storage.from("catalogo-planilha").upload(path, arquivo.bytes, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (up.error) throw up.error;
    const ins = await sb.from("catalogo_planilha_leitura").insert({ id, origem: cron ? "cron" : "manual", hash, etag: arquivo.etag, storage_path: path, ambiente, origem_chave: arquivo.origemChave, criado_por: ator });
    if (ins.error) throw ins.error; leitura = id;
    if (anterior.data?.hash === hash) {
      const upd = await sb.from("catalogo_planilha_leitura").update({ status: "sem_mudanca", totais: { leitura_referencia: anterior.data.id } }).eq("id", id); if (upd.error) throw upd.error;
      return json({ ok: true, id, status: "sem_mudanca", testando });
    }
    const fichaQ = await sb.from("produto_ficha_nascimento").select("campo,importavel_planilha,onde_resolver,contexto_planilha");
    if (fichaQ.error) throw fichaQ.error;
    const ficha = fichaQ.data as CampoCatalogo[];
    const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const esquemaResposta = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/`, {
      headers: { apikey: chaveServico, Authorization: `Bearer ${chaveServico}`, Accept: "application/openapi+json" },
    });
    if (!esquemaResposta.ok) throw new Error(`Não foi possível consultar os tipos das colunas (${esquemaResposta.status}).`);
    const tiposProduto = tiposColunasProduto(await esquemaResposta.json());
    const colunasProduto = Object.keys(tiposProduto);
    statusErro = "layout_quebrado";
    const wb = XLSX.read(arquivo.bytes, { type: "array" });
    const ws = wb.Sheets[arquivo.aba]; if (!ws) throw new Error(`Layout quebrado: aba ${arquivo.aba} inexistente.`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    const slugs = (rows[2] ?? []).map(v => String(v ?? "").trim());
    const layout = validarSlugs(slugs, ficha, colunasProduto);
    statusErro = "erro";
    const codCol = slugs.indexOf("cod_cadastro");
    const linhas = rows.slice(4).map((r, i) => ({ linha: i + 5, cod: normalizarCodigo(r[codCol]), valores: Object.fromEntries(slugs.map((s, j) => [s, r[j]]).filter(([s]) => !!s)) })).filter(r => r.cod || Object.values(r.valores).some(v => !vazio(v)));
    const cods = [...new Set(linhas.map(r => r.cod).filter(Boolean))];
    const produtos = new Map<string, Record<string, unknown>>();
    const bases = new Map<string, unknown>();
    for (let i = 0; i < cods.length; i += 150) {
      const bloco = cods.slice(i, i + 150);
      const p = await sb.from("sncf_produtos").select("*").in("cod_cadastro", bloco); if (p.error) throw p.error;
      for (const x of p.data ?? []) produtos.set(String(x.cod_cadastro), x);
      if (!testando) for (let de = 0; ; de += 1000) {
        const b = await sb.from("catalogo_planilha_base").select("*").in("cod_cadastro", bloco).order("cod_cadastro").order("campo").range(de, de + 999); if (b.error) throw b.error;
        for (const x of b.data ?? []) bases.set(`${x.cod_cadastro}|${x.campo}`, x.valor);
        if (!b.data || b.data.length < 1000) break;
      }
    }
    const mudancas: Record<string, unknown>[] = [], baseInicial: Record<string, unknown>[] = [];
    const vistos = new Set<string>();
    for (const linha of linhas) {
      if (vistos.has(linha.cod)) { mudancas.push({ cod_cadastro: linha.cod, campo: `_linha_${linha.linha}`, dono: "operacoes", tipo: "erro", erro: `Código repetido na linha ${linha.linha}` }); continue; }
      vistos.add(linha.cod);
      const produto = produtos.get(linha.cod);
      if (!produto) { mudancas.push({ cod_cadastro: linha.cod || `(linha ${linha.linha})`, campo: "cod_cadastro", dono: "operacoes", tipo: "sem_cadastro", erro: "Código não existe no SNCF; encaminhar à Importação de PI." }); continue; }
      for (const campo of ficha) {
        if (somenteLeitura(campo.campo) || !campo.importavel_planilha || vazio(linha.valores[campo.campo])) continue;
        const key = `${linha.cod}|${campo.campo}`;
        const fake = body.cenario_teste?.[key];
        const sistema = fake && "sistema" in fake ? fake.sistema : produto[campo.campo];
        const base = fake && "base" in fake ? fake.base : bases.has(key) ? bases.get(key) : sistema;
        const tipoColuna = tiposProduto[campo.campo] ?? "text";
        if (!bases.has(key)) baseInicial.push({ cod_cadastro: linha.cod, campo: campo.campo, valor: normalizarValor(sistema, tipoColuna) });
        const planilha = normalizarValor(linha.valores[campo.campo], tipoColuna);
        const tipo = compararCelula(base, planilha, sistema, tipoColuna);
        if (tipo) {
          let erroCelula: string | null = null;
          if (donoCampo(campo) === "operacoes") {
            const validar = await sb.rpc("fn_produto_formato_validar_patch", { p_cod_cadastro: linha.cod, p_campos: { [campo.campo]: planilha } });
            if (validar.error) erroCelula = validar.error.message;
            else if (validar.data?.length) erroCelula = validar.data.map((v: { motivo: string }) => v.motivo).join("; ");
          }
          mudancas.push({ cod_cadastro: linha.cod, campo: campo.campo, dono: donoCampo(campo), valor_base: normalizarValor(base, tipoColuna), valor_planilha: planilha, valor_sistema: normalizarValor(sistema, tipoColuna), tipo: erroCelula ? "erro" : tipo, erro: erroCelula });
        }
      }
    }
    const totais = { colunas_ignoradas: layout.colunas_ignoradas, linhas: linhas.length, primeira_base: baseInicial.length, testando, mudanca: mudancas.filter(m => m.tipo === "mudanca").length, conflito: mudancas.filter(m => m.tipo === "conflito").length, ja_igual: mudancas.filter(m => m.tipo === "ja_igual").length, sem_cadastro: mudancas.filter(m => m.tipo === "sem_cadastro").length, erro: mudancas.filter(m => m.tipo === "erro").length };
    const done = await sb.rpc("fn_catalogo_leitura_concluir", { p_leitura_id: id, p_status: "comparada", p_totais: totais, p_mudancas: mudancas, p_base_inicial: baseInicial }); if (done.error) throw done.error;
    return json({ ok: true, id, status: "comparada", totais, testando });
  } catch (e) {
    const erro = erroTexto(e);
    if (autorizado && testarConexao) await sb.from("credenciais_integracao_log").insert({ nome: "m365_conexao", acao: "atualizado", descricao: `Teste de conexão falhou — ${erro}`, por: ator });
    if (autorizado && leitura) await sb.from("catalogo_planilha_leitura").update({ status: statusErro, erro }).eq("id", leitura);
    else if (autorizado && !testando && !testarConexao) await sb.from("catalogo_planilha_leitura").insert({ origem: req.headers.get("x-cron-secret") ? "cron" : "manual", status: "erro", erro, criado_por: ator });
    return json({ ok: false, id: leitura, status: statusErro, erro }, e instanceof z.ZodError ? 400 : 500);
  }
});