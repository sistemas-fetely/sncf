DO $mig$
DECLARE
  d text := pg_get_functiondef('public.fn_faturar_pedido(uuid,uuid)'::regprocedure);
  pares text[][] := ARRAY[
    ARRAY[
$a$  v_conta_falhou  int := 0;
begin$a$,
$b$  v_conta_falhou  int := 0;
  v_ace_id        uuid;
  v_ace_prazo     int;
  v_ace_regra     date;
  v_ace_tit       uuid;
begin$b$],
    ARRAY[
$a$  -- 0. NATUREZA-MANDA-NO-TITULO$a$,
$b$  -- 27/10/2026 — PRAZO-CONTADO-DA-NF (consignado modelo 2): pedido sintetico de acerto de parceiro
  -- com consignado_prazo_dias_nf vence em emissao da NF + prazo, acima do plano e do piso.
  -- Duplicata da NF continua mandando (DUPLICATA-MANDA-NO-VENCIMENTO); divergencia vai ao evento.
  select ca.id, pc.consignado_prazo_dias_nf into v_ace_id, v_ace_prazo
    from consignado_acerto ca
    join parceiros_comerciais pc on pc.id = ca.parceiro_id
   where ca.pedido_sintetico_id = p_pedido_id and pc.consignado_prazo_dias_nf is not null
   limit 1;
  if v_ace_prazo is not null then
    v_ace_regra := v_nf.data_emissao + v_ace_prazo;
  end if;

  -- 0. NATUREZA-MANDA-NO-TITULO$b$],
    ARRAY[
$a$    if not v_dup_usada then
      select coalesce(nullif(valor,'')::int, 7) into v_piso$a$,
$b$    if not v_dup_usada and v_ace_regra is null then
      select coalesce(nullif(valor,'')::int, 7) into v_piso$b$],
    ARRAY[
$a$      if v_venc < current_date then v_dup_passado := v_dup_passado + 1; end if;
    else$a$,
$b$      if v_venc < current_date then v_dup_passado := v_dup_passado + 1; end if;
    elsif v_ace_regra is not null then
      v_venc    := v_ace_regra;   -- emissao + prazo: sem shift de piso
      v_venc_nf := null;
    else$b$],
    ARRAY[
$a$    ) returning id into v_titulo_id;
$a$,
$b$    ) returning id into v_titulo_id;

    if v_ace_regra is not null then
      v_ace_tit := coalesce(v_ace_tit, v_titulo_id);
      insert into evento_titulo (titulo_id, tipo_evento, ator, origem, payload)
      values (v_titulo_id, 'vencimento_consignado_prazo_nf', 'sistema', 'SNCF',
        jsonb_build_object('origem','fn_faturar_pedido','acerto_id', v_ace_id,
          'fonte_vencimento', case when v_dup_usada and v_venc <> v_ace_regra then 'duplicata_nf_divergente_da_regra'
                                   when v_dup_usada then 'duplicata_nf_igual_regra'
                                   else 'emissao_nf_mais_prazo' end,
          'emissao_nf', v_nf.data_emissao, 'prazo_dias_nf', v_ace_prazo,
          'vencimento_regra', v_ace_regra, 'vencimento_duplicata', v_venc_nf,
          'vencimento_aplicado', v_venc,
          'divergencia_dias', case when v_dup_usada then v_venc - v_ace_regra else 0 end));
    end if;
$b$],
    ARRAY[
$a$  -- FAIL-LOUD BRANDO: duplicata no passado.$a$,
$b$  if v_ace_id is not null and v_ace_tit is not null then
    update consignado_acerto set nf_id = p_nf_id, titulo_id = v_ace_tit, updated_at = now()
     where id = v_ace_id;
  end if;

  -- FAIL-LOUD BRANDO: duplicata no passado.$b$],
    ARRAY[
$a$      'fonte_vencimento', case when v_dup_usada then 'duplicata_nf' else 'plano' end,
      'duplicatas_lidas', v_dup_n, 'shift_piso', v_shift, 'duplicata_no_passado', v_dup_passado,
      'pix_herdado', v_pix_herdado, 'pix_sem_instrumento', v_pix_sem,
      'nsu_herdado', v_nsu_herdado, 'nsu_sem', v_nsu_sem),
    true$a$,
$b$      'fonte_vencimento', case when v_dup_usada then 'duplicata_nf' when v_ace_regra is not null then 'emissao_nf_mais_prazo' else 'plano' end,
      'duplicatas_lidas', v_dup_n, 'shift_piso', v_shift, 'duplicata_no_passado', v_dup_passado,
      'consignado_prazo_dias_nf', v_ace_prazo, 'consignado_acerto_id', v_ace_id,
      'pix_herdado', v_pix_herdado, 'pix_sem_instrumento', v_pix_sem,
      'nsu_herdado', v_nsu_herdado, 'nsu_sem', v_nsu_sem),
    true$b$]
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(pares, 1) LOOP
    IF (length(d) - length(replace(d, pares[i][1], ''))) / length(pares[i][1]) <> 1 THEN
      RAISE EXCEPTION 'fn_faturar_pedido: trecho % nao encontrado exatamente uma vez', i;
    END IF;
    d := replace(d, pares[i][1], pares[i][2]);
  END LOOP;
  EXECUTE d;
END
$mig$;