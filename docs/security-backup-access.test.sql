-- Read-only regression check: must return zero rows on the live database.
WITH expected(name) AS (VALUES
 ('backup_dev2380_vinculo_20261125'),
 ('backup_d008_sncf_produtos_20261118'),
 ('backup_d008_xpm_categoria_map_20261118'),
 ('backup_d008_importacao_linha_20261118b'),
 ('backup_dev2380_devolucao_20261125'),
 ('backup_d008_nf_linha_sku_20261118b'),
 ('backup_d008_xpm_medida_ref_20261118'),
 ('backup_parceiros_dedup_gabriela_20261118'),
 ('backup_dev2380_titulos_20261125'),
 ('backup_d008_invoice_linha_20261118'),
 ('backup_dev2380_movs_20261125'),
 ('backup_vw_reposicao_sp_20261118'),
 ('backup_vw_recebivel_b2c_pedido_20261119'),
 ('backup_vw_logistica_fila_atencao_20261119')
)
SELECT e.name AS unprotected_backup
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.name
WHERE c.oid IS NULL OR NOT c.relrowsecurity
 OR EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
 OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
 OR NOT (has_table_privilege('service_role', c.oid, 'SELECT')
         AND has_table_privilege('service_role', c.oid, 'INSERT')
         AND has_table_privilege('service_role', c.oid, 'UPDATE')
         AND has_table_privilege('service_role', c.oid, 'DELETE'));