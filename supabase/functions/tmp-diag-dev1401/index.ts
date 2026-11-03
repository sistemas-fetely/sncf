// TEMPORÁRIA — diagnóstico só leitura DEV-B2C-1401. Remover após uso.
import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
// deno-lint-ignore-file no-explicit-any
Deno.serve(async () => {
  const out: any = {};
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    const bling = makeBlingClient(db, cfg, await ensureFreshToken(db, cfg));
    const r = (await bling.get(`/nfe/27251144278`))?.data;
    out.rascunho = { situacao: r?.situacao, numero: r?.numero, serie: r?.serie, chave: r?.chaveAcesso, situacaoCancelamento: r?.situacaoCancelamento, contato: r?.contato?.nome, dataEmissao: r?.dataEmissao, tipo: r?.tipo };
    const lista: any[] = [];
    for (let p = 1; p <= 10; p++) {
      const pg = (await bling.get(`/nfe?tipo=0&dataEmissaoInicial=2026-10-28%2000:00:00&pagina=${p}&limite=100`))?.data ?? [];
      lista.push(...pg); if (pg.length < 100) break;
    }
    out.total_entrada = lista.length;
    out.entradas_resumo = lista.map((n) => ({ id: n.id, numero: n.numero, serie: n.serie, situacao: n.situacao, contato: n.contato?.nome, data: n.dataEmissao }));
    const cand = lista.filter((n) => /silvane/i.test(n.contato?.nome ?? "") || n.id === 27251144278);
    out.candidatas = [];
    for (const n of cand) {
      const d = (await bling.get(`/nfe/${n.id}`))?.data;
      out.candidatas.push({ id: n.id, numero: d?.numero, serie: d?.serie, situacao: d?.situacao, chave: d?.chaveAcesso, data: d?.dataEmissao, contato: d?.contato?.nome, ref683: JSON.stringify(d).includes("0000006831540928042") || JSON.stringify(d).includes("000683") });
    }
  } catch (e) { out.erro = String((e as any)?.message ?? e); }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
