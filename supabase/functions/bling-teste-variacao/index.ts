// bling-teste-variacao — TESTE DE USO ÚNICO (VARIACAO-PRODUTO, 19/11/2026). APAGAR APÓS O TESTE.
// Pergunta: o Bling aceita produtos SIMPLES já existentes como FILHOS de um produto com variação,
// mantendo o MESMO id (saldo, histórico, vínculos)? Ou cria cadastros novos?
// Usa só produtos descartáveis TESTE-VAR-* (R$ 1, sem estoque, sem loja) e apaga tudo no fim.
// Só super_admin. Devolve as respostas CRUAS do Bling de cada etapa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient, BLING_BASE, blingHeaders, BlingHttpError } from "../_shared/bling/bling-client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// deno-lint-ignore no-explicit-any
type Linha = any;

const COD = { A: "TESTE-VAR-A", B: "TESTE-VAR-B", PAI: "TESTE-VAR-PAI" };
const NOME = "TESTE VARIACAO SNCF (apagar)";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { ok: false, erro: "token ausente" });
  const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (!u?.user) return json(401, { ok: false, erro: "sessão inválida" });
  const { data: ehSuper } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "super_admin" });
  if (!ehSuper) return json(403, { ok: false, erro: "só super_admin" });

  let body: Linha = {};
  try { body = await req.json(); } catch { /* vazio */ }
  if (body?.executar !== true) return json(400, { ok: false, erro: 'Envie {"executar": true} para rodar o teste.' });

  const { data: cfg, error: cfgErr } = await supabase.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
  if (cfgErr || !cfg?.access_token) return json(409, { ok: false, erro: `Bling não conectado: ${cfgErr?.message ?? ""}` });
  const token = await ensureFreshToken(supabase, cfg as Linha);
  const bling = makeBlingClient(supabase, cfg as Linha, token);

  const etapas: Linha[] = [];
  const criados = new Set<string>();
  const passo = async (nome: string, fn: () => Promise<Linha>) => {
    await sleep(400);
    try { const r = await fn(); etapas.push({ etapa: nome, ok: true, resposta: r }); return r; }
    catch (e) {
      const corpo = e instanceof BlingHttpError ? e.corpo : String((e as Error).message);
      etapas.push({ etapa: nome, ok: false, status: e instanceof BlingHttpError ? e.status : null, erro: corpo.slice(0, 2000) });
      return null;
    }
  };
  const del = async (id: string) => {
    const res = await fetch(`${BLING_BASE}/produtos/${id}`, { method: "DELETE", headers: blingHeaders(bling.currentToken()) });
    const txt = await res.text();
    if (!res.ok) throw new BlingHttpError(`DELETE ${res.status}`, res.status, txt);
    return { status: res.status, corpo: txt.slice(0, 500) };
  };
  const simples = (codigo: string, sufixo: string) => ({
    nome: `${NOME} ${sufixo}`, codigo, preco: 1, tipo: "P", situacao: "A", formato: "S", unidade: "UN",
  });

  // 0) trava: não roda se já existir resto de teste anterior
  const pre = await passo("0_checar_restos", () => bling.get(`/produtos?pagina=1&limite=100&criterio=5&codigos[]=${COD.A}&codigos[]=${COD.B}&codigos[]=${COD.PAI}`));
  const restos = (pre?.data ?? []).filter((p: Linha) => Object.values(COD).includes(String(p.codigo)));
  if (restos.length) return json(409, { ok: false, erro: "Já existem produtos TESTE-VAR-* no Bling. Apague antes de rodar de novo.", restos, etapas });

  // 1) cria A e B simples
  const rA = await passo("1a_criar_simples_A", () => bling.post("/produtos", simples(COD.A, "A"), { retry: false }));
  const rB = await passo("1b_criar_simples_B", () => bling.post("/produtos", simples(COD.B, "B"), { retry: false }));
  const idA = rA?.data?.id ? String(rA.data.id) : null;
  const idB = rB?.data?.id ? String(rB.data.id) : null;
  if (idA) criados.add(idA);
  if (idB) criados.add(idB);

  let conclusao = "inconclusivo";
  let idPai: string | null = null;
  if (idA && idB) {
    // 2) MODO 1 — cria o pai mandando os ids existentes como variações
    const pai = {
      nome: NOME, codigo: COD.PAI, preco: 1, tipo: "P", situacao: "A", formato: "V", unidade: "UN",
      variacoes: [
        { id: Number(idA), ...simples(COD.A, "A"), variacao: { nome: "Cor:Azul", ordem: 1, produtoPai: { cloneInfo: false } } },
        { id: Number(idB), ...simples(COD.B, "B"), variacao: { nome: "Cor:Rosa", ordem: 2, produtoPai: { cloneInfo: false } } },
      ],
    };
    const rPai = await passo("2_modo1_criar_pai_adotando_ids", () => bling.post("/produtos", pai, { retry: false }));
    idPai = rPai?.data?.id ? String(rPai.data.id) : null;
    if (idPai) criados.add(idPai);
    for (const v of rPai?.data?.variations?.saved ?? rPai?.data?.variacoes ?? []) if (v?.id) criados.add(String(v.id));

    // 3) lê o estado
    const gPai = idPai ? await passo("3a_get_pai", () => bling.get(`/produtos/${idPai}`)) : null;
    const gA = await passo("3b_get_A", () => bling.get(`/produtos/${idA}`));
    const gB = await passo("3c_get_B", () => bling.get(`/produtos/${idB}`));
    const idsFilhos = (gPai?.data?.variacoes ?? []).map((v: Linha) => String(v.id));
    for (const i of idsFilhos) criados.add(i);
    const paiDeA = gA?.data?.variacao?.produtoPai?.id ? String(gA.data.variacao.produtoPai.id) : null;
    const paiDeB = gB?.data?.variacao?.produtoPai?.id ? String(gB.data.variacao.produtoPai.id) : null;
    const adotou1 = !!idPai && idsFilhos.includes(idA) && idsFilhos.includes(idB);

    if (adotou1) conclusao = "MODO1_ADOTA: o pai aceitou os produtos simples existentes como filhos com o MESMO id";
    else {
      // 4) MODO 2 — pendura B (existente) num pai já criado, via PUT do objeto completo
      if (idPai && gB?.data) {
        const objB = { ...gB.data, formato: "S", variacao: { nome: "Cor:Rosa", ordem: 2, produtoPai: { id: Number(idPai), cloneInfo: false } } };
        await passo("4_modo2_put_B_com_produtoPai", () => bling.put(`/produtos/${idB}`, objB, { retry: false }));
        const gPai2 = await passo("4b_get_pai_depois", () => bling.get(`/produtos/${idPai}`));
        const filhos2 = (gPai2?.data?.variacoes ?? []).map((v: Linha) => String(v.id));
        for (const i of filhos2) criados.add(i);
        conclusao = filhos2.includes(idB)
          ? `MODO2_ADOTA: modo 1 não adotou (filhos=${idsFilhos.join(",") || "nenhum"}), mas PUT com produtoPai pendurou o simples existente com o MESMO id`
          : `NAO_ADOTA: modo 1 filhos=${idsFilhos.join(",") || "nenhum"} (A=${idA}, B=${idB}); modo 2 também não pendurou B. Pai de A=${paiDeA}, pai de B=${paiDeB}`;
      } else conclusao = `NAO_ADOTA/ERRO: pai não criado no modo 1 (ver etapa 2)`;
    }
  }

  // 5) limpeza: filhos/variações primeiro, depois pai
  const ordem = [...criados].filter((i) => i !== idPai);
  if (idPai) ordem.push(idPai);
  const limpeza: Linha[] = [];
  for (const id of ordem) {
    await sleep(400);
    try { limpeza.push({ id, ...(await del(id)), apagado: true }); }
    catch (e) { limpeza.push({ id, apagado: false, status: (e as BlingHttpError).status, erro: (e as BlingHttpError).corpo?.slice(0, 500) }); }
  }
  const sobrou = limpeza.filter((l) => !l.apagado).map((l) => l.id);

  await supabase.from("integracoes_sync_log").insert({
    sistema: "bling", tipo: "teste_variacao", status: sobrou.length ? "parcial" : "sucesso",
    registros_criados: criados.size, registros_erro: sobrou.length, iniciado_por: u.user.id,
    detalhes: JSON.stringify({ conclusao, idA, idB, idPai, etapas, limpeza }),
  });
  return json(200, { ok: true, conclusao, ids: { A: idA, B: idB, pai: idPai }, sobrou_no_bling: sobrou, limpeza, etapas });
});