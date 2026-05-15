ALTER TABLE public.formas_pagamento 
  ADD COLUMN IF NOT EXISTS envio_agrupa_parcelas BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.formas_pagamento.envio_agrupa_parcelas IS 
  'TRUE = quando uma CPR do grupo (parcela_grupo_id) é enviada pra pagamento, TODAS as parcelas elegíveis (status aberto/aprovado) do mesmo grupo vão juntas no MESMO email. FALSE = cada parcela é enviada individualmente. Doutrina #85 + parametrização.';

UPDATE public.formas_pagamento 
SET envio_agrupa_parcelas = TRUE 
WHERE codigo IN ('boleto', 'pix');

INSERT INTO public.formas_pagamento (codigo, nome, tipo, envio_agrupa_parcelas, ordem)
SELECT 'deposito', 'Depósito Bancário', 'a_vista', FALSE, 6
WHERE NOT EXISTS (SELECT 1 FROM public.formas_pagamento WHERE codigo = 'deposito');