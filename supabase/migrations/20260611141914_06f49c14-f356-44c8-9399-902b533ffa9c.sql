SELECT public.transicionar_pedido(
  '34f5ecaf-5501-4cad-bf47-a6989922e3a4'::uuid,
  'aguardando_pagamento',
  NULL,
  'Reversão manual solicitada: voltar de pre_faturado para aguardando_pagamento'
);