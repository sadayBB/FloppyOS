-- FloppyOS · recordatorios con la app cerrada (opcional)
-- Paso A: pega este archivo completo en Supabase → SQL Editor → Run.
-- (Necesita que antes hayas ejecutado schema.sql.)

-- Dispositivos suscritos a notificaciones push.
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own subs" on public.push_subscriptions;
create policy "own subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Próximos avisos. La app calcula la hora exacta (con tu zona horaria) y los sube aquí.
create table if not exists public.reminders (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id      text not null,
  fire_at timestamptz not null,
  title   text not null,
  body    text,
  sent_at timestamptz,
  primary key (user_id, id)
);
create index if not exists reminders_pending on public.reminders (fire_at) where sent_at is null;
alter table public.reminders enable row level security;
drop policy if exists "own reminders" on public.reminders;
create policy "own reminders" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reemplaza la agenda de avisos pendientes por la que manda la app.
create or replace function public.replace_reminders(items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.reminders
   where user_id = auth.uid()
     and sent_at is null
     and id not in (select r->>'id' from jsonb_array_elements(items) as r);

  insert into public.reminders (user_id, id, fire_at, title, body)
  select auth.uid(), r->>'id', (r->>'fire_at')::timestamptz, r->>'title', r->>'body'
  from jsonb_array_elements(items) as r
  on conflict (user_id, id) do update
    set fire_at = excluded.fire_at,
        title   = excluded.title,
        body    = excluded.body,
        sent_at = case when public.reminders.fire_at = excluded.fire_at then public.reminders.sent_at else null end;

  -- limpieza: avisos enviados hace más de una semana
  delete from public.reminders where user_id = auth.uid() and sent_at < now() - interval '7 days';
end;
$$;
grant execute on function public.replace_reminders(jsonb) to authenticated;
