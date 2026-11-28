SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_produto_formato_violacoes(p sncf_produtos)
 RETURNS TABLE(campo text, valor text, regra text, motivo text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
-- Portão de formato (F4). Regras por campo vêm de produto_ficha_nascimento (dimensão via tabela).
-- Campo vazio não é violação de formato (vazio é pendência de fase/medição, outro mecanismo).
DECLARE j jsonb := to_jsonb(p); f record; v text; d text; n int; s int; num numeric; vmax numeric;
BEGIN
  FOR f IN SELECT x.campo, x.regra_formato, x.regra_parametro FROM produto_ficha_nascimento x WHERE x.regra_formato IS NOT NULL LOOP
    v := j ->> f.campo;
    CONTINUE WHEN v IS NULL OR btrim(v) = '';
    IF f.regra_formato = 'lista' THEN
      IF NOT EXISTS (SELECT 1 FROM fn_ficha_opcoes() o WHERE o.campo = f.campo AND o.valor = v) THEN
        campo := f.campo; valor := v; regra := 'lista'; motivo := 'valor fora da lista de opções'; RETURN NEXT;
      END IF;
    ELSIF f.regra_formato IN ('digitos','gtin') THEN
      d := regexp_replace(v, '\D', '', 'g'); n := (f.regra_parametro->>'n')::int;
      IF length(d) <> n OR (f.regra_formato = 'gtin' AND v !~ '^\d+$') THEN
        campo := f.campo; valor := v; regra := f.regra_formato; motivo := format('esperado %s dígitos', n); RETURN NEXT;
      ELSIF f.regra_formato = 'gtin' THEN
        SELECT sum(substr(d, i, 1)::int * CASE WHEN (n - i) % 2 = 1 THEN 3 ELSE 1 END) INTO s FROM generate_series(1, n - 1) i;
        IF (10 - s % 10) % 10 <> substr(d, n, 1)::int THEN
          campo := f.campo; valor := v; regra := 'gtin'; motivo := 'dígito verificador inválido'; RETURN NEXT;
        END IF;
      END IF;
    ELSIF f.regra_formato IN ('numero_positivo','medida') THEN
      BEGIN num := v::numeric; EXCEPTION WHEN others THEN
        campo := f.campo; valor := v; regra := f.regra_formato; motivo := 'não é número'; RETURN NEXT; CONTINUE; END;
      IF f.regra_formato = 'numero_positivo' AND num <= 0 THEN
        campo := f.campo; valor := v; regra := 'numero_positivo'; motivo := 'precisa ser maior que zero'; RETURN NEXT;
      ELSIF f.regra_formato = 'medida' AND num < 0 THEN
        campo := f.campo; valor := v; regra := 'medida'; motivo := 'medida negativa'; RETURN NEXT;
      END IF;
      IF f.regra_parametro ? 'max_campo' THEN
        vmax := nullif(j ->> (f.regra_parametro->>'max_campo'), '')::numeric;
        IF vmax IS NOT NULL AND num > vmax THEN
          campo := f.campo; valor := v; regra := f.regra_formato; motivo := format('maior que %s (%s)', f.regra_parametro->>'max_campo', vmax); RETURN NEXT;
        END IF;
      END IF;
    ELSIF f.regra_formato = 'tamanho_max' THEN
      n := (f.regra_parametro->>'n')::int;
      IF length(v) > n THEN
        campo := f.campo; valor := v; regra := 'tamanho_max'; motivo := format('passa de %s caracteres (%s)', n, length(v)); RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
  -- Coerência origem fiscal x origem do produto (dimensão via tabela: produto_origem_fiscal_dim.origem_prod_codigo).
  -- Pega o arrasto do Excel (2,3,4...) e qualquer código nacional em produto importado (e vice-versa).
  IF nullif(btrim(p.origem_fisc), '') IS NOT NULL AND nullif(btrim(p.origem_prod), '') IS NOT NULL THEN
    SELECT d.origem_prod_codigo INTO v FROM produto_origem_fiscal_dim d WHERE d.codigo = p.origem_fisc;
    IF v IS NOT NULL AND NOT EXISTS (SELECT 1 FROM produto_origem_prod_dim o WHERE o.codigo = v AND o.rotulo = p.origem_prod) THEN
      IF v = 'importado' THEN
        motivo := format('Origem fiscal %s é de produto importado, mas a origem do produto está %s. Produto nacional usa origem fiscal 0; se o produto é importado, volte a origem do produto para Importado (origens 1 e 2).', p.origem_fisc, p.origem_prod);
      ELSE
        motivo := format('Origem fiscal %s é de produto nacional, mas a origem do produto está %s. Produto importado usa 1 (importação direta) ou 2 (comprado no mercado interno); se é nacional, mude a origem do produto para Nacional.', p.origem_fisc, p.origem_prod);
      END IF;
      regra := 'coerencia';
      campo := 'origem_fisc'; valor := p.origem_fisc; RETURN NEXT;
      campo := 'origem_prod'; valor := p.origem_prod; RETURN NEXT;
    END IF;
  END IF;
END
$function$;