-- FloppyOS · ejecutar la función de avisos cada minuto (opcional)
-- Paso C: ANTES de pegar esto, reemplaza los dos valores marcados con <<< >>>:
--   <<<ID-DEL-PROYECTO>>>  → el ID que aparece en la dirección del panel (supabase.com/dashboard/project/ESTE-ID)
--   <<<CRON_SECRET>>>      → la misma palabra secreta que pusiste como secreto CRON_SECRET de la función
-- Luego pégalo en SQL Editor → Run.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('floppyos-reminders')
where exists (select 1 from cron.job where jobname = 'floppyos-reminders');

select cron.schedule(
  'floppyos-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<<<ID-DEL-PROYECTO>>>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<<<CRON_SECRET>>>'),
    body    := '{}'::jsonb
  );
  $$
);
