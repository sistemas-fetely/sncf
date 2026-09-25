// Upload da NF de serviço / RPA pelo portal do representante.
// Pública (sem JWT): a segurança é a sessão do portal, validada com service role.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const BUCKET = 'comissao-documento-fiscal'
const MAX_BYTES = 10 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXT_MIME: Record<string, string[]> = {
  pdf: ['application/pdf'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  xml: ['application/xml', 'text/xml'],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
const erro = (msg: string, status: number) => json({ ok: false, erro: msg }, status)

function sanear(nome: string): string {
  const s = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '')
  return (s || 'arquivo').slice(-120)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return erro('Método não permitido', 405)
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return erro('Infra: SUPABASE_URL/SERVICE_ROLE_KEY ausentes', 500)
  const supabase = createClient(url, key)

  let form: FormData
  try { form = await req.formData() } catch { return erro('Envie multipart/form-data', 400) }
  const campo = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : '' }
  const sessao = campo('sessao'), extratoId = campo('extrato_id'), tipo = campo('tipo')
  const numero = campo('numero'), dataEmissao = campo('data_emissao'), valorTxt = campo('valor')
  const arquivo = form.get('arquivo')

  if (!sessao || sessao.length > 200) return erro('Sessão expirada. Abra de novo o link do e-mail.', 401)
  if (!UUID.test(extratoId)) return erro('extrato_id inválido', 400)
  if (tipo !== 'nf_servico' && tipo !== 'rpa') return erro("tipo deve ser 'nf_servico' ou 'rpa'", 400)
  if (!numero || numero.length > 60) return erro('Informe o número do documento', 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao) || isNaN(Date.parse(`${dataEmissao}T00:00:00Z`))) return erro('data_emissao deve ser AAAA-MM-DD', 400)
  const valor = Number(valorTxt.replace(',', '.'))
  if (!Number.isFinite(valor) || valor <= 0) return erro('Informe um valor válido', 400)

  // a) sessão
  const { data: vendedorId, error: sErr } = await supabase.rpc('fn_portal_vendedor_da_sessao', { p_token: sessao })
  if (sErr) return erro(`fn_portal_vendedor_da_sessao: ${sErr.message}`, 500)
  if (!vendedorId) return erro('Sessão expirada. Abra de novo o link do e-mail.', 401)

  // b) arquivo
  if (!(arquivo instanceof File)) return erro('Anexe o arquivo da nota', 400)
  if (arquivo.size === 0) return erro('Arquivo vazio', 400)
  if (arquivo.size > MAX_BYTES) return erro('Arquivo acima de 10 MB', 400)
  const ext = (arquivo.name.split('.').pop() ?? '').toLowerCase()
  const mimes = EXT_MIME[ext]
  if (!mimes) return erro('Formato não aceito. Envie PDF, JPG, PNG ou XML.', 400)
  if (arquivo.type && !mimes.includes(arquivo.type) && arquivo.type !== 'application/octet-stream') {
    return erro('Formato não aceito. Envie PDF, JPG, PNG ou XML.', 400)
  }

  // competência do extrato (somente do próprio vendedor)
  const { data: ext_, error: eErr } = await supabase.from('comissao_extrato').select('competencia,vendedor_id').eq('id', extratoId).maybeSingle()
  if (eErr) return erro(`Leitura do extrato: ${eErr.message}`, 500)
  if (!ext_ || ext_.vendedor_id !== vendedorId) return erro('Extrato não encontrado para este representante', 404)
  const comp = String(ext_.competencia ?? '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(comp)) return erro('Extrato sem competência válida', 500)

  // c) grava
  const caminho = `${vendedorId}/${comp}/${Date.now()}_${sanear(arquivo.name)}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type || mimes[0],
    upsert: false,
  })
  if (upErr) return erro(`Falha ao gravar o arquivo: ${upErr.message}`, 500)

  // d) registra
  const remover = async () => {
    const { error } = await supabase.storage.from(BUCKET).remove([caminho])
    if (error) console.error('[portal-documento-upload] órfão não removido', caminho, error.message)
  }
  const { data: res, error: rErr } = await supabase.rpc('fn_portal_documento_enviar', {
    p_sessao: sessao,
    p_extrato_id: extratoId,
    p_tipo: tipo,
    p_numero: numero,
    p_data_emissao: dataEmissao,
    p_valor: valor,
    p_arquivo_path: caminho,
  })
  if (rErr) {
    await remover()
    return erro(rErr.message, 400)
  }
  // e) recusa → remove
  if ((res as any)?.ok === false) {
    await remover()
    return json(res, 400)
  }
  // f)
  return json(res)
})
