SET LOCAL lock_timeout = '3s';

CREATE TABLE public.loja_dim (
  slug text PRIMARY KEY,
  nome text NOT NULL,
  ordem int NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  sistema text,
  slug_planilha text NOT NULL UNIQUE,
  papel_canal text CHECK (papel_canal IN ('b2b','b2c'))
);
COMMENT ON TABLE public.loja_dim IS 'Lojas onde um produto pode ser vendido. slug_planilha = coluna da planilha v2; papel_canal decide o canal_venda derivado.';
GRANT SELECT ON public.loja_dim TO authenticated;
GRANT ALL ON public.loja_dim TO service_role;
ALTER TABLE public.loja_dim ENABLE ROW LEVEL SECURITY;
CREATE POLICY loja_dim_leitura ON public.loja_dim FOR SELECT TO authenticated USING (true);
INSERT INTO public.loja_dim(slug,nome,ordem,sistema,slug_planilha,papel_canal) VALUES
 ('b2b','B2B (FOP)',10,'fop','loja_b2b','b2b'),
 ('site','Site (Shopify)',20,'shopify','loja_site','b2c'),
 ('ml','Mercado Livre',30,'bling','loja_ml',NULL),
 ('shopee','Shopee',40,NULL,'loja_shopee',NULL),
 ('tiktok','TikTok',50,NULL,'loja_tiktok',NULL);

