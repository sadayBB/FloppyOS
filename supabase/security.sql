-- FloppyOS · endurecimiento de seguridad (ejecútalo una vez; se puede repetir sin problema)
-- Supabase → SQL Editor → New query → pega todo → Run.

-- 1) Nadie sin sesión puede tocar las tablas ni llamar a las funciones.
revoke all on table public.records from anon;
revoke execute on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;

do $$
begin
  if to_regclass('public.push_subscriptions') is not null then
    execute 'revoke all on table public.push_subscriptions from anon';
  end if;
  if to_regclass('public.reminders') is not null then
    execute 'revoke all on table public.reminders from anon';
  end if;
  if to_regprocedure('public.replace_reminders(jsonb)') is not null then
    execute 'revoke execute on function public.replace_reminders(jsonb) from public, anon';
    execute 'grant execute on function public.replace_reminders(jsonb) to authenticated';
  end if;
end $$;

-- 2) La seguridad por filas debe estar activa y obligatoria en todas las tablas de FloppyOS.
alter table public.records enable row level security;
alter table public.records force row level security;
do $$
begin
  if to_regclass('public.push_subscriptions') is not null then
    execute 'alter table public.push_subscriptions enable row level security';
    execute 'alter table public.push_subscriptions force row level security';
  end if;
  if to_regclass('public.reminders') is not null then
    execute 'alter table public.reminders enable row level security';
    execute 'alter table public.reminders force row level security';
  end if;
end $$;

-- 3) Comprobación: todas deben decir rls = true.
select c.relname as tabla, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forzada
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('records', 'push_subscriptions', 'reminders');
