// Mercado Pago — relatórios automáticos (Fase 1, 03/11/2026, Flávio).
// SNCF pede e depois baixa (sem SFTP, webhook nem mudança na configuração do MP).
//  - pedir   (cron 06:00 BRT): dia anterior. Liberações → POST release_report (sai CSV).
//                              Vendas → usa o arquivo do agendamento do MP (scheduled=true já existe).
//  - coletar (cron 07–13 BRT, de hora em hora): lista, baixa, guarda o original no bucket contabil
//                              e importa pela MESMA regra da tela (_shared/financeiro/mp).
//  - dia     (sessão com acao.mp_relatorio.reprocessar): pedir + coletar de um dia (teste/reprocesso).
//  - retroativo (sessão com a ação): cria as linhas dos dias faltantes desde `desde`; coletar faz o resto.
// Saques: só pelo relatório de liberações; mp_withdraw continua manual (dedup em saqueJaRegistrado).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";
import { ContagemImportacao } from "../_shared/financeiro/contagem-importacao.ts";
import { aplicarMpRelease, lerCsvMp, normalizarMpRelease } from "../_shared/financeiro/mp/release.ts";
import { aplicarMpSettlement, normalizarMpSettlement } from "../_shared/financeiro/mp/settlement.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e));
const MP = "https://api.mercadopago.com/v1/account";
const FONTE: Record<string, string> = { release: "mp_release", settlement: "mp_settlement" };
const INICIO_BACKFILL = "2026-09-15";
const MAX_TENTATIVAS = 12;

type Tipo = "release" | "settlement";
const hojeBrt = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somaDia = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const inicioUtc = (d: string) => `${d}T03:00:00Z`;
const fimUtc = (d: string) => `${somaDia(d, 1)}T02:59:59Z`;
// Período do arquivo na lista → dias BRT cobertos.
const diaBrt = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const negado = await gateCronOuSessao(req, db, corsHeaders);
  if (negado) return negado;
  const body = await req.json().catch(() => ({}));
  const acao = String(body?.acao ?? "");

  // Ações manuais exigem a ação do catálogo (cron passa só pelo segredo).
  if (!req.headers.get("x-cron-secret")) {
    if (!["dia", "retroativo", "coletar", "status"].includes(acao)) return json({ ok: false, erro: "ação inválida" }, 400);
    const { data: u } = await db.auth.getUser((req.headers.get("Authorization") ?? "").slice(7));
    const { data: pode, error } = await db.rpc("usuario_tem_acao", { p_slug: "acao.mp_relatorio.reprocessar", p_user_id: u?.user?.id });
    if (error) return json({ ok: false, erro: error.message }, 500);
    if (!pode) return json({ ok: false, erro: "Sem permissão (acao.mp_relatorio.reprocessar)" }, 403);
  }

  const { data: token, error: te } = await db.rpc("get_vault_secret", { p_name: "mp_access_token" });
  if (te || !token) return json({ ok: false, erro: te?.message ?? "mp_access_token não cadastrado no cofre" }, 500);
  const mp = new ClienteMp(String(token));

  try {
    if (acao === "pedir") {
      const dia = validarDia(body.dia) ?? somaDia(hojeBrt(), -1);
      return json({ ok: true, pedido: await pedir(db, mp, dia) });
    }
    if (acao === "coletar") return json({ ok: true, ...(await coletar(db, mp)) });
    if (acao === "dia") {
      const dia = validarDia(body.dia);
      if (!dia || dia >= hojeBrt()) return json({ ok: false, erro: "Informe um dia passado (AAAA-MM-DD)" }, 400);
      const pedido = await pedir(db, mp, dia, true);
      // O release pedido leva ~1 min no MP: espera até 2 min para fechar o dia numa chamada só.
      let r = await coletar(db, mp, dia);
      for (let i = 0; i < 6 && r.aguardando > 0; i++) { await new Promise((s) => setTimeout(s, 20_000)); r = await coletar(db, mp, dia); }
      const { data: linhas } = await db.from("mp_relatorio_execucao").select("*").eq("dia", dia);
      return json({ ok: true, pedido, ...r, linhas });
    }
    if (acao === "retroativo") {
      const desde = validarDia(body.desde) ?? INICIO_BACKFILL;
      return json({ ok: true, ...(await retroativo(db, mp, desde)) });
    }
    return json({ ok: false, erro: "ação inválida" }, 400);
  } catch (e) {
    console.error("mp-relatorios", acao, msg(e));
    return json({ ok: false, erro: msg(e) }, 500);
  }
});