CREATE TABLE public.produto_loja (
  sku text NOT NULL REFERENCES public.sncf_produtos(sku) ON UPDATE CASCADE ON DELETE CASCADE,
  cod_cadastro text NOT NULL,
  loja text NOT NULL REFERENCES public.loja_dim(slug) ON UPDATE CASCADE,
  vende boolean NOT NULL,
  origem text NOT NULL CHECK (origem IN ('planilha','carga_inicial','sistema')),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sku, loja)
);
CREATE UNIQUE INDEX produto_loja_cod_loja_uidx ON public.produto_loja(cod_cadastro, loja);
CREATE INDEX produto_loja_loja_vende_idx ON public.produto_loja(loja) WHERE vende;
GRANT SELECT ON public.produto_loja TO authenticated;
GRANT ALL ON public.produto_loja TO service_role;
ALTER TABLE public.produto_loja ENABLE ROW LEVEL SECURITY;
CREATE POLICY produto_loja_leitura ON public.produto_loja FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.fn_canal_de_papeis(p_b2b boolean, p_b2c boolean)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_b2b AND p_b2c THEN 'ambos' WHEN p_b2b THEN 'b2b' WHEN p_b2c THEN 'b2c' END
$$;
CREATE OR REPLACE FUNCTION public.fn_produto_canal_derivado(p_cod text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.fn_canal_de_papeis(
    coalesce(bool_or(pl.vende) FILTER (WHERE d.papel_canal = 'b2b'), false),
    coalesce(bool_or(pl.vende) FILTER (WHERE d.papel_canal = 'b2c'), false))
  FROM public.produto_loja pl JOIN public.loja_dim d ON d.slug = pl.loja
  WHERE pl.cod_cadastro = p_cod
$$;

CREATE OR REPLACE FUNCTION public.fn_trg_produto_loja_atualizado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_produto_loja_atualizado BEFORE UPDATE ON public.produto_loja FOR EACH ROW EXECUTE FUNCTION public.fn_trg_produto_loja_atualizado();

CREATE OR REPLACE FUNCTION public.fn_trg_produto_loja_canal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('fetely.canal_derivado', '1', true);
  UPDATE sncf_produtos p SET canal_venda = public.fn_produto_canal_derivado(p.cod_cadastro)
   WHERE p.cod_cadastro IN (SELECT m.cod_cadastro FROM mudou m)
     AND p.canal_venda IS DISTINCT FROM public.fn_produto_canal_derivado(p.cod_cadastro);
  PERFORM set_config('fetely.canal_derivado', '', true);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_produto_loja_canal_ins AFTER INSERT ON public.produto_loja REFERENCING NEW TABLE AS mudou FOR EACH STATEMENT EXECUTE FUNCTION public.fn_trg_produto_loja_canal();
CREATE TRIGGER trg_produto_loja_canal_upd AFTER UPDATE ON public.produto_loja REFERENCING NEW TABLE AS mudou FOR EACH STATEMENT EXECUTE FUNCTION public.fn_trg_produto_loja_canal();
CREATE TRIGGER trg_produto_loja_canal_del AFTER DELETE ON public.produto_loja REFERENCING OLD TABLE AS mudou FOR EACH STATEMENT EXECUTE FUNCTION public.fn_trg_produto_loja_canal();

CREATE OR REPLACE FUNCTION public.fn_trg_produto_canal_protegido()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('fetely.canal_derivado', true) = '1' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.canal_venda IS NOT NULL THEN
      RAISE LOG 'canal_venda ignorado (derivado de produto_loja): % recebeu %', NEW.cod_cadastro, NEW.canal_venda;
    END IF;
    NEW.canal_venda := NULL;
  ELSIF NEW.canal_venda IS DISTINCT FROM OLD.canal_venda THEN
    RAISE LOG 'canal_venda ignorado (derivado de produto_loja): % recebeu %, mantido %', NEW.cod_cadastro, NEW.canal_venda, OLD.canal_venda;
    NEW.canal_venda := OLD.canal_venda;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_produto_canal_protegido BEFORE INSERT OR UPDATE OF canal_venda ON public.sncf_produtos FOR EACH ROW EXECUTE FUNCTION public.fn_trg_produto_canal_protegido();

CREATE OR REPLACE FUNCTION public.fn_trg_produto_lojas_nascer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cod_cadastro IS NULL THEN RETURN NEW; END IF;
  INSERT INTO produto_loja(sku, cod_cadastro, loja, vende, origem)
  SELECT NEW.sku, NEW.cod_cadastro, d.slug, false, 'sistema' FROM loja_dim d WHERE d.ativo
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_produto_lojas_nascer AFTER INSERT ON public.sncf_produtos FOR EACH ROW EXECUTE FUNCTION public.fn_trg_produto_lojas_nascer();

CREATE OR REPLACE FUNCTION public.fn_catalogo_aplicar_lojas(p_ids uuid[], p_ator uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m catalogo_planilha_mudanca; d loja_dim; p sncf_produtos; ultima uuid; v boolean; atual boolean; txt text;
  n int := 0; resultados jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Somente serviço.'; END IF;
  IF p_ator IS NULL THEN RAISE EXCEPTION 'Autor obrigatório.'; END IF;
  IF coalesce(cardinality(p_ids), 0) = 0 OR cardinality(p_ids) > 5000 THEN RAISE EXCEPTION 'Seleção inválida.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
  SELECT id INTO ultima FROM catalogo_planilha_leitura WHERE ambiente = 'oficial' AND status IN ('comparada','aplicada_parcial','aplicada') ORDER BY lida_em DESC LIMIT 1;
  FOR m IN SELECT * FROM catalogo_planilha_mudanca WHERE id = ANY(p_ids) ORDER BY cod_cadastro, campo FOR UPDATE LOOP
    BEGIN
      IF m.leitura_id <> ultima OR m.dono <> 'produto' OR m.tipo NOT IN ('mudanca','conflito') OR m.status <> 'pendente' THEN
        RAISE EXCEPTION 'Mudança não está pendente na última leitura.';
      END IF;
      SELECT * INTO d FROM loja_dim WHERE slug_planilha = m.campo AND ativo;
      IF NOT FOUND THEN RAISE EXCEPTION 'Coluna % não é uma loja ativa.', m.campo; END IF;
      txt := m.valor_planilha #>> '{}';
      IF txt IS NULL OR txt NOT IN ('true','false') THEN RAISE EXCEPTION 'Valor de loja inválido: %.', m.valor_planilha::text; END IF;
      v := txt::boolean;
      SELECT * INTO STRICT p FROM sncf_produtos WHERE cod_cadastro = m.cod_cadastro;
      SELECT pl.vende INTO atual FROM produto_loja pl WHERE pl.cod_cadastro = m.cod_cadastro AND pl.loja = d.slug;
      INSERT INTO produto_loja(sku, cod_cadastro, loja, vende, origem) VALUES (p.sku, p.cod_cadastro, d.slug, v, 'planilha')
        ON CONFLICT (sku, loja) DO UPDATE SET vende = excluded.vende, origem = 'planilha';
      UPDATE catalogo_planilha_mudanca SET status = CASE WHEN m.tipo = 'conflito' THEN 'resolvida' ELSE 'aplicada' END,
        escolha = 'planilha', erro = NULL, resolvido_por = p_ator, resolvido_em = now() WHERE id = m.id;
      INSERT INTO catalogo_planilha_base(cod_cadastro, campo, valor, leitura_id) VALUES (m.cod_cadastro, m.campo, m.valor_planilha, m.leitura_id)
        ON CONFLICT (cod_cadastro, campo) DO UPDATE SET valor = excluded.valor, leitura_id = excluded.leitura_id, atualizado_em = now();
      INSERT INTO audit_log(user_id, acao, tabela, registro_id, dados_antes, dados_depois, justificativa)
        VALUES ((SELECT u.id FROM auth.users u WHERE u.id = p_ator), 'catalogo_planilha_aplicar', 'produto_loja', m.cod_cadastro,
          jsonb_build_object(d.slug, atual), jsonb_build_object(d.slug, v), 'Leitura ' || m.leitura_id || ' / produto / loja');
      resultados := resultados || jsonb_build_array(jsonb_build_object('id', m.id, 'ok', true));
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE catalogo_planilha_mudanca SET erro = SQLERRM WHERE id = m.id AND status = 'pendente';
      resultados := resultados || jsonb_build_array(jsonb_build_object('id', m.id, 'ok', false, 'erro', SQLERRM));
    END;
  END LOOP;
  IF (SELECT count(*) FROM catalogo_planilha_mudanca WHERE id = ANY(p_ids)) <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'Seleção contém ID inexistente ou repetido.';
  END IF;
  UPDATE catalogo_planilha_leitura SET status = CASE WHEN EXISTS (SELECT 1 FROM catalogo_planilha_mudanca WHERE leitura_id = ultima AND status = 'pendente') THEN 'aplicada_parcial' ELSE 'aplicada' END
   WHERE id = ultima AND n > 0;
  RETURN jsonb_build_object('ok', n = cardinality(p_ids), 'feitas', n, 'resultados', resultados);
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_aplicar_lojas(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_aplicar_lojas(uuid[], uuid) TO service_role;

WITH sva AS (
  SELECT upper(btrim(x.value ->> 'sku')) AS sku_u,
         lpad(regexp_replace(coalesce(x.value ->> 'barcode', ''), '\D', '', 'g'), 13, '0') AS b13
  FROM shopify_produtos sp CROSS JOIN LATERAL jsonb_array_elements(sp.variants) AS x(value)
  WHERE sp.status = 'active' AND NOT coalesce(sp.has_variants_that_requires_components, false)
), ml AS (
  SELECT DISTINCT g.sku FROM vw_ml_anuncio_gestao g WHERE g.recorte IN ('anunciado','pausado','revisao') AND g.sku IS NOT NULL
)
INSERT INTO public.produto_loja(sku, cod_cadastro, loja, vende, origem)
SELECT p.sku, p.cod_cadastro, d.slug,
  CASE d.slug
    WHEN 'b2b' THEN (p.ativo AND p.fase IN ('ativo','pre_venda'))
    WHEN 'site' THEN EXISTS (SELECT 1 FROM sva WHERE sva.sku_u = upper(btrim(p.codigo_externo)) OR sva.b13 = p.ean)
    WHEN 'ml' THEN EXISTS (SELECT 1 FROM ml WHERE ml.sku = p.sku)
    ELSE false
  END,
  'carga_inicial'
FROM public.sncf_produtos p CROSS JOIN public.loja_dim d
WHERE p.cod_cadastro IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW public.vw_ml_sem_anuncio WITH (security_invoker = true) AS
 SELECT s.sku AS id, s.sku, s.cod_cadastro, s.nome_comercial, s.preco_varejo, true AS exige_acao_nossa, s.atualizado_em AS desde
   FROM sncf_produtos s
  WHERE s.ativo AND s.sku IS NOT NULL
    AND EXISTS (SELECT 1 FROM produto_loja pl WHERE pl.sku = s.sku AND pl.loja = 'ml' AND pl.vende)
    AND NOT EXISTS (SELECT 1 FROM bling_anuncio a WHERE a.sumiu_em IS NULL AND a.sku = s.sku);

CREATE OR REPLACE VIEW public.vw_shopify_sem_anuncio WITH (security_invoker = true) AS
 WITH sva AS (
   SELECT upper(btrim(x.value ->> 'sku')) AS sku_u,
          lpad(regexp_replace(coalesce(x.value ->> 'barcode', ''), '\D', '', 'g'), 13, '0') AS barcode13
   FROM shopify_produtos sp CROSS JOIN LATERAL jsonb_array_elements(sp.variants) AS x(value)
   WHERE sp.status = 'active' AND NOT coalesce(sp.has_variants_that_requires_components, false)
 )
 SELECT p.sku FROM sncf_produtos p
  WHERE p.fase = 'ativo'
    AND EXISTS (SELECT 1 FROM produto_loja pl WHERE pl.sku = p.sku AND pl.loja = 'site' AND pl.vende)
    AND EXISTS (SELECT 1 FROM divergencia_regra r WHERE r.slug = 'shopify_sem_anuncio' AND r.ativo)
    AND NOT EXISTS (SELECT 1 FROM sva s WHERE s.sku_u = upper(btrim(p.codigo_externo)))
    AND NOT EXISTS (SELECT 1 FROM sva s WHERE s.barcode13 = p.ean)
    AND NOT EXISTS (
      SELECT 1 FROM shopify_produtos sp CROSS JOIN LATERAL jsonb_array_elements(sp.variants) AS x(value)
       WHERE sp.status = 'draft'
         AND (upper(btrim(x.value ->> 'sku')) = upper(btrim(p.codigo_externo))
           OR lpad(regexp_replace(coalesce(x.value ->> 'barcode', ''), '\D', '', 'g'), 13, '0') = p.ean));
