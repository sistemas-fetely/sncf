DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.fn_contabil_extrato_mensal_auto_guardar(date,uuid,text,text,text,text,bigint,date,date,numeric,numeric)'::regprocedure) INTO d;
d:=replace(d,'current_setting(''request.jwt.claim.role'',true) IS DISTINCT FROM ''service_role''','auth.role() IS DISTINCT FROM ''service_role''');
EXECUTE d;
END $$;