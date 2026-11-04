DO $do$
declare s text;
begin
 s:=pg_get_viewdef('public.vw_dre_mensal'::regclass,true);
 if position('LEFT JOIN private.mv_dre_fato f' in s)=0 then raise exception 'Join DRE mudou'; end if;
 EXECUTE 'CREATE OR REPLACE VIEW public.vw_dre_mensal AS '||replace(s,'LEFT JOIN private.mv_dre_fato f','LEFT JOIN private.mv_dre_fato_venda_fora f');
end $do$;