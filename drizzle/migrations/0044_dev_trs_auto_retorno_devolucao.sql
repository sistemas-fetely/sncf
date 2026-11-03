-- DEV-TRS-AUTO (03/11/2026): transferencia de CD nasce sozinha na devolucao.
SET LOCAL lock_timeout = '60s';
CREATE TABLE IF NOT EXISTS public.devolucao_trs_auto (
  devolucao_id uuid PRIMARY KEY,
  erro text,
  em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.devolucao_trs_auto IS 'DEV-TRS-AUTO: ultima tentativa automatica de criar a TRS de retorno por devolucao (erro NULL = criada).';
GRANT SELECT ON public.devolucao_trs_auto TO authenticated;
GRANT ALL ON public.devolucao_trs_auto TO service_role;
ALTER TABLE public.devolucao_trs_auto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devolucao_trs_auto_ler" ON public.devolucao_trs_auto FOR SELECT TO authenticated USING (true);

INSERT INTO public.transferencia_finalidade (codigo, rotulo, descricao, exige_descricao, automatica, ordem, ativo)
VALUES ('retorno_devolucao','Retorno de devolução','Documento fiscal: peça devolvida já está fisicamente no destino; sem movimento de estoque', false, true, 55, true)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.naturezas_operacao (codigo, nome, ativo, ordem, dispensa_analise, gera_titulo_receber, gera_despesa, precificacao,
  entra_receita, forma_pagamento_default_id, movimenta_estoque, conta_corrente_efeito, exige_expedicao, bling_natureza_id,
  estoque_centro_origem_id, estoque_estorna_consumo_origem, familia_processo, exige_receber_destino)
SELECT 'transferencia_retorno_devolucao', 'Transferência de retorno de devolução (só documento)', true, 4, true, false, false, 'a_custo',
  false, forma_pagamento_default_id, false, 'neutro', false, NULL, NULL, false, 'transferencia', false
FROM public.naturezas_operacao WHERE codigo = 'transferencia_regularizacao'
ON CONFLICT (codigo) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_devolucao_exige_transferencia_cd(p_destino_retorno uuid, p_canal text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.fn_estabelecimento_fiscal(p_destino_retorno) = (SELECT cs.id FROM public.centro_distribuicao cs WHERE cs.codigo = 'SITE-SP')
                  AND p_canal <> 'site_sp', false)
$$;
REVOKE ALL ON FUNCTION public.fn_devolucao_exige_transferencia_cd(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_exige_transferencia_cd(uuid, text) TO authenticated, service_role;

DO $do$
DECLARE v text := pg_get_viewdef('public.vw_devolucao_funil'::regclass); n text;
BEGIN
  n := regexp_replace(v, 'COALESCE\(\(\(fn_estabelecimento_fiscal\(cd\.id\).*?false\) AS exige_transferencia_cd',
       'public.fn_devolucao_exige_transferencia_cd(b.destino_retorno, b.canal) AS exige_transferencia_cd');
  IF n = v THEN RAISE EXCEPTION 'vw_devolucao_funil: expressao exige_transferencia_cd nao encontrada'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_devolucao_funil WITH (security_invoker = true) AS ' || n;
END $do$;

DO $do$
DECLARE f text := pg_get_functiondef('public.criar_pedido_transferencia'::regproc); o text;
BEGIN
  o := f;
  f := replace(f, $a$  IF NOT p_regularizacao AND v_fin.automatica THEN$a$,
$a$  -- DEV-TRS-AUTO (03/11/2026): retorno_devolucao so nasce pela fn_devolucao_criar_trs_retorno (flag de transacao).
  IF v_fin.codigo = 'retorno_devolucao' THEN
    IF coalesce(current_setting('sncf.trs_retorno_sistema', true),'') <> 'on' THEN
      RAISE EXCEPTION 'A finalidade % e definida pelo sistema e nao pode ser escolhida manualmente.', v_fin.rotulo USING ERRCODE = '22023';
    END IF;
    v_nat_codigo := 'transferencia_retorno_devolucao';
  ELSIF NOT p_regularizacao AND v_fin.automatica THEN$a$);
  IF f = o THEN RAISE EXCEPTION 'criar_pedido_transferencia: trecho 1 nao encontrado'; END IF;
  o := f;
  f := replace(f, $a$  IF p_regularizacao THEN
    UPDATE public.pedidos SET estagio = 'pre_faturamento'$a$, $a$  IF p_regularizacao OR v_fin.codigo = 'retorno_devolucao' THEN
    UPDATE public.pedidos SET estagio = 'pre_faturamento'$a$);
  IF f = o THEN RAISE EXCEPTION 'criar_pedido_transferencia: trecho 2 nao encontrado'; END IF;
  f := replace(f, $a$'Regularizacao: sem separacao fisica$a$, $a$CASE WHEN p_regularizacao THEN 'Regularizacao' ELSE 'Retorno de devolucao' END || ': sem separacao fisica$a$);
  EXECUTE f;
END $do$;

CREATE OR REPLACE FUNCTION public.fn_devolucao_trs_auto_marcar(p_devolucao_id uuid, p_erro text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.devolucao_trs_auto (devolucao_id, erro, em) VALUES (p_devolucao_id, p_erro, now())
  ON CONFLICT (devolucao_id) DO UPDATE SET erro = EXCLUDED.erro, em = now();
$$;
REVOKE ALL ON FUNCTION public.fn_devolucao_trs_auto_marcar(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_trs_auto_marcar(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_devolucao_criar_trs_retorno(p_devolucao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE d record; v_itens jsonb; v_dest text; v_res jsonb; v_trs uuid;
BEGIN
  SELECT * INTO d FROM devolucao WHERE id = p_devolucao_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Devolucao nao encontrada.'; END IF;
  IF d.transferencia_pedido_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ja_existia', true, 'pedido_id', d.transferencia_pedido_id);
  END IF;
  IF d.status IN ('encerrada','cancelada') THEN RETURN jsonb_build_object('ok', false, 'motivo', 'devolucao_' || d.status); END IF;
  IF NOT public.fn_devolucao_exige_transferencia_cd(d.destino_retorno, d.canal) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_exige_transferencia');
  END IF;
  IF coalesce(d.nf_dev_status,'') <> 'autorizada' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nf_devolucao_nao_autorizada');
  END IF;
  BEGIN
    -- Quantidade que de fato ficou no destino: saldo liquido dos movimentos da conferencia do retorno
    -- (entrada em quarentena/sadio e reclassificacoes se anulam), por SKU.
    SELECT jsonb_agg(jsonb_build_object('sku', sku, 'quantidade', q) ORDER BY sku) INTO v_itens
    FROM (SELECT m.sku, sum(m.quantidade) q FROM movimentacao_estoque m
           WHERE m.devolucao_id = d.id AND m.centro_id = d.destino_retorno AND m.tipo IN ('entrada','saida')
           GROUP BY m.sku HAVING sum(m.quantidade) > 0) s;
    IF v_itens IS NULL THEN
      RAISE EXCEPTION 'Sem entrada do retorno no estoque do destino para %: confira o retorno antes da transferencia.', d.numero;
    END IF;
    SELECT codigo INTO v_dest FROM centro_distribuicao WHERE id = d.destino_retorno;
    PERFORM set_config('sncf.trs_retorno_sistema', 'on', true);
    v_res := public.criar_pedido_transferencia(v_itens, v_dest, 'Retorno de devolução ' || d.numero || ' — só documento fiscal (peças já no destino)', false, 'retorno_devolucao');
    PERFORM set_config('sncf.trs_retorno_sistema', 'off', true);
    v_trs := (v_res->>'pedido_id')::uuid;
    UPDATE devolucao SET transferencia_pedido_id = v_trs WHERE id = d.id;
    PERFORM public.fn_devolucao_trs_auto_marcar(d.id, NULL);
    RETURN jsonb_build_object('ok', true, 'pedido_id', v_trs, 'id_externo', v_res->>'id_externo', 'itens', v_itens);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('sncf.trs_retorno_sistema', 'off', true);
    PERFORM public.fn_devolucao_trs_auto_marcar(d.id, SQLERRM);
    RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
  END;
END $$;
REVOKE ALL ON FUNCTION public.fn_devolucao_criar_trs_retorno(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_criar_trs_retorno(uuid) TO service_role;

INSERT INTO public.permissoes_catalogo (slug, tipo, pilar, nome_exibicao, descricao, categoria_sod, contem_dado_sensivel, ativo, publica)
VALUES ('acao.devolucao.trs_retorno.tentar','acao','operacao','Tentar de novo a transferência de retorno',
  'Refaz a criação automática da TRS de retorno de uma devolução que falhou.','execucao', false, true, false)
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_devolucao_trs_retorno_tentar(p_devolucao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tem_acao('acao.devolucao.trs_retorno.tentar', auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão (acao.devolucao.trs_retorno.tentar).' USING ERRCODE = '42501';
  END IF;
  v := public.fn_devolucao_criar_trs_retorno(p_devolucao_id);
  IF coalesce((v->>'ok')::boolean, false) = false AND v ? 'erro' THEN RAISE EXCEPTION '%', v->>'erro'; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.fn_devolucao_trs_retorno_tentar(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_trs_retorno_tentar(uuid) TO authenticated, service_role;

INSERT INTO public.acao_superficie (rota, arquivo, rotulo, dispara, guarda_atual, risco, permissao_id, origem, observacao)
SELECT '/vendas/produto/estoque/devolucoes', 'src/pages/estoque/RetornoDevolucao.tsx', 'Tentar de novo (TRS de retorno)',
  'rpc fn_devolucao_trs_retorno_tentar', 'acao.devolucao.trs_retorno.tentar', 'MEDIO', pc.id, 'dev-trs-auto-2026-11-03',
  'Refaz a TRS automática de retorno de devolução quando a criação falhou.'
FROM public.permissoes_catalogo pc WHERE pc.slug = 'acao.devolucao.trs_retorno.tentar';

DO $do$
DECLARE f text := pg_get_functiondef('public.fn_devolucao_nf_registrar(uuid,text,bigint,text,text,text)'::regprocedure);
BEGIN
  f := replace(f, 'DECLARE d record; v_enc jsonb;', 'DECLARE d record; v_enc jsonb; v_trs jsonb;');
  f := replace(f, $a$  RETURN jsonb_build_object('ok', true, 'status', p_status, 'encerramento', v_enc);$a$,
$a$  -- DEV-TRS-AUTO (03/11/2026): NF autorizada + exige transferencia de CD -> TRS de retorno nasce sozinha.
  -- Bloco protegido: falha nunca desfaz a autorizacao; vai para devolucao_trs_auto.erro.
  IF p_status = 'autorizada' THEN
    BEGIN v_trs := public.fn_devolucao_criar_trs_retorno(d.id);
    EXCEPTION WHEN OTHERS THEN
      v_trs := jsonb_build_object('ok', false, 'erro', SQLERRM);
      PERFORM public.fn_devolucao_trs_auto_marcar(d.id, SQLERRM);
    END;
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', p_status, 'encerramento', v_enc, 'trs_retorno', v_trs);$a$);
  IF position('fn_devolucao_criar_trs_retorno' in f) = 0 OR position('v_trs jsonb' in f) = 0 THEN RAISE EXCEPTION 'fn_devolucao_nf_registrar: trecho nao encontrado'; END IF;
  EXECUTE f;
END $do$;

DO $do$
DECLARE f text := pg_get_functiondef('public.trg_baixa_estoque_nf'::regproc); o text;
BEGIN
  o := f;
  f := replace(f, '  -- REGULARIZACAO-SP (28/09/2026)', $a$  -- DEV-TRS-AUTO (03/11/2026): NF da TRS de retorno de devolucao e so documento (a peca ja esta no destino).
  IF NEW.pedido_venda_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM pedidos p JOIN naturezas_operacao n ON n.id = p.natureza_operacao_id
        WHERE p.id = NEW.pedido_venda_id AND n.codigo = 'transferencia_retorno_devolucao') THEN
    RETURN NEW;
  END IF;

  -- REGULARIZACAO-SP (28/09/2026)$a$);
  IF f = o THEN RAISE EXCEPTION 'trg_baixa_estoque_nf: trecho nao encontrado'; END IF;
  EXECUTE f;
END $do$;

-- Situacao da TRS de retorno por devolucao (bloco Fiscal + fila da Eva + rotina de 15 min).
CREATE OR REPLACE VIEW public.vw_devolucao_trs_retorno WITH (security_invoker = true) AS
SELECT d.id, d.id AS devolucao_id, d.numero, d.transferencia_pedido_id AS trs_pedido_id, p.id_externo AS trs_numero,
  (n.codigo = 'transferencia_retorno_devolucao') AS automatica,
  CASE
    WHEN p.id IS NULL AND ta.erro IS NOT NULL THEN 'erro_criacao'
    WHEN p.id IS NULL THEN 'sem_trs'
    WHEN nfa.id IS NOT NULL THEN 'autorizada'
    WHEN n.bling_natureza_id IS NULL THEN 'aguardando_natureza'
    WHEN nfr.id IS NOT NULL THEN 'rascunho'
    WHEN p.bling_id_destino IS NOT NULL THEN 'no_bling'
    WHEN p.bling_envio_erro IS NOT NULL THEN 'erro_envio'
    ELSE 'aguardando_envio'
  END AS situacao,
  coalesce(nfa.numero, nfr.numero) AS nf_numero,
  coalesce(CASE WHEN p.id IS NULL THEN ta.erro END, p.bling_envio_erro) AS erro,
  coalesce(ta.em, d.nf_dev_atualizado_em) AS desde
FROM public.devolucao d
LEFT JOIN public.devolucao_trs_auto ta ON ta.devolucao_id = d.id
LEFT JOIN public.pedidos p ON p.id = d.transferencia_pedido_id
LEFT JOIN public.naturezas_operacao n ON n.id = p.natureza_operacao_id
LEFT JOIN LATERAL (SELECT x.id, x.numero FROM public.nfs_emitidas x WHERE x.pedido_venda_id = p.id AND x.situacao = 'autorizada' LIMIT 1) nfa ON true
LEFT JOIN LATERAL (SELECT x.id, x.numero FROM public.nfs_emitidas x WHERE x.pedido_venda_id = p.id AND x.situacao NOT IN ('autorizada','cancelada') ORDER BY x.created_at DESC LIMIT 1) nfr ON true
WHERE d.status NOT IN ('encerrada','cancelada')
  AND d.nf_dev_status = 'autorizada'
  AND public.fn_devolucao_exige_transferencia_cd(d.destino_retorno, d.canal);
GRANT SELECT ON public.vw_devolucao_trs_retorno TO authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_fila_devolucao_trs_retorno WITH (security_invoker = true) AS
SELECT * FROM public.vw_devolucao_trs_retorno WHERE situacao IN ('erro_criacao','aguardando_natureza','rascunho','no_bling','erro_envio');
GRANT SELECT ON public.vw_fila_devolucao_trs_retorno TO authenticated, service_role;

INSERT INTO public.tarefas_filas (chave, nome, descricao, departamento_id, fonte_contagem, fonte_tipo, estado, rota, severidade, ordem, coluna_entrada)
VALUES ('devolucao_trs_retorno', 'TRS de retorno de devolução (Eva)',
  'Transferências SC → Site SP de devoluções: natureza fiscal a ligar, NF a transmitir ou erro de envio.',
  '93fa8d50-0486-4f43-b488-2be78fe1c14d', 'vw_fila_devolucao_trs_retorno', 'view', 'pronta', '/vendas/produto/estoque/devolucoes', 'alta', 100, 'desde')
ON CONFLICT (chave) DO NOTHING;

-- NF da TRS autorizada -> reavalia encerramento da devolucao ligada (sem clique).
CREATE OR REPLACE FUNCTION public.fn_trg_nf_trs_devolucao_encerra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.pedido_venda_id IS NULL OR coalesce(NEW.situacao,'') <> 'autorizada' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.situacao IS NOT DISTINCT FROM 'autorizada' THEN RETURN NEW; END IF;
  FOR r IN SELECT id FROM devolucao WHERE transferencia_pedido_id = NEW.pedido_venda_id AND status NOT IN ('encerrada','cancelada') LOOP
    BEGIN PERFORM public.fn_devolucao_avaliar_encerramento(r.id);
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'avaliar encerramento devolucao %: %', r.id, SQLERRM; END;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_trg_nf_trs_devolucao_encerra() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_nf_trs_devolucao_encerra ON public.nfs_emitidas;
CREATE TRIGGER trg_nf_trs_devolucao_encerra AFTER INSERT OR UPDATE OF situacao ON public.nfs_emitidas
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_nf_trs_devolucao_encerra();