DO $migration$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['backup_parceiros_uf_20261110','backup_movest_trs0002_20261023','backup_parceiros_dedup_gabriela_20261108','backup_parceiros_dedup_keepers_20261019','backup_pedido_rastreamento_limpeza_20261028','backup_ficha_bloco_20261020','backup_trs_recebimento_trs0002_20261023','backup_parceiros_dedup_20261019','backup_parceiros_dedup_refs_20261019','backup_funcdef_20261020','backup_campo_destino_bloco_20261020','backup_viewdef_20261020','divergencia_regra_backup_20260922','backup_rastreio_vd0047_20261029','backup_fn_lastro_lote_20261026','backup_mig_flavio_20261104'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $migration$;