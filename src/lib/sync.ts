import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { DATA_TABLES, db, onLocalChange, type Base, type Setting } from '../db';

/*
 * Offline-first sync with Supabase.
 * The local IndexedDB is always the source of truth for the UI. Sync pushes rows changed since the
 * last push (server keeps a row only if it is newer) and pulls rows whose server revision is above
 * the last one seen. Conflicts resolve by last-write-wins on updatedAt; deletions travel as tombstones.
 */

export interface SyncConfig {
  url: string;
  anonKey: string;
}
export type SyncPhase = 'unconfigured' | 'signed_out' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncState {
  phase: SyncPhase;
  email?: string;
  lastSync?: number;
  error?: string;
}

const CFG_KEY = 'floppyos.sync.config';
const CURSOR_KEY = 'floppyos.sync.cursor';
const ls = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  },
};

export function getConfig(): SyncConfig | null {
  const saved = ls.get<SyncConfig | null>(CFG_KEY, null);
  if (saved?.url && saved.anonKey) return saved;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

let client: SupabaseClient | null = null;
let session: Session | null = null;
let state: SyncState = { phase: 'unconfigured', lastSync: ls.get<{ lastSync?: number }>(CURSOR_KEY, {}).lastSync };
const listeners = new Set<() => void>();
function set(next: Partial<SyncState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
export function useSync() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

interface Cursor {
  lastPush: number;
  lastRev: number;
  lastSync?: number;
  userId?: string;
}
const cursor = (): Cursor => ls.get<Cursor>(CURSOR_KEY, { lastPush: 0, lastRev: 0 });

export async function configure(cfg: SyncConfig | null) {
  if (cfg) ls.set(CFG_KEY, cfg);
  else localStorage.removeItem(CFG_KEY);
  client = null;
  session = null;
  await init();
}

export async function init() {
  const cfg = getConfig();
  if (!cfg) return set({ phase: 'unconfigured', email: undefined });
  if (!client) {
    client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'floppyos.auth' } });
    client.auth.onAuthStateChange((_e, s) => {
      session = s;
      set({ email: s?.user.email, phase: s ? (state.phase === 'signed_out' || state.phase === 'unconfigured' ? 'idle' : state.phase) : 'signed_out' });
    });
  }
  const { data } = await client.auth.getSession();
  session = data.session;
  set({ phase: session ? 'idle' : 'signed_out', email: session?.user.email });
  if (session) void syncNow();
}

export async function signIn(email: string, password: string) {
  if (!client) throw new Error('Configura primero la URL y la clave de Supabase.');
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  await syncNow();
}
export async function signUp(email: string, password: string) {
  if (!client) throw new Error('Configura primero la URL y la clave de Supabase.');
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data.session) return 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.';
  await syncNow();
  return 'Cuenta creada y sesión iniciada.';
}
export async function signOut() {
  await client?.auth.signOut();
  set({ phase: 'signed_out', email: undefined });
}

/** Forgets the sync cursors so the next sync re-sends and re-reads everything. */
export async function fullResync() {
  ls.set(CURSOR_KEY, { lastPush: 0, lastRev: 0 });
  await syncNow();
}

let running: Promise<void> | null = null;
export function syncNow(): Promise<void> {
  if (!running) running = doSync().finally(() => (running = null));
  return running;
}

async function doSync() {
  if (!client || !session) return;
  if (!navigator.onLine) return set({ phase: 'offline' });
  set({ phase: 'syncing', error: undefined });
  try {
    let c = cursor();
    // A different account on this device starts from scratch.
    if (c.userId && c.userId !== session.user.id) c = { lastPush: 0, lastRev: 0 };
    c.userId = session.user.id;

    // Push
    const pushStart = Date.now();
    const rows: { tbl: string; id: string; data: unknown; updated_at: number }[] = [];
    for (const t of DATA_TABLES) {
      const changed = (await db.table(t).where('updatedAt').aboveOrEqual(c.lastPush).toArray()) as Base[];
      for (const r of changed) rows.push({ tbl: t, id: r.id, data: r, updated_at: r.updatedAt });
    }
    for (const s of (await db.settings.toArray()) as Setting[])
      if ((s.updatedAt ?? 0) >= c.lastPush) rows.push({ tbl: 'settings', id: s.key, data: s, updated_at: s.updatedAt ?? 0 });
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await client.rpc('push_records', { rows: rows.slice(i, i + 400) });
      if (error) throw new Error(error.message);
    }
    c.lastPush = pushStart;

    // Pull
    for (;;) {
      const { data, error } = await client.from('records').select('tbl,id,data,updated_at,rev').gt('rev', c.lastRev).order('rev').limit(1000);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      await db.transaction('rw', [...DATA_TABLES.map((t) => db.table(t)), db.settings], async () => {
        for (const r of data) {
          if (r.tbl === 'settings') {
            const cur = await db.settings.get(r.id);
            if (!cur || (cur.updatedAt ?? 0) < r.updated_at) await db.settings.put(r.data as Setting);
          } else if ((DATA_TABLES as readonly string[]).includes(r.tbl)) {
            const t = db.table(r.tbl);
            const cur = (await t.get(r.id)) as Base | undefined;
            if (!cur || cur.updatedAt < r.updated_at) await t.put(r.data);
          }
        }
      });
      c.lastRev = Math.max(c.lastRev, ...data.map((r) => Number(r.rev)));
      if (data.length < 1000) break;
    }
    c.lastSync = Date.now();
    ls.set(CURSOR_KEY, c);
    set({ phase: 'idle', lastSync: c.lastSync });
  } catch (e) {
    const msg = (e as Error).message;
    set({ phase: navigator.onLine ? 'error' : 'offline', error: msg });
  }
}

// Triggers: local edits (debounced), reconnecting, returning to the app, and a slow heartbeat.
let debounce: number | undefined;
onLocalChange(() => {
  clearTimeout(debounce);
  debounce = window.setTimeout(() => void syncNow(), 2500);
});
window.addEventListener('online', () => void syncNow());
window.addEventListener('offline', () => state.phase !== 'unconfigured' && state.phase !== 'signed_out' && set({ phase: 'offline' }));
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow());
setInterval(() => void syncNow(), 120000);
