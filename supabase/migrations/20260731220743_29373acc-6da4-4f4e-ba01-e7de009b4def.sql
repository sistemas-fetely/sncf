DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'qualidade-painel-diario') THEN
    PERFORM cron.schedule(
      'qualidade-painel-diario',
      '0 6 * * *',
      $$ SELECT public.atualizar_qualidade_painel(); $$
    );
  END IF;
END
$do$;