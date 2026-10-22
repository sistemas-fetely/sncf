CREATE OR REPLACE FUNCTION public.registrar_pix_qr_url_titulo(p_titulo_id uuid, p_url text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $f$
begin
  if auth.uid() is null then raise exception 'REGISTRAR_PIX_QR_URL_TITULO: sessao obrigatoria.'; end if;
  if p_url is null or p_url !~ '^https://[a-z0-9.-]+/storage/v1/object/public/pix-qr/' then
    raise exception 'REGISTRAR_PIX_QR_URL_TITULO: URL "%" nao pertence ao bucket publico pix-qr.', p_url;
  end if;
  update titulo_a_receber set pix_qr_url = p_url where id = p_titulo_id and link_pagamento is not null;
  if not found then raise exception 'REGISTRAR_PIX_QR_URL_TITULO: titulo % nao existe ou nao tem PIX gerado.', p_titulo_id; end if;
end; $f$;
REVOKE ALL ON FUNCTION public.registrar_pix_qr_url_titulo(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pix_qr_url_titulo(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.obter_pagamento_publico(p_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $function$
-- PIX-E-DA-LINHA: linha de cobranca -> titulo a receber (renegociacao) -> portao (legado).
declare
  v jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('estado', 'invalido');
  end if;

  select jsonb_build_object(
           'estado', case when pr.pago_em is null and pr.status <> 'pago' then 'aberto' else 'encerrado' end,
           'payload', case when pr.pago_em is null and pr.status <> 'pago' then pr.link_pagamento end,
           'qr_url',  case when pr.pago_em is null and pr.status <> 'pago' then pr.pix_qr_url end,
           'txid', pr.pix_txid, 'valor', pr.valor, 'vencimento', pr.data_prevista,
           'pedido', p.id_externo, 'cliente', pc.razao_social, 'beneficiario', b.pix_beneficiario_nome)
    into v
  from provisao_recebimento pr
  join pedidos p on p.id = pr.pedido_id
  left join parceiros_comerciais pc on pc.id = p.parceiro_id
  left join banco_recebimento b on b.nome = 'Safra'
  where pr.pix_token = p_token;
  if v is not null then return v; end if;

  select jsonb_build_object(
           'estado', case when t.status = 'aberto' then 'aberto' else 'encerrado' end,
           'payload', case when t.status = 'aberto' then t.link_pagamento end,
           'qr_url',  case when t.status = 'aberto' then t.pix_qr_url end,
           'txid', t.pix_txid, 'valor', coalesce(t.valor_atual, t.valor_bruto),
           'vencimento', t.data_vencimento_atual,
           'pedido', p.id_externo, 'cliente', coalesce(pc.razao_social, pc2.razao_social),
           'beneficiario', b.pix_beneficiario_nome)
    into v
  from titulo_a_receber t
  left join pedidos p on p.id = t.pedido_id
  left join parceiros_comerciais pc on pc.id = t.parceiro_id
  left join parceiros_comerciais pc2 on pc2.id = p.parceiro_id
  left join banco_recebimento b on b.nome = 'Safra'
  where t.pix_token = p_token;
  if v is not null then return v; end if;

  select jsonb_build_object(
           'estado', case when pp.status in ('provisorio','aguardando') then 'aberto' else 'encerrado' end,
           'payload', case when pp.status in ('provisorio','aguardando') then pp.link_pagamento end,
           'qr_url',  case when pp.status in ('provisorio','aguardando') then pp.pix_qr_url end,
           'txid', pp.pix_txid, 'valor', pp.valor, 'vencimento', pp.data_vencimento,
           'pedido', p.id_externo, 'cliente', pc.razao_social, 'beneficiario', b.pix_beneficiario_nome)
    into v
  from pedido_portao pp
  join pedidos p on p.id = pp.pedido_id
  left join parceiros_comerciais pc on pc.id = p.parceiro_id
  left join banco_recebimento b on b.nome = 'Safra'
  where pp.pix_token = p_token;

  return coalesce(v, jsonb_build_object('estado', 'invalido'));
end;
$function$;