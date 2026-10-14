-- FloppyOS · esquema para Supabase
-- Pégalo completo en Supabase → SQL Editor → New query → Run.

-- Una sola tabla genérica: cada registro local (tarea, tema, apunte…) se guarda como JSON.
create table if not exists public.records (
  user_id    uuid   not null default auth.uid() references auth.users on delete cascade,
  tbl        text   not null,
  id         text   not null,
  data       jsonb  not null,
  updated_at bigint not null,          -- marca de tiempo del dispositivo (gana la más reciente)
  rev        bigserial,                -- revisión del servidor, para descargar solo lo nuevo
  primary key (user_id, tbl, id)
);
create index if not exists records_user_rev on public.records (user_id, rev);

-- Seguridad: cada persona solo ve y modifica sus propias filas.
alter table public.records enable row level security;
drop policy if exists "own rows" on public.records;
create policy "own rows" on public.records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Subida en lote: inserta o actualiza solo si la versión recibida es más nueva.
create or replace function public.push_records(rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.records (user_id, tbl, id, data, updated_at)
  select auth.uid(), r->>'tbl', r->>'id', r->'data', (r->>'updated_at')::bigint
  from jsonb_array_elements(rows) as r
  on conflict (user_id, tbl, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        rev = nextval(pg_get_serial_sequence('public.records', 'rev'))
    where excluded.updated_at > records.updated_at;
end;
$$;
revoke all on table public.records from anon;
revoke execute on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;
