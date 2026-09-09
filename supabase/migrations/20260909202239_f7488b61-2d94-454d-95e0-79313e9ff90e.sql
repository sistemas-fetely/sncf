create table public.xpm_api_operacao (
  ambiente text not null,
  path text not null,
  metodo text not null,
  operation_id text,
  summary text,
  tags text[],
  coletado_em timestamptz not null default now(),
  primary key (ambiente, path, metodo)
);

grant select on public.xpm_api_operacao to authenticated;
grant select on public.xpm_api_operacao to anon;
grant all on public.xpm_api_operacao to service_role;

alter table public.xpm_api_operacao enable row level security;

create policy "View xpm_api_operacao" on public.xpm_api_operacao for select using (true);

create policy "Manage xpm_api_operacao" on public.xpm_api_operacao for all using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'super_admin'::app_role));

create table public.xpm_api_swagger (
  ambiente text primary key,
  base_url text,
  swagger_url text,
  documento jsonb not null,
  coletado_em timestamptz not null default now()
);

grant select on public.xpm_api_swagger to authenticated;
grant select on public.xpm_api_swagger to anon;
grant all on public.xpm_api_swagger to service_role;

alter table public.xpm_api_swagger enable row level security;

create policy "View xpm_api_swagger" on public.xpm_api_swagger for select using (true);

create policy "Manage xpm_api_swagger" on public.xpm_api_swagger for all using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'super_admin'::app_role));