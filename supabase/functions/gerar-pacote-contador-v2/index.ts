// Pacote do Contador v2 (03/11/2026). Gera o ZIP em segundo plano a partir de uma remessa
// criada por fn_remessa_contador_iniciar. Partes de até progresso.limite_parte_mb; progresso
// gravado por etapa; nova chamada com a mesma remessa retoma da última parte concluída.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { Zip, ZipDeflate, ZipPassThrough } from "npm:fflate@0.8.2";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { causaXmlEntrada, separarCobertas, tipoFaltante } from "../_shared/pacote-contador/cobertura.ts";
import { assinarPartes, BUCKET, enviarEmailRemessa, type Parte } from "../_shared/pacote-contador/remessa.ts";

const ORCAMENTO_MS = 320_000; // abaixo do limite do runtime; acima disso, pausa e a tela retoma
const HEARTBEAT_VIVO_MS = 90_000;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e));

type Entrada = { zip: string; path: string; bytes?: number };
type Faltante = { pasta: string; referencia: string; motivo: string; tipo?: string; fonte?: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado" }, 401);
  const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: claims } = await userDb.auth.getClaims(auth.slice(7));
  if (!claims?.claims?.sub) return json({ ok: false, erro: "Sessão inválida" }, 401);
  const { data: pode, error: pe } = await userDb.rpc("pode_ler_tabela", { p_tabela: "remessas_contador" });
  if (pe) return json({ ok: false, erro: pe.message }, 500);
  if (!pode) return json({ ok: false, erro: "Sem permissão para o pacote do contador" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, erro: "JSON inválido" }, 400); }
  if (body?.simular === true) {
    const comp = String(body.competencia ?? "");
    if (!/^\d{4}-\d{2}-01$/.test(comp)) return json({ok:false,erro:"Competência inválida"},400);
    const admin = createClient(url,service);
    const {data:r,error:e} = await admin.from("remessas_contador").select("*").eq("competencia",comp).order("versao",{ascending:false}).limit(1).single();
    if(e) return json({ok:false,erro:e.message},400);
    try {const inv=await inventario({admin,userDb},{...r,progresso:{...r.progresso,planilha_path:r.progresso?.planilha_path??`pacotes/${comp.slice(0,7)}/v${r.versao}/planilha.xlsx`}},true);return json({ok:true,simular:true,...inv});} catch(e){return json({ok:false,erro:msg(e)},500);}
  }
  const remessaId = String(body?.remessa_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(remessaId)) return json({ ok: false, erro: "remessa_id inválido" }, 400);
  const planilhaPath = typeof body?.planilha_path === "string" ? body.planilha_path : null;
  if (planilhaPath && !/^pacotes\/\d{4}-\d{2}\/v\d+\/[\w.-]+\.xlsx$/.test(planilhaPath)) return json({ ok: false, erro: "planilha_path inválido" }, 400);

  const admin = createClient(url, service);
  const { data: rem, error: re } = await admin.from("remessas_contador").select("*").eq("id", remessaId).single();
  if (re) return json({ ok: false, erro: re.message }, 404);
  if (rem.status !== "gerando") return json({ ok: false, erro: `Remessa está em '${rem.status}', não em geração.` }, 409);
  const vivo = rem.progresso?.atualizado_em && Date.now() - new Date(rem.progresso.atualizado_em).getTime() < HEARTBEAT_VIVO_MS;
  if (vivo && rem.progresso?.execucao_id && rem.progresso?.etapa !== "iniciado" && !rem.progresso?.pausado) {
    return json({ ok: true, ja_em_andamento: true });
  }
  const execucao = crypto.randomUUID();
  const prog = { ...(rem.progresso ?? {}), execucao_id: execucao, pausado: false, atualizado_em: new Date().toISOString() };
  if (planilhaPath) prog.planilha_path = planilhaPath;
  await admin.from("remessas_contador").update({ progresso: prog }).eq("id", remessaId);

  const tarefa = gerar({ admin, userDb, url, anon, auth, remessaId, execucao }).catch(async (e) => {
    console.error("gerar-pacote-contador-v2", remessaId, msg(e));
    const { data: atual } = await admin.from("remessas_contador").select("progresso").eq("id", remessaId).single();
    await admin.from("remessas_contador").update({ status: "erro", erro_mensagem: msg(e), progresso: { ...(atual?.progresso ?? {}), etapa: "erro", atualizado_em: new Date().toISOString() } }).eq("id", remessaId);
  });
  (globalThis as any).EdgeRuntime?.waitUntil?.(tarefa);
  return json({ ok: true, remessa_id: remessaId, execucao_id: execucao }, 202);
});

/* ───────────────────────────── geração ───────────────────────────── */

