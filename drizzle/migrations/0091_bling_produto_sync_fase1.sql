CREATE TABLE public.bling_produto_sync_config (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 automatico_habilitado boolean NOT NULL DEFAULT false,
 escrita_habilitada boolean NOT NULL DEFAULT false,
 lease_token uuid, lease_ate timestamptz,
 campos jsonb NOT NULL DEFAULT '[{"campo":"pesoBruto","origem":"peso_g","destino":"pesoBruto","tipo":"numero","divisor":1000},{"campo":"pesoLiquido","origem":"peso_g","destino":"pesoLiquido","tipo":"numero","divisor":1000},{"campo":"altura","origem":"altura_cm","destino":"dimensoes.altura","tipo":"numero"},{"campo":"largura","origem":"largura_cm","destino":"dimensoes.largura","tipo":"numero"},{"campo":"profundidade","origem":"profundidade_cm","destino":"dimensoes.profundidade","tipo":"numero"},{"campo":"gtin","origem":"ean","destino":"gtin","tipo":"texto"},{"campo":"gtinEmbalagem","origem":"dun","destino":"gtinEmbalagem","tipo":"texto"},{"campo":"ncm","origem":"ncm","destino":"tributacao.ncm","tipo":"digitos"},{"campo":"cest","origem":"cest","destino":"tributacao.cest","tipo":"digitos"},{"campo":"marca","origem":"marca","destino":"marca","tipo":"texto"},{"campo":"itensPorCaixa","origem":"multiplos","destino":"itensPorCaixa","tipo":"numero"}]'::jsonb,
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bling_produto_sync_config TO authenticated;
GRANT ALL ON public.bling_produto_sync_config TO service_role;
ALTER TABLE public.bling_produto_sync_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY bling_sync_config_ler ON public.bling_produto_sync_config FOR SELECT TO authenticated USING(public.tem_permissao('acao.varrer_bling',auth.uid()));

CREATE TABLE public.bling_produto_sync_execucao (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), criado_por uuid, criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(), concluido_em timestamptz,
 status text NOT NULL DEFAULT 'comparando' CHECK(status IN('comparando','comparado','aplicando','concluido','erro')),
 origem text NOT NULL DEFAULT 'manual', erro text
);
GRANT SELECT ON public.bling_produto_sync_execucao TO authenticated;
GRANT ALL ON public.bling_produto_sync_execucao TO service_role;
ALTER TABLE public.bling_produto_sync_execucao ENABLE ROW LEVEL SECURITY;
CREATE POLICY bling_sync_execucao_ler ON public.bling_produto_sync_execucao FOR SELECT TO authenticated USING(public.tem_permissao('acao.varrer_bling',auth.uid()));

CREATE TABLE public.bling_produto_sync_produto (
 execucao_id uuid NOT NULL REFERENCES public.bling_produto_sync_execucao(id) ON DELETE CASCADE,
 sku text NOT NULL, produto_id uuid, bling_id text, fonte jsonb NOT NULL,
 sem_vinculo boolean NOT NULL DEFAULT false, sem_peso boolean NOT NULL DEFAULT false, sem_dimensao boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','comparado','aplicado','erro','ignorado')),
 erro text, lido_em timestamptz, PRIMARY KEY(execucao_id,sku)
);
GRANT SELECT ON public.bling_produto_sync_produto TO authenticated;
GRANT ALL ON public.bling_produto_sync_produto TO service_role;
ALTER TABLE public.bling_produto_sync_produto ENABLE ROW LEVEL SECURITY;
CREATE POLICY bling_sync_produto_ler ON public.bling_produto_sync_produto FOR SELECT TO authenticated USING(public.tem_permissao('acao.varrer_bling',auth.uid()));

CREATE TABLE public.bling_produto_sync_item (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), execucao_id uuid NOT NULL, sku text NOT NULL,
 bling_id text, campo text NOT NULL, destino text NOT NULL, valor_bling jsonb, valor_sncf jsonb,
 status text NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','aplicado','erro','ignorado')),
 erro text, atualizado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(execucao_id,sku,campo), FOREIGN KEY(execucao_id,sku) REFERENCES public.bling_produto_sync_produto(execucao_id,sku) ON DELETE CASCADE
);
GRANT SELECT ON public.bling_produto_sync_item TO authenticated;
GRANT ALL ON public.bling_produto_sync_item TO service_role;
ALTER TABLE public.bling_produto_sync_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY bling_sync_item_ler ON public.bling_produto_sync_item FOR SELECT TO authenticated USING(public.tem_permissao('acao.varrer_bling',auth.uid()));
CREATE INDEX bling_sync_item_pendentes ON public.bling_produto_sync_item(execucao_id,status,sku);

CREATE TABLE public.bling_produto_sync_fila (
 sku text PRIMARY KEY REFERENCES public.sncf_produtos(sku), versao bigint NOT NULL DEFAULT 1,
 enfileirado_em timestamptz NOT NULL DEFAULT now(), origem text NOT NULL DEFAULT 'sncf_produtos',
 status text NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','aplicado','erro')),
 erro text, execucao_id uuid REFERENCES public.bling_produto_sync_execucao(id)
);
GRANT SELECT ON public.bling_produto_sync_fila TO authenticated;
GRANT ALL ON public.bling_produto_sync_fila TO service_role;
ALTER TABLE public.bling_produto_sync_fila ENABLE ROW LEVEL SECURITY;
CREATE POLICY bling_sync_fila_ler ON public.bling_produto_sync_fila FOR SELECT TO authenticated USING(public.tem_permissao('acao.varrer_bling',auth.uid()));

