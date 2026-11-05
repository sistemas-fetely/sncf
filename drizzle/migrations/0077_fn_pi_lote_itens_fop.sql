create or replace function public.fn_pi_lote_itens_fop(p_lote_id uuid)
returns jsonb language sql stable set search_path to 'public' as $$
-- 04/11/2026 PI-RETOMAR-NASCER-FOP: para lote já efetivado, devolve o mesmo payload que
-- fn_pi_efetivar_lote(real) entrega ao passo 6. Só leitura. O FOP é idempotente
-- (fn_registrar_produtos_cartorio devolve "bloqueado: cod_cadastro JÁ EXISTE no FOP").
select jsonb_build_object('ok', true, 'lote', l.id, 'estado', l.estado, 'pi_numero', l.pi_numero,
  'produtos', coalesce((select jsonb_agg(jsonb_build_object(
      'cod_cadastro', s.cod_cadastro,
      'sku', coalesce(nullif(btrim(c.sku),''), s.cod_cadastro),
      'ean', s.ean, 'dun', s.dun, 'inner_qtd', s.inner_qtd,
      'marca', 'Fetély', 'fase', 'registrado') order by s.cod_cadastro)
    from pi_import_stage s left join cartorio_codigo c on c.id = s.cartorio_id
    where s.lote_id = l.id and s.estado = 'efetivado'), '[]'::jsonb))
from pi_import_lote l where l.id = p_lote_id and l.estado in ('efetivado','efetivado_parcial');
$$;
grant execute on function public.fn_pi_lote_itens_fop(uuid) to authenticated;