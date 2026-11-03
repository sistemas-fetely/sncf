create table if not exists public.nf_entrada_arquivo_tentativa (
  nf_chave_acesso text primary key,
  fonte text not null,
  indisponivel_na_origem boolean not null default false,
  erro text,
  tentado_em timestamptz not null default now()
);
comment on table public.nf_entrada_arquivo_tentativa is 'Último resultado da tentativa de guardar o XML de NF de entrada (retrofit). indisponivel_na_origem=true: a origem (ex.: Qive) não tem o documento.';
alter table public.nf_entrada_arquivo_tentativa enable row level security;
grant select on public.nf_entrada_arquivo_tentativa to authenticated;
grant all on public.nf_entrada_arquivo_tentativa to service_role;
create policy "ler tentativas com acesso ao pacote" on public.nf_entrada_arquivo_tentativa
  for select to authenticated using (public.pode_ler_tabela('remessas_contador'));