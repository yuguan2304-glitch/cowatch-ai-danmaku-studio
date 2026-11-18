-- Run once in your own Supabase project SQL Editor.
-- The only public key required by the client is a publishable/anon key.
-- Never put a service_role or secret key in the client.
create table if not exists public.cowatch_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.cowatch_sync enable row level security;
revoke all on public.cowatch_sync from anon;
grant select, insert, update on public.cowatch_sync to authenticated;
drop policy if exists "CoWatch select own snapshot" on public.cowatch_sync;
drop policy if exists "CoWatch insert own snapshot" on public.cowatch_sync;
drop policy if exists "CoWatch update own snapshot" on public.cowatch_sync;
create policy "CoWatch select own snapshot" on public.cowatch_sync
  for select to authenticated using (auth.uid() = user_id);
create policy "CoWatch insert own snapshot" on public.cowatch_sync
  for insert to authenticated with check (auth.uid() = user_id);
create policy "CoWatch update own snapshot" on public.cowatch_sync
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Project > Authentication > Providers: enable email OTP.
-- For a numeric code, use {{ .Token }} in the email template, not solely a magic link.
-- Configure any needed email limits/SMTP and allowed site origins.
