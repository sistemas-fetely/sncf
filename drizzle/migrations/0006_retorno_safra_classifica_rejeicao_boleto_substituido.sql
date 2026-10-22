CREATE OR REPLACE VIEW public.vw_safra_retorno_pendente AS
WITH base AS (
  SELECT o.*, c.descricao AS c_descricao, c.categoria AS c_categoria, c.acao_sugerida AS c_acao, c.exige_humano AS c_exige,
         t.numero_titulo AS t_numero, t.status AS t_status, t.boleto_status AS t_boleto_status,
         COALESCE(t.nosso_numero_seq, t.nosso_numero_safra) AS nn_vigente,
         t.id AS t_id
  FROM safra_retorno_ocorrencia o
  LEFT JOIN safra_ocorrencias_retorno c ON c.codigo = o.codigo_ocorrencia
  LEFT JOIN titulo_a_receber t ON t.id = o.titulo_id
), cls AS (
  SELECT b.*,
    CASE
      WHEN b.codigo_ocorrencia <> '03' OR b.t_id IS NULL THEN NULL
      WHEN (
             b.nn_vigente IS NOT NULL AND b.nn_vigente <> b.nosso_numero
             AND EXISTS (SELECT 1 FROM titulo_boleto bv
                          LEFT JOIN titulo_boleto bo ON bo.nosso_numero = b.nosso_numero
                         WHERE bv.titulo_id = b.t_id AND bv.nosso_numero = b.nn_vigente
                           AND (bo.emitido_em IS NULL OR bv.emitido_em > bo.emitido_em))
           )
           OR EXISTS (SELECT 1 FROM safra_retorno_ocorrencia x
                       WHERE x.nosso_numero = b.nosso_numero AND x.codigo_ocorrencia IN ('09','10')
                         AND x.nro_sequencial <= b.nro_sequencial)
        THEN 'duplicada_boleto_substituido'
      WHEN b.nn_vigente = b.nosso_numero
           AND EXISTS (SELECT 1 FROM safra_retorno_ocorrencia x
                        WHERE x.nosso_numero = b.nosso_numero AND x.codigo_ocorrencia = '02')
        THEN 'instrucao_rejeitada_boleto_registrado'
      ELSE 'entrada_rejeitada'
    END AS classificacao_rejeicao
  FROM base b
)
SELECT id, nro_sequencial, data_ocorrencia, codigo_ocorrencia,
  c_descricao AS ocorrencia_descricao,
  c_categoria AS categoria,
  CASE classificacao_rejeicao
    WHEN 'duplicada_boleto_substituido' THEN 'Instrução duplicada em boleto substituído — sem ação. O nosso número rejeitado é um boleto antigo, já baixado ou trocado por um boleto novo registrado. Não reemitir.'
    WHEN 'instrucao_rejeitada_boleto_registrado' THEN 'Rejeição de instrução sobre boleto vigente já registrado (02 confirmado). Não é entrada rejeitada: não reemitir; confira o motivo.'
    ELSE c_acao
  END AS acao_sugerida,
  CASE WHEN classificacao_rejeicao = 'duplicada_boleto_substituido' THEN false ELSE c_exige END AS exige_humano,
  motivo_rejeicao, nosso_numero, sacado, titulo_id,
  t_numero AS numero_titulo, t_status AS status_titulo, t_boleto_status AS boleto_status,
  data_vencimento, valor_titulo, valor_pago, valor_juros, data_credito, casado_por, tratado, tratado_em,
  CASE
    WHEN c_categoria = 'liquidacao' AND titulo_id IS NOT NULL AND t_status <> 'pago' THEN 'liquidado_sem_baixa'
    WHEN tratado THEN 'tratado'
    WHEN titulo_id IS NULL THEN 'sem_titulo'
    WHEN classificacao_rejeicao = 'duplicada_boleto_substituido' THEN 'duplicada_substituido'
    WHEN c_exige THEN 'exige_acao'
    ELSE 'processado'
  END AS situacao,
  (titulo_id IS NULL) AS eh_orfa,
  classificacao_rejeicao
FROM cls;