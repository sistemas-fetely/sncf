CREATE OR REPLACE FUNCTION public.fn_dim_chave(x text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT array_to_string(array_remove(array_remove(regexp_split_to_array(lower(unaccent_simples(x)), '[^a-z0-9]+'), ''), 'e'), ' ')
$$;

CREATE OR REPLACE FUNCTION public.fn_dim_resolver(p_tabela text, p_valor text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
declare v_in text := nullif(btrim(regexp_replace(coalesce(p_valor,''), '\s+', ' ', 'g')),''); v_norm text; v_rot text; v_cod text; v_cols text; v_vals text;
begin
  if v_in is null then return null; end if;
  if p_tabela !~ '^produto_[a-z_]+_dim$' then raise exception 'fn_dim_resolver: tabela % não é dimensão de produto', p_tabela; end if;
  execute format('select rotulo from %I where rotulo = $1', p_tabela) into v_rot using v_in;
  if v_rot is not null then return v_rot; end if;
  v_norm := lower(unaccent_simples(v_in));
  execute format('select rotulo from %I where lower(unaccent_simples(rotulo)) = $1 or $1 = any(coalesce(variantes,''{}'')) or lower(unaccent_simples(replace(rotulo,'''''''',''’''))) = $1 order by ativo desc, ordem limit 1', p_tabela) into v_rot using v_norm;
  if v_rot is not null then return v_rot; end if;
  -- Comparação apenas: mantém a ordem e não grava grafia normalizada.
  execute format('select rotulo from %I where fn_dim_chave(rotulo) = fn_dim_chave($1) or exists (select 1 from unnest(coalesce(variantes,''{}''::text[])) v where fn_dim_chave(v) = fn_dim_chave($1)) order by ativo desc, ordem limit 1', p_tabela) into v_rot using v_in;
  if v_rot is not null then return v_rot; end if;
  -- provisiona
  v_cod := fn_dim_slug(v_in);
  execute format('select rotulo from %I where codigo = $1', p_tabela) into v_rot using v_cod;
  if v_rot is not null then return v_rot; end if;
  v_cols := 'codigo, rotulo, variantes, ativo, ordem'; v_vals := '$1, $2, array[$3], true, coalesce((select max(ordem) from '||quote_ident(p_tabela)||'),0)+10';
  if p_tabela = 'produto_tipo_dim' and p_extra ? 'grupo' then
    v_cols := v_cols||', grupo_codigo'; v_vals := v_vals||', (select codigo from produto_grupo_dim where rotulo = '||quote_literal(p_extra->>'grupo')||')';
  elsif p_tabela = 'produto_colecao_cad_dim' then
    v_cols := v_cols||', linha_codigo, no_catalogo_2026'; v_vals := v_vals||', null, false';
  end if;
  execute format('insert into %I (%s) values (%s) on conflict (codigo) do nothing', p_tabela, v_cols, v_vals) using v_cod, v_in, v_norm;
  insert into dimensao_auto_provisionada (tabela, codigo, rotulo) values (p_tabela, v_cod, v_in) on conflict do nothing;
  return v_in;
end $function$;