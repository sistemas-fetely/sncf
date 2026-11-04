DO $do$
declare s text; v text;
begin
 s:=pg_get_viewdef('private.mv_dre_fato'::regclass,true);
 if position('WHERE dl.papel = ''analitica''::text' in s)=0 then raise exception 'Definicao DRE mudou'; end if;
 s:=replace(s,'WHERE dl.papel = ''analitica''::text','WHERE dl.papel = ''analitica''::text AND NOT EXISTS (SELECT 1 FROM public.venda_fora_lancamento_mes lm JOIN public.contas_pagar_receber c ON c.id=lm.cpr_id LEFT JOIN public.nfs_stage ns ON ns.id=d.documento_id LEFT JOIN public.movimentacoes_bancarias mb ON mb.id=d.movimentacao_bancaria_id WHERE lm.tipo=''mdr'' AND (d.venda_fora_cpr_id=lm.cpr_id OR c.despesa_id=d.id OR ns.conta_pagar_id=lm.cpr_id OR mb.conta_pagar_id=lm.cpr_id))');
 s:=regexp_replace(s,';\s*$','');
 EXECUTE 'CREATE MATERIALIZED VIEW private.mv_dre_fato_venda_fora AS SELECT mes,cod,sum(valor)::numeric(14,2) valor FROM (SELECT mes,cod,valor FROM ('||s||') base UNION ALL SELECT lm.competencia,''2.4''::text,lm.valor FROM public.venda_fora_lancamento_mes lm JOIN public.contas_pagar_receber c ON c.id=lm.cpr_id WHERE lm.tipo=''mdr'' AND c.status<>''cancelado'') fatos GROUP BY mes,cod WITH NO DATA';
 v:=pg_get_viewdef('public.vw_dre_mensal'::regclass,true); EXECUTE 'CREATE OR REPLACE VIEW public.vw_dre_mensal AS '||replace(v,'FROM private.mv_dre_fato','FROM private.mv_dre_fato_venda_fora mv_dre_fato');
 v:=pg_get_viewdef('public.vw_dre_integridade'::regclass,true); EXECUTE 'CREATE OR REPLACE VIEW public.vw_dre_integridade AS '||replace(v,'FROM private.mv_dre_fato','FROM private.mv_dre_fato_venda_fora mv_dre_fato');
end $do$;
CREATE UNIQUE INDEX ix_mv_dre_fato_venda_fora ON private.mv_dre_fato_venda_fora(mes,cod);
GRANT SELECT ON private.mv_dre_fato_venda_fora TO authenticated,service_role;
COMMENT ON MATERIALIZED VIEW private.mv_dre_fato IS 'DEPRECATED: read private.mv_dre_fato_venda_fora; legacy snapshot preserved for compatibility.';
CREATE OR REPLACE FUNCTION public.fn_refresh_dre() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='180s' AS $f$
declare t0 timestamptz:=clock_timestamp(); n int; populada boolean;
begin
 refresh materialized view concurrently private.mv_dre_fato;
 select relispopulated into populada from pg_class where oid='private.mv_dre_fato_venda_fora'::regclass;
 if populada then refresh materialized view concurrently private.mv_dre_fato_venda_fora;
 else refresh materialized view private.mv_dre_fato_venda_fora; end if;
 select count(*) into n from private.mv_dre_fato_venda_fora;
 update dre_refresh_estado set refreshed_em=now(),duracao_ms=extract(milliseconds from clock_timestamp()-t0)::int,linhas=n,erro=null where id;
exception when others then update dre_refresh_estado set erro=SQLERRM,refreshed_em=now() where id; raise;
end $f$;