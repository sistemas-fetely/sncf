-- 1. Vinculo acerto x NF de retorno simbolico (snapshot)
ALTER TABLE public.consignado_acerto
  ADD COLUMN IF NOT EXISTS nf_retorno_stage_id uuid REFERENCES public.nfs_stage(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nf_retorno_numero text,
  ADD COLUMN IF NOT EXISTS nf_retorno_chave text,
  ADD COLUMN IF NOT EXISTS nf_retorno_data date,
  ADD COLUMN IF NOT EXISTS nfs_remessa_ref jsonb;
COMMENT ON COLUMN public.consignado_acerto.nfs_remessa_ref IS
  'Lista {numero, serie, chave, data, origem} das NFs de remessa referenciadas pela NF de retorno. origem = nf_retorno (refNFe do stage) ou remessas_do_parceiro (fallback).';
CREATE UNIQUE INDEX IF NOT EXISTS ux_consignado_acerto_nf_retorno
  ON public.consignado_acerto(nf_retorno_stage_id) WHERE nf_retorno_stage_id IS NOT NULL;

-- 2. Miolo do PIX sem portao; gerar_pix_provisao vira wrapper com a checagem.
CREATE OR REPLACE FUNCTION public._gerar_pix_provisao_core(p_provisao_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
-- Miolo de gerar_pix_provisao SEM checagem de permissao. So para chamadas internas
-- (confirmar_acerto_consignado). Nunca exposto a anon/authenticated.
declare
  v_pr provisao_recebimento; v_ext text; v_txid text; v_banco banco_recebimento; v_payload text; v_token text;
begin
  select * into v_pr from provisao_recebimento where id = p_provisao_id;
  if not found then raise exception 'GERAR_PIX_PROVISAO: linha % nao existe.', p_provisao_id; end if;
  if v_pr.tipo_pagamento <> 'pix' then
    raise exception 'GERAR_PIX_PROVISAO: linha % e de "%", nao de pix. QR PIX nao se gera para outro instrumento.', p_provisao_id, v_pr.tipo_pagamento;
  end if;
  if v_pr.pago_em is not null or v_pr.status = 'pago' then
    raise exception 'GERAR_PIX_PROVISAO: linha % ja esta paga. Nao gero QR para cobranca liquidada.', p_provisao_id;
  end if;
  select id_externo into v_ext from pedidos where id = v_pr.pedido_id;
  v_txid := fn_pix_txid(v_ext);
  select * into v_banco from banco_recebimento where ativo and pix_chave is not null
   order by (nome = 'Safra') desc, nome limit 1;
  if not found then raise exception 'GERAR_PIX_PROVISAO: nenhum banco_recebimento ativo com pix_chave preenchida.'; end if;
  v_payload := fn_pix_brcode(v_banco.pix_chave, coalesce(v_banco.pix_beneficiario_nome, 'FETELY'),
    coalesce(v_banco.pix_beneficiario_cidade, 'SAO PAULO'), v_pr.valor, v_txid, true);
  -- Token estavel: so nasce uma vez. Regerar o QR NAO invalida link ja enviado ao cliente.
  v_token := coalesce(v_pr.pix_token, replace(gen_random_uuid()::text, '-', ''));
  update provisao_recebimento set link_pagamento = v_payload, pix_txid = v_txid, pix_token = v_token,
    pix_gerado_em = now(), pix_gerado_por = auth.uid(), updated_at = now()
  where id = p_provisao_id;
  -- Espelho no portao SO enquanto o legado existir.
  update pedido_portao set link_pagamento = v_payload, pix_txid = v_txid, pix_token = v_token,
    pix_gerado_em = now(), updated_at = now()
  where provisao_id = p_provisao_id;
  return jsonb_build_object('payload', v_payload, 'txid', v_txid, 'token', v_token,
    'valor', v_pr.valor, 'pedido', v_ext, 'beneficiario', v_banco.pix_beneficiario_nome, 'banco', v_banco.nome);
end;
$function$;
REVOKE ALL ON FUNCTION public._gerar_pix_provisao_core(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._gerar_pix_provisao_core(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.gerar_pix_provisao(p_provisao_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
-- PIX-E-DA-LINHA: o QR pertence a linha de cobranca. Portao e atributo dela, nao dono.
-- FASE 5 (12/09/2026) — exige acao.gerar_pix (bypass super_admin/alcada em usuario_tem_acao).
-- Conexao de maquina (auth.uid() nulo) passa.
-- 27/10/2026: o miolo mora em _gerar_pix_provisao_core; aqui fica so o portao.
begin
  if auth.uid() is not null and not usuario_tem_acao('acao.gerar_pix')
     -- VENDA-DIRETA (29/09/2026): quem lanca venda direta gera o PIX SO de pedido de venda direta.
     and not (public.tem_permissao('tela.venda_direta_novo', auth.uid())
              and exists (select 1 from provisao_recebimento pr join pedidos pd on pd.id = pr.pedido_id
                           where pr.id = p_provisao_id and pd.origem = 'venda_direta')) then
    raise exception 'GERAR_PIX_PROVISAO: sem permissao (acao.gerar_pix). Concessao e feita no Console de Acesso.';
  end if;
  return public._gerar_pix_provisao_core(p_provisao_id);
end;
$function$;

-- 3. Remessas referenciadas por um stage de retorno
CREATE OR REPLACE FUNCTION public._consignado_remessas_ref(p_stage_id uuid, p_parceiro_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_ref text; v jsonb;
begin
  select nf_referenciada_chave into v_ref from nfs_stage where id = p_stage_id;
  if v_ref is not null then
    select jsonb_agg(jsonb_build_object('numero', ltrim(e.numero,'0'), 'serie', e.serie, 'chave', e.chave_acesso,
             'data', e.data_emissao::date, 'origem', 'nf_retorno'))
      into v from nfs_emitidas e where e.chave_acesso = v_ref;
    if v is null then
      -- chave referenciada nao esta nas emitidas: guarda a chave crua (numero sai da chave)
      v := jsonb_build_array(jsonb_build_object('numero', ltrim(substr(v_ref,26,9),'0'), 'serie', ltrim(substr(v_ref,23,3),'0'),
             'chave', v_ref, 'data', null, 'origem', 'nf_retorno'));
    end if;
    return v;
  end if;
  -- Fallback: remessas em consignacao autorizadas do parceiro
  select jsonb_agg(jsonb_build_object('numero', ltrim(e.numero,'0'), 'serie', e.serie, 'chave', e.chave_acesso,
           'data', e.data_emissao::date, 'origem', 'remessas_do_parceiro') order by e.data_emissao)
    into v from nfs_emitidas e
   where e.parceiro_id = p_parceiro_id and e.situacao = 'autorizada'
     and e.itens_json->0->>'cfop' in (select cfop from cfop_natureza where natureza = 'consignacao_remessa');
  return coalesce(v, '[]'::jsonb);
end;
$function$;
REVOKE ALL ON FUNCTION public._consignado_remessas_ref(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._consignado_remessas_ref(uuid, uuid) TO service_role;

-- 4. Candidatas (stages de retorno simbolico do parceiro) com conferencia
CREATE OR REPLACE FUNCTION public.fn_consignado_nf_retorno_candidatas(p_acerto_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_ac consignado_acerto; v_cnpj text; v_qtd numeric;
begin
  if auth.uid() is not null and not (usuario_tem_acao('acao.fin_conciliar') or usuario_tem_acao('acao.consignado_contrato_gerir')) then
    raise exception 'Sem permissao (acao.fin_conciliar ou acao.consignado_contrato_gerir).' using errcode='42501';
  end if;
  select * into v_ac from consignado_acerto where id = p_acerto_id;
  if not found then raise exception 'Acerto % nao encontrado', p_acerto_id using errcode='02000'; end if;
  select regexp_replace(coalesce(cnpj,''),'\D','','g') into v_cnpj from parceiros_comerciais where id = v_ac.parceiro_id;
  select coalesce(sum(quantidade),0) into v_qtd from consignado_acerto_item where acerto_id = p_acerto_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'stage_id', s.id, 'numero', s.nf_numero, 'serie', s.nf_serie, 'chave', s.nf_chave_acesso,
      'data', s.nf_data_emissao, 'valor', s.valor, 'status', s.status,
      'qtd_itens', (select coalesce(sum((i->>'quantidade')::numeric),0) from jsonb_array_elements(coalesce(s.itens,'[]')) i),
      'qtd_acerto', v_qtd, 'valor_acerto', v_ac.valor_total,
      'vinculada_a', (select a.numero from consignado_acerto a where a.nf_retorno_stage_id = s.id),
      'remessas', public._consignado_remessas_ref(s.id, v_ac.parceiro_id))
      order by s.nf_data_emissao desc)
    from nfs_stage s
    where regexp_replace(coalesce(s.fornecedor_cnpj,''),'\D','','g') = v_cnpj and v_cnpj <> ''
      and exists (select 1 from jsonb_array_elements(coalesce(s.itens,'[]')) i
                   where i->>'cfop' in (select cfop from cfop_natureza where natureza = 'consignacao_devolucao_simbolica'))
  ), '[]'::jsonb);
end;
$function$;
REVOKE ALL ON FUNCTION public.fn_consignado_nf_retorno_candidatas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_consignado_nf_retorno_candidatas(uuid) TO authenticated, service_role;

-- 5. Vincular (fail-loud)
CREATE OR REPLACE FUNCTION public.fn_consignado_vincular_nf_retorno(p_acerto_id uuid, p_stage_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_ac consignado_acerto; v_s nfs_stage; v_cnpj text; v_outro text; v_ref jsonb;
begin
  if auth.uid() is not null and not (usuario_tem_acao('acao.fin_conciliar') or usuario_tem_acao('acao.consignado_contrato_gerir')) then
    raise exception 'Sem permissao (acao.fin_conciliar ou acao.consignado_contrato_gerir).' using errcode='42501';
  end if;
  select * into v_ac from consignado_acerto where id = p_acerto_id for update;
  if not found then raise exception 'Acerto % nao encontrado', p_acerto_id using errcode='02000'; end if;
  if v_ac.consignado_modelo <> 'consignacao_fiscal' then
    raise exception 'Acerto % e do modelo % — NF de retorno simbolico so existe no modelo consignacao_fiscal.', v_ac.numero, v_ac.consignado_modelo using errcode='23514';
  end if;
  if v_ac.status = 'cancelado' then raise exception 'Acerto % esta cancelado.', v_ac.numero using errcode='23514'; end if;
  select * into v_s from nfs_stage where id = p_stage_id for update;
  if not found then raise exception 'NF (stage) % nao encontrada', p_stage_id using errcode='02000'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_s.itens,'[]')) i
                  where i->>'cfop' in (select cfop from cfop_natureza where natureza = 'consignacao_devolucao_simbolica')) then
    raise exception 'NF % nao e de retorno simbolico de consignacao (CFOP 5919/6919).', v_s.nf_numero using errcode='23514';
  end if;
  select regexp_replace(coalesce(cnpj,''),'\D','','g') into v_cnpj from parceiros_comerciais where id = v_ac.parceiro_id;
  if v_cnpj = '' or regexp_replace(coalesce(v_s.fornecedor_cnpj,''),'\D','','g') <> v_cnpj then
    raise exception 'NF % foi emitida por % — nao e o CNPJ do parceiro do acerto (%).', v_s.nf_numero, v_s.fornecedor_cnpj, v_cnpj using errcode='23514';
  end if;
  select numero into v_outro from consignado_acerto where nf_retorno_stage_id = p_stage_id and id <> p_acerto_id;
  if v_outro is not null then
    raise exception 'NF % ja esta vinculada ao acerto %.', v_s.nf_numero, v_outro using errcode='23505';
  end if;
  v_ref := public._consignado_remessas_ref(p_stage_id, v_ac.parceiro_id);
  update consignado_acerto set nf_retorno_stage_id = p_stage_id, nf_retorno_numero = v_s.nf_numero,
    nf_retorno_chave = v_s.nf_chave_acesso, nf_retorno_data = v_s.nf_data_emissao,
    nfs_remessa_ref = v_ref, updated_at = now()
   where id = p_acerto_id;
  update nfs_stage set status = 'vinculada',
    match_motivos = coalesce(match_motivos || ' | ', '') || 'Retorno simbolico do acerto ' || v_ac.numero
   where id = p_stage_id and status = 'nao_vinculada';
  return jsonb_build_object('ok', true, 'acerto', v_ac.numero, 'nf_retorno', v_s.nf_numero,
    'chave', v_s.nf_chave_acesso, 'data', v_s.nf_data_emissao, 'remessas', v_ref);
end;
$function$;
REVOKE ALL ON FUNCTION public.fn_consignado_vincular_nf_retorno(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_consignado_vincular_nf_retorno(uuid, uuid) TO authenticated, service_role;

-- 6. Texto das informacoes complementares da NF do pedido sintetico
CREATE OR REPLACE FUNCTION public.fn_consignado_obs_nf(p_pedido_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- eh_acerto=false: pedido comum, nada a fazer. ok=false: recusar envio (erro). ok=true: texto pronto.
declare v_ac consignado_acerto; v_pc parceiros_comerciais; v_pr provisao_recebimento; v_txt text; v_rem text;
begin
  select * into v_ac from consignado_acerto where pedido_sintetico_id = p_pedido_id and status <> 'cancelado' limit 1;
  if not found or v_ac.consignado_modelo <> 'consignacao_fiscal' then
    return jsonb_build_object('eh_acerto', false);
  end if;
  select * into v_pc from parceiros_comerciais where id = v_ac.parceiro_id;
  if v_ac.nf_retorno_stage_id is null then
    return jsonb_build_object('eh_acerto', true, 'ok', false, 'erro',
      format('Acerto %s sem NF de retorno simbolico vinculada. Vincule a NF de retorno do parceiro no acerto (Consignado > acerto > NF de retorno simbolico) antes de enviar. Nada foi enviado ao Bling.', v_ac.numero));
  end if;
  select string_agg(format('Ref. NF-e %s de %s (remessa em consignação)', r->>'numero',
           coalesce(to_char((r->>'data')::date,'DD/MM/YYYY'),'data n/d')), '. ')
    into v_rem from jsonb_array_elements(coalesce(v_ac.nfs_remessa_ref,'[]')) r;
  v_txt := format('Ref. NF-e %s de %s (retorno simbólico de consignação) – chave %s.',
    ltrim(v_ac.nf_retorno_numero,'0'), to_char(v_ac.nf_retorno_data,'DD/MM/YYYY'), v_ac.nf_retorno_chave);
  if v_rem is not null then v_txt := v_txt || ' ' || v_rem || '.'; end if;
  if v_pc.consignado_instrumento = 'pix' then
    select * into v_pr from provisao_recebimento where pedido_id = p_pedido_id and tipo_pagamento = 'pix'
      order by numero_parcela limit 1;
    if v_pr.id is null or v_pr.link_pagamento is null then
      return jsonb_build_object('eh_acerto', true, 'ok', false, 'erro',
        format('Acerto %s cobra por PIX mas o PIX da cobranca nao foi gerado. Gere o PIX antes de enviar. Nada foi enviado ao Bling.', v_ac.numero));
    end if;
    v_txt := v_txt || ' Pagamento via PIX' ||
      case when v_pc.consignado_prazo_dias_nf is not null then format(' em %s dias da emissão', v_pc.consignado_prazo_dias_nf) else '' end ||
      ' – R$ ' || replace(replace(replace(to_char(v_pr.valor,'FM999G999G990D00'),',','#'),'.',','),'#','.') ||
      '. PIX copia e cola: ' || v_pr.link_pagamento;
  end if;
  return jsonb_build_object('eh_acerto', true, 'ok', true, 'acerto', v_ac.numero, 'texto', v_txt,
    'remessas', v_ac.nfs_remessa_ref);
end;
$function$;
REVOKE ALL ON FUNCTION public.fn_consignado_obs_nf(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_consignado_obs_nf(uuid) TO authenticated, service_role;

-- 7. confirmar_acerto_consignado: PIX nasce na confirmacao (modelo 2, instrumento pix).
-- Patch cirurgico por substituicao exata: cada trecho tem que aparecer uma vez, senao falha.
DO $patch$
declare d text; t text[]; r text[];
  i int;
begin
  d := pg_get_functiondef('public.confirmar_acerto_consignado(uuid,date)'::regprocedure);
  t := array[
    E'  v_cond      text;\nbegin',
    E'     v_cond);\n\n  update consignado_acerto\n     set status = ''confirmado'', pedido_sintetico_id = v_pedido_id,',
    E'    ''prazo_dias_nf'', v_prazo_nf,\n    ''proximo_passo'''
  ];
  r := array[
    E'  v_cond      text;\n  v_prov_id   uuid;\n  v_pix       jsonb;\nbegin',
    E'     v_cond)\n  returning id into v_prov_id;\n\n  -- 27/10/2026 PIX-NASCE-NA-CONFIRMACAO: instrumento pix gera o QR da provisao aqui, pelo miolo\n  -- sem portao de acao (quem confirma acerto ja tem autoridade sobre a cobranca do acerto).\n  if v_instr = ''pix'' then\n    v_pix := public._gerar_pix_provisao_core(v_prov_id);\n  end if;\n\n  update consignado_acerto\n     set status = ''confirmado'', pedido_sintetico_id = v_pedido_id,',
    E'    ''prazo_dias_nf'', v_prazo_nf,\n    ''pix_txid'', v_pix->>''txid'',\n    ''pix_payload'', v_pix->>''payload'',\n    ''proximo_passo'''
  ];
  for i in 1..array_length(t,1) loop
    if (length(d) - length(replace(d, t[i], ''))) / length(t[i]) <> 1 then
      raise exception 'patch confirmar_acerto_consignado: trecho % nao aparece exatamente 1 vez', i;
    end if;
    d := replace(d, t[i], r[i]);
  end loop;
  execute d;
end;
$patch$;