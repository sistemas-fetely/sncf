DROP FUNCTION public.fn_vd_cliente_buscar(text);
CREATE OR REPLACE FUNCTION public.fn_vd_cliente_buscar(p_termo text)
 RETURNS TABLE(id uuid, pessoa_id uuid, funcionario boolean, nome text, cpf text, telefone text, email text, cep text, logradouro text, numero text, complemento text, bairro text, cidade text, uf text, inativo boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 28/10/2026 VD-FUNCIONARIO-CLIENTE: busca de cliente da Venda Direta (Pedidos Site SP) inclui funcionarios
--   com vinculo ativo e CPF (fonte: pessoas/People). Funcionario ja cliente -> devolve a ficha do cliente (id) com selo.
--   Funcionario ainda nao cliente -> id NULL + dados do People; o cliente nasce no criar_pedido_venda_direta (upsert por CPF).
-- 29/10/2026 VD-CLIENTE-INATIVO: PF inativo tambem e encontrado (criar_pedido_venda_direta reaproveita pelo CPF); coluna inativo.
--   Selo "funcionario" e derivado pelo CPF (sem marcador gravado). Funcionarios primeiro.
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.tem_permissao('tela.venda_direta_novo') THEN
    RAISE EXCEPTION 'Sem permissao para buscar clientes da venda direta.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH t AS (
    SELECT btrim(coalesce(p_termo,'')) AS txt, regexp_replace(coalesce(p_termo,''),'\D','','g') AS dig
  ),
  func AS (
    SELECT DISTINCT ON (regexp_replace(p.cpf,'\D','','g'))
           p.id AS pessoa_id, regexp_replace(p.cpf,'\D','','g') AS cpf_d, p.*
    FROM pessoas p
    JOIN vinculos v ON v.pessoa_id = p.id AND v.status = 'ativo'
    WHERE length(regexp_replace(coalesce(p.cpf,''),'\D','','g')) = 11
  ),
  pf AS (
    SELECT pc.*, regexp_replace(coalesce(pc.cpf,''),'\D','','g') AS cpf_d
    FROM parceiros_comerciais pc
    WHERE pc.tipo_pessoa = 'PF'
  ),
  r_func AS (
    SELECT c.id, f.pessoa_id, true AS funcionario,
           coalesce(c.razao_social, coalesce(nullif(f.nome_social,''), f.nome_completo)) AS nome,
           coalesce(c.cpf, f.cpf_d) AS cpf,
           CASE WHEN c.id IS NOT NULL THEN c.telefone ELSE f.telefone END,
           CASE WHEN c.id IS NOT NULL THEN c.email ELSE f.email_pessoal END,
           CASE WHEN c.id IS NOT NULL THEN c.cep ELSE f.cep END,
           CASE WHEN c.id IS NOT NULL THEN c.logradouro ELSE f.logradouro END,
           CASE WHEN c.id IS NOT NULL THEN c.numero ELSE f.numero END,
           CASE WHEN c.id IS NOT NULL THEN c.endereco_complemento ELSE f.complemento END,
           CASE WHEN c.id IS NOT NULL THEN c.bairro ELSE f.bairro END,
           CASE WHEN c.id IS NOT NULL THEN c.cidade ELSE f.cidade END,
           CASE WHEN c.id IS NOT NULL THEN c.uf ELSE f.uf END,
           CASE WHEN c.id IS NOT NULL THEN NOT coalesce(c.ativo, true) ELSE false END
    FROM func f
    CROSS JOIN t
    LEFT JOIN LATERAL (SELECT * FROM pf WHERE pf.cpf_d = f.cpf_d LIMIT 1) c ON true
    WHERE length(t.txt) >= 2
      AND ( f.nome_completo ILIKE '%' || t.txt || '%'
            OR coalesce(f.nome_social,'') ILIKE '%' || t.txt || '%'
            OR coalesce(c.razao_social,'') ILIKE '%' || t.txt || '%'
            OR (length(t.dig) >= 3 AND (f.cpf_d LIKE '%' || t.dig || '%'
                 OR regexp_replace(coalesce(f.telefone,''),'\D','','g') LIKE '%' || t.dig || '%'
                 OR regexp_replace(coalesce(c.telefone,''),'\D','','g') LIKE '%' || t.dig || '%')) )
  ),
  r_cli AS (
    SELECT pc.id, NULL::uuid, false, pc.razao_social, pc.cpf, pc.telefone, pc.email, pc.cep, pc.logradouro, pc.numero,
           pc.endereco_complemento, pc.bairro, pc.cidade, pc.uf, NOT coalesce(pc.ativo, true)
    FROM pf pc CROSS JOIN t
    WHERE length(t.txt) >= 2
      AND NOT EXISTS (SELECT 1 FROM func f WHERE f.cpf_d = pc.cpf_d)
      AND ( pc.razao_social ILIKE '%' || t.txt || '%'
            OR (length(t.dig) >= 3 AND (pc.cpf_d LIKE '%' || t.dig || '%'
                 OR regexp_replace(coalesce(pc.telefone,''),'\D','','g') LIKE '%' || t.dig || '%')) )
  )
  SELECT * FROM (
    SELECT * FROM r_func
    UNION ALL
    SELECT * FROM (SELECT * FROM r_cli ORDER BY 4 LIMIT 10) x
  ) u
  ORDER BY 3 DESC, 4
  LIMIT 15;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_vd_cliente_buscar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vd_cliente_buscar(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.aplicar_haver_pedido(p_haver_id uuid, p_pedido_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_haver RECORD; v_pedido RECORD;
  v_valor_aplicar NUMERIC; v_saldo_novo NUMERIC;
  v_caso TEXT;
  v_operador UUID := auth.uid();
  v_dono RECORD;
  v_prov_n int := 0; v_prov_criada boolean := false;
  v_adiant_id uuid;
  v_restante numeric;
BEGIN

  -- FASE 5 12/09/2026 — CONCESSAO-QUE-NAO-TRANCA-E-MENTIRA (acao.pedido_dinheiro, injetada em lote)
  IF auth.uid() IS NOT NULL AND NOT usuario_tem_acao('acao.pedido_dinheiro') THEN
    RAISE EXCEPTION 'Sem permissao (acao.pedido_dinheiro).  Concessao e feita no Console de Acesso.';
  END IF;
  SELECT * INTO v_haver FROM public.haver_cliente
  WHERE id = p_haver_id AND status IN ('disponivel','parcial') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Haver % nao disponivel', p_haver_id USING ERRCODE='22023'; END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido % nao encontrado', p_pedido_id USING ERRCODE='02000'; END IF;

  IF v_pedido.parceiro_id IS DISTINCT FROM v_haver.parceiro_id THEN
    RAISE EXCEPTION 'Haver pertence a outro cliente - nao pode ser aplicado neste pedido'
      USING ERRCODE='22023';
  END IF;

  -- =================================================================
  -- GUARD ADIANTAMENTO-TEM-DESTINO (10/08/2026) - CORRIGIDO 31/08/2026
  -- ANTES: o bloco levantava excecao para TODO haver com origem='adiantamento'
  -- e nao tinha saida. Como `cancelar_pedido` (a UNICA ponte adiantamento->haver)
  -- cria o credito convertido justamente com origem='adiantamento', o proprio
  -- carimbo da conversao era o motivo da recusa. A segunda mensagem pedia
  -- "converta antes de aplicar" para um credito JA convertido - acao inexistente
  -- para um estado ja correto. Caso medido: haver 0ca879a3 (ARCHSTUDIO 360,
  -- R$ 1.655,26, origem PED-2013/01 cancelado) preso desde 31/08.
  -- AGORA: adiantamento nao mora em haver_cliente - mora em adiantamento_cliente.
  -- Logo, haver com origem='adiantamento' e pedido de origem CANCELADO ja E o
  -- credito livre; segue. So bloqueia quando o pedido de origem esta VIVO -
  -- ai sim o dinheiro tem dono e abate sozinho no faturamento.
  -- =================================================================
  IF v_haver.origem = 'adiantamento' AND v_haver.origem_pedido_id IS NOT NULL THEN
    SELECT id_externo, estagio INTO v_dono FROM public.pedidos WHERE id = v_haver.origem_pedido_id;
    IF coalesce(v_dono.estagio,'') <> 'cancelado' THEN
      RAISE EXCEPTION
        'Este valor nao e credito: e o adiantamento de R$ % do pedido % (dinheiro pago antes da NF). '
        'Ele abate a parcela mais proxima sozinho, no faturamento - nao precisa e nao deve ser aplicado a mao. '
        'Aplicar aqui faria o cliente ser cobrado duas vezes pela mesma parcela.',
        v_haver.saldo, coalesce(v_dono.id_externo, v_haver.origem_pedido_id::text)
        USING ERRCODE='P0001';
    END IF;
  END IF;

  -- 29/10/2026 HAVER-MULTIPLO: compara com o RESTANTE do pedido (ja descontadas aplicacoes anteriores), nao com o total.
  v_restante := v_pedido.valor_liquido - coalesce((SELECT sum(valor_aplicado) FROM public.haver_aplicacao WHERE pedido_id = p_pedido_id), 0);
  IF v_restante <= 0 THEN RAISE EXCEPTION 'Pedido já está coberto por crédito.' USING ERRCODE='22023'; END IF;

  IF v_haver.saldo >= v_restante THEN
    v_caso := 'haver_cobre_pedido';
    v_valor_aplicar := v_restante;
  ELSE
    v_caso := 'diferenca_a_cobrar';
    v_valor_aplicar := v_haver.saldo;
  END IF;
  v_saldo_novo := v_haver.saldo - v_valor_aplicar;

  -- Rastro da origem: o haver foi consumido. Permanece como prova de linhagem.
  INSERT INTO public.haver_aplicacao (haver_id, pedido_id, valor_aplicado, created_by)
  VALUES (p_haver_id, p_pedido_id, v_valor_aplicar, v_operador);

  UPDATE public.haver_cliente
  SET saldo = v_saldo_novo,
      status = CASE WHEN v_saldo_novo = 0 THEN 'aplicado' ELSE 'parcial' END,
      updated_at = now()
  WHERE id = p_haver_id;

  -- =================================================================
  -- CREDITO-VIRA-ADIANTAMENTO (10/08/2026) - SIMETRIA 13/08/2026
  -- O adiantamento vinculado ao pedido e o UNICO vinculo que a tela de
  -- cobranca e fn_pedido_tem_lastro (nivel L5v) sabem ler. `haver_aplicacao`
  -- e rastro de linhagem, nao vinculo financeiro.
  -- =================================================================
  INSERT INTO public.adiantamento_cliente (
    parceiro_id, pedido_id, origem, origem_haver_id, forma_pagamento,
    valor, saldo, status, recebido_em, descricao, created_by
  ) VALUES (
    v_pedido.parceiro_id, p_pedido_id, 'credito', p_haver_id, 'credito',
    v_valor_aplicar, v_valor_aplicar, 'disponivel', now(),
    CASE WHEN v_caso = 'haver_cobre_pedido'
         THEN 'Credito do cliente aplicado a este pedido (haver ' || p_haver_id || ')'
         ELSE 'Credito do cliente aplicado parcialmente a este pedido (haver ' || p_haver_id
              || ') - resta R$ ' || to_char(v_restante - v_valor_aplicar,'FM999999990.00') || ' a cobrar'
    END, v_operador
  ) RETURNING id INTO v_adiant_id;

  IF v_caso = 'haver_cobre_pedido' THEN
    SELECT count(*) INTO v_prov_n
      FROM public.provisao_recebimento
     WHERE pedido_id = p_pedido_id AND status = 'prevista';

    IF v_prov_n = 0 THEN
      INSERT INTO public.provisao_recebimento (
        pedido_id, numero_parcela, total_parcelas, valor, data_prevista,
        tipo_pagamento, eh_entrada, condicao_pagamento, status, created_by
      ) VALUES (
        p_pedido_id, 1, 1, v_valor_aplicar, CURRENT_DATE,
        'haver', false, 'Credito do cliente aplicado integralmente', 'prevista', v_operador
      );
      v_prov_criada := true;
    END IF;

    PERFORM public.transicionar_pedido(
      p_pedido_id, 'pre_separacao', 'Enviar ao Bling',
      'Credito aplicado integralmente - R$ ' || v_valor_aplicar::TEXT
    );
  END IF;

  INSERT INTO public.pedido_eventos (pedido_id, tipo_evento, descricao, operador_id, automatico, metadata)
  VALUES (
    p_pedido_id, 'alterado',
    CASE v_caso
      WHEN 'haver_cobre_pedido' THEN 'Credito aplicado integralmente - R$ ' || v_valor_aplicar::TEXT
        || ' - virou adiantamento deste pedido; titulo nasce e ja e liquidado no faturamento'
      ELSE 'Credito de R$ ' || v_valor_aplicar::TEXT || ' aplicado como adiantamento deste pedido - resta R$ '
        || (v_restante - v_valor_aplicar)::TEXT || ' a cobrar (pedido permanece em '
        || v_pedido.estagio || ')'
    END,
    v_operador, false,
    jsonb_build_object(
      'haver_id', p_haver_id, 'valor_aplicado', v_valor_aplicar, 'caso', v_caso,
      'saldo_restante', v_saldo_novo,
      'adiantamento_id', v_adiant_id,
      'provisao_criada', v_prov_criada,
      'provisoes_preservadas', v_prov_n
    )
  );

  RETURN json_build_object(
    'ok', true, 'caso', v_caso, 'valor_aplicado', v_valor_aplicar,
    'saldo_haver', v_saldo_novo, 'adiantamento_id', v_adiant_id,
    'provisao_criada', v_prov_criada,
    'diferenca', v_restante - v_valor_aplicar
  );
END;
$function$;

DROP FUNCTION public.criar_pedido_venda_direta(jsonb,jsonb,jsonb,text,text,uuid,uuid,jsonb);
CREATE OR REPLACE FUNCTION public.criar_pedido_venda_direta(p_cliente jsonb, p_itens jsonb, p_entrega jsonb, p_pagamento text, p_observacao text DEFAULT NULL::text, p_haver_id uuid DEFAULT NULL::uuid, p_vendedor_id uuid DEFAULT NULL::uuid, p_bonificacao jsonb DEFAULT NULL::jsonb, p_usar_haver boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- 29/10/2026 HAVER-MULTIPLO: p_usar_haver=true aplica TODOS os haveres (fn_haver_disponivel_parceiro, por vencimento) ate zerar.
-- 27/10/2026 BONIFICACAO-VD: p_pagamento='bonificacao' + p_bonificacao {autorizado_por, motivo (motivos_concessao, padrao 'brinde'), observacao}.
--   Natureza bonificacao; preco = tabela (varejo) com desconto_pct da natureza (mesma regra do B2B); frete nao cobrado;
--   sem portao: rotear_pedido -> pre_separacao -> (trg_vd_pos_pagamento) pre_faturamento -> fila Bling B2C com natureza bonificacao.
--   Registro analitico via conceder_bonificacao (pedido_bonificado, BONIFICACAO-TEM-PADRINHO).
-- 25/10/2026 CARTAO-MAQUININHA: terceiro meio, sem link; prova = comprovante com NSU (fn_confirmar_captura_cartao).
-- VENDA DIRETA SP (28/09/2026). 03/10 CALCULO-UNICO via fn_vd_calcular.
-- 24/10/2026 VENDEDORA: p_vendedor_id obrigatorio quando ha sessao (tela SNCF). Balcao FOP (sem sessao) segue resolvendo via resolver_vendedor_pedido.
-- 22/10/2026 HAVER: p_haver_id aplica credito do cliente (aplicar_haver_pedido). Se cobre tudo, pedido nasce pago (sem PIX/link); senao o resto vai pelo portao p_pagamento.
DECLARE
  v_uid uuid := auth.uid(); v_parceiro uuid; v_cpf text; v_nome text; v_regra uuid; v_forma text; v_natureza uuid; v_centro uuid;
  v_calc jsonb; v_pedido uuid; v_idext text; v_n int; v_total numeric; v_plano jsonb; v_prov uuid; v_pix jsonb; v_link text; v_rot jsonb;
  v_haver record; v_apl json; v_resto numeric;
  v_hv jsonb; v_apls jsonb := '[]'::jsonb; v_soma numeric := 0;
  v_bonif boolean := (p_pagamento = 'bonificacao'); v_bonif_aut text; v_bonif_motivo text; v_bonif_obs text; v_bonif_pct numeric;
  v_itens_b jsonb; v_bruto_b numeric; v_end jsonb; v_conc jsonb;
BEGIN
  IF v_uid IS NULL AND current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Sessao obrigatoria para criar pedido.'; END IF;
  IF v_uid IS NOT NULL AND NOT public.tem_permissao('tela.venda_direta_novo', v_uid) THEN RAISE EXCEPTION 'Sem permissao para lancar venda direta.' USING ERRCODE = '42501'; END IF;
  IF v_uid IS NOT NULL AND p_vendedor_id IS NULL THEN RAISE EXCEPTION 'Informe a vendedora do pedido.' USING ERRCODE='22023'; END IF;
  IF p_vendedor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendedores WHERE id = p_vendedor_id AND ativo AND tipo IN ('interno','diretoria')) THEN RAISE EXCEPTION 'Vendedora invalida ou inativa.' USING ERRCODE='22023'; END IF;
  IF coalesce(p_usar_haver,false) AND p_haver_id IS NOT NULL THEN RAISE EXCEPTION 'Use p_usar_haver ou p_haver_id, não os dois.' USING ERRCODE='22023'; END IF;
  IF p_pagamento NOT IN ('pix','cartao','cartao_maquininha','bonificacao') THEN RAISE EXCEPTION 'Pagamento deve ser pix, cartao, cartao_maquininha ou bonificacao.' USING ERRCODE='22023'; END IF;

  IF v_bonif THEN
    v_bonif_aut := nullif(btrim(coalesce(p_bonificacao->>'autorizado_por','')),'');
    v_bonif_motivo := coalesce(nullif(btrim(coalesce(p_bonificacao->>'motivo','')),''), 'brinde');
    v_bonif_obs := nullif(btrim(coalesce(p_bonificacao->>'observacao','')),'');
    IF v_bonif_aut IS NULL THEN RAISE EXCEPTION 'BONIFICACAO-TEM-PADRINHO: informe quem autorizou a bonificacao.' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM motivos_concessao WHERE codigo = v_bonif_motivo AND ativo) THEN RAISE EXCEPTION 'Motivo de bonificacao invalido: %.', v_bonif_motivo USING ERRCODE='22023'; END IF;
    IF p_haver_id IS NOT NULL OR coalesce(p_usar_haver,false) THEN RAISE EXCEPTION 'Bonificacao nao usa credito do cliente.' USING ERRCODE='22023'; END IF;
    SELECT id INTO v_regra FROM regras_pagamento_pedido WHERE codigo = 'bonificacao' AND ativo;
    IF v_regra IS NULL THEN RAISE EXCEPTION 'Regra de pagamento bonificacao inexistente ou inativa.'; END IF;
    v_forma := 'sem_pagamento';
    SELECT id, coalesce(desconto_pct,0) INTO v_natureza, v_bonif_pct FROM naturezas_operacao WHERE codigo = 'bonificacao' AND ativo;
    IF v_natureza IS NULL THEN RAISE EXCEPTION 'Natureza bonificacao inexistente ou inativa.'; END IF;
  ELSE
    SELECT id INTO v_regra FROM regras_pagamento_pedido WHERE codigo = p_pagamento AND ativo AND espera_pagamento;
    IF v_regra IS NULL THEN RAISE EXCEPTION 'Regra de pagamento % inexistente ou sem portao.', p_pagamento; END IF;
    v_forma := CASE p_pagamento WHEN 'pix' THEN 'pix' ELSE 'cartao' END;
    SELECT id INTO v_natureza FROM naturezas_operacao WHERE codigo = 'venda' AND ativo;
  END IF;

  v_calc := public.fn_vd_calcular(p_cliente, p_itens, p_entrega);

  IF v_bonif THEN
    -- Mesma regra do B2B: preco de tabela com desconto_pct da natureza; sem beneficio/desconto comercial; frete absorvido.
    SELECT jsonb_agg(e || jsonb_build_object('valor_unitario', round((e->>'valor_unitario')::numeric * (1 - v_bonif_pct/100), 2)) ORDER BY o),
           sum(round((e->>'valor_unitario')::numeric * (1 - v_bonif_pct/100), 2) * (e->>'quantidade')::numeric)
      INTO v_itens_b, v_bruto_b
      FROM jsonb_array_elements(v_calc->'itens_json') WITH ORDINALITY AS t(e, o);
    v_end := (v_calc->'endereco_entrega') - 'desconto';
    IF v_end ? 'frete' THEN
      v_end := jsonb_set(v_end, '{frete}', (v_end->'frete') - 'beneficio' || jsonb_build_object('cobrado', 0, 'motivo', 'Bonificacao: frete absorvido pela Fetely'));
    END IF;
    v_end := v_end || jsonb_build_object('bonificacao', jsonb_build_object('autorizado_por', v_bonif_aut, 'motivo', v_bonif_motivo, 'desconto_pct', v_bonif_pct));
    v_calc := v_calc || jsonb_build_object('itens_json', v_itens_b, 'valor_itens', v_bruto_b, 'desconto_pedido', 0, 'frete_cobrado', 0,
      'valor_total', v_bruto_b, 'desconto_pct', NULL, 'endereco_entrega', v_end,
      'frete_tipo', CASE WHEN v_calc->>'modo' = 'retirada' THEN v_calc->>'frete_tipo' ELSE 'CIF_ABSORVIDO' END,
      'obs_beneficio', 'Bonificacao (' || v_bonif_motivo || ') aut. ' || v_bonif_aut || coalesce(' — ' || v_bonif_obs, ''));
  END IF;

  -- SHOW-ROOM-CD (25/10/2026): CD da venda direta vem de p_entrega.centro_codigo (padrao SITE-SP), habilitado em centro_canal (canal VD).
  SELECT c.id INTO v_centro FROM centro_distribuicao c
    JOIN centro_canal cc ON cc.centro_codigo = c.codigo AND cc.canal = 'VD' AND cc.habilitado
   WHERE c.codigo = upper(coalesce(nullif(btrim(p_entrega->>'centro_codigo'),''), 'SITE-SP')) AND c.ativo;
  IF v_centro IS NULL THEN
    RAISE EXCEPTION 'CD % nao esta habilitado para venda direta.', upper(coalesce(nullif(btrim(p_entrega->>'centro_codigo'),''), 'SITE-SP')) USING ERRCODE='22023';
  END IF;

  IF nullif(p_cliente->>'parceiro_id','') IS NOT NULL THEN
    SELECT id, regexp_replace(coalesce(cpf,''),'\D','','g'), razao_social INTO v_parceiro, v_cpf, v_nome FROM parceiros_comerciais WHERE id = (p_cliente->>'parceiro_id')::uuid;
    IF v_parceiro IS NULL THEN RAISE EXCEPTION 'Cliente nao encontrado.'; END IF;
  ELSE
    v_cpf := regexp_replace(coalesce(p_cliente->>'cpf',''),'\D','','g');
    v_nome := nullif(btrim(coalesce(p_cliente->>'nome','')),'');
    IF v_nome IS NULL THEN RAISE EXCEPTION 'Nome do cliente obrigatorio.' USING ERRCODE = '22023'; END IF;
    IF length(v_cpf) <> 11 THEN RAISE EXCEPTION 'CPF invalido (11 digitos).' USING ERRCODE='22023'; END IF;
    SELECT id INTO v_parceiro FROM parceiros_comerciais WHERE regexp_replace(coalesce(cpf,''),'\D','','g') = v_cpf LIMIT 1;
    IF v_parceiro IS NULL THEN
      INSERT INTO parceiros_comerciais (razao_social, nome_fantasia, tipo_pessoa, tipo, tipos, cpf, telefone, email, cep, logradouro, numero, endereco_complemento, bairro, cidade, uf, cadastro_incompleto)
      VALUES (v_nome, v_nome, 'PF', 'pf', ARRAY['cliente'], v_cpf, p_cliente->>'telefone', p_cliente->>'email', p_cliente->>'cep', p_cliente->>'logradouro', p_cliente->>'numero', p_cliente->>'complemento', p_cliente->>'bairro', p_cliente->>'cidade', p_cliente->>'uf', false)
      RETURNING id INTO v_parceiro;
    END IF;
  END IF;
  IF length(coalesce(v_cpf,'')) <> 11 THEN RAISE EXCEPTION 'Cliente sem CPF valido — obrigatorio para a NF.' USING ERRCODE='22023'; END IF;

  -- HAVER: valida antes de criar o pedido
  IF p_haver_id IS NOT NULL THEN
    SELECT * INTO v_haver FROM haver_cliente WHERE id = p_haver_id AND status IN ('disponivel','parcial');
    IF v_haver.id IS NULL THEN RAISE EXCEPTION 'Haver nao disponivel.' USING ERRCODE='22023'; END IF;
    IF v_haver.parceiro_id <> v_parceiro THEN RAISE EXCEPTION 'Haver pertence a outro cliente.' USING ERRCODE='22023'; END IF;
    IF v_haver.data_expiracao IS NOT NULL AND v_haver.data_expiracao < current_date THEN RAISE EXCEPTION 'Haver expirado em %.', to_char(v_haver.data_expiracao,'DD/MM/YYYY') USING ERRCODE='22023'; END IF;
  END IF;

  v_total := (v_calc->>'valor_total')::numeric;
  v_idext := 'VD-' || lpad(nextval('public.seq_pedido_venda_direta')::text, 4, '0');

  INSERT INTO pedidos (id_externo, parceiro_id, natureza_operacao_id, canal, origem, recebido_via, data_pedido, condicao_solicitada, forma_solicitada, regra_pagamento_id, valor_bruto, valor_frete, valor_liquido,
    frete_tipo, estimativa_frete_valor, endereco_entrega, origem_centro_id, observacao_pedido, itens_json, desconto_pct, vendedor_id)
  VALUES (v_idext, v_parceiro, v_natureza, 'B2C', 'venda_direta', 'manual', CURRENT_DATE,
    CASE p_pagamento WHEN 'pix' THEN 'PIX a vista' WHEN 'cartao_maquininha' THEN 'Cartão maquininha à vista' WHEN 'bonificacao' THEN 'Bonificação' ELSE 'Cartão 1x' END, v_forma, v_regra,
    (v_calc->>'valor_itens')::numeric, (v_calc->>'frete_cobrado')::numeric, v_total, v_calc->>'frete_tipo', nullif((v_calc->>'custo_frete')::numeric, 0), v_calc->'endereco_entrega', v_centro,
    nullif(concat_ws(' · ', nullif(p_observacao,''), v_calc->>'obs_beneficio', CASE WHEN p_haver_id IS NOT NULL OR coalesce(p_usar_haver,false) THEN 'Crédito do cliente aplicado' END), ''), v_calc->'itens_json', (v_calc->>'desconto_pct')::numeric, p_vendedor_id)
  RETURNING id INTO v_pedido;

  SELECT count(*) INTO v_n FROM pedido_itens WHERE pedido_id = v_pedido;
  IF v_n <> jsonb_array_length(v_calc->'itens_json') THEN RAISE EXCEPTION 'Materializacao dos itens falhou: % no json, % na tabela', jsonb_array_length(v_calc->'itens_json'), v_n; END IF;

  INSERT INTO pedido_eventos (pedido_id, tipo_evento, estagio_anterior, estagio_novo, descricao, metadata, automatico)
  VALUES (v_pedido, 'mudou_estagio', NULL, 'recebido', 'Venda direta criada no SNCF (telefone/WhatsApp)',
    jsonb_build_object('criado_por', v_uid, 'vendedor_id', p_vendedor_id, 'pagamento', p_pagamento, 'haver_id', p_haver_id, 'usar_haver', coalesce(p_usar_haver,false), 'entrega', v_calc->>'modo', 'frete_tipo', v_calc->>'frete_tipo', 'frete', v_calc->'endereco_entrega'->'frete', 'desconto', v_calc->'endereco_entrega'->'desconto', 'bonificacao', v_calc->'endereco_entrega'->'bonificacao', 'avisos', v_calc->'avisos'), false);

  -- BONIFICACAO: registra a concessao (padrinho + motivo) e segue sem cobranca
  IF v_bonif THEN
    v_conc := public.conceder_bonificacao(v_parceiro, 'pedido_bonificado', v_bonif_motivo, v_bonif_aut, NULL, v_pedido, NULL, v_bonif_obs);
    v_rot := public.rotear_pedido(v_pedido)::jsonb;
    RETURN jsonb_build_object('ok', true, 'pedido_id', v_pedido, 'id_externo', v_idext, 'valor_itens', (v_calc->>'valor_itens')::numeric, 'frete_cobrado', 0,
      'frete', v_calc->'endereco_entrega'->'frete', 'valor_total', v_total, 'desconto_pedido', 0, 'desconto', NULL,
      'pagamento', 'bonificacao', 'bonificacao', v_conc, 'valor_a_pagar', 0, 'provisao_id', NULL, 'link_pagamento', NULL, 'pix_copia_cola', NULL,
      'avisos', v_calc->'avisos', 'estagio', (SELECT estagio FROM pedidos WHERE id = v_pedido), 'roteamento', v_rot);
  END IF;

  v_rot := public.rotear_pedido(v_pedido)::jsonb;

  -- HAVER-MULTIPLO: aplica um a um ate o restante zerar
  IF coalesce(p_usar_haver,false) THEN
    FOR v_hv IN SELECT e FROM jsonb_array_elements(public.fn_haver_disponivel_parceiro(v_parceiro)) e LOOP
      EXIT WHEN v_soma >= v_total;
      v_apl := public.aplicar_haver_pedido((v_hv->>'haver_id')::uuid, v_pedido);
      v_apls := v_apls || jsonb_build_array(v_apl::jsonb);
      v_soma := v_soma + (v_apl->>'valor_aplicado')::numeric;
    END LOOP;
    IF v_soma > 0 AND v_soma >= v_total THEN
      RETURN jsonb_build_object('ok', true, 'pedido_id', v_pedido, 'id_externo', v_idext, 'valor_itens', (v_calc->>'valor_itens')::numeric, 'frete_cobrado', (v_calc->>'frete_cobrado')::numeric,
        'frete', v_calc->'endereco_entrega'->'frete', 'valor_total', v_total, 'desconto_pedido', (v_calc->>'desconto_pedido')::numeric, 'desconto', v_calc->'endereco_entrega'->'desconto',
        'pagamento', 'haver', 'haver', v_apls, 'valor_haver', v_soma, 'valor_a_pagar', 0, 'provisao_id', null, 'link_pagamento', null, 'pix_copia_cola', null,
        'avisos', v_calc->'avisos', 'estagio', (SELECT estagio FROM pedidos WHERE id = v_pedido), 'roteamento', v_rot);
    END IF;
  END IF;

  -- HAVER cobre tudo: aplicar_haver_pedido cria provisao 'haver' e transiciona; sem portao
  IF p_haver_id IS NOT NULL THEN IF v_haver.saldo >= v_total THEN
    v_apl := public.aplicar_haver_pedido(p_haver_id, v_pedido);
    RETURN jsonb_build_object('ok', true, 'pedido_id', v_pedido, 'id_externo', v_idext, 'valor_itens', (v_calc->>'valor_itens')::numeric, 'frete_cobrado', (v_calc->>'frete_cobrado')::numeric,
      'frete', v_calc->'endereco_entrega'->'frete', 'valor_total', v_total, 'desconto_pedido', (v_calc->>'desconto_pedido')::numeric, 'desconto', v_calc->'endereco_entrega'->'desconto',
      'pagamento', 'haver', 'haver', v_apl, 'valor_haver', v_total, 'valor_a_pagar', 0, 'provisao_id', null, 'link_pagamento', null, 'pix_copia_cola', null,
      'avisos', v_calc->'avisos', 'estagio', (SELECT estagio FROM pedidos WHERE id = v_pedido), 'roteamento', v_rot);
  END IF; END IF;

  -- HAVER parcial: aplica o saldo e o portao cobra so o resto
  v_resto := v_total;
  IF p_haver_id IS NOT NULL THEN
    v_apl := public.aplicar_haver_pedido(p_haver_id, v_pedido);
    v_resto := v_total - (v_apl->>'valor_aplicado')::numeric;
  ELSIF coalesce(p_usar_haver,false) THEN
    v_resto := v_total - v_soma;
  END IF;

  v_plano := public.montar_plano_pagamento(v_pedido,
    jsonb_build_array(jsonb_build_object('numero_parcela', 1, 'valor', v_resto, 'valor_bruto', v_resto, 'eh_portao', true, 'eh_entrada', false, 'tipo_pagamento', v_forma, 'data_vencimento', CURRENT_DATE, 'data_prevista', CURRENT_DATE)),
    'venda direta SP');
  SELECT (e->>'provisao_id')::uuid INTO v_prov FROM jsonb_array_elements(v_plano->'linhas') e WHERE (e->>'eh_portao')::boolean LIMIT 1;
  IF p_pagamento = 'pix' AND v_prov IS NOT NULL THEN
    v_pix := public.gerar_pix_provisao(v_prov);
    v_link := public.fn_url_publica() || '/pagar/' || (v_pix->>'token');
  END IF;

  RETURN jsonb_build_object('ok', true, 'pedido_id', v_pedido, 'id_externo', v_idext, 'valor_itens', (v_calc->>'valor_itens')::numeric, 'frete_cobrado', (v_calc->>'frete_cobrado')::numeric,
    'frete', v_calc->'endereco_entrega'->'frete', 'valor_total', v_total, 'desconto_pedido', (v_calc->>'desconto_pedido')::numeric, 'desconto', v_calc->'endereco_entrega'->'desconto', 'pagamento', p_pagamento,
    'haver', CASE WHEN coalesce(p_usar_haver,false) THEN v_apls ELSE to_jsonb(v_apl) END, 'valor_haver', v_total - v_resto, 'valor_a_pagar', v_resto,
    'provisao_id', v_prov, 'link_pagamento', v_link, 'pix_copia_cola', v_pix->>'payload', 'avisos', v_calc->'avisos', 'estagio', (SELECT estagio FROM pedidos WHERE id = v_pedido), 'roteamento', v_rot);
END $function$;
REVOKE ALL ON FUNCTION public.criar_pedido_venda_direta(jsonb,jsonb,jsonb,text,text,uuid,uuid,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_pedido_venda_direta(jsonb,jsonb,jsonb,text,text,uuid,uuid,jsonb,boolean) TO authenticated, service_role;