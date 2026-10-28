-- MESA-SP-SERVICO-CORREIOS (28/10/2026): fonte única do serviço Correios (PAC/SEDEX) e do frete pago pelo cliente.
CREATE OR REPLACE FUNCTION public.fn_mesa_sp_servico_correios(p_pedido_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  select jsonb_build_object(
    'servico', case upper(btrim(coalesce(p.endereco_entrega->>'modal',''))) when 'PAC' then 'PAC' when 'SEDEX' then 'SEDEX' else null end,
    'frete_cliente_valor', case when p.frete_tipo = 'CIF_ABSORVIDO' then 0 else coalesce(p.valor_frete,0) end,
    'frete_gratis', p.frete_tipo = 'CIF_ABSORVIDO' or coalesce(p.valor_frete,0) = 0)
  from pedidos p where p.id = p_pedido_id
$f$;
GRANT EXECUTE ON FUNCTION public.fn_mesa_sp_servico_correios(uuid) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_mesa_sp_quadro AS
WITH universo AS (
         SELECT p.id, p.id_externo, p.estagio, p.canal, p.valor_liquido, p.recebido_em, p.endereco_entrega, p.parceiro_id, p.cliente_nome_snapshot, p.origem_centro_id
           FROM pedidos p
          WHERE (((p.canal = 'B2C'::text) AND (p.estagio = ANY (ARRAY['pre_separacao'::text, 'em_separacao'::text])) AND (EXISTS ( SELECT 1
                   FROM pedido_eventos e
                  WHERE ((e.pedido_id = p.id) AND (e.tipo_evento = 'roteado_mesa_sp'::text))))) OR ((p.canal = 'B2B'::text) AND (p.estagio = ANY (ARRAY['pre_separacao'::text, 'em_separacao'::text, 'pre_faturamento'::text, 'faturado'::text])) AND (EXISTS ( SELECT 1
                   FROM centro_distribuicao c
                  WHERE ((c.id = p.origem_centro_id) AND (fn_estabelecimento_fiscal(c.id) = ( SELECT cs.id
                           FROM centro_distribuicao cs
                          WHERE (cs.codigo = 'SITE-SP'::text))))))))
        ), ultimo AS (
         SELECT u.id AS pedido_id, e.tipo_evento, e.criado_em
           FROM (universo u
             LEFT JOIN LATERAL ( SELECT pedido_eventos.tipo_evento, pedido_eventos.criado_em
                   FROM pedido_eventos
                  WHERE ((pedido_eventos.pedido_id = u.id) AND (pedido_eventos.tipo_evento ~~ 'mesa_%'::text) AND (pedido_eventos.tipo_evento <> ALL (ARRAY['mesa_rastreio_registrado'::text, 'mesa_modal_trocado'::text, 'mesa_postagem_agencia'::text])))
                  ORDER BY pedido_eventos.criado_em DESC
                 LIMIT 1) e ON (true))
        ), derivado AS (
         SELECT u.id, u.id_externo, u.estagio, u.canal, u.valor_liquido, u.recebido_em, u.endereco_entrega, u.parceiro_id, u.cliente_nome_snapshot, u.origem_centro_id,
            ul.tipo_evento AS ultimo_evento,
            ul.criado_em AS ultimo_evento_em,
                CASE
                    WHEN (u.estagio = 'pre_separacao'::text) THEN 'fila'::text
                    WHEN (u.estagio = 'pre_faturamento'::text) THEN 'aguardando_nf'::text
                    WHEN (u.estagio = 'faturado'::text) THEN
                    CASE
                        WHEN (ul.tipo_evento = 'mesa_documentos_ok'::text) THEN 'nf_emitida'::text
                        ELSE 'documentos'::text
                    END
                    WHEN (ul.tipo_evento = 'mesa_documentos_ok'::text) THEN 'despacho'::text
                    WHEN (ul.tipo_evento = 'mesa_embalado'::text) THEN 'documentos'::text
                    WHEN (ul.tipo_evento = 'mesa_conferencia_ok'::text) THEN 'embalagem'::text
                    WHEN (ul.tipo_evento = 'mesa_conferencia_iniciada'::text) THEN 'conferencia'::text
                    ELSE 'separacao'::text
                END AS etapa,
                CASE
                    WHEN (u.estagio = 'pre_separacao'::text) THEN COALESCE(( SELECT max(pedido_eventos.criado_em) AS max
                       FROM pedido_eventos
                      WHERE ((pedido_eventos.pedido_id = u.id) AND (pedido_eventos.tipo_evento = ANY (ARRAY['roteado_mesa_sp'::text, 'mesa_devolvido_fila'::text])))), u.recebido_em)
                    WHEN ((u.estagio = 'faturado'::text) AND (ul.tipo_evento <> 'mesa_documentos_ok'::text)) THEN COALESCE(( SELECT max(pedido_eventos.criado_em) AS max
                       FROM pedido_eventos
                      WHERE ((pedido_eventos.pedido_id = u.id) AND (pedido_eventos.estagio_novo = 'faturado'::text))), ( SELECT max(COALESCE(nfs_emitidas.autorizada_em, nfs_emitidas.emitida_em)) AS max
                       FROM nfs_emitidas
                      WHERE ((nfs_emitidas.pedido_venda_id = u.id) AND (nfs_emitidas.situacao = 'autorizada'::text))), ul.criado_em, u.recebido_em)
                    ELSE COALESCE(ul.criado_em, ( SELECT max(pedido_eventos.criado_em) AS max
                       FROM pedido_eventos
                      WHERE ((pedido_eventos.pedido_id = u.id) AND (pedido_eventos.estagio_novo = 'em_separacao'::text))), u.recebido_em)
                END AS entrou_em
           FROM (universo u
             JOIN ultimo ul ON ((ul.pedido_id = u.id)))
        )
 SELECT d.id AS pedido_id,
    d.id_externo,
    d.canal,
    d.estagio,
    d.valor_liquido,
    d.recebido_em,
    d.endereco_entrega,
    COALESCE(NULLIF(TRIM(BOTH FROM d.cliente_nome_snapshot), ''::text), NULLIF(TRIM(BOTH FROM pc.nome_fantasia), ''::text), NULLIF(TRIM(BOTH FROM pc.razao_social), ''::text)) AS cliente_nome,
    d.etapa,
    et.ordem AS etapa_ordem,
    et.rotulo AS etapa_rotulo,
    et.limite_min,
    d.entrou_em,
    ((EXTRACT(epoch FROM (now() - d.entrou_em)) / (60)::numeric))::integer AS minutos_parado,
    ((et.limite_min IS NOT NULL) AND ((now() - d.entrou_em) > make_interval(mins => et.limite_min))) AS estourou_limite,
    d.ultimo_evento,
    d.ultimo_evento_em,
    ( SELECT min(pedido_eventos.criado_em) AS min
           FROM pedido_eventos
          WHERE ((pedido_eventos.pedido_id = d.id) AND (pedido_eventos.tipo_evento = 'mesa_separacao_iniciada'::text))) AS puxado_em,
    ( SELECT max(pedido_eventos.criado_em) AS max
           FROM pedido_eventos
          WHERE ((pedido_eventos.pedido_id = d.id) AND (pedido_eventos.tipo_evento = 'mesa_conferencia_ok'::text))) AS conferido_em,
    ( SELECT max(pedido_eventos.criado_em) AS max
           FROM pedido_eventos
          WHERE ((pedido_eventos.pedido_id = d.id) AND (pedido_eventos.tipo_evento = 'mesa_embalado'::text))) AS embalado_em,
    cdq.codigo AS cd_codigo,
    cdq.rotulo_curto AS cd_rotulo,
    (fn_mesa_sp_servico_correios(d.id) ->> 'servico') AS servico_correios,
    ((fn_mesa_sp_servico_correios(d.id) ->> 'frete_cliente_valor'))::numeric AS frete_cliente_valor,
    ((fn_mesa_sp_servico_correios(d.id) ->> 'frete_gratis'))::boolean AS frete_gratis
   FROM (((derivado d
     LEFT JOIN centro_distribuicao cdq ON ((cdq.id = d.origem_centro_id)))
     LEFT JOIN parceiros_comerciais pc ON ((pc.id = d.parceiro_id)))
     LEFT JOIN mesa_sp_etapa et ON (((et.canal = d.canal) AND (et.codigo = d.etapa))));

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_dados_impressao(p_pedido_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- MESA-SP-SERVICO-CORREIOS (28/10/2026): + servico_correios, frete_cliente_valor, frete_gratis.
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

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_postar_agencia(p_pedido_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- MESA-SP-AGENCIA (26/10/2026): etiqueta não sai pelo Bling -> postagem no balcão dos Correios (contrato).
-- Libera a estação Documentos sem rastreio; o despacho Correios exige o código do comprovante.
-- MESA-SP-SERVICO-CORREIOS (28/10/2026): metadata leva servico e frete_cliente_valor.
DECLARE v_sv jsonb;
BEGIN
  IF coalesce(auth.role(), '') IN ('anon','authenticated')
     AND NOT public.usuario_tem_acao('acao.expedicao_sp_operar') THEN
    RAISE EXCEPTION 'Sem permissão para esta ação (acao.expedicao_sp_operar).' USING ERRCODE = '42501';
  END IF;
  PERFORM public.fn_mesa_sp_trava_cancelamento(p_pedido_id);
  PERFORM public.fn_mesa_sp_exigir_estacao_documentos(p_pedido_id);
  IF NOT EXISTS (SELECT 1 FROM b2c_modal_entrega m WHERE m.codigo = public.fn_mesa_sp_modal_do_pedido(p_pedido_id) AND m.exige_etiqueta_correios) THEN
    RAISE EXCEPTION 'Postagem na agência só vale para Correios.'; END IF;
  v_sv := public.fn_mesa_sp_servico_correios(p_pedido_id);
  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
  VALUES (p_pedido_id, 'mesa_postagem_agencia',
          'Mesa SP: etiqueta não impressa — postagem na agência dos Correios; código de rastreio no despacho.',
          jsonb_build_object('auth_uid', auth.uid(), 'servico', v_sv->>'servico',
                             'frete_cliente_valor', (v_sv->>'frete_cliente_valor')::numeric), false, 'humano', 'mesa_sp');
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_registrar_rastreio(p_pedido_id uuid, p_codigo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- MESA-SP-SERVICO-CORREIOS (28/10/2026): metadata leva servico e frete_cliente_valor.
declare v_codigo text; v_modal text; v_dono uuid; v_sv jsonb;
begin
  perform public.fn_mesa_sp_exigir_estacao_documentos(p_pedido_id);
  v_codigo := upper(regexp_replace(coalesce(p_codigo,''), '\s', '', 'g'));
  if v_codigo !~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$' then
    raise exception 'Código de rastreio inválido: "%" (esperado padrão Correios, ex. AA123456789BR).', p_codigo; end if;
  v_modal := public.fn_mesa_sp_modal_do_pedido(p_pedido_id);
  if not exists (select 1 from mesa_sp_documento d where d.modal_codigo = v_modal and d.tipo = 'rastreio' and d.ativo) then
    raise exception 'Modal % não exige código de rastreio.', coalesce(v_modal,'?'); end if;
  select pedido_id into v_dono from pedido_rastreamento where codigo_rastreio = v_codigo;
  if v_dono is not null and v_dono <> p_pedido_id then
    raise exception 'Código % já está em outro pedido (%).', v_codigo, (select id_externo from pedidos where id = v_dono); end if;
  if v_dono is null then
    -- Um rastreio por pedido na mesa: etiqueta reimpressa substitui a anterior registrada pela própria mesa.
    delete from pedido_rastreamento where pedido_id = p_pedido_id and coalesce(entregue,false) = false
      and exists (select 1 from pedido_eventos e where e.pedido_id = p_pedido_id and e.tipo_evento = 'mesa_rastreio_registrado');
    insert into pedido_rastreamento (pedido_id, codigo_rastreio, servico, status_atual)
    values (p_pedido_id, v_codigo, 'Correios', 'postagem_pendente');
  end if;
  v_sv := public.fn_mesa_sp_servico_correios(p_pedido_id);
  insert into pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
  values (p_pedido_id, 'mesa_rastreio_registrado', format('Mesa SP: etiqueta Correios %s registrada.', v_codigo),
          jsonb_build_object('codigo', v_codigo, 'auth_uid', auth.uid(), 'servico', v_sv->>'servico',
                             'frete_cliente_valor', (v_sv->>'frete_cliente_valor')::numeric), false, 'humano', 'mesa_sp');
  return jsonb_build_object('ok', true, 'codigo', v_codigo);
end $function$;