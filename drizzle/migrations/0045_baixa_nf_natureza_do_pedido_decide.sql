CREATE OR REPLACE FUNCTION public.trg_baixa_estoque_nf()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref text;
  v_proprio boolean;
  v_dest_doc text;
  v_centro_parceiro uuid;
  v_centro_emitente uuid;
  v_ped_centro uuid;
  v_ped_nat_mov boolean;
  v_reg_pedido uuid; v_reg_destino uuid; v_reg_origem uuid; v_reg_estorna boolean; v_reg_m_saida text; v_reg_m_entrada text; v_reg_m_consumo text; v_reg_cc uuid; v_reg_nat text;
BEGIN
  IF NEW.situacao IS DISTINCT FROM 'autorizada' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.situacao IS NOT DISTINCT FROM 'autorizada' THEN RETURN NEW; END IF;
  IF NEW.itens_json IS NULL OR jsonb_typeof(NEW.itens_json)<>'array' THEN RETURN NEW; END IF;

  v_ref := 'NF-'||coalesce(nullif(btrim(NEW.chave_acesso),''), NEW.id::text);

  IF EXISTS (SELECT 1 FROM movimentacao_estoque WHERE origem='nf_emissao' AND referencia=v_ref)
     OR EXISTS (SELECT 1 FROM baixa_estoque_pendente WHERE nf_chave=v_ref) THEN
    RETURN NEW;
  END IF;

  -- RETORNO-SEM-ESTOQUE (30/09/2026; revisto 03/11/2026 NATUREZA-COMPARTILHADA):
  -- NF com pedido no SNCF (vinculo ou numero_pedido_loja): decide a natureza DO PEDIDO
  -- (movimenta_estoque=false -> so documento, sem mover e sem pendencia; true -> segue o fluxo).
  -- NF sem pedido (ou pedido sem natureza): vale o id da natureza do Bling, so quando esse id
  -- nao e compartilhado com natureza que movimenta estoque.
  SELECT n.movimenta_estoque INTO v_ped_nat_mov
    FROM pedidos p JOIN naturezas_operacao n ON n.id = p.natureza_operacao_id
   WHERE p.id = NEW.pedido_venda_id
      OR (NEW.pedido_venda_id IS NULL
          AND p.id_externo = regexp_replace(coalesce(NEW.numero_pedido_loja,''), '-R[0-9]+$', ''))
   LIMIT 1;
  IF v_ped_nat_mov IS NOT NULL THEN
    IF NOT v_ped_nat_mov THEN RETURN NEW; END IF;
  ELSIF EXISTS (SELECT 1 FROM naturezas_operacao no_
             WHERE no_.bling_natureza_id IS NOT NULL AND NOT no_.movimenta_estoque
               AND no_.bling_natureza_id::text = NEW.raw->'naturezaOperacao'->>'id')
    AND NOT EXISTS (SELECT 1 FROM naturezas_operacao no_
             WHERE no_.bling_natureza_id IS NOT NULL AND no_.movimenta_estoque
               AND no_.bling_natureza_id::text = NEW.raw->'naturezaOperacao'->>'id') THEN
    RETURN NEW;
  END IF;

  -- DEV-TRS-AUTO (03/11/2026): NF da TRS de retorno de devolucao e so documento (a peca ja esta no destino).
  IF NEW.pedido_venda_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM pedidos p JOIN naturezas_operacao n ON n.id = p.natureza_operacao_id
        WHERE p.id = NEW.pedido_venda_id AND n.codigo = 'transferencia_retorno_devolucao') THEN
    RETURN NEW;
  END IF;

  SELECT p.id, p.destino_centro_id, no.estoque_centro_origem_id, no.estoque_estorna_consumo_origem,
           no.estoque_motivo_saida, no.estoque_motivo_entrada, no.estoque_motivo_consumo, no.estoque_consumo_centro_custo_id, no.codigo
    INTO v_reg_pedido, v_reg_destino, v_reg_origem, v_reg_estorna, v_reg_m_saida, v_reg_m_entrada, v_reg_m_consumo, v_reg_cc, v_reg_nat
  FROM pedidos p JOIN naturezas_operacao no ON no.id = p.natureza_operacao_id
  WHERE no.estoque_centro_origem_id IS NOT NULL
    AND p.cancelado_em IS NULL
    AND (p.id = NEW.pedido_venda_id
         OR (NEW.pedido_venda_id IS NULL
             AND p.id_externo = regexp_replace(coalesce(NEW.numero_pedido_loja,''), '-R[0-9]+$', '')))
  LIMIT 1;

  IF v_reg_pedido IS NOT NULL THEN
    WITH itens AS (
      SELECT btrim(it->>'codigo') AS sku, sum((it->>'quantidade')::numeric) AS qtd
      FROM jsonb_array_elements(NEW.itens_json) it
      WHERE nullif(btrim(it->>'codigo'),'') IS NOT NULL AND (it->>'quantidade')::numeric > 0
      GROUP BY 1
    ), c AS (SELECT sku, avg(custo_aterrissagem) AS custo FROM custo_aterrissagem GROUP BY sku),
    pernas AS (
      SELECT i.sku, 'entrada'::text tipo, abs(i.qtd) qtd, v_reg_origem centro, 'regularizacao_estorno_consumo'::text motivo, 1 ord
      FROM itens i WHERE v_reg_estorna AND v_reg_destino IS NOT NULL
      UNION ALL
      SELECT i.sku, 'saida', -abs(i.qtd), v_reg_origem, coalesce(v_reg_m_saida,'regularizacao_saida'), 2 FROM itens i WHERE v_reg_destino IS NOT NULL
      UNION ALL
      SELECT i.sku, 'entrada', abs(i.qtd), v_reg_destino, coalesce(v_reg_m_entrada,'regularizacao_entrada'), 3 FROM itens i WHERE v_reg_destino IS NOT NULL
      UNION ALL
      SELECT i.sku, 'saida', -abs(i.qtd), v_reg_destino, v_reg_m_consumo, 4 FROM itens i WHERE v_reg_destino IS NOT NULL AND v_reg_m_consumo IS NOT NULL
    )
    INSERT INTO movimentacao_estoque
      (sku, tipo, quantidade, origem, referencia, data_mov, condicao, centro_id, motivo, classe,
       doc_tipo, doc_numero, custo_unitario, obs, nf_saida_id, pedido_id, centro_custo_id)
    SELECT p.sku, p.tipo, p.qtd, 'nf_emissao', v_ref, coalesce(NEW.data_emissao, now()),
           'sadio', p.centro, p.motivo, 'produto_acabado', 'nf_transferencia', NEW.numero, c.custo,
           'NF '||coalesce(NEW.numero,'?')||' · '||coalesce(v_reg_nat,'natureza')||' · perna '||p.ord,
           NEW.id, v_reg_pedido, CASE WHEN p.ord = 4 THEN v_reg_cc END
    FROM pernas p LEFT JOIN c ON c.sku = p.sku
    WHERE EXISTS (SELECT 1 FROM sncf_produtos s WHERE s.sku = p.sku)
    ORDER BY p.ord
    ON CONFLICT (origem, referencia, sku, condicao, motivo) WHERE origem IN ('nf_emissao','xpm_termo') DO NOTHING;

    INSERT INTO baixa_estoque_pendente (nf_chave, nf_numero, nf_data, sku, quantidade, motivo)
    SELECT v_ref, NEW.numero, NEW.data_emissao, btrim(it->>'codigo'), sum((it->>'quantidade')::numeric),
           CASE WHEN v_reg_destino IS NULL THEN 'roteamento_incompleto' ELSE 'sku_fora_do_catalogo' END
    FROM jsonb_array_elements(NEW.itens_json) it
    WHERE nullif(btrim(it->>'codigo'),'') IS NOT NULL
      AND (v_reg_destino IS NULL OR NOT EXISTS (SELECT 1 FROM sncf_produtos s WHERE s.sku = btrim(it->>'codigo')))
    GROUP BY btrim(it->>'codigo')
    ON CONFLICT (nf_chave, sku) DO NOTHING;

    RETURN NEW;
  END IF;

  v_dest_doc := regexp_replace(coalesce(NEW.raw->'contato'->>'numeroDocumento',''), '\D', '', 'g');
  v_proprio := left(v_dest_doc,8) = left(regexp_replace(coalesce(NEW.emitente_cnpj,''),'\D','','g'),8)
               AND length(v_dest_doc) >= 8;

  SELECT id INTO v_centro_parceiro
  FROM centro_distribuicao
  WHERE parceiro_id = NEW.parceiro_id AND ativo
  LIMIT 1;

  SELECT id INTO v_centro_emitente
  FROM centro_distribuicao
  WHERE ativo AND vende AND centro_fiscal_id IS NULL
    AND nullif(regexp_replace(coalesce(NEW.emitente_cnpj, ''), '\D', '', 'g'), '') IS NOT NULL
    AND regexp_replace(coalesce(cnpj_emitente, ''), '\D', '', 'g') = regexp_replace(coalesce(NEW.emitente_cnpj, ''), '\D', '', 'g')
  ORDER BY ordem
  LIMIT 1;

  IF v_centro_emitente IS NOT NULL THEN
    SELECT p.origem_centro_id INTO v_ped_centro
    FROM pedidos p
    WHERE p.cancelado_em IS NULL AND p.origem_centro_id IS NOT NULL
      AND (p.id = NEW.pedido_venda_id
           OR (NEW.pedido_venda_id IS NULL AND coalesce(NEW.numero_pedido_loja,'') ~* '^VD-[0-9]+'
               AND p.origem = 'venda_direta'
               AND p.id_externo = upper(substring(NEW.numero_pedido_loja from '(?i)^(VD-[0-9]+)')))
           OR (NEW.pedido_venda_id IS NULL AND nullif(btrim(coalesce(NEW.numero_pedido_loja,'')),'') IS NOT NULL
               AND p.id_externo = regexp_replace(NEW.numero_pedido_loja, '-R[0-9]+$', '')))
    LIMIT 1;
    IF v_ped_centro IS NOT NULL AND v_ped_centro <> v_centro_emitente
       AND fn_estabelecimento_fiscal(v_ped_centro) = v_centro_emitente THEN
      v_centro_emitente := v_ped_centro;
    END IF;
  END IF;

  WITH itens AS (
    SELECT btrim(it->>'codigo') AS sku, max(it->>'cfop') AS cfop, sum((it->>'quantidade')::numeric) AS qtd
    FROM jsonb_array_elements(NEW.itens_json) it
    WHERE nullif(btrim(it->>'codigo'),'') IS NOT NULL AND (it->>'quantidade')::numeric > 0
    GROUP BY 1
  ), c AS (SELECT sku, avg(custo_aterrissagem) AS custo FROM custo_aterrissagem GROUP BY sku),
  rota AS (
    SELECT i.sku, i.qtd, r.*,
           CASE WHEN r.origem_por_parceiro THEN v_centro_parceiro WHEN r.origem_por_emitente AND v_centro_emitente IS NOT NULL THEN v_centro_emitente ELSE r.centro_origem_id END AS centro_origem_eff,
           CASE WHEN r.destino_por_parceiro THEN v_centro_parceiro ELSE r.centro_destino_id END AS centro_destino_eff
    FROM itens i
      JOIN cfop_natureza r ON r.cfop = i.cfop AND r.ativo AND r.movimenta_estoque
  ), apto AS (
    SELECT *
    FROM rota r
    WHERE (NOT r.exige_destino_proprio OR v_proprio)
      AND r.centro_origem_eff IS NOT NULL AND r.motivo_saida IS NOT NULL
      AND EXISTS (SELECT 1 FROM sncf_produtos p WHERE p.sku=r.sku)
      AND EXISTS (SELECT 1 FROM movimentacao_estoque m WHERE m.sku=r.sku AND m.centro_id=r.centro_origem_eff)
  ), pernas AS (
    SELECT a.sku, 'saida'::text tipo, -abs(a.qtd) qtd, 'nf_emissao'::text origem,
           a.centro_origem_eff centro, a.motivo_saida motivo, NULL::uuid cc, 1 ord, a.classe, a.condicao, a.cfop
    FROM apto a
    UNION ALL
    SELECT a.sku, 'entrada', abs(a.qtd), 'transferencia_cd',
           a.centro_destino_eff, a.motivo_entrada, NULL::uuid, 2, a.classe, coalesce(a.condicao_entrada, a.condicao), a.cfop
    FROM apto a WHERE a.centro_destino_eff IS NOT NULL AND a.motivo_entrada IS NOT NULL
    UNION ALL
    SELECT a.sku, 'saida', -abs(a.qtd), a.motivo_consumo,
           a.centro_destino_eff, a.motivo_consumo, a.centro_custo_id, 3, a.classe, a.condicao, a.cfop
    FROM apto a WHERE a.motivo_consumo IS NOT NULL AND a.centro_destino_eff IS NOT NULL
  )
  INSERT INTO movimentacao_estoque
    (sku, tipo, quantidade, origem, referencia, data_mov, condicao, centro_id, motivo, classe,
     doc_tipo, doc_numero, custo_unitario, centro_custo_id, obs, nf_saida_id)
  SELECT p.sku, p.tipo, p.qtd, p.origem, v_ref, coalesce(NEW.data_emissao, now()),
         p.condicao, p.centro, p.motivo, p.classe,
         CASE WHEN p.origem='nf_emissao' AND p.motivo='faturamento' THEN 'nf_venda' ELSE 'nf_transferencia' END,
         NEW.numero, c.custo, p.cc,
         'NF '||coalesce(NEW.numero,'?')||' · CFOP '||p.cfop||' · perna '||p.ord||' · roteado por cfop_natureza',
         NEW.id
  FROM pernas p LEFT JOIN c ON c.sku=p.sku
  ORDER BY p.ord
  ON CONFLICT (origem, referencia, sku, condicao, motivo) WHERE origem IN ('nf_emissao','xpm_termo') DO NOTHING;

  WITH itens AS (
    SELECT btrim(it->>'codigo') AS sku, max(it->>'cfop') AS cfop, sum((it->>'quantidade')::numeric) AS qtd
    FROM jsonb_array_elements(NEW.itens_json) it
    WHERE nullif(btrim(it->>'codigo'),'') IS NOT NULL AND (it->>'quantidade')::numeric > 0
    GROUP BY 1
  ), rota AS (
    SELECT i.sku, i.qtd, i.cfop, r.cfop AS r_cfop, r.ativo, r.movimenta_estoque,
           r.exige_destino_proprio, r.motivo_saida,
           CASE WHEN r.origem_por_parceiro THEN v_centro_parceiro WHEN r.origem_por_emitente AND v_centro_emitente IS NOT NULL THEN v_centro_emitente ELSE r.centro_origem_id END AS centro_origem_eff
    FROM itens i LEFT JOIN cfop_natureza r ON r.cfop = i.cfop
  )
  INSERT INTO baixa_estoque_pendente (nf_chave, nf_numero, nf_data, sku, quantidade, motivo)
  SELECT v_ref, NEW.numero, NEW.data_emissao, r.sku, r.qtd,
    CASE
      WHEN r.r_cfop IS NULL THEN 'cfop_nao_classificado'
      WHEN NOT r.ativo THEN 'cfop_inativo'
      WHEN NOT r.movimenta_estoque THEN 'cfop_fora_do_estoque'
      WHEN r.exige_destino_proprio AND NOT v_proprio THEN 'destino_nao_proprio'
      WHEN r.centro_origem_eff IS NULL OR r.motivo_saida IS NULL THEN 'roteamento_incompleto'
      WHEN NOT EXISTS (SELECT 1 FROM sncf_produtos p WHERE p.sku=r.sku) THEN 'sku_fora_do_catalogo'
      ELSE 'sku_sem_razao'
    END
  FROM rota r
  WHERE r.r_cfop IS NULL
     OR NOT r.ativo
     OR NOT r.movimenta_estoque
     OR (r.exige_destino_proprio AND NOT v_proprio)
     OR r.centro_origem_eff IS NULL OR r.motivo_saida IS NULL
     OR NOT EXISTS (SELECT 1 FROM sncf_produtos p WHERE p.sku=r.sku)
     OR NOT EXISTS (SELECT 1 FROM movimentacao_estoque m WHERE m.sku=r.sku AND m.centro_id=r.centro_origem_eff)
  ON CONFLICT (nf_chave, sku) DO NOTHING;

  RETURN NEW;
END;
$function$;