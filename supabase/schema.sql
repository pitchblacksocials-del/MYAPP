create table if not exists public.connect_za_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.connect_za_state enable row level security;

drop policy if exists "service role can manage connect za state" on public.connect_za_state;

create policy "service role can manage connect za state"
on public.connect_za_state
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create index if not exists connect_za_state_updated_at_idx
on public.connect_za_state (updated_at desc);
