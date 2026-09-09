alter table public.pedido_alerta_dim enable row level security;

create policy "View pedido_alerta_dim" on public.pedido_alerta_dim for select using (true);

create policy "Manage pedido_alerta_dim" on public.pedido_alerta_dim for all using (exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role = 'super_admin'::app_role));