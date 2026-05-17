ALTER TABLE public.nfs_stage 
ADD COLUMN IF NOT EXISTS categoria_sugerida_ia BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_nfs_stage_sugerida_ia 
ON public.nfs_stage(categoria_sugerida_ia) 
WHERE categoria_sugerida_ia = true;