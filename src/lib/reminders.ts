import { useEffect, useRef } from 'react';
import { useLocal, useRows, useSetting, type CalEvent, type Task } from '../db';
import { addDays, fromISO, today, toMin } from './dates';
import { EVENT_KIND, isOpen } from './labels';
import { getClient } from './sync';
import { VAPID_PUBLIC_KEY } from './vapid';
import { showBalloon } from '../os/balloon';

export interface Reminder {
  id: string;
  fireAt: number;
  title: string;
  body: string;
}
export interface ReminderDefaults {
  dayStart: string; // time used for items without an hour
  task: number[];
  exam: number[];
  event: number[];
}
export const DEFAULT_REMINDERS: ReminderDefaults = { dayStart: '08:00', task: [0], exam: [1440, 60], event: [15] };

const at = (date: string, hhmm: string) => {
  const d = fromISO(date);
  const m = toMin(hhmm);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
};
const when = (min: number) =>
  min === 0 ? 'ahora' : min < 60 ? `en ${min} min` : min < 1440 ? `en ${min / 60} h` : min === 1440 ? 'mañana' : `en ${Math.round(min / 1440)} días`;

/** Every reminder in the next 30 days, as absolute timestamps (so the server needs no timezone logic). */
export function computeReminders(tasks: Task[], events: CalEvent[], d: ReminderDefaults): Reminder[] {
  const now = Date.now();
  const horizon = now + 30 * 86400000;
  const out: Reminder[] = [];
  for (const t of tasks) {
    if (!t.due || !isOpen(t.status) || t.due < addDays(today(), -1)) continue;
    const base = at(t.due, t.dueTime ?? d.dayStart);
    for (const off of t.reminders ?? d.task) {
      const fireAt = base - off * 60000;
      if (fireAt > now - 60000 && fireAt < horizon)
        out.push({
          id: `t:${t.id}:${off}:${t.due}${t.dueTime ?? ''}`,
          fireAt,
          title: off === 0 ? `📌 Hoy: ${t.title}` : `📌 ${t.title}`,
          body: off === 0 ? (t.dueTime ? `Vence a las ${t.dueTime}` : 'Vence hoy') : `Vence ${when(off)}`,
        });
    }
  }
  for (const e of events) {
    if (e.date < today()) continue;
    const base = at(e.date, e.start ?? d.dayStart);
    const defs = e.reminders ?? (e.kind === 'examen' || e.kind === 'entrega' ? d.exam : d.event);
    const icon = e.kind === 'examen' ? '📝' : e.kind === 'entrega' ? '📦' : '📅';
    for (const off of defs) {
      const fireAt = base - off * 60000;
      if (fireAt > now - 60000 && fireAt < horizon)
        out.push({
          id: `e:${e.id}:${off}:${e.date}${e.start ?? ''}`,
          fireAt,
          title: `${icon} ${EVENT_KIND[e.kind].label}: ${e.title}`,
          body: off === 0 ? (e.start ? `A las ${e.start}` : 'Es hoy') : `Es ${when(off)}${e.start ? ` (${e.start})` : ''}`,
        });
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

async function show(r: Reminder) {
  // Inside the app the reminder always appears as a tray balloon; the system notification is extra.
  showBalloon(r.title.replace(/^\S+\s/, ''), r.body, { icon: r.title.split(' ')[0] });
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts = { body: r.body, icon: './icon-192.png', badge: './icon-192.png', tag: r.id };
  if (reg) await reg.showNotification(r.title, opts);
  else new Notification(r.title, opts);
}

const SHOWN_KEY = 'floppyos.reminders.shown';

/**
 * Runs while the app is open: fires due reminders locally (works offline) and, when push is
 * enabled, keeps the server-side schedule in Supabase current so they also arrive with the app closed.
 */
export function useReminderEngine() {
  const tasks = useRows('tasks');
  const events = useRows('events');
  const [defaults] = useSetting<ReminderDefaults>('reminderDefaults', DEFAULT_REMINDERS);
  const [push] = useLocal('pushEnabled', false);
  const list = useRef<Reminder[]>([]);
  list.current = computeReminders(tasks, events, defaults);

  useEffect(() => {
    const tick = () => {
      let shown: string[] = [];
      try {
        shown = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]');
      } catch {
        /* ignore */
      }
      const now = Date.now();
      for (const r of list.current)
        if (r.fireAt <= now && r.fireAt > now - 10 * 60000 && !shown.includes(r.id)) {
          void show(r);
          shown.push(r.id);
        }
      try {
        localStorage.setItem(SHOWN_KEY, JSON.stringify(shown.slice(-300)));
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const sig = list.current.map((r) => `${r.id}@${r.fireAt}`).join('|');
  useEffect(() => {
    if (!push) return;
    const id = setTimeout(() => void uploadSchedule(list.current), 4000);
    return () => clearTimeout(id);
  }, [sig, push]);
}

export async function uploadSchedule(reminders: Reminder[]) {
  const sb = getClient();
  if (!sb || !navigator.onLine) return;
  const items = reminders.map((r) => ({ id: r.id, fire_at: new Date(r.fireAt).toISOString(), title: r.title, body: r.body }));
  const { error } = await sb.rpc('replace_reminders', { items });
  if (error) console.warn('No se pudieron subir los recordatorios:', error.message);
}

const b64ToBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Subscribes this device to Web Push and registers it in Supabase. */
export async function enablePush(): Promise<string> {
  const sb = getClient();
  if (!sb) throw new Error('Primero conecta e inicia sesión en Sincronización.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador no admite notificaciones push. En Android usa Chrome.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('No diste permiso de notificaciones. Actívalo en la configuración del sitio.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }, { onConflict: 'endpoint' });
  if (error) throw new Error(`Supabase: ${error.message}. ¿Ejecutaste la sección «Recordatorios» de schema.sql?`);
  return 'Listo: este dispositivo recibirá avisos aunque FloppyOS esté cerrada.';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await getClient()?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function testNotification() {
  await show({ id: `test-${Date.now()}`, fireAt: Date.now(), title: '🐱 FloppyOS', body: '¡Así se verán tus recordatorios!' });
}
