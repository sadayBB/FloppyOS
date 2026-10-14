// FloppyOS · Edge Function "send-reminders"
// Sends due reminders as Web Push notifications. Called every minute by pg_cron (reminders-cron.sql).
// Secrets required (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET.
// Optional: VAPID_SUBJECT (mailto:you@example.com).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:floppyos@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const now = new Date();
  const { data: due, error } = await sb
    .from('reminders')
    .select('user_id, id, title, body')
    .is('sent_at', null)
    .lte('fire_at', now.toISOString())
    .gte('fire_at', new Date(now.getTime() - 6 * 3600_000).toISOString()) // skip very stale ones
    .limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!due?.length) return Response.json({ sent: 0 });

  const users = [...new Set(due.map((r) => r.user_id))];
  const { data: subs } = await sb.from('push_subscriptions').select('endpoint, p256dh, auth, user_id').in('user_id', users);

  let sent = 0;
  for (const r of due) {
    for (const s of (subs ?? []).filter((x) => x.user_id === r.user_id)) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: r.title, body: r.body, tag: r.id }),
          { TTL: 3600 },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
    await sb.from('reminders').update({ sent_at: now.toISOString() }).eq('user_id', r.user_id).eq('id', r.id);
  }
  return Response.json({ sent, reminders: due.length });
});
