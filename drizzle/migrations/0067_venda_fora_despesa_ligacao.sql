ALTER TABLE public.despesas ADD COLUMN venda_fora_cpr_id uuid REFERENCES public.contas_pagar_receber(id);
CREATE UNIQUE INDEX uq_despesas_venda_fora_cpr ON public.despesas(venda_fora_cpr_id) WHERE venda_fora_cpr_id IS NOT NULL;
ALTER TABLE public.despesas DROP CONSTRAINT despesas_origem_porta_check;
ALTER TABLE public.despesas ADD CONSTRAINT despesas_origem_porta_check CHECK(origem_porta IN ('nf','cartao','extrato','documento','manual','recorrente','venda_fora'));
COMMENT ON COLUMN public.despesas.venda_fora_cpr_id IS 'Ligação canônica entre despesa por competência e conta a pagar de venda fora.';
CREATE OR REPLACE FUNCTION public.fn_venda_fora_sincronizar_despesa(p_cpr uuid,p_competencia date,p_plano uuid,p_parceiro uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
declare c record; d uuid; fornecedor record;
begin
 select * into c from contas_pagar_receber where id=p_cpr for update;
 select razao_social,cnpj into fornecedor from parceiros_comerciais where id=p_parceiro;
 d:=c.despesa_id;
 if d is null then select id into d from despesas where venda_fora_cpr_id=p_cpr; end if;
 if d is null then select de.id into d from despesas de left join nfs_stage ns on ns.id=de.documento_id where (c.movimentacao_bancaria_id is not null and de.movimentacao_bancaria_id=c.movimentacao_bancaria_id) or ns.conta_pagar_id=p_cpr order by de.created_at limit 1; end if;
 if d is null then
  insert into despesas(origem_porta,data_competencia,valor,descricao,fornecedor_nome,fornecedor_cnpj,plano_contas_id,centro_custo_id,classificada_por,classificada_em,criado_por,venda_fora_cpr_id)
  values('venda_fora',p_competencia,case when c.status='cancelado' then 0 else c.valor end,c.descricao,fornecedor.razao_social,fornecedor.cnpj,p_plano,c.centro_custo_id,'regra',now(),auth.uid(),p_cpr) returning id into d;
 else
  update despesas set venda_fora_cpr_id=p_cpr,origem_porta='venda_fora',data_competencia=p_competencia,valor=case when c.status='cancelado' then 0 else c.valor end,plano_contas_id=p_plano,fornecedor_nome=fornecedor.razao_social,fornecedor_cnpj=fornecedor.cnpj,updated_at=now() where id=d;
 end if;
 update contas_pagar_receber set despesa_id=d where id=p_cpr and despesa_id is distinct from d;
end $f$;
REVOKE ALL ON FUNCTION public.fn_venda_fora_sincronizar_despesa(uuid,date,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_venda_fora_sincronizar_despesa(uuid,date,uuid,uuid) TO service_role;
DO $do$
declare s text; marker text;
begin
 s:=pg_get_functiondef('public.fn_venda_fora_lancamentos_mes'::regproc);
 s:=replace(s,'select * into v_ct from consignado_contrato where parceiro_id = p_parceiro_id and ativo and modelo = ''venda_fora'';', 'if v_uid is not null and not usuario_tem_acao(''acao.consignado_ciclo_fechar'',v_uid) then raise exception ''Sem permissao (acao.consignado_ciclo_fechar)'' using errcode=''42501''; end if; select * into v_ct from consignado_contrato where parceiro_id = p_parceiro_id and ativo and modelo = ''venda_fora'' for update;');
 marker:='continue when p_dry_run or v_acao in (''nada'',''igual'');';
 if position(marker in s)=0 then raise exception 'Definicao do lancamento mudou'; end if;
 s:=replace(s,marker, 'if not p_dry_run and v_acao = ''igual'' and v_l.tipo in (''aluguel'',''comissao_plataforma'') then perform fn_venda_fora_sincronizar_despesa(v_ex.cpr_id,v_ini,v_l.plano_contas_id,p_parceiro_id); end if; '||marker);
 s:=replace(s,'  end loop;', '  if v_l.tipo in (''aluguel'',''comissao_plataforma'') then perform fn_venda_fora_sincronizar_despesa(coalesce(v_ex.cpr_id,v_cpr),v_ini,v_l.plano_contas_id,p_parceiro_id); end if; end loop;');
 EXECUTE s;
end $do$;
CREATE OR REPLACE FUNCTION public.fn_venda_fora_despesa_unica() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
declare cpr uuid; dep uuid; tipo_l text;
begin
 if NEW.venda_fora_cpr_id is not null then return NEW; end if;
 if NEW.movimentacao_bancaria_id is not null then select lm.cpr_id,lm.tipo into cpr,tipo_l from movimentacoes_bancarias m join venda_fora_lancamento_mes lm on lm.cpr_id=m.conta_pagar_id where m.id=NEW.movimentacao_bancaria_id; end if;
 if cpr is null and NEW.documento_id is not null then select lm.cpr_id,lm.tipo into cpr,tipo_l from nfs_stage ns join venda_fora_lancamento_mes lm on lm.cpr_id=ns.conta_pagar_id where ns.id=NEW.documento_id; end if;
 if cpr is null then return NEW; end if;
 if tipo_l='mdr' then return NULL; end if;
 select despesa_id into dep from contas_pagar_receber where id=cpr for update;
 if dep is null or dep=NEW.id then NEW.venda_fora_cpr_id:=cpr; return NEW; end if;
 update despesas set documento_id=coalesce(documento_id,NEW.documento_id),movimentacao_bancaria_id=coalesce(movimentacao_bancaria_id,NEW.movimentacao_bancaria_id),data_pagamento=coalesce(NEW.data_pagamento,data_pagamento),updated_at=now() where id=dep;
 return NULL;
end $f$;
REVOKE ALL ON FUNCTION public.fn_venda_fora_despesa_unica() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_venda_fora_despesa_unica BEFORE INSERT OR UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.fn_venda_fora_despesa_unica();