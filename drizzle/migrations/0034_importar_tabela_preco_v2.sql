-- 02/11/2026: importador de tabela de preço v2 (clone da vigente + troca só das tarifas da planilha
-- + atendimento/generalidades/TRT copiados + prazo opcional), com simulação pelo MESMO motor
-- (fn_frete_estimado) antes de publicar. Motivo: v1 gravava preço NULL e nascia sem CEPs.

-- 1) Motor: por_kg deixa de travar em 30 kg; usa a maior faixa numérica da tarifa
--    (tabelas atuais vão até 30 → resultado idêntico).
DO $mig$
DECLARE v_def text; v_novo text;
BEGIN
  v_def := pg_get_functiondef('public.fn_frete_estimado(uuid,text,numeric,date,numeric)'::regprocedure);
  v_novo := replace(v_def,
    'v_peso_lookup := LEAST(CEIL(p_peso_cobrado)::INTEGER, 30);',
    'v_peso_lookup := LEAST(CEIL(p_peso_cobrado)::INTEGER, COALESCE((SELECT MAX(k::INTEGER) FROM jsonb_object_keys(v_tarifa.pesos) k WHERE k ~ ''^[0-9]+$''), 30));');
  v_novo := replace(v_novo,
    'IF p_peso_cobrado > 30 THEN
      v_valor_base := v_valor_base + (p_peso_cobrado - 30) * v_tarifa.kg_adicional;',
    'IF p_peso_cobrado > v_peso_lookup THEN
      v_valor_base := v_valor_base + (p_peso_cobrado - v_peso_lookup) * v_tarifa.kg_adicional;');
  IF v_novo = v_def OR position('p_peso_cobrado - v_peso_lookup' in v_novo) = 0 THEN
    RAISE EXCEPTION 'fn_frete_estimado: trecho por_kg não encontrado — ajuste manual necessário';
  END IF;
  EXECUTE v_novo;
END $mig$;

-- 2) Amostra de preço de uma transportadora num CEP (usa só o motor)
CREATE OR REPLACE FUNCTION public._tabela_preco_amostra(p_transp uuid, p_cep text, p_ref date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  SELECT jsonb_build_object(
    'p1',   (public.fn_frete_estimado(p_transp, p_cep, 1,   p_ref, 0)->'breakdown'->>'base')::numeric,
    'p10',  (public.fn_frete_estimado(p_transp, p_cep, 10,  p_ref, 0)->'breakdown'->>'base')::numeric,
    'p30',  (public.fn_frete_estimado(p_transp, p_cep, 30,  p_ref, 0)->'breakdown'->>'base')::numeric,
    'p100', (public.fn_frete_estimado(p_transp, p_cep, 100, p_ref, 0)->'breakdown'->>'base')::numeric,
    'frete_10', (public.fn_frete_estimado(p_transp, p_cep, 10, p_ref, 1000)->>'valor_estimado')::numeric,
    'frete_50', (public.fn_frete_estimado(p_transp, p_cep, 50, p_ref, 5000)->>'valor_estimado')::numeric,
    'prazo', (public.fn_frete_estimado(p_transp, p_cep, 1, p_ref, 0)->>'prazo_dias')::int,
    'erro',  public.fn_frete_estimado(p_transp, p_cep, 1, p_ref, 0)->>'erro'
  );
$f$;
REVOKE ALL ON FUNCTION public._tabela_preco_amostra(uuid,text,date) FROM PUBLIC, anon, authenticated;

-- 3) RPC transacional
CREATE OR REPLACE FUNCTION public.fn_importar_tabela_preco_v2(
  p_transportadora_id uuid, p_nome text, p_vigencia_inicio date, p_vigencia_descricao text,
  p_modo text, p_aplicar_prazo boolean, p_tarifas jsonb, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_vig transp_tabelas%ROWTYPE; v_old transp_tabela_tarifas%ROWTYPE; v_t transp_tabela_tarifas%ROWTYPE;
  v_new uuid; v_codes text[]; v_txt text; x jsonb; c text; v_cep text;
  v_trocadas int := 0; v_mantidas int := 0; v_ceps int := 0; v_prazos int := 0; v_sem_cep text[] := '{}';
  v_vig_map jsonb := '{}'; v_comp jsonb := '[]'; v_ref date; v_nova jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória para importar tabela de preço'; END IF;
  IF p_transportadora_id IS NULL THEN RAISE EXCEPTION 'transportadora_id obrigatório'; END IF;
  IF COALESCE(trim(p_nome),'') = '' THEN RAISE EXCEPTION 'Nome da versão obrigatório'; END IF;
  IF p_vigencia_inicio IS NULL THEN RAISE EXCEPTION 'Vigência início obrigatória'; END IF;
  IF p_modo NOT IN ('parcial','completa') THEN RAISE EXCEPTION 'modo inválido: % (parcial|completa)', p_modo; END IF;
  IF jsonb_typeof(p_tarifas) <> 'array' OR jsonb_array_length(p_tarifas) = 0 THEN
    RAISE EXCEPTION 'p_tarifas deve ser um array não-vazio';
  END IF;

  -- Guards por linha
  FOR x IN SELECT * FROM jsonb_array_elements(p_tarifas) LOOP
    IF COALESCE(x->>'tarifa_code','') = '' THEN RAISE EXCEPTION 'tarifa sem tarifa_code: %', x; END IF;
    IF COALESCE(x->>'uf','') !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'UF inválida em %: %', x->>'tarifa_code', x->>'uf'; END IF;
    IF x ? 'tipo' AND x->>'modelo_peso' = 'por_kg' AND x->>'tipo' NOT IN ('CAPITAL','INTERIOR') THEN
      RAISE EXCEPTION 'tipo inválido em %: % (CAPITAL|INTERIOR)', x->>'tarifa_code', x->>'tipo';
    END IF;
    IF jsonb_typeof(x->'pesos') <> 'object' OR x->'pesos' = '{}'::jsonb THEN
      RAISE EXCEPTION 'pesos vazios em %', x->>'tarifa_code';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(x->'pesos') e WHERE jsonb_typeof(e.value) <> 'number') THEN
      RAISE EXCEPTION 'peso não numérico em %', x->>'tarifa_code';
    END IF;
  END LOOP;

  SELECT string_agg(k, ', ') INTO v_txt FROM (
    SELECT e->>'tarifa_code' k FROM jsonb_array_elements(p_tarifas) e GROUP BY 1 HAVING count(*) > 1) d;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'tarifa_code repetido na planilha: %', v_txt; END IF;

  v_codes := ARRAY(SELECT e->>'tarifa_code' FROM jsonb_array_elements(p_tarifas) e);

  SELECT * INTO v_vig FROM transp_tabelas
   WHERE transportadora_id = p_transportadora_id AND ativo
   ORDER BY vigencia_inicio DESC NULLS LAST, criado_em DESC LIMIT 1;
  IF v_vig.id IS NULL THEN
    RAISE EXCEPTION 'Transportadora sem versão ativa: não há faixas de CEP para copiar';
  END IF;

  IF p_modo = 'parcial' THEN
    SELECT string_agg(c2, ', ') INTO v_txt FROM unnest(v_codes) c2
     WHERE NOT EXISTS (SELECT 1 FROM transp_tabela_tarifas t WHERE t.tabela_id = v_vig.id AND t.tarifa_code = c2);
    IF v_txt IS NOT NULL THEN
      RAISE EXCEPTION 'tarifa_code não existe na versão vigente (%): %', v_vig.nome, v_txt;
    END IF;
  END IF;

  -- Amostra da vigente (antes de qualquer escrita)
  FOREACH c IN ARRAY v_codes LOOP
    SELECT lpad(cep_inicial::text, 8, '0') INTO v_cep FROM transp_tabela_atendimento
     WHERE tabela_id = v_vig.id AND tarifa_code = c ORDER BY zona_pendente, cep_inicial LIMIT 1;
    SELECT * INTO v_t FROM transp_tabela_tarifas WHERE tabela_id = v_vig.id AND tarifa_code = c LIMIT 1;
    v_vig_map := v_vig_map || jsonb_build_object(c, jsonb_build_object(
      'cep', v_cep,
      'existe', v_t.id IS NOT NULL,
      'excedente', v_t.kg_adicional, 'adv', v_t.adv_pct,
      'gris', COALESCE(v_vig.gris_pct, v_t.gris_pct),
      'amostra', CASE WHEN v_cep IS NULL THEN NULL
                      ELSE public._tabela_preco_amostra(p_transportadora_id, v_cep, CURRENT_DATE) END));
  END LOOP;

  v_ref := GREATEST(CURRENT_DATE, p_vigencia_inicio);

  BEGIN
    -- Cabeçalho: clone integral da vigente (trigger desativa a anterior)
    INSERT INTO transp_tabelas (
      transportadora_id, nome, modal, vigencia_inicio, vigencia_descricao, ativo,
      gris_pct, gris_base, gris_minimo, adm_pct, tx_coleta, pedagio_por_100kg, suframa, tas,
      elegivel_default, elegivel_default_motivo, tas_ufs, suframa_ufs,
      emex_pct, emex_por_100kg, emex_ufs, trt_pct, trt_minimo)
    VALUES (
      p_transportadora_id, trim(p_nome), v_vig.modal, p_vigencia_inicio, NULLIF(trim(p_vigencia_descricao),''), true,
      v_vig.gris_pct, v_vig.gris_base, v_vig.gris_minimo, v_vig.adm_pct, v_vig.tx_coleta, v_vig.pedagio_por_100kg,
      v_vig.suframa, v_vig.tas, v_vig.elegivel_default, v_vig.elegivel_default_motivo, v_vig.tas_ufs, v_vig.suframa_ufs,
      v_vig.emex_pct, v_vig.emex_por_100kg, v_vig.emex_ufs, v_vig.trt_pct, v_vig.trt_minimo)
    RETURNING id INTO v_new;

    -- Tarifas mantidas (só no parcial)
    IF p_modo = 'parcial' THEN
      INSERT INTO transp_tabela_tarifas (tabela_id, uf, tipo, tarifa_code, pesos, kg_adicional, gris_pct, adv_pct,
        modelo_peso, peso_minimo, adm_pct, tx_coleta, suframa, tas, gris_base, gris_minimo, fv_pct,
        pedagio_por_100kg, txa, fv_por_faixa, trt_aplica)
      SELECT v_new, uf, tipo, tarifa_code, pesos, kg_adicional, gris_pct, adv_pct,
        modelo_peso, peso_minimo, adm_pct, tx_coleta, suframa, tas, gris_base, gris_minimo, fv_pct,
        pedagio_por_100kg, txa, fv_por_faixa, trt_aplica
        FROM transp_tabela_tarifas WHERE tabela_id = v_vig.id AND NOT (tarifa_code = ANY(v_codes));
      GET DIAGNOSTICS v_mantidas = ROW_COUNT;
    END IF;

    -- Tarifas da planilha (campos ausentes herdam da tarifa vigente de mesmo código)
    FOR x IN SELECT * FROM jsonb_array_elements(p_tarifas) LOOP
      v_old := NULL;
      SELECT * INTO v_old FROM transp_tabela_tarifas WHERE tabela_id = v_vig.id AND tarifa_code = x->>'tarifa_code' LIMIT 1;
      INSERT INTO transp_tabela_tarifas (tabela_id, uf, tipo, tarifa_code, pesos, kg_adicional, gris_pct, adv_pct,
        modelo_peso, peso_minimo, adm_pct, tx_coleta, suframa, tas, gris_base, gris_minimo, fv_pct,
        pedagio_por_100kg, txa, fv_por_faixa, trt_aplica)
      VALUES (v_new, x->>'uf', COALESCE(NULLIF(x->>'tipo',''), v_old.tipo, 'zona'), x->>'tarifa_code', x->'pesos',
        CASE WHEN x ? 'kg_adicional' THEN (x->>'kg_adicional')::numeric ELSE COALESCE(v_old.kg_adicional, 0) END,
        CASE WHEN x ? 'gris_pct' THEN (x->>'gris_pct')::numeric ELSE v_old.gris_pct END,
        CASE WHEN x ? 'adv_pct'  THEN (x->>'adv_pct')::numeric  ELSE v_old.adv_pct END,
        COALESCE(NULLIF(x->>'modelo_peso',''), v_old.modelo_peso, 'faixas_fixas'),
        COALESCE(v_old.peso_minimo, 0), v_old.adm_pct, v_old.tx_coleta, v_old.suframa, v_old.tas,
        v_old.gris_base, v_old.gris_minimo,
        CASE WHEN x ? 'fv_pct' THEN (x->>'fv_pct')::numeric ELSE COALESCE(v_old.fv_pct, 0) END,
        v_old.pedagio_por_100kg,
        CASE WHEN x ? 'txa' THEN (x->>'txa')::numeric ELSE COALESCE(v_old.txa, 0) END,
        CASE WHEN COALESCE(NULLIF(x->>'modelo_peso',''), v_old.modelo_peso) = v_old.modelo_peso THEN v_old.fv_por_faixa END,
        COALESCE(v_old.trt_aplica, false));
      v_trocadas := v_trocadas + 1;
    END LOOP;

    -- Atendimento (CEPs)
    INSERT INTO transp_tabela_atendimento (tabela_id, cidade, uf, cep_inicial, cep_final, zona, tarifa_code,
      prazo, tda_risco, canal, zona_pendente, zona_polo_fallback)
    SELECT v_new, cidade, uf, cep_inicial, cep_final, zona, tarifa_code, prazo, tda_risco, canal, zona_pendente, zona_polo_fallback
      FROM transp_tabela_atendimento
     WHERE tabela_id = v_vig.id AND (p_modo = 'parcial' OR tarifa_code = ANY(v_codes));
    GET DIAGNOSTICS v_ceps = ROW_COUNT;

    IF COALESCE(p_aplicar_prazo, false) THEN
      UPDATE transp_tabela_atendimento a SET prazo = (e->>'prazo')::int
        FROM jsonb_array_elements(p_tarifas) e
       WHERE a.tabela_id = v_new AND a.tarifa_code = e->>'tarifa_code'
         AND NULLIF(e->>'prazo','') IS NOT NULL AND a.prazo IS DISTINCT FROM (e->>'prazo')::int;
      GET DIAGNOSTICS v_prazos = ROW_COUNT;
    END IF;

    INSERT INTO transp_tabela_generalidades (tabela_id, codigo, descricao, valor, tipo)
    SELECT v_new, codigo, descricao, valor, tipo FROM transp_tabela_generalidades WHERE tabela_id = v_vig.id;

    INSERT INTO transp_trt_cidade (tabela_id, uf, cidade, cep_inicial, cep_final, trt_aplica, fonte)
    SELECT v_new, uf, cidade, cep_inicial, cep_final, trt_aplica, fonte FROM transp_trt_cidade WHERE tabela_id = v_vig.id;

    v_sem_cep := ARRAY(SELECT DISTINCT t.tarifa_code FROM transp_tabela_tarifas t WHERE t.tabela_id = v_new
      AND NOT EXISTS (SELECT 1 FROM transp_tabela_atendimento a WHERE a.tabela_id = v_new AND a.tarifa_code = t.tarifa_code)
      ORDER BY 1);

    -- Amostra da nova pelo mesmo motor
    FOREACH c IN ARRAY v_codes LOOP
      v_cep := v_vig_map->c->>'cep';
      SELECT * INTO v_t FROM transp_tabela_tarifas WHERE tabela_id = v_new AND tarifa_code = c LIMIT 1;
      v_nova := jsonb_build_object(
        'excedente', v_t.kg_adicional, 'adv', v_t.adv_pct, 'gris', COALESCE(v_vig.gris_pct, v_t.gris_pct),
        'amostra', CASE WHEN v_cep IS NULL THEN NULL
                        ELSE public._tabela_preco_amostra(p_transportadora_id, v_cep, v_ref) END);
      v_comp := v_comp || jsonb_build_array(jsonb_build_object(
        'tarifa_code', c, 'uf', v_t.uf, 'tipo', v_t.tipo, 'cep', v_cep,
        'vigente', v_vig_map->c, 'nova', v_nova));
    END LOOP;

    IF p_simular THEN RAISE EXCEPTION 'simulacao' USING ERRCODE = 'ZZ001'; END IF;
  EXCEPTION WHEN SQLSTATE 'ZZ001' THEN
    v_new := NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true, 'simulado', p_simular, 'tabela_id', v_new,
    'vigente_id', v_vig.id, 'vigente_nome', v_vig.nome,
    'vigencia_futura', p_vigencia_inicio > CURRENT_DATE,
    'resumo', jsonb_build_object('tarifas_trocadas', v_trocadas, 'tarifas_mantidas', v_mantidas,
      'ceps_copiados', v_ceps, 'prazos_alterados', v_prazos, 'codigos_sem_cep', to_jsonb(v_sem_cep)),
    'comparativo', v_comp);
END;
$f$;
REVOKE ALL ON FUNCTION public.fn_importar_tabela_preco_v2(uuid,text,date,text,text,boolean,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_importar_tabela_preco_v2(uuid,text,date,text,text,boolean,jsonb,boolean) TO authenticated, service_role;

-- 4) v1 aposentada: não pode mais gravar preço NULL nem versão sem CEP
CREATE OR REPLACE FUNCTION public.fn_importar_tabela_preco(p_transportadora_id uuid, p_nome text, p_modal text, p_vigencia_inicio date, p_vigencia_descricao text, p_taxas jsonb, p_zonas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  RAISE EXCEPTION 'fn_importar_tabela_preco foi aposentada (gravava preço NULL e versão sem CEP). Use fn_importar_tabela_preco_v2.';
END;
$f$;
COMMENT ON FUNCTION public.fn_importar_tabela_preco(uuid,text,text,date,text,jsonb,jsonb) IS 'DEPRECATED: substituída por fn_importar_tabela_preco_v2';