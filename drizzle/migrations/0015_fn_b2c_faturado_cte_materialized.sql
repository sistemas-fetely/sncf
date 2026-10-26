CREATE OR REPLACE FUNCTION public.fn_b2c_faturado_vs_recebido()
 RETURNS TABLE(pedido_ref text, tem_nf boolean, nf_refs text, data_emissao date, tem_recebimento boolean, liquido_mp numeric, taxa_mp numeric, situacao text, delta_bruto_vs_faturado numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- DECISAO FLAVIO 03/09/2026: o Comercial NAO precisa de valor liquido, taxa MP nem
  -- situacao financeira. `tem_recebimento` VOLTA de verdade (o alerta `sem_conciliacao_mp`
  -- depende dele e mentiria se viesse false), mas os NUMEROS sao mascarados para quem nao
  -- le `movimentacoes_bancarias`. Ver dinheiro e conciliar dinheiro sao coisas diferentes.
  -- A mascara HONRA o back-end: sem JWT (`auth.uid()` null) `pode_ler_tabela` devolve false,
  -- e a primeira versao desta funcao zerou `liquido_mp` para o admin tambem. Pego medindo.
  -- PERFORMANCE 26/10/2026 (OK Flavio): le da MV mv_b2c_faturado_vs_recebido (refresh a cada 5 min
  -- por fn_refresh_b2c_faturado_vs_recebido). A MV guarda dados SEM mascara e nao e legivel pela API.
  -- VELOCIDADE 26/10/2026 (OK Flavio): o cross join com a checagem da mascara era achatado pelo
  -- planejador e pode_ler_tabela rodava por linha x 4 colunas (~320 ms). CTE MATERIALIZED = avaliada 1 vez.
  with v as materialized (
    select public.pode_ler_tabela('movimentacoes_bancarias')
           or (auth.uid() is null and session_user in ('postgres','supabase_admin','service_role')) as ve)
  select f.pedido_ref, f.tem_nf, f.nf_refs, f.data_emissao, f.tem_recebimento,
         case when v.ve then f.liquido_mp end,
         case when v.ve then f.taxa_mp end,
         case when v.ve then f.situacao end,
         case when v.ve then f.delta_bruto_vs_faturado end
    from public.mv_b2c_faturado_vs_recebido f
   cross join v
  -- VELOCIDADE 23/10/2026: as checagens de permissao eram avaliadas POR LINHA (495x, ~350 ms). Subquery escalar = InitPlan, avaliada UMA vez. Mesma semantica.
  where (select public.tem_permissao('tela.b2c') or public.pode_ler_tabela('nfs_emitidas') or (auth.uid() is null and session_user in ('postgres','supabase_admin','service_role')));
$function$;