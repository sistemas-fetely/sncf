// Pacote do Contador v2 (03/11/2026). Gera o ZIP em segundo plano a partir de uma remessa
// criada por fn_remessa_contador_iniciar. Partes de até progresso.limite_parte_mb; progresso
// gravado por etapa; nova chamada com a mesma remessa retoma da última parte concluída.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { Zip, ZipDeflate, ZipPassThrough } from "npm:fflate@0.8.2";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { assinarPartes, BUCKET, enviarEmailRemessa, type Parte } from "../_shared/pacote-contador/remessa.ts";

const ORCAMENTO_MS = 320_000; // abaixo do limite do runtime; acima disso, pausa e a tela retoma
const HEARTBEAT_VIVO_MS = 90_000;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e));

type Entrada = { zip: string; path: string; bytes?: number };
type Faltante = { pasta: string; referencia: string; motivo: string };

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
    const nome = ultima && indice === 1 ? `pacote-contador-${mes}-v${rem.versao}.zip` : `pacote-contador-${mes}-v${rem.versao}-parte${indice}.zip`;
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

async function inventario(c: { admin: any; userDb: any }, rem: any) {
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
  const s = (a: any[], k: string) => Math.round(a.reduce((x, y) => x + Number(y[k] ?? 0), 0) * 100) / 100;
  const conferencia = {
    posicao: { skus: pos.data.length, unidades: s(pos.data, "quantidade"), valor: s(pos.data, "valor_total") },
    vendas: { pedidos: vendas.data.length, receita: s(vendas.data, "receita_total"), cmv: s(vendas.data, "cmv") },
    nfs: { notas: nfsP.data.length, receita: s(nfsP.data, "receita_total") },
    diferenca_vendas_menos_nfs: Math.round((s(vendas.data, "receita_total") - s(nfsP.data, "receita_total")) * 100) / 100,
  };
  const pdfResumo = await pdfTexto([`Resumo do pacote contábil ${ini.slice(5, 7)}/${ini.slice(0, 4)} v${rem.versao}`, "",
    `Posição de estoque: ${conferencia.posicao.skus} SKUs, ${conferencia.posicao.unidades} un, ${brl(conferencia.posicao.valor)}`,
    `Vendas do período: ${conferencia.vendas.pedidos} pedidos, receita ${brl(conferencia.vendas.receita)}, CMV ${brl(conferencia.vendas.cmv)}`,
    `NFs do período: ${conferencia.nfs.notas} notas, receita ${brl(conferencia.nfs.receita)}`,
    `Diferença vendas - NFs: ${brl(conferencia.diferenca_vendas_menos_nfs)}`]);
  const resumoPath = `pacotes/${String(rem.competencia).slice(0, 7)}/v${rem.versao}/resumo.pdf`;
  const up = await admin.storage.from(BUCKET).upload(resumoPath, pdfResumo, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`Falha ao gravar resumo.pdf: ${up.error.message}`);
  entradas.push({ zip: nomeUnico("01_relatorios/resumo.pdf"), path: resumoPath }); conta("01_relatorios");

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
  const ent = await todas(admin.from("nfs_stage").select("nf_numero,nf_serie,fornecedor_razao_social,valor,xml_storage_path,status")
    .gte("nf_data_emissao", ini).lte("nf_data_emissao", fimP).not("status", "in", "(descartada,duplicada)"));
  pastas["03_nfs_entrada"] ??= { arquivos: 0 };
  for (const n of ent) {
    const ref = `NF ${n.nf_numero ?? "?"} · ${n.fornecedor_razao_social ?? "?"}`;
    if (!n.xml_storage_path) { faltantes.push({ pasta: "03_nfs_entrada", referencia: ref, motivo: "XML de entrada não capturado" }); continue; }
    entradas.push({ zip: nomeUnico(`03_nfs_entrada/${n.xml_storage_path.split("/").pop()}`), path: n.xml_storage_path });
    conta("03_nfs_entrada", 1, Number(n.valor ?? 0), 1);
  }

  // 04_bancos
  const contas = await todas(admin.from("contas_bancarias").select("id,nome_exibicao,banco,numero_conta"));
  const nomeConta = new Map(contas.map((k: any) => [k.id, seguro(k.nome_exibicao || `${k.banco} ${k.numero_conta ?? ""}`)]));
  const imps = await todas(admin.from("extrato_importacoes").select("id,conta_bancaria_id,fonte_tipo,nome_arquivo,periodo_inicio,periodo_fim,status,created_at,linhas_novas,arquivo_storage_path")
    .lte("periodo_inicio", fimP).gte("periodo_fim", ini).neq("status", "erro"));
  const bancos: Record<string, any> = {};
  for (const imp of imps) {
    const cn = nomeConta.get(imp.conta_bancaria_id) ?? "sem_conta";
    bancos[cn] ??= { importacoes: 0, com_arquivo: 0 };
    bancos[cn].importacoes++;
    const sub = imp.fonte_tipo === "arquivo_nao_lido" ? "outros" : seguro(imp.fonte_tipo ?? "outros");
    if (!imp.arquivo_storage_path) {
      faltantes.push({ pasta: `04_bancos/${cn}/${sub}`, referencia: `${imp.nome_arquivo ?? "?"} · ${imp.fonte_tipo} · ${String(imp.created_at).slice(0, 10)}`, motivo: "Importação sem arquivo original guardado" });
      continue;
    }
    bancos[cn].com_arquivo++;
    entradas.push({ zip: nomeUnico(`04_bancos/${cn}/${sub}/${seguro(imp.nome_arquivo ?? imp.arquivo_storage_path.split("/").pop())}`), path: imp.arquivo_storage_path });
    conta(`04_bancos/${cn}/${sub}`);
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

  const manifesto = {
    competencia: rem.competencia, versao: rem.versao, gerado_por: rem.gerado_por,
    total_arquivos: entradas.length + 2,
    pastas, pdf_origem: { danfe_bling: pdfOrigem.bling, resumo_nfe_gerado_xml: pdfOrigem.gerado_xml, sem_pdf: pdfOrigem.sem_pdf },
    conferencia, bancos, eventos_nf: eventos, faltantes,
  };
  return { entradas, manifesto };
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

function pdfManifesto(m: any): Promise<Uint8Array> {
  const L: string[] = [`Manifesto do pacote contábil ${String(m.competencia).slice(5, 7)}/${String(m.competencia).slice(0, 4)} - versão ${m.versao}`, `Gerado em ${m.gerado_em} · ${m.partes} parte(s) · ${m.total_arquivos} arquivo(s)`, "", "PASTAS"];
  for (const [k, v] of Object.entries(m.pastas ?? {}) as [string, any][]) L.push(`  ${k}: ${v.arquivos} arquivo(s)${v.nfs != null ? `, ${v.nfs} NF(s)` : ""}${v.valor_total != null ? `, ${brl(v.valor_total)}` : ""}`);
  L.push("", "PDF DAS NFs DE SAÍDA", `  DANFE do Bling: ${m.pdf_origem.danfe_bling}`, `  Resumo NF-e gerado do XML: ${m.pdf_origem.resumo_nfe_gerado_xml}`, `  Sem PDF: ${m.pdf_origem.sem_pdf}`);
  const c = m.conferencia;
  L.push("", "CONFERÊNCIA NFs x VENDAS", `  Vendas: ${c.vendas.pedidos} pedidos, ${brl(c.vendas.receita)}`, `  NFs: ${c.nfs.notas} notas, ${brl(c.nfs.receita)}`, `  Diferença: ${brl(c.diferenca_vendas_menos_nfs)}`, `  Posição de estoque: ${c.posicao.skus} SKUs, ${brl(c.posicao.valor)}`);
  L.push("", "CONTAS BANCÁRIAS");
  for (const [k, v] of Object.entries(m.bancos ?? {}) as [string, any][]) L.push(`  ${k}: ${v.importacoes} importação(ões), ${v.com_arquivo} com arquivo, ${v.linhas ?? 0} linhas, saldo inicial ${brl(v.saldo_inicial)}, final ${brl(v.saldo_final)}, ${v.nao_conciliadas ?? 0} não conciliadas`);
  L.push("", `NFs CANCELADAS (${(m.eventos_nf ?? []).length}) - evento de cancelamento/CC-e indisponível na origem`);
  for (const e of m.eventos_nf ?? []) L.push(`  NF ${e.numero}`);
  L.push("", `FALTANTES (${(m.faltantes ?? []).length})`);
  for (const f of m.faltantes ?? []) L.push(`  [${f.pasta}] ${f.referencia}: ${f.motivo}`);
  return pdfTexto(L);
}
