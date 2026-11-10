CREATE OR REPLACE FUNCTION public.fn_uf_sigla(p text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
-- UF-SIGLA (10/11/2026): normaliza UF para a sigla de 2 letras. Vazio/'0' -> null; nome por extenso -> sigla; desconhecido -> erro.
declare v text; s text;
begin
  v := btrim(coalesce(p,''));
  if v = '' or v = '0' then return null; end if;
  if length(v) = 2 and upper(v) in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') then
    return upper(v);
  end if;
  v := lower(translate(v, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'));
  v := regexp_replace(v, '\s+', ' ', 'g');
  s := case v
    when 'acre' then 'AC' when 'alagoas' then 'AL' when 'amapa' then 'AP' when 'amazonas' then 'AM'
    when 'bahia' then 'BA' when 'ceara' then 'CE' when 'distrito federal' then 'DF' when 'espirito santo' then 'ES'
    when 'goias' then 'GO' when 'maranhao' then 'MA' when 'mato grosso' then 'MT' when 'mato grosso do sul' then 'MS'
    when 'minas gerais' then 'MG' when 'para' then 'PA' when 'paraiba' then 'PB' when 'parana' then 'PR'
    when 'pernambuco' then 'PE' when 'piaui' then 'PI' when 'rio de janeiro' then 'RJ' when 'rio grande do norte' then 'RN'
    when 'rio grande do sul' then 'RS' when 'rondonia' then 'RO' when 'roraima' then 'RR' when 'santa catarina' then 'SC'
    when 'sao paulo' then 'SP' when 'sergipe' then 'SE' when 'tocantins' then 'TO' end;
  if s is null then raise exception 'UF inválida: "%". Use a sigla de 2 letras (ex.: SP, RS).', p using errcode = '22023'; end if;
  return s;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_parceiros_uf_sigla()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
-- UF-SIGLA (10/11/2026): todo cadastro de parceiro grava UF como sigla.
begin
  new.uf := public.fn_uf_sigla(new.uf);
  return new;
end $function$
;

CREATE TRIGGER trg_parceiros_uf_sigla BEFORE INSERT OR UPDATE OF uf ON public.parceiros_comerciais FOR EACH ROW EXECUTE FUNCTION public.trg_parceiros_uf_sigla();