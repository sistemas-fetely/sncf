SET LOCAL lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.fn_produtos_itens_fop(p_cods text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
-- 28/11/2026 NASCER-PLANILHA-FOP: mesmo payload que fn_pi_lote_itens_fop entrega ao passo 6
-- (promover-fase-produto tipo=registrar_pi), mas a partir de sncf_produtos já nascidos.
-- Só leitura. p_cods NULL = todos os produtos na fase 'registrado'.
select coalesce(jsonb_agg(jsonb_build_object(
    'cod_cadastro', p.cod_cadastro,
    'sku', coalesce(nullif(btrim(c.sku),''), nullif(btrim(p.sku),''), p.cod_cadastro),
    'ean', coalesce(c.ean, p.ean), 'dun', coalesce(c.dun, p.dun), 'inner_qtd', c.inner_qtd,
    'marca', 'Fetély', 'fase', 'registrado') order by p.cod_cadastro), '[]'::jsonb)
from sncf_produtos p
left join cartorio_codigo c on c.cod_cadastro = p.cod_cadastro
where p.fase = 'registrado' and p.cod_cadastro is not null
  and (p_cods is null or p.cod_cadastro = any(p_cods));
$function$;
REVOKE ALL ON FUNCTION public.fn_produtos_itens_fop(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_produtos_itens_fop(text[]) TO authenticated, service_role;