DO $mig$
DECLARE d text; d0 text;
BEGIN
  d0 := pg_get_functiondef('public.fn_xpm_payload_expedicao'::regproc);
  d := replace(d0, 'v_bairro text; v_compl text;', 'v_bairro text; v_compl text; v_ajuste_rua text;');
  d := replace(d, E'  if length(coalesce(v_rua,\'\')) > 45 then',
    E'  -- LOGRADOURO-CABE (23/10/2026, #1512): abrevia (logradouro_abreviacao_dim) e, se preciso,\n  -- move o excedente inteiro para o complemento. Nunca trunca. Os checks de 45 abaixo seguem como guarda.\n  select c.rua, c.compl, c.ajuste into v_rua, v_compl, v_ajuste_rua from fn_logradouro_cabe(v_rua, v_compl, 45) c;\n  if v_ajuste_rua is not null then v_avisos := v_avisos || v_ajuste_rua; end if;\n  if length(coalesce(v_rua,\'\')) > 45 then');
  IF d = d0 OR d NOT LIKE '%v_ajuste_rua text;%' OR d NOT LIKE '%fn_logradouro_cabe(v_rua, v_compl, 45)%' THEN
    RAISE EXCEPTION 'patch fn_xpm_payload_expedicao nao aplicou';
  END IF;
  EXECUTE d;
END $mig$;

DO $mig$
DECLARE d text; d0 text; o text[];
BEGIN
  d0 := pg_get_viewdef('public.vw_gestao_b2c_pedido'::regclass, true);
  SELECT reloptions INTO o FROM pg_class WHERE oid = 'public.vw_gestao_b2c_pedido'::regclass;
  d := replace(d0,
    $s$WHEN g.estagio = ANY (ARRAY['em_transporte'::text, 'em_separacao'::text, 'pre_separacao'::text, 'faturado'::text]) THEN g.estagio$s$,
    $s$WHEN g.bloqueio_motivo IS NOT NULL THEN 'travado'::text
                    WHEN g.estagio = ANY (ARRAY['em_transporte'::text, 'em_separacao'::text, 'pre_separacao'::text, 'faturado'::text]) THEN g.estagio$s$);
  d := replace(d,
    $s$WHEN b.estagio_b2c = 'travado'::text THEN NULLIF(btrim(COALESCE(b.fila_ultimo_erro, ''::text)), ''::text)$s$,
    $s$WHEN b.estagio_b2c = 'travado'::text THEN COALESCE('Travado na XPM: '::text || b.bloqueio_motivo, NULLIF(btrim(COALESCE(b.fila_ultimo_erro, ''::text)), ''::text))$s$);
  IF d NOT LIKE '%g.bloqueio_motivo IS NOT NULL THEN ''travado''%' OR d NOT LIKE '%Travado na XPM: %' THEN
    RAISE EXCEPTION 'patch vw_gestao_b2c_pedido nao aplicou';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_gestao_b2c_pedido AS ' || d;
  IF o IS NOT NULL THEN
    EXECUTE format('ALTER VIEW public.vw_gestao_b2c_pedido SET (%s)', array_to_string(o, ', '));
  END IF;
END $mig$;

UPDATE public.xpm_pedido_fila_b2c f
   SET status = 'pendente', tentativas = 0,
       ultimo_erro = coalesce(f.ultimo_erro,'') || ' [reprocesso 23/10 por Flavio: logradouro > 45 agora ajustado no payload (fn_logradouro_cabe)]'
 WHERE f.status = 'erro'
   AND f.pedido_id IN (SELECT p.id FROM public.pedidos p WHERE p.canal = 'B2C' AND p.id_externo IN ('SHP-1408','SHP-1467','SHP-1512'));