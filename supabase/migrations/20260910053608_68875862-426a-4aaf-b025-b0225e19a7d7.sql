set lock_timeout = '5s';

drop trigger if exists trg_nf_marca_tempos on public.nfs_emitidas;

create trigger trg_nf_marca_tempos before insert or update on public.nfs_emitidas for each row execute function public.fn_trg_nf_marca_tempos();