async function gerar(c: { admin: any; userDb: any; url: string; anon: string; auth: string; remessaId: string; execucao: string }) {
  const t0 = Date.now();
  const { admin } = c;
  const ler = async () => (await admin.from("remessas_contador").select("*").eq("id", c.remessaId).single()).data;
  let rem = await ler();
  const mes = String(rem.competencia).slice(0, 7);
  const base = `pacotes/${mes}/v${rem.versao}`;
  const salvar = async (patch: Record<string, any>, extra: Record<string, any> = {}) => {
    rem = { ...rem, ...extra, progresso: { ...rem.progresso, ...patch, atualizado_em: new Date().toISOString() } };
    if (rem.progresso.execucao_id !== c.execucao) throw new Error("Outra execução assumiu esta remessa.");
    const { error } = await admin.from("remessas_contador").update({ progresso: rem.progresso, ...extra }).eq("id", c.remessaId);
    if (error) throw error;
  };

  // 1. Inventário (uma vez; retomadas reaproveitam a lista gravada)
  if (!rem.progresso.entradas) {
    await salvar({ etapa: "listando", etapa_rotulo: "Listando arquivos do mês" });
    const inv = await inventario(c, rem);
    await salvar({ etapa: "inventario_ok", entradas: inv.entradas, proxima: 0 }, { manifesto: inv.manifesto });
  }
  const entradas: Entrada[] = rem.progresso.entradas;
  const limite = Number(rem.progresso.limite_parte_mb ?? 150) * 1048576;
  let partes: Parte[] = rem.partes ?? [];
  let i = Number(rem.progresso.proxima ?? 0);

  // 2. ZIP em partes
  let zip: Zip | null = null; let chunks: Uint8Array[] = []; let bytesParte = 0; let arquivosParte = 0; let fim: Promise<void> | null = null;
  const abrir = () => {
    chunks = []; bytesParte = 0; arquivosParte = 0;
    let resolve!: () => void, reject!: (e: unknown) => void;
    fim = new Promise<void>((r, j) => { resolve = r; reject = j; });
    zip = new Zip((err, chunk, final) => { if (err) return reject(err); chunks.push(chunk); bytesParte += chunk.length; if (final) resolve(); });
  };
  const adicionar = (nome: string, dados: Uint8Array) => {
    const comprime = /\.(xml|json|csv|txt|ofx|ret|rem)$/i.test(nome);
    const f = comprime ? new ZipDeflate(nome, { level: 6 }) : new ZipPassThrough(nome);
    zip!.add(f); f.push(dados, true); arquivosParte++;
  };
  const fechar = async (ultima: boolean) => {
    zip!.end(); await fim;
    const total = chunks.reduce((a, b) => a + b.length, 0);
    const buf = new Uint8Array(total); let o = 0; for (const ch of chunks) { buf.set(ch, o); o += ch.length; }
    const indice = partes.length + 1;
    const suf = rem.natureza === "previa" ? "-PREVIA" : "";
    const nome = ultima && indice === 1 ? `pacote-contador-${mes}-v${rem.versao}${suf}.zip` : `pacote-contador-${mes}-v${rem.versao}${suf}-parte${indice}.zip`;
    const path = `${base}/${nome}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: "application/zip", upsert: true });
    if (error) throw new Error(`Falha ao gravar ${nome}: ${error.message}`);
    partes = [...partes, { indice, path, bytes: total, arquivos: arquivosParte }];
    zip = null; chunks = [];
  };

  abrir();
  // Baixa em lotes paralelos (o gargalo é a ida ao Storage, não a compactação).
  const LOTE = 8;
  while (i < entradas.length) {
    if (Date.now() - t0 > ORCAMENTO_MS) {
      // Fecha a parte em andamento (fica menor que o limite) e a próxima execução segue dali.
      if (arquivosParte > 0) await fechar(false);
      await salvar({ pausado: true, proxima: i, etapa_rotulo: `Pausado em ${i}/${entradas.length} — retomando` }, { partes });
      await retomarSozinho(c);
      return;
    }
    const lote = entradas.slice(i, i + LOTE);
    const baixados = await Promise.all(lote.map(async (e) => {
      const { data: blob, error } = await admin.storage.from(BUCKET).download(e.path);
      if (error || !blob) throw new Error(`Falha ao ler ${e.path}: ${error?.message ?? "vazio"}`);
      return new Uint8Array(await blob.arrayBuffer());
    }));
    for (let k = 0; k < lote.length; k++) {
      const dados = baixados[k];
      if (arquivosParte > 0 && bytesParte + dados.length > limite) {
        await fechar(false);
        await salvar({ proxima: i, etapa: "zip", etapa_rotulo: `Parte ${partes.length} gravada` }, { partes });
        abrir();
      }
      adicionar(lote[k].zip, dados);
      i++;
    }
    if (i % 40 === 0 || i === entradas.length) await salvar({ etapa: "zip", etapa_rotulo: `Compactando ${i}/${entradas.length}`, feitos: i });
  }

  // 3. Manifesto (json + pdf) e resumo vão na última parte
  await salvar({ etapa: "manifesto", etapa_rotulo: "Gerando manifesto" });
  const manifesto = { ...rem.manifesto, partes: partes.length + 1, gerado_em: new Date().toISOString() };
  adicionar("manifesto.json", new TextEncoder().encode(JSON.stringify(manifesto, null, 2)));
  adicionar("manifesto.pdf", await pdfManifesto(manifesto));
  await fechar(true);
  // Se só houve uma parte, ela já se chama sem sufixo; se houve várias, a primeira já foi gravada com sufixo.

  // 4. Links e e-mail
  await salvar({ etapa: "links", etapa_rotulo: "Gerando links" }, { partes });
  const { partes: assinadas, expira } = await assinarPartes(admin, partes);
  const totalArquivos = assinadas.reduce((a, p) => a + p.arquivos, 0);
  await salvar({ etapa: "pronto", etapa_rotulo: "Pronto", proxima: entradas.length, entradas: undefined, total_entradas: entradas.length }, {
    status: "pronto", partes: assinadas, manifesto, link_signed: assinadas[0]?.link ?? null, link_expira_em: expira,
    storage_path: assinadas[0]?.path ?? null, qtd_documentos: totalArquivos, qtd_contas: Object.keys(manifesto.bancos ?? {}).length,
    erro_mensagem: null,
  });
  if ((rem.destinatarios ?? []).length) {
    const r = await enviarEmailRemessa({ supabaseUrl: c.url, anonKey: c.anon, authHeader: c.auth, remessa: { ...rem, manifesto }, partes: assinadas, expira, motivo: "envio" });
    await salvar({ email: { enviados: r.enviados, erros: r.erros, em: new Date().toISOString() } });
  }
}

/** Encadeia a próxima execução sem depender da tela aberta (mesmo token do usuário). */
async function retomarSozinho(c: { url: string; anon: string; auth: string; remessaId: string }) {
  try {
    await fetch(`${c.url}/functions/v1/gerar-pacote-contador-v2`, {
      method: "POST", headers: { Authorization: c.auth, apikey: c.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ remessa_id: c.remessaId }),
    });
  } catch (e) { console.error("retomarSozinho", msg(e)); /* a tela retoma pelo heartbeat */ }
}

/* ───────────────────────────── inventário ─────────────────────────── */

const seguro = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.() -]+/g, "_").replace(/\s+/g, " ").trim() || "sem_nome";

async function inventario(c: { admin: any; userDb: any }, rem: any, simular = false) {
  const { admin, userDb } = c;
  const ini = rem.periodo_inicio as string, fimP = rem.periodo_fim as string;
  const entradas: Entrada[] = [];
  const faltantes: Faltante[] = [];
  const pastas: Record<string, { arquivos: number; valor_total?: number; nfs?: number }> = {};
  const conta = (p: string, n = 1, valor?: number, nfs?: number) => {
    pastas[p] ??= { arquivos: 0 }; pastas[p].arquivos += n;
    if (valor != null) pastas[p].valor_total = Math.round(((pastas[p].valor_total ?? 0) + valor) * 100) / 100;
    if (nfs != null) pastas[p].nfs = (pastas[p].nfs ?? 0) + nfs;
  };
  const usados = new Set<string>();
  const nomeUnico = (z: string) => { let n = z, k = 2; while (usados.has(n)) { n = z.replace(/(\.[^./]+)?$/, `_${k++}$1`); } usados.add(n); return n; };

  // 01_relatorios
  if (rem.progresso?.planilha_path) {
    entradas.push({ zip: nomeUnico(`01_relatorios/Fetely_Estoque_Contabil_${ini.slice(5, 7)}-${ini.slice(0, 4)}.xlsx`), path: rem.progresso.planilha_path });
    conta("01_relatorios");
  } else faltantes.push({ pasta: "01_relatorios", referencia: "planilha", motivo: "Planilha não enviada pela tela" });

  // Totais NFs × vendas × posição (mesmas fontes da tela)
  const [vendas, nfsP, pos] = await Promise.all([
    userDb.from("vw_contabil_vendas_periodo").select("receita_total,cmv").eq("competencia", rem.competencia),
    userDb.from("vw_contabil_nfs_periodo").select("receita_total").eq("competencia", rem.competencia),
    todas(userDb.rpc("fn_contabil_posicao", { p_competencia: rem.competencia })).then((data) => ({ data, error: null })),
  ]);
  for (const r of [vendas, nfsP, pos]) if (r.error) throw r.error;
  const presumidas = pos.data.filter((p: any) => p.fonte === "presumido");
  // Prévia × definitiva: natureza nasce na RPC pelo status da competência.
  const previa = rem.natureza === "previa";
  const { data: fech, error: fe } = await admin.from("contabil_fechamento").select("id,status,politica,valor_presumido").eq("competencia", rem.competencia).single();
  if (fe) throw fe;
  if (previa && fech.status !== "pre_fechado") throw new Error(`Remessa nasceu como prévia mas a competência está '${fech.status}' — gere uma nova versão.`);
  let presuncoes: any[] = [];
  if (previa) {
    const its = await todas(admin.from("contabil_fechamento_item").select("presuncao_nf_id,quantidade,valor_total").eq("fechamento_id", fech.id).eq("presumido", true));
    const porNf = new Map<number, { un: number; v: number }>();
    for (const it of its) { const a = porNf.get(it.presuncao_nf_id) ?? { un: 0, v: 0 }; a.un += Number(it.quantidade ?? 0); a.v += Number(it.valor_total ?? 0); porNf.set(it.presuncao_nf_id, a); }
    presuncoes = (fech.politica?.presuncoes ?? []).map((p: any) => ({
      nf: p.nf, nf_id: p.nf_id, fornecedor: p.fornecedor, data_chegada: p.data_chegada, centro: p.centro,
      unidades: Number(p.unidades ?? porNf.get(p.nf_id)?.un ?? 0), valor_nf: Number(p.valor_nf ?? 0),
      valor_presumido: Math.round((porNf.get(p.nf_id)?.v ?? 0) * 100) / 100, motivo: p.motivo,
    }));
  }
  let delta: any = null;
  if (!previa) {
    const { count } = await admin.from("remessas_contador").select("id", { count: "exact", head: true }).eq("competencia", rem.competencia).eq("natureza", "previa");
    if (count) {
      const linhas = await todas(admin.from("vw_contabil_delta_pre_fechamento").select("nf,sku,qtd_presumida,qtd_real,delta_qtd,valor_presumido,valor_real,delta_valor").eq("competencia", rem.competencia));
      const t = (k: string) => Math.round(linhas.reduce((a: number, l: any) => a + Number(l[k] ?? 0), 0) * 100) / 100;
      delta = { linhas: linhas.length, qtd_presumida: t("qtd_presumida"), qtd_real: t("qtd_real"), delta_qtd: t("delta_qtd"),
        valor_presumido: t("valor_presumido"), valor_real: t("valor_real"), delta_valor: t("delta_valor"),
        itens: linhas.filter((l: any) => Number(l.delta_qtd) !== 0 || Number(l.delta_valor) !== 0) };
    }
  }
  const s = (a: any[], k: string) => Math.round(a.reduce((x, y) => x + Number(y[k] ?? 0), 0) * 100) / 100;
  const conferencia = {
    posicao: { skus: pos.data.length, unidades: s(pos.data, "quantidade"), valor: s(pos.data, "valor_total"),
      presumido: { skus: presumidas.length, unidades: s(presumidas, "quantidade"), valor: s(presumidas, "valor_total") } },
    vendas: { pedidos: vendas.data.length, receita: s(vendas.data, "receita_total"), cmv: s(vendas.data, "cmv") },
    nfs: { notas: nfsP.data.length, receita: s(nfsP.data, "receita_total") },
    diferenca_vendas_menos_nfs: Math.round((s(vendas.data, "receita_total") - s(nfsP.data, "receita_total")) * 100) / 100,
  };
  const pdfResumo = await pdfTexto([...(previa ? [CABECALHO_PREVIA, ""] : []), `Resumo do pacote contábil ${ini.slice(5, 7)}/${ini.slice(0, 4)} v${rem.versao}`, "",
    ...(previa ? [`Presumido na posição: ${conferencia.posicao.presumido.skus} SKUs, ${conferencia.posicao.presumido.unidades} un, ${brl(conferencia.posicao.presumido.valor)}`] : []),
    `Posição de estoque: ${conferencia.posicao.skus} SKUs, ${conferencia.posicao.unidades} un, ${brl(conferencia.posicao.valor)}`,
    `Vendas do período: ${conferencia.vendas.pedidos} pedidos, receita ${brl(conferencia.vendas.receita)}, CMV ${brl(conferencia.vendas.cmv)}`,
    `NFs do período: ${conferencia.nfs.notas} notas, receita ${brl(conferencia.nfs.receita)}`,
    `Diferença vendas - NFs: ${brl(conferencia.diferenca_vendas_menos_nfs)}`]);
  const resumoPath = `pacotes/${String(rem.competencia).slice(0, 7)}/v${rem.versao}/resumo.pdf`;
  if (!simular) {
    const up = await admin.storage.from(BUCKET).upload(resumoPath, pdfResumo, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(`Falha ao gravar resumo.pdf: ${up.error.message}`);
  }
  entradas.push({ zip: nomeUnico("01_relatorios/resumo.pdf"), path: resumoPath }); conta("01_relatorios");

  // Bloco K (posse por centro, NCM/unidade) e numeração das NFs (canceladas, inutilizadas, buracos)
  const blocoK = resumoBlocoK(await todas(userDb.rpc("fn_contabil_bloco_k", { p_competencia: rem.competencia })));
  const numeracao = resumoNumeracao(await todas(userDb.rpc("fn_contabil_nf_numeracao", { p_competencia: rem.competencia })));
  const numPath = `pacotes/${String(rem.competencia).slice(0, 7)}/v${rem.versao}/canceladas_inutilizadas.csv`;
  if (!simular) {
    const up = await admin.storage.from(BUCKET).upload(numPath, new Blob([csvNumeracao(numeracao.itens)], { type: "text/csv" }), { contentType: "text/csv", upsert: true });
    if (up.error) throw new Error(`Falha ao gravar Canceladas e inutilizadas: ${up.error.message}`);
  }
  entradas.push({ zip: nomeUnico(`01_relatorios/Canceladas_e_inutilizadas_${ini.slice(5, 7)}-${ini.slice(0, 4)}.csv`), path: numPath }); conta("01_relatorios");

  // 02_nfs_saida
  const nfs = await todas(admin.from("nfs_emitidas").select("id,numero,serie,situacao,valor_nota,xml_storage_path,pdf_storage_path,pdf_origem,arquivos_erro")
    .eq("tipo", "saida").gte("data_emissao", ini).lte("data_emissao", `${fimP}T23:59:59`).order("numero"));
  const pdfOrigem = { bling: 0, gerado_xml: 0, sem_pdf: 0 };
  const eventos: { numero: string; situacao: string; aviso: string }[] = [];
  for (const nf of nfs) {
    const ref = `NF ${nf.numero ?? "?"}/${nf.serie ?? "?"}`;
    const sub = nf.situacao === "autorizada" ? "autorizadas" : nf.situacao === "cancelada" ? "canceladas" : null;
    if (!sub) { faltantes.push({ pasta: "02_nfs_saida", referencia: ref, motivo: `Situação '${nf.situacao}' — não autorizada nem cancelada` }); continue; }
    const pasta = `02_nfs_saida/${sub}`;
    if (sub === "canceladas") eventos.push({ numero: String(nf.numero), situacao: "cancelada", aviso: "evento de cancelamento/CC-e indisponível na origem" });
    if (!nf.xml_storage_path) { faltantes.push({ pasta, referencia: ref, motivo: nf.arquivos_erro ? `XML não recuperado: ${nf.arquivos_erro}` : "XML não guardado (rode 'Buscar arquivos das NFs do mês')" }); continue; }
    entradas.push({ zip: nomeUnico(`${pasta}/${nf.xml_storage_path.split("/").pop()}`), path: nf.xml_storage_path });
    conta(pasta, 1, sub === "autorizadas" ? Number(nf.valor_nota ?? 0) : 0, 1);
    if (nf.pdf_storage_path) {
      entradas.push({ zip: nomeUnico(`${pasta}/${nf.pdf_storage_path.split("/").pop()}`), path: nf.pdf_storage_path }); conta(pasta);
      if (nf.pdf_origem === "gerado_xml") pdfOrigem.gerado_xml++; else pdfOrigem.bling++;
    } else { pdfOrigem.sem_pdf++; faltantes.push({ pasta, referencia: ref, motivo: "PDF não guardado" }); }
  }
  // Devoluções: NF de entrada emitida pela Fetely (rascunho → autorizada no Bling); o SNCF não guarda o XML.
  const devs = await todas(admin.from("devolucao").select("numero,nf_dev_numero,nf_devolucao").eq("nf_dev_status", "autorizada")
    .gte("nf_dev_atualizado_em", ini).lte("nf_dev_atualizado_em", `${fimP}T23:59:59`));
  pastas["02_nfs_saida/devolucoes"] ??= { arquivos: 0 };
  for (const d of devs) faltantes.push({ pasta: "02_nfs_saida/devolucoes", referencia: `${d.numero} · NF ${d.nf_dev_numero ?? "?"}`, motivo: "XML da NF de devolução não é guardado pelo SNCF (chave " + (d.nf_devolucao ?? "?") + ")" });

  // 03_nfs_entrada
  const ent = await todas(admin.from("nfs_stage").select("fonte,nf_chave_acesso,nf_numero,nf_serie,fornecedor_razao_social,valor,xml_storage_path,status")
    .gte("nf_data_emissao", ini).lte("nf_data_emissao", fimP).not("status", "in", "(descartada,duplicada)"));
  pastas["03_nfs_entrada"] ??= { arquivos: 0 };
  const semXml = ent.filter((n: any) => !n.xml_storage_path && n.nf_chave_acesso).map((n: any) => String(n.nf_chave_acesso).replace(/\D/g, ""));
  const tentativas = new Map<string, any>();
  for (let i = 0; i < semXml.length; i += 200) {
    const { data: t, error: et } = await admin.from("nf_entrada_arquivo_tentativa").select("nf_chave_acesso,indisponivel_na_origem,erro").in("nf_chave_acesso", semXml.slice(i, i + 200));
    if (et) throw new Error("Falha ao ler tentativas de XML de entrada: " + et.message);
    for (const x of t ?? []) tentativas.set(x.nf_chave_acesso, x);
  }
  for (const n of ent) {
    const ref = `NF ${n.nf_numero ?? "?"} · ${n.fornecedor_razao_social ?? "?"}`;
    if (!n.xml_storage_path) { faltantes.push({ pasta: "03_nfs_entrada", referencia: ref, motivo: causaXmlEntrada(n.fonte, tentativas.get(String(n.nf_chave_acesso ?? "").replace(/\D/g, ""))) }); continue; }
    entradas.push({ zip: nomeUnico(`03_nfs_entrada/${n.xml_storage_path.split("/").pop()}`), path: n.xml_storage_path });
    conta("03_nfs_entrada", 1, Number(n.valor ?? 0), 1);
  }

  // 04_bancos
  const contas = await todas(admin.from("contas_bancarias").select("id,nome_exibicao,banco,numero_conta,ativo"));
  const mensais = await todas(admin.from("contabil_extrato_mensal").select("*").eq("competencia",rem.competencia).eq("vigente",true));
  const avisosMensais: any[] = [];
  const nomeConta = new Map(contas.map((k: any) => [k.id, seguro(k.nome_exibicao || `${k.banco} ${k.numero_conta ?? ""}`)]));
  const imps = await todas(admin.from("extrato_importacoes").select("id,conta_bancaria_id,fonte_tipo,nome_arquivo,periodo_inicio,periodo_fim,status,created_at,linhas_novas,arquivo_storage_path")
    .lte("periodo_inicio", fimP).gte("periodo_fim", ini).neq("status", "erro"));
  const bancos: Record<string, any> = {};
  for (const k of contas.filter((k:any)=>k.ativo)) {
    const cn = nomeConta.get(k.id) ?? "sem_conta";
    const e = mensais.find((e:any)=>e.conta_bancaria_id===k.id);
    const pasta = `04_bancos/${cn}/extrato_mensal`;
    if (!e) faltantes.push({pasta,referencia:k.nome_exibicao,motivo:"Extrato oficial do mês inteiro não guardado"});
    else {
      entradas.push({zip:nomeUnico(`${pasta}/${seguro(e.nome_arquivo)}`),path:e.storage_path});conta(pasta);
      bancos[cn] = {importacoes:0,com_arquivo:0,extrato_mensal:{nome:e.nome_arquivo,periodo_inicio:e.periodo_inicio,periodo_fim:e.periodo_fim,saldo_inicial:e.saldo_inicial,saldo_final:e.saldo_final,saldo_inicial_sncf:e.saldo_inicial_sncf,saldo_final_sncf:e.saldo_final_sncf,conferencia:e.conferencia}};
      if (e.conferencia?.avisos?.length) avisosMensais.push({conta:k.nome_exibicao,...e.conferencia});
    }
  }
  // Cobertas por reimportação: procura a com original em QUALQUER período (mesma conta + fonte).
  const semArq = imps.filter((i: any) => !i.arquivo_storage_path);
  const contasSem = [...new Set(semArq.map((i: any) => i.conta_bancaria_id).filter(Boolean))];
  const comArqTodas = contasSem.length ? await todas(admin.from("extrato_importacoes").select("id,conta_bancaria_id,fonte_tipo,nome_arquivo,periodo_inicio,periodo_fim,created_at,arquivo_storage_path")
    .in("conta_bancaria_id", contasSem).not("arquivo_storage_path", "is", null).neq("status", "erro")) : [];
  const { cobertas, faltantes: semCobertura } = separarCobertas(semArq, comArqTodas, { inicio: ini, fim: fimP });
  const idsFaltam = new Set(semCobertura.map((i) => i.id));
  const descImp = (i: any) => ({ nome: i.nome_arquivo ?? "?", fonte: i.fonte_tipo, conta: nomeConta.get(i.conta_bancaria_id) ?? "sem_conta", importada_em: String(i.created_at).slice(0, 10), periodo: `${i.periodo_inicio ?? "?"} a ${i.periodo_fim ?? "?"}` });
  const cobertasReimportacao = cobertas.map((c) => ({ antiga: descImp(c.antiga), com_arquivo: descImp(c.com_arquivo), com_arquivos: (c.com_arquivos ?? [c.com_arquivo]).map(descImp), criterio: c.criterio }));
  for (const imp of imps) {
    const cn = nomeConta.get(imp.conta_bancaria_id) ?? "sem_conta";
    bancos[cn] ??= { importacoes: 0, com_arquivo: 0, cobertas_reimportacao: 0 };
    bancos[cn].importacoes++;
    const sub = imp.fonte_tipo === "arquivo_nao_lido" ? "outros" : seguro(imp.fonte_tipo ?? "outros");
    if (!imp.arquivo_storage_path) {
      if (!idsFaltam.has(imp.id)) { bancos[cn].cobertas_reimportacao = (bancos[cn].cobertas_reimportacao ?? 0) + 1; continue; }
      continue;
    }
    bancos[cn].com_arquivo++;
    entradas.push({ zip: nomeUnico(`04_bancos/${cn}/apoio_conciliacao/${sub}/${seguro(imp.nome_arquivo ?? imp.arquivo_storage_path.split("/").pop())}`), path: imp.arquivo_storage_path });
    conta(`04_bancos/${cn}/apoio_conciliacao/${sub}`);
  }
  // Por conta: linhas do mês, saldo inicial/final, não conciliadas
  for (const k of contas) {
    const cn = nomeConta.get(k.id)!;
    const movs = await todas(admin.from("movimentacoes_bancarias").select("data_transacao,valor,conciliado,saldo_pos_transacao")
      .eq("conta_bancaria_id", k.id).gte("data_transacao", ini).lte("data_transacao", fimP).order("data_transacao").order("created_at"));
    if (!movs.length && !bancos[cn]) continue;
    bancos[cn] ??= { importacoes: 0, com_arquivo: 0 };
    // Saldo do dia (saldo_diario_conta): inicial = último antes do mês; final = último do mês.
    const [antes, ultimo] = await Promise.all([
      admin.from("saldo_diario_conta").select("data,saldo").eq("conta_bancaria_id", k.id).lt("data", ini).order("data", { ascending: false }).limit(1),
      admin.from("saldo_diario_conta").select("data,saldo").eq("conta_bancaria_id", k.id).gte("data", ini).lte("data", fimP).order("data", { ascending: false }).limit(1),
    ]);
    if (antes.error) throw antes.error; if (ultimo.error) throw ultimo.error;
    Object.assign(bancos[cn], {
      linhas: movs.length,
      nao_conciliadas: movs.filter((m: any) => !m.conciliado).length,
      saldo_inicial: antes.data?.[0] ? Number(antes.data[0].saldo) : null,
      saldo_inicial_data: antes.data?.[0]?.data ?? null,
      saldo_final: ultimo.data?.[0] ? Number(ultimo.data[0].saldo) : null,
      saldo_final_data: ultimo.data?.[0]?.data ?? null,
    });
  }

  const faltantesTipados = faltantes.map(({ fonte, ...f }) => ({ ...f, tipo: tipoFaltante(f.pasta, fonte) }));
  const porTipo: Record<string, number> = { bancario: 0, xml_entrada: 0, mercado_pago: 0, nf_cancelada: 0, devolucao: 0, outros: 0 };
  for (const f of faltantesTipados) porTipo[f.tipo]++;
  const manifesto = {
    competencia: rem.competencia, versao: rem.versao, gerado_por: rem.gerado_por,
    natureza: rem.natureza ?? "definitiva", ...(previa ? { aviso: CABECALHO_PREVIA, presuncoes } : {}), ...(delta ? { delta_pre_final: delta } : {}),
    total_arquivos: entradas.length + 2,
    pastas, pdf_origem: { danfe_bling: pdfOrigem.bling, resumo_nfe_gerado_xml: pdfOrigem.gerado_xml, sem_pdf: pdfOrigem.sem_pdf },
    conferencia, bancos, eventos_nf: eventos,
    faltantes_por_tipo: porTipo, cobertas_reimportacao: { total: cobertasReimportacao.length, itens: cobertasReimportacao },
    faltantes: faltantesTipados,
    avisos_extratos_mensais: avisosMensais,
    arquivos_apoio_sem_original: {total:semArq.length,itens:semArq.map(descImp)},
    bloco_k: blocoK, numeracao_nf: { ...numeracao, itens: undefined, detalhe: numeracao.itens },
  };
  return { entradas, manifesto };
}

const DOC = (c: string | null) => c && c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : (c ?? "não identificado");

function resumoBlocoK(linhas: any[]) {
  const porPosse: Record<string, { linhas: number; unidades: number; valor: number }> = {};
  const semCad = new Map<string, { sku: string; codigo: string; produto: string; sem_ncm: boolean; sem_unidade: boolean }>();
  const aConfirmar = new Set<string>(), semCnpj = new Set<string>();
  for (const l of linhas) {
    const k = l.posse_rotulo ?? "a confirmar";
    porPosse[k] ??= { linhas: 0, unidades: 0, valor: 0 };
    porPosse[k].linhas++; porPosse[k].unidades += Number(l.quantidade ?? 0); porPosse[k].valor = Math.round((porPosse[k].valor + Number(l.valor_total ?? 0)) * 100) / 100;
    if (l.sem_ncm || l.sem_unidade) semCad.set(l.sku, { sku: l.sku, codigo: l.codigo_produto, produto: l.produto, sem_ncm: !!l.sem_ncm, sem_unidade: !!l.sem_unidade });
    if (!l.posse) aConfirmar.add(l.centro);
    if (l.posse && l.posse !== "proprio" && !l.participante_cnpj) semCnpj.add(l.centro);
  }
  const sem = [...semCad.values()];
  return { linhas: linhas.length, por_posse: porPosse,
    produtos_sem_cadastro: { total: sem.length, sem_ncm: sem.filter((s) => s.sem_ncm).length, sem_unidade: sem.filter((s) => s.sem_unidade).length, itens: sem },
    centros_posse_a_confirmar: [...aConfirmar], centros_sem_cnpj_participante: [...semCnpj] };
}

function resumoNumeracao(itens: any[]) {
  const c = (o: string) => itens.filter((i) => i.ocorrencia === o).length;
  const pend = itens.filter((i) => (i.ocorrencia === "buraco" || i.ocorrencia === "nao_autorizada") && i.dentro_prazo);
  return { canceladas: c("cancelada"), inutilizadas: c("inutilizada"), nao_autorizadas: c("nao_autorizada"), buracos: c("buraco"),
    pendentes_no_prazo: pend.length, prazo_inutilizacao: itens.find((i) => i.prazo_inutilizacao)?.prazo_inutilizacao ?? null, itens };
}

const ROT_OCORRENCIA: Record<string, string> = { cancelada: "Cancelada", inutilizada: "Inutilizada", nao_autorizada: "Não autorizada", buraco: "Não identificada", entrada_propria: "NF de entrada própria" };
function csvNumeracao(itens: any[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const L = [["Emitente (CNPJ)", "Série", "Número", "Ocorrência", "Data", "Detalhe", "Prazo de inutilização"].map(q).join(";")];
  for (const i of itens) L.push([DOC(i.emitente_cnpj), i.serie, i.numero, ROT_OCORRENCIA[i.ocorrencia] ?? i.ocorrencia, i.data_emissao ?? "", i.detalhe, i.prazo_inutilizacao ?? ""].map(q).join(";"));
  return "\uFEFF" + L.join("\r\n") + "\r\n";
}

async function todas(q: any): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q.range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/* ───────────────────────────── PDFs ───────────────────────────── */

const brl = (v: number | null | undefined) => v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const latin1 = (s: string) => s.replace(/[—–]/g, "-").replace(/[×]/g, "x").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

async function pdfTexto(linhas: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([595, 842]); let y = 800;
  for (const bruta of linhas) {
    // quebra linhas longas
    const partes: string[] = []; let l = latin1(bruta);
    while (l.length > 105) { partes.push(l.slice(0, 105)); l = "    " + l.slice(105); }
    partes.push(l);
    for (const p of partes) {
      if (y < 40) { page = doc.addPage([595, 842]); y = 800; }
      page.drawText(p, { x: 36, y, size: 9, font }); y -= 12;
    }
  }
  return await doc.save();
}

const CABECALHO_PREVIA = "PRÉVIA — competência pré-fechada; posição de estoque inclui presunções";
function pdfManifesto(m: any): Promise<Uint8Array> {
  const L: string[] = [...(m.natureza === "previa" ? [CABECALHO_PREVIA, ""] : []), `Manifesto do pacote contábil ${String(m.competencia).slice(5, 7)}/${String(m.competencia).slice(0, 4)} - versão ${m.versao}`, `Gerado em ${m.gerado_em} · ${m.partes} parte(s) · ${m.total_arquivos} arquivo(s)`, ""];
  if (m.faltantes_por_tipo) {
    const t = m.faltantes_por_tipo;
    L.push(`FALTANTES: ${(m.faltantes ?? []).length} — bancário ${t.bancario}, XML de entrada ${t.xml_entrada}, Mercado Pago ${t.mercado_pago}, NF cancelada ${t.nf_cancelada}, devolução ${t.devolucao}${t.outros ? `, outros ${t.outros}` : ""}`);
    if (m.cobertas_reimportacao) L.push(`Importações sem original cobertas por reimportação: ${m.cobertas_reimportacao.total}`);
    L.push("");
  }
  L.push("PASTAS");
  for (const [k, v] of Object.entries(m.pastas ?? {}) as [string, any][]) L.push(`  ${k}: ${v.arquivos} arquivo(s)${v.nfs != null ? `, ${v.nfs} NF(s)` : ""}${v.valor_total != null ? `, ${brl(v.valor_total)}` : ""}`);
  L.push("", "PDF DAS NFs DE SAÍDA", `  DANFE do Bling: ${m.pdf_origem.danfe_bling}`, `  Resumo NF-e gerado do XML: ${m.pdf_origem.resumo_nfe_gerado_xml}`, `  Sem PDF: ${m.pdf_origem.sem_pdf}`);
  const c = m.conferencia;
  L.push("", "CONFERÊNCIA NFs x VENDAS", `  Vendas: ${c.vendas.pedidos} pedidos, ${brl(c.vendas.receita)}`, `  NFs: ${c.nfs.notas} notas, ${brl(c.nfs.receita)}`, `  Diferença: ${brl(c.diferenca_vendas_menos_nfs)}`, `  Posição de estoque: ${c.posicao.skus} SKUs, ${brl(c.posicao.valor)}`);
  if (c.posicao.presumido?.skus) L.push(`  Dos quais presumidos: ${c.posicao.presumido.skus} SKUs, ${c.posicao.presumido.unidades} un, ${brl(c.posicao.presumido.valor)}`);
  if (m.presuncoes?.length) {
    L.push("", `PRESUNÇÕES (${m.presuncoes.length})`);
    for (const p of m.presuncoes) L.push(`  NF ${p.nf} · ${p.fornecedor} · chegada ${p.data_chegada} · ${p.centro} · ${p.unidades} un · valor NF ${brl(p.valor_nf)} · presumido ${brl(p.valor_presumido)} · ${p.motivo}`);
  }
  if (m.delta_pre_final) {
    const d = m.delta_pre_final;
    L.push("", "DELTA PRÉ-FECHAMENTO x FINAL", `  Quantidade: presumida ${d.qtd_presumida}, real ${d.qtd_real}, delta ${d.delta_qtd}`, `  Valor: presumido ${brl(d.valor_presumido)}, real ${brl(d.valor_real)}, delta ${brl(d.delta_valor)}`);
    for (const l of d.itens ?? []) L.push(`  NF ${l.nf} ${l.sku}: qtd ${l.qtd_presumida} -> ${l.qtd_real}, valor ${brl(l.valor_presumido)} -> ${brl(l.valor_real)}`);
  }
  L.push("", "CONTAS BANCÁRIAS");
  L.push("", "EXTRATOS DO MÊS");
  for (const [k,v] of Object.entries(m.bancos??{}) as [string,any][]) {
    const e=v.extrato_mensal;
    if(e) L.push(`  ${k}: ${e.nome} · ${e.periodo_inicio??"não conferido"} a ${e.periodo_fim??"não conferido"}`,`  Inicial arquivo ${brl(e.saldo_inicial)} x SNCF ${brl(e.saldo_inicial_sncf)}, diferença ${brl(e.conferencia?.diferenca_inicial)}`,`  Final arquivo ${brl(e.saldo_final)} x SNCF ${brl(e.saldo_final_sncf)}, diferença ${brl(e.conferencia?.diferenca_final)}`);
  }
  for(const a of m.avisos_extratos_mensais??[]) L.push(`  AVISO ${a.conta}: ${a.avisos.join("; ")}`);
  L.push("",`ARQUIVOS DE APOIO SEM ORIGINAL (${m.arquivos_apoio_sem_original?.total??0}) — informativo`);
  for (const [k, v] of Object.entries(m.bancos ?? {}) as [string, any][]) L.push(`  ${k}: ${v.importacoes} importação(ões), ${v.com_arquivo} com arquivo, ${v.linhas ?? 0} linhas, saldo inicial ${brl(v.saldo_inicial)}, final ${brl(v.saldo_final)}, ${v.nao_conciliadas ?? 0} não conciliadas`);
  if (m.bloco_k) {
    const b = m.bloco_k;
    L.push("", `BLOCO K (${b.linhas} linhas)`);
    for (const [k, v] of Object.entries(b.por_posse ?? {}) as [string, any][]) L.push(`  ${k}: ${v.linhas} linhas, ${v.unidades} un, ${brl(v.valor)}`);
    for (const c of b.centros_posse_a_confirmar ?? []) L.push(`  AVISO: centro ${c} com "estoque em poder de" a confirmar`);
    for (const c of b.centros_sem_cnpj_participante ?? []) L.push(`  AVISO: centro ${c} em poder de terceiros sem CNPJ do participante`);
    L.push(`  Produtos sem NCM/unidade: ${b.produtos_sem_cadastro.total} (sem NCM ${b.produtos_sem_cadastro.sem_ncm}, sem unidade ${b.produtos_sem_cadastro.sem_unidade})`);
    for (const p of b.produtos_sem_cadastro.itens ?? []) L.push(`    ${p.codigo} ${p.produto}: ${[p.sem_ncm ? "sem NCM" : "", p.sem_unidade ? "sem unidade" : ""].filter(Boolean).join(", ")}`);
  }
  if (m.numeracao_nf) {
    const n = m.numeracao_nf;
    L.push("", `NUMERAÇÃO DAS NFs — canceladas ${n.canceladas}, inutilizadas ${n.inutilizadas}, não autorizadas ${n.nao_autorizadas}, não identificadas ${n.buracos}`);
    if (n.pendentes_no_prazo) L.push(`  ALERTA: ${n.pendentes_no_prazo} número(s) sem NF autorizada — inutilizar até ${n.prazo_inutilizacao}`);
    for (const i of (n.detalhe ?? []).filter((x: any) => x.ocorrencia !== "cancelada")) L.push(`  ${DOC(i.emitente_cnpj)} série ${i.serie} nº ${i.numero}: ${i.detalhe}`);
  }
  L.push("", `NFs CANCELADAS (${(m.eventos_nf ?? []).length}) - evento de cancelamento/CC-e indisponível na origem`);
  for (const e of m.eventos_nf ?? []) L.push(`  NF ${e.numero}`);
  if (m.cobertas_reimportacao?.total) {
    const rot: Record<string, string> = { mesmo_nome: "mesmo nome", periodo_coberto_na_competencia: "período coberto na competência" };
    L.push("", `COBERTAS POR REIMPORTAÇÃO (${m.cobertas_reimportacao.total})`);
    for (const c of m.cobertas_reimportacao.itens) L.push(`  ${c.antiga.nome} (${c.antiga.fonte}, ${c.antiga.conta}, ${c.antiga.importada_em}) -> ${c.com_arquivo.nome} (${c.com_arquivo.importada_em}) · ${rot[c.criterio] ?? c.criterio}`);
  }
  L.push("", `FALTANTES (${(m.faltantes ?? []).length})`);
  for (const f of m.faltantes ?? []) L.push(`  [${f.pasta}] ${f.referencia}: ${f.motivo}`);
  return pdfTexto(L);
}
