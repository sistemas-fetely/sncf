CREATE OR REPLACE FUNCTION public.fn_mesa_sp_servico_correios(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- MESA-SP-TROCA-SERVICO-CORREIOS (03/11/2026): servico = EFETIVO (pré-postagem viva, senão o do pedido);
  -- servico_cliente = o que o cliente comprou (pedidos.endereco_entrega->>'modal'), sempre.
  with c as (
    select p.*, case upper(btrim(coalesce(p.endereco_entrega->>'modal',''))) when 'PAC' then 'PAC' when 'SEDEX' then 'SEDEX' else null end as srv_cli
      from pedidos p where p.id = p_pedido_id)
  select jsonb_build_object(
    'servico', coalesce((select pp.servico from correios_prepostagem pp
                          where pp.pedido_id = c.id and pp.status <> 'cancelada'
                          order by pp.criado_em desc limit 1), c.srv_cli),
    'servico_cliente', c.srv_cli,
    'frete_cliente_valor', case when c.frete_tipo = 'CIF_ABSORVIDO' then 0 else coalesce(c.valor_frete,0) end,
    'frete_gratis', c.frete_tipo = 'CIF_ABSORVIDO' or coalesce(c.valor_frete,0) = 0)
  from c
$function$;

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_dados_impressao(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- MESA-SP-SERVICO-CORREIOS (28/10/2026): + servico_correios, frete_cliente_valor, frete_gratis.
  -- MESA-SP-TROCA-SERVICO-CORREIOS (03/11/2026): servico_correios = efetivo; + servico_cliente.
  with p as (select * from pedidos where id = p_pedido_id),
  emb as (select metadata, criado_em from pedido_eventos where pedido_id = p_pedido_id and tipo_evento = 'mesa_embalado' order by criado_em desc limit 1),
  pc as (select pc.* from parceiros_comerciais pc join p on pc.id = p.parceiro_id),
  cd as (select * from centro_distribuicao where codigo = 'SITE-SP'),
  nf as (select numero from nfs_emitidas where pedido_venda_id = p_pedido_id and situacao = 'autorizada' order by autorizada_em desc nulls last limit 1),
  sv as (select public.fn_mesa_sp_servico_correios(p_pedido_id) j),
  ende as (
    select e.* from (
      select 1 as prio, endereco_entrega->>'logradouro' as logradouro, endereco_entrega->>'numero' as numero,
             endereco_entrega->>'complemento' as complemento, endereco_entrega->>'bairro' as bairro,
             endereco_entrega->>'cidade' as cidade, endereco_entrega->>'uf' as uf, endereco_entrega->>'cep' as cep
        from p where nullif(trim(endereco_entrega->>'logradouro'),'') is not null
      union all
      select 2, logradouro, numero, endereco_complemento, bairro, cidade, uf, cep from pc
    ) e order by e.prio limit 1)
  select jsonb_build_object(
    'pedido', (select id_externo from p),
    'canal', (select canal from p),
    'nf', (select numero from nf),
    'modal', (select m.nome from b2c_modal_entrega m where m.codigo = (select emb.metadata->>'modal' from emb)),
    'servico_correios', (select j->>'servico' from sv),
    'servico_cliente', (select j->>'servico_cliente' from sv),
    'frete_cliente_valor', (select (j->>'frete_cliente_valor')::numeric from sv),
    'frete_gratis', (select (j->>'frete_gratis')::boolean from sv),
    'volumes', coalesce((select (emb.metadata->>'volumes')::int from emb), 1),
    'peso_kg', (select (emb.metadata->>'peso_kg')::numeric from emb),
    'destinatario', jsonb_build_object(
       'nome', coalesce((select nullif(trim(cliente_nome_snapshot),'') from p), (select coalesce(nullif(trim(nome_fantasia),''), razao_social) from pc)),
       'documento', (select coalesce(cnpj, cpf) from pc),
       'telefone', coalesce((select endereco_entrega->>'telefone' from p), (select telefone from pc)),
       'logradouro', (select logradouro from ende), 'numero', (select numero from ende),
       'complemento', (select complemento from ende), 'bairro', (select bairro from ende),
       'cidade', (select cidade from ende), 'uf', (select uf from ende),
       'cep', (select cep from ende)),
    'remetente', (select jsonb_build_object('nome', razao_remetente, 'logradouro', logradouro, 'numero', numero, 'complemento', complemento,
                   'bairro', bairro, 'cidade', cidade, 'uf', uf, 'cep', cep, 'telefone', telefone,
                   'completo', logradouro is not null and numero is not null) from cd),
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('sku', i.sku, 'descricao', i.descricao, 'quantidade', i.quantidade) order by i.ordem), '[]'::jsonb)
                from pedido_itens i where i.pedido_id = p_pedido_id)
  )
$function$;