CREATE FUNCTION public.fn_bling_produto_sync_lease(p_token uuid,p_liberar boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_liberar THEN
  UPDATE bling_produto_sync_config SET lease_token=NULL,lease_ate=NULL WHERE id=true AND lease_token=p_token;
 ELSE
  UPDATE bling_produto_sync_config SET lease_token=p_token,lease_ate=now()+interval '110 seconds' WHERE id=true AND (lease_ate IS NULL OR lease_ate<now() OR lease_token=p_token);
 END IF;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.fn_bling_produto_sync_lease(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bling_produto_sync_lease(uuid,boolean) TO service_role;

CREATE FUNCTION public.fn_bling_produto_sync_iniciar(p_usuario uuid,p_skus text[] DEFAULT NULL,p_origem text DEFAULT 'manual') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 INSERT INTO bling_produto_sync_execucao(criado_por,origem) VALUES(p_usuario,p_origem) RETURNING id INTO v_id;
 INSERT INTO bling_produto_sync_produto(execucao_id,sku,produto_id,bling_id,fonte,sem_vinculo,sem_peso,sem_dimensao,status)
 SELECT v_id,s.sku,p.id,p.bling_id,to_jsonb(s),p.bling_id IS NULL,coalesce(s.peso_g,0)<=0,
 coalesce(s.altura_cm,0)<=0 OR coalesce(s.largura_cm,0)<=0 OR coalesce(s.profundidade_cm,0)<=0,
 CASE WHEN p.bling_id IS NULL THEN 'ignorado' ELSE 'pendente' END
 FROM sncf_produtos s LEFT JOIN LATERAL(SELECT id,bling_id FROM produtos WHERE codigo=s.sku AND nullif(bling_id,'') IS NOT NULL ORDER BY created_at,id LIMIT 1)p ON true
 WHERE s.ativo=true AND (p_skus IS NULL OR s.sku=ANY(p_skus));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_bling_produto_sync_iniciar(uuid,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bling_produto_sync_iniciar(uuid,text[],text) TO service_role;

CREATE FUNCTION public.fn_bling_produto_sync_resumo(p_execucao uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('total',(SELECT count(*) FROM bling_produto_sync_produto WHERE execucao_id=p_execucao),
 'lidos',(SELECT count(*) FROM bling_produto_sync_produto WHERE execucao_id=p_execucao AND lido_em IS NOT NULL),
 'restantes',(SELECT count(*) FROM bling_produto_sync_produto WHERE execucao_id=p_execucao AND status='pendente'),
 'produtos_divergentes',(SELECT count(DISTINCT sku) FROM bling_produto_sync_item WHERE execucao_id=p_execucao),
 'campos_divergentes',(SELECT count(*) FROM bling_produto_sync_item WHERE execucao_id=p_execucao),
 'sem_vinculo',(SELECT count(*) FROM bling_produto_sync_produto WHERE execucao_id=p_execucao AND sem_vinculo),
 'sem_peso',(SELECT count(*) FROM bling_produto_sync_produto WHERE execucao_id=p_execucao AND sem_peso),
 'sem_dimensao',(SELECT count(*) FROM bling_produto_sync_produto WHERE execucao_id=p_execucao AND sem_dimensao),
 'erros',(SELECT count(*) FROM bling_produto_sync_produto WHERE execucao_id=p_execucao AND status='erro'),
 'pendentes',(SELECT count(*) FROM bling_produto_sync_item WHERE execucao_id=p_execucao AND status='pendente'),
 'por_campo',coalesce((SELECT jsonb_object_agg(campo,n) FROM(SELECT campo,count(DISTINCT sku)n FROM bling_produto_sync_item WHERE execucao_id=p_execucao GROUP BY campo)t),'{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.fn_bling_produto_sync_resumo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_bling_produto_sync_resumo(uuid) TO authenticated,service_role;

CREATE FUNCTION public.fn_trg_bling_produto_sync_enfileirar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.ativo AND EXISTS(SELECT 1 FROM bling_produto_sync_config WHERE id=true AND automatico_habilitado)
 AND (NEW.peso_g,NEW.altura_cm,NEW.largura_cm,NEW.profundidade_cm,NEW.ean,NEW.dun,NEW.ncm,NEW.cest,NEW.marca,NEW.multiplos)
 IS DISTINCT FROM (OLD.peso_g,OLD.altura_cm,OLD.largura_cm,OLD.profundidade_cm,OLD.ean,OLD.dun,OLD.ncm,OLD.cest,OLD.marca,OLD.multiplos) THEN
 INSERT INTO bling_produto_sync_fila(sku) VALUES(NEW.sku) ON CONFLICT(sku) DO UPDATE SET versao=bling_produto_sync_fila.versao+1,enfileirado_em=now(),status='pendente',erro=NULL,execucao_id=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_trg_bling_produto_sync_enfileirar() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bling_produto_sync_enfileirar AFTER UPDATE OF peso_g,altura_cm,largura_cm,profundidade_cm,ean,dun,ncm,cest,marca,multiplos ON public.sncf_produtos FOR EACH ROW EXECUTE FUNCTION public.fn_trg_bling_produto_sync_enfileirar();