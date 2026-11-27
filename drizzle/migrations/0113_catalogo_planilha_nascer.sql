SET LOCAL lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.fn_catalogo_nascer_da_planilha(p_cartorio jsonb, p_produtos jsonb, p_dry_run boolean DEFAULT true, p_leitura_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
-- 27/11/2026 FRENTE PRODUTO-REORGANIZACAO: propostas da planilha v2 (aba "Códigos e EAN" + Catálogo).
-- Cartório primeiro (reservar código / mudar inner), depois fn_nascer_produtos_lote. Atômico.
-- Dry-run aplica numa subtransação e desfaz no fim, para a prévia do nascimento enxergar as reservas.
declare
  v_uid uuid := auth.uid(); p jsonb; v_row record; v_ean text; v_cod text; v_inner int; v_tipo text;
  v_cart jsonb := '[]'::jsonb; v_erros jsonb := '[]'::jsonb; v_nasc jsonb; v_res jsonb; i int := 0;
  v_motivo text := 'Planilha v2 do catálogo' || coalesce(' — leitura ' || p_leitura_id::text, '');
begin
  if v_uid is null then raise exception 'FAIL-LOUD fn_catalogo_nascer_da_planilha: exige usuário autenticado.'; end if;
  if not usuario_tem_acao('acao.produto_importar_planilha_cadastro', v_uid) then
    raise exception 'FAIL-LOUD fn_catalogo_nascer_da_planilha: sem permissão (acao.produto_importar_planilha_cadastro).'; end if;
  p_cartorio := coalesce(p_cartorio, '[]'::jsonb); p_produtos := coalesce(p_produtos, '[]'::jsonb);
  if jsonb_typeof(p_cartorio) <> 'array' or jsonb_typeof(p_produtos) <> 'array' then raise exception 'FAIL-LOUD: p_cartorio e p_produtos devem ser arrays.'; end if;
  if jsonb_array_length(p_cartorio) + jsonb_array_length(p_produtos) = 0 then raise exception 'FAIL-LOUD: nada para aplicar.'; end if;

  begin
    for p in select * from jsonb_array_elements(p_cartorio) loop
      i := i + 1;
      v_tipo := p->>'tipo'; v_ean := nullif(btrim(p->>'ean'),''); v_cod := nullif(btrim(p->>'cod_cadastro'),'');
      v_inner := nullif(btrim(coalesce(p->>'inner_qtd','')),'')::int;
      if v_ean is null or v_cod is null or v_tipo not in ('reservar','mudar_inner') then
        v_erros := v_erros || jsonb_build_object('linha', i, 'ean', v_ean, 'erro', 'proposta incompleta'); continue; end if;
      if v_inner is not null and v_inner < 1 then
        v_erros := v_erros || jsonb_build_object('linha', i, 'ean', v_ean, 'erro', 'inner deve ser >= 1'); continue; end if;
      select * into v_row from cartorio_codigo where ean = v_ean for update;
      if not found then v_erros := v_erros || jsonb_build_object('linha', i, 'ean', v_ean, 'erro', 'EAN não existe no cartório'); continue; end if;
      if v_row.sku like 'MORTO-%' then v_erros := v_erros || jsonb_build_object('linha', i, 'ean', v_ean, 'erro', 'EAN morto'); continue; end if;
      if v_tipo = 'reservar' then
        if v_row.cod_cadastro = v_cod and v_inner is not distinct from coalesce(v_inner, v_row.inner_qtd) and (v_inner is null or v_row.inner_qtd = v_inner) then
          v_cart := v_cart || jsonb_build_object('tipo', v_tipo, 'ean', v_ean, 'cod_cadastro', v_cod, 'situacao', 'ja_aplicada'); continue; end if;
        if nullif(btrim(coalesce(v_row.cod_cadastro,'')),'') is not null then
          v_erros := v_erros || jsonb_build_object('linha', i, 'ean', v_ean, 'erro', format('EAN já tem o código %s (%s) — não se troca pela planilha', v_row.cod_cadastro, v_row.estado)); continue; end if;
        if exists (select 1 from cartorio_codigo where cod_cadastro = v_cod and ean <> v_ean) then
          v_erros := v_erros || jsonb_build_object('linha', i, 'ean', v_ean, 'erro', format('código %s já existe em outro EAN', v_cod)); continue; end if;
        update cartorio_codigo set cod_cadastro = v_cod, inner_qtd = coalesce(v_inner, inner_qtd),
          observacao = coalesce(observacao,'') || format(' | Reservado cod %s%s em %s (%s)', v_cod, coalesce(' inner '||v_inner, ''), to_char(now(),'DD/MM/YYYY'), left(v_motivo,120)),
          atualizado_em = now()
        where ean = v_ean;
      else
        if v_row.cod_cadastro is distinct from v_cod then
          v_erros := v_erros || jsonb_build_object('linha', i, 'ean', v_ean, 'erro', format('EAN pertence ao código %s, não a %s', coalesce(v_row.cod_cadastro,'∅'), v_cod)); continue; end if;
        if v_inner is null then v_erros := v_erros || jsonb_build_object('linha', i, 'ean', v_ean, 'erro', 'inner ausente'); continue; end if;
        if v_row.inner_qtd = v_inner then
          v_cart := v_cart || jsonb_build_object('tipo', v_tipo, 'ean', v_ean, 'cod_cadastro', v_cod, 'situacao', 'ja_aplicada'); continue; end if;
        perform fn_cartorio_definir_inner(v_cod, v_inner, v_motivo);
      end if;
      v_cart := v_cart || jsonb_build_object('tipo', v_tipo, 'ean', v_ean, 'cod_cadastro', v_cod, 'inner_qtd', v_inner, 'situacao', case when p_dry_run then 'aplicaria' else 'aplicada' end);
    end loop;

    if jsonb_array_length(p_produtos) > 0 then
      v_nasc := fn_nascer_produtos_lote(p_produtos, true);
      if not p_dry_run and jsonb_array_length(v_erros) = 0 and coalesce((v_nasc->>'pode_confirmar')::boolean, false) then
        v_nasc := fn_nascer_produtos_lote(p_produtos, false);
      end if;
    end if;

    v_res := jsonb_build_object('dry_run', p_dry_run, 'cartorio', v_cart, 'cartorio_erros', case when jsonb_array_length(v_erros) > 0 then v_erros end,
      'nascimento', v_nasc,
      'pode_confirmar', jsonb_array_length(v_erros) = 0 and (v_nasc is null or coalesce((v_nasc->>'pode_confirmar')::boolean, (v_nasc->>'dry_run')::boolean is false)));
    if p_dry_run then raise exception using errcode = 'P0099', message = 'catalogo_nascer_dry_run'; end if;
    if jsonb_array_length(v_erros) > 0 or (v_nasc is not null and (v_nasc->>'dry_run')::boolean) then
      raise exception 'FAIL-LOUD fn_catalogo_nascer_da_planilha: lote recusado, nada foi gravado. Cartório: % · Nascimento: %', v_erros, coalesce(v_nasc->'problemas', '[]'::jsonb);
    end if;
  exception when sqlstate 'P0099' then
    return v_res;
  end;
  insert into audit_log (acao, justificativa, user_id) select 'catalogo_planilha_nascer', v_motivo, v_uid where false;
  return v_res;
end $function$;
REVOKE ALL ON FUNCTION public.fn_catalogo_nascer_da_planilha(jsonb, jsonb, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_nascer_da_planilha(jsonb, jsonb, boolean, uuid) TO authenticated, service_role;