function validarDia(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

class ClienteMp {
  private listas: Record<string, any[]> = {};
  constructor(private token: string) {}
  private h() { return { Authorization: `Bearer ${this.token}` }; }
  private limpar(t: string) { return t.replaceAll(this.token, "***").slice(0, 300); }
  async lista(tipo: Tipo): Promise<any[]> {
    if (this.listas[tipo]) return this.listas[tipo];
    const r = await fetch(`${MP}/${tipo}_report/list`, { headers: this.h() });
    const t = await r.text();
    if (!r.ok) throw new Error(`MP ${tipo}_report/list HTTP ${r.status}: ${this.limpar(t)}`);
    return (this.listas[tipo] = JSON.parse(t));
  }
  async pedir(tipo: Tipo, dia: string): Promise<number | null> {
    const r = await fetch(`${MP}/${tipo}_report`, {
      method: "POST", headers: { ...this.h(), "Content-Type": "application/json" },
      body: JSON.stringify({ begin_date: inicioUtc(dia), end_date: fimUtc(dia) }),
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`MP POST ${tipo}_report HTTP ${r.status}: ${this.limpar(t)}`);
    delete this.listas[tipo];
    try { return JSON.parse(t).id ?? null; } catch { return null; }
  }
  async baixar(tipo: Tipo, fileName: string): Promise<Uint8Array> {
    const r = await fetch(`${MP}/${tipo}_report/${encodeURIComponent(fileName)}`, { headers: this.h() });
    if (!r.ok) throw new Error(`MP download ${fileName} HTTP ${r.status}: ${this.limpar(await r.text())}`);
    return new Uint8Array(await r.arrayBuffer());
  }
}

/** Arquivo pronto que cobre o dia: exato primeiro (o mais novo), depois o menor período que contém o dia. */
function arquivoDoDia(lista: any[], dia: string, preferirAgendado: boolean): any | null {
  const prontos = lista.filter((x) => x.file_name && ["enabled", "processed"].includes(x.status));
  const cobre = prontos.filter((x) => diaBrt(x.begin_date) <= dia && diaBrt(x.end_date) >= dia);
  const exatos = cobre.filter((x) => diaBrt(x.begin_date) === dia && diaBrt(x.end_date) === dia)
    .sort((a, b) => (preferirAgendado ? Number(b.created_from === "schedule") - Number(a.created_from === "schedule") : 0) || String(b.date_created).localeCompare(String(a.date_created)));
  if (exatos.length) return exatos[0];
  const dur = (x: any) => Date.parse(x.end_date) - Date.parse(x.begin_date);
  return cobre.sort((a, b) => dur(a) - dur(b))[0] ?? null;
}

async function pedir(db: any, mp: ClienteMp, dia: string, refazer = false) {
  const out: Record<string, string> = {};
  for (const tipo of ["release", "settlement"] as Tipo[]) {
    const { data: atual } = await db.from("mp_relatorio_execucao").select("id,status").eq("tipo", tipo).eq("dia", dia).maybeSingle();
    if (atual && !refazer && atual.status !== "erro") { out[tipo] = `já existe (${atual.status})`; continue; }
    if (atual && refazer && ["importado", "sem_movimento"].includes(atual.status)) { out[tipo] = `já ${atual.status} — reimporta pelo mesmo arquivo`; }
    let reportId: number | null = null; let origem = "schedule_mp";
    if (tipo === "release") {
      // Liberações: o MP não gera pelo agendamento → SNCF pede (sem tocar na configuração).
      const existente = arquivoDoDia(await mp.lista(tipo), dia, false);
      if (existente && diaBrt(existente.begin_date) === dia && diaBrt(existente.end_date) === dia) origem = "arquivo_mp_existente";
      else { reportId = await mp.pedir(tipo, dia); origem = "sncf_pedido"; }
    }
    const linha = { tipo, dia, origem, status: "aguardando", mp_report_id: reportId, erro: null, tentativas: 0, solicitado_em: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { error } = await db.from("mp_relatorio_execucao").upsert(linha, { onConflict: "tipo,dia" });
    if (error) throw error;
    out[tipo] ??= origem;
  }
  return out;
}

async function coletar(db: any, mp: ClienteMp, soDia?: string) {
  let q = db.from("mp_relatorio_execucao").select("*").eq("status", "aguardando").order("dia").order("tipo").limit(40);
  if (soDia) q = q.eq("dia", soDia);
  const { data: pend, error } = await q;
  if (error) throw error;
  const res: any[] = []; let aguardando = 0;
  const importadosPorArquivo = new Map<string, any>();
  for (const p of pend ?? []) {
    try {
      const lista = await mp.lista(p.tipo);
      const arq = arquivoDoDia(lista, p.dia, p.tipo === "settlement");
      if (!arq) {
        const tent = p.tentativas + 1;
        // Vendas: se o agendamento do MP não gerou o dia até a 4ª conferida, SNCF pede.
        if (p.tipo === "settlement" && tent === 4 && !p.mp_report_id) {
          const id = await mp.pedir("settlement", p.dia);
          await atualizar(db, p.id, { tentativas: tent, mp_report_id: id, origem: "sncf_pedido" });
        } else if (tent >= MAX_TENTATIVAS) {
          await atualizar(db, p.id, { tentativas: tent, status: "erro", erro: "Mercado Pago não entregou o arquivo do dia" });
        } else await atualizar(db, p.id, { tentativas: tent });
        aguardando++; res.push({ tipo: p.tipo, dia: p.dia, resultado: "aguardando" }); continue;
      }
      const chave = `${p.tipo}|${arq.file_name}`;
      let imp = importadosPorArquivo.get(chave);
      if (!imp) {
        imp = await importarArquivo(db, mp, p.tipo, arq.file_name);
        importadosPorArquivo.set(chave, imp);
      }
      await atualizar(db, p.id, {
        status: imp.lidas === 0 ? "sem_movimento" : "importado", erro: null, file_name: arq.file_name,
        extrato_importacao_id: imp.impId, arquivo_storage_path: imp.path, tentativas: p.tentativas + 1,
        linhas_lidas: imp.lidas, linhas_novas: imp.novas, linhas_duplicadas: imp.duplicadas,
        linhas_enriquecidas: imp.enriquecidas, linhas_ignoradas: imp.ignoradas, importado_em: new Date().toISOString(),
      });
      res.push({ tipo: p.tipo, dia: p.dia, resultado: "importado", file_name: arq.file_name, ...imp });
    } catch (e) {
      const tent = p.tentativas + 1;
      await atualizar(db, p.id, { tentativas: tent, erro: msg(e), status: tent >= 5 ? "erro" : "aguardando" });
      res.push({ tipo: p.tipo, dia: p.dia, resultado: "erro", erro: msg(e) });
    }
  }
  return { processados: res.length, aguardando, resultados: res };
}

async function atualizar(db: any, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("mp_relatorio_execucao").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

async function sha256Hex(b: Uint8Array) {
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const nomeSeguro = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\\/]+/g, "_").replace(/\s+/g, "_").replace(/[^A-Za-z0-9._-]/g, "") || "arquivo";

/** Mesmo caminho da importação manual: linha em extrato_importacoes, original no bucket, regra compartilhada, conta fechada. */
async function importarArquivo(db: any, mp: ClienteMp, tipo: Tipo, fileName: string) {
  const fonte = FONTE[tipo];
  const { data: mapa, error: em } = await db.from("importacao_fonte_conta").select("conta_bancaria_id").eq("fonte", fonte).maybeSingle();
  if (em) throw em;
  const conta = mapa?.conta_bancaria_id;
  if (!conta) throw new Error(`Fonte ${fonte} sem conta mapeada em importacao_fonte_conta`);

  // Arquivo já importado com sucesso (mesmo nome e fonte): não reimporta — reusa a linha.
  const { data: ja } = await db.from("extrato_importacoes").select("id,arquivo_storage_path,linhas_lidas,linhas_novas,linhas_duplicadas,linhas_enriquecidas,linhas_ignoradas")
    .eq("fonte_tipo", fonte).eq("nome_arquivo", fileName).eq("status", "concluida").not("arquivo_storage_path", "is", null).limit(1).maybeSingle();
  if (ja) return { impId: ja.id, path: ja.arquivo_storage_path, lidas: ja.linhas_lidas, novas: ja.linhas_novas, duplicadas: ja.linhas_duplicadas, enriquecidas: ja.linhas_enriquecidas, ignoradas: ja.linhas_ignoradas, reaproveitado: true };

  const bytes = await mp.baixar(tipo, fileName);
  const { data: imp, error: ei } = await db.from("extrato_importacoes")
    .insert({ conta_bancaria_id: conta, fonte_tipo: fonte, nome_arquivo: fileName, status: "processando", importado_por: null }).select("id").single();
  if (ei) throw ei;
  const impId = imp.id as string;
  const cont = new ContagemImportacao();
  let periodoInicio: string | null = null, periodoFim: string | null = null;
  try {
    const rows: unknown[][] = fileName.toLowerCase().endsWith(".csv")
      ? lerCsvMp(new TextDecoder("utf-8").decode(bytes))
      : XLSX.utils.sheet_to_json<unknown[]>((() => { const wb = XLSX.read(bytes, { type: "array" }); return wb.Sheets[wb.SheetNames[0]]; })(), { header: 1, defval: null }) as unknown[][];
    if (tipo === "release") {
      const libs = normalizarMpRelease(rows);
      cont.ler(libs.length);
      const datas = libs.map((l) => l.data_liberacao).filter(Boolean).sort();
      periodoInicio = datas[0] ?? null; periodoFim = datas[datas.length - 1] ?? null;
      const { data: unid, error: eu } = await db.from("unidades").select("cnpj").eq("ativa", true).not("cnpj", "is", null).limit(1).maybeSingle();
      if (eu) throw eu;
      await aplicarMpRelease(db, conta, impId, libs, cont, (unid?.cnpj ?? "").replace(/\D/g, "") || null);
    } else {
      const trs = normalizarMpSettlement(rows);
      cont.ler(trs.length);
      const datas = trs.map((t) => t.data_liberacao).filter(Boolean).sort();
      periodoInicio = datas[0] ?? null; periodoFim = datas[datas.length - 1] ?? null;
      await aplicarMpSettlement(db, conta, trs, cont);
    }
    if (!cont.fecha()) throw new Error(cont.erroContaAberta());

    // Original na pasta da competência do período (o pacote do contador seleciona por período).
    const comp = (periodoFim ?? hojeBrt()).slice(0, 7);
    const path = `bancos/${comp}/${impId}/${nomeSeguro(fileName)}`;
    const tipoMime = fileName.endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const { error: eup } = await db.storage.from("contabil").upload(path, new Blob([bytes], { type: tipoMime }), { upsert: false, contentType: tipoMime });
    if (eup) throw new Error(`Não foi possível guardar o arquivo original: ${eup.message}`);
    const { error: ef } = await db.from("extrato_importacoes").update({
      status: "concluida", erro_detalhe: null, linhas_lidas: cont.lidas, linhas_novas: cont.novas, linhas_enriquecidas: cont.enriquecidas,
      linhas_duplicadas: cont.duplicadas, linhas_ignoradas: cont.ignoradas, ignoradas_detalhe: { ...cont.detalhe, origem: "mp-relatorios" },
      periodo_inicio: periodoInicio, periodo_fim: periodoFim, arquivo_storage_path: path, arquivo_sha256: await sha256Hex(bytes),
      arquivo_bytes: bytes.length, arquivo_anexado_em: new Date().toISOString(),
    }).eq("id", impId);
    if (ef) throw new Error(`Linhas gravadas, mas o fechamento da importação falhou: ${ef.message}`);
    return { impId, path, lidas: cont.lidas, novas: cont.novas, duplicadas: cont.duplicadas, enriquecidas: cont.enriquecidas, ignoradas: cont.ignoradas };
  } catch (e) {
    await db.from("extrato_importacoes").update({
      status: "erro", erro_detalhe: msg(e), linhas_lidas: cont.lidas, linhas_novas: cont.novas, linhas_duplicadas: cont.duplicadas,
      linhas_enriquecidas: cont.enriquecidas, linhas_ignoradas: cont.ignoradas, periodo_inicio: periodoInicio, periodo_fim: periodoFim,
    }).eq("id", impId);
    throw e;
  }
}

/** Retroativo: cria as linhas dos dias faltantes. Vendas pelo agendamento do MP; liberações por
 *  arquivo já existente no MP (ex.: mensais manuais) e, onde não houver, pedido do SNCF. Coletar importa. */
async function retroativo(db: any, mp: ClienteMp, desde: string) {
  const ontem = somaDia(hojeBrt(), -1);
  const { data: feitos } = await db.from("mp_relatorio_execucao").select("tipo,dia,status").gte("dia", desde);
  const tem = new Set((feitos ?? []).filter((f: any) => f.status !== "erro").map((f: any) => `${f.tipo}|${f.dia}`));
  let criadas = 0, pedidos = 0;
  for (let d = desde; d <= ontem; d = somaDia(d, 1)) {
    for (const tipo of ["release", "settlement"] as Tipo[]) {
      if (tem.has(`${tipo}|${d}`)) continue;
      const arq = arquivoDoDia(await mp.lista(tipo), d, tipo === "settlement");
      let origem = tipo === "settlement" ? "schedule_mp" : "arquivo_mp_existente"; let id: number | null = null;
      if (!arq && tipo === "release") { id = await mp.pedir("release", d); origem = "sncf_pedido"; pedidos++; }
      const { error } = await db.from("mp_relatorio_execucao").upsert({ tipo, dia: d, origem, status: "aguardando", mp_report_id: id, tentativas: 0, erro: null, updated_at: new Date().toISOString() }, { onConflict: "tipo,dia" });
      if (error) throw error;
      criadas++;
    }
  }
  return { desde, ate: ontem, linhas_criadas: criadas, pedidos_release: pedidos };
}
