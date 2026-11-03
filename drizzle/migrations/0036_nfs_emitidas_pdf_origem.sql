SET LOCAL lock_timeout = '5s';
ALTER TABLE public.nfs_emitidas ADD COLUMN IF NOT EXISTS pdf_origem text;
COMMENT ON COLUMN public.nfs_emitidas.pdf_origem IS 'Origem do PDF guardado em pdf_storage_path: bling (DANFE oficial) ou gerado_xml (Resumo NF-e gerado do XML quando o Bling recusa o download).';