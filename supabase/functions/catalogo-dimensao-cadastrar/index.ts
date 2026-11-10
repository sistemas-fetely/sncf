import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { kindDoCampo } from '../_shared/catalogo-dimensao/campos.ts';
import { cadastrarDimensao } from './cadastrar.ts';

const Body = z.object({ campo: z.string(), nome: z.string().min(1).max(255).refine(n => !!n.trim(), 'Nome obrigatório.') }).strict();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'Use POST.' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, erro: 'Sessão obrigatória.' }, 401);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const usuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
  try {
    const { data: u, error } = await usuario.auth.getUser(auth.slice(7));
    if (error || !u.user) return json({ ok: false, erro: 'Sessão inválida.' }, 401);
    const perm = await usuario.rpc('usuario_tem_acao', { p_slug: 'acao.produto_importar_planilha_cadastro' });
    if (perm.error) throw perm.error;
    if (perm.data !== true) return json({ ok: false, erro: 'Sem permissão para cadastrar dimensões.' }, 403);
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ ok: false, erro: 'Pedido inválido.', detalhes: body.error.flatten().fieldErrors }, 400);
    try { kindDoCampo(body.data.campo); } catch (e) { return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 400); }
    const perfil = await sb.from('profiles').select('full_name').eq('user_id', u.user.id).maybeSingle();
    if (perfil.error) throw perfil.error;
    const quem = { id: u.user.id, nome: perfil.data?.full_name || u.user.email || u.user.id };
    const cfg = await sb.from('integracoes_config').select('config').eq('sistema', 'fop').maybeSingle();
    if (cfg.error) throw cfg.error;
    const base = String((cfg.data?.config as Record<string, unknown> | null)?.fop_base_url ?? '').replace(/\/+$/, '');
    if (!/^https:\/\//.test(base)) throw new Error('Endereço do FOP não configurado em TI › Integrações.');
    const tk = await sb.rpc('get_vault_secret', { p_name: 'FOP_INBOUND_TOKEN' });
    if (tk.error || !tk.data) throw new Error('FOP_INBOUND_TOKEN indisponível no Vault.');
    const resultado = await cadastrarDimensao(body.data.campo, body.data.nome, quem, {
      chamarFop: async corpo => {
        let r: Response;
        try { r = await fetch(`${base}/api/public/catalogo-dimensao-cadastrar`, { method: 'POST', headers: { Authorization: `Bearer ${tk.data}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(30000) }); }
        catch { throw new Error('Não foi possível conectar ao FOP para cadastrar a dimensão. Tente novamente.'); }
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`FOP HTTP ${r.status}: ${typeof d?.erro === 'string' ? d.erro : 'cadastro da dimensão recusado.'}`);
        return d;
      },
      auditar: async d => {
        const r = await sb.from('audit_log').insert({ user_id: quem.id, user_nome: quem.nome, acao: 'catalogo_dimensao_cadastrar', tabela: d.kind === 'cor' ? 'fop_cores' : 'fop_colecoes', registro_id: d.id, dados_depois: { kind: d.kind, nome: d.nome, criado: d.criado }, justificativa: 'Dimensão confirmada na revisão do catálogo.' });
        if (r.error) throw new Error(`Dimensão cadastrada no FOP, mas a auditoria falhou: ${r.error.message}`);
      },
    });
    return json(resultado);
  } catch (e) { return json({ ok: false, erro: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }, 502); }
});